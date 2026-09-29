/**
 * Monitor das impressoras: lê todas de tempos em tempos e guarda o último estado em
 * memória. A tela pede o estado ao backend, e nunca fala direto com a impressora — ela
 * está na rede interna, e quem olha de fora só enxerga o servidor.
 *
 * Roda dentro do próprio processo do backend (o servidor está na mesma rede das
 * impressoras). Se um dia precisar sair daqui para outra máquina, é este arquivo que
 * muda: a tela e as rotas só conhecem `estadoDe`, `lista` e `adaptadorDe`.
 */
const db = require('../db');
const { eventosDaTransicao } = require('./eventos');
const impressoes = require('./impressoes');
const moonraker = require('./moonraker');
const bambu = require('./bambu');
const flashforge = require('./flashforge');

const ADAPTADORES = { moonraker, bambu, flashforge };

const INTERVALO_MS = 3000;
// Uma leitura perdida não é impressora desligada: Wi-Fi oscila, o Klipper às vezes
// demora. Só marca offline depois de algumas falhas seguidas (~9 s).
const FALHAS_PARA_OFFLINE = 3;

let impressoras = [];
const estados = new Map();   // id → última leitura normalizada
const falhas = new Map();    // id → falhas seguidas
const lendo = new Set();     // id em leitura — evita empilhar se a impressora demorar
let timer = null;

const adaptadorDe = (imp) => ADAPTADORES[imp.protocolo] || null;

/** O `fetch` do Node falha com "fetch failed" e esconde o motivo em `cause`. */
function motivoFalha(err) {
  const codigo = err.cause?.code;
  if (err.name === 'TimeoutError' || codigo === 'ETIMEDOUT' || codigo === 'UND_ERR_CONNECT_TIMEOUT') {
    return 'Sem resposta da impressora';
  }
  // O cliente MQTT (Bambu) põe o código direto no erro, não em `cause`.
  const rede = codigo || err.code;
  if (rede === 'ECONNREFUSED') return 'Conexão recusada — a impressora aceita conexões nessa porta?';
  if (rede === 'EHOSTUNREACH' || rede === 'ENETUNREACH') return 'Impressora fora de alcance na rede';
  if (err.status === 401 || err.status === 403) return 'Acesso negado — confira a API key ou o trusted_clients';
  // Recusa do MQTT: 4 = usuário/senha, 5 = não autorizado. Na Bambu, é o Access Code
  // (ele muda quando o LAN Mode é desligado e religado).
  if (err.code === 4 || err.code === 5 || /not authorized|bad user ?name or password/i.test(err.message)) {
    return 'Access Code recusado — confira na tela da impressora';
  }
  return err.message;
}

async function recarregar() {
  const [rows] = await db.query('SELECT * FROM impressoras WHERE ativo = 1 ORDER BY ordem, nome');
  // Quem saiu do cadastro sai também da memória. Quem trocou de protocolo também: a
  // leitura antiga era de outro adaptador.
  const antigos = new Map(impressoras.map((i) => [i.id, i.protocolo]));
  const atuais = new Map(rows.map((i) => [i.id, i.protocolo]));
  impressoras = rows;
  // Adaptador com conexão aberta (Bambu) fecha a de quem saiu do cadastro.
  for (const [nome, adaptador] of Object.entries(ADAPTADORES)) {
    adaptador.sincronizar?.(rows.filter((i) => i.protocolo === nome));
  }
  for (const id of estados.keys()) {
    if (!atuais.has(id) || atuais.get(id) !== antigos.get(id)) estados.delete(id);
  }
}

async function registrarEvento(impressoraId, ev, usuarioId = null) {
  try {
    await db.query(
      `INSERT INTO impressora_eventos (impressora_id, tipo, arquivo, detalhe, duracao_s, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [impressoraId, ev.tipo, ev.arquivo?.slice(0, 255) || null, ev.detalhe?.slice(0, 500) || null,
        ev.duracao_s ?? null, usuarioId],
    );
  } catch (err) {
    // Falha no histórico não pode derrubar o monitor.
    console.error(`[impressoras] erro ao gravar evento: ${err.message}`);
  }
}

async function ler(imp) {
  const adaptador = adaptadorDe(imp);
  if (!adaptador) {
    // Cadastrada, mas sem adaptador ainda (Bambu, Flashforge): a tela mostra isso em vez
    // de ficar em "conectando" para sempre.
    estados.set(imp.id, { estado: 'sem_suporte', mensagem: null, job: null, temperaturas: {} });
    return;
  }
  if (lendo.has(imp.id)) return;
  lendo.add(imp.id);
  try {
    const anterior = estados.get(imp.id) || null;
    let atual;
    try {
      atual = await adaptador.consultar(imp);
      falhas.set(imp.id, 0);
    } catch (err) {
      const n = (falhas.get(imp.id) || 0) + 1;
      falhas.set(imp.id, n);
      if (n < FALHAS_PARA_OFFLINE && anterior) return; // segura a leitura anterior até ter certeza
      atual = { estado: 'offline', mensagem: motivoFalha(err), job: null, temperaturas: {} };
    }

    atual.atualizado_em = new Date().toISOString();
    // A impressora pode ter sido removida enquanto a leitura estava no ar.
    if (!impressoras.some((i) => i.id === imp.id)) return;
    estados.set(imp.id, atual);
    for (const ev of eventosDaTransicao(anterior, atual)) await registrarEvento(imp.id, ev);
    // A impressão como registro (e o vínculo com a OS) segue a mesma leitura.
    await impressoes.sincronizar(imp, atual);
  } finally {
    lendo.delete(imp.id);
  }
}

const lerTodas = () => Promise.all(impressoras.map(ler));

async function iniciar() {
  if (timer) return;
  try {
    await recarregar();
    await impressoes.carregar();
  } catch (err) {
    // Banco sem a migração ainda, por exemplo. O resto do sistema sobe normalmente.
    console.error(`[impressoras] monitor não iniciou: ${err.message}`);
    return;
  }
  console.log(`🖨️  Monitor de impressoras: ${impressoras.length} impressora(s)`);
  lerTodas();
  timer = setInterval(lerTodas, INTERVALO_MS);
}

function parar() {
  clearInterval(timer);
  timer = null;
}

module.exports = {
  iniciar,
  parar,
  recarregar,
  registrarEvento,
  adaptadorDe,
  motivoFalha,
  estadoDe: (id) => estados.get(id) || null,
  lista: () => impressoras,
  buscar: (id) => impressoras.find((i) => i.id === Number(id)) || null,
  /** Força uma leitura agora — depois de um comando, a tela quer ver o efeito já. */
  lerAgora: (id) => {
    const imp = impressoras.find((i) => i.id === Number(id));
    return imp ? ler(imp) : Promise.resolve();
  },
};
