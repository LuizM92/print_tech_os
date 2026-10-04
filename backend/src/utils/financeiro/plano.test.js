const test = require('node:test');
const assert = require('node:assert');
const { centavos, dividir, proporcao } = require('./dinheiro');
const {
  entradaESaldo, parcelado, parcelarAvulso, aVista, sugerir, validarParcelas,
} = require('./plano');
const condicoes = require('../condicoesPagamento');

const HOJE = '2026-10-04';
const somaCentavos = (parcelas) => parcelas.reduce((s, p) => s + centavos(p.valor), 0);

// ─── Dinheiro ───────────────────────────────────────────────────────────────

test('centavos tira o ruído do ponto flutuante', () => {
  assert.strictEqual(centavos(0.1 + 0.2), 30);
  assert.strictEqual(centavos(333.335), 33334);
  assert.strictEqual(centavos('1000.00'), 100000);   // DECIMAL do MySQL chega como texto
  assert.strictEqual(centavos('abc'), 0);
  assert.strictEqual(centavos(null), 0);
});

test('dividir: a soma das partes é o total e o resto vai na última', () => {
  assert.deepStrictEqual(dividir(10000, 3), [3333, 3333, 3334]);
  assert.deepStrictEqual(dividir(10000, 4), [2500, 2500, 2500, 2500]);
  assert.deepStrictEqual(dividir(1, 3), [0, 0, 1]);
  for (const total of [1, 99, 10001, 33333, 100000]) {
    for (const n of [1, 2, 3, 7, 12]) {
      assert.strictEqual(dividir(total, n).reduce((a, b) => a + b, 0), total);
    }
  }
});

test('proporcao arredonda para o centavo', () => {
  assert.strictEqual(proporcao(10001, 0.3), 3000);   // 3000,3
  assert.strictEqual(proporcao(10000, 0.3), 3000);
  assert.strictEqual(proporcao(333, 0.3), 100);      // 99,9
});

// ─── Condições (as mesmas do PDF) ───────────────────────────────────────────

test('as condições de pagamento calculam entrada, PIX e parcela do total', () => {
  const c = condicoes.calcular(1000);
  assert.strictEqual(c.entrada, 300);
  assert.strictEqual(c.descontoPix, 50);
  assert.strictEqual(c.totalPix, 950);
  assert.strictEqual(c.parcela, 333.33);
  assert.strictEqual(c.parcelamentoOferecido, true);
});

test('parcelamento só é oferecido acima do mínimo — no mínimo exato, não', () => {
  assert.strictEqual(condicoes.calcular(300).parcelamentoOferecido, false);
  assert.strictEqual(condicoes.calcular(300.01).parcelamentoOferecido, true);
  assert.strictEqual(condicoes.calcular('250.00').parcelamentoOferecido, false);
});

// ─── Entrada + saldo ────────────────────────────────────────────────────────

test('entrada de 30% + saldo fecha o total, qualquer que seja o total', () => {
  for (const total of [1000, 100.01, 0.1, 333.33, 1234.56, 99999.99, 0.05]) {
    const parcelas = entradaESaldo(total, { hoje: HOJE });
    assert.strictEqual(somaCentavos(parcelas), centavos(total), `total ${total}`);
  }
});

test('entrada vence hoje; saldo vence na previsão de entrega', () => {
  const [entrada, saldo] = entradaESaldo(1000, { hoje: HOJE, previsaoEntrega: '2026-10-20' });
  assert.deepStrictEqual(entrada, {
    rotulo: 'Entrada', parcela: 1, total_parcelas: 2, valor: 300, vencimento: HOJE,
  });
  assert.deepStrictEqual(saldo, {
    rotulo: 'Saldo', parcela: 2, total_parcelas: 2, valor: 700, vencimento: '2026-10-20',
  });
});

test('sem previsão de entrega, ou com previsão que já passou, o saldo vence em 15 dias', () => {
  assert.strictEqual(entradaESaldo(1000, { hoje: HOJE })[1].vencimento, '2026-10-19');
  assert.strictEqual(entradaESaldo(1000, { hoje: HOJE, previsaoEntrega: '2026-09-01' })[1].vencimento, '2026-10-19');
  assert.strictEqual(entradaESaldo(1000, { hoje: HOJE, previsaoEntrega: 'lixo' })[1].vencimento, '2026-10-19');
});

test('total pequeno demais para duas parcelas vira uma só, nunca parcela zerada', () => {
  const parcelas = entradaESaldo(0.01, { hoje: HOJE });
  assert.strictEqual(parcelas.length, 1);
  assert.strictEqual(parcelas[0].valor, 0.01);
  assert.ok(parcelas.every((p) => centavos(p.valor) > 0));
});

// ─── Parcelado e à vista ────────────────────────────────────────────────────

test('3x: parcelas mensais, soma exata e resto na última', () => {
  const parcelas = parcelado(100, 3, { hoje: HOJE });
  assert.deepStrictEqual(parcelas.map((p) => p.valor), [33.33, 33.33, 33.34]);
  assert.deepStrictEqual(parcelas.map((p) => p.vencimento), ['2026-11-04', '2026-12-04', '2027-01-04']);
  assert.deepStrictEqual(parcelas.map((p) => p.rotulo), ['Parcela 1/3', 'Parcela 2/3', 'Parcela 3/3']);
  assert.strictEqual(somaCentavos(parcelas), 10000);
});

test('parcelado a partir do dia 31 cai no último dia dos meses curtos', () => {
  const parcelas = parcelado(300, 3, { hoje: '2026-01-31' });
  assert.deepStrictEqual(parcelas.map((p) => p.vencimento), ['2026-02-28', '2026-03-31', '2026-04-30']);
});

test('à vista é uma parcela com o total, vencendo hoje', () => {
  assert.deepStrictEqual(aVista(250.5, { hoje: HOJE }), [{
    rotulo: 'À vista', parcela: 1, total_parcelas: 1, valor: 250.5, vencimento: HOJE,
  }]);
});

test('avulso: parcela única sem rótulo; várias, mês a mês a partir do primeiro vencimento', () => {
  const [unica] = parcelarAvulso(80, 1, '2026-10-10');
  assert.strictEqual(unica.rotulo, null);
  assert.strictEqual(unica.valor, 80);

  const varias = parcelarAvulso(100, 3, '2026-10-31');
  assert.deepStrictEqual(varias.map((p) => p.vencimento), ['2026-10-31', '2026-11-30', '2026-12-31']);
  assert.strictEqual(somaCentavos(varias), 10000);
});

// ─── Sugestão ───────────────────────────────────────────────────────────────

test('sugestão acima do mínimo oferece entrada+saldo, 3x e à vista', () => {
  const opcoes = sugerir(1000, { hoje: HOJE });
  assert.deepStrictEqual(opcoes.map((o) => o.codigo), ['entrada_saldo', 'parcelado', 'a_vista']);
  assert.strictEqual(opcoes[0].titulo, 'Entrada de 30% + saldo');
  assert.ok(opcoes.every((o) => somaCentavos(o.parcelas) === 100000));
});

test('sugestão até o mínimo não oferece parcelamento, como o PDF', () => {
  const codigos = sugerir(300, { hoje: HOJE }).map((o) => o.codigo);
  assert.deepStrictEqual(codigos, ['entrada_saldo', 'a_vista']);
});

test('total zerado não gera sugestão', () => {
  assert.deepStrictEqual(sugerir(0, { hoje: HOJE }), []);
});

test('a entrada sugerida é a mesma que o PDF imprime', () => {
  for (const total of [1000, 123.45, 99.99, 4567.89]) {
    const [entrada] = sugerir(total, { hoje: HOJE })[0].parcelas;
    assert.strictEqual(entrada.valor, condicoes.calcular(total).entrada, `total ${total}`);
  }
});

// ─── Validação do que vem do cliente ────────────────────────────────────────

test('validarParcelas: soma precisa bater com o total até o centavo', () => {
  const p = (valor, vencimento = HOJE) => ({ valor, vencimento });
  assert.strictEqual(validarParcelas([p(300), p(700)], { total: 1000 }), null);
  assert.match(validarParcelas([p(300), p(699.99)], { total: 1000 }), /precisa ser igual ao total/);
  assert.match(validarParcelas([p(300), p(700.01)], { total: 1000 }), /R\$ 1\.000,01/);
});

test('validarParcelas: recusa lista vazia, valor zerado, data inválida e excesso de parcelas', () => {
  assert.match(validarParcelas([]), /ao menos uma parcela/);
  assert.match(validarParcelas(null), /ao menos uma parcela/);
  assert.match(validarParcelas([{ valor: 0, vencimento: HOJE }]), /maior que zero/);
  assert.match(validarParcelas([{ valor: 10, vencimento: '2026-02-30' }]), /vencimento inválido/);
  assert.match(validarParcelas([{ valor: 10, vencimento: '04/10/2026' }]), /vencimento inválido/);
  const treze = Array.from({ length: 13 }, () => ({ valor: 10, vencimento: HOJE }));
  assert.match(validarParcelas(treze), /No máximo 12/);
});

test('validarParcelas sem total aceita qualquer soma (avulso e despesa)', () => {
  assert.strictEqual(validarParcelas([{ valor: 42.5, vencimento: HOJE }]), null);
});
