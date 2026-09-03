const db = require('../utils/db');
const { registrarHistorico } = require('../utils/documentos');
const { ETAPAS, ehEtapaValida, detalheMovimento, rotuloEtapa } = require('../utils/producao');

// A coluna "Entregue" só mostra o que saiu há pouco tempo — senão ela cresce para
// sempre e engole o quadro. O resto continua no histórico e na listagem de orçamentos.
const DIAS_ENTREGUE_PADRAO = 15;

const etapas = (req, res) => res.json(ETAPAS);

/**
 * O quadro: toda OS aprovada, com o que a oficina precisa ver no cartão — cliente,
 * volume de trabalho (peças, horas, gramas), previsão e há quantos dias está parada.
 */
const quadro = async (req, res) => {
  try {
    const dias = Math.min(Math.max(parseInt(req.query.dias_entregue, 10) || DIAS_ENTREGUE_PADRAO, 1), 180);
    const where = ["o.tipo = 'impressao'", "o.status = 'aprovado'"];
    const params = [];

    // Entregue some depois de N dias; as outras etapas mostram tudo.
    where.push("(o.etapa_producao <> 'entregue' OR o.etapa_alterada_em >= DATE_SUB(NOW(), INTERVAL ? DAY))");
    params.push(dias);

    if (req.query.busca) {
      where.push('(c.nome LIKE ? OR o.numero_os LIKE ? OR o.numero_orcamento LIKE ?)');
      const termo = `%${req.query.busca}%`;
      params.push(termo, termo, termo);
    }

    const [ordens] = await db.query(
      `SELECT o.id, o.numero_os, o.numero_orcamento, o.etapa_producao, o.etapa_alterada_em,
              o.previsao_entrega, o.total_geral, o.aprovado_em, o.observacao,
              c.nome AS cliente_nome,
              TIMESTAMPDIFF(DAY, o.etapa_alterada_em, NOW()) AS dias_na_etapa,
              COALESCE(SUM(i.quantidade), 0) AS pecas,
              COALESCE(SUM(i.horas_impressao * i.quantidade), 0) AS horas,
              COALESCE(SUM(i.peso_gramas * i.quantidade), 0) AS gramas
         FROM orcamentos o
         JOIN clientes c ON o.cliente_id = c.id
         LEFT JOIN orcamento_itens i ON i.orcamento_id = o.id
        WHERE ${where.join(' AND ')}
        GROUP BY o.id
        ORDER BY o.previsao_entrega IS NULL, o.previsao_entrega, o.aprovado_em`,
      params
    );

    // Vem agrupado pronto para o quadro: cada etapa com suas OS e seus totais.
    const colunas = ETAPAS.map((etapa) => {
      const ordensDaEtapa = ordens.filter((o) => o.etapa_producao === etapa.codigo);
      return {
        ...etapa,
        ordens: ordensDaEtapa,
        total: ordensDaEtapa.reduce((soma, o) => soma + parseFloat(o.total_geral), 0),
        horas: ordensDaEtapa.reduce((soma, o) => soma + parseFloat(o.horas), 0),
      };
    });

    res.json({ colunas, dias_entregue: dias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

/** Move a OS de etapa e/ou ajusta a previsão de entrega. */
const mover = async (req, res) => {
  const { etapa, previsao_entrega: previsao } = req.body;

  if (etapa !== undefined && !ehEtapaValida(etapa)) {
    return res.status(400).json({ erro: 'Etapa inválida' });
  }
  if (etapa === undefined && previsao === undefined) {
    return res.status(400).json({ erro: 'Informe a etapa ou a previsão de entrega' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[ordem]] = await conn.query(
      `SELECT id, tipo, status, numero_os, etapa_producao, total_geral
         FROM orcamentos WHERE id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!ordem) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Ordem de serviço não encontrada' });
    }
    if (ordem.tipo !== 'impressao' || ordem.status !== 'aprovado') {
      await conn.rollback();
      return res.status(400).json({ erro: 'Só OS aprovadas entram na fila de produção' });
    }

    const mudouEtapa = etapa !== undefined && etapa !== ordem.etapa_producao;

    if (mudouEtapa) {
      await conn.query(
        'UPDATE orcamentos SET etapa_producao = ?, etapa_alterada_em = NOW() WHERE id = ?',
        [etapa, ordem.id]
      );
      await registrarHistorico(conn, {
        orcamento_id: ordem.id,
        usuario_id: req.usuario.id,
        acao: `produção: ${etapa}`,
        detalhe: detalheMovimento(ordem.etapa_producao, etapa),
        total_anterior: ordem.total_geral,
        total_novo: ordem.total_geral,
      });
    }

    if (previsao !== undefined) {
      const data = previsao === null || previsao === '' ? null : String(previsao).slice(0, 10);
      if (data !== null && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
        await conn.rollback();
        return res.status(400).json({ erro: 'Previsão de entrega inválida' });
      }
      await conn.query('UPDATE orcamentos SET previsao_entrega = ? WHERE id = ?', [data, ordem.id]);
    }

    await conn.commit();
    res.json({
      mensagem: mudouEtapa
        ? `${ordem.numero_os} — ${rotuloEtapa(etapa)}`
        : 'Previsão de entrega atualizada',
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

module.exports = { etapas, quadro, mover };
