/**
 * Contas a receber e a pagar.
 *
 * ── `lancamentos` ──
 * Uma tabela para os dois lados, como `orcamentos` já faz com `tipo`: o que muda entre
 * receber e pagar é a rota e a permissão, não a lógica (parcela, vencimento, baixa).
 * Cada linha é uma PARCELA. Uma OS cobrada em entrada + saldo vira duas linhas ligadas
 * pelo `orcamento_id`; uma despesa parcelada, N linhas com o mesmo fornecedor.
 *
 * `valor_pago` e `desconto` são a soma das baixas, atualizados na mesma transação da
 * baixa. Evitam somar `lancamento_baixas` a cada listagem.
 *
 * O banco guarda só `aberto`, `pago` ou `cancelado`. "Vencida" é aberto com vencimento
 * antes de hoje e é calculada na consulta — nunca gravada, então não existe rotina que
 * precise virar o status à meia-noite.
 *
 * ── `lancamento_baixas` ──
 * Cada recebimento ou pagamento. Uma parcela pode ter várias (recebimento parcial) e
 * uma baixa pode ser estornada; por isso o histórico fica numa tabela e não em colunas.
 * A baixa não se apaga em cascata junto com a parcela: parcela com baixa se cancela.
 *
 * ── `financeiro_avisos` ──
 * Trava do aviso diário de vencimentos. O app reinicia a cada deploy, e sem um registro
 * de "hoje já avisei" o aviso sairia de novo a cada reinício. A chave primária faz o
 * INSERT IGNORE decidir, sem corrida, quem avisa.
 *
 * ── `notificacoes.somente_admin` ──
 * O sino é de todos. Contas a pagar são do admin, então o aviso delas precisa de uma
 * marca para o operador não enxergá-lo.
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

const CATEGORIAS_DESPESA = [
  'Filamento e insumos', 'Peças e manutenção', 'Energia', 'Aluguel',
  'Internet e telefonia', 'Software e assinaturas', 'Impostos', 'Frete',
  'Marketing', 'Pró-labore', 'Outros',
];

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fornecedores (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      cpf_cnpj VARCHAR(20) NULL,
      telefone VARCHAR(30) NULL,
      email VARCHAR(150) NULL,
      pix_chave VARCHAR(150) NULL,
      observacoes TEXT NULL,
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_fornecedor_documento (cpf_cnpj)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS categorias_despesa (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_categoria_nome (nome)
    )
  `);

  for (const nome of CATEGORIAS_DESPESA) {
    await conn.query('INSERT IGNORE INTO categorias_despesa (nome) VALUES (?)', [nome]);
  }

  await conn.query(`
    CREATE TABLE IF NOT EXISTS lancamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      natureza ENUM('receber', 'pagar') NOT NULL,
      descricao VARCHAR(200) NOT NULL,
      cliente_id INT NULL,
      fornecedor_id INT NULL,
      orcamento_id INT NULL,
      categoria_id INT NULL,
      parcela SMALLINT NOT NULL DEFAULT 1,
      total_parcelas SMALLINT NOT NULL DEFAULT 1,
      rotulo VARCHAR(40) NULL,
      valor DECIMAL(10,2) NOT NULL,
      valor_pago DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      vencimento DATE NOT NULL,
      quitado_em DATE NULL,
      status ENUM('aberto', 'pago', 'cancelado') NOT NULL DEFAULT 'aberto',
      documento VARCHAR(60) NULL,
      observacao VARCHAR(255) NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_lanc_listagem (natureza, status, vencimento),
      KEY idx_lanc_orcamento (orcamento_id),
      KEY idx_lanc_cliente (cliente_id),
      KEY idx_lanc_fornecedor (fornecedor_id),
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id),
      -- Rascunho apagado leva embora as parcelas canceladas dele; o texto da descrição
      -- guarda o número do documento. Parcela com baixa nunca chega aqui: o orçamento
      -- não sai de aprovado enquanto houver recebimento.
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE SET NULL,
      FOREIGN KEY (categoria_id) REFERENCES categorias_despesa(id),
      FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS lancamento_baixas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      lancamento_id INT NOT NULL,
      valor DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      data_pagamento DATE NOT NULL,
      forma ENUM('pix', 'boleto', 'cartao', 'dinheiro', 'transferencia', 'outro') NOT NULL,
      observacao VARCHAR(255) NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_baixa_lancamento (lancamento_id),
      KEY idx_baixa_data (data_pagamento),
      FOREIGN KEY (lancamento_id) REFERENCES lancamentos(id),
      FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS financeiro_avisos (
      dia DATE NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (dia, tipo)
    )
  `);

  await addColuna(conn, 'notificacoes', 'somente_admin', 'TINYINT(1) NOT NULL DEFAULT 0');
};
