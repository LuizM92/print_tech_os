/**
 * Consultas de lançamentos, compartilhadas entre o controller do financeiro e o de
 * orçamentos (que mostra a cobrança dentro da OS/Pedido e a cancela junto com ele).
 *
 * Os `executor` são o pool ou uma conexão em transação — as funções servem aos dois.
 */
const regras = require('./lancamento');
const { centavos } = require('./dinheiro');
const datas = require('./datas');

// Os joins ficam à parte porque a listagem também os usa (filtro por nome) para contar.
const JOINS_LANCAMENTO = `
    FROM lancamentos l
    LEFT JOIN clientes c ON l.cliente_id = c.id
    LEFT JOIN fornecedores f ON l.fornecedor_id = f.id
    LEFT JOIN categorias_despesa cat ON l.categoria_id = cat.id
    LEFT JOIN orcamentos o ON l.orcamento_id = o.id`;

// Datas voltam como texto AAAA-MM-DD. O mysql2 entregaria um `Date`, e no navegador um
// vencimento à meia-noite UTC aparece como o dia anterior.
const SELECT_LANCAMENTO = `
  SELECT l.id, l.natureza, l.descricao, l.cliente_id, l.fornecedor_id, l.orcamento_id,
         l.categoria_id, l.parcela, l.total_parcelas, l.rotulo,
         l.valor, l.valor_pago, l.desconto,
         DATE_FORMAT(l.vencimento, '%Y-%m-%d') AS vencimento,
         DATE_FORMAT(l.quitado_em, '%Y-%m-%d') AS quitado_em,
         l.status, l.documento, l.observacao, l.criado_em,
         c.nome AS cliente_nome,
         f.nome AS fornecedor_nome,
         cat.nome AS categoria_nome,
         o.numero_orcamento, o.tipo AS orcamento_tipo,
         COALESCE(o.numero_pedido, o.numero_os) AS numero_aprovado
    ${JOINS_LANCAMENTO}`;

/** Linha do banco para a resposta da API: números de verdade, saldo e situação de hoje. */
const normalizar = (l, hoje) => ({
  ...l,
  valor: Number(l.valor),
  valor_pago: Number(l.valor_pago),
  desconto: Number(l.desconto),
  saldo: regras.saldoDe(l),
  situacao: regras.situacao(l, hoje),
});

/** Um lançamento da natureza da rota — nunca de outra: /receber não enxerga contas a pagar. */
const buscar = async (executor, id, natureza) => {
  const [[l]] = await executor.query(
    `${SELECT_LANCAMENTO} WHERE l.id = ? AND l.natureza = ?`, [id, natureza]
  );
  return l || null;
};

/**
 * Trava a linha para a transação. Sem joins de propósito: `FOR UPDATE` com join travaria
 * também cliente, orçamento e fornecedor. `vencimento_iso` é o vencimento como texto,
 * para montar o histórico sem passar por `Date`.
 */
const travar = async (conn, id, natureza) => {
  const [[l]] = await conn.query(
    `SELECT *, DATE_FORMAT(vencimento, '%Y-%m-%d') AS vencimento_iso
       FROM lancamentos WHERE id = ? AND natureza = ? FOR UPDATE`,
    [id, natureza]
  );
  return l || null;
};

const baixasDe = async (executor, lancamentoId) => {
  const [baixas] = await executor.query(
    `SELECT b.id, b.valor, b.desconto, b.forma, b.observacao, b.criado_em,
            DATE_FORMAT(b.data_pagamento, '%Y-%m-%d') AS data_pagamento,
            u.nome AS usuario_nome
       FROM lancamento_baixas b
       LEFT JOIN usuarios u ON b.criado_por = u.id
      WHERE b.lancamento_id = ?
      ORDER BY b.data_pagamento, b.id`,
    [lancamentoId]
  );
  return baixas.map((b) => ({ ...b, valor: Number(b.valor), desconto: Number(b.desconto) }));
};

/** As parcelas de uma OS/Pedido, canceladas inclusive (a tela decide o que mostrar). */
const doOrcamento = async (executor, orcamentoId, hoje) => {
  const [linhas] = await executor.query(
    `${SELECT_LANCAMENTO}
      WHERE l.orcamento_id = ? AND l.natureza = 'receber'
      ORDER BY (l.status = 'cancelado'), l.vencimento, l.parcela, l.id`,
    [orcamentoId]
  );
  return linhas.map((l) => normalizar(l, hoje));
};

/** Parcelas ainda vivas da OS — as que impedem gerar a cobrança de novo. */
const vivasDoOrcamento = async (executor, orcamentoId) => {
  const [linhas] = await executor.query(
    `SELECT id, status, valor, valor_pago, desconto
       FROM lancamentos
      WHERE orcamento_id = ? AND natureza = 'receber' AND status <> 'cancelado'
      FOR UPDATE`,
    [orcamentoId]
  );
  return linhas;
};

/** Quanto o cliente já deve (parcelas abertas), para comparar com o limite de crédito. */
const emAbertoDoCliente = async (executor, clienteId) => {
  const [[{ total }]] = await executor.query(
    `SELECT COALESCE(SUM(GREATEST(valor - valor_pago - desconto, 0)), 0) AS total
       FROM lancamentos
      WHERE natureza = 'receber' AND status = 'aberto' AND cliente_id = ?`,
    [clienteId]
  );
  return Number(total);
};

/**
 * Os números dos cartões de um lado (receber ou pagar), todos contra o `hoje` recebido:
 * em aberto, vencido, vence hoje, próximos 7 dias e o que entrou/saiu no mês.
 */
const resumoDaNatureza = async (executor, natureza, hoje) => {
  const em7Dias = datas.somarDias(hoje, 7);

  const [[r]] = await executor.query(
    `SELECT COUNT(*) AS qtd_aberto,
            COALESCE(SUM(t.saldo), 0) AS valor_aberto,
            COALESCE(SUM(t.vencimento < ?), 0) AS qtd_vencido,
            COALESCE(SUM(CASE WHEN t.vencimento < ? THEN t.saldo END), 0) AS valor_vencido,
            COALESCE(SUM(t.vencimento = ?), 0) AS qtd_hoje,
            COALESCE(SUM(CASE WHEN t.vencimento = ? THEN t.saldo END), 0) AS valor_hoje,
            COALESCE(SUM(t.vencimento > ? AND t.vencimento <= ?), 0) AS qtd_semana,
            COALESCE(SUM(CASE WHEN t.vencimento > ? AND t.vencimento <= ? THEN t.saldo END), 0) AS valor_semana
       FROM (SELECT vencimento, GREATEST(valor - valor_pago - desconto, 0) AS saldo
               FROM lancamentos WHERE natureza = ? AND status = 'aberto') t`,
    [hoje, hoje, hoje, hoje, hoje, em7Dias, hoje, em7Dias, natureza]
  );

  const [[mes]] = await executor.query(
    `SELECT COALESCE(SUM(b.valor), 0) AS valor
       FROM lancamento_baixas b
       JOIN lancamentos l ON l.id = b.lancamento_id
      WHERE l.natureza = ? AND b.data_pagamento BETWEEN ? AND ?`,
    [natureza, datas.primeiroDiaDoMes(hoje), datas.ultimoDiaDoMes(hoje)]
  );

  return {
    hoje,
    em_aberto: { valor: Number(r.valor_aberto), qtd: Number(r.qtd_aberto) },
    vencido: { valor: Number(r.valor_vencido), qtd: Number(r.qtd_vencido) },
    vence_hoje: { valor: Number(r.valor_hoje), qtd: Number(r.qtd_hoje) },
    proximos_7_dias: { valor: Number(r.valor_semana), qtd: Number(r.qtd_semana) },
    realizado_mes: Number(mes.valor),
  };
};

/** Soma o que já entrou nas parcelas vivas — usado para barrar a mudança de status da OS. */
const recebidoDasVivas = (vivas) =>
  vivas.reduce((soma, l) => soma + centavos(l.valor_pago) + centavos(l.desconto), 0);

module.exports = {
  SELECT_LANCAMENTO, JOINS_LANCAMENTO, normalizar, buscar, travar, baixasDe, doOrcamento, vivasDoOrcamento,
  emAbertoDoCliente, recebidoDasVivas, resumoDaNatureza,
};
