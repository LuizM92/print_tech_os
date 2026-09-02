/**
 * Espelho de backend/src/utils/calculoOrcamento.js — mesma fórmula, mesmos
 * arredondamentos. Serve só para o preview em tela; o valor gravado é sempre o que o
 * servidor calcula. Se mudar a fórmula, mude nos dois lugares.
 */

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
 * Custo unitário a usar no preview. Espelha a regra do servidor: material ou serviço
 * que já estava no orçamento mantém o preço com que foi orçado; só o que entra agora
 * pega o preço do cadastro. Sem isso a tela mostraria um total e gravaria outro.
 */
const precoVigente = (id, orcados, catalogo, campo) => {
  if (orcados && orcados.has(id)) return num(orcados.get(id));
  const cadastro = catalogo.find((x) => x.id === id);
  return cadastro ? num(cadastro[campo]) : 0;
};

export const calcularServico = (servico, catalogoServicos, servicosOrcados) => {
  const servicoId = parseInt(servico.servico_id, 10);
  const valor_hora = precoVigente(servicoId, servicosOrcados, catalogoServicos, 'valor_hora');
  const quantidade_horas = num(servico.quantidade_horas);
  return { valor_hora, quantidade_horas, total: round2(valor_hora * quantidade_horas) };
};

export const calcularItem = (item, { valorHoraMaquina, materiais, servicos, materiaisOrcados, servicosOrcados }) => {
  const custo_por_grama = precoVigente(
    parseInt(item.material_id, 10), materiaisOrcados, materiais, 'custo_por_grama'
  );

  const custo_material = round2(num(item.peso_gramas) * custo_por_grama);
  const custo_impressao = round2(num(item.horas_impressao) * num(valorHoraMaquina));
  const valor_por_peca = round2(custo_material + custo_impressao);
  const total_pecas = round2(valor_por_peca * (parseInt(item.quantidade, 10) || 0));

  const servicosCalc = (item.servicos || []).map((s) => calcularServico(s, servicos, servicosOrcados));
  const total_servicos = round2(servicosCalc.reduce((acc, s) => acc + s.total, 0));

  return {
    custo_por_grama,
    custo_material,
    custo_impressao,
    valor_por_peca,
    total_pecas,
    total_servicos,
    total_item: round2(total_pecas + total_servicos),
  };
};

export const calcularOrcamento = ({ itens, servicos_gerais }, contexto) => {
  const itensCalc = itens.map((i) => calcularItem(i, contexto));
  const geraisCalc = servicos_gerais.map((s) => calcularServico(s, contexto.servicos, contexto.servicosOrcados));

  const total_itens = round2(itensCalc.reduce((acc, i) => acc + i.total_pecas, 0));
  const total_servicos_itens = round2(itensCalc.reduce((acc, i) => acc + i.total_servicos, 0));
  const total_servicos_gerais = round2(geraisCalc.reduce((acc, s) => acc + s.total, 0));

  return {
    itens: itensCalc,
    servicos_gerais: geraisCalc,
    total_itens,
    total_servicos_itens,
    total_servicos_gerais,
    total_geral: round2(total_itens + total_servicos_itens + total_servicos_gerais),
  };
};

// ─── Orçamento de venda ─────────────────────────────────────────────────────
// Espelho de calcularOrcamentoVenda do backend.

const calcularDesconto = (base, tipo, desconto) => {
  const valorBase = round2(base);
  const d = num(desconto);
  if (d <= 0) return 0;
  const bruto = tipo === 'valor' ? d : (valorBase * d) / 100;
  return round2(Math.min(bruto, valorBase));
};

export const calcularProduto = (produto) => {
  const total_bruto = round2(num(produto.quantidade) * num(produto.preco_unitario));
  const total_desconto = calcularDesconto(total_bruto, produto.desconto_tipo, produto.desconto);
  return { total_bruto, total_desconto, total_item: round2(total_bruto - total_desconto) };
};

export const calcularOrcamentoVenda = ({ produtos = [], desconto_tipo = 'percentual', desconto = 0 }) => {
  const itens = produtos.map(calcularProduto);

  const total_produtos = round2(itens.reduce((acc, i) => acc + i.total_bruto, 0));
  const desconto_itens = round2(itens.reduce((acc, i) => acc + i.total_desconto, 0));
  const subtotal = round2(total_produtos - desconto_itens);
  const desconto_geral = calcularDesconto(subtotal, desconto_tipo, desconto);

  return {
    produtos: itens,
    total_produtos,
    desconto_itens,
    desconto_geral,
    total_descontos: round2(desconto_itens + desconto_geral),
    subtotal,
    total_geral: round2(subtotal - desconto_geral),
  };
};
