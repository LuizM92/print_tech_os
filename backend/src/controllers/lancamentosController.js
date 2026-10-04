/**
 * Contas a receber e a pagar.
 *
 * Um controller só para os dois lados: a rota injeta `req.natureza` ('receber' ou
 * 'pagar') e toda consulta filtra por ela. É isso que impede /receber de enxergar, ou
 * baixar, uma conta a pagar — a permissão de cada lado está na rota, a lógica é uma só.
 *
 * Cada linha é uma PARCELA. A situação (a vencer, vence hoje, vencida) é derivada do
 * vencimento contra o "hoje" de Brasília, nunca gravada — ver utils/financeiro/datas.js.
 */
const db = require('../utils/db');
const { registrarHistorico, rotulos } = require('../utils/documentos');
const datas = require('../utils/financeiro/datas');
const plano = require('../utils/financeiro/plano');
const regras = require('../utils/financeiro/lancamento');
const banco = require('../utils/financeiro/banco');
const { centavos, reais, moeda } = require('../utils/financeiro/dinheiro');
const condicoes = require('../utils/condicoesPagamento');

const erro500 = (res, err) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
};

const texto = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t.slice(0, max);
};

const inteiro = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** O texto do histórico cabe em 255 caracteres. */
const curto = (s) => (s.length > 255 ? `${s.slice(0, 252)}...` : s);

/** Registra no histórico da OS/Pedido, quando a parcela veio de um. */
const anotarNoOrcamento = async (conn, l, usuarioId, acao, detalhe) => {
  if (!l.orcamento_id) return;
  const [[o]] = await conn.query('SELECT total_geral FROM orcamentos WHERE id = ?', [l.orcamento_id]);
  await registrarHistorico(conn, {
    orcamento_id: l.orcamento_id,
    usuario_id: usuarioId,
    acao,
    detalhe: curto(detalhe),
    total_anterior: o?.total_geral,
    total_novo: o?.total_geral,
  });
};

const nomeDaParcela = (l) => l.rotulo || l.descricao;

// ─── Leitura ────────────────────────────────────────────────────────────────

// "Vencida" e "vence hoje" são derivadas: as duas dependem do hoje, que entra como parâmetro.
const FILTROS_STATUS = {
  aberto: { sql: "l.status = 'aberto'", usaHoje: false },
  vencido: { sql: "l.status = 'aberto' AND l.vencimento < ?", usaHoje: true },
  vence_hoje: { sql: "l.status = 'aberto' AND l.vencimento = ?", usaHoje: true },
  pago: { sql: "l.status = 'pago'", usaHoje: false },
  cancelado: { sql: "l.status = 'cancelado'", usaHoje: false },
};

const construirFiltro = (query, natureza, hoje) => {
  const where = ['l.natureza = ?'];
  const params = [natureza];

  // hasOwn: `?status=constructor` não pode achar uma propriedade herdada do Object.
  const status = Object.hasOwn(FILTROS_STATUS, query.status) ? FILTROS_STATUS[query.status] : null;
  if (status) {
    where.push(`(${status.sql})`);
    if (status.usaHoje) params.push(hoje);
  }

  for (const campo of ['cliente_id', 'fornecedor_id', 'categoria_id', 'orcamento_id']) {
    const id = inteiro(query[campo]);
    if (id) {
      where.push(`l.${campo} = ?`);
      params.push(id);
    }
  }

  // O período olha o vencimento: é a pergunta de quem cobra ("o que vence em outubro?").
  if (datas.ehDataISO(query.de)) {
    where.push('l.vencimento >= ?');
    params.push(query.de);
  }
  if (datas.ehDataISO(query.ate)) {
    where.push('l.vencimento <= ?');
    params.push(query.ate);
  }

  const busca = texto(query.busca, 100);
  if (busca) {
    where.push(`(l.descricao LIKE ? OR l.documento LIKE ? OR c.nome LIKE ? OR f.nome LIKE ?
                 OR o.numero_orcamento LIKE ? OR o.numero_os LIKE ? OR o.numero_pedido LIKE ?)`);
    const termo = `%${busca}%`;
    params.push(termo, termo, termo, termo, termo, termo, termo);
  }

  return { clausula: `WHERE ${where.join(' AND ')}`, params };
};

const listar = async (req, res) => {
  try {
    const hoje = datas.hojeBR();
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 30, 1), 100);
    const { clausula, params } = construirFiltro(req.query, req.natureza, hoje);

    const [[totais]] = await db.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(l.valor), 0) AS valor,
              COALESCE(SUM(CASE WHEN l.status = 'aberto'
                                THEN GREATEST(l.valor - l.valor_pago - l.desconto, 0) END), 0) AS saldo
         ${banco.JOINS_LANCAMENTO} ${clausula}`,
      params
    );

    // As abertas primeiro, pela ordem de vencimento (a mais urgente no topo); depois
    // as encerradas, as mais recentes antes.
    const [linhas] = await db.query(
      `${banco.SELECT_LANCAMENTO} ${clausula}
        ORDER BY (l.status <> 'aberto'),
                 CASE WHEN l.status = 'aberto' THEN l.vencimento END,
                 l.vencimento DESC, l.id DESC
        LIMIT ? OFFSET ?`,
      [...params, porPagina, (pagina - 1) * porPagina]
    );

    res.json({
      dados: linhas.map((l) => banco.normalizar(l, hoje)),
      totais: { valor: Number(totais.valor), saldo: Number(totais.saldo) },
      paginacao: {
        pagina, porPagina, total: totais.total, paginas: Math.ceil(totais.total / porPagina) || 1,
      },
    });
  } catch (err) {
    erro500(res, err);
  }
};

const buscarPorId = async (req, res) => {
  try {
    const hoje = datas.hojeBR();
    const l = await banco.buscar(db, req.params.id, req.natureza);
    if (!l) return res.status(404).json({ erro: 'Conta não encontrada' });
    res.json({ ...banco.normalizar(l, hoje), baixas: await banco.baixasDe(db, l.id) });
  } catch (err) {
    erro500(res, err);
  }
};

/**
 * Os cartões do topo: o que está em aberto, o que já venceu, o que vence hoje e na
 * semana, e quanto entrou (ou saiu) no mês. Tudo no banco, contra o hoje de Brasília.
 */
const resumo = async (req, res) => {
  try {
    res.json(await banco.resumoDaNatureza(db, req.natureza, datas.hojeBR()));
  } catch (err) {
    erro500(res, err);
  }
};

// ─── Cobrança de uma OS/Pedido ──────────────────────────────────────────────

const carregarOrcamentoParaCobrar = async (executor, id) => {
  const [[o]] = await executor.query(
    `SELECT o.id, o.tipo, o.status, o.total_geral, o.cliente_id,
            o.numero_orcamento, o.numero_os, o.numero_pedido,
            DATE_FORMAT(o.previsao_entrega, '%Y-%m-%d') AS previsao_entrega,
            c.nome AS cliente_nome, c.condicao_pagamento, c.limite_credito
       FROM orcamentos o
       JOIN clientes c ON o.cliente_id = c.id
      WHERE o.id = ?`,
    [id]
  );
  return o || null;
};

const numeroAprovado = (o) => (o.tipo === 'produto' ? o.numero_pedido : o.numero_os);

/**
 * As formas de cobrar já calculadas (entrada + saldo, parcelado, à vista), mais o que o
 * modal mostra de apoio: a condição cadastrada do cliente e quanto ele já deve contra o
 * limite de crédito.
 */
const planoSugerido = async (req, res) => {
  try {
    const o = await carregarOrcamentoParaCobrar(db, req.params.orcamentoId);
    if (!o) return res.status(404).json({ erro: 'Orçamento não encontrado' });
    if (o.status !== 'aprovado') {
      return res.status(400).json({ erro: `Só ${rotulos(o.tipo).aprovado} aprovado pode ser cobrado` });
    }

    const [[{ vivas }]] = await db.query(
      `SELECT COUNT(*) AS vivas FROM lancamentos
        WHERE orcamento_id = ? AND natureza = 'receber' AND status <> 'cancelado'`,
      [o.id]
    );

    res.json({
      orcamento: {
        id: o.id,
        numero: numeroAprovado(o),
        documento: rotulos(o.tipo).aprovado,
        total_geral: Number(o.total_geral),
        previsao_entrega: o.previsao_entrega,
        cliente_nome: o.cliente_nome,
      },
      ja_cobrado: vivas > 0,
      opcoes: plano.sugerir(o.total_geral, { hoje: datas.hojeBR(), previsaoEntrega: o.previsao_entrega }),
      cliente: {
        condicao_pagamento: o.condicao_pagamento,
        limite_credito: o.limite_credito === null ? null : Number(o.limite_credito),
        em_aberto: await banco.emAbertoDoCliente(db, o.cliente_id),
      },
      desconto_pix: condicoes.DESCONTO_PIX,
    });
  } catch (err) {
    erro500(res, err);
  }
};

/**
 * Gera as parcelas de uma OS/Pedido aprovado. A soma delas tem que fechar com o total
 * até o centavo, e só se gera uma vez: para refazer, cancela-se a anterior. As duas
 * travas existem porque o orçamento pode ser editado depois de aprovado — a cobrança
 * nunca é refeita sozinha.
 */
const gerarDaOs = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[trava]] = await conn.query(
      'SELECT id FROM orcamentos WHERE id = ? FOR UPDATE', [req.params.orcamentoId]
    );
    if (!trava) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }

    const o = await carregarOrcamentoParaCobrar(conn, trava.id);
    if (o.status !== 'aprovado') {
      await conn.rollback();
      return res.status(400).json({ erro: `Só ${rotulos(o.tipo).aprovado} aprovado pode ser cobrado` });
    }

    const vivas = await banco.vivasDoOrcamento(conn, o.id);
    if (vivas.length > 0) {
      await conn.rollback();
      return res.status(400).json({
        erro: 'Esta OS já tem cobrança. Para refazer, cancele as parcelas atuais antes.',
      });
    }

    const parcelas = req.body.parcelas;
    const erro = plano.validarParcelas(parcelas, { total: o.total_geral });
    if (erro) {
      await conn.rollback();
      return res.status(400).json({ erro });
    }

    const numero = numeroAprovado(o);
    const ids = [];
    for (const [i, p] of parcelas.entries()) {
      const rotulo = texto(p.rotulo, 40) || (parcelas.length > 1 ? `Parcela ${i + 1}/${parcelas.length}` : null);
      const [r] = await conn.query(
        `INSERT INTO lancamentos
           (natureza, descricao, cliente_id, orcamento_id, parcela, total_parcelas, rotulo,
            valor, vencimento, criado_por)
         VALUES ('receber', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`${rotulo || 'Cobrança'} — ${numero}`, o.cliente_id, o.id, i + 1, parcelas.length,
          rotulo, reais(centavos(p.valor)), p.vencimento, req.usuario.id]
      );
      ids.push(r.insertId);
    }

    const resumoDasParcelas = parcelas
      .map((p, i) => `${texto(p.rotulo, 40) || `Parcela ${i + 1}`} ${moeda(p.valor)} (${datas.formatarDia(p.vencimento)})`)
      .join(' + ');
    await registrarHistorico(conn, {
      orcamento_id: o.id,
      usuario_id: req.usuario.id,
      acao: 'cobrança gerada',
      detalhe: curto(resumoDasParcelas),
      total_anterior: o.total_geral,
      total_novo: o.total_geral,
    });

    await conn.commit();
    res.status(201).json({
      mensagem: parcelas.length > 1 ? `Cobrança gerada em ${parcelas.length} parcelas` : 'Cobrança gerada',
      ids,
    });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

// ─── Lançamento avulso ──────────────────────────────────────────────────────

/** Confere o corpo de uma conta avulsa (a receber de um cliente, ou despesa). */
const validarAvulso = async (corpo, natureza) => {
  const descricao = texto(corpo.descricao, 200);
  if (!descricao) return { erro: 'Informe a descrição' };

  if (!(centavos(corpo.valor) > 0)) return { erro: 'Informe um valor maior que zero' };

  const parcelas = corpo.parcelas === undefined || corpo.parcelas === '' ? 1 : parseInt(corpo.parcelas, 10);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > condicoes.MAX_PARCELAS) {
    return { erro: `Parcelas devem ser de 1 a ${condicoes.MAX_PARCELAS}` };
  }

  if (!datas.ehDataISO(corpo.primeiro_vencimento)) return { erro: 'Informe o vencimento' };

  const dados = {
    descricao,
    valor: corpo.valor,
    parcelas,
    primeiro_vencimento: corpo.primeiro_vencimento,
    documento: texto(corpo.documento, 60),
    observacao: texto(corpo.observacao, 255),
    cliente_id: null,
    fornecedor_id: null,
    categoria_id: null,
  };

  if (natureza === 'receber') {
    dados.cliente_id = inteiro(corpo.cliente_id);
    if (!dados.cliente_id) return { erro: 'Selecione o cliente' };
    const [[c]] = await db.query('SELECT id FROM clientes WHERE id = ? AND ativo = 1', [dados.cliente_id]);
    if (!c) return { erro: 'Cliente não encontrado' };
  } else {
    dados.categoria_id = inteiro(corpo.categoria_id);
    if (!dados.categoria_id) return { erro: 'Selecione a categoria' };
    const [[cat]] = await db.query(
      'SELECT id FROM categorias_despesa WHERE id = ? AND ativo = 1', [dados.categoria_id]
    );
    if (!cat) return { erro: 'Categoria não encontrada' };

    // Fornecedor é opcional: conta de luz e imposto nem sempre têm um cadastrado.
    if (corpo.fornecedor_id !== undefined && corpo.fornecedor_id !== null && corpo.fornecedor_id !== '') {
      dados.fornecedor_id = inteiro(corpo.fornecedor_id);
      const [[f]] = dados.fornecedor_id
        ? await db.query('SELECT id FROM fornecedores WHERE id = ? AND ativo = 1', [dados.fornecedor_id])
        : [[null]];
      if (!f) return { erro: 'Fornecedor não encontrado' };
    }
  }
  return { dados };
};

const criar = async (req, res) => {
  try {
    const { erro, dados } = await validarAvulso(req.body, req.natureza);
    if (erro) return res.status(400).json({ erro });

    const parcelas = plano.parcelarAvulso(dados.valor, dados.parcelas, dados.primeiro_vencimento);
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const ids = [];
      for (const p of parcelas) {
        const [r] = await conn.query(
          `INSERT INTO lancamentos
             (natureza, descricao, cliente_id, fornecedor_id, categoria_id, parcela, total_parcelas,
              rotulo, valor, vencimento, documento, observacao, criado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [req.natureza, dados.descricao, dados.cliente_id, dados.fornecedor_id, dados.categoria_id,
            p.parcela, p.total_parcelas, p.rotulo, p.valor, p.vencimento, dados.documento,
            dados.observacao, req.usuario.id]
        );
        ids.push(r.insertId);
      }
      await conn.commit();
      res.status(201).json({
        mensagem: parcelas.length > 1 ? `${parcelas.length} parcelas lançadas` : 'Conta lançada',
        ids,
      });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    erro500(res, err);
  }
};

// ─── Alterações ─────────────────────────────────────────────────────────────

/**
 * Vencimento, descrição e observações: qualquer um com acesso ao lado. O valor é do
 * admin, e só enquanto nada foi recebido — mudar o valor de uma parcela que já tem
 * baixa tornaria o saldo uma conta sem lastro.
 */
const atualizar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const l = await banco.travar(conn, req.params.id, req.natureza);
    if (!l) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Conta não encontrada' });
    }
    if (l.status !== 'aberto') {
      await conn.rollback();
      return res.status(400).json({
        erro: l.status === 'pago'
          ? 'Conta quitada não pode ser editada. Estorne o pagamento antes.'
          : 'Conta cancelada não pode ser editada.',
      });
    }

    const corpo = req.body;
    const mudancas = {};
    const notas = [];
    const falha = async (status, erro) => {
      await conn.rollback();
      return res.status(status).json({ erro });
    };

    if ('vencimento' in corpo) {
      if (!datas.ehDataISO(corpo.vencimento)) return falha(400, 'Vencimento inválido');
      if (corpo.vencimento !== l.vencimento_iso) {
        mudancas.vencimento = corpo.vencimento;
        notas.push(`vencimento ${datas.formatarDia(l.vencimento_iso)} → ${datas.formatarDia(corpo.vencimento)}`);
      }
    }

    if ('descricao' in corpo) {
      const descricao = texto(corpo.descricao, 200);
      if (!descricao) return falha(400, 'Informe a descrição');
      if (descricao !== l.descricao) mudancas.descricao = descricao;
    }
    if ('observacao' in corpo) mudancas.observacao = texto(corpo.observacao, 255);
    if ('documento' in corpo) mudancas.documento = texto(corpo.documento, 60);

    if ('valor' in corpo && centavos(corpo.valor) !== centavos(l.valor)) {
      if (req.usuario.perfil !== 'admin') return falha(403, 'Só o administrador altera o valor');
      if (!(centavos(corpo.valor) > 0)) return falha(400, 'Informe um valor maior que zero');
      if (centavos(l.valor_pago) > 0 || centavos(l.desconto) > 0) {
        return falha(400, 'Esta conta já tem pagamento. Estorne antes de mudar o valor.');
      }
      mudancas.valor = reais(centavos(corpo.valor));
      notas.push(`valor ${moeda(l.valor)} → ${moeda(corpo.valor)}`);
    }

    if (req.natureza === 'pagar') {
      if ('categoria_id' in corpo) {
        const categoria = inteiro(corpo.categoria_id);
        const [[cat]] = categoria
          ? await conn.query('SELECT id FROM categorias_despesa WHERE id = ? AND ativo = 1', [categoria])
          : [[null]];
        if (!cat) return falha(400, 'Categoria não encontrada');
        mudancas.categoria_id = categoria;
      }
      if ('fornecedor_id' in corpo) {
        const fornecedor = inteiro(corpo.fornecedor_id);
        if (fornecedor) {
          const [[f]] = await conn.query('SELECT id FROM fornecedores WHERE id = ? AND ativo = 1', [fornecedor]);
          if (!f) return falha(400, 'Fornecedor não encontrado');
        }
        mudancas.fornecedor_id = fornecedor;
      }
    }

    const colunas = Object.keys(mudancas);
    if (colunas.length === 0) return falha(400, 'Nada para alterar');

    await conn.query(
      `UPDATE lancamentos SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...colunas.map((c) => mudancas[c]), l.id]
    );

    if (notas.length > 0) {
      await anotarNoOrcamento(conn, l, req.usuario.id, 'cobrança alterada',
        `${nomeDaParcela(l)}: ${notas.join('; ')}`);
    }

    await conn.commit();
    res.json({ mensagem: 'Conta atualizada' });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

/**
 * Registra um recebimento (ou pagamento). A linha é travada na transação: um clique
 * duplo espera o primeiro terminar e então encontra a conta já quitada.
 */
const baixar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const l = await banco.travar(conn, req.params.id, req.natureza);
    if (!l) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Conta não encontrada' });
    }

    const { erro, baixa } = regras.validarBaixa(l, req.body, datas.hojeBR());
    if (erro) {
      await conn.rollback();
      return res.status(400).json({ erro });
    }

    await conn.query(
      `INSERT INTO lancamento_baixas
         (lancamento_id, valor, desconto, data_pagamento, forma, observacao, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [l.id, baixa.valor, baixa.desconto, baixa.data_pagamento, baixa.forma, baixa.observacao, req.usuario.id]
    );

    const novo = regras.aplicarBaixa(l, baixa);
    await conn.query(
      'UPDATE lancamentos SET valor_pago = ?, desconto = ?, status = ?, quitado_em = ? WHERE id = ?',
      [novo.valor_pago, novo.desconto, novo.status, novo.quitado_em, l.id]
    );

    const verbo = req.natureza === 'pagar' ? 'pago' : 'recebido';
    await anotarNoOrcamento(conn, l, req.usuario.id, 'pagamento registrado',
      `${nomeDaParcela(l)}: ${moeda(baixa.valor)} ${verbo} via ${regras.ROTULO_FORMA[baixa.forma]}`
      + `${baixa.desconto > 0 ? ` (desconto de ${moeda(baixa.desconto)})` : ''}`
      + `${novo.status === 'pago' ? ' — parcela quitada' : ''}`);

    await conn.commit();
    res.status(201).json({
      mensagem: novo.status === 'pago' ? 'Conta quitada' : 'Pagamento parcial registrado',
      status: novo.status,
    });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

/** Desfaz uma baixa e refaz o saldo com as que sobraram. Só admin (rota). */
const estornar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const l = await banco.travar(conn, req.params.id, req.natureza);
    if (!l) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Conta não encontrada' });
    }
    if (l.status === 'cancelado') {
      await conn.rollback();
      return res.status(400).json({ erro: 'Conta cancelada não tem pagamento a estornar' });
    }

    const [[b]] = await conn.query(
      `SELECT id, valor, desconto, forma FROM lancamento_baixas WHERE id = ? AND lancamento_id = ?`,
      [req.params.baixaId, l.id]
    );
    if (!b) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Pagamento não encontrado' });
    }

    await conn.query('DELETE FROM lancamento_baixas WHERE id = ?', [b.id]);
    const restantes = await banco.baixasDe(conn, l.id);
    const novo = regras.recalcular(l, restantes);
    await conn.query(
      'UPDATE lancamentos SET valor_pago = ?, desconto = ?, status = ?, quitado_em = ? WHERE id = ?',
      [novo.valor_pago, novo.desconto, novo.status, novo.quitado_em, l.id]
    );

    await anotarNoOrcamento(conn, l, req.usuario.id, 'pagamento estornado',
      `${nomeDaParcela(l)}: ${moeda(b.valor)} via ${regras.ROTULO_FORMA[b.forma]} estornado`);

    await conn.commit();
    res.json({ mensagem: 'Pagamento estornado', status: novo.status });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

/**
 * Cancela a parcela. Só sem pagamento: quem já recebeu algo estorna primeiro — assim o
 * caixa nunca fica com dinheiro entrado numa conta que "não existe".
 */
const cancelar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const l = await banco.travar(conn, req.params.id, req.natureza);
    if (!l) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Conta não encontrada' });
    }
    if (l.status === 'cancelado') {
      await conn.rollback();
      return res.status(400).json({ erro: 'Esta conta já está cancelada' });
    }
    if (centavos(l.valor_pago) > 0 || centavos(l.desconto) > 0) {
      await conn.rollback();
      return res.status(400).json({ erro: 'Esta conta tem pagamento registrado. Estorne antes de cancelar.' });
    }

    await conn.query("UPDATE lancamentos SET status = 'cancelado' WHERE id = ?", [l.id]);

    const motivo = texto(req.body.motivo, 120);
    await anotarNoOrcamento(conn, l, req.usuario.id, 'cobrança cancelada',
      `${nomeDaParcela(l)} (${moeda(l.valor)})${motivo ? `: ${motivo}` : ''}`);

    await conn.commit();
    res.json({ mensagem: 'Conta cancelada' });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

module.exports = {
  listar, buscarPorId, resumo, planoSugerido, gerarDaOs, criar, atualizar, baixar, estornar, cancelar,
};
