/**
 * Adaptador Flashforge (AD5X, e a família Adventurer 5M) — API HTTP de fábrica, porta 8898.
 *
 * Toda chamada leva o serial e o "check code", o código que a impressora mostra quando
 * o modo LAN é ligado. O estado sai de POST /detail; os comandos vão por POST /control.
 * É a mesma API que o Flashforge Orca usa na rede local.
 *
 * Esta API não expõe temperatura como comando (só leitura) — por isso a janela de
 * controles da Flashforge não oferece bico e mesa.
 */
const { num, arred, faixa, erroValidacao } = require('./comum');

const PORTA_PADRAO = 8898;
const TIMEOUT_MS = 4000;

const ESTADOS = {
  ready: 'ociosa',
  busy: 'ociosa',
  calibrate_doing: 'ociosa',
  heating: 'imprimindo',
  printing: 'imprimindo',
  pausing: 'pausada',
  paused: 'pausada',
  cancel: 'cancelada',
  completed: 'concluida',
  error: 'erro',
};

const ETAPAS = {
  heating: 'Aquecendo',
  pausing: 'Pausando…',
  busy: 'Ocupada',
  calibrate_doing: 'Calibrando',
};

/**
 * A API quer o serial com o prefixo "SN" (SNMQQE9411305), mas a tela e a etiqueta da
 * impressora mostram sem ele — e é assim que as pessoas digitam no cadastro. Sem o
 * prefixo, a impressora recusa com "SN is different".
 */
const serialDaApi = (serial) => {
  const s = String(serial || '').trim();
  return /^sn/i.test(s) ? `SN${s.slice(2)}` : `SN${s}`;
};

async function chamar(imp, caminho, extra = {}) {
  const res = await fetch(`http://${imp.host}:${imp.porta || PORTA_PADRAO}${caminho}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ serialNumber: serialDaApi(imp.serial), checkCode: imp.codigo_acesso, ...extra }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const corpo = await res.json().catch(() => null);
  if (!res.ok || !corpo) {
    const erro = new Error(`HTTP ${res.status}`);
    erro.status = res.status;
    throw erro;
  }
  // A API responde 200 mesmo recusando; o que vale é `code` (0 = ok).
  if (corpo.code !== 0) {
    throw new Error(`${corpo.message || `código ${corpo.code}`} — confira o serial e o código do modo LAN`);
  }
  return corpo;
}

/**
 * Tempo que falta. No começo vale a estimativa da impressora; passados 5% do arquivo,
 * a proporção pelo tempo decorrido já reflete a velocidade real.
 */
function tempoRestante(decorrido, progresso, estimado) {
  if (progresso !== null && decorrido !== null && progresso >= 0.05) {
    return Math.max(0, Math.round(decorrido / progresso - decorrido));
  }
  return estimado === null ? null : Math.max(0, Math.round(estimado));
}

/** Traduz o `detail` da Flashforge para o formato comum do monitor. Função pura. */
function normalizar(d = {}) {
  const estado = ESTADOS[d.status] || 'ociosa';
  const emAndamento = estado === 'imprimindo' || estado === 'pausada';
  const arquivo = d.printFileName || null;
  const temJob = ['imprimindo', 'pausada', 'concluida', 'cancelada', 'erro'].includes(estado) && !!arquivo;

  const progresso = num(d.printProgress);
  const decorrido = num(d.printDuration);
  const erro = d.errorCode && String(d.errorCode) !== '0' ? String(d.errorCode) : null;
  // Bico: a Adventurer 5M/AD5X usa o lado "right" (herança das de bico duplo).
  const bico = num(d.rightTemp) !== null ? d.rightTemp : d.leftTemp;
  const alvoBico = num(d.rightTargetTemp) !== null ? d.rightTargetTemp : d.leftTargetTemp;

  return {
    estado,
    mensagem: erro ? `Erro ${erro}` : null,
    job: temJob ? {
      arquivo,
      progresso: progresso === null ? null : arred(progresso * 100),
      decorrido_s: decorrido === null ? null : Math.round(decorrido),
      restante_s: emAndamento ? tempoRestante(decorrido, progresso, num(d.estimatedTime)) : 0,
      camada: num(d.printLayer),
      camadas: num(d.targetPrintLayer),
      filamento_mm: null,
      etapa: emAndamento ? ETAPAS[d.status] || null : null,
    } : null,
    temperaturas: {
      bico: num(bico) !== null ? { atual: arred(bico), alvo: arred(num(alvoBico)) } : null,
      mesa: num(d.platTemp) !== null ? { atual: arred(d.platTemp), alvo: arred(num(d.platTargetTemp)) } : null,
    },
    velocidade_pct: num(d.printSpeedAdjust),
    fluxo_pct: null,
    ventilador_pct: num(d.coolingFanSpeed),
    luz: d.lightStatus === 'open' ? true : d.lightStatus === 'close' ? false : null,
    controles: Object.keys(COMANDOS),
  };
}

const detalhe = async (imp) => (await chamar(imp, '/detail')).detail || {};

const consultar = async (imp) => normalizar(await detalhe(imp));

async function identificar(imp) {
  const d = await detalhe(imp);
  return {
    nome: d.name || imp.serial,
    versao: d.firmwareVersion ? `firmware ${d.firmwareVersion}` : 'firmware ?',
    estado: d.status || '?',
  };
}

// ─── Comandos ────────────────────────────────────────────────────────────────

const controlar = (imp, cmd, args) => chamar(imp, '/control', { payload: { cmd, args } });
const trabalho = (acao) => (imp) => controlar(imp, 'jobCtl_cmd', { jobID: '', action: acao });

/**
 * Velocidade e ventilador vão juntos num comando só, que leva todos os ajustes de uma
 * vez. Para mudar um, os outros seguem com o valor que a impressora está usando agora.
 */
async function ajustar(imp, mudanca) {
  const d = await detalhe(imp);
  return controlar(imp, 'printerCtl_cmd', {
    zAxisCompensation: num(d.zAxisCompensation) ?? 0,
    speed: num(d.printSpeedAdjust) ?? 100,
    chamberFan: num(d.chamberFanSpeed) ?? 100,
    coolingFan: num(d.coolingFanSpeed) ?? 100,
    coolingLeftFan: num(d.coolingLeftFanSpeed) ?? 0,
    ...mudanca,
  });
}

const COMANDOS = {
  pausar: trabalho('pause'),
  retomar: trabalho('continue'),
  cancelar: trabalho('cancel'),
  luz: (imp, v) => {
    if (!['on', 'off'].includes(v)) throw erroValidacao('A luz deve ser "on" ou "off"');
    return controlar(imp, 'lightControl_cmd', { status: v === 'on' ? 'open' : 'close' });
  },
  velocidade: (imp, v) => ajustar(imp, { speed: faixa(v, 10, 300, 'A velocidade') }),
  ventilador: (imp, v) => ajustar(imp, { coolingFan: faixa(v, 0, 100, 'O ventilador') }),
};

async function comandar(imp, acao, valor) {
  const executar = COMANDOS[acao];
  if (!executar) throw erroValidacao('Comando desconhecido');
  await executar(imp, valor);
}

// ─── Câmera ──────────────────────────────────────────────────────────────────
// Quando tem câmera, a própria impressora informa a URL do MJPEG no /detail.

async function cameras(imp) {
  const d = await detalhe(imp);
  if (!d.cameraStreamUrl) return [];
  return [{ nome: 'Câmera', stream: d.cameraStreamUrl, snapshot: null, girar: 0, espelhar_h: false, espelhar_v: false }];
}

module.exports = {
  PORTA_PADRAO,
  serialDaApi,
  ACOES: Object.keys(COMANDOS),
  normalizar,
  tempoRestante,
  consultar,
  identificar,
  comandar,
  cameras,
};
