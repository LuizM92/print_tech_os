/**
 * Núcleo de cálculo do orçamento.
 *
 * As funções puras (calcularServico / calcularItem / calcularOrcamento) não tocam no
 * banco — são compartilhadas com o frontend (frontend/src/utils/calculo.js) para que o
 * preview em tela e o valor gravado nunca divirjam.
 *
 * Fórmula por item:
 *   custo_material  = peso_gramas × custo_por_grama
 *   custo_impressao = horas_impressao × valor_hora_maquina
 *   valor_por_peca  = custo_material + custo_impressao
 *   total_pecas     = valor_por_peca × quantidade
 *   total_servicos  = Σ (valor_hora × quantidade_horas)
 *   total_item      = total_pecas + total_servicos
 *
 * O imposto do orçamento, quando existe, entra como fator em cada linha — e não
 * como uma linha própria no fim. É o que faz o PDF fechar na conta sem nunca dizer
 * o percentual: cada valor impresso já é o valor com imposto, e a soma deles é o
 * total. Quanto disso é imposto fica em `total_imposto`, só para as telas internas.
 */

// Todo valor monetário é arredondado no ponto em que seria gravado (as colunas são
// DECIMAL(10,2)). Assim o PDF fecha na soma quando alguém confere na mão.
const round2 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Percentual de imposto de um orçamento: o que veio no formulário, senão o padrão
 * do cadastro do cliente. Zero informado é uma escolha e é respeitada — por isso a
 * checagem é "veio um número", e não "veio um número maior que zero".
 */
const impostoDoOrcamento = (informado, padraoDoCliente) => {
  const escolhido = parseFloat(informado);
  if (Number.isFinite(escolhido) && escolhido >= 0) return round2(escolhido);
  const padrao = parseFloat(padraoDoCliente);
  return Number.isFinite(padrao) && padrao > 0 ? round2(padrao) : 0;
};

/** Recusa percentual fora de 0–100. Devolve a mensagem de erro, ou null. */
const validarImposto = (valor) => {
  if (valor === undefined || valor === null || valor === '') return null;
  const n = parseFloat(valor);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 'Imposto deve ser um percentual entre 0 e 100';
  return null;
};

/** Multiplicador que embute o imposto no preço. Sem imposto é exatamente 1. */
const fatorImposto = (percentual) => 1 + num(percentual) / 100;

const calcularServico = (servico, fator = 1) => {
  const valor_hora = num(servico.valor_hora);
  const quantidade_horas = num(servico.quantidade_horas);
  return {
    ...servico,
    valor_hora,
    quantidade_horas,
    total: round2(valor_hora * quantidade_horas * fator),
  };
};

const calcularItem = (item, valorHoraMaquina, fator = 1) => {
  const peso_gramas = num(item.peso_gramas);
  const custo_por_grama = num(item.custo_por_grama);
  const horas_impressao = num(item.horas_impressao);
  const valor_hora_maquina = num(valorHoraMaquina);
  const quantidade = parseInt(item.quantidade, 10) || 0;

  const custo_material = round2(peso_gramas * custo_por_grama);
  const custo_impressao = round2(horas_impressao * valor_hora_maquina);
  // custo_material + custo_impressao é o custo; valor_por_peca é o preço. Com
  // imposto os dois deixam de bater — o PDF esconde a memória de cálculo nesse caso.
  const valor_por_peca = round2((custo_material + custo_impressao) * fator);
  const total_pecas = round2(valor_por_peca * quantidade);

  const servicos = (item.servicos || []).map((s) => calcularServico(s, fator));
  const total_servicos = round2(servicos.reduce((acc, s) => acc + s.total, 0));

  return {
    ...item,
    peso_gramas,
    custo_por_grama,
    horas_impressao,
    quantidade,
    custo_material,
    custo_impressao,
    valor_por_peca,
    total_pecas,
    total_servicos,
    total_item: round2(total_pecas + total_servicos),
    servicos,
  };
};

const calcularOrcamento = ({
  valor_hora_maquina, itens = [], servicos_gerais = [], imposto_percentual = 0,
}) => {
  const valorHoraMaquina = num(valor_hora_maquina);
  const fator = fatorImposto(imposto_percentual);
  const itensCalculados = itens.map((i) => calcularItem(i, valorHoraMaquina, fator));
  const geraisCalculados = servicos_gerais.map((s) => calcularServico(s, fator));

  const total_itens = round2(itensCalculados.reduce((acc, i) => acc + i.total_pecas, 0));
  const total_servicos_itens = round2(itensCalculados.reduce((acc, i) => acc + i.total_servicos, 0));
  const total_servicos_gerais = round2(geraisCalculados.reduce((acc, s) => acc + s.total, 0));

  const total_geral = round2(total_itens + total_servicos_itens + total_servicos_gerais);

  // Refaz a conta sem imposto para saber, ao centavo, quanto dele é imposto —
  // dividir o total pelo fator erraria os arredondamentos de cada linha.
  const semImposto = fator === 1
    ? null
    : calcularOrcamento({ valor_hora_maquina, itens, servicos_gerais });

  return {
    valor_hora_maquina: valorHoraMaquina,
    itens: itensCalculados,
    servicos_gerais: geraisCalculados,
    total_itens,
    total_servicos_itens,
    total_servicos_gerais,
    imposto_percentual: num(imposto_percentual),
    total_imposto: semImposto ? round2(total_geral - semImposto.total_geral) : 0,
    total_geral,
  };
};

/**
 * Relê itens e serviços do banco, recalcula tudo e grava os totais.
 * É a única fonte da verdade dos valores persistidos — o payload do cliente nunca
 * define um total. Precisa rodar dentro da transação de quem chamou.
 */
const recalcularOrcamento = async (conn, orcamentoId) => {
  const [[orcamento]] = await conn.query(
    'SELECT id, valor_hora_maquina, imposto_percentual FROM orcamentos WHERE id = ?',
    [orcamentoId]
  );
  if (!orcamento) throw new Error(`Orçamento ${orcamentoId} não encontrado`);

  const [itens] = await conn.query(
    'SELECT * FROM orcamento_itens WHERE orcamento_id = ? ORDER BY ordem, id',
    [orcamentoId]
  );
  const [servicos] = await conn.query(
    'SELECT * FROM orcamento_servicos WHERE orcamento_id = ?',
    [orcamentoId]
  );

  const resultado = calcularOrcamento({
    valor_hora_maquina: orcamento.valor_hora_maquina,
    imposto_percentual: orcamento.imposto_percentual,
    itens: itens.map((i) => ({
      ...i,
      servicos: servicos.filter((s) => s.item_id === i.id),
    })),
    servicos_gerais: servicos.filter((s) => s.item_id === null),
  });

  for (const item of resultado.itens) {
    await conn.query(
      `UPDATE orcamento_itens
          SET custo_material = ?, custo_impressao = ?, valor_por_peca = ?,
              total_pecas = ?, total_servicos = ?, total_item = ?
        WHERE id = ?`,
      [item.custo_material, item.custo_impressao, item.valor_por_peca,
       item.total_pecas, item.total_servicos, item.total_item, item.id]
    );
  }

  for (const s of [...resultado.itens.flatMap((i) => i.servicos), ...resultado.servicos_gerais]) {
    await conn.query('UPDATE orcamento_servicos SET total = ? WHERE id = ?', [s.total, s.id]);
  }

  await conn.query(
    `UPDATE orcamentos
        SET total_itens = ?, total_servicos_itens = ?, total_servicos_gerais = ?,
            total_imposto = ?, total_geral = ?
      WHERE id = ?`,
    [resultado.total_itens, resultado.total_servicos_itens,
     resultado.total_servicos_gerais, resultado.total_imposto,
     resultado.total_geral, orcamentoId]
  );

  return resultado;
};

// ─── Orçamento de venda (produtos) ──────────────────────────────────────────
/**
 * Desconto de uma linha ou do total. Aceita percentual ou valor em reais, nunca
 * passando do valor cheio — desconto maior que o item zeraria a linha, não a deixaria
 * negativa.
 */
/** Preço unitário já com o imposto embutido. Compartilhado com o PDF. */
const precoComImposto = (preco, fator) => round2(num(preco) * fator);

const calcularDesconto = (base, tipo, desconto) => {
  const valorBase = round2(base);
  const d = num(desconto);
  if (d <= 0) return 0;
  const bruto = tipo === 'valor' ? d : (valorBase * d) / 100;
  return round2(Math.min(bruto, valorBase));
};

const calcularProduto = (produto, fator = 1) => {
  const quantidade = num(produto.quantidade);
  const preco_unitario = num(produto.preco_unitario);
  // O imposto entra no unitário, não no fim: assim a linha do PDF fecha na conta
  // que o cliente faz — quantidade × unitário − desconto = total.
  const preco_cobrado = precoComImposto(preco_unitario, fator);
  const total_bruto = round2(quantidade * preco_cobrado);
  const total_desconto = calcularDesconto(total_bruto, produto.desconto_tipo, produto.desconto);

  return {
    ...produto,
    quantidade,
    preco_unitario,
    preco_cobrado,
    total_bruto,
    total_desconto,
    total_item: round2(total_bruto - total_desconto),
  };
};

const calcularOrcamentoVenda = ({
  produtos = [], desconto_tipo = 'percentual', desconto = 0, imposto_percentual = 0,
}) => {
  const fator = fatorImposto(imposto_percentual);
  const itens = produtos.map((p) => calcularProduto(p, fator));

  const total_produtos = round2(itens.reduce((acc, i) => acc + i.total_bruto, 0));
  const descontoItens = round2(itens.reduce((acc, i) => acc + i.total_desconto, 0));
  const subtotal = round2(total_produtos - descontoItens);

  // O desconto geral incide sobre o que sobrou depois dos descontos de linha.
  const descontoGeral = calcularDesconto(subtotal, desconto_tipo, desconto);
  const total_geral = round2(subtotal - descontoGeral);

  // Mesma ideia do orçamento de impressão: a conta refeita sem imposto é o que diz,
  // ao centavo, quanto dele é imposto.
  const semImposto = fator === 1
    ? null
    : calcularOrcamentoVenda({ produtos, desconto_tipo, desconto });

  return {
    produtos: itens,
    total_produtos,
    desconto_itens: descontoItens,
    desconto_geral: descontoGeral,
    total_descontos: round2(descontoItens + descontoGeral),
    subtotal,
    imposto_percentual: num(imposto_percentual),
    total_imposto: semImposto ? round2(total_geral - semImposto.total_geral) : 0,
    total_geral,
  };
};

/** Mesma ideia de recalcularOrcamento, para o orçamento de venda. */
const recalcularOrcamentoVenda = async (conn, orcamentoId) => {
  const [[orcamento]] = await conn.query(
    'SELECT id, desconto_tipo, desconto, imposto_percentual FROM orcamentos WHERE id = ?',
    [orcamentoId]
  );
  if (!orcamento) throw new Error(`Orçamento ${orcamentoId} não encontrado`);

  const [produtos] = await conn.query(
    'SELECT * FROM orcamento_produtos WHERE orcamento_id = ? ORDER BY ordem, id',
    [orcamentoId]
  );

  const resultado = calcularOrcamentoVenda({
    produtos,
    desconto_tipo: orcamento.desconto_tipo,
    desconto: orcamento.desconto,
    imposto_percentual: orcamento.imposto_percentual,
  });

  for (const item of resultado.produtos) {
    await conn.query(
      `UPDATE orcamento_produtos
          SET total_bruto = ?, total_desconto = ?, total_item = ?
        WHERE id = ?`,
      [item.total_bruto, item.total_desconto, item.total_item, item.id]
    );
  }

  await conn.query(
    `UPDATE orcamentos
        SET total_produtos = ?, total_descontos = ?, total_imposto = ?, total_geral = ?
      WHERE id = ?`,
    [resultado.total_produtos, resultado.total_descontos,
     resultado.total_imposto, resultado.total_geral, orcamentoId]
  );

  return resultado;
};

module.exports = {
  round2, fatorImposto, precoComImposto, impostoDoOrcamento, validarImposto,
  calcularServico, calcularItem, calcularOrcamento, recalcularOrcamento,
  calcularDesconto, calcularProduto, calcularOrcamentoVenda, recalcularOrcamentoVenda,
};
