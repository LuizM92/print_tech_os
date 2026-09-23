const express = require('express');
const multer = require('multer');
const router = express.Router();
const { autenticar, apenasAdmin } = require('../middleware/auth');

// A ficha é lida em memória e descartada — nada é gravado em disco no servidor.
const uploadFicha = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') return cb(null, true);
    cb(new Error('Envie um arquivo PDF'));
  },
}).single('ficha');

// O anexo da NF vai para o banco, então também é lido em memória.
const uploadNota = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const aceitos = ['application/pdf', 'image/png', 'image/jpeg'];
    if (aceitos.includes(file.mimetype)) return cb(null, true);
    cb(new Error('O anexo da NF deve ser PDF, PNG ou JPEG'));
  },
}).single('arquivo');

/** Traduz os erros do multer (tamanho, tipo) em respostas com mensagem legível. */
const receberFicha = (req, res, next) => uploadFicha(req, res, (err) => {
  if (!err) return next();
  const mensagem = err.code === 'LIMIT_FILE_SIZE'
    ? 'O PDF passa de 8 MB. Envie um arquivo menor.'
    : err.message;
  res.status(400).json({ erro: mensagem });
});

const receberNota = (req, res, next) => uploadNota(req, res, (err) => {
  if (!err) return next();
  const mensagem = err.code === 'LIMIT_FILE_SIZE'
    ? 'O anexo passa de 8 MB. Envie um arquivo menor.'
    : err.message;
  res.status(400).json({ erro: mensagem });
});

// Os arquivos de modelo do cliente também vão para o banco: leitura em memória.
// O filtro olha a extensão, não o MIME — a razão está em utils/arquivos3d.js.
const arquivos3d = require('../utils/arquivos3d');

const uploadArquivos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: arquivos3d.LIMITE_BYTES, files: arquivos3d.MAX_POR_ENVIO },
  fileFilter: (req, file, cb) => {
    if (arquivos3d.aceita(file.originalname)) return cb(null, true);
    cb(new Error(`Os arquivos do cliente devem ser ${arquivos3d.LISTA}`));
  },
}).array('arquivos', arquivos3d.MAX_POR_ENVIO);

const receberArquivos = (req, res, next) => uploadArquivos(req, res, (err) => {
  if (!err) return next();
  const mensagens = {
    LIMIT_FILE_SIZE: `Cada arquivo pode ter até ${arquivos3d.LIMITE_MB} MB. Compacte em ZIP ou envie separado.`,
    LIMIT_FILE_COUNT: `Envie até ${arquivos3d.MAX_POR_ENVIO} arquivos por vez.`,
    LIMIT_UNEXPECTED_FILE: `Envie até ${arquivos3d.MAX_POR_ENVIO} arquivos por vez.`,
  };
  res.status(400).json({ erro: mensagens[err.code] || err.message });
});

const authCtrl = require('../controllers/authController');
const usuariosCtrl = require('../controllers/usuariosController');
const clientesCtrl = require('../controllers/clientesController');
const materiaisCtrl = require('../controllers/materiaisController');
const servicosCtrl = require('../controllers/servicosController');
const orcamentosCtrl = require('../controllers/orcamentosController');
const orcamentosVendaCtrl = require('../controllers/orcamentosVendaController');
const produtosCtrl = require('../controllers/produtosController');
const fabricacaoCtrl = require('../controllers/fabricacaoController');
const producaoCtrl = require('../controllers/producaoController');
const configCtrl = require('../controllers/configuracoesController');
const notasCtrl = require('../controllers/notasFiscaisController');
const arquivosCtrl = require('../controllers/arquivosOrcamentoController');

// Auth
router.post('/auth/login', authCtrl.login);
router.get('/auth/perfil', autenticar, authCtrl.perfil);
router.put('/auth/alterar-senha', autenticar, authCtrl.alterarSenha);

// Usuários
router.get('/usuarios', autenticar, apenasAdmin, usuariosCtrl.listar);
router.post('/usuarios', autenticar, apenasAdmin, usuariosCtrl.criar);
router.put('/usuarios/:id', autenticar, apenasAdmin, usuariosCtrl.atualizar);
router.delete('/usuarios/:id', autenticar, apenasAdmin, usuariosCtrl.excluir);

// Clientes
// As rotas nomeadas vêm antes de /:id — senão seriam tratadas como um id.
router.get('/clientes/consulta-cnpj/:cnpj', autenticar, clientesCtrl.consultarPorCnpj);
router.post('/clientes/ler-ficha', autenticar, receberFicha, clientesCtrl.lerFicha);
router.get('/clientes', autenticar, clientesCtrl.listar);
router.get('/clientes/:id', autenticar, clientesCtrl.buscarPorId);
router.post('/clientes', autenticar, clientesCtrl.criar);
router.put('/clientes/:id', autenticar, clientesCtrl.atualizar);
router.delete('/clientes/:id', autenticar, apenasAdmin, clientesCtrl.excluir);

// Materiais
router.get('/materiais', autenticar, materiaisCtrl.listar);
router.post('/materiais', autenticar, apenasAdmin, materiaisCtrl.criar);
router.put('/materiais/:id', autenticar, apenasAdmin, materiaisCtrl.atualizar);
router.delete('/materiais/:id', autenticar, apenasAdmin, materiaisCtrl.excluir);

// Serviços
router.get('/servicos', autenticar, servicosCtrl.listar);
router.post('/servicos', autenticar, apenasAdmin, servicosCtrl.criar);
router.put('/servicos/:id', autenticar, apenasAdmin, servicosCtrl.atualizar);
router.delete('/servicos/:id', autenticar, apenasAdmin, servicosCtrl.excluir);

// Configurações
router.get('/configuracoes', autenticar, configCtrl.listar);
router.post('/configuracoes', autenticar, apenasAdmin, configCtrl.atualizar);

// Produtos (catálogo para os orçamentos de venda)
router.get('/produtos', autenticar, produtosCtrl.listar);
router.post('/produtos', autenticar, apenasAdmin, produtosCtrl.criar);
router.put('/produtos/:id', autenticar, apenasAdmin, produtosCtrl.atualizar);
router.delete('/produtos/:id', autenticar, apenasAdmin, produtosCtrl.excluir);

// Fabricação — catálogo de produtos próprios, no padrão de SKU (PADRAO-SKU.md)
// /tabelas vem antes de /:id — senão o Express trata 'tabelas' como um id.
router.get('/fabricacao/tabelas', autenticar, fabricacaoCtrl.tabelas);
router.get('/fabricacao/produtos', autenticar, fabricacaoCtrl.listar);
router.get('/fabricacao/produtos/:id', autenticar, fabricacaoCtrl.buscarPorId);
router.post('/fabricacao/produtos', autenticar, apenasAdmin, fabricacaoCtrl.criar);
router.put('/fabricacao/produtos/:id', autenticar, apenasAdmin, fabricacaoCtrl.atualizar);
router.delete('/fabricacao/produtos/:id', autenticar, apenasAdmin, fabricacaoCtrl.excluir);

// Produção — fila das OS aprovadas (quadro kanban)
router.get('/producao/etapas', autenticar, producaoCtrl.etapas);
router.get('/producao', autenticar, producaoCtrl.quadro);
router.patch('/producao/:id', autenticar, producaoCtrl.mover);

// Orçamentos — compartilhado pelos dois tipos (impressão e venda)
// /resumo vem antes de /:id — senão o Express trata 'resumo' como um id.
router.get('/orcamentos/resumo', autenticar, orcamentosCtrl.resumo);
router.get('/orcamentos', autenticar, orcamentosCtrl.listar);
router.get('/orcamentos/:id', autenticar, orcamentosCtrl.buscarPorId);
router.patch('/orcamentos/:id/status', autenticar, orcamentosCtrl.alterarStatus);
router.delete('/orcamentos/:id', autenticar, apenasAdmin, orcamentosCtrl.excluir);
router.get('/orcamentos/:id/pdf', autenticar, orcamentosCtrl.gerarPDF);

// Nota fiscal emitida em outra plataforma — aqui só fica o registro e o anexo.
router.post('/orcamentos/:id/nota-fiscal', autenticar, receberNota, notasCtrl.salvar);
router.get('/orcamentos/:id/nota-fiscal/arquivo', autenticar, notasCtrl.baixarArquivo);
router.delete('/orcamentos/:id/nota-fiscal/arquivo', autenticar, notasCtrl.removerArquivo);
router.delete('/orcamentos/:id/nota-fiscal', autenticar, notasCtrl.excluir);

// Arquivos de modelo que o cliente mandou (ZIP, STL, STEP, 3MF, OBJ).
// A lista deles vem junto de GET /orcamentos/:id; aqui só entra e sai arquivo.
router.post('/orcamentos/:id/arquivos', autenticar, receberArquivos, arquivosCtrl.enviar);
router.get('/orcamentos/:id/arquivos/:arquivoId', autenticar, arquivosCtrl.baixar);
router.delete('/orcamentos/:id/arquivos/:arquivoId', autenticar, arquivosCtrl.excluir);

// Orçamento de impressão — itens com material, peso e horas
router.post('/orcamentos', autenticar, orcamentosCtrl.criar);
router.put('/orcamentos/:id', autenticar, orcamentosCtrl.atualizar);
router.post('/orcamentos/:id/reprecificar', autenticar, orcamentosCtrl.reprecificar);

// Orçamento de venda — itens de produto, com desconto
// Caminho próprio (não /orcamentos/venda) para não colidir com /orcamentos/:id.
router.post('/orcamentos-venda', autenticar, orcamentosVendaCtrl.criar);
router.put('/orcamentos-venda/:id', autenticar, orcamentosVendaCtrl.atualizar);
router.post('/orcamentos-venda/:id/reprecificar', autenticar, orcamentosVendaCtrl.reprecificar);

module.exports = router;
