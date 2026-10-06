import React, { useEffect, useMemo, useRef } from 'react';
import ChipItem from './ChipItem';
import {
  DIAS_SEMANA, diaDaSemana, diaDoMes, noDia, ehDiaInteiro, posicionar, minParaHora, horaParaMin, corDoItem,
} from '../../utils/agenda';

// Altura de uma hora na grade; tudo (posição, altura, linha do agora) deriva dela.
const HORA_PX = 48;
const HORAS = Array.from({ length: 24 }, (_, h) => h);
// Ao abrir, a grade rola até a manhã (ou até perto de agora, se hoje está na tela).
const HORA_INICIAL = 7;

const colunas = (n) => ({ gridTemplateColumns: `56px repeat(${n}, minmax(0, 1fr))` });

/**
 * Semana e dia: uma coluna por dia, com a faixa "dia inteiro" no alto e as horas embaixo.
 * Clicar numa faixa de horário vazia cria um item naquele horário (de 30 em 30 minutos).
 */
export default function VisaoGrade({ dias, hoje, agora, itens, onNovo, onAbrir, onVerDia, onAlternarTarefa }) {
  const rolagem = useRef(null);
  const chaveDosDias = dias.join();

  const porDia = useMemo(() => {
    const mapa = {};
    dias.forEach((dia) => {
      const doDia = itens.filter((it) => noDia(it, dia));
      mapa[dia] = {
        inteiros: doDia.filter(ehDiaInteiro),
        posicionados: posicionar(doDia.filter((it) => !ehDiaInteiro(it)), dia),
      };
    });
    return mapa;
  }, [dias, itens]);

  // Só ao trocar de período: rolar a cada recarga tiraria o usuário de onde ele estava.
  useEffect(() => {
    if (!rolagem.current) return;
    const hora = dias.includes(hoje) ? Math.max(0, Math.floor(horaParaMin(agora) / 60) - 2) : HORA_INICIAL;
    rolagem.current.scrollTop = hora * HORA_PX;
  }, [chaveDosDias]);

  const clicarNaColuna = (dia) => (e) => {
    const topo = e.currentTarget.getBoundingClientRect().top;
    const meiaHora = Math.floor(((e.clientY - topo) / HORA_PX) * 2);
    onNovo(dia, minParaHora(Math.min(meiaHora * 30, 23 * 60 + 30)), false);
  };

  return (
    <div className={`ag-grade ${dias.length > 1 ? 'larga' : ''}`}>
      <div className="ag-grade-linha ag-grade-topo" style={colunas(dias.length)}>
        <div />
        {dias.map((dia) => (
          <button key={dia} type="button" className={`ag-grade-dia ${dia === hoje ? 'hoje' : ''}`} onClick={() => onVerDia(dia)}>
            <span>{DIAS_SEMANA[diaDaSemana(dia)]}</span>
            <strong>{diaDoMes(dia)}</strong>
          </button>
        ))}
      </div>

      <div className="ag-grade-linha ag-grade-inteiro" style={colunas(dias.length)}>
        <div className="ag-horas-rotulo">dia todo</div>
        {dias.map((dia) => (
          <div key={dia} className="ag-celula-inteiro" onClick={() => onNovo(dia, null, true)}>
            {porDia[dia].inteiros.map((it) => (
              <ChipItem key={it.chave} item={it} onAbrir={onAbrir} onAlternarTarefa={onAlternarTarefa} />
            ))}
          </div>
        ))}
      </div>

      <div className="ag-grade-rolagem" ref={rolagem}>
        <div className="ag-grade-corpo" style={{ ...colunas(dias.length), height: 24 * HORA_PX }}>
          <div className="ag-horas">
            {HORAS.slice(1).map((h) => (
              <span key={h} style={{ top: h * HORA_PX }}>{String(h).padStart(2, '0')}:00</span>
            ))}
          </div>
          {dias.map((dia) => (
            <div key={dia} className="ag-coluna" onClick={clicarNaColuna(dia)}>
              {porDia[dia].posicionados.map(({ item, ini, fim, coluna, colunas: total }) => (
                <ChipItem
                  key={item.chave}
                  item={item}
                  bloco
                  onAbrir={onAbrir}
                  onAlternarTarefa={onAlternarTarefa}
                  estilo={{
                    top: (ini / 60) * HORA_PX,
                    height: ((fim - ini) / 60) * HORA_PX - 2,
                    left: `calc(${(coluna / total) * 100}% + 1px)`,
                    width: `calc(${100 / total}% - 4px)`,
                    '--ag-cor': corDoItem(item),
                  }}
                />
              ))}
              {dia === hoje && <div className="ag-agora" style={{ top: (horaParaMin(agora) / 60) * HORA_PX }} />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
