import React from 'react';
import Modal from '../shared/Modal';
import Icon from '../shared/Icon';
import {
  CAMADAS, corDoItem, fmtDiaLongo, rotuloQuando, rotuloRepeticao, rotuloLembrete,
} from '../../utils/agenda';

/** Os detalhes de um item, com o que dá para fazer com ele (editar, excluir, concluir, abrir a origem). */
export default function ModalDetalheItem({
  item, anoAtual, onClose, onEditar, onExcluir, onAlternarTarefa, onAbrirOrigem,
}) {
  const camada = item.tipo === 'camada';
  const tarefa = item.tipo === 'tarefa';
  const repete = rotuloRepeticao(item);

  let destino = null;
  if (item.para_todos) destino = 'Lembretes para todos';
  else if (item.responsavel_nome) destino = `Lembretes para ${item.responsavel_nome}`;
  else if (item.criador_nome) destino = `Lembretes para ${item.criador_nome}`;

  const linhas = [
    { icone: 'relogio', texto: camada ? fmtDiaLongo(item.data, anoAtual) : rotuloQuando(item, anoAtual) },
    repete && { icone: 'repetir', texto: repete },
    item.lugar && { icone: 'local', texto: item.lugar },
    !camada && item.lembretes.length > 0 && {
      icone: 'sino',
      texto: item.lembretes.map((m) => rotuloLembrete(m, item.dia_inteiro)).join(' · '),
    },
    !camada && destino && { icone: 'clients', texto: item.privado ? 'Privado — só você vê' : destino },
  ].filter(Boolean);

  return (
    <Modal isOpen onClose={onClose} title={camada ? CAMADAS[item.camada].rotulo : (tarefa ? 'Tarefa' : 'Evento')}>
      <div className="ag-detalhe" style={{ '--ag-cor': corDoItem(item) }}>
        <h3 className={item.concluida ? 'feita' : ''}>{item.titulo}</h3>
        <ul>
          {linhas.map((l) => (
            <li key={l.icone}><Icon name={l.icone} /><span>{l.texto}</span></li>
          ))}
        </ul>
        {item.descricao && <p className="ag-detalhe-descricao">{item.descricao}</p>}
        {!camada && item.criador_nome && <small>Criado por {item.criador_nome}</small>}
      </div>

      <div className="form-actions">
        {camada && (
          <button type="button" className="btn btn-primary" onClick={() => onAbrirOrigem(item)}>Abrir</button>
        )}
        {!camada && item.pode_editar && (
          <button type="button" className="btn btn-danger" onClick={() => onExcluir(item)}>Excluir</button>
        )}
        {!camada && item.pode_editar && (
          <button type="button" className="btn btn-ghost" onClick={() => onEditar(item)}>Editar</button>
        )}
        {tarefa && (
          <button type="button" className={`btn ${item.concluida ? 'btn-ghost' : 'btn-success'}`} onClick={() => onAlternarTarefa(item)}>
            {item.concluida ? 'Reabrir tarefa' : 'Concluir'}
          </button>
        )}
      </div>
    </Modal>
  );
}
