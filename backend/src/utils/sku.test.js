const test = require('node:test');
const assert = require('node:assert');
const {
  normalizarBloco, normalizarTamanho, montarSkuPai, montarSku, desmontarSku,
  validarPai, validarVariacao,
} = require('./sku');

test('bloco perde acento, espaço e cedilha', () => {
  assert.strictEqual(normalizarBloco('Vasinho Suculenta'), 'VASINHOSUCULENTA');
  assert.strictEqual(normalizarBloco('coração'), 'CORACAO');
  assert.strictEqual(normalizarBloco('v1'), 'V1');
});

test('quantidade de um dígito ganha zero à esquerda', () => {
  assert.strictEqual(normalizarTamanho('2'), '02');
  assert.strictEqual(normalizarTamanho('20'), '20');
  assert.strictEqual(normalizarTamanho(''), 'U');
  assert.strictEqual(normalizarTamanho('g'), 'G');
});

test('SKU sempre sai com os 5 blocos', () => {
  assert.strictEqual(
    montarSku({ categoria: 'VAS', modelo: 'Pacman', material: 'PLA', variacao: 'AZL', tamanho: 'G' }),
    'VAS-PACMAN-PLA-AZL-G'
  );
  assert.strictEqual(
    montarSku({ categoria: 'CHV', modelo: 'Coração', material: 'PET', variacao: '', tamanho: '' }),
    'CHV-CORACAO-PET-STD-U'
  );
});

test('o pai não carrega material', () => {
  assert.strictEqual(montarSkuPai({ categoria: 'VAS', modelo: 'Pacman' }), 'VAS-PACMAN');
});

test('desmontar devolve os blocos e recusa o que está fora do padrão', () => {
  assert.deepStrictEqual(desmontarSku('BON-COYOTE-PLA-V1-U'), {
    categoria: 'BON', modelo: 'COYOTE', material: 'PLA', variacao: 'V1', tamanho: 'U',
  });
  assert.strictEqual(desmontarSku('BON-COYOTE'), null);
  assert.strictEqual(desmontarSku('bon-coyote-pla-v1-u'), null);
});

test('categoria fora da tabela é recusada', () => {
  assert.ok(validarPai({ categoria: 'XYZ', modelo: 'PACMAN' }));
  assert.strictEqual(validarPai({ categoria: 'VAS', modelo: 'Pacman' }), null);
});

test('modelo curto demais ou longo demais é recusado', () => {
  assert.ok(validarPai({ categoria: 'VAS', modelo: 'AB' }));
  assert.ok(validarPai({ categoria: 'VAS', modelo: 'MODELOMUITOLONGO' }));
});

test('variação sem material é recusada; sem cor vira STD', () => {
  assert.ok(validarVariacao({ material: 'MDF', variacao: 'AZL', tamanho: 'U' }));
  assert.strictEqual(validarVariacao({ material: 'PLA', variacao: '', tamanho: '' }), null);
});
