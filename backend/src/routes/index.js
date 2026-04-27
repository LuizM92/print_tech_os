const express = require('express');
const router = express.Router();
const { autenticar, apenasAdmin } = require('../middleware/auth');
const authCtrl = require('../controllers/authController');
const usuariosCtrl = require('../controllers/usuariosController');
const clientesCtrl = require('../controllers/clientesController');
const materiaisCtrl = require('../controllers/materiaisController');
const servicosCtrl = require('../controllers/servicosController');
const orcamentosCtrl = require('../controllers/orcamentosController');
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

// Orçamentos
router.get('/orcamentos', autenticar, orcamentosCtrl.listar);
router.get('/orcamentos/:id', autenticar, orcamentosCtrl.buscarPorId);
router.post('/orcamentos', autenticar, orcamentosCtrl.criar);
router.put('/orcamentos/:id', autenticar, orcamentosCtrl.atualizar);
router.get('/orcamentos/:id/pdf', autenticar, orcamentosCtrl.gerarPDF);

module.exports = router;
