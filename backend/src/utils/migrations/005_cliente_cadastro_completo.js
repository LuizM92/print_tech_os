/**
 * Cadastro completo de cliente PJ: dados fiscais, contato, bancários e comerciais.
 *
 * Tudo nullable — os clientes que já existem seguem válidos exatamente como estão, e
 * os campos novos só aparecem no formulário quando o tipo é CNPJ.
 */

const temColuna = async (conn, tabela, coluna) => {
  const [r] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tabela, coluna]
  );
  return r.length > 0;
};

const COLUNAS = [
  // ── Fiscal ──────────────────────────────────────────────────────────────
  ['nome_fantasia', 'VARCHAR(150) NULL'],
  ['inscricao_estadual', 'VARCHAR(20) NULL'],
  ['ie_isento', 'TINYINT(1) NOT NULL DEFAULT 0'],
  ['inscricao_municipal', 'VARCHAR(20) NULL'],
  ['regime_tributario', "ENUM('simples','presumido','real','mei') NULL"],
  ['cnae', 'VARCHAR(150) NULL'],
  ['situacao_cadastral', 'VARCHAR(40) NULL'],

  // ── Contato ─────────────────────────────────────────────────────────────
  ['contato_nome', 'VARCHAR(120) NULL'],
  ['contato_cargo', 'VARCHAR(80) NULL'],
  ['telefone', 'VARCHAR(20) NULL'],
  ['celular', 'VARCHAR(20) NULL'],
  ['email', 'VARCHAR(150) NULL'],

  // ── Bancário ────────────────────────────────────────────────────────────
  ['banco', 'VARCHAR(80) NULL'],
  ['agencia', 'VARCHAR(20) NULL'],
  ['conta', 'VARCHAR(30) NULL'],
  ['tipo_conta', "ENUM('corrente','poupanca','pagamento') NULL"],
  ['pix_tipo', "ENUM('cpf_cnpj','email','telefone','aleatoria') NULL"],
  ['pix_chave', 'VARCHAR(120) NULL'],

  // ── Comercial ───────────────────────────────────────────────────────────
  ['condicao_pagamento', 'VARCHAR(60) NULL'],
  ['limite_credito', 'DECIMAL(10,2) NULL'],
  ['observacoes', 'TEXT NULL'],

  // Quando os dados vieram de uma consulta de CNPJ — ajuda a saber se estão velhos
  ['consultado_em', 'DATETIME NULL'],
];

exports.up = async (conn) => {
  for (const [coluna, definicao] of COLUNAS) {
    if (!(await temColuna(conn, 'clientes', coluna))) {
      await conn.query(`ALTER TABLE clientes ADD COLUMN ${coluna} ${definicao}`);
    }
  }

  // Busca por nome fantasia e contato é comum na tela de clientes.
  const [indice] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clientes'
        AND INDEX_NAME = 'idx_cliente_fantasia'`
  );
  if (indice.length === 0) {
    await conn.query('ALTER TABLE clientes ADD INDEX idx_cliente_fantasia (nome_fantasia)');
  }
};
