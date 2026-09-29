const notificacoes = require('../utils/notificacoes');

const erro500 = (res, err) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
};

/** As últimas notificações, cada uma dizendo se este usuário já leu, e o contador. */
const listar = async (req, res) => {
  try {
    res.json(await notificacoes.listar(req.usuario.id));
  } catch (err) {
    erro500(res, err);
  }
};

const marcarLida = async (req, res) => {
  try {
    await notificacoes.marcarLida(parseInt(req.params.id, 10), req.usuario.id);
    res.json(await notificacoes.listar(req.usuario.id));
  } catch (err) {
    erro500(res, err);
  }
};

const marcarTodas = async (req, res) => {
  try {
    await notificacoes.marcarTodas(req.usuario.id);
    res.json(await notificacoes.listar(req.usuario.id));
  } catch (err) {
    erro500(res, err);
  }
};

module.exports = { listar, marcarLida, marcarTodas };
