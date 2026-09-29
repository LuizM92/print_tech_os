/**
 * Regras puras da ligação entre a impressora e a produção: qual OS o arquivo aponta,
 * e o que a leitura nova significa para a impressão registrada. Sem banco, sem rede —
 * quem executa é impressoes.js.
 */

const EM_ANDAMENTO = ['imprimindo', 'pausada'];
const FIM = { concluida: 'concluida', cancelada: 'cancelada', erro: 'erro' };
// Estados em que não dá para concluir nada: a impressora pode voltar imprimindo.
const SEM_INFORMACAO = ['offline', 'sem_suporte'];

/**
 * Número da OS no nome do arquivo, no formato do sistema (OS-AAAAMM-NNNN).
 * Aceita o que o fatiador e as pessoas costumam fazer com ele: sem hífen, com
 * sublinhado ou espaço, minúsculo. Só olha o nome, não a pasta.
 */
function numeroOsDoArquivo(arquivo) {
  if (!arquivo) return null;
  const nome = String(arquivo).split('/').pop();
  const m = nome.match(/(?:^|[^a-z0-9])os[-_ ]?(\d{6})[-_ ]?(\d{4})(?!\d)/i);
  return m ? `OS-${m[1]}-${m[2]}` : null;
}

/**
 * O que fazer com a impressão registrada diante da leitura nova.
 * @param aberta impressão em andamento dessa impressora ({ arquivo }) ou null
 * @param atual  leitura normalizada do monitor
 * @returns { acao: 'nada' | 'abrir' | 'fechar' | 'trocar', resultado?, arquivo?, decorrido_s? }
 *          'trocar' = fechar a aberta como interrompida e abrir a nova
 */
function decidir(aberta, atual) {
  if (!atual || SEM_INFORMACAO.includes(atual.estado)) return { acao: 'nada' };
  const arquivo = atual.job?.arquivo || null;
  const decorrido = atual.job?.decorrido_s ?? null;

  if (EM_ANDAMENTO.includes(atual.estado) && arquivo) {
    if (!aberta) return { acao: 'abrir', arquivo, decorrido_s: decorrido };
    if (aberta.arquivo !== arquivo) return { acao: 'trocar', arquivo, decorrido_s: decorrido };
    return { acao: 'nada' };
  }

  if (!aberta) return { acao: 'nada' };

  if (FIM[atual.estado]) {
    // Terminou outro arquivo: o fim da aberta não foi visto (servidor fora do ar, por
    // exemplo). Ela fecha como interrompida, sem inventar resultado.
    if (arquivo && arquivo !== aberta.arquivo) return { acao: 'fechar', resultado: 'interrompida', decorrido_s: null };
    return { acao: 'fechar', resultado: FIM[atual.estado], decorrido_s: decorrido };
  }

  // Ociosa ou iniciando sem ter dito que terminou: o job se perdeu (Klipper reiniciado).
  return { acao: 'fechar', resultado: 'interrompida', decorrido_s: null };
}

module.exports = { numeroOsDoArquivo, decidir };
