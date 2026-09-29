/**
 * Adaptador Moonraker — a API do Klipper. Atende as Creality K1 (com root) e a Elegoo
 * Neptune 4 Max.
 *
 * Todo adaptador devolve o mesmo formato (ver `normalizar`), para a tela não precisar
 * saber de que marca é a impressora. Quando entrar Bambu e Flashforge, cada uma ganha
 * o seu arquivo aqui do lado com as mesmas funções: consultar, comandar, cameras.
 *
 * Referência: https://moonraker.readthedocs.io/en/latest/web_api/
 */

const { num, arred, faixa, erroValidacao } = require('./comum');

const PORTA_PADRAO = 7125;
const TIMEOUT_MS = 4000;

// O que a tela mostra. `webhooks` diz se o Klipper está de pé; `print_stats` diz o job.
const OBJETOS = [
  'webhooks', 'print_stats', 'display_status', 'virtual_sdcard',
  'extruder', 'heater_bed', 'gcode_move', 'fan',
];

const ESTADO_DO_JOB = {
  printing: 'imprimindo',
  paused: 'pausada',
  complete: 'concluida',
  cancelled: 'cancelada',
  error: 'erro',
  standby: 'ociosa',
};

const baseUrl = (imp) => `http://${imp.host}:${imp.porta || PORTA_PADRAO}`;

async function chamar(imp, caminho, { metodo = 'GET', timeout = TIMEOUT_MS } = {}) {
  const headers = imp.api_key ? { 'X-Api-Key': imp.api_key } : {};
  const res = await fetch(`${baseUrl(imp)}${caminho}`, {
    method: metodo, headers, signal: AbortSignal.timeout(timeout),
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) {
    // O Moonraker devolve { error: { message } } — é essa mensagem que o operador precisa
    // ver ("Klippy not connected", "Print is not paused"...), não o status HTTP.
    const erro = new Error(corpo?.error?.message || `HTTP ${res.status}`);
    erro.status = res.status;
    throw erro;
  }
  return corpo.result;
}

const temp = (h) => (h ? { atual: arred(num(h.temperature)), alvo: arred(num(h.target)) } : null);

/**
 * Tempo que falta, em segundos.
 *
 * No começo do job a estimativa do fatiador é melhor: o progresso ainda está perto de
 * zero e a conta por proporção explode (aquecimento e nivelamento contam tempo sem
 * avançar o arquivo). Passados 10%, a proporção já reflete a velocidade real da máquina.
 */
function tempoRestante(decorrido, progresso, estimadoFatiador) {
  if (decorrido === null || progresso === null) return null;
  if (progresso >= 0.1 || !estimadoFatiador) {
    if (progresso <= 0.01) return null;
    return Math.max(0, Math.round(decorrido / progresso - decorrido));
  }
  return Math.max(0, Math.round(estimadoFatiador - decorrido));
}

/**
 * Traduz o `status` do Moonraker para o formato comum do monitor.
 * Função pura: é ela que os testes exercitam.
 */
function normalizar(status = {}, metadados = {}) {
  const webhooks = status.webhooks || {};
  const job = status.print_stats || {};

  let estado = ESTADO_DO_JOB[job.state] || 'ociosa';
  let mensagem = job.message || null;

  // Klipper fora do ar vence o estado do job: um "printing" velho não significa nada
  // se o firmware desligou.
  if (webhooks.state === 'startup') estado = 'iniciando';
  if (webhooks.state === 'shutdown' || webhooks.state === 'error') {
    estado = 'erro';
    mensagem = webhooks.state_message || mensagem;
  }

  const temJob = ['imprimindo', 'pausada', 'concluida', 'cancelada', 'erro'].includes(estado)
    && !!job.filename;

  const progresso = num(status.display_status?.progress) ?? num(status.virtual_sdcard?.progress);
  const decorrido = num(job.print_duration);
  const info = job.info || {};

  return {
    estado,
    mensagem: mensagem || null,
    job: temJob ? {
      arquivo: job.filename,
      progresso: progresso === null ? null : arred(progresso * 100),
      decorrido_s: decorrido === null ? null : Math.round(decorrido),
      restante_s: estado === 'imprimindo' || estado === 'pausada'
        ? tempoRestante(decorrido, progresso, num(metadados.estimated_time))
        : 0,
      camada: num(info.current_layer),
      camadas: num(info.total_layer) ?? num(metadados.layer_count),
      filamento_mm: num(job.filament_used) === null ? null : Math.round(job.filament_used),
    } : null,
    temperaturas: {
      bico: temp(status.extruder),
      mesa: temp(status.heater_bed),
    },
    velocidade_pct: num(status.gcode_move?.speed_factor) === null
      ? null : Math.round(status.gcode_move.speed_factor * 100),
    fluxo_pct: num(status.gcode_move?.extrude_factor) === null
      ? null : Math.round(status.gcode_move.extrude_factor * 100),
    ventilador_pct: num(status.fan?.speed) === null ? null : Math.round(status.fan.speed * 100),
    // O que a janela de controles oferece. Cada adaptador diz o seu: a Bambu, por
    // exemplo, tem modo de velocidade em vez de percentual, e não tem fluxo.
    controles: Object.keys(COMANDOS),
  };
}

// O metadado do arquivo (estimativa do fatiador, nº de camadas) não muda durante o job:
// busca uma vez por arquivo e guarda.
const cacheMetadados = new Map();

async function metadadosDoArquivo(imp, arquivo) {
  const chave = `${imp.id}:${arquivo}`;
  if (cacheMetadados.has(chave)) return cacheMetadados.get(chave);
  let meta = {};
  try {
    meta = await chamar(imp, `/server/files/metadata?filename=${encodeURIComponent(arquivo)}`);
  } catch {
    // Arquivo sem metadado (enviado por outro caminho) não impede o resto da leitura.
  }
  if (cacheMetadados.size > 200) cacheMetadados.clear();
  cacheMetadados.set(chave, meta);
  return meta;
}

async function consultar(imp) {
  let status;
  try {
    const r = await chamar(imp, `/printer/objects/query?${OBJETOS.join('&')}`);
    status = r.status;
  } catch (err) {
    // Moonraker respondeu mas o Klipper não: a impressora está ligada, com problema.
    if (err.status) {
      const info = await chamar(imp, '/server/info').catch(() => null);
      if (info) {
        const estado = info.klippy_state === 'startup' ? 'iniciando' : 'erro';
        return { ...normalizar(), estado, mensagem: err.message };
      }
    }
    throw err;
  }
  const arquivo = status.print_stats?.filename;
  const meta = arquivo ? await metadadosDoArquivo(imp, arquivo) : {};
  return normalizar(status, meta);
}

/** Dados básicos, para o botão "Testar conexão" do cadastro. */
async function identificar(imp) {
  const info = await chamar(imp, '/printer/info');
  return { nome: info.hostname, versao: `Klipper ${info.software_version}`, estado: info.state };
}

// ─── Comandos ────────────────────────────────────────────────────────────────
// Lista fechada: a tela não manda G-code livre. Cada ação valida o próprio valor.

const gcode = (imp, script) =>
  chamar(imp, `/printer/gcode/script?script=${encodeURIComponent(script)}`, { metodo: 'POST', timeout: 10000 });

const COMANDOS = {
  pausar: (imp) => chamar(imp, '/printer/print/pause', { metodo: 'POST' }),
  retomar: (imp) => chamar(imp, '/printer/print/resume', { metodo: 'POST' }),
  cancelar: (imp) => chamar(imp, '/printer/print/cancel', { metodo: 'POST' }),
  emergencia: (imp) => chamar(imp, '/printer/emergency_stop', { metodo: 'POST' }),
  reiniciar_firmware: (imp) => chamar(imp, '/printer/firmware_restart', { metodo: 'POST' }),
  temperatura_bico: (imp, v) =>
    gcode(imp, `SET_HEATER_TEMPERATURE HEATER=extruder TARGET=${faixa(v, 0, 350, 'A temperatura do bico')}`),
  temperatura_mesa: (imp, v) =>
    gcode(imp, `SET_HEATER_TEMPERATURE HEATER=heater_bed TARGET=${faixa(v, 0, 120, 'A temperatura da mesa')}`),
  velocidade: (imp, v) => gcode(imp, `M220 S${faixa(v, 10, 300, 'A velocidade')}`),
  fluxo: (imp, v) => gcode(imp, `M221 S${faixa(v, 50, 150, 'O fluxo')}`),
  ventilador: (imp, v) => gcode(imp, `M106 S${Math.round(faixa(v, 0, 100, 'O ventilador') * 2.55)}`),
};

async function comandar(imp, acao, valor) {
  const executar = COMANDOS[acao];
  if (!executar) throw erroValidacao('Comando desconhecido');
  await executar(imp, valor);
}

// ─── Câmera ──────────────────────────────────────────────────────────────────

/** URL relativa do Moonraker ("/webcam/?action=stream") vale no servidor web da impressora. */
const resolver = (imp, url) => {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  return `http://${imp.host}${url.startsWith('/') ? '' : '/'}${url}`;
};

async function cameras(imp) {
  if (imp.url_camera) {
    return [{ nome: 'Câmera', stream: imp.url_camera, snapshot: null, girar: 0, espelhar_h: false, espelhar_v: false }];
  }
  const r = await chamar(imp, '/server/webcams/list');
  return (r.webcams || [])
    .filter((w) => w.enabled !== false)
    .map((w) => ({
      nome: w.name,
      stream: resolver(imp, w.stream_url),
      snapshot: resolver(imp, w.snapshot_url),
      girar: w.rotation || 0,
      espelhar_h: !!w.flip_horizontal,
      espelhar_v: !!w.flip_vertical,
    }));
}

module.exports = {
  PORTA_PADRAO,
  ACOES: Object.keys(COMANDOS),
  normalizar,
  tempoRestante,
  consultar,
  identificar,
  comandar,
  cameras,
};
