const db = require('../utils/db');
const PDFDocument = require('pdfkit');
const { buscarPorChave } = require('./configuracoesController');

const gerarNumeroOS = () => {
  const now = new Date();
  const ano = now.getFullYear();
  const mes = String(now.getMonth() + 1).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `OS-${ano}${mes}-${rand}`;
};

const listar = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.*, c.nome as cliente_nome, m.nome as material_nome, u.nome as criado_por_nome
      FROM orcamentos o
      JOIN clientes c ON o.cliente_id = c.id
      JOIN materiais m ON o.material_id = m.id
      JOIN usuarios u ON o.criado_por = u.id
      ORDER BY o.criado_em DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const buscarPorId = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.*,
             c.nome as cliente_nome, c.rua, c.numero, c.complemento, c.bairro,
             c.cidade, c.estado, c.cep, c.cpf_cnpj, c.tipo_documento,
             m.nome as material_nome,
             u.nome as criado_por_nome
      FROM orcamentos o
      JOIN clientes c ON o.cliente_id = c.id
      JOIN materiais m ON o.material_id = m.id
      JOIN usuarios u ON o.criado_por = u.id
      WHERE o.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ erro: 'Orçamento não encontrado' });

    const [servicos] = await db.query(`
      SELECT os.*, s.nome as servico_nome
      FROM orcamento_servicos os
      JOIN servicos s ON os.servico_id = s.id
      WHERE os.orcamento_id = ?
    `, [req.params.id]);

    res.json({ ...rows[0], servicos });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const {
    cliente_id, material_id, tipo_peca, observacao,
    peso_gramas, horas_impressao, quantidade, servicos
  } = req.body;

  if (!cliente_id || !material_id || !tipo_peca || !quantidade || !peso_gramas || !horas_impressao) {
    return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Busca custo do material
    const [matRows] = await conn.query('SELECT custo_por_grama FROM materiais WHERE id = ?', [material_id]);
    if (matRows.length === 0) return res.status(404).json({ erro: 'Material não encontrado' });

    // Busca valor hora-máquina das configurações
    const valorHoraMaquinaStr = await buscarPorChave('valor_hora_maquina');
    const valorHoraMaquina = parseFloat(valorHoraMaquinaStr || 7.00);

    const custoPorGrama = parseFloat(matRows[0].custo_por_grama);
    const gramas = parseFloat(peso_gramas);
    const horas = parseFloat(horas_impressao);
    const qtd = parseInt(quantidade);

    // FÓRMULA: Preço = (Peso em gramas × custo/grama) + (Horas impressão × valor hora-máquina)
    const custoMaterial = gramas * custoPorGrama;
    const custoImpressao = horas * valorHoraMaquina;
    const valorPorPeca = custoMaterial + custoImpressao;
    const totalPeca = valorPorPeca * qtd;

    // Calcula total serviços CAD
    let totalServico = 0;
    const servicosProcessados = [];

    if (servicos && servicos.length > 0) {
      for (const s of servicos) {
        const [sRows] = await conn.query('SELECT valor_hora FROM servicos WHERE id = ?', [s.servico_id]);
        if (sRows.length === 0) continue;
        const valorHora = parseFloat(sRows[0].valor_hora);
        const horasServ = parseFloat(s.quantidade_horas);
        const total = valorHora * horasServ;
        totalServico += total;
        servicosProcessados.push({ servico_id: s.servico_id, quantidade_horas: horasServ, valor_hora: valorHora, total });
      }
    }

    const totalGeral = totalPeca + totalServico;

    // Gera número OS único
    let numeroOS;
    let tentativas = 0;
    do {
      numeroOS = gerarNumeroOS();
      const [check] = await conn.query('SELECT id FROM orcamentos WHERE numero_os = ?', [numeroOS]);
      if (check.length === 0) break;
      tentativas++;
    } while (tentativas < 5);

    const [result] = await conn.query(
      `INSERT INTO orcamentos
        (numero_os, cliente_id, material_id, tipo_peca, observacao,
         peso_gramas, horas_impressao, valor_hora_maquina, custo_por_grama,
         quantidade, custo_material, custo_impressao, valor_por_peca,
         total_peca, total_servico, total_geral, criado_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [numeroOS, cliente_id, material_id, tipo_peca, observacao || null,
       gramas, horas, valorHoraMaquina, custoPorGrama,
       qtd, custoMaterial, custoImpressao, valorPorPeca,
       totalPeca, totalServico, totalGeral, req.usuario.id]
    );

    const orcamentoId = result.insertId;

    for (const s of servicosProcessados) {
      await conn.query(
        'INSERT INTO orcamento_servicos (orcamento_id, servico_id, quantidade_horas, valor_hora, total) VALUES (?, ?, ?, ?, ?)',
        [orcamentoId, s.servico_id, s.quantidade_horas, s.valor_hora, s.total]
      );
    }

    await conn.commit();
    res.status(201).json({ id: orcamentoId, numero_os: numeroOS, mensagem: 'Orçamento criado com sucesso' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  } finally {
    conn.release();
  }
};

const atualizar = async (req, res) => {
  const { status } = req.body;
  try {
    await db.query('UPDATE orcamentos SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ mensagem: 'Orçamento atualizado' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const gerarPDF = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT o.*,
             c.nome as cliente_nome, c.rua, c.numero, c.complemento,
             c.bairro, c.cidade, c.estado, c.cep, c.cpf_cnpj, c.tipo_documento,
             m.nome as material_nome,
             u.nome as criado_por_nome
      FROM orcamentos o
      JOIN clientes c ON o.cliente_id = c.id
      JOIN materiais m ON o.material_id = m.id
      JOIN usuarios u ON o.criado_por = u.id
      WHERE o.id = ?
    `, [req.params.id]);

    if (rows.length === 0) return res.status(404).json({ erro: 'Orçamento não encontrado' });

    const [servicos] = await db.query(`
      SELECT os.*, s.nome as servico_nome
      FROM orcamento_servicos os
      JOIN servicos s ON os.servico_id = s.id
      WHERE os.orcamento_id = ?
    `, [req.params.id]);

    const orc = rows[0];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="OS-${orc.numero_os}.pdf"`);
    doc.pipe(res);

    const fmtMoeda = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
    const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR');

    // ── Header ──────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 100).fill('#1a1a2e');
    doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('PRINT TECH 3D', 50, 22);
    doc.fontSize(10).font('Helvetica').fillColor('#aaaacc').text('Impressão 3D & Prototipagem', 50, 48);
    doc.fillColor('#6c63ff').fontSize(13).font('Helvetica-Bold').text('ORDEM DE SERVIÇO', 50, 66);

    doc.fillColor('#aaaacc').fontSize(10).font('Helvetica')
      .text(orc.numero_os, 350, 35, { align: 'right', width: 200 });
    doc.text(`Data: ${fmtData(orc.criado_em)}`, 350, 52, { align: 'right', width: 200 });
    doc.fillColor('#16db93').text(`Status: ${orc.status.toUpperCase()}`, 350, 69, { align: 'right', width: 200 });

    // ── Cliente ──────────────────────────────────────────────
    let y = 118;
    doc.fillColor('#6c63ff').fontSize(11).font('Helvetica-Bold').text('CLIENTE', 50, y);
    doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke('#2a2a40');
    y += 22;

    doc.font('Helvetica').fontSize(10).fillColor('#333333');
    doc.fillColor('#111').font('Helvetica-Bold').text(orc.cliente_nome, 50, y);
    y += 14;
    doc.font('Helvetica').fillColor('#555')
      .text(`${orc.tipo_documento?.toUpperCase()}: ${orc.cpf_cnpj}`, 50, y); y += 14;
    doc.text(`${orc.rua}, ${orc.numero}${orc.complemento ? ' - ' + orc.complemento : ''}`, 50, y); y += 14;
    doc.text(`${orc.bairro} — ${orc.cidade}/${orc.estado}  |  CEP: ${orc.cep}`, 50, y); y += 24;

    // ── Detalhes da Peça ─────────────────────────────────────
    doc.fillColor('#6c63ff').fontSize(11).font('Helvetica-Bold').text('DETALHES DA PEÇA', 50, y);
    doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke('#2a2a40');
    y += 22;

    const detalhes = [
      ['Material', orc.material_nome],
      ['Tipo de Peça', orc.tipo_peca === 'tecnica' ? 'Peça Técnica' : 'Decorativa'],
      ['Peso da Peça', `${parseFloat(orc.peso_gramas).toFixed(2)} g`],
      ['Custo/grama do Material', fmtMoeda(orc.custo_por_grama)],
      ['Horas de Impressão', `${parseFloat(orc.horas_impressao).toFixed(2)} h`],
      ['Valor Hora-Máquina', fmtMoeda(orc.valor_hora_maquina)],
      ['Quantidade', String(orc.quantidade)],
    ];

    detalhes.forEach(([label, valor], i) => {
      if (i % 2 === 0) doc.rect(50, y, 495, 18).fill('#f5f5fb');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(label + ':', 55, y + 4);
      doc.font('Helvetica').fillColor('#222').text(String(valor), 230, y + 4);
      y += 18;
    });

    y += 10;

    // ── Cálculo ──────────────────────────────────────────────
    doc.fillColor('#6c63ff').fontSize(11).font('Helvetica-Bold').text('CÁLCULO', 50, y);
    doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke('#2a2a40');
    y += 22;

    const calcs = [
      ['Custo Material', `${parseFloat(orc.peso_gramas).toFixed(2)}g × ${fmtMoeda(orc.custo_por_grama)}/g`, fmtMoeda(orc.custo_material)],
      ['Custo Impressão', `${parseFloat(orc.horas_impressao).toFixed(2)}h × ${fmtMoeda(orc.valor_hora_maquina)}/h`, fmtMoeda(orc.custo_impressao)],
      ['Valor por Peça', 'Custo Material + Custo Impressão', fmtMoeda(orc.valor_por_peca)],
      ['Total Peças', `${fmtMoeda(orc.valor_por_peca)} × ${orc.quantidade} un`, fmtMoeda(orc.total_peca)],
    ];

    calcs.forEach(([label, formula, valor], i) => {
      if (i % 2 === 0) doc.rect(50, y, 495, 18).fill('#f5f5fb');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#555').text(label + ':', 55, y + 4);
      doc.font('Helvetica').fillColor('#888').text(formula, 180, y + 4);
      doc.font('Helvetica-Bold').fillColor('#1a1a2e').text(valor, 430, y + 4, { align: 'right', width: 110 });
      y += 18;
    });

    y += 10;

    // ── Serviços CAD ─────────────────────────────────────────
    if (servicos.length > 0) {
      doc.fillColor('#6c63ff').fontSize(11).font('Helvetica-Bold').text('SERVIÇOS', 50, y);
      doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke('#2a2a40');
      y += 22;

      doc.rect(50, y, 495, 18).fill('#1a1a2e');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
      doc.text('Serviço', 55, y + 4);
      doc.text('Horas', 300, y + 4);
      doc.text('Valor/h', 370, y + 4);
      doc.text('Total', 455, y + 4);
      y += 18;

      servicos.forEach((s, i) => {
        if (i % 2 === 0) doc.rect(50, y, 495, 18).fill('#f5f5fb');
        doc.font('Helvetica').fontSize(9).fillColor('#333');
        doc.text(s.servico_nome, 55, y + 4);
        doc.text(`${s.quantidade_horas}h`, 300, y + 4);
        doc.text(fmtMoeda(s.valor_hora), 370, y + 4);
        doc.font('Helvetica-Bold').fillColor('#6c63ff').text(fmtMoeda(s.total), 455, y + 4);
        y += 18;
      });
      y += 8;
    }

    // ── Observações ──────────────────────────────────────────
    if (orc.observacao) {
      y += 8;
      doc.fillColor('#6c63ff').fontSize(11).font('Helvetica-Bold').text('OBSERVAÇÕES', 50, y);
      doc.moveTo(50, y + 14).lineTo(545, y + 14).stroke('#2a2a40');
      y += 22;
      doc.font('Helvetica').fontSize(10).fillColor('#555').text(orc.observacao, 50, y, { width: 495 });
      y = doc.y + 16;
    }

    // ── Totais ───────────────────────────────────────────────
    y += 10;
    doc.rect(340, y, 205, 78).fill('#1a1a2e');

    doc.font('Helvetica').fontSize(9).fillColor('#aaa').text('Total Peças:', 350, y + 10);
    //doc.fillColor('#fff').font('Helvetica-Bold').text(fmtMoeda(orc.total_peca), 530, y + 10, { align: 'right', width: 1 });
    //doc.font('Helvetica').fillColor('#aaa').text(fmtMoeda(orc.total_peca), 460, y + 10);

    doc.font('Helvetica').fontSize(9).fillColor('#aaa').text('Total Serviços:', 350, y + 28);
    doc.fillColor('#fff');
    doc.font('Helvetica').text(fmtMoeda(orc.total_servico), 460, y + 28);

    doc.moveTo(352, y + 46).lineTo(537, y + 46).stroke('#333355');

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#16db93').text('TOTAL GERAL:', 350, y + 54);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#16db93').text(fmtMoeda(orc.total_geral), 460, y + 54);

    // ── Footer ───────────────────────────────────────────────
    doc.fontSize(8).font('Helvetica').fillColor('#aaa')
      .text(
        `Emitido por: ${orc.criado_por_nome}  |  Print Tech — Impressão 3D & Prototipagem`,
        50, doc.page.height - 35,
        { align: 'center', width: 495 }
      );

    doc.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro ao gerar PDF' });
  }
};

module.exports = { listar, buscarPorId, criar, atualizar, gerarPDF };
