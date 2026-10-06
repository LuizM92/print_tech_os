/**
 * Lembretes da agenda, no sino e por push.
 *
 * A cada minuto o sistema olha os itens com lembrete e dispara os que chegaram na hora —
 * "Reunião · Evento hoje às 14:00". O texto de cada aviso está em lembretes.js.
 *
 * ── Uma vez só, mesmo reiniciando ──
 * O app reinicia a cada deploy. A trava é uma linha em `agenda_avisos` por (item, dia da
 * ocorrência, lembrete): o INSERT IGNORE decide, sem corrida, quem avisa — o mesmo truque
 * do aviso de vencimentos do financeiro.
 *
 * ── A janela ──
 * Cada rodada olha a última hora, não só o último minuto: um deploy de poucos minutos não
 * faz perder o lembrete. Hora para trás é descartada de propósito — acordar com o sistema
 * despejando os lembretes de ontem não ajuda ninguém. E ao salvar um item, o que já cairia
 * nessa janela é marcado como enviado (`silenciarPassados`): marcar um evento para daqui a
 * dez minutos com "30 min antes" não dispara na hora um lembrete que já passou.
 *
 * ── Quem recebe ──
 * O responsável, se houver; "todos", se marcado; senão quem criou. É uma notificação
 * pessoal: só aparece no sino de quem recebe e o push vai só aos aparelhos dele.
 */
const db = require('../db');
const notificacoes = require('../notificacoes');
const alertas = require('../alertas');
const banco = require('./banco');
const lembretes = require('./lembretes');
const { LEMBRETES_HORARIO } = require('./regras');
const { agoraBR, diaDoInstante } = require('../financeiro/datas');

const JANELA_MIN = 60;
const INTERVALO_MS = 60 * 1000;
const ATRASO_INICIAL_MS = 20 * 1000;
const DIAS_GUARDAR_AVISOS = 30;
const INTERVALO_LIMPEZA_MS = 24 * 3600 * 1000;
const MAIOR_LEMBRETE_MIN = Math.max(...LEMBRETES_HORARIO);

let ultimaLimpeza = 0;

/** Os lembretes que disparam em (ini, fim], com o item de cada um. */
async function gatilhosDaJanela(executor, ini, fim, itemId = null) {
  const itens = await banco.itensParaAvisar(executor, {
    de: diaDoInstante(ini),
    ate: diaDoInstante(fim + MAIOR_LEMBRETE_MIN),
    itemId,
  });
  return itens.flatMap((item) => lembretes.gatilhos(item, ini, fim).map((g) => ({ item, ...g })));
}

/** Quem recebe: { usuarioId } (null = todos), ou null se não há ninguém (autor apagado). */
const destinatario = (item) => {
  if (item.para_todos) return { usuarioId: null };
  const id = item.responsavel_id || item.criado_por;
  return id ? { usuarioId: id } : null;
};

const gravarTrava = async (executor, itemId, data, minutos) => {
  const [r] = await executor.query(
    'INSERT IGNORE INTO agenda_avisos (item_id, data, minutos) VALUES (?, ?, ?)', [itemId, data, minutos]
  );
  return r.affectedRows > 0;
};

async function limparAvisosVelhos() {
  if (Date.now() - ultimaLimpeza < INTERVALO_LIMPEZA_MS) return;
  ultimaLimpeza = Date.now();
  await db.query('DELETE FROM agenda_avisos WHERE criado_em < DATE_SUB(NOW(), INTERVAL ? DAY)', [DIAS_GUARDAR_AVISOS]);
}

/**
 * Faz uma rodada. Devolve quantos avisos saíram (os testes e o log usam).
 * `agora` existe para fixar o relógio.
 */
async function executar(agora = new Date()) {
  const fim = agoraBR(agora);
  const hoje = diaDoInstante(fim);
  let enviados = 0;

  for (const g of await gatilhosDaJanela(db, fim - JANELA_MIN, fim)) {
    const destino = destinatario(g.item);
    if (!destino) continue;
    if (!(await gravarTrava(db, g.item.id, g.data, g.minutos))) continue; // outra rodada já avisou

    const aviso = lembretes.montarAviso(g.item, g.data, g.minutos, hoje);
    await notificacoes.registrar(aviso, { usuarioId: destino.usuarioId });
    alertas.enviar(aviso, { usuarioId: destino.usuarioId })
      .catch((err) => console.error(`[agenda] push: ${err.message}`));
    enviados += 1;
  }

  await limparAvisosVelhos();
  return enviados;
}

/**
 * Marca como já enviado o que cairia na janela de agora — chamado ao salvar um item, para
 * o lembrete que já passou não disparar de uma vez. Antes, `reabrir` solta as travas do
 * item, porque mudar o horário de um evento tem de rearmar os lembretes dele.
 */
async function silenciarPassados(executor, itemId, agora = new Date()) {
  await executor.query('DELETE FROM agenda_avisos WHERE item_id = ?', [itemId]);
  const fim = agoraBR(agora);
  for (const g of await gatilhosDaJanela(executor, fim - JANELA_MIN, fim, itemId)) {
    await gravarTrava(executor, itemId, g.data, g.minutos);
  }
}

/** Liga o relógio. Falha numa rodada não derruba o servidor nem cancela as próximas. */
function iniciar() {
  const rodar = () => executar().catch((err) => console.error(`[agenda] lembretes: ${err.message}`));
  setTimeout(rodar, ATRASO_INICIAL_MS).unref();
  setInterval(rodar, INTERVALO_MS).unref();
}

module.exports = { executar, silenciarPassados, iniciar };
