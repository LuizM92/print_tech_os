/** Utilitários que todo adaptador usa ao traduzir a leitura e validar comandos. */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const arred = (v, casas = 1) => (v === null ? null : Math.round(v * 10 ** casas) / 10 ** casas);

/** Valor de comando dentro da faixa, ou erro de validação (vira 400, não 502). */
const faixa = (valor, min, max, oQue) => {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < min || n > max) throw erroValidacao(`${oQue} deve estar entre ${min} e ${max}`);
  return Math.round(n);
};

function erroValidacao(mensagem) {
  const erro = new Error(mensagem);
  erro.validacao = true;
  return erro;
}

module.exports = { num, arred, faixa, erroValidacao };
