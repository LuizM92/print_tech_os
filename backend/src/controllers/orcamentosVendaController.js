const db = require('../utils/db');
const { recalcularOrcamentoVenda } = require('../utils/calculoOrcamento');
const { proximoNumero, registrarHistorico } = require('../utils/documentos');

const TIPOS_DESCONTO = ['percentual', 'valor'];

// ─── Validação ──────────────────────────────────────────────────────────────
const validarDesconto = (tipo, valor, onde) => {
  if (tipo && !TIPOS_DESCONTO.includes(tipo)) return `${onde}: tipo de desconto inválido`;
  const d = parseFloat(valor);
  if (valor !== undefined && valor !== null && valor !== '' && (Number.isNaN(d) || d < 0)) {
    return `${onde}: desconto não pode ser negativo`;
  }
  if (tipo === 'percentual' && d > 100) return `${onde}: desconto percentual não pode passar de 100%`;
  return null;
};

const validarPayload = ({ cliente_id, produtos, desconto_tipo, desconto }) => {
  if (!cliente_id) return 'Selecione o cliente';
  if (!Array.isArray(produtos) || produtos.length === 0) return 'Inclua ao menos um produto no orçamento';

  for (const [i, p] of produtos.entries()) {
    const onde = `Produto ${i + 1}`;
    // Um item pode vir do cadastro (produto_id) ou ser avulso — mas precisa de descrição.
    if (!p.produto_id && !String(p.descricao || '').trim()) {
      return `${onde}: selecione um produto ou informe a descrição`;
    }
    if (!(parseFloat(p.quantidade) > 0)) return `${onde}: quantidade deve ser maior que zero`;
    if (!(parseFloat(p.preco_unitario) >= 0)) return `${onde}: informe um preço unitário válido`;

    const erro = validarDesconto(p.desconto_tipo, p.desconto, onde);
    if (erro) return erro;
  }

  return validarDesconto(desconto_tipo, desconto, 'Desconto geral');
};

// ─── Gravação dos produtos ──────────────────────────────────────────────────
/**
 * Apaga e reinsere os itens do orçamento de venda.
 *
 * Marca, cor, código e afins são copiados do cadastro no momento da gravação: se o
 * produto for renomeado ou reajustado depois, o pedido antigo continua descrevendo o
 * que foi realmente vendido. Mesma regra de congelamento dos orçamentos de impressão.
 */
const gravarProdutos = async (conn, orcamentoId, produtos) => {
  const ids = [...new Set(produtos.map((p) => parseInt(p.produto_id, 10)).filter(Boolean))];

  const cadastro = new Map();
  if (ids.length > 0) {
    const [rows] = await conn.query('SELECT * FROM produtos WHERE id IN (?)', [ids]);
    rows.forEach((r) => cadastro.set(r.id, r));
    const faltando = ids.find((id) => !cadastro.has(id));
    if (faltando) return { erro: `Produto ${faltando} não encontrado` };
  }

  await conn.query('DELETE FROM orcamento_produtos WHERE orcamento_id = ?', [orcamentoId]);

  for (const [indice, p] of produtos.entries()) {
    const produtoId = parseInt(p.produto_id, 10) || null;
    const base = produtoId ? cadastro.get(produtoId) : {};

    // O que o usuário digitou tem prioridade; o cadastro preenche o resto.
    const texto = (doUsuario, doCadastro) => {
      const v = doUsuario !== undefined && doUsuario !== null && String(doUsuario).trim() !== ''
        ? String(doUsuario).trim()
        : (doCadastro ?? null);
      return v || null;
    };

    await conn.query(
      `INSERT INTO orcamento_produtos
         (orcamento_id, ordem, produto_id, codigo, descricao, categoria, marca, cor,
          tipo_material, especificacao, unidade, quantidade, preco_unitario,
          desconto_tipo, desconto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orcamentoId, indice + 1, produtoId,
        texto(p.codigo, base.codigo),
        texto(p.descricao, base.nome),
        texto(p.categoria, base.categoria),
        texto(p.marca, base.marca),
        texto(p.cor, base.cor),
        texto(p.tipo_material, base.tipo_material),
        texto(p.especificacao, base.especificacao),
        texto(p.unidade, base.unidade) || 'un',
        parseFloat(p.quantidade),
        parseFloat(p.preco_unitario),
        TIPOS_DESCONTO.includes(p.desconto_tipo) ? p.desconto_tipo : 'percentual',
        parseFloat(p.desconto) || 0,
      ]
    );
  }

  return { erro: null };
};

// ─── Criação e edição ───────────────────────────────────────────────────────
const criar = async (req, res) => {
  const { cliente_id, observacao, produtos, desconto_tipo = 'percentual', desconto = 0 } = req.body;

  const erroValidacao = validarPayload({ cliente_id, produtos, desconto_tipo, desconto });
  if (erroValidacao) return res.status(400).json({ erro: erroValidacao });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [cliente] = await conn.query('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (cliente.length === 0) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    const numeroOrcamento = await proximoNumero(conn, 'orcamento_venda');

    const [result] = await conn.query(
      `INSERT INTO orcamentos
         (tipo, numero_orcamento, cliente_id, observacao, desconto_tipo, desconto, status, criado_por)
       VALUES ('produto', ?, ?, ?, ?, ?, 'rascunho', ?)`,
      [numeroOrcamento, cliente_id, observacao?.trim() || null,
       TIPOS_DESCONTO.includes(desconto_tipo) ? desconto_tipo : 'percentual',
       parseFloat(desconto) || 0, req.usuario.id]
    );
    const orcamentoId = result.insertId;

    const { erro } = await gravarProdutos(conn, orcamentoId, produtos);
    if (erro) {
      await conn.rollback();
      return res.status(400).json({ erro });
    }

    const totais = await recalcularOrcamentoVenda(conn, orcamentoId);
    await registrarHistorico(conn, {
      orcamento_id: orcamentoId,
      usuario_id: req.usuario.id,
      acao: 'criado',
      detalhe: `${produtos.length} produto(s)`,
      total_novo: totais.total_geral,
    });

    await conn.commit();
    res.status(201).json({
      id: orcamentoId,
      numero_orcamento: numeroOrcamento,
      total_geral: totais.total_geral,
      mensagem: 'Orçamento de venda criado com sucesso',
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
  const { cliente_id, observacao, produtos, desconto_tipo = 'percentual', desconto = 0 } = req.body;

  const erroValidacao = validarPayload({ cliente_id, produtos, desconto_tipo, desconto });
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
    if (orcamento.tipo !== 'produto') {
      await conn.rollback();
      return res.status(400).json({ erro: 'Este é um orçamento de impressão — use /api/orcamentos' });
    }

    const [cliente] = await conn.query('SELECT id FROM clientes WHERE id = ?', [cliente_id]);
    if (cliente.length === 0) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Cliente não encontrado' });
    }

    await conn.query(
      'UPDATE orcamentos SET cliente_id = ?, observacao = ?, desconto_tipo = ?, desconto = ? WHERE id = ?',
      [cliente_id, observacao?.trim() || null,
       TIPOS_DESCONTO.includes(desconto_tipo) ? desconto_tipo : 'percentual',
       parseFloat(desconto) || 0, orcamento.id]
    );

    const { erro } = await gravarProdutos(conn, orcamento.id, produtos);
    if (erro) {
      await conn.rollback();
      return res.status(400).json({ erro });
    }

    const totais = await recalcularOrcamentoVenda(conn, orcamento.id);
    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: 'editado',
      detalhe: `${produtos.length} produto(s)`,
      total_anterior: orcamento.total_geral,
      total_novo: totais.total_geral,
    });

    await conn.commit();
    res.json({ mensagem: 'Orçamento de venda atualizado', total_geral: totais.total_geral });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

/** Traz os preços dos produtos de volta para a tabela atual do cadastro. */
const reprecificar = async (req, res) => {
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
    if (orcamento.tipo !== 'produto') {
      await conn.rollback();
      return res.status(400).json({ erro: 'Este é um orçamento de impressão' });
    }

    // Itens avulsos (sem produto_id) não têm cadastro de onde puxar preço.
    await conn.query(`
      UPDATE orcamento_produtos op
        JOIN produtos p ON p.id = op.produto_id
         SET op.preco_unitario = p.preco_venda
       WHERE op.orcamento_id = ?
    `, [orcamento.id]);

    const totais = await recalcularOrcamentoVenda(conn, orcamento.id);
    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: 'reprecificado',
      detalhe: 'Preços atualizados pelo cadastro de produtos',
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

module.exports = { criar, atualizar, reprecificar };
