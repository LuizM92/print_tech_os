/**
 * Impressões e o vínculo com a produção — a parte com banco.
 *
 * O monitor chama `sincronizar` a cada leitura; as regras de quando abrir e fechar
 * estão em vinculo.js. Quando uma impressão vinculada começa e a OS ainda está em
 * "Na fila" ou "Desenho", a OS passa para "Imprimindo" — a peça está na máquina, e o
 * quadro de produção tem que dizer isso sem ninguém arrastar o cartão. O fim da
 * impressão não move a OS: uma OS pode ter várias peças e várias impressões, e só
 * quem está na oficina sabe quando acabou tudo.
 */
const db = require('../db');
const { registrarHistorico } = require('../documentos');
const { detalheMovimento } = require('../producao');
const { numeroOsDoArquivo, decidir } = require('./vinculo');

// Etapas de onde a OS sai sozinha quando a impressão começa.
const ANTES_DA_IMPRESSORA = ['fila', 'desenho'];
// Até quanto tempo depois de terminada a impressão ainda aceita vínculo pelo card.
const HORAS_PARA_VINCULAR = 24;

// impressora_id → impressão mais recente dela ({ id, arquivo, resultado, orcamento_id, numero_os, vinculo })
const ultimas = new Map();

const CAMPOS = `i.id, i.impressora_id, i.arquivo, i.resultado, i.orcamento_id, i.vinculo,
                i.iniciada_em, i.terminada_em, i.duracao_s, o.numero_os`;

async function carregar() {
  const [rows] = await db.query(
    `SELECT ${CAMPOS}
       FROM impressoes i
       JOIN (SELECT impressora_id, MAX(id) AS id FROM impressoes GROUP BY impressora_id) u ON u.id = i.id
       LEFT JOIN orcamentos o ON o.id = i.orcamento_id`,
  );
  ultimas.clear();
  rows.forEach((r) => ultimas.set(r.impressora_id, r));
}

const recarregarUma = async (id) => {
  const [[r]] = await db.query(
    `SELECT ${CAMPOS} FROM impressoes i LEFT JOIN orcamentos o ON o.id = i.orcamento_id WHERE i.id = ?`, [id],
  );
  if (r) ultimas.set(r.impressora_id, r);
  return r;
};

const aberta = (impressoraId) => {
  const u = ultimas.get(impressoraId);
  return u && u.resultado === 'andamento' ? u : null;
};

/** OS aprovada de impressão com esse número, ou null. */
async function buscarOs(numero) {
  if (!numero) return null;
  const [[os]] = await db.query(
    `SELECT id, numero_os FROM orcamentos
      WHERE numero_os = ? AND tipo = 'impressao' AND status = 'aprovado'`,
    [numero],
  );
  return os || null;
}

/**
 * Leva a OS para "Imprimindo" se ela ainda estiver antes da impressora. Transação
 * própria com FOR UPDATE, como o arrastar do quadro — os dois podem acontecer juntos.
 */
async function levarParaImpressao(orcamentoId, { impressora, arquivo, usuarioId = null }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[os]] = await conn.query(
      `SELECT id, etapa_producao, total_geral FROM orcamentos
        WHERE id = ? AND tipo = 'impressao' AND status = 'aprovado' FOR UPDATE`,
      [orcamentoId],
    );
    if (os && ANTES_DA_IMPRESSORA.includes(os.etapa_producao)) {
      await conn.query(
        "UPDATE orcamentos SET etapa_producao = 'producao', etapa_alterada_em = NOW() WHERE id = ?", [os.id],
      );
      await registrarHistorico(conn, {
        orcamento_id: os.id,
        usuario_id: usuarioId,
        acao: 'produção: producao',
        detalhe: `${detalheMovimento(os.etapa_producao, 'producao')} — começou na ${impressora}: ${arquivo}`.slice(0, 500),
        total_anterior: os.total_geral,
        total_novo: os.total_geral,
      });
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function abrir(imp, arquivo, decorrido) {
  const os = await buscarOs(numeroOsDoArquivo(arquivo));
  const [r] = await db.query(
    `INSERT INTO impressoes (impressora_id, orcamento_id, vinculo, arquivo, iniciada_em)
     VALUES (?, ?, ?, ?, DATE_SUB(NOW(), INTERVAL ? SECOND))`,
    [imp.id, os?.id || null, os ? 'auto' : null, arquivo.slice(0, 255), Math.max(0, decorrido || 0)],
  );
  await recarregarUma(r.insertId);
  if (os) await levarParaImpressao(os.id, { impressora: imp.nome, arquivo });
}

async function fechar(impressao, resultado, decorrido) {
  // A duração vem da impressora quando ela informa (não conta o tempo em que o servidor
  // ficou fora do ar); senão, do relógio desde o início.
  await db.query(
    `UPDATE impressoes
        SET resultado = ?, terminada_em = NOW(),
            duracao_s = COALESCE(?, TIMESTAMPDIFF(SECOND, iniciada_em, NOW()))
      WHERE id = ? AND resultado = 'andamento'`,
    [resultado, decorrido ?? null, impressao.id],
  );
  await recarregarUma(impressao.id);
}

/** Chamado pelo monitor depois de cada leitura. Erro aqui não pode derrubar o monitor. */
async function sincronizar(imp, atual) {
  try {
    const ab = aberta(imp.id);
    const d = decidir(ab, atual);
    if (d.acao === 'abrir') await abrir(imp, d.arquivo, d.decorrido_s);
    if (d.acao === 'fechar') await fechar(ab, d.resultado, d.decorrido_s);
    if (d.acao === 'trocar') {
      await fechar(ab, 'interrompida', null);
      await abrir(imp, d.arquivo, d.decorrido_s);
    }
  } catch (err) {
    console.error(`[impressoes] ${imp.nome}: ${err.message}`);
  }
}

/**
 * A impressão que o card da impressora mostra: a que está rodando, ou a última, se
 * ainda for o arquivo que a impressora exibe (acabou há pouco e dá para vincular).
 */
function atualDe(impressoraId, status) {
  const u = ultimas.get(impressoraId);
  if (!u) return null;
  if (u.resultado === 'andamento') return u;
  return status?.job?.arquivo === u.arquivo ? u : null;
}

/** Vínculo pelo card: põe, troca ou tira a OS da impressão atual da impressora. */
async function vincular(imp, status, orcamentoId, usuarioId) {
  const alvo = atualDe(imp.id, status);
  if (!alvo) {
    const erro = new Error('Não há impressão recente nesta impressora para vincular');
    erro.validacao = true;
    throw erro;
  }
  if (alvo.resultado !== 'andamento' && alvo.terminada_em
      && Date.now() - new Date(alvo.terminada_em).getTime() > HORAS_PARA_VINCULAR * 3600 * 1000) {
    const erro = new Error('Essa impressão terminou há mais de um dia');
    erro.validacao = true;
    throw erro;
  }

  let os = null;
  if (orcamentoId) {
    [[os]] = await db.query(
      `SELECT id, numero_os, total_geral FROM orcamentos
        WHERE id = ? AND tipo = 'impressao' AND status = 'aprovado'`,
      [orcamentoId],
    );
    if (!os) {
      const erro = new Error('Só OS aprovadas podem ser vinculadas');
      erro.validacao = true;
      throw erro;
    }
  }

  await db.query('UPDATE impressoes SET orcamento_id = ?, vinculo = ? WHERE id = ?',
    [os?.id || null, os ? 'manual' : null, alvo.id]);

  if (os) {
    await registrarHistorico(db, {
      orcamento_id: os.id,
      usuario_id: usuarioId,
      acao: 'impressão vinculada',
      detalhe: `${imp.nome}: ${alvo.arquivo}`.slice(0, 500),
      total_anterior: os.total_geral,
      total_novo: os.total_geral,
    });
    if (alvo.resultado === 'andamento') {
      await levarParaImpressao(os.id, { impressora: imp.nome, arquivo: alvo.arquivo, usuarioId });
    }
  }
  return recarregarUma(alvo.id);
}

/**
 * Para o quadro de produção: por OS, as impressões rodando agora e o tempo real já
 * gasto (só as concluídas — cancelada e erro também consumiram máquina, mas não
 * entregaram peça; entram na conta separada para não esconder o retrabalho).
 */
async function resumoPorOs(ids) {
  if (!ids.length) return new Map();
  const [rows] = await db.query(
    `SELECT i.orcamento_id, i.impressora_id, i.resultado, i.duracao_s, i.arquivo,
            TIMESTAMPDIFF(SECOND, i.iniciada_em, NOW()) AS rodando_s
       FROM impressoes i
      WHERE i.orcamento_id IN (?)`,
    [ids],
  );
  const mapa = new Map();
  for (const r of rows) {
    const m = mapa.get(r.orcamento_id) || { concluidas: 0, real_s: 0, perdido_s: 0, rodando: [] };
    if (r.resultado === 'concluida') { m.concluidas += 1; m.real_s += r.duracao_s || 0; }
    if (['cancelada', 'erro', 'interrompida'].includes(r.resultado)) m.perdido_s += r.duracao_s || 0;
    if (r.resultado === 'andamento') m.rodando.push({ impressora_id: r.impressora_id, arquivo: r.arquivo });
    mapa.set(r.orcamento_id, m);
  }
  return mapa;
}

/** Todas as impressões de uma OS, para o detalhe dela. */
async function daOs(orcamentoId) {
  const [rows] = await db.query(
    `SELECT i.id, i.arquivo, i.resultado, i.vinculo, i.iniciada_em, i.terminada_em,
            COALESCE(i.duracao_s, TIMESTAMPDIFF(SECOND, i.iniciada_em, NOW())) AS duracao_s,
            p.nome AS impressora
       FROM impressoes i
       JOIN impressoras p ON p.id = i.impressora_id
      WHERE i.orcamento_id = ?
      ORDER BY i.iniciada_em DESC`,
    [orcamentoId],
  );
  return rows;
}

module.exports = { carregar, sincronizar, atualDe, vincular, resumoPorOs, daOs };
