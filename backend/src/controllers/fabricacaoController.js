const db = require('../utils/db');
const {
  CATEGORIAS, MATERIAIS, CORES, CODIGOS_CATEGORIA,
  normalizarBloco, normalizarTamanho, montarSkuPai, montarSku,
  validarPai, validarVariacao,
} = require('../utils/sku');

const vazio = (v) => v === undefined || v === null || String(v).trim() === '';

/** Tabelas do padrão de SKU — a tela monta os selects a partir daqui. */
const tabelas = (req, res) => res.json({ categorias: CATEGORIAS, materiais: MATERIAIS, cores: CORES });

const normalizarProduto = (corpo) => ({
  categoria: normalizarBloco(corpo.categoria),
  modelo: normalizarBloco(corpo.modelo),
  nome: String(corpo.nome || '').trim(),
  descricao: vazio(corpo.descricao) ? null : String(corpo.descricao).trim(),
});

const normalizarVariacoes = (lista, pai) =>
  (Array.isArray(lista) ? lista : []).map((v) => {
    const blocos = {
      categoria: pai.categoria,
      modelo: pai.modelo,
      material: normalizarBloco(v.material) || 'PLA',
      variacao: normalizarBloco(v.variacao) || 'STD',
      tamanho: normalizarTamanho(v.tamanho),
    };
    return {
      id: v.id ? parseInt(v.id, 10) : null,
      sku: montarSku(blocos),
      material: blocos.material,
      variacao: blocos.variacao,
      tamanho: blocos.tamanho,
      nome_variacao: vazio(v.nome_variacao) ? null : String(v.nome_variacao).trim(),
      preco_venda: vazio(v.preco_venda) ? 0 : parseFloat(v.preco_venda),
      ativo: v.ativo === 0 || v.ativo === false ? 0 : 1,
    };
  });

const normalizarListagens = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .filter((l) => !vazio(l.loja))
    .map((l) => ({
      loja: String(l.loja).trim(),
      product_id: vazio(l.product_id) ? null : String(l.product_id).trim(),
    }));

/** Mensagem de erro do payload inteiro, ou null quando está tudo certo. */
const validarPayload = (produto, variacoes) => {
  if (!produto.nome) return 'Informe o nome do produto';
  const erroPai = validarPai(produto);
  if (erroPai) return erroPai;
  if (variacoes.length === 0) return 'Cadastre ao menos uma variação';

  for (const v of variacoes) {
    const erro = validarVariacao(v);
    if (erro) return `${erro} (variação ${v.variacao})`;
    if (!(v.preco_venda >= 0) || Number.isNaN(v.preco_venda)) return `Preço inválido na variação ${v.variacao}`;
  }

  const skus = variacoes.map((v) => v.sku);
  const repetido = skus.find((s, i) => skus.indexOf(s) !== i);
  if (repetido) return `A variação ${repetido} está repetida`;

  return null;
};

/** Anexa variações e listagens a uma lista de produtos, em duas consultas só. */
const carregarFilhos = async (produtos) => {
  if (produtos.length === 0) return produtos;
  const ids = produtos.map((p) => p.id);
  const marcadores = ids.map(() => '?').join(', ');

  const [variacoes] = await db.query(
    `SELECT * FROM fab_variacoes WHERE produto_id IN (${marcadores})
      ORDER BY ativo DESC, material, variacao, tamanho`,
    ids
  );
  const [listagens] = await db.query(
    `SELECT * FROM fab_listagens WHERE produto_id IN (${marcadores}) ORDER BY loja`,
    ids
  );

  return produtos.map((p) => ({
    ...p,
    variacoes: variacoes.filter((v) => v.produto_id === p.id),
    listagens: listagens.filter((l) => l.produto_id === p.id),
  }));
};

const listar = async (req, res) => {
  try {
    const where = [];
    const params = [];

    if (req.query.incluir_inativos !== '1') where.push('p.ativo = 1');
    if (req.query.categoria && CODIGOS_CATEGORIA.includes(req.query.categoria)) {
      where.push('p.categoria = ?');
      params.push(req.query.categoria);
    }
    if (req.query.busca) {
      // Busca também nos SKUs das variações — é por eles que se procura no dia a dia.
      where.push(`(p.nome LIKE ? OR p.sku_pai LIKE ? OR p.modelo LIKE ?
        OR EXISTS (SELECT 1 FROM fab_variacoes v WHERE v.produto_id = p.id AND v.sku LIKE ?))`);
      const termo = `%${req.query.busca}%`;
      params.push(termo, termo, termo, termo);
    }

    const [produtos] = await db.query(
      `SELECT p.* FROM fab_produtos p
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.categoria, p.modelo`,
      params
    );
    res.json(await carregarFilhos(produtos));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const buscarPorId = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM fab_produtos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });
    const [produto] = await carregarFilhos(rows);
    res.json(produto);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

/** SKUs de variação já usados por outro produto — o código nunca é reaproveitado. */
const skusEmUso = async (conn, skus, produtoId) => {
  if (skus.length === 0) return [];
  const [rows] = await conn.query(
    `SELECT sku FROM fab_variacoes
      WHERE sku IN (${skus.map(() => '?').join(', ')}) AND produto_id <> ?`,
    [...skus, produtoId || 0]
  );
  return rows.map((r) => r.sku);
};

const gravarFilhos = async (conn, produtoId, variacoes, listagens) => {
  // Variação que sumiu do formulário é aposentada, não apagada: o SKU fica reservado
  // e os anúncios antigos continuam apontando para um código que existe.
  const enviadas = variacoes.map((v) => v.id).filter(Boolean);
  await conn.query(
    `UPDATE fab_variacoes SET ativo = 0 WHERE produto_id = ?
      ${enviadas.length ? `AND id NOT IN (${enviadas.map(() => '?').join(', ')})` : ''}`,
    [produtoId, ...enviadas]
  );

  for (const v of variacoes) {
    const campos = [v.sku, v.material, v.variacao, v.tamanho, v.nome_variacao, v.preco_venda, v.ativo];
    if (v.id) {
      await conn.query(
        `UPDATE fab_variacoes
            SET sku = ?, material = ?, variacao = ?, tamanho = ?, nome_variacao = ?, preco_venda = ?, ativo = ?
          WHERE id = ? AND produto_id = ?`,
        [...campos, v.id, produtoId]
      );
    } else {
      await conn.query(
        `INSERT INTO fab_variacoes
           (produto_id, sku, material, variacao, tamanho, nome_variacao, preco_venda, ativo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [produtoId, ...campos]
      );
    }
  }

  await conn.query('DELETE FROM fab_listagens WHERE produto_id = ?', [produtoId]);
  for (const l of listagens) {
    await conn.query(
      'INSERT INTO fab_listagens (produto_id, loja, product_id) VALUES (?, ?, ?)',
      [produtoId, l.loja, l.product_id]
    );
  }
};

const criar = async (req, res) => {
  const produto = normalizarProduto(req.body);
  const variacoes = normalizarVariacoes(req.body.variacoes, produto);
  const listagens = normalizarListagens(req.body.listagens);

  const erro = validarPayload(produto, variacoes);
  if (erro) return res.status(400).json({ erro });

  const skuPai = montarSkuPai(produto);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [existe] = await conn.query('SELECT id FROM fab_produtos WHERE sku_pai = ?', [skuPai]);
    if (existe.length > 0) {
      await conn.rollback();
      return res.status(400).json({ erro: `Já existe um produto com o SKU pai ${skuPai}` });
    }

    const emUso = await skusEmUso(conn, variacoes.map((v) => v.sku), null);
    if (emUso.length > 0) {
      await conn.rollback();
      return res.status(400).json({ erro: `SKU já usado em outro produto: ${emUso.join(', ')}` });
    }

    const [result] = await conn.query(
      'INSERT INTO fab_produtos (sku_pai, categoria, modelo, nome, descricao) VALUES (?, ?, ?, ?, ?)',
      [skuPai, produto.categoria, produto.modelo, produto.nome, produto.descricao]
    );
    await gravarFilhos(conn, result.insertId, variacoes, listagens);

    await conn.commit();
    res.status(201).json({ id: result.insertId, sku_pai: skuPai, mensagem: 'Produto cadastrado com sucesso' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

const atualizar = async (req, res) => {
  const conn = await db.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM fab_produtos WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      conn.release();
      return res.status(404).json({ erro: 'Produto não encontrado' });
    }
    const atual = rows[0];

    // Categoria e modelo são a identidade do SKU pai e não mudam depois de gravados:
    // trocá-los renomearia todos os SKUs já anunciados. Só nome e descrição são livres.
    const produto = {
      categoria: atual.categoria,
      modelo: atual.modelo,
      nome: String(req.body.nome || '').trim(),
      descricao: vazio(req.body.descricao) ? null : String(req.body.descricao).trim(),
    };
    const variacoes = normalizarVariacoes(req.body.variacoes, produto);
    const listagens = normalizarListagens(req.body.listagens);

    const erro = validarPayload(produto, variacoes);
    if (erro) {
      conn.release();
      return res.status(400).json({ erro });
    }

    await conn.beginTransaction();

    const emUso = await skusEmUso(conn, variacoes.map((v) => v.sku), atual.id);
    if (emUso.length > 0) {
      await conn.rollback();
      return res.status(400).json({ erro: `SKU já usado em outro produto: ${emUso.join(', ')}` });
    }

    await conn.query(
      'UPDATE fab_produtos SET nome = ?, descricao = ? WHERE id = ?',
      [produto.nome, produto.descricao, atual.id]
    );
    await gravarFilhos(conn, atual.id, variacoes, listagens);

    await conn.commit();
    res.json({ mensagem: 'Produto atualizado com sucesso' });
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
    const [existe] = await db.query('SELECT id FROM fab_produtos WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });

    // Produto descontinuado mantém o SKU aposentado — por isso desativa em vez de apagar.
    await db.query('UPDATE fab_produtos SET ativo = 0 WHERE id = ?', [req.params.id]);
    await db.query('UPDATE fab_variacoes SET ativo = 0 WHERE produto_id = ?', [req.params.id]);
    res.json({ mensagem: 'Produto descontinuado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { tabelas, listar, buscarPorId, criar, atualizar, excluir };
