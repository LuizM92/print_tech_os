/**
 * Categorias das despesas (aluguel, energia, filamento…). A lista inicial vem da
 * migração 017; aqui o admin acrescenta, renomeia e desativa. Desativar em vez de
 * apagar mantém as contas antigas com a categoria que tinham.
 */
const db = require('../utils/db');

const erro500 = (res, err) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
};

const nomeValido = (v) => {
  const nome = String(v ?? '').trim().slice(0, 100);
  return nome === '' ? null : nome;
};

const listar = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nome, ativo FROM categorias_despesa
        ${req.query.incluir_inativas === '1' ? '' : 'WHERE ativo = 1'} ORDER BY nome`
    );
    res.json(rows);
  } catch (err) {
    erro500(res, err);
  }
};

const criar = async (req, res) => {
  const nome = nomeValido(req.body.nome);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da categoria' });

  try {
    const [[existe]] = await db.query('SELECT id FROM categorias_despesa WHERE nome = ?', [nome]);
    if (existe) return res.status(400).json({ erro: 'Já existe uma categoria com esse nome' });
    const [r] = await db.query('INSERT INTO categorias_despesa (nome) VALUES (?)', [nome]);
    res.status(201).json({ id: r.insertId, mensagem: 'Categoria criada' });
  } catch (err) {
    erro500(res, err);
  }
};

const atualizar = async (req, res) => {
  try {
    const [[atual]] = await db.query('SELECT id FROM categorias_despesa WHERE id = ?', [req.params.id]);
    if (!atual) return res.status(404).json({ erro: 'Categoria não encontrada' });

    const sets = [];
    const valores = [];
    if ('nome' in req.body) {
      const nome = nomeValido(req.body.nome);
      if (!nome) return res.status(400).json({ erro: 'Informe o nome da categoria' });
      const [[duplicada]] = await db.query(
        'SELECT id FROM categorias_despesa WHERE nome = ? AND id <> ?', [nome, atual.id]
      );
      if (duplicada) return res.status(400).json({ erro: 'Já existe uma categoria com esse nome' });
      sets.push('nome = ?');
      valores.push(nome);
    }
    if ('ativo' in req.body) {
      sets.push('ativo = ?');
      valores.push(req.body.ativo ? 1 : 0);
    }
    if (sets.length === 0) return res.status(400).json({ erro: 'Nada para alterar' });

    await db.query(`UPDATE categorias_despesa SET ${sets.join(', ')} WHERE id = ?`, [...valores, atual.id]);
    res.json({ mensagem: 'Categoria atualizada' });
  } catch (err) {
    erro500(res, err);
  }
};

const excluir = async (req, res) => {
  try {
    const [r] = await db.query('UPDATE categorias_despesa SET ativo = 0 WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ erro: 'Categoria não encontrada' });
    res.json({ mensagem: 'Categoria desativada' });
  } catch (err) {
    erro500(res, err);
  }
};

module.exports = { listar, criar, atualizar, excluir };
