/**
 * Arquivos de modelo enviados pelo cliente.
 *
 * Quando o cliente já tem as peças prontas, os arquivos dele ficam anexados ao
 * orçamento — vários por orçamento, ao contrário da nota fiscal, que é uma só.
 * O que é aceito e por quê está em utils/arquivos3d.js.
 *
 * O blob só é lido no download. Nem a listagem do orçamento nem a tela de detalhe
 * chegam perto da coluna do arquivo.
 */
const db = require('../utils/db');
const { registrarHistorico } = require('../utils/documentos');
const { extensaoDe, nomeParaCabecalho } = require('../utils/arquivos3d');

/** Os campos que as telas usam — tudo menos o blob. */
const COLUNAS_LISTA = `a.id, a.nome, a.extensao, a.tamanho, a.criado_em,
                       u.nome AS criado_por_nome`;

/** Lista de um orçamento, sem o conteúdo dos arquivos. Usada também pelo detalhe. */
const listarDoOrcamento = async (executor, orcamentoId) => {
  const [arquivos] = await executor.query(
    `SELECT ${COLUNAS_LISTA}
       FROM orcamento_arquivos a
       LEFT JOIN usuarios u ON a.criado_por = u.id
      WHERE a.orcamento_id = ?
      ORDER BY a.criado_em, a.id`,
    [orcamentoId]
  );
  return arquivos;
};

const enviar = async (req, res) => {
  const enviados = req.files || [];
  if (enviados.length === 0) return res.status(400).json({ erro: 'Nenhum arquivo enviado' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[orcamento]] = await conn.query(
      'SELECT id FROM orcamentos WHERE id = ?', [req.params.id]
    );
    if (!orcamento) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }

    for (const arquivo of enviados) {
      await conn.query(
        `INSERT INTO orcamento_arquivos
           (orcamento_id, nome, extensao, tamanho, arquivo, criado_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orcamento.id, arquivo.originalname, extensaoDe(arquivo.originalname),
          arquivo.size, arquivo.buffer, req.usuario.id]
      );
    }

    // Uma linha no histórico por envio, não por arquivo: quem mandou seis STL de uma
    // vez fez um movimento só.
    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: enviados.length > 1 ? 'arquivos anexados' : 'arquivo anexado',
      detalhe: enviados.map((a) => a.originalname).join(', ').slice(0, 255),
    });

    await conn.commit();
    res.json({
      mensagem: enviados.length > 1
        ? `${enviados.length} arquivos anexados`
        : 'Arquivo anexado',
      arquivos: await listarDoOrcamento(db, orcamento.id),
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro ao anexar os arquivos' });
  } finally {
    conn.release();
  }
};

/** Única consulta que lê a coluna do arquivo. */
const baixar = async (req, res) => {
  try {
    // O orçamento entra no WHERE junto do id: assim ninguém baixa o anexo de outro
    // orçamento trocando o número na URL.
    const [[arquivo]] = await db.query(
      `SELECT nome, arquivo FROM orcamento_arquivos WHERE id = ? AND orcamento_id = ?`,
      [req.params.arquivoId, req.params.id]
    );
    if (!arquivo) return res.status(404).json({ erro: 'Arquivo não encontrado' });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${nomeParaCabecalho(arquivo.nome)}"`
    );
    res.send(arquivo.arquivo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar o arquivo' });
  }
};

const excluir = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[arquivo]] = await conn.query(
      'SELECT id, nome FROM orcamento_arquivos WHERE id = ? AND orcamento_id = ?',
      [req.params.arquivoId, req.params.id]
    );
    if (!arquivo) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Arquivo não encontrado' });
    }

    await conn.query('DELETE FROM orcamento_arquivos WHERE id = ?', [arquivo.id]);
    await registrarHistorico(conn, {
      orcamento_id: parseInt(req.params.id, 10),
      usuario_id: req.usuario.id,
      acao: 'arquivo removido',
      detalhe: arquivo.nome,
    });

    await conn.commit();
    res.json({ mensagem: 'Arquivo removido' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

module.exports = { listarDoOrcamento, enviar, baixar, excluir };
