/**
 * Repetição de eventos.
 *
 * Um evento que se repete é UMA linha em `agenda_itens`; as ocorrências não são gravadas,
 * saem daqui para o intervalo que a tela pediu. Assim "toda segunda, sem data final" não
 * enche a tabela, e mudar o evento muda todas de uma vez.
 *
 * Cada data é contada a partir do início da série, e não da anterior — como nas despesas
 * recorrentes: um evento do dia 31 cai em 28/02 e volta ao dia 31 em março.
 *
 * Puro: sem banco e sem relógio.
 */
const { somarDias, somarMeses, diasEntre } = require('../financeiro/datas');

// Trava de segurança do laço (uma série diária de décadas, vista de longe, ainda cabe).
const LIMITE_DE_PASSOS = 5000;

const inicioDaOcorrencia = (item, k) => {
  const cada = item.repete_cada || 1;
  switch (item.repete) {
    case 'diaria': return somarDias(item.data_inicio, cada * k);
    case 'semanal': return somarDias(item.data_inicio, 7 * cada * k);
    case 'mensal': return somarMeses(item.data_inicio, cada * k);
    case 'anual': return somarMeses(item.data_inicio, 12 * cada * k);
    default: return item.data_inicio;
  }
};

/** Dias entre uma ocorrência e a seguinte, quando é um número fixo (diária e semanal). */
const passoEmDias = (item) => {
  const cada = item.repete_cada || 1;
  if (item.repete === 'diaria') return cada;
  if (item.repete === 'semanal') return 7 * cada;
  return null;
};

/**
 * As ocorrências do item que tocam o intervalo [de, ate] (datas AAAA-MM-DD, inclusive).
 * Cada uma é { data, data_fim }; evento de vários dias aparece se qualquer dia cai dentro.
 * `excecoes` são os inícios (AAAA-MM-DD) que foram apagados da série.
 */
const ocorrencias = (item, de, ate, excecoes = []) => {
  const duracao = diasEntre(item.data_inicio, item.data_fim);
  const montar = (inicio) => ({ data: inicio, data_fim: somarDias(inicio, duracao) });

  if (!item.repete || item.repete === 'nao') {
    return item.data_inicio <= ate && item.data_fim >= de ? [montar(item.data_inicio)] : [];
  }

  const apagadas = new Set(excecoes);
  const resultado = [];

  // Série diária ou semanal vista bem depois do início: pula direto para perto do intervalo.
  let k = 0;
  const passo = passoEmDias(item);
  if (passo) {
    const falta = diasEntre(item.data_inicio, de) - duracao;
    if (falta > 0) k = Math.floor(falta / passo);
  }

  for (let n = 0; n < LIMITE_DE_PASSOS; n++, k++) {
    const inicio = inicioDaOcorrencia(item, k);
    if (inicio > ate) break;
    if (item.repete_ate && inicio > item.repete_ate) break;
    if (somarDias(inicio, duracao) < de) continue;
    if (apagadas.has(inicio)) continue;
    resultado.push(montar(inicio));
  }
  return resultado;
};

/** A ocorrência que começa em `data`, se existir na série (confere antes de apagar ou editar). */
const ocorrenciaEm = (item, data, excecoes = []) =>
  ocorrencias(item, data, data, excecoes).find((o) => o.data === data) || null;

/**
 * Editar uma ocorrência vale para a série toda: mudar a data dela desloca o início da
 * série pelo mesmo número de dias. Sem isso, mexer na terceira segunda-feira para 15h
 * jogaria o evento de volta para a primeira.
 */
const inicioDaSerieAposEdicao = (item, dataDaOcorrencia, novaData) =>
  somarDias(item.data_inicio, diasEntre(dataDaOcorrencia, novaData));

module.exports = { ocorrencias, ocorrenciaEm, inicioDaSerieAposEdicao };
