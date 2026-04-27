const db = require('../utils/db');

const listar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM materiais WHERE ativo = 1 ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const { nome, custo_por_grama, descricao } = req.body;
  if (!nome || custo_por_grama === undefined) {
    return res.status(400).json({ erro: 'Nome e custo por grama são obrigatórios' });
  }
  try {
    const [existe] = await db.query('SELECT id FROM materiais WHERE nome = ?', [nome]);
    if (existe.length > 0) return res.status(400).json({ erro: 'Material já cadastrado' });
    const [result] = await db.query(
      'INSERT INTO materiais (nome, custo_por_grama, descricao) VALUES (?, ?, ?)',
      [nome, custo_por_grama, descricao || null]
    );
    res.status(201).json({ id: result.insertId, mensagem: 'Material criado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const { nome, custo_por_grama, descricao, ativo } = req.body;
  try {
    await db.query(
      'UPDATE materiais SET nome=?, custo_por_grama=?, descricao=?, ativo=? WHERE id=?',
      [nome, custo_por_grama, descricao || null, ativo !== undefined ? ativo : 1, req.params.id]
    );
    res.json({ mensagem: 'Material atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  try {
    await db.query('UPDATE materiais SET ativo = 0 WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Material removido com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { listar, criar, atualizar, excluir };
