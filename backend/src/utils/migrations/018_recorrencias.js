/**
 * Despesas recorrentes (aluguel, internet, assinaturas).
 *
 * Quem cadastra informa o intervalo — início, fim e frequência — e o sistema já lança
 * todas as contas do período em `lancamentos`, uma por vencimento. Cada uma é uma conta
 * comum: aparece em A pagar, é paga e editada sozinha. Gerar tudo na hora, em vez de uma
 * rotina que lança mês a mês, deixa o que vem pela frente visível desde o primeiro dia e
 * não depende de nada rodando à meia-noite.
 *
 * ── `recorrencias` ──
 * Só o registro do que foi combinado. O que liga as contas a ele é `lancamentos
 * .recorrencia_id`, e é isso que permite cancelar ou reajustar "as próximas" de uma vez
 * quando o aluguel muda. Apagar o registro (nunca acontece pela tela) só solta as contas.
 */

const temColuna = async (conn, tabela, coluna) => {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return r.length > 0;
};

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS recorrencias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      descricao VARCHAR(200) NOT NULL,
      frequencia ENUM('semanal', 'mensal', 'anual') NOT NULL,
      inicio DATE NOT NULL,
      fim DATE NOT NULL,
      valor DECIMAL(10,2) NOT NULL,
      categoria_id INT NULL,
      fornecedor_id INT NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoria_id) REFERENCES categorias_despesa(id),
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
      FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  if (!(await temColuna(conn, 'lancamentos', 'recorrencia_id'))) {
    await conn.query(`
      ALTER TABLE lancamentos
        ADD COLUMN recorrencia_id INT NULL,
        ADD KEY idx_lanc_recorrencia (recorrencia_id),
        ADD CONSTRAINT fk_lanc_recorrencia FOREIGN KEY (recorrencia_id)
          REFERENCES recorrencias(id) ON DELETE SET NULL
    `);
  }
};
