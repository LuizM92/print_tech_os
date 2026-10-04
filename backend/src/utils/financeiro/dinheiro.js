/**
 * Dinheiro em centavos inteiros.
 *
 * As colunas são DECIMAL(10,2), mas as contas de plano e de baixa acontecem aqui, em
 * inteiros: 0,1 + 0,2 não dá 0,3 em ponto flutuante, e uma parcela que fecha com um
 * centavo a mais ou a menos deixa a cobrança divergente do total da OS.
 */

/**
 * Valor em reais (número ou texto do MySQL) para centavos. O `toPrecision` tira o ruído
 * do ponto flutuante antes de arredondar — 333,335 × 100 dá 33333,4999… e o centavo certo
 * é 33334.
 */
const centavos = (valor) => {
  const v = Number(valor);
  if (!Number.isFinite(v)) return 0;
  return Math.round(Number((v * 100).toPrecision(15)));
};

const reais = (c) => c / 100;

/**
 * Divide em `n` partes iguais; o resto de centavos vai na última. A soma das partes é
 * sempre o total.
 */
const dividir = (totalCentavos, n) => {
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos - base * n;
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? base + resto : base));
};

/** Fração do total (0,3 de 10001 centavos), arredondada para o centavo. */
const proporcao = (totalCentavos, fracao) =>
  Math.round(Number((totalCentavos * fracao).toPrecision(15)));

/** R$ 1.234,50 — para mensagens de erro e avisos montados no servidor. */
const moeda = (valor) =>
  `R$ ${Number(valor || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

module.exports = { centavos, reais, dividir, proporcao, moeda };
