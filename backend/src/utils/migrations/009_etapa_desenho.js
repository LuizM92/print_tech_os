/**
 * Etapa "Desenho" na fila de produção.
 *
 * Entre a aprovação e a impressora existe o trabalho de modelagem — e enquanto ele não
 * termina a OS não está esperando máquina, está esperando desenho. Sem uma coluna
 * própria esse tempo ficava escondido dentro de "Na fila", que passava a ideia errada
 * de que a peça já poderia entrar na impressora a qualquer momento.
 *
 * O ENUM só ganha um valor novo; as OS que já existem continuam na etapa em que estão.
 */

exports.up = async (conn) => {
  await conn.query(`
    ALTER TABLE orcamentos
    MODIFY COLUMN etapa_producao
      ENUM('fila','desenho','producao','acabamento','pronto','entregue')
      NOT NULL DEFAULT 'fila'
  `);
};
