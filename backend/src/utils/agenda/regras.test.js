const test = require('node:test');
const assert = require('node:assert');
const { validar } = require('./regras');

const base = { titulo: 'Reunião', data_inicio: '2026-10-06', hora_inicio: '14:00', hora_fim: '15:00' };

test('evento válido sai normalizado, com padrões e sem repetição', () => {
  const { dados, erro } = validar(base);
  assert.strictEqual(erro, undefined);
  assert.strictEqual(dados.tipo, 'evento');
  assert.strictEqual(dados.data_fim, '2026-10-06');
  assert.strictEqual(dados.cor, 'roxo');
  assert.strictEqual(dados.repete, 'nao');
  assert.deepStrictEqual(dados.lembretes, []);
  assert.strictEqual(dados.privado, 0);
});

test('título é obrigatório e é aparado', () => {
  assert.strictEqual(validar({ ...base, titulo: '   ' }).erro, 'Informe o título');
  assert.strictEqual(validar({ ...base, titulo: '  Visita  ' }).dados.titulo, 'Visita');
});

test('data inexistente é recusada', () => {
  assert.ok(validar({ ...base, data_inicio: '2026-02-30' }).erro);
  assert.ok(validar({ ...base, data_inicio: undefined }).erro);
});

test('evento com horário precisa de início e término, e o término vem depois', () => {
  assert.ok(validar({ ...base, hora_inicio: undefined }).erro);
  assert.ok(validar({ ...base, hora_fim: undefined }).erro);
  assert.ok(validar({ ...base, hora_fim: '14:00' }).erro);
  assert.ok(validar({ ...base, hora_fim: '13:00' }).erro);
  assert.ok(validar({ ...base, hora_inicio: '25:00' }).erro);
  // Atravessando a meia-noite o término "menor" é válido: cai no dia seguinte.
  assert.strictEqual(
    validar({ ...base, hora_inicio: '22:00', hora_fim: '02:00', data_fim: '2026-10-07' }).erro, undefined,
  );
});

test('aceita HH:MM:SS (como o banco devolve) e guarda HH:MM', () => {
  const { dados } = validar({ ...base, hora_inicio: '14:00:00', hora_fim: '15:30:00' });
  assert.strictEqual(dados.hora_inicio, '14:00');
  assert.strictEqual(dados.hora_fim, '15:30');
});

test('dia inteiro não guarda hora', () => {
  const { dados } = validar({ ...base, dia_inteiro: true });
  assert.strictEqual(dados.hora_inicio, null);
  assert.strictEqual(dados.hora_fim, null);
});

test('fim antes do início e evento longo demais são recusados', () => {
  assert.ok(validar({ ...base, data_fim: '2026-10-05' }).erro);
  assert.ok(validar({ ...base, dia_inteiro: true, data_fim: '2027-06-01' }).erro);
});

test('tarefa tem um dia só, horário opcional e não se repete', () => {
  const diaInteiro = validar({
    tipo: 'tarefa', titulo: 'Ligar para o fornecedor', data_inicio: '2026-10-06', dia_inteiro: true,
    data_fim: '2026-10-09', repete: 'semanal',
  }).dados;
  assert.strictEqual(diaInteiro.data_fim, '2026-10-06');
  assert.strictEqual(diaInteiro.repete, 'nao');
  assert.strictEqual(diaInteiro.hora_inicio, null);

  const comHora = validar({ tipo: 'tarefa', titulo: 'Ligar', data_inicio: '2026-10-06', hora_inicio: '09:30' }).dados;
  assert.strictEqual(comHora.hora_inicio, '09:30');
  assert.strictEqual(comHora.hora_fim, null);
});

test('repetição: frequência, intervalo e data final conferidos', () => {
  const ok = validar({ ...base, repete: 'semanal', repete_cada: 2, repete_ate: '2026-12-31' }).dados;
  assert.strictEqual(ok.repete, 'semanal');
  assert.strictEqual(ok.repete_cada, 2);
  assert.strictEqual(ok.repete_ate, '2026-12-31');

  assert.ok(validar({ ...base, repete: 'quinzenal' }).erro);
  assert.ok(validar({ ...base, repete: 'semanal', repete_cada: 500 }).erro);
  assert.ok(validar({ ...base, repete: 'semanal', repete_ate: '2026-10-01' }).erro);
  assert.strictEqual(validar({ ...base, repete: 'nao', repete_ate: '2026-12-31' }).dados.repete_ate, null);
});

test('lembretes: só os valores da lista, sem repetir, do maior para o menor', () => {
  assert.deepStrictEqual(validar({ ...base, lembretes: [10, 60, 10] }).dados.lembretes, [60, 10]);
  assert.ok(validar({ ...base, lembretes: [7] }).erro);
  assert.ok(validar({ ...base, lembretes: [0, 5, 10, 15, 30, 60] }).erro);   // seis
});

test('item de dia inteiro só aceita lembrete em dias', () => {
  const dia = { ...base, dia_inteiro: true };
  assert.deepStrictEqual(validar({ ...dia, lembretes: [1440, 0] }).dados.lembretes, [1440, 0]);
  assert.ok(validar({ ...dia, lembretes: [30] }).erro);
});

test('privado ignora responsável e aviso para todos', () => {
  const { dados } = validar({ ...base, privado: true, para_todos: true, responsavel_id: 3 });
  assert.strictEqual(dados.privado, 1);
  assert.strictEqual(dados.para_todos, 0);
  assert.strictEqual(dados.responsavel_id, null);
});

test('responsável e "todos" não convivem: todos vence', () => {
  const um = validar({ ...base, responsavel_id: '3' }).dados;
  assert.strictEqual(um.responsavel_id, 3);
  const todos = validar({ ...base, para_todos: true, responsavel_id: 3 }).dados;
  assert.strictEqual(todos.para_todos, 1);
  assert.strictEqual(todos.responsavel_id, null);
});

test('cor e tipo fora da lista são recusados', () => {
  assert.ok(validar({ ...base, cor: 'neon' }).erro);
  assert.ok(validar({ ...base, tipo: 'reuniao' }).erro);
});
