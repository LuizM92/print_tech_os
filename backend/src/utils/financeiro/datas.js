/**
 * Datas do financeiro, sempre como texto AAAA-MM-DD.
 *
 * Duas razões para não usar `Date` solto nem `CURDATE()` do MySQL:
 *
 * - O servidor roda em UTC (o docker-compose não define TZ). Das 21h à meia-noite no
 *   Brasil, "hoje" para o servidor já é amanhã — e uma conta que vence hoje apareceria
 *   vencida. O "hoje" daqui é sempre o de Brasília.
 * - Vencimento é um dia do calendário, não um instante. Em texto não existe fuso para
 *   deslocar a data em um dia.
 */

const FUSO = 'America/Sao_Paulo';

const partesNoFuso = (agora) => {
  const formato = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  });
  return Object.fromEntries(formato.formatToParts(agora).map((p) => [p.type, p.value]));
};

/** O dia de hoje em Brasília. `agora` existe para os testes fixarem o relógio. */
const hojeBR = (agora = new Date()) => {
  const p = partesNoFuso(agora);
  return `${p.year}-${p.month}-${p.day}`;
};

/** A hora (0–23) agora em Brasília. */
const horaBR = (agora = new Date()) => parseInt(partesNoFuso(agora).hour, 10);

const separar = (iso) => iso.split('-').map((n) => parseInt(n, 10));

/** AAAA-MM-DD de um dia que existe no calendário (recusa 2026-02-30). */
const ehDataISO = (valor) => {
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = separar(valor);
  const data = new Date(Date.UTC(a, m - 1, d));
  return data.getUTCFullYear() === a && data.getUTCMonth() === m - 1 && data.getUTCDate() === d;
};

const paraISO = (data) => data.toISOString().slice(0, 10);

const somarDias = (iso, dias) => {
  const [a, m, d] = separar(iso);
  return paraISO(new Date(Date.UTC(a, m - 1, d + dias)));
};

/**
 * Soma meses mantendo o dia — e, quando o mês de destino não tem esse dia, cai no
 * último: 31/01 + 1 mês = 28/02 (ou 29), não 03/03.
 */
const somarMeses = (iso, meses) => {
  const [a, m, d] = separar(iso);
  const total = a * 12 + (m - 1) + meses;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return paraISO(new Date(Date.UTC(ano, mes, Math.min(d, diasNoMes))));
};

/** Dias de `de` até `ate` (positivo quando `ate` é depois). */
const diasEntre = (de, ate) => {
  const [a1, m1, d1] = separar(de);
  const [a2, m2, d2] = separar(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
};

/** 2026-10-04 → 04/10/2026, sem passar por `Date` (e sem o deslocamento de fuso dele). */
const formatarDia = (iso) => iso.split('-').reverse().join('/');

const primeiroDiaDoMes = (iso) => `${iso.slice(0, 8)}01`;

const ultimoDiaDoMes = (iso) => {
  const [a, m] = separar(iso);
  return paraISO(new Date(Date.UTC(a, m, 0)));
};

module.exports = {
  hojeBR, horaBR, ehDataISO, somarDias, somarMeses, diasEntre, formatarDia,
  primeiroDiaDoMes, ultimoDiaDoMes,
};
