const test = require('node:test');
const assert = require('node:assert');
const {
  hojeBR, horaBR, ehDataISO, somarDias, somarMeses, diasEntre, primeiroDiaDoMes, ultimoDiaDoMes,
} = require('./datas');

test('às 22h de Brasília o servidor (UTC) já está no dia seguinte, mas o hoje é o de Brasília', () => {
  const vinteDuasEmBrasilia = new Date('2026-10-05T01:00:00Z'); // UTC já é dia 5
  assert.strictEqual(hojeBR(vinteDuasEmBrasilia), '2026-10-04');
  assert.strictEqual(horaBR(vinteDuasEmBrasilia), 22);
});

test('meia-noite em Brasília é hora 0, e não 24', () => {
  const meiaNoite = new Date('2026-10-05T03:00:00Z');
  assert.strictEqual(hojeBR(meiaNoite), '2026-10-05');
  assert.strictEqual(horaBR(meiaNoite), 0);
});

test('ehDataISO recusa formato errado e dia que não existe', () => {
  assert.strictEqual(ehDataISO('2026-10-04'), true);
  assert.strictEqual(ehDataISO('2028-02-29'), true);   // bissexto
  assert.strictEqual(ehDataISO('2026-02-29'), false);
  assert.strictEqual(ehDataISO('2026-02-30'), false);
  assert.strictEqual(ehDataISO('2026-13-01'), false);
  assert.strictEqual(ehDataISO('04/10/2026'), false);
  assert.strictEqual(ehDataISO('2026-10-04T10:00:00Z'), false);
  assert.strictEqual(ehDataISO(null), false);
  assert.strictEqual(ehDataISO(undefined), false);
});

test('somarDias atravessa mês e ano', () => {
  assert.strictEqual(somarDias('2026-10-04', 15), '2026-10-19');
  assert.strictEqual(somarDias('2026-12-25', 10), '2027-01-04');
  assert.strictEqual(somarDias('2026-03-01', -1), '2026-02-28');
});

test('somarMeses mantém o dia e, no mês curto, cai no último dia', () => {
  assert.strictEqual(somarMeses('2026-10-04', 1), '2026-11-04');
  assert.strictEqual(somarMeses('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(somarMeses('2028-01-31', 1), '2028-02-29');   // bissexto
  assert.strictEqual(somarMeses('2026-03-31', 1), '2026-04-30');
  assert.strictEqual(somarMeses('2026-11-15', 3), '2027-02-15');
  assert.strictEqual(somarMeses('2026-01-31', 0), '2026-01-31');
});

test('diasEntre conta dias de calendário, com sinal', () => {
  assert.strictEqual(diasEntre('2026-10-01', '2026-10-04'), 3);
  assert.strictEqual(diasEntre('2026-10-04', '2026-10-04'), 0);
  assert.strictEqual(diasEntre('2026-10-04', '2026-10-01'), -3);
  assert.strictEqual(diasEntre('2026-12-31', '2027-01-01'), 1);
});

test('limites do mês', () => {
  assert.strictEqual(primeiroDiaDoMes('2026-10-17'), '2026-10-01');
  assert.strictEqual(ultimoDiaDoMes('2026-10-17'), '2026-10-31');
  assert.strictEqual(ultimoDiaDoMes('2026-02-03'), '2026-02-28');
  assert.strictEqual(ultimoDiaDoMes('2028-02-03'), '2028-02-29');
});
