/**
 * Adaptador Bambu Lab (A1, P1S) — MQTT local da impressora, em LAN Mode.
 *
 * Diferente do Moonraker, aqui não se pergunta o estado: a impressora publica. O
 * adaptador mantém uma conexão aberta por impressora, assina `device/{serial}/report`
 * e vai juntando o que chega. A A1 e a P1 mandam só o que mudou (o relatório completo
 * vem quando se pede um `pushall`), então o estado é a soma dos relatórios — por isso
 * o merge em vez de trocar o objeto inteiro.
 *
 * Autenticação: usuário `bblp` e o Access Code que aparece na tela da impressora. O
 * certificado TLS é autoassinado pela própria impressora, então não é verificado —
 * a conexão só existe dentro da rede interna.
 *
 * Controle: desde o "Authorization Control" (firmware de 2025), a impressora só aceita
 * comandos de fora do Bambu Studio/Handy em LAN Only Mode com o Modo Desenvolvedor
 * ligado. Sem isso a leitura e a câmera funcionam, e o comando volta recusado.
 */
const tls = require('tls');
const mqtt = require('mqtt');
const { num, arred, faixa, erroValidacao } = require('./comum');

const PORTA_PADRAO = 8883;
const PORTA_CAMERA = 6000;
const ESPERA_PRIMEIRO_RELATORIO_MS = 6000;
const ESPERA_CONFIRMACAO_MS = 5000;
// A Bambu recomenda não pedir o relatório completo com frequência (a P1 sofre com
// isso). Os deltas bastam; o pushall periódico só corrige algum campo perdido.
const INTERVALO_PUSHALL_MS = 5 * 60 * 1000;

const ESTADO_DO_JOB = {
  RUNNING: 'imprimindo',
  PREPARE: 'imprimindo',
  SLICING: 'imprimindo',
  PAUSE: 'pausada',
  FINISH: 'concluida',
  FAILED: 'erro',
  IDLE: 'ociosa',
};

// Cancelar pela tela, pelo Studio ou no display termina em FAILED com este código
// ("tarefa cancelada") — não é erro de verdade.
const ERRO_CANCELADO = 50348044;

// Etapas do preparo (stg_cur). É o que a impressora está fazendo antes da primeira camada.
const ETAPAS = {
  1: 'Nivelando a mesa',
  2: 'Aquecendo a mesa',
  3: 'Resfriando o bico',
  4: 'Trocando filamento',
  7: 'Aquecendo o bico',
  8: 'Calibrando a extrusão',
  9: 'Escaneando a mesa',
  13: 'Indo para a origem',
  14: 'Limpando o bico',
  16: 'Pausada pelo usuário',
  17: 'Pausada: porta aberta',
  20: 'Pausada: bico entupido?',
  21: 'Pausada: temperatura da mesa',
  22: 'Pausada: filamento acabou',
};

const MODOS_VELOCIDADE = { 1: 'Silencioso', 2: 'Padrão', 3: 'Esporte', 4: 'Ludicrous' };

const hex4 = (n) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
/** Código HMS no formato que a wiki da Bambu usa para buscar: 0300_2000_0001_0001. */
const codigoHms = (h) => `${hex4(h.attr >>> 16)}_${hex4(h.attr)}_${hex4(h.code >>> 16)}_${hex4(h.code)}`;
const codigoErro = (n) => `${hex4(n >>> 16)}_${hex4(n)}`;

const inteiro = (v) => {
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return num(n);
};

/** Junta o relatório novo no acumulado. Objetos se misturam; o resto é substituído. */
function mesclar(base, novo) {
  for (const [k, v] of Object.entries(novo)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      mesclar(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

/**
 * Traduz o `print` acumulado para o formato comum do monitor. Função pura.
 * @param p      objeto `print` dos relatórios
 * @param agora  ms — para o tempo decorrido; o adaptador congela este valor quando o
 *               job acaba, senão a duração de um job concluído continuaria crescendo
 */
function normalizar(p = {}, agora = Date.now()) {
  let estado = ESTADO_DO_JOB[p.gcode_state] || 'ociosa';
  const erro = inteiro(p.print_error) || 0;
  if (p.gcode_state === 'FAILED' && erro === ERRO_CANCELADO) estado = 'cancelada';

  const hms = Array.isArray(p.hms) ? p.hms.filter((h) => h && typeof h.attr === 'number') : [];
  const mensagens = [];
  if (erro && erro !== ERRO_CANCELADO) mensagens.push(`Erro ${codigoErro(erro)}`);
  hms.forEach((h) => mensagens.push(`HMS ${codigoHms(h)}`));

  const arquivo = p.subtask_name || p.gcode_file || null;
  const temJob = ['imprimindo', 'pausada', 'concluida', 'cancelada', 'erro'].includes(estado) && !!arquivo;
  const emAndamento = estado === 'imprimindo' || estado === 'pausada';

  const inicio = inteiro(p.gcode_start_time);
  const decorrido = inicio && inicio > 0 ? Math.max(0, Math.round(agora / 1000 - inicio)) : null;
  const restanteMin = inteiro(p.mc_remaining_time);
  const etapa = ETAPAS[inteiro(p.stg_cur)] || null;
  const ventilador = inteiro(p.cooling_fan_speed); // 0–15
  const luz = Array.isArray(p.lights_report) ? p.lights_report.find((l) => l.node === 'chamber_light') : null;

  return {
    estado,
    mensagem: mensagens.length ? mensagens.join(' · ') : null,
    job: temJob ? {
      arquivo,
      progresso: num(inteiro(p.mc_percent)),
      decorrido_s: decorrido,
      restante_s: emAndamento ? (restanteMin === null ? null : restanteMin * 60) : 0,
      camada: inteiro(p.layer_num),
      camadas: inteiro(p.total_layer_num),
      filamento_mm: null,
      // Imprimindo normal, stg_cur é 0 (fora da tabela); só aparece quando há o que dizer.
      etapa: emAndamento ? etapa : null,
    } : null,
    temperaturas: {
      bico: p.nozzle_temper !== undefined ? { atual: arred(num(p.nozzle_temper)), alvo: arred(num(p.nozzle_target_temper)) } : null,
      mesa: p.bed_temper !== undefined ? { atual: arred(num(p.bed_temper)), alvo: arred(num(p.bed_target_temper)) } : null,
    },
    velocidade_pct: inteiro(p.spd_mag),
    modo_velocidade: inteiro(p.spd_lvl),
    fluxo_pct: null,
    ventilador_pct: ventilador === null ? null : Math.round((ventilador / 15) * 100),
    luz: luz ? luz.mode === 'on' : null,
    controles: Object.keys(COMANDOS),
  };
}

// ─── Conexão ─────────────────────────────────────────────────────────────────

const conexoes = new Map(); // id → conexão
const chaveDe = (imp) => `${imp.host}|${imp.porta || PORTA_PADRAO}|${imp.serial}|${imp.codigo_acesso}`;

function conectar(imp, { temporaria = false } = {}) {
  const con = {
    chave: chaveDe(imp),
    serial: imp.serial,
    print: {},
    info: null,
    recebeu: false,
    conectado: false,
    erro: null,
    seq: 0,
    ultimoPushall: 0,
    congeladoEm: null,
    pendentes: new Map(),
    esperandoRelatorio: [],
  };

  con.cliente = mqtt.connect(`mqtts://${imp.host}:${imp.porta || PORTA_PADRAO}`, {
    username: 'bblp',
    password: imp.codigo_acesso || '',
    clientId: `printech_${Math.random().toString(16).slice(2, 10)}`,
    rejectUnauthorized: false,
    connectTimeout: 5000,
    // Temporária (teste de conexão) não insiste: ou conecta de primeira, ou mostra o erro.
    reconnectPeriod: temporaria ? 0 : 5000,
    protocolVersion: 4,
  });

  con.cliente.on('connect', () => {
    con.conectado = true;
    con.erro = null;
    con.cliente.subscribe(`device/${imp.serial}/report`, () => pushall(con));
  });
  con.cliente.on('close', () => { con.conectado = false; });
  con.cliente.on('error', (err) => {
    con.erro = err;
    // Access Code errado não melhora esperando: quem aguarda o primeiro relatório fica
    // sabendo agora, não depois do timeout.
    if (!con.recebeu) con.esperandoRelatorio.splice(0).forEach((r) => r.falha(err));
  });
  con.cliente.on('message', (_topico, bruto) => {
    let msg;
    try { msg = JSON.parse(bruto.toString()); } catch { return; }
    if (msg.print) {
      mesclar(con.print, msg.print);
      con.recebeu = true;
      con.esperandoRelatorio.splice(0).forEach((r) => r.ok());
    }
    if (msg.info?.command === 'get_version') con.info = msg.info;
    confirmar(con, msg);
  });

  return con;
}

function publicar(con, corpo) {
  con.seq += 1;
  const seq = String(con.seq);
  const [chave] = Object.keys(corpo);
  const mensagem = { [chave]: { sequence_id: seq, ...corpo[chave] } };
  con.cliente.publish(`device/${con.serial}/request`, JSON.stringify(mensagem));
  return seq;
}

function pushall(con) {
  con.ultimoPushall = Date.now();
  publicar(con, { pushing: { command: 'pushall', version: 1, push_target: 1 } });
}

/** A impressora devolve o comando no relatório, com o mesmo sequence_id e o resultado. */
function confirmar(con, msg) {
  for (const parte of Object.values(msg)) {
    const pendente = parte && con.pendentes.get(String(parte.sequence_id));
    if (!pendente || !parte.command) continue;
    con.pendentes.delete(String(parte.sequence_id));
    clearTimeout(pendente.timer);
    const resultado = String(parte.result || 'success').toLowerCase();
    if (resultado === 'success') pendente.resolve({ confirmado: true });
    else pendente.reject(new Error(parte.reason || `A impressora respondeu "${parte.result}"`));
  }
}

const esperarRelatorio = (con, ms) => new Promise((resolve, reject) => {
  if (con.recebeu) return resolve();
  const espera = {
    ok: () => { clearTimeout(timer); resolve(); },
    falha: (err) => { clearTimeout(timer); reject(err); },
  };
  const timer = setTimeout(() => {
    con.esperandoRelatorio = con.esperandoRelatorio.filter((e) => e !== espera);
    reject(con.erro || new Error(con.conectado
      ? 'Conectou, mas a impressora não mandou o estado — o serial está certo?'
      : 'Sem resposta da impressora'));
  }, ms);
  con.esperandoRelatorio.push(espera);
});

function conexaoDe(imp) {
  let con = conexoes.get(imp.id);
  if (con && con.chave !== chaveDe(imp)) {
    con.cliente.end(true);
    con = null;
  }
  if (!con) {
    con = conectar(imp);
    conexoes.set(imp.id, con);
  }
  return con;
}

/** Fecha as conexões de impressoras que saíram do cadastro. O monitor chama ao recarregar. */
function sincronizar(ativas) {
  const ids = new Set(ativas.map((i) => i.id));
  for (const [id, con] of conexoes) {
    if (!ids.has(id)) {
      con.cliente.end(true);
      conexoes.delete(id);
    }
  }
}

async function consultar(imp) {
  const con = conexaoDe(imp);
  if (!con.recebeu) await esperarRelatorio(con, ESPERA_PRIMEIRO_RELATORIO_MS);
  // Conexão caiu depois de já ter lido: o cliente reconecta sozinho, e o monitor segura
  // a última leitura por alguns ciclos antes de dar offline.
  if (!con.conectado) throw con.erro || new Error('Conexão com a impressora caiu');
  if (Date.now() - con.ultimoPushall > INTERVALO_PUSHALL_MS) pushall(con);

  const emAndamento = ['RUNNING', 'PREPARE', 'SLICING', 'PAUSE'].includes(con.print.gcode_state);
  if (emAndamento) con.congeladoEm = null;
  else if (!con.congeladoEm) con.congeladoEm = Date.now();
  return normalizar(con.print, con.congeladoEm || Date.now());
}

/** "Testar conexão": conexão própria e descartável, para não mexer na do monitor. */
async function identificar(imp) {
  const con = conectar(imp, { temporaria: true });
  try {
    await esperarRelatorio(con, ESPERA_PRIMEIRO_RELATORIO_MS);
    publicar(con, { info: { command: 'get_version' } });
    await new Promise((r) => setTimeout(r, 1500));
    const ota = con.info?.module?.find((m) => m.name === 'ota');
    return {
      nome: imp.serial,
      versao: ota ? `firmware ${ota.sw_ver}` : 'firmware ?',
      estado: con.print.gcode_state || '?',
    };
  } finally {
    con.cliente.end(true);
  }
}

// ─── Comandos ────────────────────────────────────────────────────────────────

const gcodeLinha = (linha) => ({ print: { command: 'gcode_line', param: `${linha}\n` } });

const COMANDOS = {
  pausar: () => ({ print: { command: 'pause' } }),
  retomar: () => ({ print: { command: 'resume' } }),
  cancelar: () => ({ print: { command: 'stop' } }),
  modo_velocidade: (v) => ({ print: { command: 'print_speed', param: String(faixa(v, 1, 4, 'O modo de velocidade')) } }),
  luz: (v) => {
    if (!['on', 'off'].includes(v)) throw erroValidacao('A luz deve ser "on" ou "off"');
    return {
      system: {
        command: 'ledctrl', led_node: 'chamber_light', led_mode: v,
        led_on_time: 500, led_off_time: 500, loop_times: 0, interval_time: 0,
      },
    };
  },
  temperatura_bico: (v) => gcodeLinha(`M104 S${faixa(v, 0, 300, 'A temperatura do bico')}`),
  temperatura_mesa: (v) => gcodeLinha(`M140 S${faixa(v, 0, 110, 'A temperatura da mesa')}`),
  // P1 = ventilador da peça, na numeração da Bambu.
  ventilador: (v) => gcodeLinha(`M106 P1 S${Math.round(faixa(v, 0, 100, 'O ventilador') * 2.55)}`),
};

async function comandar(imp, acao, valor) {
  const montar = COMANDOS[acao];
  if (!montar) throw erroValidacao('Comando desconhecido');
  const corpo = montar(valor);
  const con = conexaoDe(imp);
  if (!con.conectado) throw con.erro || new Error('Sem conexão com a impressora');

  const seq = publicar(con, corpo);
  // Nem todo firmware devolve todo comando. Sem resposta em alguns segundos, o comando
  // foi entregue mas não confirmado — a tela avisa em vez de dizer que falhou.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      con.pendentes.delete(seq);
      resolve({ confirmado: false });
    }, ESPERA_CONFIRMACAO_MS);
    con.pendentes.set(seq, { resolve, reject, timer });
  });
}

// ─── Câmera ──────────────────────────────────────────────────────────────────
// A1 e P1 não têm RTSP: a câmera é um socket TLS na porta 6000 que, depois de um
// pacote de login, manda JPEGs soltos (~1 por segundo), cada um com um cabeçalho de
// 16 bytes cujo início é o tamanho do quadro.
//
// A impressora aguenta poucas conexões de câmera ao mesmo tempo. Por isso é uma só
// por impressora, repartida entre todo mundo que estiver olhando; fecha quando o
// último sai.

const cameras = new Map(); // id → { socket, clientes: Set<res>, ultimo, esperando: [] }

function pacoteLogin(codigo) {
  const p = Buffer.alloc(80);
  p.writeUInt32LE(0x40, 0);
  p.writeUInt32LE(0x3000, 4);
  p.write('bblp', 16, 'ascii');
  p.write(String(codigo || '').slice(0, 32), 48, 'ascii');
  return p;
}

/** Separa os JPEGs do fluxo da porta 6000. Função pura: devolve os quadros e o que sobrou. */
function extrairQuadros(buffer) {
  const quadros = [];
  let resto = buffer;
  while (resto.length >= 16) {
    const tamanho = resto.readUInt32LE(0);
    if (tamanho === 0 || tamanho > 5 * 1024 * 1024) return { quadros, resto: Buffer.alloc(0) }; // fluxo corrompido
    if (resto.length < 16 + tamanho) break;
    const jpeg = resto.subarray(16, 16 + tamanho);
    if (jpeg[0] === 0xff && jpeg[1] === 0xd8) quadros.push(Buffer.from(jpeg));
    resto = resto.subarray(16 + tamanho);
  }
  return { quadros, resto };
}

const LIMITE = 'quadro';
const escreverQuadro = (res, jpeg) => {
  res.write(`--${LIMITE}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`);
  res.write(jpeg);
  res.write('\r\n');
};

function fecharCamera(id) {
  const cam = cameras.get(id);
  if (!cam) return;
  cameras.delete(id);
  cam.socket.destroy();
  cam.clientes.forEach((res) => res.end());
  cam.esperando.splice(0).forEach((r) => r(null));
}

function abrirCamera(imp) {
  let cam = cameras.get(imp.id);
  if (cam) return cam;
  cam = { clientes: new Set(), ultimo: null, esperando: [], buffer: Buffer.alloc(0) };
  cam.socket = tls.connect({ host: imp.host, port: PORTA_CAMERA, rejectUnauthorized: false });
  cam.socket.setTimeout(15000, () => fecharCamera(imp.id)); // parou de mandar quadro
  cam.socket.on('secureConnect', () => cam.socket.write(pacoteLogin(imp.codigo_acesso)));
  cam.socket.on('data', (dados) => {
    const { quadros, resto } = extrairQuadros(Buffer.concat([cam.buffer, dados]));
    cam.buffer = resto;
    for (const jpeg of quadros) {
      cam.ultimo = jpeg;
      cam.clientes.forEach((res) => escreverQuadro(res, jpeg));
      cam.esperando.splice(0).forEach((r) => r(jpeg));
    }
  });
  cam.socket.on('error', () => fecharCamera(imp.id));
  cam.socket.on('close', () => fecharCamera(imp.id));
  cameras.set(imp.id, cam);
  return cam;
}

const liberarSeVazia = (id) => {
  const cam = cameras.get(id);
  if (cam && cam.clientes.size === 0 && cam.esperando.length === 0) fecharCamera(id);
};

async function listarCameras() {
  return [{ nome: 'Câmera', stream: 'interno', snapshot: 'interno', girar: 0, espelhar_h: false, espelhar_v: false }];
}

/** Entrega a câmera direto na resposta HTTP (a do Moonraker o controller busca por URL). */
async function transmitir(imp, tipo, req, res) {
  const cam = abrirCamera(imp);

  if (tipo === 'snapshot') {
    const jpeg = cam.ultimo || await new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 10000);
      cam.esperando.push((q) => { clearTimeout(timer); resolve(q); });
    });
    liberarSeVazia(imp.id);
    if (!jpeg) return res.status(502).end();
    return res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' }).send(jpeg);
  }

  res.status(200).set({
    'Content-Type': `multipart/x-mixed-replace; boundary=${LIMITE}`,
    'Cache-Control': 'no-store',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  if (cam.ultimo) escreverQuadro(res, cam.ultimo);
  cam.clientes.add(res);
  res.on('close', () => {
    cam.clientes.delete(res);
    liberarSeVazia(imp.id);
  });
}

module.exports = {
  PORTA_PADRAO,
  ACOES: Object.keys(COMANDOS),
  MODOS_VELOCIDADE,
  normalizar,
  mesclar,
  extrairQuadros,
  pacoteLogin,
  consultar,
  identificar,
  comandar,
  sincronizar,
  cameras: listarCameras,
  transmitir,
};
