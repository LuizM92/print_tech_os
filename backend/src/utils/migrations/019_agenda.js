/**
 * Agenda: eventos, tarefas, repetição e lembretes.
 *
 * ── `agenda_itens` ──
 * Evento e tarefa na mesma tabela, como `lancamentos` faz com receber e pagar: o que muda
 * é o tipo, não a estrutura (um dia, uma hora, um título, quem vê). Data e hora são
 * colunas separadas, DATE e TIME, e não um DATETIME: o compromisso é "dia 10 às 14:00" no
 * relógio de Brasília, e o servidor roda em UTC — um DATETIME seria deslocado de fuso no
 * caminho (ver utils/financeiro/datas.js). `hora_inicio` nula significa dia inteiro.
 * `data_fim` é inclusive: um evento de 10 a 12 ocupa os três dias.
 *
 * Evento que se repete é uma linha só; as ocorrências são calculadas na hora (ver
 * utils/agenda/ocorrencias.js). `agenda_excecoes` guarda as que foram apagadas da série.
 *
 * Quem vê: `privado` é só de quem criou; o resto é de todos. Quem recebe o lembrete é o
 * `responsavel_id`, ou `para_todos`, ou — sem nenhum dos dois — quem criou.
 *
 * ── `agenda_lembretes` ──
 * Minutos antes do início, vários por item. Apagam junto com o item.
 *
 * ── `agenda_avisos` ──
 * Trava dos lembretes, como `financeiro_avisos`: o app reinicia a cada deploy e o
 * agendador roda a cada minuto, então "este lembrete desta ocorrência já saiu" precisa
 * estar no banco. A chave primária faz o INSERT IGNORE decidir, sem corrida, quem avisa.
 *
 * ── `notificacoes.usuario_id` ──
 * O sino era sempre de todos (eventos da farm, cobranças). Lembrete de agenda é de uma
 * pessoa: com `usuario_id` preenchido a notificação só aparece para ela.
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
  await conn.query(`
    CREATE TABLE IF NOT EXISTS agenda_itens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      tipo ENUM('evento', 'tarefa') NOT NULL DEFAULT 'evento',
      titulo VARCHAR(150) NOT NULL,
      descricao VARCHAR(1000) NULL,
      lugar VARCHAR(150) NULL,
      cor VARCHAR(20) NOT NULL DEFAULT 'roxo',
      data_inicio DATE NOT NULL,
      hora_inicio TIME NULL,
      data_fim DATE NOT NULL,
      hora_fim TIME NULL,
      repete ENUM('nao', 'diaria', 'semanal', 'mensal', 'anual') NOT NULL DEFAULT 'nao',
      repete_cada SMALLINT NOT NULL DEFAULT 1,
      repete_ate DATE NULL,
      privado TINYINT(1) NOT NULL DEFAULT 0,
      para_todos TINYINT(1) NOT NULL DEFAULT 0,
      responsavel_id INT NULL,
      concluida_em TIMESTAMP NULL,
      concluida_por INT NULL,
      criado_por INT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_agenda_periodo (data_inicio, data_fim),
      KEY idx_agenda_criador (criado_por),
      FOREIGN KEY (responsavel_id) REFERENCES usuarios(id) ON DELETE SET NULL,
      FOREIGN KEY (concluida_por) REFERENCES usuarios(id) ON DELETE SET NULL,
      FOREIGN KEY (criado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS agenda_lembretes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_id INT NOT NULL,
      minutos INT NOT NULL,
      UNIQUE KEY uq_lembrete (item_id, minutos),
      FOREIGN KEY (item_id) REFERENCES agenda_itens(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS agenda_excecoes (
      item_id INT NOT NULL,
      data DATE NOT NULL,
      PRIMARY KEY (item_id, data),
      FOREIGN KEY (item_id) REFERENCES agenda_itens(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS agenda_avisos (
      item_id INT NOT NULL,
      data DATE NOT NULL,
      minutos INT NOT NULL,
      criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (item_id, data, minutos),
      KEY idx_agenda_avisos_criado (criado_em),
      FOREIGN KEY (item_id) REFERENCES agenda_itens(id) ON DELETE CASCADE
    )
  `);

  if (!(await temColuna(conn, 'notificacoes', 'usuario_id'))) {
    await conn.query(`
      ALTER TABLE notificacoes
        ADD COLUMN usuario_id INT NULL,
        ADD CONSTRAINT fk_notificacoes_usuario FOREIGN KEY (usuario_id)
          REFERENCES usuarios(id) ON DELETE CASCADE
    `);
  }
};
