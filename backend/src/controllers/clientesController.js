const db = require('../utils/db');
const { consultarCnpj } = require('../utils/consultaCnpj');
const { extrairTexto, interpretarFicha } = require('../utils/leitorFicha');

const TIPOS_DOCUMENTO = ['cpf', 'cnpj'];
const REGIMES = ['simples', 'presumido', 'real', 'mei'];
const TIPOS_CONTA = ['corrente', 'poupanca', 'pagamento'];
const TIPOS_PIX = ['cpf_cnpj', 'email', 'telefone', 'aleatoria'];

// Campos gravados no banco, na ordem em que entram no INSERT/UPDATE.
const CAMPOS = [
  'nome', 'cpf_cnpj', 'tipo_documento', 'rua', 'numero', 'complemento', 'bairro',
  'cidade', 'estado', 'cep', 'markup',
  // fiscal
  'nome_fantasia', 'inscricao_estadual', 'ie_isento', 'inscricao_municipal',
  'regime_tributario', 'cnae', 'situacao_cadastral',
  // contato
  'contato_nome', 'contato_cargo', 'telefone', 'celular', 'email',
  // bancário
  'banco', 'agencia', 'conta', 'tipo_conta', 'pix_tipo', 'pix_chave',
  // comercial
  'condicao_pagamento', 'limite_credito', 'observacoes',
];

const texto = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

const enumOu = (v, validos) => (validos.includes(v) ? v : null);

const numeroOu = (v, padrao = null) => {
  if (v === undefined || v === null || String(v).trim() === '') return padrao;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : padrao;
};

const normalizar = (corpo) => {
  const ehCnpj = corpo.tipo_documento === 'cnpj';

  // Campos exclusivos de PJ são descartados quando o cliente é pessoa física —
  // evita deixar lixo gravado se alguém trocar o tipo depois de preencher.
  const soPj = (valor) => (ehCnpj ? valor : null);

  return {
    nome: texto(corpo.nome),
    cpf_cnpj: texto(corpo.cpf_cnpj),
    tipo_documento: enumOu(corpo.tipo_documento, TIPOS_DOCUMENTO) || 'cpf',
    rua: texto(corpo.rua),
    numero: texto(corpo.numero),
    complemento: texto(corpo.complemento),
    bairro: texto(corpo.bairro),
    cidade: texto(corpo.cidade),
    estado: texto(corpo.estado),
    cep: texto(corpo.cep),
    markup: numeroOu(corpo.markup, 0),

    nome_fantasia: soPj(texto(corpo.nome_fantasia)),
    inscricao_estadual: soPj(texto(corpo.inscricao_estadual)),
    ie_isento: ehCnpj && (corpo.ie_isento === true || corpo.ie_isento === 1 || corpo.ie_isento === '1') ? 1 : 0,
    inscricao_municipal: soPj(texto(corpo.inscricao_municipal)),
    regime_tributario: soPj(enumOu(corpo.regime_tributario, REGIMES)),
    cnae: soPj(texto(corpo.cnae)),
    situacao_cadastral: soPj(texto(corpo.situacao_cadastral)),

    contato_nome: texto(corpo.contato_nome),
    contato_cargo: texto(corpo.contato_cargo),
    telefone: texto(corpo.telefone),
    celular: texto(corpo.celular),
    email: texto(corpo.email),

    banco: texto(corpo.banco),
    agencia: texto(corpo.agencia),
    conta: texto(corpo.conta),
    tipo_conta: enumOu(corpo.tipo_conta, TIPOS_CONTA),
    pix_tipo: enumOu(corpo.pix_tipo, TIPOS_PIX),
    pix_chave: texto(corpo.pix_chave),

    condicao_pagamento: texto(corpo.condicao_pagamento),
    limite_credito: numeroOu(corpo.limite_credito),
    observacoes: texto(corpo.observacoes),
  };
};

const validar = (c) => {
  const obrigatorios = { nome: 'Nome', cpf_cnpj: 'CPF/CNPJ', rua: 'Rua', numero: 'Número',
    bairro: 'Bairro', cidade: 'Cidade', estado: 'Estado', cep: 'CEP' };
  for (const [campo, rotulo] of Object.entries(obrigatorios)) {
    if (!c[campo]) return `${rotulo} é obrigatório`;
  }
  // Uma empresa ou tem IE, ou é declaradamente isenta — deixar em branco vira
  // problema na hora de faturar.
  if (c.tipo_documento === 'cnpj' && !c.inscricao_estadual && !c.ie_isento) {
    return 'Informe a inscrição estadual ou marque "isento"';
  }
  if (c.limite_credito !== null && c.limite_credito < 0) return 'Limite de crédito não pode ser negativo';
  if (c.markup < 0) return 'Markup não pode ser negativo';
  return null;
};

// ─── Consulta de CNPJ ───────────────────────────────────────────────────────
/**
 * Busca os dados públicos do CNPJ para pré-preencher o formulário.
 * A chamada externa sai do servidor, não do navegador: evita CORS e mantém um
 * eventual token do provedor fora do frontend.
 */
const consultarPorCnpj = async (req, res) => {
  const resultado = await consultarCnpj(req.params.cnpj);

  if (resultado.erro) {
    return res.status(resultado.http || 400).json({ erro: resultado.erro });
  }

  res.json({
    dados: resultado.dados,
    fonte: resultado.fonte,
    tem_inscricao_estadual: resultado.tem_inscricao_estadual,
  });
};

// ─── Leitura de ficha cadastral em PDF ──────────────────────────────────────
/**
 * Lê a ficha que a empresa mandou e devolve os campos para pré-preencher o formulário.
 *
 * Quando a ficha traz um CNPJ válido, a Receita é consultada em seguida para **completar
 * o que a ficha deixou em branco** — a ficha tem prioridade, porque é o que a própria
 * empresa declarou (e é de onde vêm inscrição estadual, contato e banco, que a Receita
 * não fornece).
 *
 * O PDF é processado em memória e descartado: nada é gravado em disco nem enviado para
 * fora do servidor.
 */
const lerFicha = async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Envie o PDF da ficha cadastral' });

  try {
    const { texto, temTexto, paginas } = await extrairTexto(req.file.buffer);

    if (!temTexto) {
      return res.status(422).json({
        erro: 'Este PDF não tem texto — provavelmente é um documento escaneado ou '
            + 'fotografado. Peça a ficha em PDF digital, ou preencha à mão.',
      });
    }

    const { dados, encontrados } = interpretarFicha(texto);

    // Um documento qualquer pode dar um palpite solto — uma carta que termina em
    // "Departamento Técnico" vira um "cargo". Para valer como ficha, ou tem CNPJ
    // válido, ou tem vários campos reconhecidos. Melhor recusar do que pré-preencher
    // o cadastro com lixo que passaria despercebido.
    const CAMPOS_MINIMOS = 3;
    if (!dados.cpf_cnpj && encontrados.length < CAMPOS_MINIMOS) {
      return res.status(422).json({
        erro: 'Não reconheci os dados de uma ficha cadastral neste PDF. Confira se é o '
            + 'arquivo certo, ou preencha à mão.',
      });
    }

    // Marca a origem de cada campo, para a tela poder mostrar de onde veio o quê.
    const fontes = Object.fromEntries(encontrados.map((c) => [c, 'ficha']));
    let complementoReceita = null;

    if (dados.cpf_cnpj) {
      const consulta = await consultarCnpj(dados.cpf_cnpj);
      if (!consulta.erro) {
        complementoReceita = consulta.fonte;
        for (const [campo, valor] of Object.entries(consulta.dados)) {
          if (valor === null || valor === undefined) continue;
          if (dados[campo]) continue; // a ficha manda
          dados[campo] = valor;
          fontes[campo] = 'receita';
        }
      }
    }

    res.json({
      dados,
      fontes,
      paginas,
      da_ficha: Object.values(fontes).filter((f) => f === 'ficha').length,
      da_receita: Object.values(fontes).filter((f) => f === 'receita').length,
      complemento_receita: complementoReceita,
    });
  } catch (err) {
    console.error('Falha ao ler ficha:', err.message);
    res.status(422).json({ erro: 'Não consegui ler este arquivo. Ele é um PDF válido?' });
  }
};

// ─── CRUD ───────────────────────────────────────────────────────────────────
const listar = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes WHERE ativo = 1 ORDER BY nome');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const buscarPorId = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const criar = async (req, res) => {
  const cliente = normalizar(req.body);
  const erro = validar(cliente);
  if (erro) return res.status(400).json({ erro });

  try {
    const [existe] = await db.query('SELECT id FROM clientes WHERE cpf_cnpj = ?', [cliente.cpf_cnpj]);
    if (existe.length > 0) return res.status(400).json({ erro: 'CPF/CNPJ já cadastrado' });

    const [result] = await db.query(
      `INSERT INTO clientes (${CAMPOS.join(', ')}) VALUES (${CAMPOS.map(() => '?').join(', ')})`,
      CAMPOS.map((c) => cliente[c])
    );
    res.status(201).json({ id: result.insertId, mensagem: 'Cliente cadastrado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const cliente = normalizar(req.body);
  const erro = validar(cliente);
  if (erro) return res.status(400).json({ erro });

  try {
    const [existe] = await db.query('SELECT id FROM clientes WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });

    const [duplicado] = await db.query(
      'SELECT id FROM clientes WHERE cpf_cnpj = ? AND id <> ?', [cliente.cpf_cnpj, req.params.id]
    );
    if (duplicado.length > 0) return res.status(400).json({ erro: 'CPF/CNPJ já cadastrado em outro cliente' });

    await db.query(
      `UPDATE clientes SET ${CAMPOS.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...CAMPOS.map((c) => cliente[c]), req.params.id]
    );
    res.json({ mensagem: 'Cliente atualizado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  try {
    const [existe] = await db.query('SELECT id FROM clientes WHERE id = ?', [req.params.id]);
    if (existe.length === 0) return res.status(404).json({ erro: 'Cliente não encontrado' });

    // Soft delete: orçamentos antigos continuam apontando para o cliente.
    await db.query('UPDATE clientes SET ativo = 0 WHERE id = ?', [req.params.id]);
    res.json({ mensagem: 'Cliente excluído com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

module.exports = { listar, buscarPorId, criar, atualizar, excluir, consultarPorCnpj, lerFicha };
