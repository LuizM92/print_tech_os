/**
 * Plano de cobrança: como o total de uma OS/Pedido vira parcelas.
 *
 * Tudo aqui é puro (sem banco, sem relógio próprio): quem chama passa o `hoje`. As
 * parcelas saem como { rotulo, parcela, total_parcelas, valor, vencimento } — o mesmo
 * formato que o modal de gerar cobrança edita e que o servidor valida antes de gravar.
 */
const { centavos, reais, dividir, proporcao, moeda } = require('./dinheiro');
const { somarDias, somarMeses, ehDataISO } = require('./datas');
const condicoes = require('../condicoesPagamento');

// Sem previsão de entrega, o saldo vence daqui a este tanto de dias.
const PRAZO_SALDO_DIAS = 15;

const montar = (rotulo, numero, total, centavosDaParcela, vencimento) => ({
  rotulo, parcela: numero, total_parcelas: total, valor: reais(centavosDaParcela), vencimento,
});

const aVista = (totalGeral, { hoje }) => [montar('À vista', 1, 1, centavos(totalGeral), hoje)];

/**
 * Entrada no dia e saldo na entrega. Se a conta não comportar duas parcelas (total de
 * centavos), cai para uma só em vez de gerar parcela zerada.
 */
const entradaESaldo = (totalGeral, { hoje, previsaoEntrega }) => {
  const total = centavos(totalGeral);
  const entrada = proporcao(total, condicoes.ENTRADA);
  const saldo = total - entrada;
  if (entrada <= 0 || saldo <= 0) return aVista(totalGeral, { hoje });

  // Previsão de entrega que já passou não serve de vencimento.
  const venceSaldo = ehDataISO(previsaoEntrega) && previsaoEntrega >= hoje
    ? previsaoEntrega
    : somarDias(hoje, PRAZO_SALDO_DIAS);

  return [
    montar('Entrada', 1, 2, entrada, hoje),
    montar('Saldo', 2, 2, saldo, venceSaldo),
  ];
};

/** `n` parcelas iguais, uma por mês, a primeira daqui a um mês. O resto vai na última. */
const parcelado = (totalGeral, n, { hoje }) =>
  dividir(centavos(totalGeral), n).map((c, i) =>
    montar(`Parcela ${i + 1}/${n}`, i + 1, n, c, somarMeses(hoje, i + 1)));

/**
 * Parcelas de uma cobrança avulsa ou de uma despesa: o usuário escolhe o primeiro
 * vencimento e as seguintes caem mês a mês. Parcela única não leva rótulo.
 */
const parcelarAvulso = (valorTotal, n, primeiroVencimento) =>
  dividir(centavos(valorTotal), n).map((c, i) => ({
    ...montar(n === 1 ? null : `Parcela ${i + 1}/${n}`, i + 1, n, c, somarMeses(primeiroVencimento, i)),
  }));

/**
 * As opções que o modal de gerar cobrança oferece. O parcelamento só aparece acima do
 * mínimo — a mesma regra que o PDF usa para anunciá-lo.
 */
const sugerir = (totalGeral, ctx) => {
  if (!(centavos(totalGeral) > 0)) return [];
  const calculo = condicoes.calcular(totalGeral);

  const opcoes = [{
    codigo: 'entrada_saldo',
    titulo: `Entrada de ${Math.round(condicoes.ENTRADA * 100)}% + saldo`,
    parcelas: entradaESaldo(totalGeral, ctx),
  }];
  if (calculo.parcelamentoOferecido) {
    opcoes.push({
      codigo: 'parcelado',
      titulo: `${condicoes.PARCELAS}x sem juros`,
      parcelas: parcelado(totalGeral, condicoes.PARCELAS, ctx),
    });
  }
  opcoes.push({ codigo: 'a_vista', titulo: 'À vista', parcelas: aVista(totalGeral, ctx) });
  return opcoes;
};

/**
 * Confere as parcelas que chegaram do cliente. Com `total`, a soma precisa bater com ele
 * até o centavo (OS/Pedido); sem, só o que cada parcela exige (avulso e despesa).
 * Devolve a mensagem de erro, ou null.
 */
const validarParcelas = (parcelas, { total = null } = {}) => {
  if (!Array.isArray(parcelas) || parcelas.length === 0) return 'Inclua ao menos uma parcela';
  if (parcelas.length > condicoes.MAX_PARCELAS) {
    return `No máximo ${condicoes.MAX_PARCELAS} parcelas`;
  }

  let soma = 0;
  for (const [i, p] of parcelas.entries()) {
    const onde = `Parcela ${i + 1}`;
    const valor = centavos(p.valor);
    if (!(valor > 0)) return `${onde}: informe um valor maior que zero`;
    if (!ehDataISO(p.vencimento)) return `${onde}: vencimento inválido`;
    soma += valor;
  }

  if (total !== null && soma !== centavos(total)) {
    return `A soma das parcelas (${moeda(reais(soma))}) precisa ser igual ao total (${moeda(total)})`;
  }
  return null;
};

module.exports = {
  PRAZO_SALDO_DIAS, aVista, entradaESaldo, parcelado, parcelarAvulso, sugerir, validarParcelas,
};
