/**
 * Regras da agenda: o que um evento ou tarefa pode ter, e a validação do que chega do
 * cliente. Tudo puro — o controller só grava o que sair daqui.
 *
 * Datas são texto AAAA-MM-DD e horas são HH:MM no relógio de Brasília, como no financeiro
 * (ver utils/financeiro/datas.js): um compromisso é "dia 10 às 14:00", não um instante, e
 * não existe fuso para deslocar isso em um dia.
 *
 * Quem mexe aqui mexe também em frontend/src/utils/agenda.js, que espelha estas listas.
 */
const { ehDataISO, diasEntre } = require('../financeiro/datas');

const TIPOS = ['evento', 'tarefa'];
const REPETICOES = ['nao', 'diaria', 'semanal', 'mensal', 'anual'];
const CORES = ['roxo', 'verde', 'ambar', 'vermelho', 'azul', 'rosa', 'ciano', 'cinza'];

// Minutos antes do início. Item sem horário (dia inteiro) não tem "15 min antes": o
// lembrete é medido a partir das 08:00 do dia, em dias inteiros.
const LEMBRETES_HORARIO = [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080];
const LEMBRETES_DIA = [0, 1440, 2880, 10080];
const MAX_LEMBRETES = 5;
const HORA_DIA_INTEIRO = '08:00';

// Um intervalo digitado errado (ano 2926) não vira um evento de séculos.
const MAX_DIAS_DO_EVENTO = 60;
const MAX_REPETE_CADA = 99;

const ehHora = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';

const texto = (v, max) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t.slice(0, max);
};

const inteiro = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Confere e normaliza o corpo de uma criação ou edição. Devolve `{ erro }` ou `{ dados }`
 * — os dados já no formato das colunas, sem nada que o cliente possa ter mandado a mais.
 */
const validar = (corpo = {}) => {
  const tipo = corpo.tipo || 'evento';
  if (!TIPOS.includes(tipo)) return { erro: 'Tipo inválido' };

  const titulo = texto(corpo.titulo, 150);
  if (!titulo) return { erro: 'Informe o título' };

  const dataInicio = corpo.data_inicio;
  if (!ehDataISO(dataInicio)) return { erro: 'Informe a data' };

  // A tarefa tem um dia só; só o evento atravessa dias.
  const dataFim = tipo === 'tarefa' ? dataInicio : (corpo.data_fim || dataInicio);
  if (!ehDataISO(dataFim)) return { erro: 'Data final inválida' };
  if (dataFim < dataInicio) return { erro: 'O fim não pode ser antes do início' };
  if (diasEntre(dataInicio, dataFim) > MAX_DIAS_DO_EVENTO) {
    return { erro: `Um evento pode durar no máximo ${MAX_DIAS_DO_EVENTO} dias` };
  }

  const diaInteiro = bool(corpo.dia_inteiro);
  let horaInicio = null;
  let horaFim = null;
  if (!diaInteiro) {
    if (!ehHora(corpo.hora_inicio)) return { erro: 'Informe o horário de início' };
    horaInicio = corpo.hora_inicio.slice(0, 5);
    if (tipo === 'evento') {
      if (!ehHora(corpo.hora_fim)) return { erro: 'Informe o horário de término' };
      horaFim = corpo.hora_fim.slice(0, 5);
      if (dataFim === dataInicio && horaFim <= horaInicio) {
        return { erro: 'O término precisa ser depois do início' };
      }
    }
  }

  const cor = corpo.cor || 'roxo';
  if (!CORES.includes(cor)) return { erro: 'Cor inválida' };

  // Só evento se repete: tarefa concluída vale para o item todo, não por ocorrência.
  let repete = 'nao';
  let repeteCada = 1;
  let repeteAte = null;
  if (tipo === 'evento' && corpo.repete && corpo.repete !== 'nao') {
    if (!REPETICOES.includes(corpo.repete)) return { erro: 'Repetição inválida' };
    repete = corpo.repete;
    repeteCada = parseInt(corpo.repete_cada, 10) || 1;
    if (repeteCada < 1 || repeteCada > MAX_REPETE_CADA) {
      return { erro: `A repetição vai de 1 a ${MAX_REPETE_CADA}` };
    }
    if (corpo.repete_ate) {
      if (!ehDataISO(corpo.repete_ate)) return { erro: 'Data final da repetição inválida' };
      if (corpo.repete_ate < dataInicio) return { erro: 'A repetição não pode terminar antes do evento' };
      repeteAte = corpo.repete_ate;
    }
  }

  const permitidos = diaInteiro ? LEMBRETES_DIA : LEMBRETES_HORARIO;
  const pedidos = Array.isArray(corpo.lembretes) ? corpo.lembretes.map((n) => parseInt(n, 10)) : [];
  if (pedidos.some((n) => !permitidos.includes(n))) return { erro: 'Lembrete inválido' };
  const lembretes = [...new Set(pedidos)].sort((a, b) => b - a);
  if (lembretes.length > MAX_LEMBRETES) return { erro: `No máximo ${MAX_LEMBRETES} lembretes` };

  // Privado é só de quem criou: sem responsável e sem aviso para os outros.
  const privado = bool(corpo.privado);
  const paraTodos = !privado && bool(corpo.para_todos);
  const responsavelId = !privado && !paraTodos ? inteiro(corpo.responsavel_id) : null;

  return {
    dados: {
      tipo,
      titulo,
      descricao: texto(corpo.descricao, 1000),
      lugar: texto(corpo.lugar, 150),
      cor,
      data_inicio: dataInicio,
      hora_inicio: horaInicio,
      data_fim: dataFim,
      hora_fim: horaFim,
      repete,
      repete_cada: repeteCada,
      repete_ate: repeteAte,
      privado: privado ? 1 : 0,
      para_todos: paraTodos ? 1 : 0,
      responsavel_id: responsavelId,
      lembretes,
    },
  };
};

module.exports = {
  TIPOS, REPETICOES, CORES, LEMBRETES_HORARIO, LEMBRETES_DIA, MAX_LEMBRETES,
  HORA_DIA_INTEIRO, MAX_DIAS_DO_EVENTO, validar,
};
