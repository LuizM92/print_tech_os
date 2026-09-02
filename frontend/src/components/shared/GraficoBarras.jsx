import React, { useState } from 'react';
import { fmtMoeda } from '../../utils/format';

/**
 * Gráfico de barras em SVG puro — sem biblioteca, sem peso extra no carregamento.
 *
 * Cada barra é o valor orçado no período; a parte sólida embaixo é o que foi aprovado.
 * Lendo de baixo para cima você vê quanto do que foi orçado virou trabalho fechado.
 *
 * O SVG usa `preserveAspectRatio="none"` para as barras acompanharem a largura do
 * container — o que estica tudo na horizontal. Por isso **nada de texto dentro dele**:
 * os rótulos são HTML posicionado por cima, com a mesma matemática das colunas.
 */

const ALTURA = 170;
const TOPO = 12;              // respiro para a barra não encostar no topo
const LARGURA_MAX_SLOT = 12;  // em % — impede que 1 ou 2 períodos virem barras gigantes

/** "2026-09" → "set/26" · "2026-09-15" → "15/09" */
const rotularPeriodo = (periodo, escala) => {
  if (escala === 'dia') {
    const [, mes, dia] = periodo.split('-');
    return `${dia}/${mes}`;
  }
  const [ano, mes] = periodo.split('-');
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[parseInt(mes, 10) - 1]}/${ano.slice(2)}`;
};

export default function GraficoBarras({ serie = [], escala = 'mes' }) {
  const [ativo, setAtivo] = useState(null);

  if (serie.length === 0) {
    return (
      <div style={{
        height: ALTURA, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-muted)', fontSize: 13,
      }}>
        Nenhum orçamento no período selecionado
      </div>
    );
  }

  const maximo = Math.max(...serie.map((p) => p.valor || 0), 1);
  const alturaUtil = ALTURA - TOPO;

  // Poucos períodos ficam centralizados em vez de esticados de ponta a ponta.
  const slot = Math.min(100 / serie.length, LARGURA_MAX_SLOT);
  const margem = (100 - slot * serie.length) / 2;
  const larguraBarra = slot * 0.6;

  // Com muitas colunas o eixo vira borrão — mostra um rótulo a cada N.
  const passo = Math.ceil(serie.length / 14);

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 100 ${ALTURA}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: ALTURA, display: 'block' }}
          role="img"
          aria-label="Evolução dos orçamentos no período"
        >
          {[0, 0.5, 1].map((f) => (
            <line
              key={f}
              x1="0" x2="100"
              y1={TOPO + alturaUtil * (1 - f)} y2={TOPO + alturaUtil * (1 - f)}
              stroke="var(--border)" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
          ))}

          {serie.map((ponto, i) => {
            const alturaTotal = (ponto.valor / maximo) * alturaUtil;
            const alturaAprovado = (ponto.valor_aprovado / maximo) * alturaUtil;
            const x = margem + i * slot;
            const xBarra = x + (slot - larguraBarra) / 2;
            const destacado = ativo === i;

            return (
              <g key={ponto.periodo} onMouseEnter={() => setAtivo(i)} onMouseLeave={() => setAtivo(null)}>
                {/* Área invisível: o cursor pega a coluna inteira, não só a barra */}
                <rect x={x} y={0} width={slot} height={ALTURA} fill="transparent" />
                <rect
                  x={xBarra} y={TOPO + alturaUtil - alturaTotal}
                  width={larguraBarra} height={Math.max(alturaTotal, ponto.valor > 0 ? 1.5 : 0)}
                  fill="var(--accent)" opacity={destacado ? 0.6 : 0.32}
                />
                <rect
                  x={xBarra} y={TOPO + alturaUtil - alturaAprovado}
                  width={larguraBarra} height={Math.max(alturaAprovado, ponto.valor_aprovado > 0 ? 1.5 : 0)}
                  fill="var(--success)" opacity={destacado ? 1 : 0.85}
                />
              </g>
            );
          })}
        </svg>

        {/* Rótulos do eixo em HTML — dentro do SVG sairiam esticados. */}
        <div style={{ position: 'relative', height: 16, marginTop: 4 }}>
          {serie.map((ponto, i) => (
            (i % passo === 0 || ativo === i) && (
              <span
                key={ponto.periodo}
                style={{
                  position: 'absolute',
                  left: `${margem + i * slot}%`,
                  width: `${slot}%`,
                  textAlign: 'center',
                  fontSize: 10,
                  color: ativo === i ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontWeight: ativo === i ? 600 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {rotularPeriodo(ponto.periodo, escala)}
              </span>
            )
          ))}
        </div>
      </div>

      <div style={{ minHeight: 20, marginTop: 8, fontSize: 12 }}>
        {ativo !== null ? (
          <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
            <strong>{rotularPeriodo(serie[ativo].periodo, escala)}</strong>
            <span style={{ color: 'var(--text-secondary)' }}>{serie[ativo].qtd} orçamento(s)</span>
            <span style={{ color: 'var(--accent)' }}>Orçado {fmtMoeda(serie[ativo].valor)}</span>
            <span style={{ color: 'var(--success)' }}>Aprovado {fmtMoeda(serie[ativo].valor_aprovado)}</span>
          </div>
        ) : (
          <div className="flex items-center gap-3" style={{ color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', opacity: 0.4, display: 'inline-block' }} />
              Orçado
            </span>
            <span className="flex items-center gap-2">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--success)', display: 'inline-block' }} />
              Aprovado
            </span>
            <span>· passe o mouse nas barras para ver o detalhe</span>
          </div>
        )}
      </div>
    </div>
  );
}
