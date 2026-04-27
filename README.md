# Sistema de Orçamento / Ordem de Serviço

Sistema completo para gestão de orçamentos com geração de OS e PDF.

---

## Pré-requisitos

- Node.js 18+
- MySQL 5.7+ ou 8.0
- npm

---

## 📁 Estrutura do Projeto

```
sistema-orcamento/
├── backend/          ← API Node.js + Express
│   ├── src/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── utils/
│   └── package.json
└── frontend/         ← React.js
    ├── src/
    │   ├── components/
    │   ├── contexts/
    │   ├── pages/
    │   └── services/
    └── package.json
```

---

## ⚙️ Configuração do Backend

### 1. Instalar dependências

```bash
cd backend
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o arquivo `.env` com suas configurações:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_NAME=sistema_orcamento
JWT_SECRET=troque_isso_por_uma_string_muito_segura_e_longa
JWT_EXPIRES_IN=8h
```

### 3. Criar banco de dados e tabelas

```bash
npm run migrate
```

Este comando:
- Cria o banco de dados automaticamente
- Cria todas as tabelas
- Insere o usuário admin padrão
- Insere materiais e serviços de exemplo

**Usuário admin criado:**
- Email: `admin@sistema.com`
- Senha: `admin123`
- ⚠️ **Troque a senha após o primeiro login!**

### 4. Iniciar o servidor

```bash
# Produção
npm start

# Desenvolvimento (com auto-reload)
npm run dev
```

O backend estará disponível em: `http://localhost:5000`

---

## 🖥️ Configuração do Frontend

### 1. Instalar dependências

```bash
cd frontend
npm install
```

### 2. Iniciar

```bash
npm start
```

O frontend estará disponível em: `http://localhost:3000`

O proxy já está configurado para redirecionar chamadas `/api/*` para o backend na porta 5000.

---

## 🚀 Rodando o sistema completo

Abra dois terminais:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm start
```

Acesse: **http://localhost:3000**

---

## 👥 Perfis de Acesso

### Administrador (`admin`)
- ✅ Gerenciar usuários (criar, editar, excluir)
- ✅ Gerenciar clientes (criar, editar, excluir)
- ✅ Gerenciar materiais e serviços (criar, editar, excluir)
- ✅ Criar e visualizar orçamentos
- ✅ Alterar status das OS

### Operador (`operador`)
- ✅ Cadastrar e editar clientes (sem excluir)
- ✅ Visualizar materiais e serviços
- ✅ Criar e visualizar orçamentos
- ✅ Alterar status das OS
- ❌ Excluir clientes
- ❌ Excluir usuários
- ❌ Gerenciar materiais e serviços

---

## 📋 Funcionalidades

### Sistema de Login
- Autenticação com JWT (válido por 8h)
- Dois perfis: `admin` e `operador`
- Proteção de rotas no frontend e backend

### Cadastro de Clientes
- Nome, CPF ou CNPJ (com tipo)
- Endereço completo (rua, número, complemento, bairro, cidade, estado, CEP)
- Campo **Markup** (percentual)

### Materiais
- Nome do material (PLA, ABS, PETG, etc.)
- Custo por kg
- Descrição opcional

### Serviços (Hora Técnica)
- Nome do serviço (CAD Técnico, Pós-processamento, etc.)
- Valor por hora
- Descrição opcional

### Orçamento / OS
- Seleção do cliente com exibição do endereço
- Campo **Multiplicador** (multiplica sobre o custo/kg)
- Seleção do **Tipo de Material** com custo automático
- Campo **Tipo de Peça** (Técnica ou Decorativa)
- Campo **Observações** (até 1.000 caracteres)
- Inclusão de um ou mais **Serviços** com horas
- Campo **Quantidade de peças**
- **Peso da peça em kg**

### Cálculo automático:
```
Valor por peça = custo_kg × multiplicador × peso_kg
Total peças    = valor_por_peça × quantidade
Total serviço  = Σ (valor_hora × horas_serviço)
Total geral    = total_peças + total_serviço
```

- **Número de OS único** gerado automaticamente (ex: `OS-202504-4721`)
- **Geração de PDF** com todos os dados da OS
- Status da OS: Rascunho / Aprovado / Reprovado / Cancelado

---

## 🗄️ Estrutura do Banco de Dados

```
usuarios       → id, nome, email, senha, perfil, ativo
clientes       → id, nome, cpf_cnpj, tipo_documento, endereço..., markup
materiais      → id, nome, custo_por_kg, descricao, ativo
servicos       → id, nome, valor_hora, descricao, ativo
orcamentos     → id, numero_os, cliente_id, multiplicador, material_id,
                  tipo_peca, observacao, quantidade, peso_kg,
                  valor_por_peca, total_peca, total_servico, total_geral,
                  status, criado_por
orcamento_servicos → id, orcamento_id, servico_id, quantidade_horas, valor_hora, total
```

---

## 🔌 Endpoints da API

```
POST   /api/auth/login
GET    /api/auth/perfil
PUT    /api/auth/alterar-senha

GET    /api/usuarios          (admin)
POST   /api/usuarios          (admin)
PUT    /api/usuarios/:id       (admin)
DELETE /api/usuarios/:id       (admin)

GET    /api/clientes
POST   /api/clientes
PUT    /api/clientes/:id
DELETE /api/clientes/:id       (admin)

GET    /api/materiais
POST   /api/materiais          (admin)
PUT    /api/materiais/:id       (admin)
DELETE /api/materiais/:id       (admin)

GET    /api/servicos
POST   /api/servicos           (admin)
PUT    /api/servicos/:id        (admin)
DELETE /api/servicos/:id        (admin)

GET    /api/orcamentos
GET    /api/orcamentos/:id
POST   /api/orcamentos
PUT    /api/orcamentos/:id
GET    /api/orcamentos/:id/pdf
```

---

## 🔧 Deploy em Produção

### Build do frontend:
```bash
cd frontend
npm run build
```

### Servir o build com o Express (opcional):
No `server.js`, adicione após as rotas:
```js
const path = require('path');
app.use(express.static(path.join(__dirname, '../../frontend/build')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/build/index.html'));
});
```

### Variáveis de ambiente em produção:
- Use um `JWT_SECRET` longo e aleatório (32+ caracteres)
- Configure `FRONTEND_URL` com o domínio real
- Use um usuário MySQL com permissões limitadas ao banco
