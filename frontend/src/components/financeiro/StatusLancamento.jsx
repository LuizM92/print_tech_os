import React from 'react';
import { rotuloSituacao } from '../../utils/format';

/** O selo da situação da conta, mais o "Parcial" quando já entrou algum dinheiro. */
export default function StatusLancamento({ situacao }) {
  return (
    <span className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
      <span className={`badge badge-sit-${situacao.codigo}`}>{rotuloSituacao(situacao)}</span>
      {situacao.parcial && <span className="badge badge-parcial">Parcial</span>}
    </span>
  );
}
