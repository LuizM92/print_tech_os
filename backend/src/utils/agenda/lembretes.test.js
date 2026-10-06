const test = require('node:test');
const assert = require('node:assert');
const { instante } = require('../financeiro/datas');
const { gatilhos, montarAviso, quandoTexto } = require('./lembretes');

const item = (extra) => ({
  id: 7, tipo: 'evento', titulo: 'Reunião', lugar: null,
  data_inicio: '2026-10-06', data_fim: '2026-10-06', hora_inicio: '14:00', hora_fim: '15:00',
  repete: 'nao', repete_cada: 1, repete_ate: null, lembretes: [30], excecoes: [], ...extra,
});

// A janela é sempre (ini, fim]: o que já passou de `ini` não dispara de novo.
const janela = (fimDia, fimHora, minutos = 60) => {
  const fim = instante(fimDia, fimHora);
  return [fim - minutos, fim];
};

test('dispara quando o relógio passa do horário do lembrete', () => {
  // 14:00 - 30 min = 13:30
  const [ini, fim] = janela('2026-10-06', '13:31', 5);
  assert.deepStrictEqual(gatilhos(item(), ini, fim).map((g) => [g.data, g.minutos]), [['2026-10-06', 30]]);
});

test('não dispara antes da hora nem depois que a janela passou', () => {
  const antes = janela('2026-10-06', '13:29', 5);
  assert.strictEqual(gatilhos(item(), ...antes).length, 0);
  const depois = janela('2026-10-06', '13:40', 5);   // (13:35, 13:40] já não pega 13:30
  assert.strictEqual(gatilhos(item(), ...depois).length, 0);
});

test('o limite inferior é exclusivo e o superior inclusivo: cada gatilho cai em uma janela só', () => {
  const alvo = instante('2026-10-06', '13:30');
  assert.strictEqual(gatilhos(item(), alvo - 5, alvo).length, 1);
  assert.strictEqual(gatilhos(item(), alvo, alvo + 5).length, 0);
});

test('vários lembretes do mesmo evento disparam cada um no seu momento', () => {
  const e = item({ lembretes: [60, 10] });
  const doDia = janela('2026-10-06', '14:00', 120);
  const minutos = gatilhos(e, ...doDia).map((g) => g.minutos).sort((a, b) => a - b);
  assert.deepStrictEqual(minutos, [10, 60]);
});

test('lembrete de um dia antes cruza a meia-noite', () => {
  const e = item({ lembretes: [1440] });
  const [ini, fim] = janela('2026-10-05', '14:01', 5);
  assert.deepStrictEqual(gatilhos(e, ini, fim).map((g) => g.data), ['2026-10-06']);
});

test('item sem horário é medido a partir das 08:00', () => {
  const tarefa = item({ tipo: 'tarefa', hora_inicio: null, hora_fim: null, lembretes: [0] });
  const [ini, fim] = janela('2026-10-06', '08:01', 5);
  assert.strictEqual(gatilhos(tarefa, ini, fim).length, 1);

  const umDiaAntes = item({ tipo: 'tarefa', hora_inicio: null, hora_fim: null, lembretes: [1440] });
  const [i2, f2] = janela('2026-10-05', '08:01', 5);
  assert.deepStrictEqual(gatilhos(umDiaAntes, i2, f2).map((g) => g.data), ['2026-10-06']);
});

test('evento recorrente dispara a ocorrência do dia, e só ela', () => {
  const e = item({ repete: 'semanal' });   // terças, 14:00
  const naTerca = janela('2026-10-13', '13:31', 5);
  assert.deepStrictEqual(gatilhos(e, ...naTerca).map((g) => g.data), ['2026-10-13']);
  const naQuarta = janela('2026-10-14', '13:31', 5);
  assert.strictEqual(gatilhos(e, ...naQuarta).length, 0);
});

test('ocorrência apagada da série não dispara', () => {
  const e = item({ repete: 'semanal', excecoes: ['2026-10-13'] });
  assert.strictEqual(gatilhos(e, ...janela('2026-10-13', '13:31', 5)).length, 0);
});

test('item sem lembrete não dispara nada', () => {
  assert.deepStrictEqual(gatilhos(item({ lembretes: [] }), 0, 1e9), []);
});

test('texto do aviso: tipo, quando e local', () => {
  assert.strictEqual(quandoTexto(item(), '2026-10-06', '2026-10-06'), 'hoje às 14:00');
  assert.strictEqual(quandoTexto(item(), '2026-10-07', '2026-10-06'), 'amanhã às 14:00');
  assert.strictEqual(quandoTexto(item({ hora_inicio: null }), '2026-10-12', '2026-10-06'), '12/10');

  const aviso = montarAviso(item({ lugar: 'Galpão' }), '2026-10-06', 30, '2026-10-06');
  assert.strictEqual(aviso.tipo, 'agenda');
  assert.strictEqual(aviso.titulo, 'Reunião');
  assert.strictEqual(aviso.corpo, 'Evento hoje às 14:00 · Galpão');
  assert.strictEqual(aviso.url, '/agenda?dia=2026-10-06');

  const tarefa = montarAviso(item({ tipo: 'tarefa', hora_inicio: null }), '2026-10-06', 0, '2026-10-06');
  assert.strictEqual(tarefa.corpo, 'Tarefa hoje');
});
