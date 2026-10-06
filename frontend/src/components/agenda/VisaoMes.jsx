import React, { useMemo } from 'react';
import ChipItem from './ChipItem';
import { DIAS_SEMANA, semanasDoMes, noDia, diaDoMes, mesmoMes } from '../../utils/agenda';

// Quantos itens cabem numa célula antes do "+N mais". Em tela estreita sobram pontos.
const MAX_POR_DIA = 3;

/** O mês em grade. Clicar num dia vazio cria um item nele; clicar no número abre o dia. */
export default function VisaoMes({ foco, hoje, itens, onNovo, onAbrir, onVerDia, onAlternarTarefa }) {
  const semanas = useMemo(() => semanasDoMes(foco), [foco]);

  const porDia = useMemo(() => {
    const mapa = {};
    semanas.flat().forEach((dia) => { mapa[dia] = itens.filter((it) => noDia(it, dia)); });
    return mapa;
  }, [semanas, itens]);

  return (
    <div className="ag-mes">
      <div className="ag-mes-semana ag-mes-cabecalho">
        {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
      </div>
      {semanas.map((semana) => (
        <div key={semana[0]} className="ag-mes-semana">
          {semana.map((dia) => {
            const lista = porDia[dia];
            const visiveis = lista.slice(0, MAX_POR_DIA);
            const resto = lista.length - visiveis.length;
            const classes = ['ag-dia', dia === hoje && 'hoje', !mesmoMes(dia, foco) && 'fora'].filter(Boolean).join(' ');
            return (
              <div key={dia} className={classes} onClick={() => onNovo(dia)}>
                <button
                  type="button"
                  className="ag-dia-num"
                  onClick={(e) => { e.stopPropagation(); onVerDia(dia); }}
                  aria-label={`Abrir o dia ${diaDoMes(dia)}`}
                >
                  {diaDoMes(dia)}
                </button>
                <div className="ag-dia-itens">
                  {visiveis.map((it) => (
                    <ChipItem key={it.chave} item={it} onAbrir={onAbrir} onAlternarTarefa={onAlternarTarefa} />
                  ))}
                  {resto > 0 && (
                    <button
                      type="button"
                      className="ag-mais"
                      onClick={(e) => { e.stopPropagation(); onVerDia(dia); }}
                    >
                      +{resto} mais
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
