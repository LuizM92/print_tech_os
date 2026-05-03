require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path'); // Adicionado
const routes = require('./routes');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Configuração para servir o Frontend no Docker ---
// No Dockerfile que criamos, a pasta 'build' está na raiz do backend
app.use(express.static(path.join(__dirname, '../build')));

app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// Rotas da API
app.use('/api', routes);

// Rota curinga para o React Router (deve ser a ÚLTIMA rota)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../build/index.html'));
});
// ----------------------------------------------------

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📡 API disponível em http://localhost:${PORT}/api`);
});