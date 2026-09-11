const test = require('node:test');
const assert = require('node:assert');
const {
  round2, calcularItem, calcularOrcamento, calcularOrcamentoVenda,
} = require('./calculoOrcamento');

const item = (over = {}) => ({
  peso_gramas: 200, custo_por_grama: 0.15, horas_impressao: 2, quantidade: 1, servicos: [], ...over,
});

test('item único sem serviços', () => {
  const r = calcularItem(item(), 7);
  assert.strictEqual(r.custo_material, 30);    // 200 × 0,15
  assert.strictEqual(r.custo_impressao, 14);   // 2 × 7
  assert.strictEqual(r.valor_por_peca, 44);
  assert.strictEqual(r.total_pecas, 44);
  assert.strictEqual(r.total_servicos, 0);
  assert.strictEqual(r.total_item, 44);
});

test('quantidade multiplica só as peças, não os serviços', () => {
  const r = calcularItem(item({ quantidade: 3, servicos: [{ valor_hora: 120, quantidade_horas: 1.5 }] }), 7);
  assert.strictEqual(r.total_pecas, 132);      // 44 × 3
  assert.strictEqual(r.total_servicos, 180);   // 120 × 1,5 — cobrado uma vez
  assert.strictEqual(r.total_item, 312);
});

test('orçamento com vários itens soma os subtotais', () => {
  const r = calcularOrcamento({
    valor_hora_maquina: 7,
    itens: [
      item(),                                                        // 44
      item({ peso_gramas: 100, custo_por_grama: 0.22, horas_impressao: 1.5, quantidade: 2 }), // (22 + 10,5) × 2 = 65
      item({ peso_gramas: 50, custo_por_grama: 0.3, horas_impressao: 0.5 }),                  // 15 + 3,5 = 18,5
    ],
  });
  assert.strictEqual(r.total_itens, 127.5);
  assert.strictEqual(r.total_geral, 127.5);
});

test('serviços nos dois níveis entram no total geral separadamente', () => {
  const r = calcularOrcamento({
    valor_hora_maquina: 7,
    itens: [
      item({ servicos: [{ valor_hora: 120, quantidade_horas: 2 }] }),  // 44 + 240
      item({ servicos: [{ valor_hora: 100, quantidade_horas: 1 }] }),  // 44 + 100
    ],
    servicos_gerais: [{ valor_hora: 80, quantidade_horas: 3 }],        // 240
  });
  assert.strictEqual(r.total_itens, 88);
  assert.strictEqual(r.total_servicos_itens, 340);
  assert.strictEqual(r.total_servicos_gerais, 240);
  assert.strictEqual(r.total_geral, 668);
});

test('orçamento vazio zera tudo sem quebrar', () => {
  const r = calcularOrcamento({ valor_hora_maquina: 7, itens: [], servicos_gerais: [] });
  assert.strictEqual(r.total_geral, 0);
  assert.deepStrictEqual(r.itens, []);
});

test('campos ausentes ou inválidos viram zero em vez de NaN', () => {
  const r = calcularItem({ peso_gramas: null, custo_por_grama: undefined, horas_impressao: 'abc', quantidade: 1 }, 7);
  assert.strictEqual(r.total_item, 0);
  assert.ok(!Number.isNaN(r.valor_por_peca));
});

test('custo por grama de 4 casas é arredondado no valor gravado', () => {
  // 137 × 0,1533 = 21,0021 → 21,00
  const r = calcularItem(item({ peso_gramas: 137, custo_por_grama: 0.1533, horas_impressao: 0 }), 7);
  assert.strictEqual(r.custo_material, 21);
  assert.strictEqual(r.valor_por_peca, 21);
});

test('total das peças usa o valor unitário já arredondado (PDF fecha na conferência)', () => {
  // valor_por_peca cai em 10,555 → grava 10,56 e multiplica a partir dele
  const r = calcularItem(item({ peso_gramas: 70, custo_por_grama: 0.1508, horas_impressao: 0, quantidade: 3 }), 7);
  assert.strictEqual(r.valor_por_peca, 10.56);
  assert.strictEqual(r.total_pecas, round2(10.56 * 3));
});

// ─── Imposto embutido ───────────────────────────────────────────────────────
// O percentual não aparece no PDF, então a exigência é que tudo feche na soma:
// cada linha já sai com imposto e os totais são a soma dessas linhas.

test('imposto entra no preço por peça, não como linha no fim', () => {
  const r = calcularItem(item(), 7, 1.1);
  assert.strictEqual(r.custo_material, 30);        // o custo não muda
  assert.strictEqual(r.custo_impressao, 14);
  assert.strictEqual(r.valor_por_peca, 48.4);      // 44 × 1,10
  assert.strictEqual(r.total_pecas, 48.4);
});

test('sem imposto nada muda no valor por peça', () => {
  const semParametro = calcularItem(item(), 7);
  const comZero = calcularOrcamento({ valor_hora_maquina: 7, itens: [item()], imposto_percentual: 0 });
  assert.strictEqual(semParametro.valor_por_peca, 44);
  assert.strictEqual(comZero.total_geral, 44);
  assert.strictEqual(comZero.total_imposto, 0);
});

test('total geral é a soma das linhas já com imposto', () => {
  const r = calcularOrcamento({
    valor_hora_maquina: 7,
    itens: [item({ servicos: [{ valor_hora: 120, quantidade_horas: 2 }] })],  // 44 + 240
    servicos_gerais: [{ valor_hora: 80, quantidade_horas: 3 }],               // 240
    imposto_percentual: 10,
  });
  assert.strictEqual(r.total_itens, 48.4);            // 44 × 1,10
  assert.strictEqual(r.total_servicos_itens, 264);    // 240 × 1,10
  assert.strictEqual(r.total_servicos_gerais, 264);
  assert.strictEqual(r.total_geral, 576.4);
  assert.strictEqual(r.total_itens + r.total_servicos_itens + r.total_servicos_gerais, r.total_geral);
});

test('total_imposto é a diferença exata para a mesma conta sem imposto', () => {
  const base = { valor_hora_maquina: 7, itens: [item(), item({ quantidade: 3 })] };
  const sem = calcularOrcamento(base);
  const com = calcularOrcamento({ ...base, imposto_percentual: 12.5 });
  assert.strictEqual(com.total_imposto, round2(com.total_geral - sem.total_geral));
  assert.ok(com.total_imposto > 0);
});

test('imposto no orçamento de venda entra no unitário e a linha fecha', () => {
  const r = calcularOrcamentoVenda({
    produtos: [{ quantidade: 3, preco_unitario: 100, desconto_tipo: 'percentual', desconto: 10 }],
    imposto_percentual: 20,
  });
  const linha = r.produtos[0];
  assert.strictEqual(linha.preco_cobrado, 120);                           // 100 × 1,20
  assert.strictEqual(linha.total_bruto, 360);                             // 3 × 120
  assert.strictEqual(linha.total_desconto, 36);                           // 10%
  assert.strictEqual(linha.total_item, 324);
  assert.strictEqual(round2(linha.quantidade * linha.preco_cobrado - linha.total_desconto), linha.total_item);
  assert.strictEqual(r.total_geral, 324);
  assert.strictEqual(r.total_imposto, 54);                                // 324 − 270
});
