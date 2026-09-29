const test = require('node:test');
const assert = require('node:assert');
const { montarAlerta, alertaOffline, nomeArquivo } = require('./regras');

const imp = { id: 3, nome: 'K1C TICO' };
const arquivo = 'OS-202609-0005 - Deposito Borra de cafe_PETG_3h24m.gcode';

test('concluída avisa com OS, peça e duração', () => {
  const a = montarAlerta(imp, { tipo: 'concluida', arquivo, duracao_s: 12240 }, { numeroOs: 'OS-202609-0005' });
  assert.strictEqual(a.titulo, 'K1C TICO terminou');
  assert.strictEqual(a.corpo, 'OS-202609-0005 · Deposito Borra de cafe_PETG_3h24m · 3h24');
  assert.strictEqual(a.tag, 'impressora-3');
});

test('erro no meio do job traz a mensagem da impressora', () => {
  const a = montarAlerta(imp, { tipo: 'erro', arquivo, detalhe: 'Heater extruder not heating at expected rate' }, {});
  assert.strictEqual(a.titulo, 'K1C TICO: a impressão falhou');
  assert.match(a.corpo, /^Heater extruder not heating/);
});

test('erro sem job é erro da impressora, não da impressão', () => {
  const a = montarAlerta(imp, { tipo: 'erro', arquivo: null, detalhe: 'MCU shutdown' }, {});
  assert.strictEqual(a.titulo, 'K1C TICO com erro');
});

test('pausa sozinha avisa com o motivo; pausa pedida pelo sistema não', () => {
  const atual = { job: { etapa: 'Pausada: filamento acabou' } };
  const a = montarAlerta(imp, { tipo: 'pausada', arquivo }, { atual });
  assert.strictEqual(a.titulo, 'K1C TICO pausou');
  assert.match(a.corpo, /^Pausada: filamento acabou/);
  assert.strictEqual(montarAlerta(imp, { tipo: 'pausada', arquivo }, { atual, pausaPedida: true }), null);
});

test('pausa sem motivo informado ainda avisa', () => {
  const a = montarAlerta(imp, { tipo: 'pausada', arquivo: 'peca.gcode' }, { atual: { job: {} } });
  assert.strictEqual(a.corpo, 'Sem motivo informado · peca');
});

test('cancelamento, início e comandos não viram alerta', () => {
  for (const tipo of ['cancelada', 'inicio', 'retomada', 'comando', 'online', 'offline']) {
    assert.strictEqual(montarAlerta(imp, { tipo, arquivo }, {}), null, tipo);
  }
});

test('queda da rede diz há quanto tempo e o que estava imprimindo', () => {
  const a = alertaOffline(imp, { arquivo: 'pecas/tampa.gcode', numeroOs: null, minutos: 3 });
  assert.strictEqual(a.corpo, 'Sem resposta há 3 min no meio da impressão · tampa');
});

test('nome do arquivo sem pasta e sem extensão de nenhuma marca', () => {
  assert.strictEqual(nomeArquivo('a/b/peca.gcode'), 'peca');
  assert.strictEqual(nomeArquivo('engrenagem.gx'), 'engrenagem');
  assert.strictEqual(nomeArquivo('plate_1.3mf'), 'plate_1');
});
