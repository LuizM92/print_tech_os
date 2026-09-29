/**
 * Quais viradas de estado viram registro em `impressora_eventos`.
 *
 * O monitor lê cada impressora a cada poucos segundos; gravar toda leitura encheria o
 * banco de "continua imprimindo". Aqui se compara a leitura nova com a anterior e só
 * sai evento quando algo aconteceu de fato. Função pura — sem banco, sem rede.
 */

const EM_ANDAMENTO = ['imprimindo', 'pausada'];

/**
 * @param anterior leitura anterior (null na primeira leitura depois que o servidor sobe)
 * @param atual    leitura nova
 * @returns lista de { tipo, arquivo, detalhe, duracao_s }
 */
function eventosDaTransicao(anterior, atual) {
  // Sem leitura anterior não dá para saber o que mudou — o servidor pode ter reiniciado
  // no meio de um job, e isso não é "começou a imprimir".
  if (!anterior || !atual) return [];

  const de = anterior.estado;
  const para = atual.estado;
  const job = atual.job || anterior.job;
  const arquivo = job?.arquivo || null;
  const evento = (tipo, extra = {}) => ({ tipo, arquivo, detalhe: null, duracao_s: null, ...extra });

  if (de === 'offline' && para !== 'offline') return [evento('online', { arquivo: null })];
  if (para === 'offline') return de === 'offline' ? [] : [evento('offline', { detalhe: atual.mensagem })];

  const trocouDeArquivo = atual.job?.arquivo && anterior.job?.arquivo !== atual.job.arquivo;
  if (para === 'imprimindo' && (!EM_ANDAMENTO.includes(de) || trocouDeArquivo)) {
    return [evento('inicio', { arquivo: atual.job?.arquivo || null })];
  }

  if (de === para) return [];

  const duracao = atual.job?.decorrido_s ?? anterior.job?.decorrido_s ?? null;

  if (de === 'imprimindo' && para === 'pausada') return [evento('pausada')];
  if (de === 'pausada' && para === 'imprimindo') return [evento('retomada')];
  if (EM_ANDAMENTO.includes(de) && para === 'concluida') return [evento('concluida', { duracao_s: duracao })];
  if (EM_ANDAMENTO.includes(de) && para === 'cancelada') return [evento('cancelada', { duracao_s: duracao })];
  if (para === 'erro') {
    return [evento('erro', {
      detalhe: atual.mensagem,
      duracao_s: EM_ANDAMENTO.includes(de) ? duracao : null,
    })];
  }
  return [];
}

module.exports = { eventosDaTransicao };
