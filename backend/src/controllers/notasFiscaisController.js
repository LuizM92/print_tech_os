/**
 * Nota fiscal emitida fora do sistema.
 *
 * Aqui a NF é registro, não emissão: o número vem da plataforma onde ela foi emitida e
 * o PDF é anexado para ficar junto do orçamento que o originou. Uma NF por orçamento —
 * reenviar substitui o que estava lá.
 *
 * O arquivo é gravado no banco de propósito. O container da aplicação não tem volume,
 * então um arquivo em disco sumiria no próximo deploy; no MySQL ele entra no mesmo
 * backup do resto.
 */
const db = require('../utils/db');
const { registrarHistorico } = require('../utils/documentos');

const TIPOS_ACEITOS = ['application/pdf', 'image/png', 'image/jpeg'];

const texto = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

/** Data em AAAA-MM-DD, ou null. Recusa qualquer outro formato em vez de adivinhar. */
const apenasData = (v) => {
  const t = texto(v);
  if (t === null) return null;
  const d = t.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined;
};

const salvar = async (req, res) => {
  const numero = texto(req.body.numero);
  if (!numero) return res.status(400).json({ erro: 'Informe o número da nota fiscal' });

  const emitidaEm = apenasData(req.body.emitida_em);
  if (emitidaEm === undefined) return res.status(400).json({ erro: 'Data de emissão inválida' });

  if (req.file && !TIPOS_ACEITOS.includes(req.file.mimetype)) {
    return res.status(400).json({ erro: 'O anexo da NF deve ser PDF, PNG ou JPEG' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[orcamento]] = await conn.query(
      'SELECT id, numero_orcamento, total_geral FROM orcamentos WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    if (!orcamento) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Orçamento não encontrado' });
    }

    const [[existente]] = await conn.query(
      'SELECT id FROM notas_fiscais WHERE orcamento_id = ?', [orcamento.id]
    );

    // Sem arquivo novo o anexo que já estava lá continua — dá para corrigir só o
    // número sem precisar reenviar o PDF.
    const campos = { numero, criado_por: req.usuario.id };
    // Campo que não veio no envio fica como estava; campo que veio vazio limpa.
    if ('emitida_em' in req.body) campos.emitida_em = emitidaEm;
    if ('observacao' in req.body) campos.observacao = texto(req.body.observacao);
    if (req.file) {
      campos.arquivo_nome = req.file.originalname;
      campos.arquivo_tipo = req.file.mimetype;
      campos.arquivo_tamanho = req.file.size;
      campos.arquivo = req.file.buffer;
    }

    if (existente) {
      const colunas = Object.keys(campos);
      await conn.query(
        `UPDATE notas_fiscais SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...colunas.map((c) => campos[c]), existente.id]
      );
    } else {
      const colunas = ['orcamento_id', ...Object.keys(campos)];
      await conn.query(
        `INSERT INTO notas_fiscais (${colunas.join(', ')})
         VALUES (${colunas.map(() => '?').join(', ')})`,
        [orcamento.id, ...Object.keys(campos).map((c) => campos[c])]
      );
    }

    await registrarHistorico(conn, {
      orcamento_id: orcamento.id,
      usuario_id: req.usuario.id,
      acao: existente ? 'nota fiscal atualizada' : 'nota fiscal registrada',
      detalhe: `NF ${numero}${req.file ? ' (com anexo)' : ''}`,
      total_anterior: orcamento.total_geral,
      total_novo: orcamento.total_geral,
    });

    await conn.commit();
    res.json({
      mensagem: existente ? 'Nota fiscal atualizada' : 'Nota fiscal registrada',
      numero,
    });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

/** Devolve o anexo para download. É a única consulta que lê a coluna do arquivo. */
const baixarArquivo = async (req, res) => {
  try {
    const [[nota]] = await db.query(
      `SELECT arquivo, arquivo_nome, arquivo_tipo
         FROM notas_fiscais WHERE orcamento_id = ?`,
      [req.params.id]
    );
    if (!nota || !nota.arquivo) {
      return res.status(404).json({ erro: 'Esta nota fiscal não tem anexo' });
    }

    res.setHeader('Content-Type', nota.arquivo_tipo || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${nota.arquivo_nome || 'nota-fiscal'}"`);
    res.send(nota.arquivo);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao baixar o anexo da nota fiscal' });
  }
};

/** Remove só o anexo, mantendo número e data — o arquivo pode ter subido errado. */
const removerArquivo = async (req, res) => {
  try {
    const [resultado] = await db.query(
      `UPDATE notas_fiscais
          SET arquivo = NULL, arquivo_nome = NULL, arquivo_tipo = NULL, arquivo_tamanho = NULL
        WHERE orcamento_id = ?`,
      [req.params.id]
    );
    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Nota fiscal não encontrada' });
    }
    res.json({ mensagem: 'Anexo removido' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[nota]] = await conn.query(
      'SELECT id, numero FROM notas_fiscais WHERE orcamento_id = ?', [req.params.id]
    );
    if (!nota) {
      await conn.rollback();
      return res.status(404).json({ erro: 'Nota fiscal não encontrada' });
    }

    await conn.query('DELETE FROM notas_fiscais WHERE id = ?', [nota.id]);
    await registrarHistorico(conn, {
      orcamento_id: parseInt(req.params.id, 10),
      usuario_id: req.usuario.id,
      acao: 'nota fiscal removida',
      detalhe: `NF ${nota.numero}`,
    });

    await conn.commit();
    res.json({ mensagem: 'Nota fiscal removida' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

module.exports = { salvar, baixarArquivo, removerArquivo, excluir };
