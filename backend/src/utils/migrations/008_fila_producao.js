/**
 * Fila de produção das OS.
 *
 * A OS aprovada ganha uma etapa interna (fila → imprimindo → acabamento → pronta →
 * entregue), separada do `status` comercial. O status diz se o cliente aprovou; a etapa
 * diz onde a peça está na oficina — e é o que responde "já posso avisar que ficou pronta?".
 *
 * Toda OS já aprovada entra na fila com a data da aprovação como marco inicial, senão
 * o quadro nasceria dizendo que todas estão paradas há zero dia.
 */

const temColuna = async (conn, tabela, coluna) => {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return r.length > 0;
};

const addColuna = async (conn, tabela, coluna, definicao) => {
  if (await temColuna(conn, tabela, coluna)) return;
  await conn.query(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
};

exports.up = async (conn) => {
  await addColuna(conn, 'orcamentos', 'etapa_producao',
    "ENUM('fila','producao','acabamento','pronto','entregue') NOT NULL DEFAULT 'fila'");
  // Quando a OS entrou na etapa atual — é daqui que sai o "parada há N dias".
  await addColuna(conn, 'orcamentos', 'etapa_alterada_em', 'TIMESTAMP NULL');
  await addColuna(conn, 'orcamentos', 'previsao_entrega', 'DATE NULL');

  const [indice] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orcamentos'
        AND INDEX_NAME = 'idx_orc_etapa'`
  );
  if (indice.length === 0) {
    await conn.query('ALTER TABLE orcamentos ADD INDEX idx_orc_etapa (status, etapa_producao)');
  }

  // OS já aprovadas entram na fila com o marco da aprovação.
  await conn.query(`
    UPDATE orcamentos
       SET etapa_alterada_em = COALESCE(aprovado_em, criado_em)
     WHERE tipo = 'impressao' AND status = 'aprovado' AND etapa_alterada_em IS NULL
  `);
};
