/**
 * Impressões — cada job que passou por uma impressora, vinculado (ou não) a uma OS.
 *
 * Até aqui o monitor só guardava eventos soltos (começou, concluiu). Para ligar a farm
 * à produção é preciso a impressão como uma coisa só: de que arquivo, em que máquina,
 * quando começou, quanto durou e como terminou — e de qual OS ela é. Com isso a OS
 * mostra o que está na máquina agora e quanto tempo de impressão já consumiu, contra
 * as horas que foram orçadas.
 *
 * ── O vínculo ──
 * Os arquivos da farm já saem do fatiador com o número da OS no nome
 * ("OS-202609-0005 - Deposito..."). O monitor lê esse número quando a impressão começa
 * e vincula sozinho (`vinculo = 'auto'`). Arquivo sem número, ou vínculo errado, se
 * corrige pelo card da impressora (`vinculo = 'manual'`).
 *
 * ── `resultado` ──
 * `andamento` enquanto roda (inclui pausada e impressora offline — ela pode voltar
 * imprimindo). `interrompida` quando a impressora aparece fazendo outra coisa sem ter
 * dito que terminou: Klipper reiniciado, outro arquivo começando por cima.
 */

exports.up = async (conn) => {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS impressoes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      impressora_id INT NOT NULL,
      orcamento_id INT NULL,
      vinculo ENUM('auto', 'manual') NULL,
      arquivo VARCHAR(255) NOT NULL,
      iniciada_em DATETIME NOT NULL,
      terminada_em DATETIME NULL,
      duracao_s INT NULL,
      resultado ENUM('andamento', 'concluida', 'cancelada', 'erro', 'interrompida')
        NOT NULL DEFAULT 'andamento',
      KEY idx_impressoes_impressora (impressora_id, resultado),
      KEY idx_impressoes_orcamento (orcamento_id),
      FOREIGN KEY (impressora_id) REFERENCES impressoras(id) ON DELETE CASCADE,
      FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE SET NULL
    )
  `);
};
