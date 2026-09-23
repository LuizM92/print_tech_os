/**
 * Arquivos de modelo que o cliente manda junto do orçamento.
 *
 * Tem cliente que já chega com as peças prontas — um ZIP, alguns STL, um STEP saído do
 * CAD dele. Esses arquivos ficam guardados no orçamento: quem for imprimir abre o
 * documento e acha o modelo ali, em vez de caçar o anexo no e-mail ou no WhatsApp.
 *
 * ── Por que tabela própria ──
 * Mesma razão da nota fiscal: o arquivo é um blob, e blob não pode entrar em
 * `orcamentos`, que é lida em listagem com `SELECT *`. A diferença para a NF é a
 * quantidade — a NF é uma só por orçamento, e aqui são quantos o cliente mandar, cada
 * um em sua linha.
 *
 * ── Por que no banco ──
 * O container da aplicação não tem volume: arquivo em disco sumiria no próximo deploy.
 * No MySQL ele entra no mesmo backup do resto.
 */

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS orcamento_arquivos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      orcamento_id INT NOT NULL,
      nome VARCHAR(255) NOT NULL,
      -- Guardada separada do nome porque é por ela que a tela decide o rótulo, e é
      -- ela que o filtro do upload aprovou.
      extensao VARCHAR(10) NOT NULL,
      tamanho INT NOT NULL,
      -- LONGBLOB, não MEDIUMBLOB: o teto do MEDIUMBLOB é 16 MB e o limite do upload
      -- é 25 MB.
      arquivo LONGBLOB NOT NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_arquivos_orcamento (orcamento_id),
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id)
    )
  `);
};
