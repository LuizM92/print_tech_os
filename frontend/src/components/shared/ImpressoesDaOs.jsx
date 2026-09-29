import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { fmtDataHora, fmtHoras } from '../../utils/format';

const RESULTADO = {
  andamento: { rotulo: 'Imprimindo', cor: 'var(--accent)' },
  concluida: { rotulo: 'Concluída', cor: 'var(--success)' },
  cancelada: { rotulo: 'Cancelada', cor: 'var(--warning)' },
  erro: { rotulo: 'Erro', cor: 'var(--danger)' },
  interrompida: { rotulo: 'Interrompida', cor: 'var(--danger)' },
};

/**
 * As impressões que a farm registrou para esta OS, com o tempo real de máquina contra
 * as horas orçadas. Só conta como "real" o que concluiu: cancelada, erro e interrompida
 * aparecem à parte, porque consumiram máquina sem entregar peça.
 */
export default function ImpressoesDaOs({ orcamentoId, horasOrcadas, tituloCard }) {
  const [lista, setLista] = useState(null);

  useEffect(() => {
    api.get(`/producao/${orcamentoId}/impressoes`)
      .then(({ data }) => setLista(data))
      .catch(() => setLista([]));
  }, [orcamentoId]);

  if (!lista || lista.length === 0) return null;

  const soma = (resultados) => lista
    .filter((i) => resultados.includes(i.resultado))
    .reduce((s, i) => s + (i.duracao_s || 0), 0) / 3600;
  const real = soma(['concluida']);
  const perdido = soma(['cancelada', 'erro', 'interrompida']);
  const diferenca = horasOrcadas > 0 ? ((real - horasOrcadas) / horasOrcadas) * 100 : null;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3 style={tituloCard}>Impressões</h3>
      <div className="flex gap-4" style={{ flexWrap: 'wrap', fontSize: 13, marginBottom: 12 }}>
        <span>Orçado <strong>{fmtHoras(horasOrcadas)}</strong></span>
        <span>
          Real (concluídas) <strong>{fmtHoras(real)}</strong>
          {diferenca !== null && real > 0 && (
            <span style={{ color: diferenca > 10 ? 'var(--danger)' : 'var(--text-muted)', marginLeft: 6 }}>
              ({diferenca > 0 ? '+' : ''}{Math.round(diferenca)}%)
            </span>
          )}
        </span>
        {perdido > 0 && <span style={{ color: 'var(--warning)' }}>Perdido em falhas <strong>{fmtHoras(perdido)}</strong></span>}
      </div>
      <div className="table-wrapper">
        <table>
          <thead><tr><th>Início</th><th>Impressora</th><th>Arquivo</th><th>Duração</th><th>Resultado</th></tr></thead>
          <tbody>
            {lista.map((i) => {
              const r = RESULTADO[i.resultado] || { rotulo: i.resultado, cor: 'var(--text-muted)' };
              return (
                <tr key={i.id}>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDataHora(i.iniciada_em)}</td>
                  <td>{i.impressora}</td>
                  <td style={{ fontSize: 12, wordBreak: 'break-word' }}>
                    {i.arquivo.split('/').pop()}
                    {i.vinculo === 'manual' && <span style={{ color: 'var(--text-muted)' }}> · vinculada à mão</span>}
                  </td>
                  <td className="font-mono" style={{ fontSize: 12 }}>{fmtHoras((i.duracao_s || 0) / 3600)}</td>
                  <td style={{ color: r.cor, fontWeight: 600, fontSize: 12 }}>{r.rotulo}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
