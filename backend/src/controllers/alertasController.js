const alertas = require('../utils/alertas');

const falhou = (res, err) => {
  if (err.validacao) return res.status(400).json({ erro: err.message });
  console.error(err);
  return res.status(500).json({ erro: 'Erro interno do servidor' });
};

/** A chave pública VAPID — o navegador precisa dela para se inscrever. */
const chave = async (req, res) => {
  try {
    res.json({ chave: await alertas.chaves() });
  } catch (err) {
    falhou(res, err);
  }
};

const inscrever = async (req, res) => {
  try {
    await alertas.inscrever(req.usuario.id, req.body.inscricao, req.body.aparelho);
    res.status(201).json({ mensagem: 'Alertas ativados neste aparelho' });
  } catch (err) {
    falhou(res, err);
  }
};

const cancelar = async (req, res) => {
  try {
    await alertas.cancelar(req.body.endpoint);
    res.json({ mensagem: 'Alertas desativados neste aparelho' });
  } catch (err) {
    falhou(res, err);
  }
};

/** Se este aparelho está inscrito — POST porque o endpoint não cabe bem numa URL. */
const situacao = async (req, res) => {
  try {
    res.json({ inscrito: await alertas.inscrito(req.body.endpoint) });
  } catch (err) {
    falhou(res, err);
  }
};

/** Manda um alerta de teste para os aparelhos de quem pediu. */
const teste = async (req, res) => {
  try {
    const entregues = await alertas.enviar({
      titulo: 'Alertas da farm funcionando',
      corpo: 'É assim que chega o aviso quando uma impressora terminar, falhar, pausar ou cair.',
      tag: 'teste',
      url: '/impressoras',
    }, { usuarioId: req.usuario.id });
    if (!entregues) return res.status(404).json({ erro: 'Nenhum aparelho seu com os alertas ativados' });
    res.json({ mensagem: `Enviado para ${entregues} aparelho${entregues === 1 ? '' : 's'}` });
  } catch (err) {
    falhou(res, err);
  }
};

module.exports = { chave, inscrever, cancelar, situacao, teste };
