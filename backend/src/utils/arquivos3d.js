/**
 * Arquivos de modelo que o cliente manda junto do orçamento.
 *
 * O que vale é a **extensão**, não o MIME. Navegador nenhum sabe o que é um .stl, um
 * .step ou um .3mf: o que chega no upload é `application/octet-stream` — quando não
 * vem string vazia. A extensão é o único dado confiável sobre o que o cliente mandou,
 * e é por ela que o filtro decide.
 *
 * Por isso também o download sai sempre como `application/octet-stream`: o navegador
 * guarda o arquivo em vez de tentar abrir, e nada que veio de fora manda no cabeçalho.
 */

// .stp é a mesma coisa que .step — muito CAD exporta com o nome curto.
const EXTENSOES = ['zip', 'stl', 'step', 'stp', '3mf', 'obj'];

/** Extensão em minúsculas, sem o ponto. String vazia quando o nome não tem uma. */
const extensaoDe = (nome) => {
  const partes = String(nome || '').split('.');
  return partes.length > 1 ? partes.pop().toLowerCase() : '';
};

const aceita = (nome) => EXTENSOES.includes(extensaoDe(nome));

/** A lista como ela aparece nas mensagens de erro e na tela. */
const LISTA = EXTENSOES.map((e) => e.toUpperCase()).join(', ');

/**
 * 25 MB por arquivo. O limite não é estético: o arquivo vai para o MySQL e o driver
 * manda o blob em hexadecimal, dobrando de tamanho no caminho — 25 MB viram 50 MB de
 * pacote, ainda dentro dos 64 MB que o `max_allowed_packet` permite por padrão.
 * Para aceitar mais é preciso subir esse parâmetro no servidor antes.
 */
const LIMITE_BYTES = 25 * 1024 * 1024;
const LIMITE_MB = LIMITE_BYTES / 1024 / 1024;

/** Até 10 por envio; nada impede mandar outra leva depois. */
const MAX_POR_ENVIO = 10;

/**
 * Nome seguro para o cabeçalho Content-Disposition. Aspas e quebras de linha no nome
 * do arquivo partiriam o cabeçalho em dois — e quem escolhe o nome é quem envia.
 */
const nomeParaCabecalho = (nome) =>
  String(nome || 'arquivo').replace(/[^\w.\- ]/g, '_').slice(0, 120) || 'arquivo';

module.exports = {
  EXTENSOES, extensaoDe, aceita, LISTA, LIMITE_BYTES, LIMITE_MB, MAX_POR_ENVIO,
  nomeParaCabecalho,
};
