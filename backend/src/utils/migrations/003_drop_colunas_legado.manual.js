/**
 * Remove as colunas de peça única que sobraram em `orcamentos` depois da 002.
 *
 * NÃO roda no `npm run migrate` normal — o sufixo .manual mantém esta migração de
 * fora até que alguém a chame de propósito:
 *
 *     npm run migrate:limpeza
 *
 * A ideia é ter uma janela para conferir em produção que a 002 copiou tudo certo
 * (cada orçamento com 1 item, totais idênticos aos de antes). Enquanto estas colunas
 * existirem, dá para comparar item a item com o valor original. Depois do drop, não dá.
 *
 * Confira antes de rodar — não pode voltar nenhuma linha:
 *
 *   SELECT COUNT(*) FROM orcamentos o
 *    WHERE o.material_id IS NOT NULL
 *      AND NOT EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.orcamento_id = o.id);
 *
 *   SELECT o.id, o.total_peca, i.total_pecas
 *     FROM orcamentos o JOIN orcamento_itens i ON i.orcamento_id = o.id
 *    WHERE o.total_peca <> i.total_pecas;
 */

const COLUNAS = [
  'material_id', 'tipo_peca', 'peso_gramas', 'horas_impressao', 'custo_por_grama',
  'quantidade', 'custo_material', 'custo_impressao', 'valor_por_peca',
  'total_peca', 'total_servico',
];

exports.up = async (conn) => {
  // Recusa apagar se algum orçamento antigo ficou sem item correspondente.
  const [[orfaos]] = await conn.query(`
    SELECT COUNT(*) AS total FROM orcamentos o
     WHERE o.material_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.orcamento_id = o.id)
  `);
  if (orfaos.total > 0) {
    throw new Error(
      `${orfaos.total} orçamento(s) sem item correspondente. A migração 002 não ` +
      'converteu tudo — investigue antes de remover as colunas legadas.'
    );
  }

  // A FK de material_id tem nome gerado pelo MySQL; descobre antes de dropar a coluna.
  const [fks] = await conn.query(`
    SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orcamentos'
       AND COLUMN_NAME = 'material_id' AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  for (const fk of fks) {
    await conn.query(`ALTER TABLE orcamentos DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``);
  }

  for (const coluna of COLUNAS) {
    const [existe] = await conn.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orcamentos' AND COLUMN_NAME = ?`,
      [coluna]
    );
    if (existe.length > 0) {
      await conn.query(`ALTER TABLE orcamentos DROP COLUMN \`${coluna}\``);
    }
  }
};
