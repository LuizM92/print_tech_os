const test = require('node:test');
const assert = require('node:assert');
const { eventosDaTransicao } = require('./eventos');

const leitura = (estado, arquivo = null, decorrido = 0) => ({
  estado, mensagem: null, job: arquivo ? { arquivo, decorrido_s: decorrido } : null,
});
const tipos = (evs) => evs.map((e) => e.tipo);

test('primeira leitura depois de subir o servidor não gera evento', () => {
  assert.deepStrictEqual(eventosDaTransicao(null, leitura('imprimindo', 'a.gcode')), []);
});

test('mesma leitura repetida não gera evento', () => {
  assert.deepStrictEqual(eventosDaTransicao(leitura('imprimindo', 'a.gcode'), leitura('imprimindo', 'a.gcode', 30)), []);
});

test('ciclo completo de um job', () => {
  assert.deepStrictEqual(tipos(eventosDaTransicao(leitura('ociosa'), leitura('imprimindo', 'a.gcode'))), ['inicio']);
  assert.deepStrictEqual(tipos(eventosDaTransicao(leitura('imprimindo', 'a.gcode'), leitura('pausada', 'a.gcode'))), ['pausada']);
  assert.deepStrictEqual(tipos(eventosDaTransicao(leitura('pausada', 'a.gcode'), leitura('imprimindo', 'a.gcode'))), ['retomada']);
  const [fim] = eventosDaTransicao(leitura('imprimindo', 'a.gcode', 7000), leitura('concluida', 'a.gcode', 7200));
  assert.strictEqual(fim.tipo, 'concluida');
  assert.strictEqual(fim.duracao_s, 7200);
});

test('um job atrás do outro sem passar por ociosa ainda conta como início', () => {
  assert.deepStrictEqual(tipos(eventosDaTransicao(leitura('imprimindo', 'a.gcode'), leitura('imprimindo', 'b.gcode'))), ['inicio']);
  assert.deepStrictEqual(tipos(eventosDaTransicao(leitura('concluida', 'a.gcode'), leitura('imprimindo', 'a.gcode'))), ['inicio']);
});

test('erro no meio do job leva a duração; erro parada não', () => {
  const [noJob] = eventosDaTransicao(leitura('imprimindo', 'a.gcode', 500), { ...leitura('erro', 'a.gcode', 510), mensagem: 'Heater extruder not heating' });
  assert.strictEqual(noJob.tipo, 'erro');
  assert.strictEqual(noJob.duracao_s, 510);
  assert.match(noJob.detalhe, /not heating/);
  const [parada] = eventosDaTransicao(leitura('ociosa'), leitura('erro'));
  assert.strictEqual(parada.duracao_s, null);
});

test('queda e volta da rede, sem repetir enquanto continua fora', () => {
  const [caiu] = eventosDaTransicao(leitura('imprimindo', 'a.gcode'), { ...leitura('offline'), mensagem: 'Sem resposta' });
  assert.strictEqual(caiu.tipo, 'offline');
  assert.strictEqual(caiu.arquivo, 'a.gcode'); // o job que estava rodando quando caiu
  assert.deepStrictEqual(eventosDaTransicao(leitura('offline'), leitura('offline')), []);
  assert.deepStrictEqual(tipos(eventosDaTransicao(leitura('offline'), leitura('ociosa'))), ['online']);
});
