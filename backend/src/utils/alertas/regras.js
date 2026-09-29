/**
 * O que vira alerta e com que texto. Função pura: recebe o evento do monitor e o
 * contexto, devolve a notificação (ou null para não avisar). O envio fica em index.js.
 *
 * Avisa: impressão concluída, erro, pausa que ninguém pediu pelo sistema e impressora
 * que caiu da rede no meio de um job. Não avisa cancelamento — quem cancela já sabe.
 */

/** Nome do arquivo como se reconhece de longe: sem pasta, sem extensão. */
const nomeArquivo = (a) => (a ? String(a).split('/').pop().replace(/\.(gcode|gx|3mf|bgcode)$/i, '') : null);

/** 3h24 · 45min */
function fmtDuracao(s) {
  if (!s && s !== 0) return null;
  const min = Math.round(s / 60);
  if (min < 1) return '<1min';
  const h = Math.floor(min / 60);
  return h ? `${h}h${String(min % 60).padStart(2, '0')}` : `${min}min`;
}

const juntar = (...partes) => partes.filter(Boolean).join(' · ');

/** Com a OS já no texto, o número no começo do nome do arquivo só repete. */
const semNumeroOs = (nome) => (nome ? nome.replace(/^os[-_ ]?\d{6}[-_ ]?\d{4}\s*[-_]*\s*/i, '') || nome : nome);

/**
 * @param imp  impressora ({ id, nome })
 * @param ev   evento do monitor ({ tipo, arquivo, detalhe, duracao_s })
 * @param ctx  { atual, numeroOs, pausaPedida }
 */
function montarAlerta(imp, ev, ctx = {}) {
  const { atual, numeroOs, pausaPedida } = ctx;
  const arquivo = numeroOs ? semNumeroOs(nomeArquivo(ev.arquivo)) : nomeArquivo(ev.arquivo);
  const tag = `impressora-${imp.id}`;
  const url = '/impressoras';

  if (ev.tipo === 'concluida') {
    return {
      titulo: `${imp.nome} terminou`,
      corpo: juntar(numeroOs, arquivo, fmtDuracao(ev.duracao_s)) || 'Impressão concluída',
      tag,
      url,
    };
  }

  if (ev.tipo === 'erro') {
    return {
      titulo: arquivo ? `${imp.nome}: a impressão falhou` : `${imp.nome} com erro`,
      corpo: juntar(ev.detalhe || atual?.mensagem, numeroOs, arquivo) || 'Erro sem descrição',
      tag,
      url,
    };
  }

  if (ev.tipo === 'pausada') {
    // Pausa pedida pela tela do sistema não é surpresa para ninguém.
    if (pausaPedida) return null;
    return {
      titulo: `${imp.nome} pausou`,
      corpo: juntar(atual?.job?.etapa || atual?.mensagem || 'Sem motivo informado', numeroOs, arquivo),
      tag,
      url,
    };
  }

  return null;
}

function alertaOffline(imp, { arquivo, numeroOs, minutos }) {
  return {
    titulo: `${imp.nome} caiu da rede`,
    corpo: juntar(
      `Sem resposta há ${minutos} min no meio da impressão`,
      numeroOs,
      numeroOs ? semNumeroOs(nomeArquivo(arquivo)) : nomeArquivo(arquivo),
    ),
    tag: `impressora-${imp.id}`,
    url: '/impressoras',
  };
}

function alertaVoltou(imp) {
  return {
    titulo: `${imp.nome} voltou à rede`,
    corpo: 'Confira se a impressão continuou',
    tag: `impressora-${imp.id}`,
    url: '/impressoras',
  };
}

module.exports = { montarAlerta, alertaOffline, alertaVoltou, nomeArquivo, fmtDuracao };
