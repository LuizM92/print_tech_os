/**
 * Módulo de venda de produtos, separado do serviço de impressão.
 *
 * Um orçamento passa a ter `tipo`:
 *   - 'impressao' → ORC-AAAAMM-NNNN, aprovado vira OS-AAAAMM-NNNN   (o que já existia)
 *   - 'produto'   → ORC-V-AAAAMM-NNNN, aprovado vira PED-AAAAMM-NNNN (venda de mercadoria)
 *
 * Os dois compartilham cliente, status, histórico e a tela de listagem, mas têm itens,
 * numeração e PDF próprios. Nenhum orçamento existente muda: todos recebem
 * tipo = 'impressao', que é o default da coluna.
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
  // ── Cadastro de produtos ─────────────────────────────────────────────────
  // Os campos de filamento (cor, tipo_material, diametro_mm, peso_liquido_g) são
  // nullable de propósito: não fazem sentido para uma impressora ou um bico.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS produtos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      codigo VARCHAR(50) NULL,
      nome VARCHAR(150) NOT NULL,
      categoria ENUM('filamento','resina','peca','bico','impressora','acessorio','outro')
        NOT NULL DEFAULT 'outro',
      marca VARCHAR(80),
      cor VARCHAR(50),
      tipo_material VARCHAR(50),
      diametro_mm DECIMAL(4,2) NULL,
      peso_liquido_g DECIMAL(10,2) NULL,
      especificacao VARCHAR(120),
      unidade ENUM('un','kg','g','m','rolo','caixa','litro') NOT NULL DEFAULT 'un',
      preco_venda DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      descricao TEXT,
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_produto_codigo (codigo),
      INDEX idx_produto_categoria (categoria)
    );
  `);

  // ── Itens do orçamento de venda ──────────────────────────────────────────
  // Marca, cor e afins são copiados do cadastro no momento do orçamento: se o produto
  // for renomeado ou reajustado depois, o documento antigo continua contando a mesma
  // história — mesma regra dos itens de impressão.
  await conn.query(`
    CREATE TABLE IF NOT EXISTS orcamento_produtos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orcamento_id INT NOT NULL,
      ordem INT NOT NULL DEFAULT 1,
      produto_id INT NULL,
      codigo VARCHAR(50),
      descricao VARCHAR(150) NOT NULL,
      categoria VARCHAR(30),
      marca VARCHAR(80),
      cor VARCHAR(50),
      tipo_material VARCHAR(50),
      especificacao VARCHAR(120),
      unidade VARCHAR(10) NOT NULL DEFAULT 'un',
      quantidade DECIMAL(10,3) NOT NULL DEFAULT 1.000,
      preco_unitario DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      desconto_tipo ENUM('percentual','valor') NOT NULL DEFAULT 'percentual',
      desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_bruto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_desconto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_item DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prod_orcamento (orcamento_id),
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
      FOREIGN KEY (produto_id) REFERENCES produtos(id)
    );
  `);

  // ── Orçamento ganha tipo, número de pedido e desconto geral ──────────────
  await addColuna(conn, 'orcamentos', 'tipo',
    "ENUM('impressao','produto') NOT NULL DEFAULT 'impressao' AFTER id");
  await addColuna(conn, 'orcamentos', 'numero_pedido', 'VARCHAR(20) NULL AFTER numero_os');
  await addColuna(conn, 'orcamentos', 'total_produtos', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  await addColuna(conn, 'orcamentos', 'desconto_tipo',
    "ENUM('percentual','valor') NOT NULL DEFAULT 'percentual'");
  await addColuna(conn, 'orcamentos', 'desconto', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');
  await addColuna(conn, 'orcamentos', 'total_descontos', 'DECIMAL(10,2) NOT NULL DEFAULT 0.00');

  const [indice] = await conn.query(
    `SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orcamentos'
        AND INDEX_NAME = 'uk_numero_pedido'`
  );
  if (indice.length === 0) {
    await conn.query('ALTER TABLE orcamentos ADD UNIQUE KEY uk_numero_pedido (numero_pedido)');
  }

  // ── Produtos de exemplo, para a tela não nascer vazia ────────────────────
  await conn.query(`
    INSERT IGNORE INTO produtos
      (codigo, nome, categoria, marca, cor, tipo_material, diametro_mm, peso_liquido_g, especificacao, unidade, preco_venda, descricao)
    VALUES
      ('FIL-PLA-175-PRE', 'Filamento PLA 1,75mm 1kg', 'filamento', '3D Fila', 'Preto', 'PLA', 1.75, 1000, 'Bobina 1 kg', 'rolo', 119.90, 'PLA de uso geral, fácil impressão'),
      ('FIL-PLA-175-BRA', 'Filamento PLA 1,75mm 1kg', 'filamento', '3D Fila', 'Branco', 'PLA', 1.75, 1000, 'Bobina 1 kg', 'rolo', 119.90, NULL),
      ('FIL-PET-175-VER', 'Filamento PETG 1,75mm 1kg', 'filamento', 'Voolt3D', 'Vermelho', 'PETG', 1.75, 1000, 'Bobina 1 kg', 'rolo', 149.90, 'Mais resistente a temperatura e impacto'),
      ('FIL-ABS-175-CIN', 'Filamento ABS 1,75mm 1kg', 'filamento', 'Voolt3D', 'Cinza', 'ABS', 1.75, 1000, 'Bobina 1 kg', 'rolo', 134.90, NULL),
      ('FIL-TPU-175-PRE', 'Filamento TPU Flexível 1,75mm 500g', 'filamento', 'Sethi3D', 'Preto', 'TPU', 1.75, 500, 'Bobina 500 g', 'rolo', 169.90, 'Shore 95A'),
      ('RES-STD-1L-CIN', 'Resina Standard 1L', 'resina', 'Anycubic', 'Cinza', 'Resina', NULL, 1000, 'Frasco 1 litro', 'litro', 199.90, 'Resina fotopolimerizável 405nm'),
      ('BIC-04-LAT', 'Bico 0,4mm latão', 'bico', 'E3D', NULL, 'Latão', 0.40, NULL, 'Rosca M6 · V6', 'un', 24.90, NULL),
      ('BIC-06-END', 'Bico 0,6mm aço endurecido', 'bico', 'E3D', NULL, 'Aço endurecido', 0.60, NULL, 'Para filamentos abrasivos', 'un', 89.90, 'Indicado para filamentos com carga de fibra'),
      ('IMP-EN3-V2', 'Impressora Ender 3 V2', 'impressora', 'Creality', NULL, NULL, NULL, NULL, 'Mesa 220×220×250 mm', 'un', 1899.00, 'FDM, montagem semi-assistida'),
      ('ACE-MESA-PEI', 'Chapa magnética PEI 235×235mm', 'acessorio', 'Creality', NULL, 'PEI', NULL, NULL, '235 × 235 mm', 'un', 149.00, 'Superfície de adesão removível')
  `);
};
