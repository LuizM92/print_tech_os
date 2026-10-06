// Agenda: datas, cores, rótulos e a disposição dos itens na grade.
//
// Datas são texto AAAA-MM-DD e horas são HH:MM, como no financeiro: um compromisso é
// "dia 10 às 14:00", e passar por `new Date` deslocaria o dia pelo fuso. `Date` só entra
// aqui em UTC, para o calendário (dia da semana, soma de dias) — nunca para ler o relógio.
//
// As listas de tipos, cores e lembretes espelham backend/src/utils/agenda/regras.js —
// mudou lá, muda aqui.

import { fmtDiaISO } from './format';

const dois = (n) => String(n).padStart(2, '0');
const separar = (iso) => iso.split('-').map((n) => parseInt(n, 10));
const deUTC = (d) => `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}`;

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const DIAS_SEMANA_LONGO = [
  'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado',
];

// ─── Calendário ─────────────────────────────────────────────────────────────

const FUSO = 'America/Sao_Paulo';

/** Hoje (AAAA-MM-DD) em Brasília — o mesmo dia que o servidor usa, e não o do aparelho. */
export const hojeBR = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

/** A hora de agora (HH:MM) em Brasília. */
export const horaBR = () => new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date());

export const somarDias = (iso, n) => {
  const [a, m, d] = separar(iso);
  return deUTC(new Date(Date.UTC(a, m - 1, d + n)));
};

/** Soma meses mantendo o dia e, no mês curto, cai no último: 31/01 + 1 mês = 28/02. */
export const somarMeses = (iso, n) => {
  const [a, m, d] = separar(iso);
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = total % 12;
  const noMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return deUTC(new Date(Date.UTC(ano, mes, Math.min(d, noMes))));
};

export const diasEntre = (de, ate) => {
  const [a1, m1, d1] = separar(de);
  const [a2, m2, d2] = separar(ate);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
};

/** 0 = domingo … 6 = sábado. */
export const diaDaSemana = (iso) => {
  const [a, m, d] = separar(iso);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
};

/** A semana começa no domingo, como no Google Agenda em português. */
export const inicioDaSemana = (iso) => somarDias(iso, -diaDaSemana(iso));
export const primeiroDoMes = (iso) => `${iso.slice(0, 8)}01`;
export const ultimoDoMes = (iso) => {
  const [a, m] = separar(iso);
  return deUTC(new Date(Date.UTC(a, m, 0)));
};

export const diaDoMes = (iso) => parseInt(iso.slice(8, 10), 10);
export const mesmoMes = (a, b) => a.slice(0, 7) === b.slice(0, 7);

export const intervalo = (de, ate) => {
  const dias = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
};

/** As semanas do mês, de domingo a sábado, incluindo os dias vizinhos que completam a grade. */
export const semanasDoMes = (foco) => {
  const inicio = inicioDaSemana(primeiroDoMes(foco));
  const fim = somarDias(inicioDaSemana(ultimoDoMes(foco)), 6);
  const dias = intervalo(inicio, fim);
  return Array.from({ length: dias.length / 7 }, (_, i) => dias.slice(i * 7, i * 7 + 7));
};

export const VISOES = [
  { id: 'mes', rotulo: 'Mês' },
  { id: 'semana', rotulo: 'Semana' },
  { id: 'dia', rotulo: 'Dia' },
  { id: 'lista', rotulo: 'Agenda' },
];

/** O intervalo de dias que a visão precisa, para pedir ao servidor. */
export const intervaloDaVisao = (visao, foco) => {
  if (visao === 'dia') return { de: foco, ate: foco };
  if (visao === 'semana') {
    const de = inicioDaSemana(foco);
    return { de, ate: somarDias(de, 6) };
  }
  if (visao === 'lista') return { de: primeiroDoMes(foco), ate: ultimoDoMes(foco) };
  const semanas = semanasDoMes(foco);
  return { de: semanas[0][0], ate: semanas[semanas.length - 1][6] };
};

/** Quanto o botão ‹ › anda: um mês, uma semana ou um dia. */
export const andar = (visao, foco, sentido) => {
  if (visao === 'dia') return somarDias(foco, sentido);
  if (visao === 'semana') return somarDias(foco, 7 * sentido);
  return somarMeses(primeiroDoMes(foco), sentido);
};

// ─── Textos ─────────────────────────────────────────────────────────────────

const mesCurto = (iso) => MESES[parseInt(iso.slice(5, 7), 10) - 1].slice(0, 3);

/** "terça-feira, 6 de outubro" (com o ano, se não for o de `ano`). */
export const fmtDiaLongo = (iso, ano) => {
  const [a, m, d] = separar(iso);
  const base = `${DIAS_SEMANA_LONGO[diaDaSemana(iso)]}, ${d} de ${MESES[m - 1]}`;
  return a === ano || ano === undefined ? base : `${base} de ${a}`;
};

export const tituloDoPeriodo = (visao, foco) => {
  const [a, m] = separar(foco);
  if (visao === 'dia') return `${diaDoMes(foco)} de ${MESES[m - 1]} de ${a}`;
  if (visao === 'semana') {
    const de = inicioDaSemana(foco);
    const ate = somarDias(de, 6);
    if (mesmoMes(de, ate)) return `${diaDoMes(de)} – ${diaDoMes(ate)} de ${MESES[m - 1]} de ${a}`;
    const anoAte = parseInt(ate.slice(0, 4), 10);
    return `${diaDoMes(de)} ${mesCurto(de)} – ${diaDoMes(ate)} ${mesCurto(ate)} ${anoAte}`;
  }
  return `${MESES[m - 1]} de ${a}`;
};

export const fmtHora = (hhmm) => (hhmm ? hhmm.slice(0, 5) : '');

/** "14:00 – 15:00", "14:00", "Dia inteiro". */
export const rotuloHorario = (it) => {
  if (it.dia_inteiro) return 'Dia inteiro';
  return it.hora_fim && it.data === it.data_fim ? `${fmtHora(it.hora_inicio)} – ${fmtHora(it.hora_fim)}` : fmtHora(it.hora_inicio);
};

/** "terça-feira, 6 de outubro · 14:00 – 15:00", ou o intervalo, se atravessa dias. */
export const rotuloQuando = (it, anoAtual) => {
  const fimDiferente = it.data_fim && it.data_fim !== it.data;
  if (!fimDiferente) return `${fmtDiaLongo(it.data, anoAtual)} · ${rotuloHorario(it)}`;
  const ini = it.dia_inteiro ? '' : ` ${fmtHora(it.hora_inicio)}`;
  const fim = it.dia_inteiro ? '' : ` ${fmtHora(it.hora_fim)}`;
  return `${fmtDiaLongo(it.data, anoAtual)}${ini} → ${fmtDiaLongo(it.data_fim, anoAtual)}${fim}`;
};

export const REPETICOES = [
  { valor: 'nao', rotulo: 'Não se repete' },
  { valor: 'diaria', rotulo: 'Todos os dias', unidade: ['dia', 'dias'] },
  { valor: 'semanal', rotulo: 'Todas as semanas', unidade: ['semana', 'semanas'] },
  { valor: 'mensal', rotulo: 'Todos os meses', unidade: ['mês', 'meses'] },
  { valor: 'anual', rotulo: 'Todos os anos', unidade: ['ano', 'anos'] },
];

export const rotuloRepeticao = (it) => {
  const r = REPETICOES.find((x) => x.valor === it.repete);
  if (!r || r.valor === 'nao') return null;
  const cada = it.repete_cada || 1;
  const base = cada === 1 ? r.rotulo : `A cada ${cada} ${r.unidade[1]}`;
  return it.repete_ate ? `${base}, até ${fmtDiaISO(it.repete_ate)}` : base;
};

// Minutos antes do início. Espelha LEMBRETES_HORARIO / LEMBRETES_DIA do servidor.
export const LEMBRETES_HORARIO = [
  { min: 0, rotulo: 'No horário' },
  { min: 5, rotulo: '5 minutos antes' },
  { min: 10, rotulo: '10 minutos antes' },
  { min: 15, rotulo: '15 minutos antes' },
  { min: 30, rotulo: '30 minutos antes' },
  { min: 60, rotulo: '1 hora antes' },
  { min: 120, rotulo: '2 horas antes' },
  { min: 1440, rotulo: '1 dia antes' },
  { min: 2880, rotulo: '2 dias antes' },
  { min: 10080, rotulo: '1 semana antes' },
];
export const LEMBRETES_DIA = [
  { min: 0, rotulo: 'No dia, às 08:00' },
  { min: 1440, rotulo: '1 dia antes, às 08:00' },
  { min: 2880, rotulo: '2 dias antes, às 08:00' },
  { min: 10080, rotulo: '1 semana antes, às 08:00' },
];
export const MAX_LEMBRETES = 5;

export const opcoesDeLembrete = (diaInteiro) => (diaInteiro ? LEMBRETES_DIA : LEMBRETES_HORARIO);
export const rotuloLembrete = (min, diaInteiro) =>
  opcoesDeLembrete(diaInteiro).find((o) => o.min === min)?.rotulo || `${min} min antes`;

/** O lembrete que já vem marcado ao criar (o usuário troca ou tira). */
export const lembretesPadrao = (tipo, diaInteiro) => (tipo === 'evento' && !diaInteiro ? [30] : [0]);

// ─── Cores ──────────────────────────────────────────────────────────────────

export const CORES = [
  { id: 'roxo', hex: '#6c63ff', rotulo: 'Roxo' },
  { id: 'azul', hex: '#4da3ff', rotulo: 'Azul' },
  { id: 'ciano', hex: '#2bd4e3', rotulo: 'Ciano' },
  { id: 'verde', hex: '#16db93', rotulo: 'Verde' },
  { id: 'ambar', hex: '#f5a623', rotulo: 'Âmbar' },
  { id: 'vermelho', hex: '#ff4d6d', rotulo: 'Vermelho' },
  { id: 'rosa', hex: '#ff6fb5', rotulo: 'Rosa' },
  { id: 'cinza', hex: '#9a9ab8', rotulo: 'Cinza' },
];

export const corDe = (id) => (CORES.find((c) => c.id === id) || CORES[0]).hex;

export const rgba = (hex, alfa) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
};

// O que o resto do sistema põe no calendário, só para leitura.
export const CAMADAS = {
  os: { rotulo: 'Entregas das OS', cor: '#4da3ff', icone: 'producao' },
  receber: { rotulo: 'A receber', cor: '#16db93', icone: 'receber' },
  pagar: { rotulo: 'A pagar', cor: '#ff4d6d', icone: 'pagar' },
};

// ─── Itens ──────────────────────────────────────────────────────────────────

/** Uma camada vira um "item" com o mesmo formato, para as visões tratarem tudo igual. */
export const camadaComoItem = (c) => ({
  ...c,
  tipo: 'camada',
  dia_inteiro: true,
  data_fim: c.data,
  cor: null,
  somente_leitura: true,
});

export const corDoItem = (it) => (it.tipo === 'camada' ? CAMADAS[it.camada].cor : corDe(it.cor));

/** O item aparece neste dia? Evento de vários dias aparece em todos. */
export const noDia = (it, dia) => it.data <= dia && (it.data_fim || it.data) >= dia;

/** Fica na faixa "dia inteiro" no topo da semana/dia (em vez de num horário da grade). */
export const ehDiaInteiro = (it) => it.dia_inteiro || it.tipo === 'camada';

const MIN_DIA = 24 * 60;
export const horaParaMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  return h * 60 + m;
};
export const minParaHora = (min) => `${dois(Math.floor(min / 60) % 24)}:${dois(min % 60)}`;

/** Data e hora como minutos num relógio contínuo, para somar e subtrair sem fuso. */
export const paraMinutos = (data, hora) => {
  const [a, m, d] = separar(data);
  const [h, mi] = (hora || '00:00').split(':').map((n) => parseInt(n, 10));
  return Date.UTC(a, m - 1, d, h, mi) / 60000;
};

export const deMinutos = (min) => {
  const d = new Date(min * 60000);
  return { data: deUTC(d), hora: `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}` };
};

/**
 * Posiciona os itens com horário de um dia na grade. Cada um sai com `ini` e `fim` (em
 * minutos desde 00:00 — o evento que atravessa a meia-noite ocupa o resto do dia e o
 * começo do seguinte) e com `coluna` / `colunas`: os que se sobrepõem dividem a largura,
 * como no Google Agenda.
 */
export const posicionar = (itens, dia, duracaoMinima = 30) => {
  const base = itens.map((item) => {
    const ini = item.data < dia ? 0 : horaParaMin(item.hora_inicio);
    let fim = item.data_fim > dia ? MIN_DIA : (item.hora_fim ? horaParaMin(item.hora_fim) : ini + duracaoMinima);
    fim = Math.min(Math.max(fim, ini + duracaoMinima), MIN_DIA);
    return { item, ini, fim, coluna: 0, colunas: 1 };
  }).sort((a, b) => a.ini - b.ini || b.fim - a.fim);

  const posicionados = [];
  let grupo = [];
  let fimDoGrupo = -1;
  let fimPorColuna = [];

  const fechar = () => {
    grupo.forEach((g) => { g.colunas = fimPorColuna.length; });
    posicionados.push(...grupo);
    grupo = [];
    fimPorColuna = [];
    fimDoGrupo = -1;
  };

  base.forEach((ev) => {
    if (grupo.length > 0 && ev.ini >= fimDoGrupo) fechar();
    let coluna = fimPorColuna.findIndex((fim) => fim <= ev.ini);
    if (coluna === -1) {
      coluna = fimPorColuna.length;
      fimPorColuna.push(ev.fim);
    } else {
      fimPorColuna[coluna] = ev.fim;
    }
    ev.coluna = coluna;
    grupo.push(ev);
    fimDoGrupo = Math.max(fimDoGrupo, ev.fim);
  });
  fechar();
  return posicionados;
};
