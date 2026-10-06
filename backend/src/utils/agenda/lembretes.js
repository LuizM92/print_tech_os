/**
 * Quando cada lembrete dispara, e o texto do aviso.
 *
 * Um lembrete é "N minutos antes do início". Item sem horário (tarefa do dia, evento de
 * dia inteiro) começa às 08:00 para esse fim — a mesma hora do aviso de vencimentos do
 * financeiro. Os instantes são os do relógio de Brasília (ver `instante` em datas.js).
 *
 * Puro: o agendador (avisos.js) lê o banco e chama isto.
 */
const { instante, diaDoInstante, diasEntre } = require('../financeiro/datas');
const { ocorrencias } = require('./ocorrencias');
const { HORA_DIA_INTEIRO } = require('./regras');

/** O instante de início de uma ocorrência, para medir o lembrete. */
const referencia = (item, data) => instante(data, item.hora_inicio || HORA_DIA_INTEIRO);

/**
 * Os lembretes do item que disparam na janela (ini, fim] — `ini` exclusive e `fim`
 * inclusive, em instantes. Cada gatilho é { data, minutos, quando }: a ocorrência
 * (pelo dia em que começa), qual lembrete e o instante em que dispara.
 */
const gatilhos = (item, ini, fim) => {
  const lembretes = item.lembretes || [];
  if (lembretes.length === 0) return [];

  // O gatilho cai antes do início, no máximo `maior` minutos: as ocorrências que
  // interessam começam entre o dia de `ini` e o dia de `fim + maior`.
  const maior = Math.max(...lembretes);
  const de = diaDoInstante(ini);
  const ate = diaDoInstante(fim + maior);

  const resultado = [];
  for (const o of ocorrencias(item, de, ate, item.excecoes)) {
    for (const minutos of lembretes) {
      const quando = referencia(item, o.data) - minutos;
      if (quando > ini && quando <= fim) resultado.push({ data: o.data, minutos, quando });
    }
  }
  return resultado;
};

const dois = (n) => String(n).padStart(2, '0');

/** "hoje às 14:30", "amanhã", "12/10 às 09:00" — o dia visto de `hoje`. */
const quandoTexto = (item, data, hoje) => {
  const dif = diasEntre(hoje, data);
  const [, mes, dia] = data.split('-');
  let quando = `${dois(dia)}/${dois(mes)}`;
  if (dif === 0) quando = 'hoje';
  else if (dif === 1) quando = 'amanhã';
  return item.hora_inicio ? `${quando} às ${item.hora_inicio}` : quando;
};

/** O alerta (sino e push) de um lembrete que disparou. */
const montarAviso = (item, data, minutos, hoje) => ({
  tipo: 'agenda',
  titulo: item.titulo,
  corpo: [
    `${item.tipo === 'tarefa' ? 'Tarefa' : 'Evento'} ${quandoTexto(item, data, hoje)}`,
    item.lugar,
  ].filter(Boolean).join(' · '),
  tag: `agenda-${item.id}-${data}-${minutos}`,
  url: `/agenda?dia=${data}`,
});

module.exports = { referencia, gatilhos, quandoTexto, montarAviso };
