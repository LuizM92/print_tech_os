/**
 * Notificações do sino. Quem cria são os alertas da farm (utils/alertas), o aviso diário
 * de vencimentos (utils/financeiro) e os lembretes da agenda (utils/agenda); aqui fica
 * gravar, listar para cada usuário com o que ele já leu, e marcar como lida.
 */
const db = require('./db');

// O sino mostra as últimas de cada aba; mais que isso é histórico, e o histórico está nas telas.
const LIMITE_LISTA = 30;

/**
 * As abas do sino. O que não é financeiro nem agenda vem do monitor das impressoras, então
 * "impressão" é o resto: um tipo novo do monitor cai na aba certa sem mexer aqui.
 */
const CATEGORIAS = ['impressao', 'financeiro', 'agenda'];
const TIPOS_DA_CATEGORIA = { financeiro: ['financeiro'], agenda: ['agenda'] };
const TIPOS_FORA_DA_IMPRESSAO = Object.values(TIPOS_DA_CATEGORIA).flat();

const categoriaDe = (tipo) =>
  Object.keys(TIPOS_DA_CATEGORIA).find((c) => TIPOS_DA_CATEGORIA[c].includes(tipo)) || 'impressao';

/** Trecho de WHERE (e seus parâmetros) que restringe a uma aba; sem aba, não restringe. */
const filtroCategoria = (categoria) => {
  if (TIPOS_DA_CATEGORIA[categoria]) return { sql: 'n.tipo IN (?)', params: [TIPOS_DA_CATEGORIA[categoria]] };
  if (categoria === 'impressao') return { sql: 'n.tipo NOT IN (?)', params: [TIPOS_FORA_DA_IMPRESSAO] };
  return { sql: '1 = 1', params: [] };
};

/**
 * Quem pode ver uma notificação. Quem não é admin não enxerga as `somente_admin` (contas a
 * pagar), e a que tem `usuario_id` (lembrete de agenda) é só daquela pessoa.
 */
const filtroVisivel = (usuarioId, admin) => ({
  sql: `${admin ? '1 = 1' : 'n.somente_admin = 0'} AND (n.usuario_id IS NULL OR n.usuario_id = ?)`,
  params: [usuarioId],
});

// O contador só conta o que é recente: notificação de semanas atrás não é "nova".
const DIAS_NAO_LIDAS = 30;
const DIAS_GUARDAR = 60;
const INTERVALO_LIMPEZA_MS = 24 * 3600 * 1000;

let ultimaLimpeza = 0;

async function limparVelhas() {
  if (Date.now() - ultimaLimpeza < INTERVALO_LIMPEZA_MS) return;
  ultimaLimpeza = Date.now();
  await db.query('DELETE FROM notificacoes WHERE criado_em < DATE_SUB(NOW(), INTERVAL ? DAY)', [DIAS_GUARDAR]);
}

/**
 * Grava a notificação. Falha aqui não pode impedir o push nem derrubar o monitor.
 * `somenteAdmin` marca o que o operador não pode ver (contas a pagar): o sino é de todos,
 * então a restrição é uma coluna e cada consulta abaixo a respeita. `usuarioId` faz o
 * mesmo para um usuário só (lembrete de agenda).
 */
async function registrar(alerta, { impressoraId = null, somenteAdmin = false, usuarioId = null } = {}) {
  try {
    await db.query(
      `INSERT INTO notificacoes (tipo, titulo, corpo, url, impressora_id, somente_admin, usuario_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [alerta.tipo || 'aviso', alerta.titulo.slice(0, 150), alerta.corpo?.slice(0, 500) || null,
        alerta.url || null, impressoraId, somenteAdmin ? 1 : 0, usuarioId],
    );
    await limparVelhas();
  } catch (err) {
    console.error(`[notificacoes] ${err.message}`);
  }
}

async function listar(usuarioId, { admin = false } = {}) {
  const visivel = filtroVisivel(usuarioId, admin);

  // O limite vale por aba: com um só, as impressoras (muitos eventos por dia) empurrariam
  // o aviso financeiro (um por dia) para fora da lista, e a aba ficaria vazia com contador.
  const porAba = await Promise.all(CATEGORIAS.map(async (categoria) => {
    const filtro = filtroCategoria(categoria);
    const [linhas] = await db.query(
      `SELECT n.id, n.tipo, n.titulo, n.corpo, n.url, n.criado_em, (l.usuario_id IS NOT NULL) AS lida
         FROM notificacoes n
         LEFT JOIN notificacao_lidas l ON l.notificacao_id = n.id AND l.usuario_id = ?
        WHERE ${visivel.sql} AND ${filtro.sql}
        ORDER BY n.id DESC
        LIMIT ?`,
      [usuarioId, ...visivel.params, ...filtro.params, LIMITE_LISTA],
    );
    return linhas;
  }));
  const itens = porAba.flat()
    .map((i) => ({ ...i, lida: !!i.lida, categoria: categoriaDe(i.tipo) }))
    .sort((a, b) => b.id - a.id);

  const [contagem] = await db.query(
    `SELECT n.tipo, COUNT(*) AS total
       FROM notificacoes n
       LEFT JOIN notificacao_lidas l ON l.notificacao_id = n.id AND l.usuario_id = ?
      WHERE l.usuario_id IS NULL AND n.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${visivel.sql}
      GROUP BY n.tipo`,
    [usuarioId, DIAS_NAO_LIDAS, ...visivel.params],
  );
  const naoLidasPorCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, 0]));
  contagem.forEach(({ tipo, total }) => { naoLidasPorCategoria[categoriaDe(tipo)] += Number(total); });
  const naoLidas = Object.values(naoLidasPorCategoria).reduce((soma, n) => soma + n, 0);

  return { itens, nao_lidas: naoLidas, nao_lidas_por_categoria: naoLidasPorCategoria };
}

async function marcarLida(id, usuarioId) {
  await db.query(
    `INSERT IGNORE INTO notificacao_lidas (notificacao_id, usuario_id)
     SELECT id, ? FROM notificacoes WHERE id = ? AND (usuario_id IS NULL OR usuario_id = ?)`,
    [usuarioId, id, usuarioId],
  );
}

/** Marca tudo como lido — ou só uma aba, quando `categoria` vem (o botão fica dentro da aba). */
async function marcarTodas(usuarioId, { admin = false, categoria = null } = {}) {
  const filtro = filtroCategoria(categoria);
  const visivel = filtroVisivel(usuarioId, admin);
  await db.query(
    `INSERT IGNORE INTO notificacao_lidas (notificacao_id, usuario_id)
     SELECT n.id, ? FROM notificacoes n
      WHERE n.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${filtro.sql} AND ${visivel.sql}`,
    [usuarioId, DIAS_GUARDAR, ...filtro.params, ...visivel.params],
  );
}

module.exports = { registrar, listar, marcarLida, marcarTodas, categoriaDe, CATEGORIAS };
