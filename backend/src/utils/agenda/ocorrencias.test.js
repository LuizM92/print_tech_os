const test = require('node:test');
const assert = require('node:assert');
const { ocorrencias, ocorrenciaEm, inicioDaSerieAposEdicao } = require('./ocorrencias');

const evento = (extra) => ({
  data_inicio: '2026-10-05', data_fim: '2026-10-05', repete: 'nao', repete_cada: 1, repete_ate: null, ...extra,
});
const datas = (lista) => lista.map((o) => o.data);

test('evento que não se repete aparece só quando o dia cai no intervalo', () => {
  const e = evento();
  assert.deepStrictEqual(datas(ocorrencias(e, '2026-10-01', '2026-10-31')), ['2026-10-05']);
  assert.deepStrictEqual(ocorrencias(e, '2026-11-01', '2026-11-30'), []);
  assert.deepStrictEqual(ocorrencias(e, '2026-10-05', '2026-10-05').length, 1);   // bordas inclusivas
});

test('evento de vários dias aparece se qualquer dia dele toca o intervalo', () => {
  const e = evento({ data_inicio: '2026-10-28', data_fim: '2026-11-02' });
  assert.deepStrictEqual(datas(ocorrencias(e, '2026-11-01', '2026-11-30')), ['2026-10-28']);
  assert.strictEqual(ocorrencias(e, '2026-11-03', '2026-11-30').length, 0);
});

test('semanal: uma ocorrência por semana, no mesmo dia da semana', () => {
  const e = evento({ repete: 'semanal' });
  assert.deepStrictEqual(
    datas(ocorrencias(e, '2026-10-01', '2026-10-31')),
    ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'],
  );
});

test('"a cada 2 semanas" pula uma', () => {
  const e = evento({ repete: 'semanal', repete_cada: 2 });
  assert.deepStrictEqual(
    datas(ocorrencias(e, '2026-10-01', '2026-11-15')),
    ['2026-10-05', '2026-10-19', '2026-11-02'],
  );
});

test('diária respeita a data final da repetição', () => {
  const e = evento({ repete: 'diaria', repete_ate: '2026-10-08' });
  assert.deepStrictEqual(
    datas(ocorrencias(e, '2026-10-01', '2026-10-31')),
    ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'],
  );
});

test('série vista bem depois do início não perde nem inventa ocorrência', () => {
  const e = evento({ data_inicio: '2024-01-01', data_fim: '2024-01-01', repete: 'semanal' }); // segunda
  const lista = datas(ocorrencias(e, '2026-10-01', '2026-10-31'));
  assert.deepStrictEqual(lista, ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
});

test('mensal no dia 31 cai no último dia do mês curto e volta ao 31', () => {
  const e = evento({ data_inicio: '2026-01-31', data_fim: '2026-01-31', repete: 'mensal' });
  assert.deepStrictEqual(
    datas(ocorrencias(e, '2026-01-01', '2026-04-30')),
    ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'],
  );
});

test('anual aparece uma vez por ano', () => {
  const e = evento({ data_inicio: '2024-03-10', data_fim: '2024-03-10', repete: 'anual' });
  assert.deepStrictEqual(datas(ocorrencias(e, '2026-01-01', '2026-12-31')), ['2026-03-10']);
});

test('ocorrência apagada some da série e as outras ficam', () => {
  const e = evento({ repete: 'semanal' });
  assert.deepStrictEqual(
    datas(ocorrencias(e, '2026-10-01', '2026-10-20', ['2026-10-12'])),
    ['2026-10-05', '2026-10-19'],
  );
});

test('evento de vários dias que se repete leva a duração junto', () => {
  const e = evento({ data_inicio: '2026-10-05', data_fim: '2026-10-06', repete: 'semanal' });
  const [primeira, segunda] = ocorrencias(e, '2026-10-01', '2026-10-31');
  assert.deepStrictEqual(primeira, { data: '2026-10-05', data_fim: '2026-10-06' });
  assert.deepStrictEqual(segunda, { data: '2026-10-12', data_fim: '2026-10-13' });
  // Uma ocorrência que começou antes do intervalo mas ainda está rolando conta.
  assert.deepStrictEqual(datas(ocorrencias(e, '2026-10-13', '2026-10-13')), ['2026-10-12']);
});

test('ocorrenciaEm só acha dia que existe na série', () => {
  const e = evento({ repete: 'semanal' });
  assert.ok(ocorrenciaEm(e, '2026-10-19'));
  assert.strictEqual(ocorrenciaEm(e, '2026-10-20'), null);
  assert.strictEqual(ocorrenciaEm(e, '2026-10-19', ['2026-10-19']), null);
});

test('mudar a data de uma ocorrência desloca a série pelo mesmo tanto', () => {
  const e = evento({ repete: 'semanal' });
  // 3ª segunda (19/10) passada para terça (20/10): a série inteira vai para a terça.
  assert.strictEqual(inicioDaSerieAposEdicao(e, '2026-10-19', '2026-10-20'), '2026-10-06');
  assert.strictEqual(inicioDaSerieAposEdicao(e, '2026-10-19', '2026-10-19'), '2026-10-05');
  assert.strictEqual(inicioDaSerieAposEdicao(e, '2026-10-19', '2026-10-18'), '2026-10-04');
});
