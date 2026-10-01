const test = require('node:test');
const assert = require('node:assert');
const { normalizar, tempoRestante, serialDaApi } = require('./flashforge');

test('serial vai para a API com o prefixo SN, como a impressora espera', () => {
  assert.strictEqual(serialDaApi('MQQE9411305'), 'SNMQQE9411305'); // como aparece na tela
  assert.strictEqual(serialDaApi('SNMQQE9411305'), 'SNMQQE9411305'); // já completo
  assert.strictEqual(serialDaApi(' snMQQE9411305 '), 'SNMQQE9411305');
});

// `detail` como a AD5X responde, cortado ao que o monitor usa.
const imprimindo = {
  status: 'printing',
  printFileName: 'engrenagem_PLA.gx',
  printProgress: 0.25,
  printDuration: 1800,
  estimatedTime: 7000,
  printLayer: 50,
  targetPrintLayer: 200,
  rightTemp: 219.6,
  rightTargetTemp: 220,
  platTemp: 55.2,
  platTargetTemp: 55,
  printSpeedAdjust: 100,
  coolingFanSpeed: 100,
  lightStatus: 'open',
  errorCode: '',
  cameraStreamUrl: 'http://192.168.3.60:8080/?action=stream',
};

test('imprimindo: job e temperaturas no formato comum', () => {
  const s = normalizar(imprimindo);
  assert.strictEqual(s.estado, 'imprimindo');
  assert.strictEqual(s.job.arquivo, 'engrenagem_PLA.gx');
  assert.strictEqual(s.job.progresso, 25); // a API manda de 0 a 1
  assert.strictEqual(s.job.restante_s, 5400);
  assert.strictEqual(s.job.camada, 50);
  assert.deepStrictEqual(s.temperaturas.bico, { atual: 219.6, alvo: 220 });
  assert.strictEqual(s.luz, true);
  assert.strictEqual(s.mensagem, null);
});

test('aquecendo antes da primeira camada conta como imprimindo, com a etapa', () => {
  const s = normalizar({ ...imprimindo, status: 'heating', printProgress: 0 });
  assert.strictEqual(s.estado, 'imprimindo');
  assert.strictEqual(s.job.etapa, 'Aquecendo');
});

test('estados de fim e de pausa', () => {
  assert.strictEqual(normalizar({ ...imprimindo, status: 'paused' }).estado, 'pausada');
  assert.strictEqual(normalizar({ ...imprimindo, status: 'completed' }).estado, 'concluida');
  assert.strictEqual(normalizar({ ...imprimindo, status: 'cancel' }).estado, 'cancelada');
  assert.strictEqual(normalizar({ ...imprimindo, status: 'completed' }).job.restante_s, 0);
});

test('erro traz o código', () => {
  const s = normalizar({ ...imprimindo, status: 'error', errorCode: 'E0012' });
  assert.strictEqual(s.estado, 'erro');
  assert.strictEqual(s.mensagem, 'Erro E0012');
});

test('pronta não carrega job, mesmo com o nome do último arquivo', () => {
  const s = normalizar({ ...imprimindo, status: 'ready' });
  assert.strictEqual(s.estado, 'ociosa');
  assert.strictEqual(s.job, null);
});

test('no comecinho vale a estimativa da impressora; depois, a proporção', () => {
  assert.strictEqual(tempoRestante(60, 0.01, 7000), 7000);
  assert.strictEqual(tempoRestante(1000, 0.5, 7000), 1000);
  assert.strictEqual(tempoRestante(null, null, null), null);
});

test('bico cai para o lado esquerdo quando o direito não vem', () => {
  const { rightTemp, rightTargetTemp, ...semDireito } = imprimindo;
  const s = normalizar({ ...semDireito, leftTemp: 210, leftTargetTemp: 215 });
  assert.deepStrictEqual(s.temperaturas.bico, { atual: 210, alvo: 215 });
});
