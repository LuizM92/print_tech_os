const db = require('../utils/db');

const CATEGORIAS = ['filamento', 'resina', 'peca', 'bico', 'impressora', 'acessorio', 'outro'];
const UNIDADES = ['un', 'kg', 'g', 'm', 'rolo', 'caixa', 'litro'];

// Campos que o usuário preenche; o resto (id, ativo, datas) é do sistema.
const CAMPOS = [
  'codigo', 'nome', 'categoria', 'marca', 'cor', 'tipo_material',
  'diametro_mm', 'peso_liquido_g', 'especificacao', 'unidade', 'preco_venda', 'descricao',
];

const vazio = (v) => v === undefined || v === null || String(v).trim() === '';

const normalizar = (corpo) => ({
  codigo: vazio(corpo.codigo) ? null : String(corpo.codigo).trim(),
  nome: String(corpo.nome || '').trim(),
  categoria: CATEGORIAS.includes(corpo.categoria) ? corpo.categoria : 'outro',
  marca: vazio(corpo.marca) ? null : String(corpo.marca).trim(),
  cor: vazio(corpo.cor) ? null : String(corpo.cor).trim(),
  tipo_material: vazio(corpo.tipo_material) ? null : String(corpo.tipo_material).trim(),
  diametro_mm: vazio(corpo.diametro_mm) ? null : parseFloat(corpo.diametro_mm),
  peso_liquido_g: vazio(corpo.peso_liquido_g) ? null : parseFloat(corpo.peso_liquido_g),
  especificacao: vazio(corpo.especificacao) ? null : String(corpo.especificacao).trim(),
  unidade: UNIDADES.includes(corpo.unidade) ? corpo.unidade : 'un',
  preco_venda: parseFloat(corpo.preco_venda),
  descricao: vazio(corpo.descricao) ? null : String(corpo.descricao).trim(),
});

const validar = (p) => {
  if (!p.nome) return 'Informe o nome do produto';
  if (!(p.preco_venda >= 0) || Number.isNaN(p.preco_venda)) return 'Informe um preço de venda válido';
  if (p.diametro_mm !== null && !(p.diametro_mm > 0)) return 'Diâmetro deve ser maior que zero';
  if (p.peso_liquido_g !== null && !(p.peso_liquido_g > 0)) return 'Peso deve ser maior que zero';
  return null;
};

const listar = async (req, res) => {
  try {
    const where = ['ativo = 1'];
    const params = [];

    if (req.query.categoria && CATEGORIAS.includes(req.query.categoria)) {
      where.push('categoria = ?');
      params.push(req.query.categoria);
    }
    if (req.query.busca) {
      where.push('(nome LIKE ? OR marca LIKE ? OR codigo LIKE ? OR cor LIKE ? OR tipo_material LIKE ?)');
      const termo = `%${req.query.busca}%`;
      params.push(termo, termo, termo, termo, termo);
    }

    const [rows] = await db.query(
      `SELECT * FROM produtos WHERE ${where.join(' AND ')} ORDER BY categoria, nome, cor`,
      params
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const produto = normalizar(req.body);
  const erro = validar(produto);
  if (erro) return res.status(400).json({ erro });

  try {
    if (produto.codigo) {
      const [existe] = await db.query('SELECT id FROM produtos WHERE codigo = ?', [produto.codigo]);
      if (existe.length > 0) return res.status(400).json({ erro: 'Já existe um produto com esse código' });
    }

    const [result] = await db.query(
      `INSERT INTO produtos (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map(() => '?').join(', ')})`,
      CAMPOS.map((c) => produto[c])
    );
    res.status(201).json({ id: result.insertId, mensagem: 'Produto cadastrado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const produto = normalizar(req.body);
  const erro = validar(produto);
  if (erro) return res.status(400).json({ erro });

  try {
    const [existe] = await db.query('SELECT id FROM produtos WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });

    if (produto.codigo) {
      const [duplicado] = await db.query(
        'SELECT id FROM produtos WHERE codigo = ? AND id <> ?', [produto.codigo, req.params.id]
      );
      if (duplicado.length > 0) return res.status(400).json({ erro: 'Já existe um produto com esse código' });
    }

    await db.query(
      `UPDATE produtos SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...CAMPOS.map((c) => produto[c]), req.params.id]
    );
    res.json({ mensagem: 'Produto atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  try {
    const [existe] = await db.query('SELECT id FROM produtos WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Produto não encontrado' });

    // Soft delete: orçamentos antigos continuam apontando para o produto.
    await db.query('UPDATE produtos SET ativo = 0 WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Produto removido com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { listar, criar, atualizar, excluir, CATEGORIAS, UNIDADES };
