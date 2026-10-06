import React, { useMemo } from 'react';
import Icon from '../shared/Icon';
import {
  DIAS_SEMANA, diaDaSemana, diaDoMes, intervalo, noDia, corDoItem, rotuloHorario, rotuloRepeticao, CAMADAS,
} from '../../utils/agenda';

/**
 * O mês em lista, dia a dia, só com os dias que têm algo marcado. É a visão do celular:
 * a grade do mês fica apertada em tela estreita, e aqui cada item tem a linha toda.
 */
export default function VisaoLista({ de, ate, hoje, itens, onNovo, onAbrir, onAlternarTarefa }) {
  const grupos = useMemo(
    () => intervalo(de, ate)
      .map((dia) => ({ dia, itens: itens.filter((it) => noDia(it, dia)) }))
      .filter((g) => g.itens.length > 0),
    [de, ate, itens],
  );

  if (grupos.length === 0) {
    return (
      <div className="ag-vazio">
        <Icon name="agenda" />
        <p>Nada marcado neste período.</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onNovo(hoje > ate || hoje < de ? de : hoje)}>
          Criar um evento
        </button>
      </div>
    );
  }

  return (
    <div className="ag-lista">
      {grupos.map(({ dia, itens: doDia }) => (
        <div key={dia} className="ag-lista-grupo">
          <div className={`ag-lista-data ${dia === hoje ? 'hoje' : ''}`}>
            <strong>{diaDoMes(dia)}</strong>
            <span>{DIAS_SEMANA[diaDaSemana(dia)]}</span>
          </div>
          <div className="ag-lista-itens">
            {doDia.map((it) => {
              const repete = rotuloRepeticao(it);
              return (
                <div
                  key={it.chave}
                  role="button"
                  tabIndex={0}
                  className={`ag-lista-item ${it.concluida ? 'feita' : ''}`}
                  onClick={() => onAbrir(it)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onAbrir(it); }}
                >
                  <span className="ag-lista-hora">{it.tipo === 'camada' ? 'Sistema' : rotuloHorario(it)}</span>
                  {it.tipo === 'tarefa' ? (
                    <button
                      type="button"
                      className="ag-chip-check"
                      style={{ '--ag-cor': corDoItem(it) }}
                      aria-label={it.concluida ? 'Marcar como pendente' : 'Marcar como concluída'}
                      aria-pressed={!!it.concluida}
                      onClick={(e) => { e.stopPropagation(); onAlternarTarefa(it); }}
                    >
                      {it.concluida && <Icon name="check" />}
                    </button>
                  ) : (
                    <span className="ag-ponto" style={{ background: corDoItem(it) }} />
                  )}
                  <span className="ag-lista-texto">
                    <strong>{it.titulo}</strong>
                    <small>
                      {it.tipo === 'camada' && CAMADAS[it.camada].rotulo}
                      {it.lugar && <>{it.lugar}</>}
                      {repete && <>{it.lugar ? ' · ' : ''}{repete}</>}
                    </small>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
