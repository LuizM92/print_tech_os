import { useState, useEffect } from 'react';

/**
 * useState que sobrevive ao reload: guarda o valor no localStorage sob a chave dada.
 * Sem storage (modo privado, cota cheia) ou com JSON inválido, segue com o padrão
 * e vale só nesta sessão — preferência de tela não justifica quebrar a página.
 */
export default function usePersistido(chave, padrao) {
  const [valor, setValor] = useState(() => {
    try {
      const bruto = localStorage.getItem(chave);
      return bruto === null ? padrao : JSON.parse(bruto);
    } catch {
      return padrao;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // sem storage: fica só em memória
    }
  }, [chave, valor]);

  return [valor, setValor];
}
