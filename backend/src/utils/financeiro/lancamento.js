/**
 * Regras de um lançamento (uma parcela a receber ou a pagar): em que situação ele está,
 * se aceita uma baixa e como a baixa muda o saldo.
 *
 * ── Situação é derivada ──
 * O banco guarda só `aberto`, `pago` ou `cancelado`. "Vencida" é `aberto` com vencimento
 * antes de hoje — nunca é gravada, então não existe rotina que precise virar status à
 * meia-noite e nada fica desatualizado se ela falhar.
 *
 * ── Quitação ──
 * A parcela quita quando o recebido + o desconto concedido alcançam o valor. Receber a
 * mais é aceito (cobre juros de atraso, que o sistema não calcula sozinho).
 */
const { centavos, reais, moeda } = require('./dinheiro');
const { ehDataISO, diasEntre } = require('./datas');

const NATUREZAS = ['receber', 'pagar'];
const STATUS = ['aberto', 'pago', 'cancelado'];
const FORMAS = ['pix', 'boleto', 'cartao', 'dinheiro', 'transferencia', 'outro'];
const ROTULO_FORMA = {
  pix: 'PIX', boleto: 'boleto', cartao: 'cartão', dinheiro: 'dinheiro',
  transferencia: 'transferência', outro: 'outra forma',
};

// Colunas DATE podem chegar como "2026-10-04" ou "2026-10-04T00:00:00.000Z".
const dia = (v) => String(v).slice(0, 10);

/** Quanto ainda falta, em centavos. Nunca negativo. */
const saldoCentavos = (l) =>
  Math.max(centavos(l.valor) - centavos(l.valor_pago) - centavos(l.desconto), 0);

const saldoDe = (l) => reais(saldoCentavos(l));

/**
 * Em que pé a parcela está hoje. `dias` é o atraso quando vencida e a espera quando
 * ainda vai vencer; `parcial` marca a parcela aberta que já recebeu alguma coisa.
 */
const situacao = (l, hoje) => {
  if (l.status === 'cancelado') return { codigo: 'cancelado', dias: 0, parcial: false };
  if (l.status === 'pago') return { codigo: 'pago', dias: 0, parcial: false };

  const parcial = centavos(l.valor_pago) > 0 || centavos(l.desconto) > 0;
  const atraso = diasEntre(dia(l.vencimento), hoje);
  if (atraso > 0) return { codigo: 'vencido', dias: atraso, parcial };
  if (atraso === 0) return { codigo: 'vence_hoje', dias: 0, parcial };
  return { codigo: 'a_vencer', dias: -atraso, parcial };
};

/**
 * Confere uma baixa antes de gravar. Devolve { erro } ou { baixa } com os valores já
 * normalizados (reais com 2 casas, data e forma conferidas).
 */
const validarBaixa = (l, entrada, hoje) => {
  const verbo = l.natureza === 'pagar' ? 'pago' : 'recebido';

  if (l.status === 'cancelado') return { erro: 'Esta conta está cancelada' };
  if (l.status === 'pago') return { erro: 'Esta conta já está quitada' };

  const valor = centavos(entrada.valor);
  const desconto = centavos(entrada.desconto);
  if (valor < 0 || desconto < 0) return { erro: 'Os valores não podem ser negativos' };
  if (valor + desconto <= 0) return { erro: `Informe o valor ${verbo}` };

  const saldo = saldoCentavos(l);
  if (desconto > saldo) {
    return { erro: `O desconto não pode passar do saldo da parcela (${moeda(reais(saldo))})` };
  }

  const data = entrada.data_pagamento ? dia(entrada.data_pagamento) : hoje;
  if (!ehDataISO(data)) return { erro: 'Data do pagamento inválida' };
  if (data > hoje) return { erro: 'A data do pagamento não pode ser futura' };

  if (!FORMAS.includes(entrada.forma)) return { erro: 'Escolha a forma de pagamento' };

  const observacao = String(entrada.observacao ?? '').trim().slice(0, 255) || null;
  return {
    baixa: {
      valor: reais(valor), desconto: reais(desconto), data_pagamento: data,
      forma: entrada.forma, observacao,
    },
  };
};

/** O estado da parcela depois de somar uma baixa. */
const aplicarBaixa = (l, baixa) => {
  const pago = centavos(l.valor_pago) + centavos(baixa.valor);
  const desconto = centavos(l.desconto) + centavos(baixa.desconto);
  const quitou = pago + desconto >= centavos(l.valor);
  return {
    valor_pago: reais(pago),
    desconto: reais(desconto),
    status: quitou ? 'pago' : 'aberto',
    quitado_em: quitou ? dia(baixa.data_pagamento) : null,
  };
};

/**
 * O estado da parcela refeito do zero a partir das baixas que sobraram — é o que o
 * estorno usa: reabre a parcela se ela deixou de estar quitada.
 */
const recalcular = (l, baixas) => {
  const pago = baixas.reduce((s, b) => s + centavos(b.valor), 0);
  const desconto = baixas.reduce((s, b) => s + centavos(b.desconto), 0);
  const quitou = baixas.length > 0 && pago + desconto >= centavos(l.valor);
  const ultima = baixas.map((b) => dia(b.data_pagamento)).sort().pop();
  return {
    valor_pago: reais(pago),
    desconto: reais(desconto),
    status: quitou ? 'pago' : 'aberto',
    quitado_em: quitou ? ultima : null,
  };
};

/**
 * A cobrança de uma OS/Pedido em números, para a tela de detalhe. Cancelada não conta.
 * `divergente` acende quando o orçamento foi editado depois de cobrar e as parcelas já
 * não fecham com o total — nada é refeito sozinho, a tela só avisa.
 */
const resumirCobranca = (totalGeral, lancamentos) => {
  const ativos = lancamentos.filter((l) => l.status !== 'cancelado');
  const soma = (campo) => ativos.reduce((s, l) => s + centavos(l[campo]), 0);
  const cobrado = soma('valor');
  const emAberto = ativos
    .filter((l) => l.status === 'aberto')
    .reduce((s, l) => s + saldoCentavos(l), 0);

  return {
    parcelas: ativos.length,
    cobrado: reais(cobrado),
    recebido: reais(soma('valor_pago')),
    desconto: reais(soma('desconto')),
    em_aberto: reais(emAberto),
    divergente: ativos.length > 0 && cobrado !== centavos(totalGeral),
    diferenca: reais(centavos(totalGeral) - cobrado),
  };
};

module.exports = {
  NATUREZAS, STATUS, FORMAS, ROTULO_FORMA, saldoDe, saldoCentavos, situacao, validarBaixa, aplicarBaixa,
  recalcular, resumirCobranca,
};
