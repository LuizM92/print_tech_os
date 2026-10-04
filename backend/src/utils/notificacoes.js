/**
 * Notificações do sino. Quem cria são os alertas da farm (utils/alertas); aqui fica
 * gravar, listar para cada usuário com o que ele já leu, e marcar como lida.
 */
const db = require('./db');

// O sino mostra as últimas; mais que isso é histórico, e o histórico está nas telas.
const LIMITE_LISTA = 30;
// O contador só conta o que é recente: notificação de semanas atrás não é "nova".
const DIAS_NAO_LIDAS = 30;
const DIAS_GUARDAR = 60;
const INTERVALO_LIMPEZA_MS = 24 * 3600 * 1000;

let ultimaLimpeza = 0;

async function limparVelhas() {
  if (Date.now() - ultimaLimpeza < INTERVALO_LIMPEZA_MS) return;
  ultimaLimpeza = Date.now();
  await db.query('DELETE FROM notificacoes WHERE criado_em < DATE_SUB(NOW(), INTERVAL ? DAY)', [DIAS_GUARDAR]);
}

/**
 * Grava a notificação. Falha aqui não pode impedir o push nem derrubar o monitor.
 * `somenteAdmin` marca o que o operador não pode ver (contas a pagar): o sino é de todos,
 * então a restrição é uma coluna e cada consulta abaixo a respeita.
 */
async function registrar(alerta, { impressoraId = null, somenteAdmin = false } = {}) {
  try {
    await db.query(
      'INSERT INTO notificacoes (tipo, titulo, corpo, url, impressora_id, somente_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [alerta.tipo || 'aviso', alerta.titulo.slice(0, 150), alerta.corpo?.slice(0, 500) || null,
        alerta.url || null, impressoraId, somenteAdmin ? 1 : 0],
    );
    await limparVelhas();
  } catch (err) {
    console.error(`[notificacoes] ${err.message}`);
  }
}

async function listar(usuarioId, { admin = false } = {}) {
  // Quem não é admin não enxerga as marcadas como somente_admin, nem na lista nem no contador.
  const visivel = admin ? '1 = 1' : 'n.somente_admin = 0';
  const [itens] = await db.query(
    `SELECT n.id, n.tipo, n.titulo, n.corpo, n.url, n.criado_em, (l.usuario_id IS NOT NULL) AS lida
       FROM notificacoes n
       LEFT JOIN notificacao_lidas l ON l.notificacao_id = n.id AND l.usuario_id = ?
      WHERE ${visivel}
      ORDER BY n.id DESC
      LIMIT ?`,
    [usuarioId, LIMITE_LISTA],
  );
  const [[{ total }]] = await db.query(
    `SELECT COUNT(*) AS total
       FROM notificacoes n
       LEFT JOIN notificacao_lidas l ON l.notificacao_id = n.id AND l.usuario_id = ?
      WHERE l.usuario_id IS NULL AND n.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${visivel}`,
    [usuarioId, DIAS_NAO_LIDAS],
  );
  return { itens: itens.map((i) => ({ ...i, lida: !!i.lida })), nao_lidas: total };
}

async function marcarLida(id, usuarioId) {
  await db.query(
    `INSERT IGNORE INTO notificacao_lidas (notificacao_id, usuario_id)
     SELECT id, ? FROM notificacoes WHERE id = ?`,
    [usuarioId, id],
  );
}

async function marcarTodas(usuarioId, { admin = false } = {}) {
  await db.query(
    `INSERT IGNORE INTO notificacao_lidas (notificacao_id, usuario_id)
     SELECT id, ? FROM notificacoes
      WHERE criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) ${admin ? '' : 'AND somente_admin = 0'}`,
    [usuarioId, DIAS_GUARDAR],
  );
}

module.exports = { registrar, listar, marcarLida, marcarTodas };
