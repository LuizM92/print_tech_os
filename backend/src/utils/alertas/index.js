/**
 * Alertas da farm por Web Push — o aviso chega no celular ou no computador mesmo com
 * o sistema fechado, para quem ativou no próprio aparelho.
 *
 * O monitor chama `aoEvento` a cada virada de estado; o texto de cada alerta está em
 * regras.js. Aqui ficam as chaves VAPID, as inscrições e o envio.
 *
 * Queda da rede não avisa na hora: Wi-Fi oscila, e a impressora costuma voltar em
 * segundos. Só avisa se ficou fora por QUEDA_MINUTOS no meio de uma impressão — e,
 * nesse caso, avisa também quando volta.
 */
const crypto = require('crypto');
const webpush = require('web-push');
const db = require('../db');
const { montarAlerta, alertaOffline, alertaVoltou } = require('./regras');

const QUEDA_MINUTOS = 3;
// Pausa que chega até este tempo depois de alguém clicar "Pausar" no sistema é a pausa
// pedida — não é surpresa, não avisa.
const JANELA_PAUSA_PEDIDA_MS = 60 * 1000;
// Alerta velho não serve: se o aparelho ficou sem rede por mais de uma hora, descarta.
const VALIDADE_S = 3600;

let chavePublica = null;
let prontas = null;

/**
 * Carrega o par VAPID, ou gera na primeira vez. INSERT IGNORE + releitura: se duas
 * instâncias gerarem juntas, fica a que gravou primeiro e as duas usam a mesma.
 */
function chaves() {
  if (!prontas) {
    prontas = (async () => {
      const ler = async () => {
        const [rows] = await db.query("SELECT chave, valor FROM segredos WHERE chave IN ('vapid_publica', 'vapid_privada')");
        return Object.fromEntries(rows.map((r) => [r.chave, r.valor]));
      };
      let k = await ler();
      if (!k.vapid_publica || !k.vapid_privada) {
        const novo = webpush.generateVAPIDKeys();
        await db.query(
          "INSERT IGNORE INTO segredos (chave, valor) VALUES ('vapid_publica', ?), ('vapid_privada', ?)",
          [novo.publicKey, novo.privateKey],
        );
        k = await ler();
      }
      // O "subject" é como o serviço de push nos contata se algo der errado.
      webpush.setVapidDetails('https://os.printech3d.com.br', k.vapid_publica, k.vapid_privada);
      chavePublica = k.vapid_publica;
    })().catch((err) => {
      prontas = null; // tenta de novo na próxima chamada
      throw err;
    });
  }
  return prontas.then(() => chavePublica);
}

const hash = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex');

async function inscrever(usuarioId, inscricao, aparelho) {
  const { endpoint, keys } = inscricao || {};
  if (!endpoint || !/^https:\/\//.test(endpoint) || !keys?.p256dh || !keys?.auth) {
    const erro = new Error('Inscrição inválida');
    erro.validacao = true;
    throw erro;
  }
  await db.query(
    `INSERT INTO push_inscricoes (usuario_id, endpoint, endpoint_hash, p256dh, auth, aparelho)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), p256dh = VALUES(p256dh),
                             auth = VALUES(auth), aparelho = VALUES(aparelho)`,
    [usuarioId, endpoint, hash(endpoint), keys.p256dh, keys.auth, aparelho?.slice(0, 255) || null],
  );
}

async function cancelar(endpoint) {
  if (endpoint) await db.query('DELETE FROM push_inscricoes WHERE endpoint_hash = ?', [hash(endpoint)]);
}

async function inscrito(endpoint) {
  if (!endpoint) return false;
  const [[r]] = await db.query('SELECT id FROM push_inscricoes WHERE endpoint_hash = ?', [hash(endpoint)]);
  return !!r;
}

/** Manda para todas as inscrições (ou só as de um usuário). Devolve quantas receberam. */
async function enviar(alerta, { usuarioId = null } = {}) {
  await chaves();
  const [inscricoes] = await db.query(
    `SELECT id, endpoint, p256dh, auth FROM push_inscricoes ${usuarioId ? 'WHERE usuario_id = ?' : ''}`,
    usuarioId ? [usuarioId] : [],
  );
  const corpo = JSON.stringify(alerta);
  let entregues = 0;
  await Promise.all(inscricoes.map(async (i) => {
    try {
      await webpush.sendNotification(
        { endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } },
        corpo,
        { TTL: VALIDADE_S, urgency: 'high' },
      );
      entregues += 1;
    } catch (err) {
      // 404/410: o navegador desfez a inscrição (permissão revogada, app desinstalado).
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.query('DELETE FROM push_inscricoes WHERE id = ?', [i.id]);
      } else {
        console.error(`[alertas] envio falhou (${err.statusCode || err.message})`);
      }
    }
  }));
  return entregues;
}

// ─── Eventos do monitor ──────────────────────────────────────────────────────

const ultimaPausaPedida = new Map(); // impressora_id → ms
const quedas = new Map();            // impressora_id → { timer, avisou }

/** O controller chama antes de mandar "pausar" — para a pausa seguinte não virar alerta. */
function registrarComando(impressoraId, acao) {
  if (acao === 'pausar') ultimaPausaPedida.set(impressoraId, Date.now());
}

const disparar = (alerta) => {
  if (alerta) enviar(alerta).catch((err) => console.error(`[alertas] ${err.message}`));
};

/**
 * @param ctx { anterior, atual, numeroOs } — leituras do monitor antes e depois
 */
function aoEvento(imp, ev, ctx = {}) {
  if (ev.tipo === 'offline') {
    // Só importa se caiu no meio de uma impressão.
    if (!['imprimindo', 'pausada'].includes(ctx.anterior?.estado)) return;
    const timer = setTimeout(() => {
      const q = quedas.get(imp.id);
      if (q) q.avisou = true;
      disparar(alertaOffline(imp, { arquivo: ev.arquivo, numeroOs: ctx.numeroOs, minutos: QUEDA_MINUTOS }));
    }, QUEDA_MINUTOS * 60 * 1000);
    timer.unref?.();
    quedas.set(imp.id, { timer, avisou: false });
    return;
  }

  if (ev.tipo === 'online') {
    const q = quedas.get(imp.id);
    if (!q) return;
    clearTimeout(q.timer);
    quedas.delete(imp.id);
    if (q.avisou) disparar(alertaVoltou(imp));
    return;
  }

  const pedidaEm = ultimaPausaPedida.get(imp.id);
  const pausaPedida = !!pedidaEm && Date.now() - pedidaEm < JANELA_PAUSA_PEDIDA_MS;
  if (ev.tipo === 'pausada') ultimaPausaPedida.delete(imp.id);
  disparar(montarAlerta(imp, ev, { ...ctx, pausaPedida }));
}

module.exports = { chaves, inscrever, cancelar, inscrito, enviar, registrarComando, aoEvento };
