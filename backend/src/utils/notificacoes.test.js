const test = require('node:test');
const assert = require('node:assert');
const { categoriaDe, CATEGORIAS } = require('./notificacoes');

test('os avisos de cobrança vão para a aba financeiro', () => {
  assert.strictEqual(categoriaDe('financeiro'), 'financeiro');
});

test('os eventos das impressoras vão para a aba impressão', () => {
  for (const tipo of ['concluida', 'erro', 'pausada', 'offline', 'online']) {
    assert.strictEqual(categoriaDe(tipo), 'impressao', tipo);
  }
});

test('tipo desconhecido não some: cai em impressão', () => {
  assert.strictEqual(categoriaDe('aviso'), 'impressao');
  assert.ok(CATEGORIAS.includes(categoriaDe('qualquer-coisa')));
});
