/**
 * Leitura de ficha cadastral em PDF.
 *
 * Empresas mandam a ficha em layouts muito diferentes, mas quase todas seguem o mesmo
 * padrão: um rótulo e um valor ("CNPJ: 11.444.777/0001-61"). O leitor procura os
 * rótulos conhecidos e, quando não acha, cai em padrões inequívocos — formato de CNPJ
 * com dígito verificador, CEP, e-mail, telefone.
 *
 * Roda inteiramente no servidor: o PDF do cliente não é enviado a lugar nenhum nem
 * gravado em disco.
 *
 * Limite conhecido: PDF escaneado é imagem, não texto. Nesse caso não há o que ler, e
 * quem chama recebe `temTexto: false` para avisar em vez de devolver campos vazios.
 */

const { PDFParse } = require('pdf-parse');
const { validarCnpj, somenteDigitos } = require('./consultaCnpj');

// ─── Normalização ───────────────────────────────────────────────────────────
/** Tira acentos e baixa a caixa — só para comparar rótulos, nunca para o valor. */
const chave = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const limpar = (valor) => String(valor || '')
  .replace(/^[\s:;.\-–—_|>]+/, '')   // separadores entre rótulo e valor
  .replace(/[\s.\-–—_|]+$/, '')      // sobras no fim (pontilhados de formulário)
  .replace(/\s+/g, ' ')
  .trim();

// ─── Rótulos conhecidos ─────────────────────────────────────────────────────
// A ordem dentro de cada campo não importa: os rótulos são testados do mais longo
// para o mais curto, para "conta corrente" ganhar de "conta".
const ROTULOS = {
  nome: ['razao social', 'razaosocial', 'nome empresarial', 'denominacao social', 'razao'],
  nome_fantasia: ['nome fantasia', 'nome de fantasia', 'fantasia'],
  cpf_cnpj: ['cnpj/mf', 'cnpj', 'c.n.p.j', 'cpf/cnpj'],
  inscricao_estadual: ['inscricao estadual', 'insc estadual', 'insc. estadual', 'inscr estadual', 'ie'],
  inscricao_municipal: ['inscricao municipal', 'insc municipal', 'insc. municipal', 'inscr municipal', 'im'],
  regime_tributario: ['regime tributario', 'regime de tributacao', 'regime', 'tributacao'],
  rua: ['logradouro', 'endereco comercial', 'endereco', 'rua/avenida', 'rua'],
  numero: ['numero', 'n°', 'nº', 'no.'],
  complemento: ['complemento', 'compl'],
  bairro: ['bairro'],
  cidade: ['cidade/uf', 'municipio', 'cidade'],
  estado: ['estado', 'uf'],
  cep: ['cep'],
  contato_nome: ['nome do contato', 'pessoa de contato', 'responsavel pelo cadastro', 'responsavel', 'contato', 'comprador'],
  contato_cargo: ['cargo', 'funcao', 'departamento'],
  telefone: ['telefone comercial', 'telefone fixo', 'telefone', 'fone', 'tel'],
  celular: ['celular/whatsapp', 'whatsapp', 'celular', 'cel'],
  email: ['e-mail', 'email', 'e mail'],
  banco: ['banco'],
  agencia: ['agencia', 'ag'],
  conta: ['conta corrente', 'conta bancaria', 'conta', 'c/c'],
  pix_chave: ['chave pix', 'pix'],
  condicao_pagamento: ['condicao de pagamento', 'condicoes de pagamento', 'prazo de pagamento', 'forma de pagamento'],
};

// Todos os rótulos, do mais longo para o mais curto — usado para cortar um valor
// quando dois campos dividem a mesma linha ("Cidade: Curitiba   UF: PR").
const TODOS_ROTULOS = Object.values(ROTULOS).flat().sort((a, b) => b.length - a.length);

// Fichas às vezes escrevem o estado por extenso ("UF: Paraná").
const ESTADOS_POR_EXTENSO = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

const UFS = new Set(Object.values(ESTADOS_POR_EXTENSO));

const REGIMES = [
  [/simples\s*nacional|optante.*simples/i, 'simples'],
  [/\bmei\b|microempreendedor/i, 'mei'],
  [/lucro\s*presumido|presumido/i, 'presumido'],
  [/lucro\s*real|\breal\b/i, 'real'],
];

// ─── Extração do texto ──────────────────────────────────────────────────────
const extrairTexto = async (buffer) => {
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const resultado = await parser.getText();
    const texto = String(resultado.text || '')
      .split('\n')
      // pdf-parse marca as quebras de página; não são conteúdo da ficha.
      .filter((l) => !/^--\s*\d+\s+of\s+\d+\s*--$/.test(l.trim()))
      .join('\n');

    return {
      texto,
      paginas: resultado.total || 0,
      // Uma ficha real tem dezenas de caracteres. Quase nada = PDF de imagem.
      temTexto: texto.replace(/\s/g, '').length >= 40,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
};

// ─── Interpretação ──────────────────────────────────────────────────────────
/**
 * Corta o valor quando outro rótulo aparece na mesma linha, para
 * "Cidade: Curitiba   UF: PR" não virar cidade = "Curitiba   UF: PR".
 */
const cortarNoProximoRotulo = (resto) => {
  const alvo = chave(resto);
  let corte = resto.length;

  for (const rotulo of TODOS_ROTULOS) {
    // Só conta como rótulo se vier seguido de ":" — senão "real" cortaria "Real Madrid".
    const pos = alvo.search(new RegExp(`\\b${rotulo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`));
    if (pos > 0 && pos < corte) corte = pos;
  }
  return resto.slice(0, corte);
};

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A linha começa com algum rótulo conhecido? Então ela pertence a outro campo. */
const comecaComRotulo = (linha) => {
  const alvo = chave(linha);
  return TODOS_ROTULOS.some((r) => new RegExp(`^${escapar(r)}(?![a-z0-9])`).test(alvo));
};

/** Procura um campo pelos seus rótulos, na mesma linha ou na linha de baixo. */
const acharPorRotulo = (linhas, rotulos) => {
  const ordenados = [...rotulos].sort((a, b) => b.length - a.length);

  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    const alvo = chave(linha);

    for (const rotulo of ordenados) {
      // O rótulo abre a linha e não pode continuar em outra palavra — senão "conta"
      // casaria dentro do cabeçalho "CONTATO" e devolveria "TO" como número da conta.
      const m = alvo.match(new RegExp(`^${escapar(rotulo)}(?![a-z0-9])\\s*[:\\-–—]?\\s*`));
      if (!m) continue;

      const resto = limpar(cortarNoProximoRotulo(linha.slice(m[0].length)));
      if (resto) return resto;

      // Rótulo sozinho na linha: o valor costuma estar logo abaixo. Mas se a linha de
      // baixo também começa com um rótulo, ela é de outro campo — é o caso do título
      // de seção "ENDEREÇO" seguido de "Logradouro: ...".
      const abaixo = linhas[i + 1];
      if (abaixo && !comecaComRotulo(abaixo)) {
        const valor = limpar(cortarNoProximoRotulo(abaixo));
        if (valor) return valor;
      }
    }
  }
  return null;
};

/** Padrões que dispensam rótulo — usados quando a busca por rótulo não achou. */
const acharPorPadrao = {
  cpf_cnpj: (texto) => {
    const candidatos = texto.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}/g) || [];
    const valido = candidatos.find((c) => validarCnpj(c));
    return valido ? valido.trim() : null;
  },
  cep: (texto) => {
    const m = texto.match(/\b\d{5}[-\s]?\d{3}\b/);
    return m ? m[0].trim() : null;
  },
  email: (texto) => {
    const m = texto.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return m ? m[0].trim() : null;
  },
  estado: (texto) => {
    const m = texto.match(/\b(?:UF|Estado)\s*[:\-]?\s*([A-Z]{2})\b/);
    return m ? m[1] : null;
  },
};

const normalizarCampo = (campo, valor) => {
  if (!valor) return null;

  switch (campo) {
    case 'estado': {
      // "Paraná" e "PR" devem dar no mesmo lugar; "Paraná mesmo" não pode virar "PA".
      const porExtenso = ESTADOS_POR_EXTENSO[chave(valor)];
      if (porExtenso) return porExtenso;

      const sigla = valor.toUpperCase().match(/\b[A-Z]{2}\b/);
      return sigla && UFS.has(sigla[0]) ? sigla[0] : null;
    }
    case 'cep': {
      const d = somenteDigitos(valor);
      return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : null;
    }
    case 'cpf_cnpj': {
      const d = somenteDigitos(valor);
      if (d.length !== 14 || !validarCnpj(d)) return null;
      return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    }
    case 'regime_tributario': {
      const achado = REGIMES.find(([padrao]) => padrao.test(valor));
      return achado ? achado[1] : null;
    }
    case 'numero': {
      // "Número: 7800" mas também "nº 7800 - Galpão 3"
      const m = valor.match(/\d+[A-Za-z]?/);
      return m ? m[0] : (valor.length <= 20 ? valor : null);
    }
    case 'telefone':
    case 'celular': {
      const d = somenteDigitos(valor);
      if (d.length < 8 || d.length > 11) return null;
      if (d.length >= 10) {
        const corpo = d.slice(2);
        return `(${d.slice(0, 2)}) ${corpo.length === 9 ? `${corpo.slice(0, 5)}-${corpo.slice(5)}` : `${corpo.slice(0, 4)}-${corpo.slice(4)}`}`;
      }
      return `${d.slice(0, d.length - 4)}-${d.slice(-4)}`;
    }
    default:
      return valor.length > 200 ? valor.slice(0, 200).trim() : valor;
  }
};

/**
 * Lê o texto da ficha e devolve os campos no formato do cadastro de cliente,
 * junto da lista do que foi realmente encontrado.
 */
const interpretarFicha = (texto) => {
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean);

  const dados = {};
  const encontrados = [];

  for (const [campo, rotulos] of Object.entries(ROTULOS)) {
    const bruto = acharPorRotulo(linhas, rotulos);
    const valor = normalizarCampo(campo, bruto);
    if (valor) {
      dados[campo] = valor;
      encontrados.push(campo);
    }
  }

  // Padrões só entram onde o rótulo falhou.
  for (const [campo, buscar] of Object.entries(acharPorPadrao)) {
    if (dados[campo]) continue;
    const valor = normalizarCampo(campo, buscar(texto));
    if (valor) {
      dados[campo] = valor;
      encontrados.push(campo);
    }
  }

  // Uma ficha de empresa é sempre PJ.
  if (dados.cpf_cnpj) dados.tipo_documento = 'cnpj';

  // "Cidade/UF: Curitiba - PR" preenche os dois de uma vez.
  if (dados.cidade && !dados.estado) {
    const m = dados.cidade.match(/^(.*?)[\s/-]+([A-Za-z]{2})$/);
    if (m) {
      dados.cidade = m[1].trim();
      dados.estado = m[2].toUpperCase();
      encontrados.push('estado');
    }
  }

  return { dados, encontrados };
};

module.exports = { extrairTexto, interpretarFicha, chave, limpar };
