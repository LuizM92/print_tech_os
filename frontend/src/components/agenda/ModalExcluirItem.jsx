import React, { useState } from 'react';
import Modal, { ConfirmModal } from '../shared/Modal';
import { fmtDiaISO } from '../../utils/format';

const ESCOPOS = [
  { valor: 'esta', rotulo: 'Só este evento', descricao: (it) => `Apaga apenas o dia ${fmtDiaISO(it.data)}` },
  { valor: 'seguintes', rotulo: 'Este e os seguintes', descricao: () => 'Encerra a repetição a partir deste dia' },
  { valor: 'todos', rotulo: 'Todos os eventos', descricao: () => 'Apaga a série inteira, inclusive o que já passou' },
];

/**
 * Confirmação de exclusão. Item único pergunta sim ou não; evento que se repete pergunta
 * também quanto da série apagar.
 */
export default function ModalExcluirItem({ item, onClose, onConfirmar }) {
  const [escopo, setEscopo] = useState('esta');

  if (item.repete === 'nao') {
    return (
      <ConfirmModal
        isOpen
        onClose={onClose}
        onConfirm={() => onConfirmar('todos')}
        title={item.tipo === 'tarefa' ? 'Excluir esta tarefa?' : 'Excluir este evento?'}
        message={item.titulo}
      />
    );
  }

  return (
    <Modal isOpen onClose={onClose} title="Excluir evento que se repete">
      <p style={{ color: 'var(--text-secondary)', fontSize: 13.5, marginBottom: 16 }}>{item.titulo}</p>
      <div className="ag-escopos">
        {ESCOPOS.map((e) => (
          <label key={e.valor} className={`ag-escopo ${escopo === e.valor ? 'ativo' : ''}`}>
            <input type="radio" name="escopo" checked={escopo === e.valor} onChange={() => setEscopo(e.valor)} />
            <span>
              <strong>{e.rotulo}</strong>
              <small>{e.descricao(item)}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn btn-danger" onClick={() => onConfirmar(escopo)}>Excluir</button>
      </div>
    </Modal>
  );
}
