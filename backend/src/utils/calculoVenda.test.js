const test = require('node:test');
const assert = require('node:assert');
const { calcularProduto, calcularOrcamentoVenda } = require('./calculoOrcamento');

const produto = (over = {}) => ({
  quantidade: 1, preco_unitario: 119.9, desconto_tipo: 'percentual', desconto: 0, ...over,
});

test('produto sem desconto', () => {
  const r = calcularProduto(produto({ quantidade: 3 }));
  assert.strictEqual(r.total_bruto, 359.7);
  assert.strictEqual(r.total_desconto, 0);
  assert.strictEqual(r.total_item, 359.7);
});

test('desconto percentual na linha', () => {
  const r = calcularProduto(produto({ quantidade: 2, desconto: 10 }));
  assert.strictEqual(r.total_bruto, 239.8);
  assert.strictEqual(r.total_desconto, 23.98);
  assert.strictEqual(r.total_item, 215.82);
});

test('desconto em reais na linha', () => {
  const r = calcularProduto(produto({ quantidade: 2, desconto_tipo: 'valor', desconto: 40 }));
  assert.strictEqual(r.total_desconto, 40);
  assert.strictEqual(r.total_item, 199.8);
});

test('desconto maior que o item zera a linha, não fica negativo', () => {
  const r = calcularProduto(produto({ desconto_tipo: 'valor', desconto: 500 }));
  assert.strictEqual(r.total_desconto, 119.9);
  assert.strictEqual(r.total_item, 0);
});

test('quantidade fracionada (venda por kg)', () => {
  const r = calcularProduto(produto({ quantidade: 0.5, preco_unitario: 240 }));
  assert.strictEqual(r.total_bruto, 120);
});

test('orçamento com vários produtos e desconto geral', () => {
  const r = calcularOrcamentoVenda({
    produtos: [
      produto({ quantidade: 2 }),                                  // 239,80
      produto({ preco_unitario: 1899, desconto: 5 }),              // 1899 - 94,95 = 1804,05
      produto({ quantidade: 4, preco_unitario: 24.9 }),            // 99,60
    ],
    desconto_tipo: 'percentual',
    desconto: 10,
  });

  assert.strictEqual(r.total_produtos, 2238.4);   // 239,80 + 1899 + 99,60
  assert.strictEqual(r.desconto_itens, 94.95);
  assert.strictEqual(r.subtotal, 2143.45);
  assert.strictEqual(r.desconto_geral, 214.35);   // 10% do subtotal
  assert.strictEqual(r.total_descontos, 309.3);
  assert.strictEqual(r.total_geral, 1929.1);
});

test('desconto geral incide sobre o subtotal, não sobre o bruto', () => {
  const r = calcularOrcamentoVenda({
    produtos: [produto({ preco_unitario: 100, desconto_tipo: 'valor', desconto: 20 })],
    desconto_tipo: 'percentual',
    desconto: 50,
  });
  assert.strictEqual(r.subtotal, 80);
  assert.strictEqual(r.desconto_geral, 40); // 50% de 80, não de 100
  assert.strictEqual(r.total_geral, 40);
});

test('orçamento vazio não quebra', () => {
  const r = calcularOrcamentoVenda({ produtos: [] });
  assert.strictEqual(r.total_geral, 0);
  assert.strictEqual(r.total_produtos, 0);
});

test('valores inválidos viram zero em vez de NaN', () => {
  const r = calcularProduto({ quantidade: 'abc', preco_unitario: null, desconto: undefined });
  assert.strictEqual(r.total_item, 0);
  assert.ok(!Number.isNaN(r.total_bruto));
});
