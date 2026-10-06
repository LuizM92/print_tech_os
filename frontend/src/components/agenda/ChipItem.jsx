import React from 'react';
import Icon from '../shared/Icon';
import { CAMADAS, corDoItem, rgba, fmtHora } from '../../utils/agenda';

/**
 * Um item da agenda como uma pílula: evento, tarefa (com a caixinha de concluir) ou camada
 * do sistema (entrega de OS, vencimentos). Serve ao mês, à faixa "dia inteiro" e à grade;
 * `bloco` é a variante que ocupa a altura toda do horário na grade.
 */
export default function ChipItem({ item, bloco = false, onAbrir, onAlternarTarefa, estilo }) {
  const cor = corDoItem(item);
  const tarefa = item.tipo === 'tarefa';
  const camada = item.tipo === 'camada';

  const classes = ['ag-chip', bloco && 'bloco', camada && 'camada', item.concluida && 'feita']
    .filter(Boolean).join(' ');

  const abrir = (e) => { e.stopPropagation(); onAbrir(item); };
  const aoTeclar = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(e); }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={classes}
      style={{ '--ag-cor': cor, '--ag-fundo': rgba(cor, camada ? 0.1 : 0.2), ...estilo }}
      onClick={abrir}
      onKeyDown={aoTeclar}
      title={item.titulo}
    >
      {tarefa && (
        <button
          type="button"
          className="ag-chip-check"
          aria-label={item.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
          aria-pressed={!!item.concluida}
          onClick={(e) => { e.stopPropagation(); onAlternarTarefa(item); }}
        >
          {item.concluida && <Icon name="check" />}
        </button>
      )}
      {camada && <Icon name={CAMADAS[item.camada].icone} />}
      {!item.dia_inteiro && !bloco && <span className="ag-chip-hora">{fmtHora(item.hora_inicio)}</span>}
      <span className="ag-chip-titulo">{item.titulo}</span>
      {bloco && !item.dia_inteiro && (
        <span className="ag-chip-horario">
          {fmtHora(item.hora_inicio)}{item.hora_fim && item.data === item.data_fim ? ` – ${fmtHora(item.hora_fim)}` : ''}
        </span>
      )}
    </div>
  );
}
