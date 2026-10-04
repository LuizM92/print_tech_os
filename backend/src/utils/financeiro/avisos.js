/**
 * Aviso diário de vencimentos, no sino e por push.
 *
 * De manhã (a partir das 08:00 de Brasília) o sistema olha o que venceu e o que vence
 * hoje e avisa uma vez por dia — "3 cobranças vencem hoje (R$ …) · 2 vencidas". Não
 * manda nada quando não há o que avisar.
 *
 * ── Uma vez por dia, mesmo reiniciando ──
 * O app reinicia a cada deploy. A trava é uma linha em `financeiro_avisos`: o INSERT
 * IGNORE decide, sem corrida, quem avisa. Ela só é gravada quando há o que avisar, então
 * uma conta lançada depois das 08:00 ainda pode disparar o aviso do dia.
 *
 * ── Quem recebe ──
 * Cobranças (a receber) vão para todos, como o resto do sistema. Contas a pagar são do
 * administrador: o aviso nasce `somente_admin` e o push só vai para aparelhos de admin.
 */
const db = require('../db');
const notificacoes = require('../notificacoes');
const alertas = require('../alertas');
const banco = require('./banco');
const { hojeBR, horaBR } = require('./datas');
const { moeda } = require('./dinheiro');

const HORA_DO_AVISO = 8;
const INTERVALO_MS = 30 * 60 * 1000;
const ATRASO_INICIAL_MS = 30 * 1000;

const plural = (n, singular, pluralizado) => `${n} ${n === 1 ? singular : pluralizado}`;

/**
 * O texto do aviso de um lado, ou null se não há nada vencido nem vencendo hoje.
 * Função pura: recebe o resumo de `banco.resumoDaNatureza`.
 */
const montarAviso = (natureza, resumo) => {
  const { vencido, vence_hoje: hoje, proximos_7_dias: semana } = resumo;
  if (vencido.qtd === 0 && hoje.qtd === 0) return null;

  const recebendo = natureza === 'receber';
  const partes = [];
  if (hoje.qtd > 0) {
    partes.push(`${plural(hoje.qtd, 'vence', 'vencem')} hoje (${moeda(hoje.valor)})`);
  }
  if (vencido.qtd > 0) {
    partes.push(`${plural(vencido.qtd, 'vencida', 'vencidas')} (${moeda(vencido.valor)})`);
  }
  // Para quem paga, a semana à frente ajuda a separar o caixa; para quem cobra, não muda a manhã.
  if (!recebendo && semana.qtd > 0) {
    partes.push(`${semana.qtd} nos próximos 7 dias (${moeda(semana.valor)})`);
  }

  return {
    tipo: 'financeiro',
    titulo: recebendo ? 'Cobranças para acompanhar' : 'Contas a pagar para acompanhar',
    corpo: partes.join(' · '),
    tag: `financeiro-${natureza}`,
    url: recebendo ? '/receber' : '/pagar',
  };
};

const LADOS = [
  { natureza: 'receber', somenteAdmin: false },
  { natureza: 'pagar', somenteAdmin: true },
];

/**
 * Faz uma rodada: para cada lado com o que avisar e ainda sem aviso hoje, grava a trava
 * e dispara. Devolve quantos avisos saíram (os testes e o log usam).
 */
async function executar(agora = new Date()) {
  if (horaBR(agora) < HORA_DO_AVISO) return 0;
  const hoje = hojeBR(agora);
  let enviados = 0;

  for (const { natureza, somenteAdmin } of LADOS) {
    const aviso = montarAviso(natureza, await banco.resumoDaNatureza(db, natureza, hoje));
    if (!aviso) continue;

    const [r] = await db.query(
      'INSERT IGNORE INTO financeiro_avisos (dia, tipo) VALUES (?, ?)', [hoje, natureza]
    );
    if (r.affectedRows === 0) continue; // outro processo (ou outra rodada) já avisou hoje

    await notificacoes.registrar(aviso, { somenteAdmin });
    alertas.enviar(aviso, { apenasAdmin: somenteAdmin })
      .catch((err) => console.error(`[financeiro] push: ${err.message}`));
    enviados += 1;
  }
  return enviados;
}

/** Liga o relógio. Falha numa rodada não derruba o servidor nem cancela as próximas. */
function iniciar() {
  const rodar = () => executar().catch((err) => console.error(`[financeiro] aviso: ${err.message}`));
  setTimeout(rodar, ATRASO_INICIAL_MS).unref();
  setInterval(rodar, INTERVALO_MS).unref();
}

module.exports = { montarAviso, executar, iniciar };
