# Sistema de Orçamento — Print Tech 3D

Gestão de orçamentos com aprovação e emissão de documento em PDF, em duas frentes
separadas: **serviço de impressão 3D** e **venda de produtos**.

---

## Os dois tipos de orçamento

| | Impressão | Venda |
|---|---|---|
| O que orça | peças impressas (material, peso, horas) | produtos do catálogo (filamento, bico, impressora…) |
| Numeração | `ORC-AAAAMM-NNNN` | `ORC-V-AAAAMM-NNNN` |
| Ao aprovar vira | **Ordem de Serviço** `OS-AAAAMM-NNNN` | **Pedido de Venda** `PED-AAAAMM-NNNN` |
| Itens | peças + serviços em dois níveis | produtos com desconto por linha |
| Tela | Orçamentos | Vendas |

São documentos independentes, com sequências de numeração próprias, mas compartilham
cliente, ciclo de aprovação, histórico e o formato do PDF.

---

## Como funciona o fluxo

```
  Rascunho  ──editar quantas vezes precisar──▶  APROVAR  ──▶  documento fechado

  ORC-202609-0001    (impressão)  ──▶  OS-202609-0001    Ordem de Serviço
  ORC-V-202609-0001  (venda)      ──▶  PED-202609-0001   Pedido de Venda
```

- Todo registro nasce como **orçamento**. O PDF sai marcado como "ORÇAMENTO" e diz, em
  texto, que ainda não é o documento fechado.
- Ao **aprovar**, o sistema gera o número definitivo e o PDF muda de cabeçalho,
  trazendo o número do orçamento de origem como referência.
- Reprovar e aprovar de novo **não renumera**: o documento mantém o número original.
- Orçamentos podem ser **editados a qualquer momento**, inclusive depois de aprovados.
  Toda alteração fica registrada no histórico, com o total antes e depois.

---

## Estrutura do orçamento de impressão

Um orçamento tem **N itens**, e cada item é uma peça diferente:

```
Orçamento ORC-202609-0001
├── Item 1: Suporte do motor    │ PLA   │ 200g │ 2,0h │ ×3
│   └── Serviço: CAD Técnico 1,5h            ← serviço deste item
├── Item 2: Tampa               │ PETG  │ 80g  │ 1,5h │ ×1
└── Serviço geral: Consultoria 2h            ← serviço do orçamento inteiro
```

**Serviços em dois níveis:** um serviço pode pertencer a um item específico (para saber
o custo real daquela peça) ou ao orçamento como um todo.

### Cálculo

Por item:

```
custo_material  = peso_gramas      × custo_por_grama       (do material)
custo_impressao = horas_impressao  × valor_hora_maquina    (das configurações)
valor_por_peca  = custo_material + custo_impressao
total_pecas     = valor_por_peca × quantidade
total_servicos  = Σ (valor_hora × horas)                   (serviços do item)
total_item      = total_pecas + total_servicos
```

Total do orçamento:

```
total_geral = Σ total_pecas + Σ serviços dos itens + Σ serviços gerais
```

O cálculo vive em [`calculoOrcamento.js`](backend/src/utils/calculoOrcamento.js) e é a
única fonte da verdade: o payload do cliente nunca define um total. O frontend recalcula
apenas para o preview em tela.

### Congelamento de preços

Cada item guarda o `custo_por_grama` com que foi orçado, cada serviço guarda o
`valor_hora`, e o orçamento guarda o `valor_hora_maquina`. Editar um orçamento **não**
repreça nada — só relê o cadastro se você trocar o material ou o serviço daquela linha.

Para trazer tudo para a tabela de preços atual, use o botão **"Atualizar preços do
cadastro"** na tela do orçamento. É uma ação explícita, justamente para que uma OS
antiga não mude de valor sozinha quando o filamento sobe de preço.

---

## Estrutura do orçamento de venda

Para o cliente que quer só o material — uma bobina de filamento, um bico, uma
impressora. Nada de peso, horas ou hora-máquina: é venda de mercadoria.

```
Orçamento de Venda ORC-V-202609-0001
├── 10 rolo  Filamento PLA 1,75mm 1kg  (3D Fila · Preto · PLA)   R$ 119,90
├──  6 rolo  Filamento PLA 1,75mm 1kg  (3D Fila · Branco · PLA)  R$ 119,90
└── 20 un    Bico 0,4mm latão  (E3D)   R$ 24,90   − 10% de desconto
                                            Desconto geral: 5%
```

### Catálogo de produtos

A tela **Produtos** guarda o que você revende. Cada produto tem:

| Campo | Para quê |
|---|---|
| `nome`, `codigo` | identificação e SKU |
| `categoria` | filamento, resina, peça, bico, impressora, acessório, outro |
| `marca` | 3D Fila, Creality, E3D… |
| `cor`, `tipo_material` | Preto, Branco / PLA, ABS, PETG, TPU |
| `diametro_mm`, `peso_liquido_g` | 1,75 ou 2,85 mm · bobina de 1 kg ou 500 g |
| `especificacao` | texto livre para o que não cabe acima |
| `unidade` | un, kg, g, m, rolo, caixa, litro |
| `preco_venda` | preço de tabela |

Cor, material, diâmetro e peso só aparecem no formulário para **filamento e resina** —
não faz sentido perguntar a cor de uma impressora.

Um item do orçamento também pode ser **avulso**: você digita a descrição e o preço sem
cadastrar nada, para aquela revenda pontual.

### Cálculo com desconto

```
por linha:
  total_bruto    = quantidade × preco_unitario
  total_desconto = % sobre o bruto  OU  valor fixo em R$
  total_item     = total_bruto − total_desconto

no orçamento:
  subtotal      = Σ total_bruto − Σ descontos de linha
  desconto geral = % ou R$ sobre o subtotal
  total_geral   = subtotal − desconto geral
```

O desconto geral incide sobre o **subtotal**, ou seja, depois dos descontos de cada
linha. Desconto maior que o valor da linha zera a linha — nunca fica negativo.

Marca, cor, código e especificação são **copiados para o orçamento** no momento em que
ele é salvo: renomear ou reajustar o produto depois não muda um pedido já fechado.

---

## Fila de produção

A tela **Produção** é o quadro kanban das OS aprovadas. Ele existe porque `status` e
andamento são coisas diferentes: o status conta a história comercial (o cliente
aprovou), a etapa conta a história da oficina — e é a etapa que responde *"já posso
avisar que ficou pronta?"*.

```
Na fila  →  Imprimindo  →  Acabamento  →  Pronta  →  Entregue
```

| Etapa | O que significa |
|---|---|
| `fila` | aprovada, esperando a máquina |
| `producao` | peça na impressora |
| `acabamento` | pós-processamento, pintura, montagem |
| `pronto` | terminada — **é aqui que se avisa o cliente** |
| `entregue` | retirada pelo cliente ou enviada |

- Só **OS** entram na fila: orçamento de venda não passa pela impressora.
- A OS entra em `fila` quando é aprovada pela primeira vez. Reprovar e aprovar de novo
  **não** devolve para a fila uma peça que já estava pronta.
- Cada movimento fica no **histórico do orçamento**, com quem moveu e de onde para onde.
- O cartão traz o volume de trabalho (peças, horas de impressão, gramas), o valor e a
  **previsão de entrega**, editável ali mesmo. Previsão vencida marca o cartão de vermelho.
- Mover é arrastar o cartão ou usar as setas `‹ ›` — as setas andam uma etapa por vez.
- A coluna **Entregue** só mostra o que saiu nos últimos 15 dias, senão ela cresceria
  para sempre. O resto continua no histórico e na listagem de orçamentos.

A mesma etapa aparece (e pode ser mudada) na tela de detalhe da OS, no card de status.

---

## Módulo de fabricação

A tela **Fabricação → Produtos** é o cadastro do que a gente **fabrica** — diferente da
tela **Produtos** de Cadastros, que é a mercadoria comprada para revender nos orçamentos
de venda. Aqui vale o padrão de SKU descrito em [PADRAO-SKU.md](PADRAO-SKU.md):

```
SKU pai       CAT-MODELO                 VAS-PACMAN
SKU variação  CAT-MODELO-MAT-VAR-TAM     VAS-PACMAN-PLA-AZL-G
```

| Nível | O que guarda |
|---|---|
| **Produto** (`fab_produtos`) | o SKU pai: categoria, modelo, nome, descrição |
| **Variação** (`fab_variacoes`) | o SKU vendável: material, variação, tamanho, nome do anúncio, preço |
| **Listagem** (`fab_listagens`) | em que loja está anunciado e com que id — o SKU é o mesmo em todas |

O SKU **nunca é digitado**: ele é montado a partir dos blocos, na tela e de novo no
servidor, e os blocos passam por normalização (sem acento, maiúsculo, só A–Z e 0–9;
quantidade sempre com 2 dígitos). Isso mantém a quebra por posição funcionando.

Duas regras do padrão viram trava no sistema:

- **Categoria e modelo não mudam depois de gravados.** Trocá-los renomearia um SKU que
  já está anunciado lá fora, então o formulário bloqueia os dois na edição.
- **SKU não é reaproveitado.** Variação tirada do formulário fica *aposentada* (some do
  anúncio, mas o código continua reservado), e descontinuar o produto desativa o pai e
  as variações em vez de apagar.

### Importar o catálogo de um CSV

```bash
cd backend
npm run importar:skus                    # usa sku/consolidado-skus.csv
npm run importar:skus -- outro.csv       # ou outro arquivo
```

Colunas esperadas: `loja`, `product_id`, `produto`, `variacao_shopee`, `sku_pai`,
`sku_variacao` — as duas primeiras são opcionais. O script agrupa por SKU pai e é seguro
repetir: produto que já existe é reaproveitado, SKU já cadastrado é pulado e linhas fora
do padrão são listadas no fim, sem interromper a importação. Os preços entram zerados —
o preço de cada variação é preenchido na tela.

---

## Cadastro de cliente

Pessoa física pede só o essencial. Quando o tipo é **CNPJ**, o formulário abre os
blocos fiscais, de contato, bancários e comerciais:

| Bloco | Campos |
|---|---|
| Identificação | razão social, nome fantasia, CNPJ, markup |
| Fiscal | inscrição estadual (ou marcador de **isento**), inscrição municipal, regime tributário, CNAE, situação cadastral |
| Endereço | logradouro, número, complemento, bairro, cidade, UF, CEP |
| Contato | nome, cargo, telefone, celular/WhatsApp, e-mail |
| Bancário | banco, agência, conta, tipo de conta, tipo e chave PIX |
| Comercial | condição de pagamento, limite de crédito, observações internas |

Campos de PJ preenchidos numa ficha que depois vira pessoa física são descartados na
gravação — não fica lixo no banco se você trocar o tipo.

**Uma empresa precisa ter inscrição estadual ou estar marcada como isenta.** Deixar os
dois em branco é recusado, porque vira problema na hora de faturar. Isso vale também ao
editar clientes antigos: na primeira edição você vai precisar preencher ou marcar isento.

### Importar dados do CNPJ

Ao lado do campo CNPJ há o botão **Importar**: digite o número, clique, e o formulário
vem preenchido com razão social, nome fantasia, endereço completo, telefone, e-mail,
CNAE, situação cadastral e regime (quando Simples ou MEI).

A consulta **só completa campos vazios** — o que você digitou à mão nunca é
sobrescrito por um dado desatualizado da Receita. Os dígitos verificadores do CNPJ são
conferidos localmente antes da chamada, para não gastar consulta com erro de digitação.

**Sobre a inscrição estadual:** ela *não* vem na consulta gratuita. As APIs abertas
expõem apenas o cadastro da **Receita Federal**; IE é dado estadual (SINTEGRA/SEFAZ) e
só sai de serviço pago ou de integração direta com certificado digital A1/A3. A tela
avisa isso quando você importa, e o campo fica para preencher à mão.

O provedor é configurável — trocar não exige mexer no código:

```env
CNPJ_API_PROVIDER=brasilapi   # padrão: grátis, sem cadastro, sem IE
CNPJ_API_TOKEN=               # só para o provedor pago
```

```env
CNPJ_API_PROVIDER=cnpja       # pago: traz a IE consultando o SEFAZ
CNPJ_API_TOKEN=seu_token_aqui
```

A chamada externa sai do **servidor**, não do navegador: evita CORS e mantém um
eventual token fora do frontend.

### Ler a ficha cadastral em PDF

Empresas costumam mandar uma ficha cadastral em PDF. O botão **Ler ficha em PDF**, no
topo do formulário, lê o arquivo e preenche o cadastro.

O leitor procura os rótulos usuais (`Razão Social:`, `CNPJ:`, `Insc. Estadual:`,
`Banco:`…) e reconhece variações de escrita, valores na linha de baixo do rótulo, dois
campos na mesma linha (`Cidade: Curitiba  UF: PR`) e o estado por extenso. Onde o
rótulo falha, cai em padrões inequívocos: CNPJ com dígito verificador válido, CEP,
e-mail e telefone.

**Ficha e Receita se complementam.** Se o PDF trouxer um CNPJ válido, a Receita é
consultada em seguida para preencher o que a ficha deixou em branco. A ficha tem
prioridade — é o que a própria empresa declarou —, e é dela que vêm justamente os
dados que a Receita não fornece: inscrição estadual, contato, banco e condição de
pagamento. A tela mostra quantos campos vieram de cada fonte.

Como na consulta de CNPJ, **só completa campos vazios**. Um campo que já tem valor é
preservado, e a tela informa quantos foram mantidos como estavam.

O PDF é processado em memória e descartado: não é gravado em disco nem enviado para
fora do servidor. Limite de 8 MB por arquivo.

**Limites conhecidos:**

- **Ficha escaneada não dá para ler.** PDF de imagem não tem texto; o sistema detecta
  e avisa, em vez de devolver campos vazios sem explicação. Para esses casos, peça a
  ficha em PDF digital. (Acrescentar OCR é possível, mas é uma dependência pesada.)
- Um PDF que não seja ficha é recusado: para valer, precisa ter CNPJ válido **ou** pelo
  menos três campos reconhecidos. Sem essa trava, uma carta qualquer terminada em
  "Departamento Técnico" viraria um "cargo" no cadastro.
- A leitura é automática e pode errar em layouts fora do padrão — **confira antes de
  salvar**. A tela avisa isso a cada leitura.

---

## Dashboard

Os números respondem aos filtros — cartões, gráfico, ranking e lista falam sempre do
mesmo recorte.

**Filtros:** período (atalhos de hoje / 7 dias / 30 dias / mês / ano, ou datas livres),
tipo (impressão ou venda), status, cliente, responsável, material, produto, faixa de
valor e **descrição do item** — este último acha "todo orçamento que teve um suporte de
motor", sem depender do número do documento. Os filtros se combinam, e a listagem de
orçamentos aceita exatamente os mesmos parâmetros.

**Indicadores:** orçamentos (com a divisão impressão/venda), aprovados, **taxa de
aprovação**, **ticket médio** (geral e dos aprovados), volume aprovado e clientes. Com
filtro aplicado, o cartão de clientes passa a contar quem de fato movimentou no
recorte, em vez do total do cadastro.

**Gráfico de evolução:** barras de valor por período — por dia quando a janela é curta
(até ~2 meses), por mês quando é longa. A parte verde é o que foi aprovado, então a
proporção entre as duas cores mostra quanto do orçado virou trabalho fechado. É SVG
desenhado à mão: nenhuma biblioteca de gráficos, nada a mais no carregamento.

**Top clientes:** ranking por valor aprovado no recorte. Clicar num cliente filtra o
dashboard inteiro por ele.

Entrada inválida em qualquer filtro é ignorada em silêncio — filtro é conveniência de
tela e não deve derrubar a página. Todos os valores entram na consulta como parâmetro;
nada do que o usuário digita vira texto de SQL.

---

## Pré-requisitos

- Node.js 20+ (o Docker usa Node 22; o 18 saiu de suporte e não roda o leitor de PDF)
- MySQL 5.7+ ou 8.0
- npm
- Acesso de saída à internet no servidor (só para a consulta de CNPJ)

---

## Instalação

### Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edite o `.env`:

```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha_aqui
DB_NAME=sistema_orcamento
JWT_SECRET=troque_isso_por_uma_string_muito_segura_e_longa
JWT_EXPIRES_IN=8h
```

Crie o banco e as tabelas:

```bash
npm run migrate
```

Suba o servidor:

```bash
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm start
```

Acesse **http://localhost:3000**. O proxy já redireciona `/api/*` para a porta 5000.

**Usuário inicial:** `admin@sistema.com` / `admin123` — troque a senha no primeiro login.

---

## Migrações

O banco é versionado. Cada alteração de schema é um arquivo numerado em
`backend/src/utils/migrations/`, e o runner aplica só o que ainda não rodou,
registrando em `schema_migrations`.

```bash
npm run migrate          # aplica as migrações pendentes (seguro repetir)
```

### Atualizando um banco que já tem dados

**Faça backup antes.** A migração `002` reorganiza a tabela de orçamentos:

```bash
mysqldump -u root -p sistema_orcamento > backup_antes_migracao.sql
```

A `002` converte cada orçamento antigo em um orçamento com **1 item**, sem recalcular
nenhum valor. O número antigo é preservado em `numero_orcamento` (o prefixo `OS-` vira
`ORC-`), e o `numero_os` continua só nos que estavam aprovados.

A `004` acrescenta o módulo de venda. Ela não mexe em nenhum orçamento existente: todos
recebem `tipo = impressao` e seguem exatamente como estavam.

A `005` acrescenta os campos do cadastro completo de cliente. São todos opcionais no
banco, então os clientes já cadastrados continuam válidos — mas a tela passa a exigir
inscrição estadual (ou o marcador de isento) na próxima vez que você editar um CNPJ.

Confira o resultado antes de seguir:

```sql
-- Todo orçamento antigo virou item? (precisa retornar 0)
SELECT COUNT(*) FROM orcamentos o
 WHERE o.material_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM orcamento_itens i WHERE i.orcamento_id = o.id);

-- Algum valor mudou? (não pode retornar nenhuma linha)
SELECT o.id, o.total_peca, i.total_pecas
  FROM orcamentos o JOIN orcamento_itens i ON i.orcamento_id = o.id
 WHERE o.total_peca <> i.total_pecas;
```

As colunas antigas continuam na tabela para essa conferência. Quando estiver satisfeito,
remova-as:

```bash
npm run migrate:limpeza
```

Essa é a única migração destrutiva e **não roda sozinha** — ela se recusa a executar se
encontrar algum orçamento sem item correspondente.

---

## Testes

```bash
cd backend
npm test
```

O que os testes cobrem:

- **Cálculo do orçamento de impressão** — item único, múltiplos itens, serviços nos dois
  níveis, quantidade, arredondamento e entradas inválidas.
- **Cálculo do orçamento de venda** — desconto percentual, desconto em reais, desconto
  maior que o item e desconto geral incidindo sobre o subtotal.
- **Validação de CNPJ** — dígitos verificadores, tamanho e sequências repetidas,
  conferidos antes de disparar a consulta externa.
- **Leitura da ficha em PDF** — rótulo na mesma linha e na linha de baixo, título de
  seção que não pode roubar o valor seguinte, rótulo curto que não pode casar dentro de
  outra palavra, dois campos por linha, estado por extenso e campos achados sem rótulo.
- **Etapas de produção** — etapa inicial, recusa de etapa inexistente, `pronta` e
  `entregue` como etapas distintas e o texto do movimento gravado no histórico.
- **Padrão de SKU** — normalização dos blocos (acento, cedilha, espaço), quantidade com
  2 dígitos, montagem do SKU pai e do SKU de variação, quebra de um SKU nos 5 blocos e
  recusa de categoria, material ou modelo fora do padrão.
- **Filtros do dashboard** — período, enums, ids, faixa de valor, busca em tabela filha,
  granularidade do gráfico e recusa de entrada inválida.

---

## Perfis de acesso

| | Administrador | Operador |
|---|---|---|
| Orçamentos: criar, editar, aprovar | ✅ | ✅ |
| Orçamentos: excluir (só rascunho) | ✅ | ❌ |
| Clientes: cadastrar e editar | ✅ | ✅ |
| Clientes: excluir | ✅ | ❌ |
| Materiais, serviços e produtos: gerenciar | ✅ | ❌ (só visualiza) |
| Usuários | ✅ | ❌ |
| Configurações (hora-máquina) | ✅ | ❌ (só visualiza) |

---

## Banco de dados

```
usuarios            → id, nome, email, senha, perfil, ativo
configuracoes       → chave, valor  (valor_hora_maquina)
clientes            → id, nome, nome_fantasia, cpf_cnpj, tipo_documento, endereço...,
                      markup, inscricao_estadual, ie_isento, inscricao_municipal,
                      regime_tributario, cnae, situacao_cadastral, contato_nome,
                      contato_cargo, telefone, celular, email, banco, agencia, conta,
                      tipo_conta, pix_tipo, pix_chave, condicao_pagamento,
                      limite_credito, observacoes, ativo
materiais           → id, nome, custo_por_grama, descricao, ativo
servicos            → id, nome, valor_hora, descricao, ativo
produtos            → id, codigo, nome, categoria, marca, cor, tipo_material,
                      diametro_mm, peso_liquido_g, especificacao, unidade,
                      preco_venda, descricao, ativo

fab_produtos        → id, sku_pai, categoria, modelo, nome, descricao, ativo
fab_variacoes       → id, produto_id, sku, material, variacao, tamanho,
                      nome_variacao, preco_venda, ativo
fab_listagens       → id, produto_id, loja, product_id

orcamentos          → id, tipo (impressao|produto), numero_orcamento,
                      etapa_producao (fila|producao|acabamento|pronto|entregue),
                      etapa_alterada_em, previsao_entrega,
                      numero_os / numero_pedido (NULL até aprovar), cliente_id,
                      observacao, valor_hora_maquina, total_itens, total_servicos_itens,
                      total_servicos_gerais, total_produtos, desconto_tipo, desconto,
                      total_descontos, total_geral, status, aprovado_em,
                      aprovado_por, criado_por

orcamento_itens     → id, orcamento_id, ordem, descricao, material_id, tipo_peca,
                      peso_gramas, horas_impressao, quantidade, custo_por_grama,
                      custo_material, custo_impressao, valor_por_peca, total_pecas,
                      total_servicos, total_item

orcamento_servicos  → id, orcamento_id, item_id (NULL = serviço geral), servico_id,
                      quantidade_horas, valor_hora, total

orcamento_produtos  → id, orcamento_id, ordem, produto_id (NULL = item avulso), codigo,
                      descricao, categoria, marca, cor, tipo_material, especificacao,
                      unidade, quantidade, preco_unitario, desconto_tipo, desconto,
                      total_bruto, total_desconto, total_item

orcamento_historico → id, orcamento_id, usuario_id, acao, detalhe,
                      total_anterior, total_novo

contadores          → chave, valor   (numeração sequencial por mês)
schema_migrations   → versao, aplicada_em
```

---

## API

```
POST   /api/auth/login
GET    /api/auth/perfil
PUT    /api/auth/alterar-senha

GET    /api/usuarios                        (admin)
POST   /api/usuarios                        (admin)
PUT    /api/usuarios/:id                    (admin)
DELETE /api/usuarios/:id                    (admin)

GET    /api/clientes/consulta-cnpj/:cnpj     dados públicos para pré-preencher o cadastro
POST   /api/clientes/ler-ficha               lê a ficha cadastral em PDF (multipart: ficha)
GET    /api/clientes
GET    /api/clientes/:id
POST   /api/clientes
PUT    /api/clientes/:id
DELETE /api/clientes/:id                    (admin)

GET    /api/materiais
POST   /api/materiais                       (admin)
PUT    /api/materiais/:id                   (admin)
DELETE /api/materiais/:id                   (admin)

GET    /api/servicos
POST   /api/servicos                        (admin)
PUT    /api/servicos/:id                    (admin)
DELETE /api/servicos/:id                    (admin)

GET    /api/produtos                        ?categoria&busca
POST   /api/produtos                        (admin)
PUT    /api/produtos/:id                    (admin)
DELETE /api/produtos/:id                    (admin)

GET    /api/configuracoes
POST   /api/configuracoes                   (admin)

  # fabricação — catálogo próprio no padrão de SKU
GET    /api/fabricacao/tabelas              categorias, materiais e cores do padrão
GET    /api/fabricacao/produtos             ?categoria&busca&incluir_inativos
GET    /api/fabricacao/produtos/:id         com variações e listagens
POST   /api/fabricacao/produtos             (admin) cria com variações aninhadas
PUT    /api/fabricacao/produtos/:id         (admin) nome, descrição, variações e lojas
DELETE /api/fabricacao/produtos/:id         (admin) descontinua, não apaga

  # fila de produção — só OS aprovadas
GET    /api/producao/etapas                 as etapas na ordem do quadro
GET    /api/producao                        quadro agrupado por etapa (?busca&dias_entregue)
PATCH  /api/producao/:id                    move de etapa e/ou ajusta a previsão

  # comuns aos dois tipos
GET    /api/orcamentos/resumo               indicadores, série do gráfico e ranking
GET    /api/orcamentos                      listagem paginada (?pagina&porPagina)

  # os dois aceitam os mesmos filtros, todos opcionais e combináveis:
  #   de, ate (AAAA-MM-DD) · tipo · status · cliente_id · criado_por
  #   material_id · produto_id · valor_min · valor_max · descricao_item · busca
GET    /api/orcamentos/:id                  com itens/produtos e histórico
PATCH  /api/orcamentos/:id/status           aprovar gera a OS ou o Pedido
DELETE /api/orcamentos/:id                  (admin, só rascunho)
GET    /api/orcamentos/:id/pdf              layout conforme o tipo e o status

  # orçamento de impressão
POST   /api/orcamentos                      cria com itens aninhados
PUT    /api/orcamentos/:id                  edita tudo, inclusive itens
POST   /api/orcamentos/:id/reprecificar     traz os custos do cadastro atual

  # orçamento de venda
POST   /api/orcamentos-venda                cria com produtos aninhados
PUT    /api/orcamentos-venda/:id            edita tudo, inclusive produtos
POST   /api/orcamentos-venda/:id/reprecificar  traz os preços do catálogo
```

### Exemplo — criar orçamento com dois itens

```jsonc
POST /api/orcamentos
{
  "cliente_id": 1,
  "observacao": "Entrega em duas semanas",
  "itens": [
    {
      "descricao": "Suporte do motor",
      "material_id": 1,
      "tipo_peca": "tecnica",
      "peso_gramas": 200,
      "horas_impressao": 2,
      "quantidade": 3,
      "servicos": [{ "servico_id": 1, "quantidade_horas": 1.5 }]
    },
    {
      "descricao": "Tampa",
      "material_id": 3,
      "tipo_peca": "decorativa",
      "peso_gramas": 80,
      "horas_impressao": 1.5,
      "quantidade": 1
    }
  ],
  "servicos_gerais": [{ "servico_id": 4, "quantidade_horas": 2 }]
}
```

### Exemplo — criar orçamento de venda

```jsonc
POST /api/orcamentos-venda
{
  "cliente_id": 1,
  "observacao": "Pagamento em 30 dias",
  "desconto_tipo": "percentual",       // desconto geral: "percentual" ou "valor"
  "desconto": 5,
  "produtos": [
    { "produto_id": 1, "quantidade": 10, "preco_unitario": 119.90 },
    {
      "produto_id": 7, "quantidade": 20, "preco_unitario": 24.90,
      "desconto_tipo": "percentual", "desconto": 10
    },
    // item avulso: sem produto_id, com descrição digitada
    { "descricao": "Peça de terceiro", "quantidade": 1, "preco_unitario": 75 }
  ]
}
```

---

## Deploy com Docker

O Dockerfile faz o build do React e o Express serve o resultado junto com a API na
mesma porta. As migrações **não** rodam sozinhas.

**A ordem importa.** Subir o app antes de migrar deixa uma janela em que o código novo
procura colunas que ainda não existem — o sistema quebra até a migração terminar. Por
isso o app é parado antes, e só volta depois do banco estar atualizado:

```bash
docker compose exec db mysqldump -u root -p sistema_orcamento > backup_$(date +%F).sql
```

```bash
git pull && docker compose stop app && docker compose build app
```

```bash
docker compose run --rm app npm run migrate
```

```bash
docker compose up -d
```

Confira o resultado com as queries da seção **Migrações** antes de rodar
`npm run migrate:limpeza`, que é a única etapa destrutiva.

Se algo sair errado: `docker compose down`, restaure o dump e volte o código com
`git checkout <commit anterior>`.

O deploy precisa de **saída para a internet** no servidor — só a consulta de CNPJ
depende disso; o resto do sistema funciona sem.

### Antes de expor em produção

O `docker-compose.yml` versionado traz senha do MySQL e `JWT_SECRET` como texto no
arquivo, e publica a porta 3306 do banco. Antes de colocar no ar:

- mova os segredos para um `.env` fora do versionamento e use `env_file:` no compose;
- gere um `JWT_SECRET` longo e aleatório (32+ caracteres);
- remova o mapeamento `3306:3306` — o app fala com o banco pela rede interna;
- troque a senha do usuário admin padrão.

---

## Pendência conhecida

O campo **`markup`** do cliente é cadastrado e exibido, mas **não entra em nenhum
cálculo**. Ficou do modelo antigo. Decidir se ele se aplica por item ou sobre o total
antes de voltar a usá-lo.
