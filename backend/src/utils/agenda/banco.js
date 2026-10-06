/**
 * Consultas da agenda, compartilhadas entre o controller e o agendador de lembretes.
 *
 * Datas e horas voltam como texto (AAAA-MM-DD, HH:MM): o mysql2 entregaria um `Date`, e
 * no navegador um dia à meia-noite UTC aparece como o anterior.
 */
const { moeda } = require('../financeiro/dinheiro');

const SELECT_ITEM = `
  SELECT i.id, i.tipo, i.titulo, i.descricao, i.lugar, i.cor,
         DATE_FORMAT(i.data_inicio, '%Y-%m-%d') AS data_inicio,
         TIME_FORMAT(i.hora_inicio, '%H:%i') AS hora_inicio,
         DATE_FORMAT(i.data_fim, '%Y-%m-%d') AS data_fim,
         TIME_FORMAT(i.hora_fim, '%H:%i') AS hora_fim,
         i.repete, i.repete_cada, DATE_FORMAT(i.repete_ate, '%Y-%m-%d') AS repete_ate,
         i.privado, i.para_todos, i.responsavel_id, i.criado_por, i.concluida_em,
         ur.nome AS responsavel_nome, uc.nome AS criador_nome
    FROM agenda_itens i
    LEFT JOIN usuarios ur ON ur.id = i.responsavel_id
    LEFT JOIN usuarios uc ON uc.id = i.criado_por`;

/** Junta a cada item os lembretes e as ocorrências apagadas da série (duas consultas, não N). */
const anexar = async (executor, linhas) => {
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.id);

  const [lembretes] = await executor.query(
    'SELECT item_id, minutos FROM agenda_lembretes WHERE item_id IN (?) ORDER BY minutos DESC', [ids]
  );
  const [excecoes] = await executor.query(
    "SELECT item_id, DATE_FORMAT(data, '%Y-%m-%d') AS data FROM agenda_excecoes WHERE item_id IN (?)", [ids]
  );

  const agrupar = (lista, campo) => lista.reduce((mapa, r) => {
    (mapa[r.item_id] = mapa[r.item_id] || []).push(r[campo]);
    return mapa;
  }, {});
  const lembretesDe = agrupar(lembretes, 'minutos');
  const excecoesDe = agrupar(excecoes, 'data');

  return linhas.map((l) => ({
    ...l,
    privado: !!l.privado,
    para_todos: !!l.para_todos,
    concluida: l.tipo === 'tarefa' && !!l.concluida_em,
    lembretes: lembretesDe[l.id] || [],
    excecoes: excecoesDe[l.id] || [],
  }));
};

/**
 * Os itens que tocam o intervalo [de, ate] e que o usuário pode ver (o privado é só de
 * quem criou). A série que se repete entra se começou até `ate` e ainda não acabou — quais
 * ocorrências caem dentro, quem decide é utils/agenda/ocorrencias.js.
 */
const itensDoPeriodo = async (executor, usuarioId, de, ate) => {
  const [linhas] = await executor.query(
    `${SELECT_ITEM}
      WHERE (i.privado = 0 OR i.criado_por = ?)
        AND ((i.repete = 'nao' AND i.data_inicio <= ? AND i.data_fim >= ?)
          OR (i.repete <> 'nao' AND i.data_inicio <= ? AND (i.repete_ate IS NULL OR i.repete_ate >= ?)))
      ORDER BY i.data_inicio, i.hora_inicio, i.id`,
    [usuarioId, ate, de, ate, de]
  );
  return anexar(executor, linhas);
};

/** Um item pelo id, sem olhar quem pergunta — o controller confere a visibilidade. */
const buscar = async (executor, id) => {
  const [linhas] = await executor.query(`${SELECT_ITEM} WHERE i.id = ?`, [id]);
  return (await anexar(executor, linhas))[0] || null;
};

/** O item pode ser visto por este usuário? Privado é só de quem criou. */
const visivelPara = (item, usuarioId) => !item.privado || item.criado_por === usuarioId;

/**
 * Os itens com lembrete que podem disparar entre os dias [de, ate]; tarefa já concluída
 * não avisa mais. `itemId` restringe a um item (para silenciar o que já passou ao salvar).
 */
const itensParaAvisar = async (executor, { de, ate, itemId = null }) => {
  const [linhas] = await executor.query(
    `${SELECT_ITEM}
      WHERE i.concluida_em IS NULL
        ${itemId ? 'AND i.id = ?' : ''}
        AND EXISTS (SELECT 1 FROM agenda_lembretes l WHERE l.item_id = i.id)
        AND ((i.repete = 'nao' AND i.data_inicio BETWEEN ? AND ?)
          OR (i.repete <> 'nao' AND i.data_inicio <= ? AND (i.repete_ate IS NULL OR i.repete_ate >= ?)))`,
    [...(itemId ? [itemId] : []), de, ate, ate, de]
  );
  return anexar(executor, linhas);
};

const gravarLembretes = async (executor, itemId, minutos) => {
  await executor.query('DELETE FROM agenda_lembretes WHERE item_id = ?', [itemId]);
  if (minutos.length === 0) return;
  await executor.query(
    'INSERT INTO agenda_lembretes (item_id, minutos) VALUES ?', [minutos.map((m) => [itemId, m])]
  );
};

// ─── O que o resto do sistema põe no calendário (só leitura) ─────────────────

const plural = (n, singular, pluralizado) => `${n} ${n === 1 ? singular : pluralizado}`;

/**
 * Entregas das OS e vencimentos do financeiro, para o calendário mostrar junto dos
 * compromissos. Contas a receber somam por dia (cinco parcelas no dia 10 viram uma
 * linha, não cinco); a pagar só aparece para o administrador, como no resto do sistema.
 */
const camadasDoPeriodo = async (executor, { admin }, de, ate) => {
  const camadas = [];

  const [entregas] = await executor.query(
    `SELECT o.id, o.numero_os, c.nome AS cliente_nome,
            DATE_FORMAT(o.previsao_entrega, '%Y-%m-%d') AS data
       FROM orcamentos o
       JOIN clientes c ON c.id = o.cliente_id
      WHERE o.tipo = 'impressao' AND o.status = 'aprovado' AND o.etapa_producao <> 'entregue'
        AND o.previsao_entrega BETWEEN ? AND ?
      ORDER BY o.previsao_entrega, o.id`,
    [de, ate]
  );
  entregas.forEach((e) => camadas.push({
    chave: `os:${e.id}`,
    camada: 'os',
    titulo: `Entrega ${e.numero_os} · ${e.cliente_nome}`,
    data: e.data,
    url: `/orcamentos/${e.id}`,
  }));

  const vencimentos = async (natureza, rotulo) => {
    const [linhas] = await executor.query(
      `SELECT DATE_FORMAT(vencimento, '%Y-%m-%d') AS data, COUNT(*) AS qtd,
              COALESCE(SUM(GREATEST(valor - valor_pago - desconto, 0)), 0) AS saldo
         FROM lancamentos
        WHERE natureza = ? AND status = 'aberto' AND vencimento BETWEEN ? AND ?
        GROUP BY vencimento
        ORDER BY vencimento`,
      [natureza, de, ate]
    );
    linhas.forEach((l) => camadas.push({
      chave: `${natureza}:${l.data}`,
      camada: natureza,
      titulo: `${plural(Number(l.qtd), `conta ${rotulo}`, `contas ${rotulo}`)} · ${moeda(l.saldo)}`,
      data: l.data,
      url: `/${natureza}?de=${l.data}&ate=${l.data}`,
    }));
  };

  await vencimentos('receber', 'a receber');
  if (admin) await vencimentos('pagar', 'a pagar');

  return camadas;
};

module.exports = {
  itensDoPeriodo, buscar, visivelPara, itensParaAvisar, gravarLembretes, camadasDoPeriodo,
};
