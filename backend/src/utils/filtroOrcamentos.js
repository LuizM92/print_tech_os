/**
 * Construtor de filtros dos orçamentos — compartilhado pela listagem e pelo dashboard.
 *
 * Todos os filtros são opcionais e se combinam. Parâmetro ausente ou inválido é
 * ignorado em silêncio: filtro é conveniência de tela, não deve derrubar a requisição.
 *
 * Sempre gera SQL parametrizado; nenhum valor do usuário entra na string da consulta.
 */

const STATUS_VALIDOS = ['rascunho', 'aprovado', 'reprovado', 'cancelado'];
const TIPOS_ORCAMENTO = ['impressao', 'produto'];

const inteiro = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const numero = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

/** Aceita apenas AAAA-MM-DD — evita mandar lixo para o MySQL interpretar. */
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

const texto = (v) => {
  const t = String(v || '').trim();
  return t === '' ? null : t;
};

/**
 * Devolve `{ clausula, params, ativos }` para colar numa consulta que já tenha
 * `orcamentos o` (e `clientes c`, quando filtrar por nome).
 *
 * `ativos` lista quais filtros vieram — a tela usa para mostrar o que está aplicado.
 */
const construirFiltro = (query = {}) => {
  const where = [];
  const params = [];
  const ativos = [];

  const de = data(query.de);
  const ate = data(query.ate);
  if (de) {
    where.push('o.criado_em >= ?');
    params.push(`${de} 00:00:00`);
    ativos.push('de');
  }
  if (ate) {
    // Inclui o dia inteiro: senão "até 30/09" perderia tudo que foi criado naquele dia.
    where.push('o.criado_em <= ?');
    params.push(`${ate} 23:59:59`);
    ativos.push('ate');
  }

  if (STATUS_VALIDOS.includes(query.status)) {
    where.push('o.status = ?');
    params.push(query.status);
    ativos.push('status');
  }

  if (TIPOS_ORCAMENTO.includes(query.tipo)) {
    where.push('o.tipo = ?');
    params.push(query.tipo);
    ativos.push('tipo');
  }

  const clienteId = inteiro(query.cliente_id);
  if (clienteId) {
    where.push('o.cliente_id = ?');
    params.push(clienteId);
    ativos.push('cliente_id');
  }

  const criadoPor = inteiro(query.criado_por);
  if (criadoPor) {
    where.push('o.criado_por = ?');
    params.push(criadoPor);
    ativos.push('criado_por');
  }

  const valorMin = numero(query.valor_min);
  if (valorMin !== null) {
    where.push('o.total_geral >= ?');
    params.push(valorMin);
    ativos.push('valor_min');
  }

  const valorMax = numero(query.valor_max);
  if (valorMax !== null) {
    where.push('o.total_geral <= ?');
    params.push(valorMax);
    ativos.push('valor_max');
  }

  // Material e produto vivem nas tabelas filhas: EXISTS evita duplicar o orçamento
  // no resultado quando ele tem vários itens do mesmo material.
  const materialId = inteiro(query.material_id);
  if (materialId) {
    where.push('EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.orcamento_id = o.id AND i.material_id = ?)');
    params.push(materialId);
    ativos.push('material_id');
  }

  const produtoId = inteiro(query.produto_id);
  if (produtoId) {
    where.push('EXISTS (SELECT 1 FROM orcamento_produtos p WHERE p.orcamento_id = o.id AND p.produto_id = ?)');
    params.push(produtoId);
    ativos.push('produto_id');
  }

  // Busca pela descrição do item, nos dois tipos: acha "todo orçamento que teve um
  // suporte de motor", sem precisar lembrar o número do documento.
  const descricaoItem = texto(query.descricao_item);
  if (descricaoItem) {
    where.push(`(EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.orcamento_id = o.id AND i.descricao LIKE ?)
              OR EXISTS (SELECT 1 FROM orcamento_produtos p WHERE p.orcamento_id = o.id AND p.descricao LIKE ?))`);
    const termo = `%${descricaoItem}%`;
    params.push(termo, termo);
    ativos.push('descricao_item');
  }

  // Busca livre por número de documento ou nome do cliente (usada na listagem).
  const busca = texto(query.busca);
  if (busca) {
    where.push('(o.numero_orcamento LIKE ? OR o.numero_os LIKE ? OR o.numero_pedido LIKE ? OR c.nome LIKE ?)');
    const termo = `%${busca}%`;
    params.push(termo, termo, termo, termo);
    ativos.push('busca');
  }

  return {
    clausula: where.length > 0 ? `WHERE ${where.join(' AND ')}` : '',
    params,
    ativos,
  };
};

/**
 * Em período curto o gráfico faz sentido por dia; em período longo, por mês.
 * Sem datas informadas, assume mês — o histórico inteiro por dia seria ilegível.
 */
const granularidade = (de, ate) => {
  const inicio = data(de);
  const fim = data(ate);
  if (!inicio || !fim) return 'mes';
  const dias = (new Date(fim) - new Date(inicio)) / 86400000;
  return dias <= 62 ? 'dia' : 'mes';
};

const FORMATO_PERIODO = { dia: '%Y-%m-%d', mes: '%Y-%m' };

module.exports = {
  construirFiltro, granularidade, FORMATO_PERIODO, STATUS_VALIDOS, TIPOS_ORCAMENTO,
  // O quadro de produção monta o filtro dele, mas "o que é uma data válida" é aqui.
  apenasData: data,
};
