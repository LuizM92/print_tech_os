const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../utils/db');

const login = async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: 'Email e senha são obrigatórios' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM usuarios WHERE email = ? AND ativo = 1',
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const usuario = rows[0];
    const senhaValida = await bcrypt.compare(senha, usuario.senha);

    if (!senhaValida) {
      return res.status(401).json({ erro: 'Credenciais inválidas' });
    }

    const token = jwt.sign(
      { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN }
    );

    res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const perfil = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, nome, email, perfil, criado_em FROM usuarios WHERE id = ?',
      [req.usuario.id]
    );
    if (rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const alterarSenha = async (req, res) => {
  const { senhaAtual, novaSenha } = req.body;
  if (!senhaAtual || !novaSenha) {
    return res.status(400).json({ erro: 'Senha atual e nova senha são obrigatórias' });
  }
  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: 'Nova senha deve ter no mínimo 6 caracteres' });
  }
  try {
    const [rows] = await db.query('SELECT senha FROM usuarios WHERE id = ?', [req.usuario.id]);
    const valida = await bcrypt.compare(senhaAtual, rows[0].senha);
    if (!valida) return res.status(401).json({ erro: 'Senha atual incorreta' });

    const hash = await bcrypt.hash(novaSenha, 10);
    await db.query('UPDATE usuarios SET senha = ? WHERE id = ?', [hash, req.usuario.id]);
    res.json({ mensagem: 'Senha alterada com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { login, perfil, alterarSenha };
