/**
 * Notificações dentro do sistema — o sino.
 *
 * O push avisa quem ativou no aparelho; o sino guarda o que aconteceu para quem abrir o
 * sistema depois, e para quem não ativou push nenhum. São os mesmos eventos da farm
 * (terminou, falhou, pausou sozinha, caiu e voltou), gravados uma vez só.
 *
 * ── Uma notificação, lida por cada um ──
 * A notificação é da farm, não de uma pessoa: fica numa linha só em `notificacoes`. O
 * "já vi" é de cada usuário, em `notificacao_lidas`. Assim uma impressora que terminou
 * aparece para todo mundo, e cada um marca como lida por conta própria.
 *
 * Notificação velha não serve para nada: a limpeza apaga o que passou de 60 dias
 * (as lidas vão junto pelo ON DELETE CASCADE).
 */

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS notificacoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo VARCHAR(30) NOT NULL,
      titulo VARCHAR(150) NOT NULL,
      corpo VARCHAR(500) NULL,
      url VARCHAR(255) NULL,
      impressora_id INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_notificacoes_criado (criado_em),
      FOREIGN KEY (impressora_id) REFERENCES impressoras(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS notificacao_lidas (
      notificacao_id INT NOT NULL,
      usuario_id INT NOT NULL,
      lida_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (notificacao_id, usuario_id),
      KEY idx_lidas_usuario (usuario_id),
      FOREIGN KEY (notificacao_id) REFERENCES notificacoes(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )
  `);
};
