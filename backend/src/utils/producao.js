/**
 * Etapas da fila de produção — o andamento interno de uma OS já aprovada.
 *
 * É uma dimensão separada do `status` do orçamento, e de propósito: o status conta a
 * história comercial (rascunho → aprovado), a etapa conta a história da oficina. Uma OS
 * aprovada em janeiro pode ficar semanas na fila, e "pronta" não é o mesmo que
 * "entregue" — é justamente o momento de avisar o cliente que pode buscar.
 *
 * Só OS entram na fila: orçamento de venda não passa pela impressora.
 */

const ETAPAS = [
  { codigo: 'fila', rotulo: 'Na fila', descricao: 'Aprovada, esperando a máquina' },
  { codigo: 'producao', rotulo: 'Imprimindo', descricao: 'Peça na impressora' },
  { codigo: 'acabamento', rotulo: 'Acabamento', descricao: 'Pós-processamento, pintura, montagem' },
  { codigo: 'pronto', rotulo: 'Pronta', descricao: 'Terminada — dá para avisar o cliente' },
  { codigo: 'entregue', rotulo: 'Entregue', descricao: 'Retirada pelo cliente ou enviada' },
];

const CODIGOS = ETAPAS.map((e) => e.codigo);
const ETAPA_INICIAL = 'fila';

const ehEtapaValida = (codigo) => CODIGOS.includes(codigo);

const rotuloEtapa = (codigo) => ETAPAS.find((e) => e.codigo === codigo)?.rotulo || codigo;

/** Texto do movimento para o histórico: 'Na fila → Imprimindo'. */
const detalheMovimento = (de, para) => `${rotuloEtapa(de)} → ${rotuloEtapa(para)}`;

module.exports = { ETAPAS, CODIGOS, ETAPA_INICIAL, ehEtapaValida, rotuloEtapa, detalheMovimento };
