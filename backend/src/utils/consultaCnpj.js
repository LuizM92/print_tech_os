/**
 * Consulta de CNPJ para pré-preencher o cadastro de cliente.
 *
 * A escolha do provedor é uma configuração, não uma decisão gravada no código:
 *
 *   CNPJ_API_PROVIDER=brasilapi   (padrão) — grátis, sem cadastro, sem chave
 *   CNPJ_API_PROVIDER=cnpja       — exige CNPJ_API_TOKEN; é o único que devolve a
 *                                   inscrição estadual, porque consulta o SEFAZ
 *
 * Por que importa: as APIs gratuitas expõem apenas o cadastro da **Receita Federal**.
 * Inscrição estadual é dado estadual (SINTEGRA/SEFAZ) e só vem de serviço pago ou de
 * integração direta com certificado digital. Com a BrasilAPI o formulário chega quase
 * completo e a IE fica para digitar; trocando a variável de ambiente, ela passa a vir
 * junto sem mexer em uma linha de código.
 */

const TIMEOUT_MS = 12000;

// ─── Validação ──────────────────────────────────────────────────────────────
const somenteDigitos = (v) => String(v || '').replace(/\D/g, '');

/** Valida os dois dígitos verificadores. Evita gastar chamada de API com typo. */
const validarCnpj = (valor) => {
  const cnpj = somenteDigitos(valor);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false; // 00000000000000 e afins

  const digito = (base) => {
    let peso = base.length - 7;
    let soma = 0;
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(cnpj.slice(0, 12)) === Number(cnpj[12])
      && digito(cnpj.slice(0, 13)) === Number(cnpj[13]);
};

const formatarCnpj = (v) => {
  const d = somenteDigitos(v);
  return d.length === 14
    ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`
    : v;
};

const formatarCep = (v) => {
  const d = somenteDigitos(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (d || null);
};

const formatarTelefone = (ddd, numero) => {
  let d = somenteDigitos(ddd);
  let n = somenteDigitos(numero);
  if (!n) return null;

  // A BrasilAPI entrega DDD e número grudados num campo só (ex: 6134939002).
  // Sem separar, sairia "6134-939002".
  if (!d && (n.length === 10 || n.length === 11)) {
    d = n.slice(0, 2);
    n = n.slice(2);
  }

  const corpo = n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`;
  return d ? `(${d}) ${corpo}` : corpo;
};

const vazio = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

/** Corta no tamanho da coluna — a Receita devolve complementos enormes. */
const limitar = (v, max) => {
  const t = vazio(v);
  return t && t.length > max ? t.slice(0, max).trim() : t;
};

// Sem User-Agent a BrasilAPI responde 403 — o fetch do Node não manda um por padrão.
const USER_AGENT = 'PrintTech3D-Orcamentos/1.0 (+sistema de orçamentos)';

const buscarJson = async (url, cabecalhos = {}) => {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...cabecalhos },
      signal: controle.signal,
    });
    return { status: res.status, corpo: await res.json().catch(() => null) };
  } finally {
    clearTimeout(timer);
  }
};

// ─── Provedores ─────────────────────────────────────────────────────────────
// Cada um devolve o mesmo formato, para que a troca seja transparente.

const brasilapi = {
  nome: 'BrasilAPI (Receita Federal)',
  temInscricaoEstadual: false,
  consultar: async (cnpj) => {
    const { status, corpo } = await buscarJson(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    if (status === 404) return { erro: 'CNPJ não encontrado na Receita Federal', http: 404 };
    if (status === 429) return { erro: 'Muitas consultas seguidas. Tente de novo em instantes.', http: 429 };
    if (status !== 200 || !corpo) return { erro: 'A consulta de CNPJ não respondeu como esperado', http: 502 };

    const regime = corpo.opcao_pelo_mei ? 'mei' : (corpo.opcao_pelo_simples ? 'simples' : null);

    return {
      dados: {
        nome: limitar(corpo.razao_social, 150),
        nome_fantasia: limitar(corpo.nome_fantasia, 150),
        cpf_cnpj: formatarCnpj(cnpj),
        tipo_documento: 'cnpj',
        rua: limitar(corpo.logradouro, 200),
        numero: limitar(corpo.numero, 20),
        complemento: limitar(corpo.complemento, 100),
        bairro: limitar(corpo.bairro, 100),
        cidade: limitar(corpo.municipio, 100),
        estado: vazio(corpo.uf),
        cep: formatarCep(corpo.cep),
        telefone: formatarTelefone(null, corpo.ddd_telefone_1),
        celular: formatarTelefone(null, corpo.ddd_telefone_2),
        email: limitar(corpo.email, 150),
        cnae: limitar(corpo.cnae_fiscal_descricao, 150),
        situacao_cadastral: limitar(corpo.descricao_situacao_cadastral, 40),
        regime_tributario: regime,
        inscricao_estadual: null, // a Receita Federal não expõe IE
      },
    };
  },
};

const cnpja = {
  nome: 'CNPJá (Receita Federal + SEFAZ)',
  temInscricaoEstadual: true,
  consultar: async (cnpj) => {
    const token = process.env.CNPJ_API_TOKEN;
    if (!token) return { erro: 'CNPJ_API_TOKEN não configurado no .env', http: 500 };

    const { status, corpo } = await buscarJson(
      `https://api.cnpja.com/office/${cnpj}?registrations=BR`,
      { Authorization: token }
    );
    if (status === 404) return { erro: 'CNPJ não encontrado', http: 404 };
    if (status === 401 || status === 403) return { erro: 'Token da API de CNPJ inválido', http: 500 };
    if (status === 429) return { erro: 'Limite de consultas do plano atingido', http: 429 };
    if (status !== 200 || !corpo) return { erro: 'A consulta de CNPJ não respondeu como esperado', http: 502 };

    const end = corpo.address || {};
    const fone = (corpo.phones || [])[0];
    const celular = (corpo.phones || []).find((p) => p.type === 'MOBILE');
    // Entre as inscrições estaduais, a habilitada do próprio estado é a que interessa.
    const ie = (corpo.registrations || []).find((r) => r.enabled && r.state === end.state)
            || (corpo.registrations || []).find((r) => r.enabled);

    return {
      dados: {
        nome: limitar(corpo.company?.name, 150),
        nome_fantasia: limitar(corpo.alias, 150),
        cpf_cnpj: formatarCnpj(cnpj),
        tipo_documento: 'cnpj',
        rua: limitar(end.street, 200),
        numero: limitar(end.number, 20),
        complemento: limitar(end.details, 100),
        bairro: limitar(end.district, 100),
        cidade: limitar(end.city, 100),
        estado: vazio(end.state),
        cep: formatarCep(end.zip),
        telefone: fone ? formatarTelefone(fone.area, fone.number) : null,
        celular: celular ? formatarTelefone(celular.area, celular.number) : null,
        email: vazio((corpo.emails || [])[0]?.address),
        cnae: limitar(corpo.mainActivity?.text, 150),
        situacao_cadastral: limitar(corpo.status?.text, 40),
        regime_tributario: corpo.company?.simei?.optant ? 'mei'
          : (corpo.company?.simples?.optant ? 'simples' : null),
        inscricao_estadual: limitar(ie?.number, 20),
      },
    };
  },
};

const PROVEDORES = { brasilapi, cnpja };

const provedorAtivo = () => PROVEDORES[process.env.CNPJ_API_PROVIDER] || brasilapi;

/**
 * Consulta um CNPJ e devolve os campos já no formato do cadastro de cliente.
 * Retorna { erro, http } em caso de falha — quem chama decide o status HTTP.
 */
const consultarCnpj = async (valor) => {
  const cnpj = somenteDigitos(valor);
  if (!validarCnpj(cnpj)) return { erro: 'CNPJ inválido — confira os números digitados', http: 400 };

  const provedor = provedorAtivo();
  try {
    const resultado = await provedor.consultar(cnpj);
    if (resultado.erro) return resultado;
    return {
      dados: resultado.dados,
      fonte: provedor.nome,
      tem_inscricao_estadual: provedor.temInscricaoEstadual,
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      return { erro: 'A consulta demorou demais para responder. Tente de novo.', http: 504 };
    }
    console.error('Falha na consulta de CNPJ:', err.message);
    return { erro: 'Não foi possível consultar o CNPJ agora', http: 502 };
  }
};

module.exports = { consultarCnpj, validarCnpj, formatarCnpj, somenteDigitos, provedorAtivo };
