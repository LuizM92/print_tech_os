const test = require('node:test');
const assert = require('node:assert');
const {
  saldoDe, situacao, validarBaixa, aplicarBaixa, recalcular, resumirCobranca,
} = require('./lancamento');

const HOJE = '2026-10-04';

const conta = (over = {}) => ({
  natureza: 'receber', status: 'aberto', valor: 700, valor_pago: 0, desconto: 0,
  vencimento: '2026-10-20', ...over,
});

const baixa = (over = {}) => ({ valor: 100, forma: 'pix', ...over });

// ─── Situação ───────────────────────────────────────────────────────────────

test('conta aberta antes do vencimento está a vencer, com os dias que faltam', () => {
  assert.deepStrictEqual(situacao(conta({ vencimento: '2026-10-09' }), HOJE),
    { codigo: 'a_vencer', dias: 5, parcial: false });
});

test('vence hoje não é vencida', () => {
  assert.deepStrictEqual(situacao(conta({ vencimento: HOJE }), HOJE),
    { codigo: 'vence_hoje', dias: 0, parcial: false });
});

test('vencida conta os dias de atraso', () => {
  assert.deepStrictEqual(situacao(conta({ vencimento: '2026-10-01' }), HOJE),
    { codigo: 'vencido', dias: 3, parcial: false });
});

test('às 22h de Brasília a conta que vence hoje continua "vence hoje"', () => {
  const { hojeBR } = require('./datas');
  const hoje = hojeBR(new Date('2026-10-05T01:00:00Z'));   // 22h do dia 4 em Brasília
  assert.strictEqual(situacao(conta({ vencimento: '2026-10-04' }), hoje).codigo, 'vence_hoje');
});

test('conta aberta com recebimento é parcial; paga e cancelada não são', () => {
  assert.strictEqual(situacao(conta({ valor_pago: 200 }), HOJE).parcial, true);
  assert.strictEqual(situacao(conta({ desconto: 10 }), HOJE).parcial, true);
  assert.strictEqual(situacao(conta({ status: 'pago', valor_pago: 700 }), HOJE).codigo, 'pago');
  assert.strictEqual(situacao(conta({ status: 'cancelado' }), HOJE).codigo, 'cancelado');
});

test('vencimento que chega como data completa também funciona', () => {
  assert.strictEqual(situacao(conta({ vencimento: '2026-10-01T00:00:00.000Z' }), HOJE).codigo, 'vencido');
});

test('o saldo desconta o recebido e o desconto, e nunca fica negativo', () => {
  assert.strictEqual(saldoDe(conta({ valor_pago: 200, desconto: 50 })), 450);
  assert.strictEqual(saldoDe(conta({ valor_pago: 800 })), 0);
});

// ─── Validação da baixa ─────────────────────────────────────────────────────

test('baixa válida sai normalizada', () => {
  const r = validarBaixa(conta(), baixa({ valor: '200.5', observacao: '  adiantamento  ' }), HOJE);
  assert.deepStrictEqual(r.baixa, {
    valor: 200.5, desconto: 0, data_pagamento: HOJE, forma: 'pix', observacao: 'adiantamento',
  });
});

test('baixa em conta cancelada ou já quitada é recusada', () => {
  assert.match(validarBaixa(conta({ status: 'cancelado' }), baixa(), HOJE).erro, /cancelada/);
  assert.match(validarBaixa(conta({ status: 'pago' }), baixa(), HOJE).erro, /já está quitada/);
});

test('baixa zerada ou negativa é recusada, com o verbo certo para cada lado', () => {
  assert.match(validarBaixa(conta(), baixa({ valor: 0 }), HOJE).erro, /valor recebido/);
  assert.match(validarBaixa(conta({ natureza: 'pagar' }), baixa({ valor: 0 }), HOJE).erro, /valor pago/);
  assert.match(validarBaixa(conta(), baixa({ valor: -5 }), HOJE).erro, /negativos/);
});

test('só desconto, sem dinheiro, é uma baixa válida (abatimento)', () => {
  const r = validarBaixa(conta(), baixa({ valor: 0, desconto: 35 }), HOJE);
  assert.strictEqual(r.erro, undefined);
  assert.strictEqual(r.baixa.desconto, 35);
});

test('desconto maior que o saldo é recusado', () => {
  const r = validarBaixa(conta({ valor_pago: 600 }), baixa({ valor: 0, desconto: 101 }), HOJE);
  assert.match(r.erro, /não pode passar do saldo.*R\$ 100,00/);
});

test('receber a mais que o saldo é aceito', () => {
  assert.strictEqual(validarBaixa(conta(), baixa({ valor: 750 }), HOJE).erro, undefined);
});

test('data futura, inexistente ou forma inválida são recusadas', () => {
  assert.match(validarBaixa(conta(), baixa({ data_pagamento: '2026-10-05' }), HOJE).erro, /futura/);
  assert.match(validarBaixa(conta(), baixa({ data_pagamento: '2026-02-30' }), HOJE).erro, /inválida/);
  assert.match(validarBaixa(conta(), baixa({ forma: 'cheque' }), HOJE).erro, /forma de pagamento/);
  assert.match(validarBaixa(conta(), { valor: 10 }, HOJE).erro, /forma de pagamento/);
});

test('baixa com data passada é aceita', () => {
  const r = validarBaixa(conta(), baixa({ data_pagamento: '2026-09-30' }), HOJE);
  assert.strictEqual(r.baixa.data_pagamento, '2026-09-30');
});

// ─── Aplicar e recalcular ───────────────────────────────────────────────────

test('baixa parcial deixa a conta aberta; a que completa quita', () => {
  const primeira = aplicarBaixa(conta(), { valor: 200, desconto: 0, data_pagamento: '2026-10-02' });
  assert.deepStrictEqual(primeira,
    { valor_pago: 200, desconto: 0, status: 'aberto', quitado_em: null });

  const segunda = aplicarBaixa(conta({ valor_pago: 200 }), { valor: 500, desconto: 0, data_pagamento: HOJE });
  assert.deepStrictEqual(segunda,
    { valor_pago: 700, desconto: 0, status: 'pago', quitado_em: HOJE });
});

test('desconto conta para a quitação: 5% de PIX num pagamento integral', () => {
  const r = aplicarBaixa(conta({ valor: 1000 }), { valor: 950, desconto: 50, data_pagamento: HOJE });
  assert.strictEqual(r.status, 'pago');
  assert.strictEqual(r.valor_pago, 950);
  assert.strictEqual(r.desconto, 50);
});

test('centavos não deixam a conta presa em aberto por 0,01', () => {
  // 0,1 + 0,2 em ponto flutuante dá 0,30000000000000004
  const r = aplicarBaixa(conta({ valor: 0.3, valor_pago: 0.1 }), { valor: 0.2, desconto: 0, data_pagamento: HOJE });
  assert.strictEqual(r.status, 'pago');
});

test('estornar a única baixa reabre a conta', () => {
  const r = recalcular(conta({ status: 'pago', valor_pago: 700 }), []);
  assert.deepStrictEqual(r, { valor_pago: 0, desconto: 0, status: 'aberto', quitado_em: null });
});

test('estornar uma de duas baixas mantém o recebido da outra e reabre', () => {
  const sobrou = [{ valor: 200, desconto: 0, data_pagamento: '2026-10-02' }];
  const r = recalcular(conta({ status: 'pago', valor_pago: 700 }), sobrou);
  assert.deepStrictEqual(r, { valor_pago: 200, desconto: 0, status: 'aberto', quitado_em: null });
});

test('recalcular com as baixas que ainda quitam mantém paga, com a data da última', () => {
  const baixas = [
    { valor: 200, desconto: 0, data_pagamento: '2026-10-02' },
    { valor: 500, desconto: 0, data_pagamento: '2026-10-04' },
  ];
  const r = recalcular(conta({ status: 'pago' }), baixas);
  assert.strictEqual(r.status, 'pago');
  assert.strictEqual(r.quitado_em, '2026-10-04');
});

// ─── Resumo da cobrança de uma OS ───────────────────────────────────────────

test('cobrança que fecha com o total não é divergente', () => {
  const r = resumirCobranca(1000, [
    conta({ valor: 300, status: 'pago', valor_pago: 300 }),
    conta({ valor: 700, valor_pago: 200 }),
  ]);
  assert.deepStrictEqual(r, {
    parcelas: 2, cobrado: 1000, recebido: 500, desconto: 0, em_aberto: 500,
    divergente: false, diferenca: 0,
  });
});

test('orçamento editado depois de cobrar: a cobrança fica divergente e informa a diferença', () => {
  const r = resumirCobranca(1100, [
    conta({ valor: 300, status: 'pago', valor_pago: 300 }),
    conta({ valor: 700 }),
  ]);
  assert.strictEqual(r.divergente, true);
  assert.strictEqual(r.diferenca, 100);
});

test('parcela cancelada não conta na cobrança', () => {
  const r = resumirCobranca(1000, [
    conta({ valor: 300, status: 'cancelado' }),
    conta({ valor: 1000 }),
  ]);
  assert.strictEqual(r.parcelas, 1);
  assert.strictEqual(r.cobrado, 1000);
  assert.strictEqual(r.divergente, false);
});

test('sem cobrança não há divergência', () => {
  const r = resumirCobranca(1000, []);
  assert.strictEqual(r.divergente, false);
  assert.strictEqual(r.parcelas, 0);
});

test('o desconto concedido não é "em aberto": quitou com 5% off, em aberto zero', () => {
  const r = resumirCobranca(1000, [conta({ valor: 1000, status: 'pago', valor_pago: 950, desconto: 50 })]);
  assert.strictEqual(r.em_aberto, 0);
  assert.strictEqual(r.recebido, 950);
  assert.strictEqual(r.desconto, 50);
});
