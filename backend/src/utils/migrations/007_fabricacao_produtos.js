/**
 * Módulo de fabricação: catálogo dos produtos que a gente imprime e vende nos
 * marketplaces, no padrão de SKU descrito em PADRAO-SKU.md.
 *
 *   fab_produtos    o SKU pai (CAT-MODELO) — o produto em si
 *   fab_variacoes   o SKU de venda (CAT-MODELO-MAT-VAR-TAM) — cada linha vendável
 *   fab_listagens   em que loja o produto está anunciado e com que id
 *
 * Nada aqui encosta na tabela `produtos`, que é o catálogo de revenda dos orçamentos
 * de venda (filamento, bico, impressora). São dois cadastros com propósitos diferentes:
 * lá é mercadoria comprada para revender, aqui é produto de fabricação própria.
 */

exports.up = async (conn) => {
  // ── SKU pai ──────────────────────────────────────────────────────────────
  // O pai não carrega material: o mesmo produto pode ter variação em PLA e em PETG.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fab_produtos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      sku_pai VARCHAR(20) NOT NULL,
      categoria CHAR(3) NOT NULL,
      modelo VARCHAR(12) NOT NULL,
      nome VARCHAR(150) NOT NULL,
      descricao TEXT,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_fab_sku_pai (sku_pai),
      INDEX idx_fab_categoria (categoria)
    );
  `);

  // ── SKU de variação ──────────────────────────────────────────────────────
  // O SKU é único no sistema inteiro e nunca é reaproveitado: variação desativada
  // continua ocupando o código, por isso o UNIQUE não olha o campo `ativo`.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fab_variacoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      produto_id INT NOT NULL,
      sku VARCHAR(40) NOT NULL,
      material CHAR(3) NOT NULL DEFAULT 'PLA',
      variacao VARCHAR(8) NOT NULL DEFAULT 'STD',
      tamanho VARCHAR(4) NOT NULL DEFAULT 'U',
      nome_variacao VARCHAR(120),
      preco_venda DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_fab_sku (sku),
      INDEX idx_fab_var_produto (produto_id),
      FOREIGN KEY (produto_id) REFERENCES fab_produtos(id) ON DELETE CASCADE
    );
  `);

  // ── Onde o produto está anunciado ────────────────────────────────────────
  // O SKU é centralizado: mesma peça em duas lojas é um produto só, com duas
  // listagens. O id da listagem é o que amarra o cadastro ao anúncio lá fora.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fab_listagens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      produto_id INT NOT NULL,
      loja VARCHAR(60) NOT NULL,
      product_id VARCHAR(40),
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_fab_listagem (produto_id, loja),
      FOREIGN KEY (produto_id) REFERENCES fab_produtos(id) ON DELETE CASCADE
    );
  `);
};
