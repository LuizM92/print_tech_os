/**
 * Fornecedores das contas a pagar. Cadastro enxuto — o que se precisa para saber a quem
 * se deve e como pagar. Exclusão é desativação: contas antigas continuam apontando para
 * o fornecedor, como acontece com `clientes`.
 */
const db = require('../utils/db');
const { validarCnpj, somenteDigitos } = require('../utils/consultaCnpj');

const erro500 = (res, err) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
};

const texto = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t.slice(0, max);
};

const CAMPOS = ['nome', 'cpf_cnpj', 'telefone', 'email', 'pix_chave', 'observacoes'];

const normalizar = (corpo) => {
  const documento = somenteDigitos(corpo.cpf_cnpj || '');
  return {
    nome: texto(corpo.nome, 150),
    cpf_cnpj: documento === '' ? null : documento,
    telefone: texto(corpo.telefone, 30),
    email: texto(corpo.email, 150),
    pix_chave: texto(corpo.pix_chave, 150),
    observacoes: texto(corpo.observacoes, 2000),
  };
};

const validar = (f) => {
  if (!f.nome) return 'Informe o nome do fornecedor';
  if (f.cpf_cnpj !== null) {
    // CPF não tem validação de dígito aqui (fornecedor pessoa física é raro e o campo é
    // opcional); CNPJ passa pela mesma conferência do cadastro de clientes.
    if (f.cpf_cnpj.length !== 11 && f.cpf_cnpj.length !== 14) return 'CPF ou CNPJ com tamanho inválido';
    if (f.cpf_cnpj.length === 14 && !validarCnpj(f.cpf_cnpj)) return 'CNPJ inválido';
  }
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) return 'E-mail inválido';
  return null;
};

const listar = async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.query.incluir_inativos !== '1') where.push('ativo = 1');
    if (req.query.busca) {
      where.push('(nome LIKE ? OR cpf_cnpj LIKE ?)');
      params.push(`%${req.query.busca}%`, `%${somenteDigitos(req.query.busca) || req.query.busca}%`);
    }
    const [rows] = await db.query(
      `SELECT * FROM fornecedores ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY nome`,
      params
    );
    res.json(rows);
  } catch (err) {
    erro500(res, err);
  }
};

const buscarPorId = async (req, res) => {
  try {
    const [[f]] = await db.query('SELECT * FROM fornecedores WHERE id = ?', [req.params.id]);
    if (!f) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    res.json(f);
  } catch (err) {
    erro500(res, err);
  }
};

const criar = async (req, res) => {
  const f = normalizar(req.body);
  const erro = validar(f);
  if (erro) return res.status(400).json({ erro });

  try {
    if (f.cpf_cnpj) {
      const [existe] = await db.query('SELECT id FROM fornecedores WHERE cpf_cnpj = ?', [f.cpf_cnpj]);
      if (existe.length > 0) return res.status(400).json({ erro: 'CPF/CNPJ já cadastrado' });
    }
    const [r] = await db.query(
      `INSERT INTO fornecedores (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map(() => '?').join(', ')})`,
      CAMPOS.map((c) => f[c])
    );
    res.status(201).json({ id: r.insertId, mensagem: 'Fornecedor cadastrado' });
  } catch (err) {
    erro500(res, err);
  }
};

const atualizar = async (req, res) => {
  const f = normalizar(req.body);
  const erro = validar(f);
  if (erro) return res.status(400).json({ erro });

  try {
    const [[existe]] = await db.query('SELECT id FROM fornecedores WHERE id = ?', [req.params.id]);
    if (!existe) return res.status(404).json({ erro: 'Fornecedor não encontrado' });

    if (f.cpf_cnpj) {
      const [duplicado] = await db.query(
        'SELECT id FROM fornecedores WHERE cpf_cnpj = ? AND id <> ?', [f.cpf_cnpj, req.params.id]
      );
      if (duplicado.length > 0) return res.status(400).json({ erro: 'CPF/CNPJ já cadastrado em outro fornecedor' });
    }

    // `ativo` só muda quando vem no corpo — editar os dados não reativa nem desativa.
    const sets = CAMPOS.map((c) => `${c} = ?`);
    const valores = CAMPOS.map((c) => f[c]);
    if ('ativo' in req.body) {
      sets.push('ativo = ?');
      valores.push(req.body.ativo ? 1 : 0);
    }
    await db.query(`UPDATE fornecedores SET ${sets.join(', ')} WHERE id = ?`, [...valores, req.params.id]);
    res.json({ mensagem: 'Fornecedor atualizado' });
  } catch (err) {
    erro500(res, err);
  }
};

const excluir = async (req, res) => {
  try {
    const [r] = await db.query('UPDATE fornecedores SET ativo = 0 WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ erro: 'Fornecedor não encontrado' });
    res.json({ mensagem: 'Fornecedor desativado' });
  } catch (err) {
    erro500(res, err);
  }
};

module.exports = { listar, buscarPorId, criar, atualizar, excluir };
