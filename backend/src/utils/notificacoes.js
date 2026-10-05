/**
 * Notificações do sino. Quem cria são os alertas da farm (utils/alertas); aqui fica
 * gravar, listar para cada usuário com o que ele já leu, e marcar como lida.
 */
const db = require('./db');

// O sino mostra as últimas de cada aba; mais que isso é histórico, e o histórico está nas telas.
const LIMITE_LISTA = 30;

/**
 * As abas do sino. O que não é financeiro vem do monitor das impressoras, então
 * "impressão" é o resto: um tipo novo do monitor cai na aba certa sem mexer aqui.
 */
const CATEGORIAS = ['impressao', 'financeiro'];
const TIPOS_FINANCEIROS = ['financeiro'];

const categoriaDe = (tipo) => (TIPOS_FINANCEIROS.includes(tipo) ? 'financeiro' : 'impressao');

/** Trecho de WHERE (e seus parâmetros) que restringe a uma aba; sem aba, não restringe. */
const filtroCategoria = (categoria) => {
  if (categoria === 'financeiro') return { sql: 'n.tipo IN (?)', params: [TIPOS_FINANCEIROS] };
  if (categoria === 'impressao') return { sql: 'n.tipo NOT IN (?)', params: [TIPOS_FINANCEIROS] };
  return { sql: '1 = 1', params: [] };
};
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
 * então a restrição é uma coluna e cada consulta abaixo a respeita.
 */
async function registrar(alerta, { impressoraId = null, somenteAdmin = false } = {}) {
  try {
    await db.query(
      'INSERT INTO notificacoes (tipo, titulo, corpo, url, impressora_id, somente_admin) VALUES (?, ?, ?, ?, ?, ?)',
      [alerta.tipo || 'aviso', alerta.titulo.slice(0, 150), alerta.corpo?.slice(0, 500) || null,
        alerta.url || null, impressoraId, somenteAdmin ? 1 : 0],
    );
    await limparVelhas();
  } catch (err) {
    console.error(`[notificacoes] ${err.message}`);
  }
}

async function listar(usuarioId, { admin = false } = {}) {
  // Quem não é admin não enxerga as marcadas como somente_admin, nem na lista nem no contador.
  const visivel = admin ? '1 = 1' : 'n.somente_admin = 0';

  // O limite vale por aba: com um só, as impressoras (muitos eventos por dia) empurrariam
  // o aviso financeiro (um por dia) para fora da lista, e a aba ficaria vazia com contador.
  const porAba = await Promise.all(CATEGORIAS.map(async (categoria) => {
    const filtro = filtroCategoria(categoria);
    const [linhas] = await db.query(
      `SELECT n.id, n.tipo, n.titulo, n.corpo, n.url, n.criado_em, (l.usuario_id IS NOT NULL) AS lida
         FROM notificacoes n
         LEFT JOIN notificacao_lidas l ON l.notificacao_id = n.id AND l.usuario_id = ?
        WHERE ${visivel} AND ${filtro.sql}
        ORDER BY n.id DESC
        LIMIT ?`,
      [usuarioId, ...filtro.params, LIMITE_LISTA],
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
      WHERE l.usuario_id IS NULL AND n.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${visivel}
      GROUP BY n.tipo`,
    [usuarioId, DIAS_NAO_LIDAS],
  );
  const naoLidasPorCategoria = Object.fromEntries(CATEGORIAS.map((c) => [c, 0]));
  contagem.forEach(({ tipo, total }) => { naoLidasPorCategoria[categoriaDe(tipo)] += Number(total); });
  const naoLidas = Object.values(naoLidasPorCategoria).reduce((soma, n) => soma + n, 0);

  return { itens, nao_lidas: naoLidas, nao_lidas_por_categoria: naoLidasPorCategoria };
}

async function marcarLida(id, usuarioId) {
  await db.query(
    `INSERT IGNORE INTO notificacao_lidas (notificacao_id, usuario_id)
     SELECT id, ? FROM notificacoes WHERE id = ?`,
    [usuarioId, id],
  );
}

/** Marca tudo como lido — ou só uma aba, quando `categoria` vem (o botão fica dentro da aba). */
async function marcarTodas(usuarioId, { admin = false, categoria = null } = {}) {
  const filtro = filtroCategoria(categoria);
  await db.query(
    `INSERT IGNORE INTO notificacao_lidas (notificacao_id, usuario_id)
     SELECT n.id, ? FROM notificacoes n
      WHERE n.criado_em >= DATE_SUB(NOW(), INTERVAL ? DAY) AND ${filtro.sql}
        ${admin ? '' : 'AND n.somente_admin = 0'}`,
    [usuarioId, DIAS_GUARDAR, ...filtro.params],
  );
}

module.exports = { registrar, listar, marcarLida, marcarTodas, categoriaDe, CATEGORIAS };
