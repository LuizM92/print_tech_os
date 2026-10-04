const test = require('node:test');
const assert = require('node:assert');
const { montarAviso } = require('./avisos');

const resumo = (over = {}) => ({
  vencido: { valor: 0, qtd: 0 },
  vence_hoje: { valor: 0, qtd: 0 },
  proximos_7_dias: { valor: 0, qtd: 0 },
  ...over,
});

test('sem vencida nem vencendo hoje, não há aviso', () => {
  assert.strictEqual(montarAviso('receber', resumo()), null);
  // O que vence só na semana que vem não justifica acordar o sino.
  assert.strictEqual(montarAviso('pagar', resumo({ proximos_7_dias: { valor: 500, qtd: 2 } })), null);
});

test('cobranças: hoje e vencidas, no singular e no plural', () => {
  const a = montarAviso('receber', resumo({
    vence_hoje: { valor: 400, qtd: 1 }, vencido: { valor: 1500.5, qtd: 2 },
  }));
  assert.strictEqual(a.titulo, 'Cobranças para acompanhar');
  assert.strictEqual(a.corpo, '1 vence hoje (R$ 400,00) · 2 vencidas (R$ 1.500,50)');
  assert.strictEqual(a.url, '/receber');
  assert.strictEqual(a.tipo, 'financeiro');
});

test('só vencidas: o texto não menciona "hoje"', () => {
  const a = montarAviso('receber', resumo({ vencido: { valor: 90, qtd: 1 } }));
  assert.strictEqual(a.corpo, '1 vencida (R$ 90,00)');
});

test('contas a pagar acrescentam a semana à frente e apontam para /pagar', () => {
  const a = montarAviso('pagar', resumo({
    vence_hoje: { valor: 1800, qtd: 3 }, proximos_7_dias: { valor: 320, qtd: 2 },
  }));
  assert.strictEqual(a.titulo, 'Contas a pagar para acompanhar');
  assert.strictEqual(a.corpo, '3 vencem hoje (R$ 1.800,00) · 2 nos próximos 7 dias (R$ 320,00)');
  assert.strictEqual(a.url, '/pagar');
});

test('cobrança não repete a semana à frente', () => {
  const a = montarAviso('receber', resumo({
    vence_hoje: { valor: 10, qtd: 1 }, proximos_7_dias: { valor: 320, qtd: 2 },
  }));
  assert.ok(!/próximos/.test(a.corpo));
});
