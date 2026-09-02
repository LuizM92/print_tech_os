const test = require('node:test');
const assert = require('node:assert');
const { validarCnpj, formatarCnpj, somenteDigitos } = require('./consultaCnpj');

test('aceita CNPJ válido, com ou sem máscara', () => {
  assert.strictEqual(validarCnpj('00000000000191'), true);      // Banco do Brasil
  assert.strictEqual(validarCnpj('00.000.000/0001-91'), true);
  assert.strictEqual(validarCnpj('92754738000162'), true);      // Lojas Renner
});

test('recusa dígito verificador errado', () => {
  assert.strictEqual(validarCnpj('00000000000192'), false);
  assert.strictEqual(validarCnpj('92754738000163'), false);
});

test('recusa tamanho errado', () => {
  assert.strictEqual(validarCnpj('123'), false);
  assert.strictEqual(validarCnpj('000000000001911'), false);
  assert.strictEqual(validarCnpj(''), false);
  assert.strictEqual(validarCnpj(null), false);
});

test('recusa sequência repetida, que passa no cálculo mas não existe', () => {
  assert.strictEqual(validarCnpj('11111111111111'), false);
  assert.strictEqual(validarCnpj('00000000000000'), false);
});

test('formata o CNPJ para exibição', () => {
  assert.strictEqual(formatarCnpj('00000000000191'), '00.000.000/0001-91');
  assert.strictEqual(formatarCnpj('123'), '123'); // incompleto sai como veio
});

test('somenteDigitos limpa qualquer máscara', () => {
  assert.strictEqual(somenteDigitos('00.000.000/0001-91'), '00000000000191');
  assert.strictEqual(somenteDigitos(null), '');
});
