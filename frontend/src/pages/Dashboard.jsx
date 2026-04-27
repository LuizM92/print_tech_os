import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const fmtMoeda = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR');

export default function Dashboard() {
  const [stats, setStats] = useState({ orcamentos: 0, clientes: 0, aprovados: 0, totalGeral: 0 });
  const [recentes, setRecentes] = useState([]);
  const { usuario } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const [orc, cli] = await Promise.all([
          api.get('/orcamentos'),
          api.get('/clientes'),
        ]);
        const orcamentos = orc.data;
        const aprovados = orcamentos.filter(o => o.status === 'aprovado');
        const total = orcamentos.reduce((acc, o) => acc + parseFloat(o.total_geral || 0), 0);
        setStats({ orcamentos: orcamentos.length, clientes: cli.data.length, aprovados: aprovados.length, totalGeral: total });
        setRecentes(orcamentos.slice(0, 8));
      } catch (err) {
        console.error(err);
      }
    };
    load();
  }, []);

  const badgeClass = (status) => ({ rascunho: 'badge-rascunho', aprovado: 'badge-aprovado', reprovado: 'badge-reprovado', cancelado: 'badge-cancelado' }[status] || 'badge-rascunho');

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>Bem-vindo, <strong>{usuario?.nome}</strong> — {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>

      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Total Orçamentos</div>
            <div className="stat-value accent">{stats.orcamentos}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Clientes</div>
            <div className="stat-value">{stats.clientes}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Aprovados</div>
            <div className="stat-value success">{stats.aprovados}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Volume Total</div>
            <div className="stat-value" style={{ fontSize: 18 }}>{fmtMoeda(stats.totalGeral)}</div>
          </div>
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
                  <th>Nº OS</th>
                  <th>Cliente</th>
                  <th>Material</th>
                  <th>Total Geral</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {recentes.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><p>Nenhum orçamento ainda</p></div></td></tr>
                ) : recentes.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/orcamentos/${o.id}`)} style={{ cursor: 'pointer' }}>
                    <td><span className="font-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{o.numero_os}</span></td>
                    <td>{o.cliente_nome}</td>
                    <td>{o.material_nome}</td>
                    <td className="text-success fw-bold">{fmtMoeda(o.total_geral)}</td>
                    <td><span className={`badge ${badgeClass(o.status)}`}>{o.status}</span></td>
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
