import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { fmtMoeda, fmtData, badgeClass, rotuloStatus } from '../utils/format';

export default function Dashboard() {
  const [resumo, setResumo] = useState(null);
  const { usuario } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // As somas vêm agregadas do banco — antes o dashboard baixava a tabela inteira
    // de orçamentos só para contar quatro números.
    api.get('/orcamentos/resumo')
      .then((res) => setResumo(res.data))
      .catch((err) => console.error(err));
  }, []);

  const cards = [
    { rotulo: 'Impressão', valor: resumo?.impressao ?? 0, classe: 'accent' },
    { rotulo: 'Vendas', valor: resumo?.venda ?? 0, classe: 'accent' },
    { rotulo: 'Aprovados', valor: resumo?.aprovados ?? 0, classe: 'success' },
    { rotulo: 'Clientes', valor: resumo?.clientes ?? 0, classe: '' },
    {
      rotulo: 'Volume Aprovado',
      valor: fmtMoeda(resumo?.volume_aprovado),
      classe: '',
      pequeno: true,
      detalhe: resumo && (parseFloat(resumo.volume_impressao) > 0 || parseFloat(resumo.volume_venda) > 0)
        ? `Impressão ${fmtMoeda(resumo.volume_impressao)} · Venda ${fmtMoeda(resumo.volume_venda)}`
        : null,
    },
  ];

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>
          Bem-vindo, <strong>{usuario?.nome}</strong> —{' '}
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="page-content">
        <div className="stats-grid">
          {cards.map((c) => (
            <div className="stat-card" key={c.rotulo}>
              <div className="stat-label">{c.rotulo}</div>
              <div className={`stat-value ${c.classe}`} style={c.pequeno ? { fontSize: 18 } : undefined}>
                {c.valor}
              </div>
              {c.detalhe && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{c.detalhe}</div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Orçamentos Recentes</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orcamentos')}>Ver todos</button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nº Orçamento</th>
                  <th>Nº OS / Pedido</th>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th>Total Geral</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {!resumo?.recentes?.length ? (
                  <tr><td colSpan={7}><div className="empty-state"><p>Nenhum orçamento ainda</p></div></td></tr>
                ) : resumo.recentes.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/orcamentos/${o.id}`)} style={{ cursor: 'pointer' }}>
                    <td><span className="font-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{o.numero_orcamento}</span></td>
                    <td>
                      {o.numero_aprovado
                        ? <span className="font-mono" style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>{o.numero_aprovado}</span>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>{o.cliente_nome}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{o.qtd_itens}</td>
                    <td className="text-success fw-bold">{fmtMoeda(o.total_geral)}</td>
                    <td><span className={`badge ${badgeClass(o.status)}`}>{rotuloStatus(o.status)}</span></td>
                    <td>{fmtData(o.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
