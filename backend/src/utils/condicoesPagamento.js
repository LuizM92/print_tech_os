/**
 * Condições de pagamento oferecidas ao cliente.
 *
 * Vivem aqui, e não dentro do PDF, porque duas coisas precisam dos mesmos números: o
 * documento que o cliente recebe e a cobrança que o sistema gera depois da aprovação.
 * Se cada um fizesse a própria conta, o valor impresso e o valor cobrado poderiam
 * divergir por um centavo.
 */
const { centavos, reais, proporcao } = require('./financeiro/dinheiro');

const PARCELAS = 3;
// O parcelamento só é oferecido acima do mínimo; o desconto do PIX vale sempre.
const MINIMO_PARCELAMENTO = 300;
const DESCONTO_PIX = 0.05;
// O que o cliente paga para o serviço começar.
const ENTRADA = 0.3;
const MAX_PARCELAS = 12;

/** Os valores de cada condição para um total, em reais. */
const calcular = (totalGeral) => {
  const total = centavos(totalGeral);
  const descontoPix = proporcao(total, DESCONTO_PIX);
  return {
    parcelas: PARCELAS,
    parcela: reais(Math.round(total / PARCELAS)),
    parcelamentoOferecido: total > centavos(MINIMO_PARCELAMENTO),
    descontoPix: reais(descontoPix),
    totalPix: reais(total - descontoPix),
    entrada: reais(proporcao(total, ENTRADA)),
  };
};

module.exports = {
  PARCELAS, MINIMO_PARCELAMENTO, DESCONTO_PIX, ENTRADA, MAX_PARCELAS, calcular,
};
