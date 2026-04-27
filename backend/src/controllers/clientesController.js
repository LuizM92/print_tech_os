const db = require('../utils/db');

const listar = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM clientes WHERE ativo = 1 ORDER BY nome'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const buscarPorId = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const { nome, cpf_cnpj, tipo_documento, rua, numero, complemento, bairro, cidade, estado, cep, markup } = req.body;
  if (!nome || !cpf_cnpj || !tipo_documento || !rua || !numero || !bairro || !cidade || !estado || !cep) {
    return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos' });
  }
  try {
    const [existe] = await db.query('SELECT id FROM clientes WHERE cpf_cnpj = ?', [cpf_cnpj]);
    if (existe.length > 0) return res.status(400).json({ erro: 'CPF/CNPJ já cadastrado' });

    const [result] = await db.query(
      'INSERT INTO clientes (nome, cpf_cnpj, tipo_documento, rua, numero, complemento, bairro, cidade, estado, cep, markup) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [nome, cpf_cnpj, tipo_documento, rua, numero, complemento || null, bairro, cidade, estado, cep, markup || 0]
    );
    res.status(201).json({ id: result.insertId, mensagem: 'Cliente cadastrado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const { nome, cpf_cnpj, tipo_documento, rua, numero, complemento, bairro, cidade, estado, cep, markup } = req.body;
  try {
    const [existe] = await db.query('SELECT id FROM clientes WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });

    await db.query(
      'UPDATE clientes SET nome=?, cpf_cnpj=?, tipo_documento=?, rua=?, numero=?, complemento=?, bairro=?, cidade=?, estado=?, cep=?, markup=? WHERE id=?',
      [nome, cpf_cnpj, tipo_documento, rua, numero, complemento || null, bairro, cidade, estado, cep, markup || 0, req.params.id]
    );
    res.json({ mensagem: 'Cliente atualizado com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  try {
    const [existe] = await db.query('SELECT id FROM clientes WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });

    await db.query('UPDATE clientes SET ativo = 0 WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Cliente excluído com sucesso' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { listar, buscarPorId, criar, atualizar, excluir };
