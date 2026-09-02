/**
 * Numeração e histórico dos documentos — compartilhado pelos dois tipos de orçamento
 * (impressão e venda de produtos).
 *
 * Prefixos em uso:
 *   ORC-AAAAMM-NNNN    orçamento de impressão
 *   OS-AAAAMM-NNNN     ordem de serviço (orçamento de impressão aprovado)
 *   ORC-V-AAAAMM-NNNN  orçamento de venda de produtos
 *   PED-AAAAMM-NNNN    pedido de venda (orçamento de venda aprovado)
 */

const DOCUMENTOS = {
  orcamento: { prefixo: 'ORC', escopo: 'orcamento' },
  os: { prefixo: 'OS', escopo: 'os' },
  orcamento_venda: { prefixo: 'ORC-V', escopo: 'orcamento_venda' },
  pedido: { prefixo: 'PED', escopo: 'pedido' },
};

/**
 * Próximo número sequencial do mês. O contador é travado pela própria transação: duas
 * requisições simultâneas esperam uma pela outra em vez de sortear o mesmo número.
 * Precisa rodar dentro da transação de quem chamou.
 */
const proximoNumero = async (conn, documento) => {
  const { prefixo, escopo } = DOCUMENTOS[documento];
  const agora = new Date();
  const competencia = `${agora.getFullYear()}${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const chave = `${escopo}:${competencia}`;

  await conn.query(
    'INSERT INTO contadores (chave, valor) VALUES (?, 1) ON DUPLICATE KEY UPDATE valor = valor + 1',
    [chave]
  );
  const [[row]] = await conn.query('SELECT valor FROM contadores WHERE chave = ?', [chave]);

  return `${prefixo}-${competencia}-${String(row.valor).padStart(4, '0')}`;
};

const registrarHistorico = async (conn, dados) => {
  await conn.query(
    `INSERT INTO orcamento_historico
       (orcamento_id, usuario_id, acao, detalhe, total_anterior, total_novo)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.orcamento_id, dados.usuario_id || null, dados.acao, dados.detalhe || null,
     dados.total_anterior ?? null, dados.total_novo ?? null]
  );
};

/** Rótulos que mudam conforme o tipo — usados na API, nas telas e no PDF. */
const rotulos = (tipo) => (tipo === 'produto'
  ? {
    documento: 'Orçamento de Venda',
    aprovado: 'Pedido de Venda',
    tituloPdfOrcamento: 'ORÇAMENTO DE VENDA',
    tituloPdfAprovado: 'PEDIDO DE VENDA',
    campoNumeroAprovado: 'numero_pedido',
    documentoAprovado: 'pedido',
  }
  : {
    documento: 'Orçamento',
    aprovado: 'Ordem de Serviço',
    tituloPdfOrcamento: 'ORÇAMENTO',
    tituloPdfAprovado: 'ORDEM DE SERVIÇO',
    campoNumeroAprovado: 'numero_os',
    documentoAprovado: 'os',
  });

module.exports = { proximoNumero, registrarHistorico, rotulos, DOCUMENTOS };
