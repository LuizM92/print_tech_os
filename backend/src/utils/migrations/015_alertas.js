/**
 * Alertas da farm por notificação no navegador (Web Push).
 *
 * ── `push_inscricoes` ──
 * Cada aparelho que ativou os alertas: o navegador entrega um endpoint (do serviço de
 * push dele — Google, Mozilla, Apple) e duas chaves para cifrar a mensagem. Quem
 * ativou fica em `usuario_id`; a mesma pessoa pode ter o celular e o computador.
 * O endpoint é único: ativar de novo no mesmo aparelho só atualiza as chaves.
 *
 * ── `segredos` ──
 * O servidor assina cada envio com um par de chaves VAPID, gerado sozinho na primeira
 * vez. Não fica em `configuracoes` porque aquela tabela é listada para qualquer usuário
 * logado, e a chave privada não pode sair do servidor. Nem em variável de ambiente:
 * o docker-compose do servidor tem alterações locais que um commit não pode tocar.
 * Trocar o par invalida todas as inscrições — por isso ele é gerado uma vez e fica.
 */

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS segredos (
      chave VARCHAR(100) PRIMARY KEY,
      valor TEXT NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS push_inscricoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      usuario_id INT NOT NULL,
      -- Os endpoints passam de 500 caracteres em alguns navegadores; o índice único usa
      -- o hash para caber no limite de chave do MySQL.
      endpoint TEXT NOT NULL,
      endpoint_hash CHAR(64) NOT NULL,
      p256dh VARCHAR(255) NOT NULL,
      auth VARCHAR(255) NOT NULL,
      aparelho VARCHAR(255) NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_push_endpoint (endpoint_hash),
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);
};
