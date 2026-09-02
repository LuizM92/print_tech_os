/**
 * Índices para os filtros do dashboard.
 *
 * Com 139 orçamentos o MySQL varre a tabela e ninguém percebe. Filtrar por período é a
 * operação mais comum do dashboard e vai rodar a cada mudança de filtro — com alguns
 * milhares de registros, sem índice em `criado_em` isso começa a pesar.
 *
 * `cliente_id` e `criado_por` já têm índice: o MySQL cria automaticamente para as
 * chaves estrangeiras.
 */

const temIndice = async (conn, tabela, indice) => {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tabela, indice]
  );
  return r.length > 0;
};

const INDICES = [
  // Ordenação e recorte por data — presente em toda consulta do dashboard.
  ['orcamentos', 'idx_orc_criado_em', '(criado_em)'],
  // Os cartões separam por tipo e status; juntos num índice só cobrem os dois casos.
  ['orcamentos', 'idx_orc_tipo_status', '(tipo, status)'],
  // Filtro por material e por produto usa EXISTS na tabela filha.
  ['orcamento_itens', 'idx_item_material', '(material_id)'],
  ['orcamento_produtos', 'idx_prod_produto', '(produto_id)'],
];

exports.up = async (conn) => {
  for (const [tabela, nome, colunas] of INDICES) {
    if (!(await temIndice(conn, tabela, nome))) {
      await conn.query(`ALTER TABLE ${tabela} ADD INDEX ${nome} ${colunas}`);
    }
  }
};
