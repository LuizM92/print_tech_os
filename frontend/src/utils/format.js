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

// ─── Arquivos do cliente ────────────────────────────────────────────────────
// Espelha backend/src/utils/arquivos3d.js — mudou lá, muda aqui.

/** O que o campo de anexo aceita. Por extensão: .stl e .3mf não têm MIME próprio. */
export const ACEITA_ARQUIVOS = '.zip,.stl,.step,.stp,.3mf,.obj';
export const ARQUIVOS_LISTA = 'ZIP, STL, STEP, STP, 3MF ou OBJ';
export const ARQUIVOS_LIMITE_MB = 25;

/** Tamanho legível: 840 KB, 12,5 MB. Arquivo de impressão nunca é medido em bytes. */
export const fmtTamanho = (bytes) => {
  const n = parseInt(bytes, 10) || 0;
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace('.', ',')} MB`;
};

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

// ─── Fila de produção ───────────────────────────────────────────────────────
// Espelha backend/src/utils/producao.js — o quadro usa a ordem daqui.

export const ETAPAS_PRODUCAO = [
  { codigo: 'fila', rotulo: 'Na fila', descricao: 'Aprovada, esperando a máquina' },
  { codigo: 'desenho', rotulo: 'Desenho', descricao: 'Modelagem da peça antes da impressão' },
  { codigo: 'producao', rotulo: 'Imprimindo', descricao: 'Peça na impressora' },
  { codigo: 'acabamento', rotulo: 'Acabamento', descricao: 'Pós-processamento, pintura, montagem' },
  { codigo: 'pronto', rotulo: 'Pronta', descricao: 'Terminada — dá para avisar o cliente' },
  { codigo: 'entregue', rotulo: 'Entregue', descricao: 'Retirada pelo cliente ou enviada' },
];

export const rotuloEtapa = (codigo) =>
  ETAPAS_PRODUCAO.find((e) => e.codigo === codigo)?.rotulo || codigo;

/** Horas com o minuto junto, como a oficina fala: 12h30 em vez de 12,5 h. */
export const fmtHoras = (v) => {
  const total = parseFloat(v || 0);
  const horas = Math.floor(total);
  const minutos = Math.round((total - horas) * 60);
  return minutos === 0 ? `${horas}h` : `${horas}h${String(minutos).padStart(2, '0')}`;
};

// ─── Financeiro ─────────────────────────────────────────────────────────────
// Espelha backend/src/utils/financeiro/lancamento.js e condicoesPagamento.js.

/**
 * AAAA-MM-DD → 04/10/2026. Não passa por `new Date`: um vencimento é um dia do
 * calendário, e o fuso deslocaria esse dia (à meia-noite UTC já é "ontem" no Brasil).
 */
export const fmtDiaISO = (iso) =>
  (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');

/** Hoje no relógio do navegador, como AAAA-MM-DD (`toISOString` daria o dia em UTC). */
export const hojeISO = () => {
  const d = new Date();
  const dois = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
};

/** Reais (texto de um campo ou número) em centavos inteiros, para comparar sem erro de float. */
export const centavos = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? Math.round(Number((n * 100).toPrecision(15))) : 0;
};

export const DESCONTO_PIX = 0.05;
export const MAX_PARCELAS = 12;

export const FORMAS_PAGAMENTO = [
  { valor: 'pix', rotulo: 'PIX' },
  { valor: 'boleto', rotulo: 'Boleto' },
  { valor: 'cartao', rotulo: 'Cartão' },
  { valor: 'dinheiro', rotulo: 'Dinheiro' },
  { valor: 'transferencia', rotulo: 'Transferência' },
  { valor: 'outro', rotulo: 'Outro' },
];

export const rotuloForma = (valor) =>
  FORMAS_PAGAMENTO.find((f) => f.valor === valor)?.rotulo || valor;

/** Os recortes da lista de contas. "Vencida" e "vence hoje" são derivados no servidor. */
export const FILTROS_LANCAMENTO = [
  { valor: 'aberto', rotulo: 'Em aberto' },
  { valor: 'vencido', rotulo: 'Vencidas' },
  { valor: 'vence_hoje', rotulo: 'Vencem hoje' },
  { valor: 'pago', rotulo: 'Quitadas' },
  { valor: 'cancelado', rotulo: 'Canceladas' },
  { valor: '', rotulo: 'Todas' },
];

/** O texto do selo da situação: "Vence em 5 dias", "Vencida há 3 dias"… */
export const rotuloSituacao = ({ codigo, dias }) => {
  if (codigo === 'a_vencer') return dias === 1 ? 'Vence amanhã' : `Vence em ${dias} dias`;
  if (codigo === 'vence_hoje') return 'Vence hoje';
  if (codigo === 'vencido') return dias === 1 ? 'Vencida há 1 dia' : `Vencida há ${dias} dias`;
  if (codigo === 'pago') return 'Quitada';
  if (codigo === 'cancelado') return 'Cancelada';
  return codigo;
};
