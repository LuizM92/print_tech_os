const test = require('node:test');
const assert = require('node:assert');
const { normalizar, tempoRestante } = require('./moonraker');

const imprimindo = {
  webhooks: { state: 'ready', state_message: 'Printer is ready' },
  print_stats: {
    state: 'printing', filename: 'suporte_PLA_2h.gcode', print_duration: 1800,
    filament_used: 1234.5, message: '', info: { current_layer: 40, total_layer: 200 },
  },
  display_status: { progress: 0.25 },
  virtual_sdcard: { progress: 0.24 },
  extruder: { temperature: 219.87, target: 220 },
  heater_bed: { temperature: 59.9, target: 60 },
  gcode_move: { speed_factor: 1.2, extrude_factor: 1 },
  fan: { speed: 0.5 },
};

test('imprimindo: job, temperaturas e ajustes no formato comum', () => {
  const s = normalizar(imprimindo, { estimated_time: 7200 });
  assert.strictEqual(s.estado, 'imprimindo');
  assert.strictEqual(s.job.arquivo, 'suporte_PLA_2h.gcode');
  assert.strictEqual(s.job.progresso, 25);
  assert.strictEqual(s.job.camada, 40);
  assert.strictEqual(s.job.camadas, 200);
  assert.strictEqual(s.job.restante_s, 5400); // 1800 / 0,25 − 1800
  assert.deepStrictEqual(s.temperaturas.bico, { atual: 219.9, alvo: 220 });
  assert.strictEqual(s.velocidade_pct, 120);
  assert.strictEqual(s.ventilador_pct, 50);
});

test('sem M73 no G-code, o progresso vem do arquivo', () => {
  const s = normalizar({ ...imprimindo, display_status: {} });
  assert.strictEqual(s.job.progresso, 24);
});

test('Klipper em shutdown vence o "printing" que sobrou no print_stats', () => {
  const s = normalizar({
    ...imprimindo,
    webhooks: { state: 'shutdown', state_message: 'MCU \'mcu\' shutdown: Timer too close' },
  });
  assert.strictEqual(s.estado, 'erro');
  assert.match(s.mensagem, /Timer too close/);
});

test('ociosa não carrega job, mesmo com arquivo antigo no print_stats', () => {
  const s = normalizar({ ...imprimindo, print_stats: { state: 'standby', filename: 'velho.gcode' } });
  assert.strictEqual(s.estado, 'ociosa');
  assert.strictEqual(s.job, null);
});

test('camadas caem para o metadado quando o fatiador não manda SET_PRINT_STATS_INFO', () => {
  const s = normalizar(
    { ...imprimindo, print_stats: { ...imprimindo.print_stats, info: {} } },
    { layer_count: 150 },
  );
  assert.strictEqual(s.job.camada, null);
  assert.strictEqual(s.job.camadas, 150);
});

test('concluída zera o restante', () => {
  const s = normalizar({ ...imprimindo, print_stats: { ...imprimindo.print_stats, state: 'complete' } });
  assert.strictEqual(s.estado, 'concluida');
  assert.strictEqual(s.job.restante_s, 0);
});

test('no começo do job vale a estimativa do fatiador; depois de 10%, a proporção', () => {
  assert.strictEqual(tempoRestante(300, 0.02, 7200), 6900);
  assert.strictEqual(tempoRestante(1000, 0.5, 7200), 1000);
  assert.strictEqual(tempoRestante(10, 0.005, null), null); // sem base para estimar
});

test('leitura vazia não quebra', () => {
  const s = normalizar();
  assert.strictEqual(s.estado, 'ociosa');
  assert.strictEqual(s.temperaturas.bico, null);
});
