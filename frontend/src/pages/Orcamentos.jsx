import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

const fmtMoeda = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR');
const badgeClass = (s) => ({ rascunho:'badge-rascunho', aprovado:'badge-aprovado', reprovado:'badge-reprovado', cancelado:'badge-cancelado' }[s] || '');

export default function Orcamentos() {
  const [orcamentos, setOrcamentos] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/orcamentos').then(res => setOrcamentos(res.data));
  }, []);

  const filtrados = orcamentos.filter(o => {
    const matchBusca = o.numero_os.toLowerCase().includes(busca.toLowerCase()) || o.cliente_nome.toLowerCase().includes(busca.toLowerCase());
    const matchStatus = !filtroStatus || o.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  return (
    <>
      <div className="page-header">
        <h2>Orçamentos</h2>
        <p>Histórico de todas as Ordens de Serviço geradas</p>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div className="flex gap-3 items-center" style={{flex:1}}>
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor"/></svg>
                <input placeholder="Buscar por nº OS ou cliente..." value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{width:'auto',flex:'none'}}>
                <option value="">Todos os status</option>
                <option value="rascunho">Rascunho</option>
                <option value="aprovado">Aprovado</option>
                <option value="reprovado">Reprovado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => navigate('/orcamentos/novo')}>
              <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor"/></svg>
              Novo Orçamento
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nº OS</th><th>Cliente</th><th>Material</th><th>Qtd</th>
                  <th>Total Peças</th><th>Total Serv.</th><th>Total Geral</th>
                  <th>Status</th><th>Data</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={9}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor"/></svg>
                      <h3>Nenhum orçamento</h3>
                      <p>Crie o primeiro orçamento clicando em "Novo Orçamento"</p>
                    </div>
                  </td></tr>
                ) : filtrados.map(o => (
                  <tr key={o.id} onClick={() => navigate(`/orcamentos/${o.id}`)} style={{cursor:'pointer'}}>
                    <td><span className="font-mono" style={{fontSize:12,color:'var(--accent)'}}>{o.numero_os}</span></td>
                    <td>{o.cliente_nome}</td>
                    <td style={{color:'var(--text-muted)'}}>{o.material_nome}</td>
                    <td>{o.quantidade}</td>
                    <td>{fmtMoeda(o.total_peca)}</td>
                    <td>{fmtMoeda(o.total_servico)}</td>
                    <td className="text-success fw-bold">{fmtMoeda(o.total_geral)}</td>
                    <td><span className={`badge ${badgeClass(o.status)}`}>{o.status}</span></td>
                    <td style={{color:'var(--text-muted)',fontSize:12}}>{fmtData(o.criado_em)}</td>
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
