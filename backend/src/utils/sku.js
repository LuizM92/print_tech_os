/**
 * Padrão de SKU dos produtos de fabricação (ver PADRAO-SKU.md na raiz).
 *
 *   SKU pai       CAT-MODELO
 *   SKU variação  CAT-MODELO-MAT-VAR-TAM
 *
 * O SKU é sempre derivado dos blocos — nunca digitado à mão. Assim o cadastro não
 * consegue gravar um código fora do padrão, e a quebra por posição continua valendo.
 */

const CATEGORIAS = [
  { codigo: 'BON', rotulo: 'Boneco / figure action / colecionável' },
  { codigo: 'COR', rotulo: 'Cortador e marcador de biscoito' },
  { codigo: 'VAS', rotulo: 'Vaso / cachepô / vasinho' },
  { codigo: 'DEC', rotulo: 'Decoração e enfeite' },
  { codigo: 'ORG', rotulo: 'Organizador' },
  { codigo: 'SUP', rotulo: 'Suporte / dock' },
  { codigo: 'CHV', rotulo: 'Chaveiro' },
  { codigo: 'BRQ', rotulo: 'Brinquedo / jogo' },
  { codigo: 'IMP', rotulo: 'Impressora 3D e acessórios' },
  { codigo: 'ELE', rotulo: 'Elétrica' },
  { codigo: 'AUT', rotulo: 'Automotivo / moto' },
  { codigo: 'FER', rotulo: 'Ferramenta' },
  { codigo: 'PEC', rotulo: 'Peça técnica / funcional' },
];

const MATERIAIS = [
  { codigo: 'PLA', rotulo: 'PLA' },
  { codigo: 'PET', rotulo: 'PETG' },
  { codigo: 'TPU', rotulo: 'TPU (flexível)' },
  { codigo: 'ABS', rotulo: 'ABS' },
];

const CORES = [
  { codigo: 'PRT', rotulo: 'Preto' },
  { codigo: 'BRC', rotulo: 'Branco' },
  { codigo: 'CNZ', rotulo: 'Cinza' },
  { codigo: 'CNE', rotulo: 'Cinza escuro' },
  { codigo: 'CNC', rotulo: 'Cinza claro' },
  { codigo: 'VRM', rotulo: 'Vermelho' },
  { codigo: 'VNE', rotulo: 'Vermelho neon' },
  { codigo: 'ESC', rotulo: 'Vermelho escarlete' },
  { codigo: 'AZL', rotulo: 'Azul' },
  { codigo: 'AZC', rotulo: 'Azul claro' },
  { codigo: 'AZT', rotulo: 'Azul transformado' },
  { codigo: 'VRD', rotulo: 'Verde' },
  { codigo: 'VDE', rotulo: 'Verde escuro' },
  { codigo: 'TIF', rotulo: 'Verde tiffany' },
  { codigo: 'AMR', rotulo: 'Amarelo' },
  { codigo: 'LRJ', rotulo: 'Laranja' },
  { codigo: 'RSA', rotulo: 'Rosa bebê' },
  { codigo: 'ROX', rotulo: 'Roxo' },
  { codigo: 'MRR', rotulo: 'Marrom' },
  { codigo: 'BEG', rotulo: 'Bege' },
  { codigo: 'DRD', rotulo: 'Dourado' },
  { codigo: 'MIS', rotulo: 'Misteriosa (surpresa)' },
];

const CODIGOS_CATEGORIA = CATEGORIAS.map((c) => c.codigo);
const CODIGOS_MATERIAL = MATERIAIS.map((m) => m.codigo);

/**
 * Deixa o texto no formato de bloco: sem acento, maiúsculo, só A-Z e 0-9.
 * 'Pá de Lixo' vira 'PADELIXO'.
 */
const normalizarBloco = (valor) =>
  String(valor == null ? '' : valor)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/ç/g, 'c')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

/** Bloco de quantidade sai sempre com 2 dígitos: '2' vira '02'. Texto passa direto. */
const normalizarTamanho = (valor) => {
  const bloco = normalizarBloco(valor) || 'U';
  return /^\d$/.test(bloco) ? `0${bloco}` : bloco;
};

const montarSkuPai = ({ categoria, modelo }) =>
  `${normalizarBloco(categoria)}-${normalizarBloco(modelo)}`;

const montarSku = ({ categoria, modelo, material, variacao, tamanho }) =>
  [
    normalizarBloco(categoria),
    normalizarBloco(modelo),
    normalizarBloco(material),
    normalizarBloco(variacao) || 'STD',
    normalizarTamanho(tamanho),
  ].join('-');

/** Quebra um SKU de variação nos 5 blocos. Devolve null se não estiver no padrão. */
const desmontarSku = (sku) => {
  const partes = String(sku || '').split('-');
  if (partes.length !== 5) return null;
  if (partes.some((p) => !/^[A-Z0-9]+$/.test(p))) return null;
  const [categoria, modelo, material, variacao, tamanho] = partes;
  return { categoria, modelo, material, variacao, tamanho };
};

/** Mensagem de erro dos blocos do pai, ou null quando está tudo certo. */
const validarPai = ({ categoria, modelo }) => {
  if (!CODIGOS_CATEGORIA.includes(normalizarBloco(categoria))) return 'Escolha uma categoria válida';
  const bloco = normalizarBloco(modelo);
  if (bloco.length < 3 || bloco.length > 12) return 'O modelo deve ter de 3 a 12 caracteres (A-Z e 0-9)';
  return null;
};

/** Mensagem de erro dos blocos da variação, ou null quando está tudo certo. */
const validarVariacao = ({ material, variacao, tamanho }) => {
  if (!CODIGOS_MATERIAL.includes(normalizarBloco(material))) return 'Escolha um material válido';
  if ((normalizarBloco(variacao) || 'STD').length > 8) return 'A variação deve ter até 8 caracteres (A-Z e 0-9)';
  if (normalizarTamanho(tamanho).length > 4) return 'O tamanho deve ter até 4 caracteres (A-Z e 0-9)';
  return null;
};

module.exports = {
  CATEGORIAS, MATERIAIS, CORES, CODIGOS_CATEGORIA, CODIGOS_MATERIAL,
  normalizarBloco, normalizarTamanho, montarSkuPai, montarSku, desmontarSku,
  validarPai, validarVariacao,
};
