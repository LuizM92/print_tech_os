/**
 * Importa o catálogo de SKUs de um CSV para o módulo de fabricação.
 *
 *   npm run importar:skus                      → usa sku/consolidado-skus.csv na raiz
 *   npm run importar:skus -- caminho/do.csv    → usa outro arquivo
 *
 * Colunas esperadas: loja, product_id, produto, variacao_shopee, sku_pai, sku_variacao.
 * (loja e product_id são opcionais — os CSVs por loja não trazem a coluna loja.)
 *
 * É seguro repetir: produto que já existe é reaproveitado e SKU já cadastrado é
 * pulado, nunca sobrescrito — preço e nome ajustados na tela continuam onde estão.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { desmontarSku } = require('./sku');

const ARQUIVO_PADRAO = path.join(__dirname, '..', '..', '..', 'sku', 'consolidado-skus.csv');

/** CSV simples: sem aspas nem vírgula dentro de campo, que é o formato dos arquivos. */
const lerCsv = (caminho) => {
  const linhas = fs.readFileSync(caminho, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  const cabecalho = linhas.shift().split(',').map((c) => c.trim());
  return linhas.map((linha) => {
    const celulas = linha.split(',');
    return Object.fromEntries(cabecalho.map((coluna, i) => [coluna, (celulas[i] || '').trim()]));
  });
};

async function importar() {
  const caminho = process.argv[2] ? path.resolve(process.argv[2]) : ARQUIVO_PADRAO;
  if (!fs.existsSync(caminho)) {
    console.error(`❌ Arquivo não encontrado: ${caminho}`);
    process.exit(1);
  }

  const linhas = lerCsv(caminho);
  console.log(`📄 ${path.basename(caminho)} — ${linhas.length} linha(s)`);

  // Agrupa por SKU pai: uma listagem por loja, uma variação por SKU.
  const produtos = new Map();
  const ignoradas = [];

  for (const linha of linhas) {
    const blocos = desmontarSku(linha.sku_variacao);
    if (!blocos || !linha.sku_pai) {
      ignoradas.push(linha.sku_variacao || '(vazio)');
      continue;
    }

    if (!produtos.has(linha.sku_pai)) {
      produtos.set(linha.sku_pai, {
        sku_pai: linha.sku_pai,
        categoria: blocos.categoria,
        modelo: blocos.modelo,
        nome: linha.produto || linha.sku_pai,
        variacoes: new Map(),
        listagens: new Map(),
      });
    }
    const produto = produtos.get(linha.sku_pai);

    if (!produto.variacoes.has(linha.sku_variacao)) {
      produto.variacoes.set(linha.sku_variacao, {
        sku: linha.sku_variacao,
        material: blocos.material,
        variacao: blocos.variacao,
        tamanho: blocos.tamanho,
        nome_variacao: linha.variacao_shopee || null,
      });
    }
    const loja = linha.loja || 'shopee';
    if (linha.product_id && !produto.listagens.has(loja)) {
      produto.listagens.set(loja, { loja, product_id: linha.product_id });
    }
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  let novosProdutos = 0;
  let novasVariacoes = 0;

  for (const produto of produtos.values()) {
    const [existe] = await conn.query('SELECT id FROM fab_produtos WHERE sku_pai = ?', [produto.sku_pai]);
    let produtoId;

    if (existe.length > 0) {
      produtoId = existe[0].id;
    } else {
      const [r] = await conn.query(
        'INSERT INTO fab_produtos (sku_pai, categoria, modelo, nome) VALUES (?, ?, ?, ?)',
        [produto.sku_pai, produto.categoria, produto.modelo, produto.nome]
      );
      produtoId = r.insertId;
      novosProdutos += 1;
    }

    for (const v of produto.variacoes.values()) {
      const [r] = await conn.query(
        `INSERT IGNORE INTO fab_variacoes
           (produto_id, sku, material, variacao, tamanho, nome_variacao)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [produtoId, v.sku, v.material, v.variacao, v.tamanho, v.nome_variacao]
      );
      novasVariacoes += r.affectedRows;
    }

    for (const l of produto.listagens.values()) {
      await conn.query(
        'INSERT IGNORE INTO fab_listagens (produto_id, loja, product_id) VALUES (?, ?, ?)',
        [produtoId, l.loja, l.product_id]
      );
    }
  }

  await conn.end();

  console.log(`✅ ${novosProdutos} produto(s) e ${novasVariacoes} variação(ões) importadas`);
  console.log(`   ${produtos.size - novosProdutos} produto(s) já existiam e foram reaproveitados`);
  if (ignoradas.length > 0) {
    console.log(`⚠️  ${ignoradas.length} linha(s) fora do padrão foram ignoradas:`);
    ignoradas.slice(0, 10).forEach((s) => console.log(`     ${s}`));
  }
}

importar().catch((err) => {
  console.error('❌ Erro na importação:', err.message);
  process.exit(1);
});
