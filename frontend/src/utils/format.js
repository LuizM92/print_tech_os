// Formatação compartilhada. Antes estava copiada em cada página — o que garantia que
// uma correção em uma tela não chegasse nas outras.

export const fmtMoeda = (v) =>
  `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export const fmtNum = (v, casas = 2) => parseFloat(v || 0).toFixed(casas).replace('.', ',');

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '—');

export const fmtDataHora = (d) =>
  d
    ? new Date(d).toLocaleDateString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : '—';

export const badgeClass = (status) =>
  ({
    rascunho: 'badge-rascunho',
    aprovado: 'badge-aprovado',
    reprovado: 'badge-reprovado',
    cancelado: 'badge-cancelado',
  }[status] || 'badge-rascunho');

export const rotuloStatus = (status) =>
  ({
    rascunho: 'Rascunho',
    aprovado: 'Aprovado',
    reprovado: 'Reprovado',
    cancelado: 'Cancelado',
  }[status] || status);

// ─── Venda de produtos ──────────────────────────────────────────────────────

/** Quantidade sem casas decimais inúteis: 4 un, 0,5 kg, 2,25 m. */
export const fmtQtd = (v, unidade) => {
  const n = parseFloat(v || 0);
  const texto = Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace('.', ',');
  return unidade ? `${texto} ${unidade}` : texto;
};

export const CATEGORIAS_PRODUTO = [
  { valor: 'filamento', rotulo: 'Filamento' },
  { valor: 'resina', rotulo: 'Resina' },
  { valor: 'peca', rotulo: 'Peça' },
  { valor: 'bico', rotulo: 'Bico' },
  { valor: 'impressora', rotulo: 'Impressora' },
  { valor: 'acessorio', rotulo: 'Acessório' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const UNIDADES_PRODUTO = ['un', 'kg', 'g', 'm', 'rolo', 'caixa', 'litro'];

export const rotuloCategoria = (valor) =>
  CATEGORIAS_PRODUTO.find((c) => c.valor === valor)?.rotulo || 'Outro';

/** Categorias em que cor / tipo de material / diâmetro / peso fazem sentido. */
export const ehConsumivel = (categoria) => ['filamento', 'resina'].includes(categoria);

/** Descrição curta do produto para listas e selects: marca, cor e especificação. */
export const fichaProduto = (p) =>
  [p.marca, p.cor, p.tipo_material, p.especificacao].filter(Boolean).join(' · ');
