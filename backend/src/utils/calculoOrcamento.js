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

const calcularServico = (servico) => {
  const valor_hora = num(servico.valor_hora);
  const quantidade_horas = num(servico.quantidade_horas);
  return {
    ...servico,
    valor_hora,
    quantidade_horas,
    total: round2(valor_hora * quantidade_horas),
  };
};

const calcularItem = (item, valorHoraMaquina) => {
  const peso_gramas = num(item.peso_gramas);
  const custo_por_grama = num(item.custo_por_grama);
  const horas_impressao = num(item.horas_impressao);
  const valor_hora_maquina = num(valorHoraMaquina);
  const quantidade = parseInt(item.quantidade, 10) || 0;

  const custo_material = round2(peso_gramas * custo_por_grama);
  const custo_impressao = round2(horas_impressao * valor_hora_maquina);
  const valor_por_peca = round2(custo_material + custo_impressao);
  const total_pecas = round2(valor_por_peca * quantidade);

  const servicos = (item.servicos || []).map(calcularServico);
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

const calcularOrcamento = ({ valor_hora_maquina, itens = [], servicos_gerais = [] }) => {
  const valorHoraMaquina = num(valor_hora_maquina);
  const itensCalculados = itens.map((i) => calcularItem(i, valorHoraMaquina));
  const geraisCalculados = servicos_gerais.map(calcularServico);

  const total_itens = round2(itensCalculados.reduce((acc, i) => acc + i.total_pecas, 0));
  const total_servicos_itens = round2(itensCalculados.reduce((acc, i) => acc + i.total_servicos, 0));
  const total_servicos_gerais = round2(geraisCalculados.reduce((acc, s) => acc + s.total, 0));

  return {
    valor_hora_maquina: valorHoraMaquina,
    itens: itensCalculados,
    servicos_gerais: geraisCalculados,
    total_itens,
    total_servicos_itens,
    total_servicos_gerais,
    total_geral: round2(total_itens + total_servicos_itens + total_servicos_gerais),
  };
};

/**
 * Relê itens e serviços do banco, recalcula tudo e grava os totais.
 * É a única fonte da verdade dos valores persistidos — o payload do cliente nunca
 * define um total. Precisa rodar dentro da transação de quem chamou.
 */
const recalcularOrcamento = async (conn, orcamentoId) => {
  const [[orcamento]] = await conn.query(
    'SELECT id, valor_hora_maquina FROM orcamentos WHERE id = ?',
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
        SET total_itens = ?, total_servicos_itens = ?, total_servicos_gerais = ?, total_geral = ?
      WHERE id = ?`,
    [resultado.total_itens, resultado.total_servicos_itens,
     resultado.total_servicos_gerais, resultado.total_geral, orcamentoId]
  );

  return resultado;
};

// ─── Orçamento de venda (produtos) ──────────────────────────────────────────
/**
 * Desconto de uma linha ou do total. Aceita percentual ou valor em reais, nunca
 * passando do valor cheio — desconto maior que o item zeraria a linha, não a deixaria
 * negativa.
 */
const calcularDesconto = (base, tipo, desconto) => {
  const valorBase = round2(base);
  const d = num(desconto);
  if (d <= 0) return 0;
  const bruto = tipo === 'valor' ? d : (valorBase * d) / 100;
  return round2(Math.min(bruto, valorBase));
};

const calcularProduto = (produto) => {
  const quantidade = num(produto.quantidade);
  const preco_unitario = num(produto.preco_unitario);
  const total_bruto = round2(quantidade * preco_unitario);
  const total_desconto = calcularDesconto(total_bruto, produto.desconto_tipo, produto.desconto);

  return {
    ...produto,
    quantidade,
    preco_unitario,
    total_bruto,
    total_desconto,
    total_item: round2(total_bruto - total_desconto),
  };
};

const calcularOrcamentoVenda = ({ produtos = [], desconto_tipo = 'percentual', desconto = 0 }) => {
  const itens = produtos.map(calcularProduto);

  const total_produtos = round2(itens.reduce((acc, i) => acc + i.total_bruto, 0));
  const descontoItens = round2(itens.reduce((acc, i) => acc + i.total_desconto, 0));
  const subtotal = round2(total_produtos - descontoItens);

  // O desconto geral incide sobre o que sobrou depois dos descontos de linha.
  const descontoGeral = calcularDesconto(subtotal, desconto_tipo, desconto);

  return {
    produtos: itens,
    total_produtos,
    desconto_itens: descontoItens,
    desconto_geral: descontoGeral,
    total_descontos: round2(descontoItens + descontoGeral),
    subtotal,
    total_geral: round2(subtotal - descontoGeral),
  };
};

/** Mesma ideia de recalcularOrcamento, para o orçamento de venda. */
const recalcularOrcamentoVenda = async (conn, orcamentoId) => {
  const [[orcamento]] = await conn.query(
    'SELECT id, desconto_tipo, desconto FROM orcamentos WHERE id = ?',
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
        SET total_produtos = ?, total_descontos = ?, total_geral = ?
      WHERE id = ?`,
    [resultado.total_produtos, resultado.total_descontos, resultado.total_geral, orcamentoId]
  );

  return resultado;
};

module.exports = {
  round2, calcularServico, calcularItem, calcularOrcamento, recalcularOrcamento,
  calcularDesconto, calcularProduto, calcularOrcamentoVenda, recalcularOrcamentoVenda,
};
