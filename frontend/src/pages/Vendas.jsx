import React from 'react';
import { ListaOrcamentos } from './Orcamentos';

/** Mesma listagem dos orçamentos de impressão, filtrada nos de venda de produtos. */
export default function Vendas() {
  return <ListaOrcamentos tipo="produto" />;
}
