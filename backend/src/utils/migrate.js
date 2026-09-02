/**
 * Runner de migrações versionadas.
 *
 * Aplica em ordem os arquivos de utils/migrations/ que ainda não rodaram, registrando
 * cada um em schema_migrations. Rodar com `npm run migrate` — é seguro repetir.
 *
 * Arquivos com `.manual.js` no nome ficam de fora do fluxo normal: são migrações
 * destrutivas que só devem rodar quando alguém decidir, com `npm run migrate:limpeza`.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DIR = path.join(__dirname, 'migrations');
const incluirManuais = process.argv.includes('--manuais');

async function migrate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    multipleStatements: true,
  });

  console.log('🔌 Conectado ao MySQL');

  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\``);
  await conn.query(`USE \`${process.env.DB_NAME}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao VARCHAR(100) PRIMARY KEY,
      aplicada_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const [aplicadas] = await conn.query('SELECT versao FROM schema_migrations');
  const jaAplicadas = new Set(aplicadas.map((r) => r.versao));

  const arquivos = fs.readdirSync(DIR)
    .filter((f) => f.endsWith('.js'))
    .filter((f) => incluirManuais || !f.includes('.manual.'))
    .sort();

  const pendentes = arquivos.filter((f) => !jaAplicadas.has(f));
  const manuaisPendentes = fs.readdirSync(DIR)
    .filter((f) => f.includes('.manual.') && !jaAplicadas.has(f));

  if (pendentes.length === 0) {
    console.log('✅ Banco já está atualizado — nenhuma migração pendente.');
  } else {
    console.log(`📦 ${pendentes.length} migração(ões) pendente(s)\n`);

    for (const arquivo of pendentes) {
      const migracao = require(path.join(DIR, arquivo));
      process.stdout.write(`  → ${arquivo} ... `);
      try {
        await migracao.up(conn);
        await conn.query('INSERT INTO schema_migrations (versao) VALUES (?)', [arquivo]);
        console.log('ok');
      } catch (err) {
        console.log('FALHOU');
        console.error(`\n❌ Erro em ${arquivo}: ${err.message}`);
        console.error('   Nenhuma migração seguinte foi aplicada. Corrija e rode de novo.');
        await conn.end();
        process.exit(1);
      }
    }

    console.log('\n✅ Migrações aplicadas com sucesso!');
  }

  if (!incluirManuais && manuaisPendentes.length > 0) {
    console.log('');
    console.log(`ℹ️  ${manuaisPendentes.length} migração(ões) de limpeza aguardando decisão:`);
    manuaisPendentes.forEach((f) => console.log(`     ${f}`));
    console.log('   Leia o cabeçalho do arquivo e, quando quiser aplicar: npm run migrate:limpeza');
  }

  await conn.end();
}

migrate().catch((err) => {
  console.error('❌ Erro na migração:', err.message);
  process.exit(1);
});
