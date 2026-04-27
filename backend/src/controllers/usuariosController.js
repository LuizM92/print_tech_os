const bcrypt = require('bcryptjs');
const db = require('../utils/db');

const listar = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, email, perfil, ativo, criado_em FROM usuarios ORDER BY nome'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const { nome, email, senha, perfil } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios' });
  }
  if (senha.length < 6) {
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
  }
  const perfilValido = ['admin', 'operador'].includes(perfil) ? perfil : 'operador';
  try {
    const [existe] = await db.query('SELECT id FROM usuarios WHERE email = ?', [email]);
    if (existe.length > 0) {
      return res.status(400).json({ erro: 'Email já cadastrado' });
    }
    const hash = await bcrypt.hash(senha, 10);
    const [result] = await db.query(
      'INSERT INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, ?)',
      [nome, email, hash, perfilValido]
    );
    res.status(201).json({ id: result.insertId, mensagem: 'Usuário criado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const { id } = req.params;
  const { nome, email, perfil, ativo } = req.body;
  try {
    const [existe] = await db.query('SELECT id FROM usuarios WHERE id = ?', [id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });

    await db.query(
      'UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ? WHERE id = ?',
      [nome, email, perfil, ativo !== undefined ? ativo : 1, id]
    );
    res.json({ mensagem: 'Usuário atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  const { id } = req.params;
  if (parseInt(id) === req.usuario.id) {
    return res.status(400).json({ erro: 'Você não pode excluir sua própria conta' });
  }
  try {
    const [existe] = await db.query('SELECT id FROM usuarios WHERE id = ?', [id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });

    await db.query('DELETE FROM usuarios WHERE id = ?', [id]);
    res.json({ mensagem: 'Usuário excluído com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { listar, criar, atualizar, excluir };
