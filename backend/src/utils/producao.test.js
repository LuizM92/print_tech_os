const test = require('node:test');
const assert = require('node:assert');
const { ETAPAS, CODIGOS, ETAPA_INICIAL, ehEtapaValida, rotuloEtapa, detalheMovimento } = require('./producao');

test('a fila começa na etapa inicial e ela existe na tabela', () => {
  assert.strictEqual(ETAPA_INICIAL, 'fila');
  assert.ok(ehEtapaValida(ETAPA_INICIAL));
  assert.strictEqual(CODIGOS[0], ETAPA_INICIAL);
});

test('etapa fora da tabela é recusada', () => {
  assert.ok(!ehEtapaValida('finalizado'));
  assert.ok(!ehEtapaValida(''));
  assert.ok(!ehEtapaValida(undefined));
});

test('"pronta" e "entregue" são etapas distintas — uma avisa o cliente, a outra encerra', () => {
  assert.ok(ehEtapaValida('pronto'));
  assert.ok(ehEtapaValida('entregue'));
  assert.ok(CODIGOS.indexOf('pronto') < CODIGOS.indexOf('entregue'));
});

test('o histórico registra o movimento com os rótulos das duas pontas', () => {
  assert.strictEqual(detalheMovimento('fila', 'producao'), 'Na fila → Imprimindo');
  assert.strictEqual(detalheMovimento('pronto', 'entregue'), 'Pronta → Entregue');
});

test('código desconhecido aparece cru em vez de virar undefined no histórico', () => {
  assert.strictEqual(rotuloEtapa('xpto'), 'xpto');
});

test('toda etapa tem rótulo e descrição', () => {
  for (const etapa of ETAPAS) {
    assert.ok(etapa.rotulo, `${etapa.codigo} sem rótulo`);
    assert.ok(etapa.descricao, `${etapa.codigo} sem descrição`);
  }
});
