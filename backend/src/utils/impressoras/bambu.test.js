const test = require('node:test');
const assert = require('node:assert');
const { normalizar, mesclar, extrairQuadros, pacoteLogin } = require('./bambu');

// Relatório como a P1S manda num pushall, cortado ao que o monitor usa.
const imprimindo = {
  gcode_state: 'RUNNING',
  subtask_name: 'suporte_PETG',
  gcode_file: '/data/Metadata/plate_1.gcode',
  mc_percent: 42,
  mc_remaining_time: 95,
  gcode_start_time: '1790000000',
  layer_num: 120,
  total_layer_num: 300,
  nozzle_temper: 249.8,
  nozzle_target_temper: 250,
  bed_temper: 80.1,
  bed_target_temper: 80,
  spd_lvl: 2,
  spd_mag: 100,
  cooling_fan_speed: '15',
  stg_cur: 0,
  print_error: 0,
  hms: [],
  lights_report: [{ node: 'chamber_light', mode: 'on' }],
};

test('imprimindo: job e temperaturas no formato comum', () => {
  const s = normalizar(imprimindo, (1790000000 + 3600) * 1000);
  assert.strictEqual(s.estado, 'imprimindo');
  assert.strictEqual(s.job.arquivo, 'suporte_PETG'); // nome da tarefa, não o caminho interno
  assert.strictEqual(s.job.progresso, 42);
  assert.strictEqual(s.job.restante_s, 95 * 60);
  assert.strictEqual(s.job.decorrido_s, 3600);
  assert.strictEqual(s.job.camada, 120);
  assert.strictEqual(s.job.etapa, null);
  assert.deepStrictEqual(s.temperaturas.bico, { atual: 249.8, alvo: 250 });
  assert.strictEqual(s.ventilador_pct, 100);
  assert.strictEqual(s.modo_velocidade, 2);
  assert.strictEqual(s.luz, true);
  assert.strictEqual(s.mensagem, null);
});

test('preparando mostra a etapa (nivelamento, aquecimento...)', () => {
  const s = normalizar({ ...imprimindo, gcode_state: 'PREPARE', stg_cur: 1 });
  assert.strictEqual(s.estado, 'imprimindo');
  assert.strictEqual(s.job.etapa, 'Nivelando a mesa');
});

test('cancelar termina em FAILED, mas é cancelada — não erro', () => {
  const s = normalizar({ ...imprimindo, gcode_state: 'FAILED', print_error: 50348044 });
  assert.strictEqual(s.estado, 'cancelada');
  assert.strictEqual(s.mensagem, null);
});

test('falha de verdade vira erro com o código no formato da wiki', () => {
  const s = normalizar({ ...imprimindo, gcode_state: 'FAILED', print_error: 0x0300800a });
  assert.strictEqual(s.estado, 'erro');
  assert.strictEqual(s.mensagem, 'Erro 0300_800A');
});

test('pausa por filamento traz a etapa e o HMS', () => {
  const s = normalizar({
    ...imprimindo, gcode_state: 'PAUSE', stg_cur: 22, hms: [{ attr: 0x07008011, code: 0x00020002 }],
  });
  assert.strictEqual(s.estado, 'pausada');
  assert.strictEqual(s.job.etapa, 'Pausada: filamento acabou');
  assert.strictEqual(s.mensagem, 'HMS 0700_8011_0002_0002');
});

test('ociosa não carrega job', () => {
  const s = normalizar({ ...imprimindo, gcode_state: 'IDLE' });
  assert.strictEqual(s.estado, 'ociosa');
  assert.strictEqual(s.job, null);
});

test('os deltas da A1/P1 se somam ao estado, sem apagar o que não veio', () => {
  const estado = mesclar({}, { gcode_state: 'RUNNING', mc_percent: 10, nozzle_temper: 220, ams: { tray_now: '1' } });
  mesclar(estado, { mc_percent: 11, ams: { ams_exist_bits: '1' } });
  assert.strictEqual(estado.mc_percent, 11);
  assert.strictEqual(estado.nozzle_temper, 220);
  assert.deepStrictEqual(estado.ams, { tray_now: '1', ams_exist_bits: '1' });
});

test('listas são substituídas, não somadas (HMS que sumiu tem que sumir)', () => {
  const estado = mesclar({}, { hms: [{ attr: 1, code: 2 }] });
  mesclar(estado, { hms: [] });
  assert.deepStrictEqual(estado.hms, []);
});

// ─── Câmera ──────────────────────────────────────────────────────────────────

const quadro = (jpeg) => {
  const cab = Buffer.alloc(16);
  cab.writeUInt32LE(jpeg.length, 0);
  return Buffer.concat([cab, jpeg]);
};
const JPEG_A = Buffer.from([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9]);
const JPEG_B = Buffer.from([0xff, 0xd8, 9, 9, 0xff, 0xd9]);

test('separa os JPEGs e guarda o pedaço incompleto para o próximo pacote', () => {
  const fluxo = Buffer.concat([quadro(JPEG_A), quadro(JPEG_B)]);
  const corte = fluxo.length - 3;
  const primeiro = extrairQuadros(fluxo.subarray(0, corte));
  assert.strictEqual(primeiro.quadros.length, 1);
  assert.deepStrictEqual(primeiro.quadros[0], JPEG_A);
  const segundo = extrairQuadros(Buffer.concat([primeiro.resto, fluxo.subarray(corte)]));
  assert.deepStrictEqual(segundo.quadros, [JPEG_B]);
  assert.strictEqual(segundo.resto.length, 0);
});

test('o pacote de login leva usuário e Access Code nas posições fixas', () => {
  const p = pacoteLogin('12345678');
  assert.strictEqual(p.length, 80);
  assert.strictEqual(p.readUInt32LE(0), 0x40);
  assert.strictEqual(p.readUInt32LE(4), 0x3000);
  assert.strictEqual(p.toString('ascii', 16, 20), 'bblp');
  assert.strictEqual(p.toString('ascii', 48, 56), '12345678');
});
