const db = require('../utils/db');
const PDFDocument = require('pdfkit');
const { buscarPorChave } = require('./configuracoesController');
const { recalcularOrcamento } = require('../utils/calculoOrcamento');
const { proximoNumero, registrarHistorico, rotulos } = require('../utils/documentos');
const {
  construirFiltro, granularidade, FORMATO_PERIODO,
} = require('../utils/filtroOrcamentos');

const STATUS_VALIDOS = ['rascunho', 'aprovado', 'reprovado', 'cancelado'];
const TIPOS_PECA = ['tecnica', 'decorativa'];

// ─── Validação do payload ───────────────────────────────────────────────────
const validarServico = (servico, onde) => {
  if (!servico.servico_id) return `${onde}: selecione o serviço`;
  if (!(parseFloat(servico.quantidade_horas) > 0)) return `${onde}: horas devem ser maiores que zero`;
  return null;
};

const validarPayload = ({ cliente_id, itens, servicos_gerais }) => {
  if (!cliente_id) return 'Selecione o cliente';
  if (!Array.isArray(itens) || itens.length === 0) return 'Inclua ao menos um item no orçamento';

  for (const [i, item] of itens.entries()) {
    const onde = `Item ${i + 1}`;
    if (!item.material_id) return `${onde}: selecione o material`;
    if (item.tipo_peca && !TIPOS_PECA.includes(item.tipo_peca)) return `${onde}: tipo de peça inválido`;
    if (!(parseFloat(item.peso_gramas) > 0)) return `${onde}: informe o peso em gramas`;
    if (!(parseFloat(item.horas_impressao) > 0)) return `${onde}: informe as horas de impressão`;
    if (!(parseInt(item.quantidade, 10) > 0)) return `${onde}: quantidade deve ser maior que zero`;

    for (const [j, s] of (item.servicos || []).entries()) {
      const erro = validarServico(s, `${onde}, serviço ${j + 1}`);
      if (erro) return erro;
    }
  }

  for (const [j, s] of (servicos_gerais || []).entries()) {
    const erro = validarServico(s, `Serviço geral ${j + 1}`);
    if (erro) return erro;
  }
  return null;
};

// ─── Gravação de itens e serviços ───────────────────────────────────────────
/**
 * Apaga e reinsere os filhos do orçamento.
 *
 * `anteriores` carrega os snapshots de custo que já estavam gravados. A regra: material
 * (ou serviço) que já estava no orçamento mantém o preço com que foi orçado; só o que
 * entra agora pega o preço do cadastro. Sem isso, editar uma OS antiga a repreçaria com
 * a tabela de hoje, silenciosamente. Para repreçar de propósito, use `reprecificar`.
 */
const gravarFilhos = async (conn, orcamentoId, { itens, servicos_gerais = [] }, anteriores = {}) => {
  const itensAnteriores = anteriores.itens || new Map();
  const servicosAnteriores = anteriores.servicos || new Map();

  const materialIds = [...new Set(itens.map((i) => parseInt(i.material_id, 10)))];
  const [materiais] = await conn.query('SELECT id, custo_por_grama FROM materiais WHERE id IN (?)', [materialIds]);
  const custoMaterial = new Map(materiais.map((m) => [m.id, parseFloat(m.custo_por_grama)]));

  const faltando = materialIds.find((id) => !custoMaterial.has(id));
  if (faltando) return { erro: `Material ${faltando} não encontrado` };

  const todosServicos = [...itens.flatMap((i) => i.servicos || []), ...servicos_gerais];
  const servicoIds = [...new Set(todosServicos.map((s) => parseInt(s.servico_id, 10)))];
  const valorHoraServico = new Map();
  if (servicoIds.length > 0) {
    const [servicos] = await conn.query('SELECT id, valor_hora FROM servicos WHERE id IN (?)', [servicoIds]);
    servicos.forEach((s) => valorHoraServico.set(s.id, parseFloat(s.valor_hora)));
    const servicoFaltando = servicoIds.find((id) => !valorHoraServico.has(id));
    if (servicoFaltando) return { erro: `Serviço ${servicoFaltando} não encontrado` };
  }

  // Custo já orçado por material/serviço neste orçamento. O id do item não serve de
  // âncora: o PUT apaga e reinsere os filhos, então os ids mudam a cada salvamento e um
  // cliente com ids defasados repreçaria o orçamento sem querer. O material é estável —
  // e dentro de um mesmo orçamento o mesmo material tem um preço só.
  const custoOrcadoPorMaterial = new Map();
  for (const anterior of itensAnteriores.values()) {
    custoOrcadoPorMaterial.set(anterior.material_id, parseFloat(anterior.custo_por_grama));
  }
  const valorOrcadoPorServico = new Map();
  for (const anterior of servicosAnteriores.values()) {
    valorOrcadoPorServico.set(anterior.servico_id, parseFloat(anterior.valor_hora));
  }

  // Material que já estava no orçamento mantém o custo com que foi orçado; material
  // novo entra pelo cadastro atual.
  const custoDoItem = (materialId) =>
    (custoOrcadoPorMaterial.has(materialId)
      ? custoOrcadoPorMaterial.get(materialId)
      : custoMaterial.get(materialId));

  const valorHoraDoServico = (servicoId) =>
    (valorOrcadoPorServico.has(servicoId)
      ? valorOrcadoPorServico.get(servicoId)
      : valorHoraServico.get(servicoId));

  // Os itens caem em cascata, levando junto os serviços com item_id preenchido.
  await conn.query('DELETE FROM orcamento_itens WHERE orcamento_id = ?', [orcamentoId]);
  await conn.query('DELETE FROM orcamento_servicos WHERE orcamento_id = ? AND item_id IS NULL', [orcamentoId]);

  const inserirServico = async (servico, itemId) => {
    const servicoId = parseInt(servico.servico_id, 10);
    await conn.query(
      `INSERT INTO orcamento_servicos (orcamento_id, item_id, servico_id, quantidade_horas, valor_hora, total)
       VALUES (?, ?, ?, ?, ?, 0)`,
      [orcamentoId, itemId, servicoId, parseFloat(servico.quantidade_horas), valorHoraDoServico(servicoId)]
    );
  };

  for (const [indice, item] of itens.entries()) {
    const materialId = parseInt(item.material_id, 10);
    const [res] = await conn.query(
      `INSERT INTO orcamento_itens
         (orcamento_id, ordem, descricao, material_id, tipo_peca, peso_gramas,
          horas_impressao, quantidade, custo_por_grama)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [orcamentoId, indice + 1, item.descricao?.trim() || null, materialId,
       item.tipo_peca || 'tecnica', parseFloat(item.peso_gramas),
       parseFloat(item.horas_impressao), parseInt(item.quantidade, 10),
       custoDoItem(materialId)]
    );

    for (const servico of item.servicos || []) {
      await inserirServico(servico, res.insertId);
    }
  }

  for (const servico of servicos_gerais) {
    await inserirServico(servico, null);
  }

  return { erro: null };
};

// ─── Leitura ────────────────────────────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const porPagina = Math.min(Math.max(parseInt(req.query.porPagina, 10) || 30, 1), 100);

    // Mesmo construtor do dashboard: a listagem aceita todos os filtros que ele aceita.
    const { clausula: filtro, params } = construirFiltro(req.query);

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM orcamentos o JOIN clientes c ON o.cliente_id = c.id ${filtro}`,
      params
    );

    const [dados] = await db.query(
      `SELECT o.id, o.tipo, o.numero_orcamento, o.numero_os, o.numero_pedido,
              o.status, o.observacao,
              o.total_itens, o.total_servicos_itens, o.total_servicos_gerais,
              o.total_produtos, o.total_descontos, o.total_geral,
              o.criado_em, o.aprovado_em,
              c.nome AS cliente_nome,
              u.nome AS criado_por_nome,
              COALESCE(o.numero_pedido, o.numero_os) AS numero_aprovado,
              (SELECT COUNT(*) FROM orcamento_itens i WHERE i.orcamento_id = o.id)
                + (SELECT COUNT(*) FROM orcamento_produtos p WHERE p.orcamento_id = o.id) AS qtd_itens
         FROM orcamentos o
         JOIN clientes c ON o.cliente_id = c.id
         JOIN usuarios u ON o.criado_por = u.id
         ${filtro}
        ORDER BY o.criado_em DESC
        LIMIT ? OFFSET ?`,
      [...params, porPagina, (pagina - 1) * porPagina]
    );

    res.json({
      dados,
      paginacao: { pagina, porPagina, total, paginas: Math.ceil(total / porPagina) || 1 },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

/**
 * Números do dashboard, todos calculados no banco e todos obedecendo aos mesmos
 * filtros — cartões, indicadores, gráfico, ranking e lista falam do mesmo recorte.
 *
 * A contagem de clientes é a única exceção: é o total de clientes ativos do cadastro,
 * não "clientes que aparecem no filtro". Quando há filtro de período ou cliente, a
 * resposta traz também `clientes_no_periodo`, que é quantos de fato movimentaram.
 */
const resumo = async (req, res) => {
  try {
    const { clausula, params, ativos } = construirFiltro(req.query);
    // A listagem junta `clientes` para permitir busca por nome; aqui também, para que
    // o mesmo construtor de filtro sirva aos dois sem cláusula sobrando.
    const base = `FROM orcamentos o JOIN clientes c ON o.cliente_id = c.id ${clausula}`;

    const [[totais]] = await db.query(`
      SELECT COUNT(*) AS orcamentos,
             SUM(o.status = 'aprovado') AS aprovados,
             SUM(o.status = 'rascunho') AS rascunhos,
             SUM(o.status = 'reprovado') AS reprovados,
             SUM(o.tipo = 'impressao') AS impressao,
             SUM(o.tipo = 'produto') AS venda,
             COUNT(DISTINCT o.cliente_id) AS clientes_no_periodo,
             COALESCE(SUM(o.total_geral), 0) AS volume_total,
             COALESCE(SUM(CASE WHEN o.status = 'aprovado' THEN o.total_geral ELSE 0 END), 0) AS volume_aprovado,
             COALESCE(SUM(CASE WHEN o.status = 'aprovado' AND o.tipo = 'impressao' THEN o.total_geral ELSE 0 END), 0) AS volume_impressao,
             COALESCE(SUM(CASE WHEN o.status = 'aprovado' AND o.tipo = 'produto' THEN o.total_geral ELSE 0 END), 0) AS volume_venda,
             COALESCE(AVG(o.total_geral), 0) AS ticket_medio,
             COALESCE(AVG(CASE WHEN o.status = 'aprovado' THEN o.total_geral END), 0) AS ticket_medio_aprovado
        ${base}
    `, params);

    // O MySQL devolve SUM()/AVG() como DECIMAL, e o driver entrega string. Sem
    // converter, quem consumir recebe "0" onde espera 0 — e comparações estritas
    // falham em silêncio. Contagem vira inteiro; dinheiro vira número com centavos.
    const inteiros = ['orcamentos', 'aprovados', 'rascunhos', 'reprovados',
      'impressao', 'venda', 'clientes_no_periodo'];
    const decimais = ['volume_total', 'volume_aprovado', 'volume_impressao',
      'volume_venda', 'ticket_medio', 'ticket_medio_aprovado'];
    for (const campo of inteiros) totais[campo] = parseInt(totais[campo], 10) || 0;
    for (const campo of decimais) totais[campo] = Math.round((parseFloat(totais[campo]) || 0) * 100) / 100;

    // Taxa de aprovação: dos orçamentos do recorte, quantos viraram documento fechado.
    const taxa_aprovacao = totais.orcamentos > 0
      ? Math.round((totais.aprovados / totais.orcamentos) * 1000) / 10
      : 0;

    const [[{ clientes }]] = await db.query('SELECT COUNT(*) AS clientes FROM clientes WHERE ativo = 1');

    // ── Série do gráfico ────────────────────────────────────────────────
    const escala = granularidade(req.query.de, req.query.ate);
    const [serie] = await db.query(`
      SELECT DATE_FORMAT(o.criado_em, '${FORMATO_PERIODO[escala]}') AS periodo,
             COUNT(*) AS qtd,
             COALESCE(SUM(o.total_geral), 0) AS valor,
             COALESCE(SUM(CASE WHEN o.status = 'aprovado' THEN o.total_geral ELSE 0 END), 0) AS valor_aprovado
        ${base}
       GROUP BY periodo
       ORDER BY periodo
    `, params);

    // ── Ranking de clientes ─────────────────────────────────────────────
    const [top_clientes] = await db.query(`
      SELECT c.id, c.nome, c.nome_fantasia,
             COUNT(*) AS qtd,
             COALESCE(SUM(o.total_geral), 0) AS valor,
             COALESCE(SUM(CASE WHEN o.status = 'aprovado' THEN o.total_geral ELSE 0 END), 0) AS valor_aprovado
        ${base}
       GROUP BY c.id, c.nome, c.nome_fantasia
       ORDER BY valor_aprovado DESC, valor DESC
       LIMIT 5
    `, params);

    const [recentes] = await db.query(`
      SELECT o.id, o.tipo, o.numero_orcamento, o.numero_os, o.numero_pedido,
             o.status, o.total_geral, o.criado_em,
             c.nome AS cliente_nome,
             COALESCE(o.numero_pedido, o.numero_os) AS numero_aprovado,
             (SELECT COUNT(*) FROM orcamento_itens i WHERE i.orcamento_id = o.id)
               + (SELECT COUNT(*) FROM orcamento_produtos p WHERE p.orcamento_id = o.id) AS qtd_itens
        ${base}
       ORDER BY o.criado_em DESC
       LIMIT 10
    `, params);

    // Mesma conversão nas séries e no ranking, pelo mesmo motivo.
    const emNumero = (linhas, inteiros, decimais) => linhas.map((l) => {
      const saida = { ...l };
      for (const c of inteiros) saida[c] = parseInt(saida[c], 10) || 0;
      for (const c of decimais) saida[c] = Math.round((parseFloat(saida[c]) || 0) * 100) / 100;
      return saida;
    });

    res.json({
      ...totais,
      clientes,
      taxa_aprovacao,
      escala,
      serie: emNumero(serie, ['qtd'], ['valor', 'valor_aprovado']),
      top_clientes: emNumero(top_clientes, ['qtd'], ['valor', 'valor_aprovado']),
      recentes,
      filtros_ativos: ativos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const carregarOrcamento = async (executor, id) => {
  const [rows] = await executor.query(`
    SELECT o.*,
           c.nome AS cliente_nome, c.rua, c.numero, c.complemento, c.bairro,
           c.cidade, c.estado, c.cep, c.cpf_cnpj, c.tipo_documento,
           u.nome AS criado_por_nome,
           a.nome AS aprovado_por_nome
      FROM orcamentos o
      JOIN clientes c ON o.cliente_id = c.id
      JOIN usuarios u ON o.criado_por = u.id
      LEFT JOIN usuarios a ON o.aprovado_por = a.id
     WHERE o.id = ?
  `, [id]);

  if (rows.length === 0) return null;
  const orcamento = rows[0];

  // Orçamento de venda tem produtos, não peças impressas — carrega só o que existe.
  if (orcamento.tipo === 'produto') {
    const [produtos] = await executor.query(
      'SELECT * FROM orcamento_produtos WHERE orcamento_id = ? ORDER BY ordem, id',
      [id]
    );
    return { ...orcamento, produtos, itens: [], servicos_gerais: [] };
  }

  const [itens] = await executor.query(`
    SELECT i.*, m.nome AS material_nome
      FROM orcamento_itens i
      JOIN materiais m ON i.material_id = m.id
     WHERE i.orcamento_id = ?
     ORDER BY i.ordem, i.id
  `, [id]);

  const [servicos] = await executor.query(`
    SELECT os.*, s.nome AS servico_nome
      FROM orcamento_servicos os
      JOIN servicos s ON os.servico_id = s.id
     WHERE os.orcamento_id = ?
     ORDER BY os.id
  `, [id]);

  return {
    ...orcamento,
    produtos: [],
    itens: itens.map((i) => ({ ...i, servicos: servicos.filter((s) => s.item_id === i.id) })),
    servicos_gerais: servicos.filter((s) => s.item_id === null),
  };
};

const buscarPorId = async (req, res) => {
  try {
    const orcamento = await carregarOrcamento(db, req.params.id);
    if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });

    const [historico] = await db.query(`
      SELECT h.*, u.nome AS usuario_nome
        FROM orcamento_historico h
        LEFT JOIN usuarios u ON h.usuario_id = u.id
       WHERE h.orcamento_id = ?
       ORDER BY h.criado_em DESC, h.id DESC
    `, [req.params.id]);

    res.json({ ...orcamento, historico });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

// ─── Escrita ────────────────────────────────────────────────────────────────
const criar = async (req, res) => {
  const { cliente_id, observacao, itens, servicos_gerais = [] } = req.body;

  const erroValidacao = validarPayload({ cliente_id, itens, servicos_gerais });
  if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [cliente] = await conn.query('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (cliente.length === 0) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    const valorHoraMaquina = parseFloat(await buscarPorChave('valor_hora_maquina')) || 7.0;
    const numeroOrcamento = await proximoNumero(conn, 'orcamento');

    const [result] = await conn.query(
      `INSERT INTO orcamentos
         (tipo, numero_orcamento, cliente_id, observacao, valor_hora_maquina, status, criado_por)
       VALUES ('impressao', ?, ?, ?, ?, 'rascunho', ?)`,
      [numeroOrcamento, cliente_id, observacao?.trim() || null, valorHoraMaquina, req.usuario.id]
    );
    const orcamentoId = result.insertId;

    const { erro } = await gravarFilhos(conn, orcamentoId, { itens, servicos_gerais });
    if (erro) {
      await conn.rollback();
      return res.status(400).json({ erro });
    }

    const totais = await recalcularOrcamento(conn, orcamentoId);
    await registrarHistorico(conn, {
      orcamento_id: orcamentoId,
      usuario_id: req.usuario.id,
      acao: 'criado',
      detalhe: `${itens.length} item(ns)`,
      total_novo: totais.total_geral,
    });

    await conn.commit();
    res.status(201).json({
      id: orcamentoId,
      numero_orcamento: numeroOrcamento,
      total_geral: totais.total_geral,
      mensagem: 'Orçamento criado com sucesso',
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

const atualizar = async (req, res) => {
  const { cliente_id, observacao, itens, servicos_gerais = [] } = req.body;

  const erroValidacao = validarPayload({ cliente_id, itens, servicos_gerais });
  if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[orcamento]] = await conn.query(
      'SELECT id, tipo, total_geral FROM orcamentos WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!orcamento) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }
    if (orcamento.tipo !== 'impressao') {
      await conn.rollback();
      return res.status(400).json({ erro: 'Este é um orçamento de venda — use /api/orcamentos-venda' });
    }

    const [cliente] = await conn.query('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (cliente.length === 0) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    // Guarda os snapshots antes de apagar os filhos, para preservar os custos orçados.
    const [itensAntigos] = await conn.query(
      'SELECT id, material_id, custo_por_grama FROM orcamento_itens WHERE orcamento_id = ?',
      [orcamento.id]
    );
    const [servicosAntigos] = await conn.query(
      'SELECT id, servico_id, valor_hora FROM orcamento_servicos WHERE orcamento_id = ?',
      [orcamento.id]
    );

    await conn.query(
      'UPDATE orcamentos SET cliente_id = ?, observacao = ? WHERE id = ?',
      [cliente_id, observacao?.trim() || null, orcamento.id]
    );

    const { erro } = await gravarFilhos(conn, orcamento.id, { itens, servicos_gerais }, {
      itens: new Map(itensAntigos.map((i) => [i.id, i])),
      servicos: new Map(servicosAntigos.map((s) => [s.id, s])),
    });
    if (erro) {
      await conn.rollback();
      return res.status(400).json({ erro });
    }

    const totais = await recalcularOrcamento(conn, orcamento.id);
    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: 'editado',
      detalhe: `${itens.length} item(ns)`,
      total_anterior: orcamento.total_geral,
      total_novo: totais.total_geral,
    });

    await conn.commit();
    res.json({ mensagem: 'Orçamento atualizado com sucesso', total_geral: totais.total_geral });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

/**
 * Traz todos os custos unitários de volta para os valores atuais do cadastro.
 * Ação explícita — nenhuma edição comum repreça um orçamento por conta própria.
 */
const reprecificar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[orcamento]] = await conn.query(
      'SELECT id, total_geral FROM orcamentos WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!orcamento) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }

    const valorHoraMaquina = parseFloat(await buscarPorChave('valor_hora_maquina')) || 7.0;
    await conn.query('UPDATE orcamentos SET valor_hora_maquina = ? WHERE id = ?', [valorHoraMaquina, orcamento.id]);

    await conn.query(`
      UPDATE orcamento_itens i
        JOIN materiais m ON m.id = i.material_id
         SET i.custo_por_grama = m.custo_por_grama
       WHERE i.orcamento_id = ?
    `, [orcamento.id]);

    await conn.query(`
      UPDATE orcamento_servicos os
        JOIN servicos s ON s.id = os.servico_id
         SET os.valor_hora = s.valor_hora
       WHERE os.orcamento_id = ?
    `, [orcamento.id]);

    const totais = await recalcularOrcamento(conn, orcamento.id);
    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: 'reprecificado',
      detalhe: 'Custos atualizados pelo cadastro atual',
      total_anterior: orcamento.total_geral,
      total_novo: totais.total_geral,
    });

    await conn.commit();
    res.json({ mensagem: 'Preços atualizados pelo cadastro', total_geral: totais.total_geral });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

/**
 * Transição de status. Aprovar é o que fecha o documento: é aqui, e só aqui, que nasce
 * o número definitivo — Ordem de Serviço nos orçamentos de impressão, Pedido de Venda
 * nos de produtos. Cada tipo tem sua própria sequência.
 */
const alterarStatus = async (req, res) => {
  const { status } = req.body;

  if (!STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ erro: `Status inválido. Use: ${STATUS_VALIDOS.join(', ')}` });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[orcamento]] = await conn.query(
      'SELECT id, tipo, status, numero_os, numero_pedido, total_geral FROM orcamentos WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!orcamento) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }

    const rotulo = rotulos(orcamento.tipo);
    const campoNumero = rotulo.campoNumeroAprovado; // numero_os ou numero_pedido

    if (orcamento.status === status) {
      await conn.rollback();
      return res.json({
        mensagem: 'Status já era esse',
        numero_os: orcamento.numero_os,
        numero_pedido: orcamento.numero_pedido,
        numero_aprovado: orcamento[campoNumero],
      });
    }

    const tabelaItens = orcamento.tipo === 'produto' ? 'orcamento_produtos' : 'orcamento_itens';
    const [[{ itens }]] = await conn.query(
      `SELECT COUNT(*) AS itens FROM ${tabelaItens} WHERE orcamento_id = ?`,
      [orcamento.id]
    );
    if (status === 'aprovado' && itens === 0) {
      await conn.rollback();
      return res.status(400).json({ erro: 'Não é possível aprovar um orçamento sem itens' });
    }

    let numeroAprovado = orcamento[campoNumero];

    if (status === 'aprovado') {
      // Reprovar e aprovar de novo não renumera: o documento mantém o número original.
      if (!numeroAprovado) numeroAprovado = await proximoNumero(conn, rotulo.documentoAprovado);
      await conn.query(
        `UPDATE orcamentos SET status = ?, ${campoNumero} = ?, aprovado_em = NOW(), aprovado_por = ? WHERE id = ?`,
        [status, numeroAprovado, req.usuario.id, orcamento.id]
      );
    } else {
      await conn.query('UPDATE orcamentos SET status = ? WHERE id = ?', [status, orcamento.id]);
    }

    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: status === 'aprovado' ? 'aprovado' : `status: ${status}`,
      detalhe: status === 'aprovado'
        ? `${rotulo.aprovado} ${numeroAprovado} gerado`
        : `De ${orcamento.status} para ${status}`,
      total_anterior: orcamento.total_geral,
      total_novo: orcamento.total_geral,
    });

    await conn.commit();
    res.json({
      mensagem: status === 'aprovado'
        ? `Orçamento aprovado — ${rotulo.aprovado} ${numeroAprovado} gerado`
        : 'Status atualizado',
      status,
      numero_aprovado: numeroAprovado,
      numero_os: orcamento.tipo === 'produto' ? orcamento.numero_os : numeroAprovado,
      numero_pedido: orcamento.tipo === 'produto' ? numeroAprovado : orcamento.numero_pedido,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

const excluir = async (req, res) => {
  try {
    const [[orcamento]] = await db.query('SELECT id, status FROM orcamentos WHERE id = ?', [req.params.id]);
    if (!orcamento) return res.status(404).json({ erro: 'Orçamento não encontrado' });

    if (orcamento.status !== 'rascunho') {
      return res.status(400).json({
        erro: 'Só é possível excluir orçamentos em rascunho. Cancele o orçamento em vez de excluir.',
      });
    }

    // Itens, serviços e histórico saem em cascata.
    await db.query('DELETE FROM orcamentos WHERE id = ?', [orcamento.id]);
    res.json({ mensagem: 'Orçamento excluído com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

// ─── PDF ────────────────────────────────────────────────────────────────────
const CORES = {
  fundo: '#1a1a2e', accent: '#6c63ff', sucesso: '#16db93',
  zebra: '#f5f5fb', linha: '#2a2a40', texto: '#222222', suave: '#666666',
};

const fmtMoeda = (v) =>
  `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');
const fmtNum = (v, casas = 2) => parseFloat(v || 0).toFixed(casas).replace('.', ',');

const gerarPDF = async (req, res) => {
  try {
    const orc = await carregarOrcamento(db, req.params.id);
    if (!orc) return res.status(404).json({ erro: 'Orçamento não encontrado' });

    // O documento só vira OS (impressão) ou Pedido (venda) depois de aprovado.
    // Antes disso é proposta comercial, e o PDF diz isso com todas as letras.
    const rotulo = rotulos(orc.tipo);
    const numeroAprovado = orc[rotulo.campoNumeroAprovado];
    const ehOS = orc.status === 'aprovado' && !!numeroAprovado;
    const ehVenda = orc.tipo === 'produto';
    const titulo = ehOS ? rotulo.tituloPdfAprovado : rotulo.tituloPdfOrcamento;
    const numero = ehOS ? numeroAprovado : orc.numero_orcamento;

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${numero}.pdf"`);
    doc.pipe(res);

    const ESQ = 50;
    const DIR = 545;
    const LARGURA = DIR - ESQ;
    let y = 0;

    // Reserva espaço: se o bloco não cabe no que sobrou da página, começa outra.
    const espaco = (altura) => {
      if (y + altura > doc.page.height - 70) {
        doc.addPage();
        y = 50;
      }
    };

    const secao = (texto) => {
      espaco(60);
      doc.fillColor(CORES.accent).fontSize(11).font('Helvetica-Bold').text(texto, ESQ, y);
      doc.moveTo(ESQ, y + 14).lineTo(DIR, y + 14).stroke(CORES.linha);
      y += 22;
    };

    const linhaTabela = (colunas, i, opcoes = {}) => {
      espaco(20);
      if (i % 2 === 0 && !opcoes.cabecalho) doc.rect(ESQ, y, LARGURA, 18).fill(CORES.zebra);
      if (opcoes.cabecalho) doc.rect(ESQ, y, LARGURA, 18).fill(CORES.fundo);
      colunas.forEach(([texto, x, largura, alinhamento]) => {
        doc.font(opcoes.cabecalho || opcoes.negrito ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9)
          .fillColor(opcoes.cabecalho ? '#ffffff' : (opcoes.cor || CORES.texto))
          .text(String(texto), x, y + 5, { width: largura, align: alinhamento || 'left' });
      });
      y += 18;
    };

    // ── Cabeçalho ────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 100).fill(CORES.fundo);
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('PRINT TECH 3D', ESQ, 22);
    doc.fontSize(10).font('Helvetica').fillColor('#aaaacc').text('Impressão 3D & Prototipagem', ESQ, 48);
    doc.fillColor(ehOS ? CORES.sucesso : CORES.accent).fontSize(13).font('Helvetica-Bold').text(titulo, ESQ, 66);

    doc.fillColor('#ffffff').fontSize(12).font('Helvetica-Bold')
      .text(numero, 320, 30, { align: 'right', width: 225 });
    doc.fillColor('#aaaacc').fontSize(9).font('Helvetica')
      .text(`Emitido em ${fmtData(orc.criado_em)}`, 320, 48, { align: 'right', width: 225 });

    if (ehOS) {
      // No documento aprovado o número do orçamento vira referência de origem.
      doc.text(`Orçamento ${orc.numero_orcamento}`, 320, 62, { align: 'right', width: 225 });
      doc.fillColor(CORES.sucesso).text(`Aprovado em ${fmtData(orc.aprovado_em)}`, 320, 76, { align: 'right', width: 225 });
    } else {
      doc.fillColor('#ffbe0b').text(`Status: ${orc.status.toUpperCase()}`, 320, 62, { align: 'right', width: 225 });
      doc.fillColor('#aaaacc').fontSize(8)
        .text(`Proposta comercial — ainda não é ${rotulo.aprovado}`, 320, 78, { align: 'right', width: 225 });
    }

    y = 120;

    // ── Cliente ──────────────────────────────────────────────────────────
    secao('CLIENTE');
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(11).text(orc.cliente_nome, ESQ, y);
    y += 15;
    doc.font('Helvetica').fontSize(10).fillColor(CORES.suave);
    doc.text(`${orc.tipo_documento?.toUpperCase()}: ${orc.cpf_cnpj}`, ESQ, y); y += 14;
    doc.text(`${orc.rua}, ${orc.numero}${orc.complemento ? ` - ${orc.complemento}` : ''}`, ESQ, y); y += 14;
    doc.text(`${orc.bairro} — ${orc.cidade}/${orc.estado}  |  CEP: ${orc.cep}`, ESQ, y); y += 24;

    // ── Produtos (orçamento de venda) ────────────────────────────────────
    if (ehVenda) {
      secao(`PRODUTOS (${orc.produtos.length})`);

      linhaTabela([
        ['#', ESQ + 5, 18], ['Produto', ESQ + 23, 210], ['Qtd', ESQ + 236, 46, 'right'],
        ['Unitário', ESQ + 286, 62, 'right'], ['Desc.', ESQ + 352, 55, 'right'],
        ['Total', ESQ + 411, 79, 'right'],
      ], 0, { cabecalho: true });

      orc.produtos.forEach((p, i) => {
        linhaTabela([
          [i + 1, ESQ + 5, 18],
          [p.descricao, ESQ + 23, 210],
          [`${fmtNum(p.quantidade, 3).replace(/,000$/, '')} ${p.unidade}`, ESQ + 236, 46, 'right'],
          [fmtMoeda(p.preco_unitario), ESQ + 286, 62, 'right'],
          [p.total_desconto > 0 ? `- ${fmtMoeda(p.total_desconto)}` : '—', ESQ + 352, 55, 'right'],
          [fmtMoeda(p.total_item), ESQ + 411, 79, 'right'],
        ], i);

        // Ficha do produto: é o que diferencia uma bobina preta de 1kg de outra.
        const ficha = [
          p.codigo && `Cód. ${p.codigo}`,
          p.marca, p.cor, p.tipo_material, p.especificacao,
        ].filter(Boolean).join('  ·  ');

        if (ficha) {
          espaco(13);
          doc.font('Helvetica').fontSize(7.5).fillColor('#999999')
            .text(ficha, ESQ + 23, y + 1, { width: 460 });
          y += 12;
        }
        y += 3;
      });

      y += 8;
    } else {

    // ── Itens (orçamento de impressão) ───────────────────────────────────
    secao(`ITENS (${orc.itens.length})`);

    linhaTabela([
      ['#', ESQ + 5, 20], ['Descrição / Material', ESQ + 25, 175], ['Peso', ESQ + 205, 45, 'right'],
      ['Horas', ESQ + 255, 40, 'right'], ['Qtd', ESQ + 300, 30, 'right'],
      ['Unitário', ESQ + 335, 65, 'right'], ['Total', ESQ + 405, 85, 'right'],
    ], 0, { cabecalho: true });

    orc.itens.forEach((item, i) => {
      const nome = item.descricao || `Item ${i + 1}`;
      linhaTabela([
        [i + 1, ESQ + 5, 20],
        [`${nome} · ${item.material_nome}`, ESQ + 25, 175],
        [`${fmtNum(item.peso_gramas)} g`, ESQ + 205, 45, 'right'],
        [`${fmtNum(item.horas_impressao)} h`, ESQ + 255, 40, 'right'],
        [item.quantidade, ESQ + 300, 30, 'right'],
        [fmtMoeda(item.valor_por_peca), ESQ + 335, 65, 'right'],
        [fmtMoeda(item.total_pecas), ESQ + 405, 85, 'right'],
      ], i, { negrito: false });

      // Memória de cálculo, para o cliente conferir de onde saiu o valor unitário.
      espaco(14);
      doc.font('Helvetica').fontSize(7.5).fillColor('#999999').text(
        `${fmtNum(item.peso_gramas)}g × ${fmtMoeda(item.custo_por_grama)}/g = ${fmtMoeda(item.custo_material)}` +
        `   +   ${fmtNum(item.horas_impressao)}h × ${fmtMoeda(orc.valor_hora_maquina)}/h = ${fmtMoeda(item.custo_impressao)}` +
        `   ·   ${item.tipo_peca === 'tecnica' ? 'Peça técnica' : 'Decorativa'}`,
        ESQ + 25, y + 1, { width: 465 }
      );
      y += 13;

      item.servicos.forEach((s) => {
        espaco(16);
        doc.font('Helvetica').fontSize(8).fillColor(CORES.accent).text(
          `↳ ${s.servico_nome} — ${fmtNum(s.quantidade_horas)}h × ${fmtMoeda(s.valor_hora)}/h`,
          ESQ + 30, y + 2, { width: 340 }
        );
        doc.font('Helvetica-Bold').fillColor(CORES.accent)
          .text(fmtMoeda(s.total), ESQ + 405, y + 2, { width: 85, align: 'right' });
        y += 15;
      });

      if (item.servicos.length > 0) {
        espaco(16);
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(CORES.texto)
          .text('Subtotal do item', ESQ + 25, y + 2, { width: 340 });
        doc.text(fmtMoeda(item.total_item), ESQ + 405, y + 2, { width: 85, align: 'right' });
        y += 16;
      }
      y += 4;
    });

    y += 8;

    // ── Serviços gerais ──────────────────────────────────────────────────
    if (orc.servicos_gerais.length > 0) {
      secao('SERVIÇOS DO ORÇAMENTO');
      linhaTabela([
        ['Serviço', ESQ + 5, 245], ['Horas', ESQ + 255, 60, 'right'],
        ['Valor/h', ESQ + 320, 80, 'right'], ['Total', ESQ + 405, 85, 'right'],
      ], 0, { cabecalho: true });

      orc.servicos_gerais.forEach((s, i) => {
        linhaTabela([
          [s.servico_nome, ESQ + 5, 245],
          [`${fmtNum(s.quantidade_horas)} h`, ESQ + 255, 60, 'right'],
          [fmtMoeda(s.valor_hora), ESQ + 320, 80, 'right'],
          [fmtMoeda(s.total), ESQ + 405, 85, 'right'],
        ], i);
      });
      y += 10;
    }

    } // fim do bloco de impressão

    // ── Observações ──────────────────────────────────────────────────────
    if (orc.observacao) {
      secao('OBSERVAÇÕES');
      const altura = doc.heightOfString(orc.observacao, { width: LARGURA });
      espaco(altura + 10);
      doc.font('Helvetica').fontSize(10).fillColor(CORES.suave)
        .text(orc.observacao, ESQ, y, { width: LARGURA });
      y = doc.y + 16;
    }

    // ── Totais ───────────────────────────────────────────────────────────
    // Só entram as linhas que existem neste orçamento; a caixa cresce conforme elas.
    const linhasTotais = ehVenda
      ? [
        ['Subtotal', orc.total_produtos, false],
        [orc.total_descontos > 0 ? 'Descontos' : null, -orc.total_descontos, false],
      ]
      : [
        ['Total peças', orc.total_itens, false],
        [orc.total_servicos_itens > 0 ? 'Serviços dos itens' : null, orc.total_servicos_itens, false],
        [orc.total_servicos_gerais > 0 ? 'Serviços gerais' : null, orc.total_servicos_gerais, false],
      ];
    const visiveis = linhasTotais.filter(([nome]) => nome !== null);

    const alturaTotais = 43 + visiveis.length * 17;
    espaco(alturaTotais + 10);
    y += 6;

    const caixaX = 320;
    const caixaLargura = DIR - caixaX;
    doc.rect(caixaX, y, caixaLargura, alturaTotais).fill(CORES.fundo);

    let linhaY = y + 12;
    const totalLinha = (nome, valor, destaque = false) => {
      const negativo = valor < 0;
      doc.font(destaque ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(destaque ? 11 : 9)
        .fillColor(destaque ? CORES.sucesso : '#aaaacc')
        .text(nome, caixaX + 12, linhaY, { width: 110 });
      doc.font('Helvetica-Bold')
        .fillColor(destaque ? CORES.sucesso : (negativo ? '#ff8fa3' : '#ffffff'))
        .text(`${negativo ? '- ' : ''}${fmtMoeda(Math.abs(valor))}`,
          caixaX + 110, linhaY, { width: caixaLargura - 122, align: 'right' });
      linhaY += destaque ? 0 : 17;
    };

    visiveis.forEach(([nome, valor]) => totalLinha(nome, valor));

    doc.moveTo(caixaX + 12, linhaY + 4).lineTo(DIR - 12, linhaY + 4).stroke('#333355');
    linhaY += 14;
    totalLinha('TOTAL GERAL', orc.total_geral, true);

    y += alturaTotais + 10;

    if (!ehOS) {
      espaco(30);
      doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(CORES.suave).text(
        `Este documento é um orçamento. O ${rotulo.aprovado} é emitido somente após a aprovação.`,
        ESQ, y, { width: LARGURA }
      );
    }

    // ── Rodapé em todas as páginas ───────────────────────────────────────
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
      doc.switchToPage(paginas.start + i);

      // O rodapé fica abaixo da margem inferior. Escrever ali com a margem ativa faz o
      // pdfkit entender que o texto "transbordou" e abrir uma página nova — que sai em
      // branco, já que nada mais é desenhado. Zerar a margem durante a escrita evita isso.
      const margemInferior = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;

      doc.font('Helvetica').fontSize(8).fillColor('#999999').text(
        `${numero}  |  Emitido por ${orc.criado_por_nome}  |  Print Tech — Impressão 3D & Prototipagem  |  Página ${i + 1} de ${paginas.count}`,
        ESQ, doc.page.height - 40, { align: 'center', width: LARGURA, lineBreak: false }
      );

      doc.page.margins.bottom = margemInferior;
    }

    doc.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ erro: 'Erro ao gerar PDF' });
    else res.end();
  }
};

module.exports = {
  listar, resumo, buscarPorId, criar, atualizar,
  reprecificar, alterarStatus, excluir, gerarPDF,
};
