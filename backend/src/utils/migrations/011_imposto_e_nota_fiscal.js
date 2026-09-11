/**
 * Imposto embutido no orçamento e nota fiscal emitida fora do sistema.
 *
 * ── Imposto ──
 * Alguns clientes exigem que o imposto entre no preço. O percentual fica no cadastro
 * do cliente como padrão e é copiado para o orçamento, que passa a ser o dono do
 * número — orçamento fechado não muda de valor porque o cadastro mudou depois.
 *
 * O percentual é controle interno: ele entra no preço, mas não aparece no PDF. Por
 * isso o orçamento guarda também quanto do total é imposto, para a conferência
 * acontecer nas telas internas sem precisar refazer a conta.
 *
 * ── Nota fiscal ──
 * A NF é emitida em outra plataforma; aqui ela é só registro. Fica em tabela própria,
 * e não em colunas de `orcamentos`, porque carrega o PDF: `SELECT * FROM orcamentos`
 * é usado em listagem e não pode começar a arrastar arquivo junto.
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
  // Nulo no cliente = sem imposto; é diferente de gravar 0, que seria uma decisão.
  await addColuna(conn, 'clientes', 'imposto_percentual', 'DECIMAL(5,2) NULL');

  await addColuna(conn, 'orcamentos', 'imposto_percentual', 'DECIMAL(5,2) NOT NULL DEFAULT 0.00');
  await addColuna(conn, 'orcamentos', 'total_imposto', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notas_fiscais (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orcamento_id INT NOT NULL,
      numero VARCHAR(60) NOT NULL,
      emitida_em DATE NULL,
      observacao VARCHAR(255) NULL,
      arquivo_nome VARCHAR(255) NULL,
      arquivo_tipo VARCHAR(100) NULL,
      arquivo_tamanho INT NULL,
      arquivo LONGBLOB NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      -- Uma NF por orçamento: emitiu de novo, substitui o registro.
      UNIQUE KEY uq_nf_orcamento (orcamento_id),
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id)
    )
  `);
};
