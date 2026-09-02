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

/** Traduz os erros do multer (tamanho, tipo) em respostas com mensagem legível. */
const receberFicha = (req, res, next) => uploadFicha(req, res, (err) => {
  if (!err) return next();
  const mensagem = err.code === 'LIMIT_FILE_SIZE'
    ? 'O PDF passa de 8 MB. Envie um arquivo menor.'
    : err.message;
  res.status(400).json({ erro: mensagem });
});
const authCtrl = require('../controllers/authController');
const usuariosCtrl = require('../controllers/usuariosController');
const clientesCtrl = require('../controllers/clientesController');
const materiaisCtrl = require('../controllers/materiaisController');
const servicosCtrl = require('../controllers/servicosController');
const orcamentosCtrl = require('../controllers/orcamentosController');
const orcamentosVendaCtrl = require('../controllers/orcamentosVendaController');
const produtosCtrl = require('../controllers/produtosController');
const configCtrl = require('../controllers/configuracoesController');

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

// Orçamentos — compartilhado pelos dois tipos (impressão e venda)
// /resumo vem antes de /:id — senão o Express trata 'resumo' como um id.
router.get('/orcamentos/resumo', autenticar, orcamentosCtrl.resumo);
router.get('/orcamentos', autenticar, orcamentosCtrl.listar);
router.get('/orcamentos/:id', autenticar, orcamentosCtrl.buscarPorId);
router.patch('/orcamentos/:id/status', autenticar, orcamentosCtrl.alterarStatus);
router.delete('/orcamentos/:id', autenticar, apenasAdmin, orcamentosCtrl.excluir);
router.get('/orcamentos/:id/pdf', autenticar, orcamentosCtrl.gerarPDF);

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
