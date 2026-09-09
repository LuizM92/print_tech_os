/**
 * Hora-máquina por cliente.
 *
 * O valor das configurações continua sendo a regra da casa; a coluna aqui é a exceção,
 * para o cliente que fechou outro preço. Fica nullable de propósito: nulo quer dizer
 * "use a global", e é diferente de gravar o valor global no cadastro — assim, quando a
 * configuração mudar, esse cliente acompanha em vez de ficar preso ao número antigo.
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
  if (await temColuna(conn, 'clientes', 'valor_hora_maquina')) return;
  await conn.query('ALTER TABLE clientes ADD COLUMN valor_hora_maquina DECIMAL(10,2) NULL');
};
