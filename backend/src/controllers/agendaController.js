/**
 * Agenda: eventos e tarefas, com repetição e lembretes.
 *
 * Quem vê: o item é de todos, a não ser que o autor o marque como privado. Quem mexe: o
 * autor e o administrador; marcar uma tarefa como feita é de qualquer um que a veja — é
 * uma lista da equipe. O que sai daqui para a tela são OCORRÊNCIAS (um evento que se
 * repete vira várias, uma por dia dentro do intervalo pedido) mais as "camadas": entregas
 * das OS e vencimentos do financeiro, só para leitura.
 */
const db = require('../utils/db');
const datas = require('../utils/financeiro/datas');
const regras = require('../utils/agenda/regras');
const serie = require('../utils/agenda/ocorrencias');
const banco = require('../utils/agenda/banco');
const avisos = require('../utils/agenda/avisos');

// A tela mais larga é o mês (42 dias); o resto é folga. Evita varrer anos de repetição.
const MAX_DIAS_CONSULTA = 100;

const erro500 = (res, err) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
};

const ehAdmin = (req) => req.usuario.perfil === 'admin';
const podeEditar = (item, req) => ehAdmin(req) || item.criado_por === req.usuario.id;

const inteiro = (v) => {
  const n = parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Uma ocorrência no formato que a tela consome: o item mais a data em que cai. */
const montarOcorrencia = (item, ocorrencia, req) => ({
  chave: `${item.id}:${ocorrencia.data}`,
  id: item.id,
  tipo: item.tipo,
  titulo: item.titulo,
  descricao: item.descricao,
  lugar: item.lugar,
  cor: item.cor,
  data: ocorrencia.data,
  data_fim: ocorrencia.data_fim,
  hora_inicio: item.hora_inicio,
  hora_fim: item.hora_fim,
  dia_inteiro: !item.hora_inicio,
  repete: item.repete,
  repete_cada: item.repete_cada,
  repete_ate: item.repete_ate,
  privado: item.privado,
  para_todos: item.para_todos,
  responsavel_id: item.responsavel_id,
  responsavel_nome: item.responsavel_nome,
  criado_por: item.criado_por,
  criador_nome: item.criador_nome,
  concluida: item.concluida,
  lembretes: item.lembretes,
  pode_editar: podeEditar(item, req),
});

/** O item pedido na rota, se existir e o usuário puder vê-lo; senão já responde 404. */
const carregar = async (req, res) => {
  const id = inteiro(req.params.id);
  const item = id && await banco.buscar(db, id);
  // Privado de outra pessoa responde como se não existisse: nem confirma que há.
  if (!item || !banco.visivelPara(item, req.usuario.id)) {
    res.status(404).json({ erro: 'Item não encontrado' });
    return null;
  }
  return item;
};

/** O responsável precisa ser um usuário ativo. Devolve a mensagem de erro, ou null. */
const conferirResponsavel = async (dados) => {
  if (!dados.responsavel_id) return null;
  const [[u]] = await db.query('SELECT id FROM usuarios WHERE id = ? AND ativo = 1', [dados.responsavel_id]);
  return u ? null : 'Responsável inválido';
};

// ─── Leitura ────────────────────────────────────────────────────────────────

const listar = async (req, res) => {
  try {
    const hoje = datas.hojeBR();
    const de = datas.ehDataISO(req.query.de) ? req.query.de : datas.primeiroDiaDoMes(hoje);
    const ate = datas.ehDataISO(req.query.ate) ? req.query.ate : datas.ultimoDiaDoMes(hoje);
    if (ate < de) return res.status(400).json({ erro: 'O fim do período é antes do início' });
    if (datas.diasEntre(de, ate) > MAX_DIAS_CONSULTA) {
      return res.status(400).json({ erro: `Peça no máximo ${MAX_DIAS_CONSULTA} dias de cada vez` });
    }

    const itens = await banco.itensDoPeriodo(db, req.usuario.id, de, ate);
    const ocorrencias = itens
      .flatMap((item) => serie.ocorrencias(item, de, ate, item.excecoes)
        .map((o) => montarOcorrencia(item, o, req)))
      .sort((a, b) => a.data.localeCompare(b.data)
        || (a.hora_inicio || '').localeCompare(b.hora_inicio || '')
        || a.id - b.id);

    const camadas = await banco.camadasDoPeriodo(db, { admin: ehAdmin(req) }, de, ate);
    res.json({ hoje, de, ate, itens: ocorrencias, camadas });
  } catch (err) {
    erro500(res, err);
  }
};

/** Quem pode ser responsável por um item: os usuários ativos. Qualquer perfil vê a lista. */
const responsaveis = async (req, res) => {
  try {
    const [linhas] = await db.query('SELECT id, nome FROM usuarios WHERE ativo = 1 ORDER BY nome');
    res.json(linhas);
  } catch (err) {
    erro500(res, err);
  }
};

// ─── Escrita ────────────────────────────────────────────────────────────────

const COLUNAS = [
  'tipo', 'titulo', 'descricao', 'lugar', 'cor', 'data_inicio', 'hora_inicio', 'data_fim', 'hora_fim',
  'repete', 'repete_cada', 'repete_ate', 'privado', 'para_todos', 'responsavel_id',
];

const criar = async (req, res) => {
  const { dados, erro } = regras.validar(req.body);
  if (erro) return res.status(400).json({ erro });

  const conn = await db.getConnection();
  try {
    const erroResponsavel = await conferirResponsavel(dados);
    if (erroResponsavel) return res.status(400).json({ erro: erroResponsavel });

    await conn.beginTransaction();
    const [r] = await conn.query(
      `INSERT INTO agenda_itens (${COLUNAS.join(', ')}, criado_por) VALUES (${COLUNAS.map(() => '?').join(', ')}, ?)`,
      [...COLUNAS.map((c) => dados[c]), req.usuario.id]
    );
    await banco.gravarLembretes(conn, r.insertId, dados.lembretes);
    await conn.commit();

    await avisos.silenciarPassados(db, r.insertId);
    res.status(201).json({
      id: r.insertId,
      mensagem: dados.tipo === 'tarefa' ? 'Tarefa criada' : 'Evento criado',
    });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

const atualizar = async (req, res) => {
  const item = await carregar(req, res).catch((err) => { erro500(res, err); return null; });
  if (!item) return undefined;
  if (!podeEditar(item, req)) return res.status(403).json({ erro: 'Só quem criou pode editar' });

  const { dados, erro } = regras.validar(req.body);
  if (erro) return res.status(400).json({ erro });

  // O formulário de uma ocorrência mostra a data DELA; como a edição vale para a série
  // toda, a data nova desloca o início da série pelo mesmo número de dias.
  const ocorrencia = req.body.ocorrencia;
  if (item.repete !== 'nao' && dados.repete !== 'nao' && datas.ehDataISO(ocorrencia)
      && serie.ocorrenciaEm(item, ocorrencia, item.excecoes)) {
    const duracao = datas.diasEntre(dados.data_inicio, dados.data_fim);
    dados.data_inicio = serie.inicioDaSerieAposEdicao(item, ocorrencia, dados.data_inicio);
    dados.data_fim = datas.somarDias(dados.data_inicio, duracao);
    if (dados.repete_ate && dados.repete_ate < dados.data_inicio) {
      return res.status(400).json({ erro: 'A repetição não pode terminar antes do evento' });
    }
  }

  // Mudou o ritmo ou o início da série: as ocorrências apagadas antes já não existem.
  const mudouSerie = item.repete !== dados.repete || item.repete_cada !== dados.repete_cada
    || item.data_inicio !== dados.data_inicio;

  const conn = await db.getConnection();
  try {
    const erroResponsavel = await conferirResponsavel(dados);
    if (erroResponsavel) return res.status(400).json({ erro: erroResponsavel });

    await conn.beginTransaction();
    await conn.query(
      `UPDATE agenda_itens SET ${COLUNAS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...COLUNAS.map((c) => dados[c]), item.id]
    );
    await banco.gravarLembretes(conn, item.id, dados.lembretes);
    if (mudouSerie) await conn.query('DELETE FROM agenda_excecoes WHERE item_id = ?', [item.id]);
    await conn.commit();

    await avisos.silenciarPassados(db, item.id);
    res.json({ mensagem: dados.tipo === 'tarefa' ? 'Tarefa atualizada' : 'Evento atualizado' });
  } catch (err) {
    await conn.rollback();
    erro500(res, err);
  } finally {
    conn.release();
  }
};

/**
 * Exclui o item todo, só uma ocorrência (`esta`) ou ela e as seguintes (`seguintes`).
 * Apagar "esta" guarda uma exceção; "as seguintes" encurta a série até o dia anterior.
 */
const excluir = async (req, res) => {
  try {
    const item = await carregar(req, res);
    if (!item) return undefined;
    if (!podeEditar(item, req)) return res.status(403).json({ erro: 'Só quem criou pode excluir' });

    const escopo = ['esta', 'seguintes'].includes(req.query.escopo) ? req.query.escopo : 'todos';
    const data = req.query.data;

    if (escopo === 'todos' || item.repete === 'nao') {
      await db.query('DELETE FROM agenda_itens WHERE id = ?', [item.id]);
      return res.json({ mensagem: 'Excluído' });
    }

    if (!datas.ehDataISO(data) || !serie.ocorrenciaEm(item, data, item.excecoes)) {
      return res.status(400).json({ erro: 'Essa data não faz parte da repetição' });
    }

    if (escopo === 'esta') {
      await db.query('INSERT IGNORE INTO agenda_excecoes (item_id, data) VALUES (?, ?)', [item.id, data]);
      return res.json({ mensagem: 'Ocorrência excluída' });
    }

    // "Esta e as seguintes" a partir do primeiro dia é a série inteira.
    if (data <= item.data_inicio) {
      await db.query('DELETE FROM agenda_itens WHERE id = ?', [item.id]);
      return res.json({ mensagem: 'Excluído' });
    }
    await db.query('UPDATE agenda_itens SET repete_ate = ? WHERE id = ?', [datas.somarDias(data, -1), item.id]);
    res.json({ mensagem: 'Ocorrências excluídas' });
  } catch (err) {
    erro500(res, err);
  }
};

/** Marca ou desmarca a tarefa como feita. Tarefa feita deixa de avisar. */
const concluir = async (req, res) => {
  try {
    const item = await carregar(req, res);
    if (!item) return undefined;
    if (item.tipo !== 'tarefa') return res.status(400).json({ erro: 'Só tarefas são concluídas' });

    const concluida = req.body?.concluida !== false;
    await db.query(
      'UPDATE agenda_itens SET concluida_em = IF(?, NOW(), NULL), concluida_por = IF(?, ?, NULL) WHERE id = ?',
      [concluida ? 1 : 0, concluida ? 1 : 0, req.usuario.id, item.id]
    );
    res.json({ concluida });
  } catch (err) {
    erro500(res, err);
  }
};

module.exports = { listar, responsaveis, criar, atualizar, excluir, concluir };
