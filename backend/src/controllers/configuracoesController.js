const db = require('../utils/db');

const listar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM configuracoes ORDER BY chave');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const { chave, valor } = req.body;
  if (!chave || valor === undefined) {
    return res.status(400).json({ erro: 'Chave e valor são obrigatórios' });
  }
  try {
    await db.query(
      'INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = ?',
      [chave, valor, valor]
    );
    res.json({ mensagem: 'Configuração salva com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const buscarPorChave = async (chave) => {
  const [rows] = await db.query('SELECT valor FROM configuracoes WHERE chave = ?', [chave]);
  return rows.length > 0 ? rows[0].valor : null;
};

module.exports = { listar, atualizar, buscarPorChave };
