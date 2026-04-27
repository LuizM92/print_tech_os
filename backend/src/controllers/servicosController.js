const db = require('../utils/db');

const listar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM servicos WHERE ativo = 1 ORDER BY nome');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const { nome, valor_hora, descricao } = req.body;
  if (!nome || !valor_hora) return res.status(400).json({ erro: 'Nome e valor/hora são obrigatórios' });
  try {
    const [result] = await db.query(
      'INSERT INTO servicos (nome, valor_hora, descricao) VALUES (?, ?, ?)',
      [nome, valor_hora, descricao || null]
    );
    res.status(201).json({ id: result.insertId, mensagem: 'Serviço criado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const { nome, valor_hora, descricao, ativo } = req.body;
  try {
    await db.query(
      'UPDATE servicos SET nome=?, valor_hora=?, descricao=?, ativo=? WHERE id=?',
      [nome, valor_hora, descricao || null, ativo !== undefined ? ativo : 1, req.params.id]
    );
    res.json({ mensagem: 'Serviço atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  try {
    await db.query('UPDATE servicos SET ativo = 0 WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Serviço removido com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { listar, criar, atualizar, excluir };
