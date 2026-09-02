const test = require('node:test');
const assert = require('node:assert');
const { interpretarFicha } = require('./leitorFicha');

const ler = (texto) => interpretarFicha(texto).dados;

test('layout comum: rótulo e valor na mesma linha', () => {
  const d = ler(`
    FICHA CADASTRAL
    Razão Social: INDUSTRIA MECANICA HORIZONTE LTDA
    Nome Fantasia: Horizonte Usinagem
    CNPJ: 11.444.777/0001-61
    Inscrição Estadual: 907.654.321.110
  `);
  assert.strictEqual(d.nome, 'INDUSTRIA MECANICA HORIZONTE LTDA');
  assert.strictEqual(d.nome_fantasia, 'Horizonte Usinagem');
  assert.strictEqual(d.cpf_cnpj, '11.444.777/0001-61');
  assert.strictEqual(d.inscricao_estadual, '907.654.321.110');
  assert.strictEqual(d.tipo_documento, 'cnpj');
});

test('layout de formulário: rótulo em cima, valor embaixo', () => {
  const d = ler(`
    RAZÃO SOCIAL
    METALURGICA SAO PAULO SA
    CNPJ
    11.444.777/0001-61
    BAIRRO
    Vila Industrial
  `);
  assert.strictEqual(d.nome, 'METALURGICA SAO PAULO SA');
  assert.strictEqual(d.cpf_cnpj, '11.444.777/0001-61');
  assert.strictEqual(d.bairro, 'Vila Industrial');
});

test('título de seção não rouba o valor da linha seguinte', () => {
  // "ENDEREÇO" e "CONTATO" são cabeçalhos, não rótulos de campo.
  const d = ler(`
    ENDEREÇO
    Logradouro: Rodovia BR-116
    Bairro: Centro
    CONTATO
    Responsável: Carla Bittencourt
  `);
  assert.strictEqual(d.rua, 'Rodovia BR-116');
  assert.strictEqual(d.contato_nome, 'Carla Bittencourt');
});

test('rótulo curto não casa dentro de outra palavra', () => {
  // "conta" não pode casar em "CONTATO", nem "ie" em "IEXX".
  const d = ler(`
    CONTATO
    Nome do contato: Ana
    Conta Corrente: 44120-8
  `);
  assert.strictEqual(d.conta, '44120-8');
  assert.strictEqual(d.contato_nome, 'Ana');
});

test('dois campos na mesma linha são separados', () => {
  const d = ler('Cidade: Curitiba    UF: PR');
  assert.strictEqual(d.cidade, 'Curitiba');
  assert.strictEqual(d.estado, 'PR');
});

test('cidade/UF juntas no mesmo valor', () => {
  const d = ler('Cidade: São José dos Pinhais - PR');
  assert.strictEqual(d.cidade, 'São José dos Pinhais');
  assert.strictEqual(d.estado, 'PR');
});

test('acha CNPJ, CEP e e-mail sem rótulo nenhum', () => {
  const d = ler(`
    METALURGICA XYZ
    11.444.777/0001-61
    Av. Brasil, 1200 - 83065-260
    fale@xyz.com.br
  `);
  assert.strictEqual(d.cpf_cnpj, '11.444.777/0001-61');
  assert.strictEqual(d.cep, '83065-260');
  assert.strictEqual(d.email, 'fale@xyz.com.br');
});

test('ignora CNPJ com dígito verificador inválido', () => {
  const d = ler('CNPJ: 11.444.777/0001-99');
  assert.strictEqual(d.cpf_cnpj, undefined);
});

test('normaliza telefones para o formato do cadastro', () => {
  assert.strictEqual(ler('Telefone: 4133827700').telefone, '(41) 3382-7700');
  assert.strictEqual(ler('Celular: (41) 99815-3040').celular, '(41) 99815-3040');
  assert.strictEqual(ler('Telefone: 41 3382 7700').telefone, '(41) 3382-7700');
});

test('reconhece os regimes tributários escritos por extenso', () => {
  assert.strictEqual(ler('Regime Tributário: Lucro Presumido').regime_tributario, 'presumido');
  assert.strictEqual(ler('Regime Tributário: Simples Nacional').regime_tributario, 'simples');
  assert.strictEqual(ler('Regime: Lucro Real').regime_tributario, 'real');
  assert.strictEqual(ler('Regime Tributário: MEI').regime_tributario, 'mei');
});

test('normaliza CEP com e sem máscara', () => {
  assert.strictEqual(ler('CEP: 83065260').cep, '83065-260');
  assert.strictEqual(ler('CEP: 83065-260').cep, '83065-260');
});

test('entende o estado por extenso e recusa o que não é UF', () => {
  assert.strictEqual(ler('UF: Paraná').estado, 'PR');
  assert.strictEqual(ler('Estado: São Paulo').estado, 'SP');
  assert.strictEqual(ler('UF: PR').estado, 'PR');
  // Não pode chutar "PA" a partir de "Paraná mesmo" nem inventar sigla inexistente.
  assert.strictEqual(ler('UF: Paraná mesmo').estado, undefined);
  assert.strictEqual(ler('UF: XX').estado, undefined);
  assert.strictEqual(ler('UF: 12').estado, undefined);
});

test('variações de escrita dos rótulos', () => {
  const d = ler(`
    Insc. Estadual: 111.222.333.444
    Fone: (11) 4002-8922
    E-mail: compras@empresa.com
    Município: Campinas
    Chave PIX: compras@empresa.com
  `);
  assert.strictEqual(d.inscricao_estadual, '111.222.333.444');
  assert.strictEqual(d.telefone, '(11) 4002-8922');
  assert.strictEqual(d.email, 'compras@empresa.com');
  assert.strictEqual(d.cidade, 'Campinas');
  assert.strictEqual(d.pix_chave, 'compras@empresa.com');
});

test('ficha vazia não inventa campos', () => {
  const { dados, encontrados } = interpretarFicha('Documento sem nada de útil aqui.');
  assert.deepStrictEqual(encontrados, []);
  assert.deepStrictEqual(dados, {});
});

test('limpa pontilhado de formulário no fim do valor', () => {
  assert.strictEqual(ler('Bairro: Centro ..........').bairro, 'Centro');
  assert.strictEqual(ler('Cargo: Compras ______').contato_cargo, 'Compras');
});
