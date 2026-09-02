/**
 * Reformulação do núcleo: orçamento com vários itens + separação Orçamento / OS.
 *
 * Preserva integralmente o histórico:
 *   - cada orçamento existente vira um orçamento com exatamente 1 item;
 *   - nenhum valor é recalculado — os totais já fechados são copiados como estão;
 *   - o número antigo sobrevive em numero_orcamento (só troca o prefixo OS- por ORC-),
 *     para que nada que já foi impresso ou enviado ao cliente se perca;
 *   - numero_os continua só nos que estavam de fato aprovados.
 *
 * As colunas legadas de orcamentos NÃO são removidas aqui — viram nullable e saem na
 * migração 003, depois de conferir o resultado em produção.
 */

const temColuna = async (conn, tabela, coluna) => {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return r.length > 0;
};

const temIndice = async (conn, tabela, indice) => {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [tabela, indice]
  );
  return r.length > 0;
};

const addColuna = async (conn, tabela, coluna, definicao) => {
  if (await temColuna(conn, tabela, coluna)) return;
  await conn.query(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
};

const COLUNAS_LEGADO = [
  ['material_id', 'INT NULL'],
  ['tipo_peca', "ENUM('tecnica','decorativa') NULL"],
  ['peso_gramas', 'DECIMAL(10,2) NULL'],
  ['horas_impressao', 'DECIMAL(10,2) NULL'],
  ['custo_por_grama', 'DECIMAL(10,4) NULL'],
  ['quantidade', 'INT NULL'],
  ['custo_material', 'DECIMAL(10,2) NULL'],
  ['custo_impressao', 'DECIMAL(10,2) NULL'],
  ['valor_por_peca', 'DECIMAL(10,2) NULL'],
  ['total_peca', 'DECIMAL(10,2) NULL'],
  ['total_servico', 'DECIMAL(10,2) NULL'],
];

exports.up = async (conn) => {
  // ── 1. Tabelas novas ─────────────────────────────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS orcamento_itens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orcamento_id INT NOT NULL,
      ordem INT NOT NULL DEFAULT 1,
      descricao VARCHAR(150),
      material_id INT NOT NULL,
      tipo_peca ENUM('tecnica', 'decorativa') NOT NULL DEFAULT 'tecnica',
      peso_gramas DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      horas_impressao DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      quantidade INT NOT NULL DEFAULT 1,
      custo_por_grama DECIMAL(10,4) NOT NULL DEFAULT 0.1500,
      custo_material DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      custo_impressao DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      valor_por_peca DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_pecas DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_servicos DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_item DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_item_orcamento (orcamento_id),
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
      FOREIGN KEY (material_id) REFERENCES materiais(id)
    );

    CREATE TABLE IF NOT EXISTS contadores (
      chave VARCHAR(50) PRIMARY KEY,
      valor INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orcamento_historico (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orcamento_id INT NOT NULL,
      usuario_id INT,
      acao VARCHAR(50) NOT NULL,
      detalhe VARCHAR(255),
      total_anterior DECIMAL(10,2),
      total_novo DECIMAL(10,2),
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_hist_orcamento (orcamento_id),
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE
    );
  `);

  // ── 2. Colunas novas em orcamentos ───────────────────────────────────────
  await addColuna(conn, 'orcamentos', 'numero_orcamento', 'VARCHAR(20) NULL AFTER id');
  await addColuna(conn, 'orcamentos', 'total_itens', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  await addColuna(conn, 'orcamentos', 'total_servicos_itens', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  await addColuna(conn, 'orcamentos', 'total_servicos_gerais', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  await addColuna(conn, 'orcamentos', 'aprovado_em', 'DATETIME NULL');
  await addColuna(conn, 'orcamentos', 'aprovado_por', 'INT NULL');

  // Serviço passa a poder pertencer a um item (item_id NULL = serviço geral do orçamento)
  if (!(await temColuna(conn, 'orcamento_servicos', 'item_id'))) {
    await conn.query('ALTER TABLE orcamento_servicos ADD COLUMN item_id INT NULL AFTER orcamento_id');
    await conn.query(`ALTER TABLE orcamento_servicos
      ADD CONSTRAINT fk_servico_item FOREIGN KEY (item_id)
      REFERENCES orcamento_itens(id) ON DELETE CASCADE`);
  }

  // ── 3. Backfill: cada orçamento antigo vira 1 item ───────────────────────
  // Só roda uma vez — orçamentos que já têm item são ignorados.
  await conn.query(`
    INSERT INTO orcamento_itens
      (orcamento_id, ordem, material_id, tipo_peca, peso_gramas, horas_impressao,
       quantidade, custo_por_grama, custo_material, custo_impressao, valor_por_peca,
       total_pecas, total_servicos, total_item)
    SELECT o.id, 1, o.material_id, o.tipo_peca, o.peso_gramas, o.horas_impressao,
           o.quantidade, o.custo_por_grama, o.custo_material, o.custo_impressao,
           o.valor_por_peca, o.total_peca, 0.00, o.total_peca
      FROM orcamentos o
     WHERE o.material_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.orcamento_id = o.id)
  `);

  // Os serviços antigos eram do orçamento como um todo → viram serviços gerais
  // (item_id continua NULL), o que mantém total_servico idêntico ao que era.
  await conn.query(`
    UPDATE orcamentos
       SET total_itens = total_peca,
           total_servicos_itens = 0.00,
           total_servicos_gerais = total_servico
     WHERE total_itens = 0.00 AND total_geral > 0.00
  `);

  // ── 4. Numeração: orçamento sempre; OS só para os aprovados ──────────────
  await conn.query(`
    UPDATE orcamentos
       SET numero_orcamento = REPLACE(numero_os, 'OS-', 'ORC-')
     WHERE numero_orcamento IS NULL AND numero_os IS NOT NULL
  `);

  // numero_os precisa poder ser NULL (orçamento ainda não aprovado não é OS)
  await conn.query('ALTER TABLE orcamentos MODIFY COLUMN numero_os VARCHAR(20) NULL');
  await conn.query("UPDATE orcamentos SET numero_os = NULL WHERE status <> 'aprovado'");

  if (!(await temIndice(conn, 'orcamentos', 'uk_numero_orcamento'))) {
    await conn.query('ALTER TABLE orcamentos ADD UNIQUE KEY uk_numero_orcamento (numero_orcamento)');
  }

  // ── 5. Contadores partem do maior número já usado em cada mês ────────────
  // Começando do máximo, o próximo sequencial é maior que qualquer número existente
  // daquele mês — não há como colidir com a numeração aleatória antiga.
  await conn.query(`
    INSERT INTO contadores (chave, valor)
    SELECT CONCAT('orcamento:', SUBSTRING_INDEX(SUBSTRING_INDEX(numero_orcamento, '-', 2), '-', -1)),
           MAX(CAST(SUBSTRING_INDEX(numero_orcamento, '-', -1) AS UNSIGNED))
      FROM orcamentos
     WHERE numero_orcamento IS NOT NULL
     GROUP BY 1
    ON DUPLICATE KEY UPDATE valor = GREATEST(contadores.valor, VALUES(valor))
  `);

  await conn.query(`
    INSERT INTO contadores (chave, valor)
    SELECT CONCAT('os:', SUBSTRING_INDEX(SUBSTRING_INDEX(numero_os, '-', 2), '-', -1)),
           MAX(CAST(SUBSTRING_INDEX(numero_os, '-', -1) AS UNSIGNED))
      FROM orcamentos
     WHERE numero_os IS NOT NULL
     GROUP BY 1
    ON DUPLICATE KEY UPDATE valor = GREATEST(contadores.valor, VALUES(valor))
  `);

  // ── 6. Colunas legadas viram nullable ────────────────────────────────────
  // O código novo não as preenche mais; ficam só para conferência até a migração 003.
  for (const [coluna, tipo] of COLUNAS_LEGADO) {
    if (await temColuna(conn, 'orcamentos', coluna)) {
      await conn.query(`ALTER TABLE orcamentos MODIFY COLUMN ${coluna} ${tipo}`);
    }
  }
};
