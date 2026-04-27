require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  console.log('🔌 Conectado ao MySQL');

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
  await connection.query(`USE \`${process.env.DB_NAME}\``);

  const schema = `
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      email VARCHAR(150) NOT NULL UNIQUE,
      senha VARCHAR(255) NOT NULL,
      perfil ENUM('admin', 'operador') NOT NULL DEFAULT 'operador',
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      chave VARCHAR(100) NOT NULL UNIQUE,
      valor VARCHAR(255) NOT NULL,
      descricao VARCHAR(255),
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(150) NOT NULL,
      cpf_cnpj VARCHAR(20) NOT NULL UNIQUE,
      tipo_documento ENUM('cpf', 'cnpj') NOT NULL,
      rua VARCHAR(200) NOT NULL,
      numero VARCHAR(20) NOT NULL,
      complemento VARCHAR(100),
      bairro VARCHAR(100) NOT NULL,
      cidade VARCHAR(100) NOT NULL,
      estado VARCHAR(2) NOT NULL,
      cep VARCHAR(9) NOT NULL,
      markup DECIMAL(5,2) NOT NULL DEFAULT 0.00,
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS materiais (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL UNIQUE,
      custo_por_grama DECIMAL(10,4) NOT NULL DEFAULT 0.1500,
      descricao TEXT,
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS servicos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      valor_hora DECIMAL(10,2) NOT NULL,
      descricao TEXT,
      ativo TINYINT(1) DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS orcamentos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      numero_os VARCHAR(20) NOT NULL UNIQUE,
      cliente_id INT NOT NULL,
      material_id INT NOT NULL,
      tipo_peca ENUM('tecnica', 'decorativa') NOT NULL,
      observacao TEXT,
      peso_gramas DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      horas_impressao DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      valor_hora_maquina DECIMAL(10,2) NOT NULL DEFAULT 7.00,
      custo_por_grama DECIMAL(10,4) NOT NULL DEFAULT 0.1500,
      quantidade INT NOT NULL DEFAULT 1,
      custo_material DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      custo_impressao DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      valor_por_peca DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_peca DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_servico DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      total_geral DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      status ENUM('rascunho', 'aprovado', 'reprovado', 'cancelado') DEFAULT 'rascunho',
      criado_por INT NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes(id),
      FOREIGN KEY (material_id) REFERENCES materiais(id),
      FOREIGN KEY (criado_por) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS orcamento_servicos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orcamento_id INT NOT NULL,
      servico_id INT NOT NULL,
      quantidade_horas DECIMAL(10,2) NOT NULL,
      valor_hora DECIMAL(10,2) NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
      FOREIGN KEY (servico_id) REFERENCES servicos(id)
    );
  `;

  await connection.query(schema);
  console.log('✅ Tabelas criadas com sucesso!');

  // Configurações padrão
  await connection.query(`
    INSERT IGNORE INTO configuracoes (chave, valor, descricao) VALUES
    ('valor_hora_maquina', '7.00', 'Valor fixo por hora de impressão (aluguel, luz, impostos, etc.)')
  `);

  // Admin padrão
  const bcrypt = require('bcryptjs');
  const senha = await bcrypt.hash('admin123', 10);
  await connection.query(
    `INSERT IGNORE INTO usuarios (nome, email, senha, perfil) VALUES (?, ?, ?, 'admin')`,
    ['Administrador', 'admin@sistema.com', senha]
  );

  // Materiais com custo por grama
  await connection.query(`
    INSERT IGNORE INTO materiais (nome, custo_por_grama, descricao) VALUES
    ('PLA', 0.1500, 'Ácido Polilático - material biodegradável'),
    ('ABS', 0.1200, 'Acrilonitrila Butadieno Estireno - alta resistência'),
    ('PETG', 0.1400, 'Polietileno Tereftalato - resistente à temperatura'),
    ('TPU', 0.2200, 'Poliuretano Termoplástico - flexível'),
    ('Resina', 0.3000, 'Resina fotopolimerizável - alta precisão')
  `);

  // Serviços exemplo
  await connection.query(`
    INSERT IGNORE INTO servicos (nome, valor_hora, descricao) VALUES
    ('CAD Técnico', 120.00, 'Modelagem técnica em CAD'),
    ('CAD Artístico', 100.00, 'Modelagem artística e decorativa'),
    ('Pós-processamento', 80.00, 'Acabamento e tratamento de superfície'),
    ('Consultoria', 150.00, 'Consultoria técnica especializada')
  `);

  console.log('✅ Dados iniciais inseridos!');
  console.log('');
  console.log('👤 Usuário admin: admin@sistema.com / admin123');
  console.log('⚙️  Valor Hora-Máquina padrão: R$ 7,00');

  await connection.end();
}

migrate().catch(err => {
  console.error('❌ Erro na migração:', err.message);
  process.exit(1);
});
