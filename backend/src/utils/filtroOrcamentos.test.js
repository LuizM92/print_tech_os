const test = require('node:test');
const assert = require('node:assert');
const { construirFiltro, granularidade } = require('./filtroOrcamentos');

test('sem filtro nenhum não gera cláusula', () => {
  const f = construirFiltro({});
  assert.strictEqual(f.clausula, '');
  assert.deepStrictEqual(f.params, []);
  assert.deepStrictEqual(f.ativos, []);
});

test('período cobre o dia inteiro do "até"', () => {
  const f = construirFiltro({ de: '2026-09-01', ate: '2026-09-30' });
  assert.ok(f.clausula.includes('o.criado_em >= ?'));
  assert.ok(f.clausula.includes('o.criado_em <= ?'));
  // Sem o 23:59:59, tudo que foi criado no dia 30 ficaria de fora.
  assert.deepStrictEqual(f.params, ['2026-09-01 00:00:00', '2026-09-30 23:59:59']);
});

test('data em formato inválido é ignorada', () => {
  assert.deepStrictEqual(construirFiltro({ de: '01/09/2026' }).params, []);
  assert.deepStrictEqual(construirFiltro({ de: 'ontem' }).params, []);
  assert.deepStrictEqual(construirFiltro({ de: "2026-09-01'; DROP TABLE" }).params, []);
});

test('status e tipo fora da lista são ignorados', () => {
  assert.deepStrictEqual(construirFiltro({ status: 'faturado' }).params, []);
  assert.deepStrictEqual(construirFiltro({ tipo: 'servico' }).params, []);
  assert.deepStrictEqual(construirFiltro({ status: 'aprovado' }).params, ['aprovado']);
  assert.deepStrictEqual(construirFiltro({ tipo: 'produto' }).params, ['produto']);
});

test('ids não numéricos ou não positivos são ignorados', () => {
  assert.deepStrictEqual(construirFiltro({ cliente_id: 'abc' }).params, []);
  assert.deepStrictEqual(construirFiltro({ cliente_id: '0' }).params, []);
  assert.deepStrictEqual(construirFiltro({ cliente_id: '-3' }).params, []);
  assert.deepStrictEqual(construirFiltro({ cliente_id: '7' }).params, [7]);
});

test('faixa de valor aceita zero e ignora texto', () => {
  assert.deepStrictEqual(construirFiltro({ valor_min: '0' }).params, [0]);
  assert.deepStrictEqual(construirFiltro({ valor_max: '1500.5' }).params, [1500.5]);
  assert.deepStrictEqual(construirFiltro({ valor_min: 'muito' }).params, []);
});

test('material e produto filtram pela tabela filha, sem duplicar orçamento', () => {
  const f = construirFiltro({ material_id: '3' });
  assert.ok(f.clausula.includes('EXISTS'));
  assert.ok(f.clausula.includes('orcamento_itens'));
  assert.deepStrictEqual(f.params, [3]);

  const p = construirFiltro({ produto_id: '9' });
  assert.ok(p.clausula.includes('orcamento_produtos'));
  assert.deepStrictEqual(p.params, [9]);
});

test('descrição do item procura nos dois tipos de orçamento', () => {
  const f = construirFiltro({ descricao_item: 'suporte' });
  assert.ok(f.clausula.includes('orcamento_itens'));
  assert.ok(f.clausula.includes('orcamento_produtos'));
  assert.deepStrictEqual(f.params, ['%suporte%', '%suporte%']);
});

test('valores do usuário viram parâmetro, nunca texto da consulta', () => {
  const perigoso = "'; DROP TABLE orcamentos; --";
  const f = construirFiltro({ descricao_item: perigoso, busca: perigoso });
  assert.ok(!f.clausula.includes('DROP'));
  assert.ok(f.params.every((p) => typeof p === 'string' && p.includes(perigoso)));
});

test('filtros se combinam e ficam registrados', () => {
  const f = construirFiltro({
    de: '2026-09-01', ate: '2026-09-30', status: 'aprovado', tipo: 'impressao',
    cliente_id: '2', criado_por: '1', valor_min: '100', valor_max: '5000',
    material_id: '3', descricao_item: 'engrenagem',
  });
  assert.strictEqual((f.clausula.match(/AND/g) || []).length >= 9, true);
  assert.deepStrictEqual(f.ativos, [
    'de', 'ate', 'status', 'tipo', 'cliente_id', 'criado_por',
    'valor_min', 'valor_max', 'material_id', 'descricao_item',
  ]);
});

test('texto em branco não vira filtro', () => {
  assert.deepStrictEqual(construirFiltro({ descricao_item: '   ' }).params, []);
  assert.deepStrictEqual(construirFiltro({ busca: '' }).params, []);
});

test('granularidade: dia em período curto, mês em período longo', () => {
  assert.strictEqual(granularidade('2026-09-01', '2026-09-30'), 'dia');
  assert.strictEqual(granularidade('2026-07-01', '2026-08-31'), 'dia');   // 61 dias
  assert.strictEqual(granularidade('2026-01-01', '2026-12-31'), 'mes');
  // Sem período definido, o histórico inteiro por dia seria ilegível.
  assert.strictEqual(granularidade(null, null), 'mes');
  assert.strictEqual(granularidade('2026-09-01', null), 'mes');
});
