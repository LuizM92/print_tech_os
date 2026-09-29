/**
 * Monitor das impressoras da farm.
 *
 * O servidor fica na mesma rede das impressoras, então é o próprio backend que conversa
 * com elas e entrega o estado para a tela — de fora da empresa, o acesso passa pelo
 * túnel e pelo login do sistema, e nenhuma impressora fica exposta na internet.
 *
 * ── `impressoras` ──
 * O cadastro: onde a impressora está na rede e como falar com ela. `protocolo` escolhe o
 * adaptador (utils/impressoras/). Nesta primeira fase só existe o `moonraker`, que atende
 * as Creality e a Elegoo (todas com Klipper); `bambu` e `flashforge` entram depois e já
 * têm onde guardar o serial e o código de acesso que vão precisar.
 *
 * A api_key e o código de acesso ficam aqui porque o backend precisa deles em claro para
 * falar com a impressora. Eles nunca voltam para a tela — a listagem só diz se existem.
 *
 * ── `impressora_eventos` ──
 * O estado ao vivo fica em memória (muda a cada poucos segundos, não vale gravar).
 * O que entra no banco são as viradas: começou, terminou, pausou, deu erro — e os
 * comandos que alguém mandou pela tela, com quem mandou. É a base do histórico e,
 * mais adiante, do tempo real de impressão contra o tempo orçado.
 */

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS impressoras (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nome VARCHAR(100) NOT NULL,
      marca VARCHAR(50) NULL,
      modelo VARCHAR(100) NULL,
      protocolo VARCHAR(20) NOT NULL DEFAULT 'moonraker',
      host VARCHAR(255) NOT NULL,
      porta INT NULL,
      api_key VARCHAR(255) NULL,
      serial VARCHAR(100) NULL,
      codigo_acesso VARCHAR(100) NULL,
      -- Vazio = usa a câmera que a própria impressora anuncia (no Moonraker,
      -- /server/webcams/list). Preenchido = esta URL, para quando o anúncio aponta
      -- para uma porta errada.
      url_camera VARCHAR(500) NULL,
      ordem INT NOT NULL DEFAULT 0,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS impressora_eventos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      impressora_id INT NOT NULL,
      tipo VARCHAR(30) NOT NULL,
      arquivo VARCHAR(255) NULL,
      detalhe VARCHAR(500) NULL,
      -- Segundos imprimindo quando o job acabou (concluída, cancelada, erro).
      duracao_s INT NULL,
      usuario_id INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_eventos_impressora (impressora_id, criado_em),
      FOREIGN KEY (impressora_id) REFERENCES impressoras(id) ON DELETE CASCADE,
      FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
  `);
};
