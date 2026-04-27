import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const fmtMoeda = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

const STATUS_OPTIONS = ['rascunho', 'aprovado', 'reprovado', 'cancelado'];

export default function DetalheOrcamento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [orc, setOrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/orcamentos/${id}`);
        setOrc(res.data);
      } catch { toast.error('Orçamento não encontrado'); navigate('/orcamentos'); }
      finally { setLoading(false); }
    };
    load();
  }, [id]);

  const handleStatus = async (status) => {
    try {
      await api.put(`/orcamentos/${id}`, { status });
      setOrc(prev => ({ ...prev, status }));
      toast.success('Status atualizado!');
    } catch { toast.error('Erro ao atualizar status'); }
  };

  const handlePDF = async () => {
    setPdfLoading(true);
    try {
      const res = await api.get(`/orcamentos/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `OS-${orc.numero_os}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('PDF gerado!');
    } catch { toast.error('Erro ao gerar PDF'); }
    finally { setPdfLoading(false); }
  };

  const badgeClass = (s) => ({ rascunho:'badge-rascunho', aprovado:'badge-aprovado', reprovado:'badge-reprovado', cancelado:'badge-cancelado' }[s] || '');

  if (loading) return <div className="loading-screen"><span className="spinner"/><span>Carregando...</span></div>;
  if (!orc) return null;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3" style={{marginBottom:4}}>
              <button className="btn-icon" onClick={() => navigate('/orcamentos')}>
                <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" stroke="currentColor"/></svg>
              </button>
              <h2 style={{margin:0}}>{orc.numero_os}</h2>
              <span className={`badge ${badgeClass(orc.status)}`}>{orc.status}</span>
            </div>
            <p>Criado em {fmtData(orc.criado_em)} por {orc.criado_por_nome}</p>
          </div>
          <button className="btn btn-primary" onClick={handlePDF} disabled={pdfLoading}>
            {pdfLoading ? <span className="spinner"/> : (
              <>
                <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor"/></svg>
                Baixar PDF
              </>
            )}
          </button>
        </div>
      </div>

      <div className="page-content">
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16}}>

          {/* Cliente */}
          <div className="card">
            <h3 style={{fontSize:12,fontWeight:700,marginBottom:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px'}}>Cliente</h3>
            <div style={{fontSize:16,fontWeight:700,marginBottom:4}}>{orc.cliente_nome}</div>
            <div style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.8}}>
              <div>{orc.rua}, {orc.numero}{orc.complemento ? ` - ${orc.complemento}` : ''}</div>
              <div>{orc.bairro} — {orc.cidade}/{orc.estado}</div>
              <div>CEP: {orc.cep}</div>
              <div style={{marginTop:4,color:'var(--text-muted)',fontFamily:'var(--font-mono)',fontSize:12}}>{orc.tipo_documento?.toUpperCase()}: {orc.cpf_cnpj}</div>
            </div>
          </div>

          {/* Detalhes da Peça */}
          <div className="card">
            <h3 style={{fontSize:12,fontWeight:700,marginBottom:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px'}}>Detalhes da Peça</h3>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px 20px',fontSize:13}}>
              {[
                ['Material', orc.material_nome],
                ['Tipo de Peça', orc.tipo_peca === 'tecnica' ? 'Técnica' : 'Decorativa'],
                ['Peso', `${parseFloat(orc.peso_gramas).toFixed(2)} g`],
                ['Horas de Impressão', `${parseFloat(orc.horas_impressao).toFixed(2)} h`],
                ['Custo/grama', `R$ ${parseFloat(orc.custo_por_grama).toFixed(4).replace('.', ',')}`],
                ['Hora-Máquina', fmtMoeda(orc.valor_hora_maquina) + '/h'],
                ['Quantidade', orc.quantidade],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.8px'}}>{l}</div>
                  <div style={{fontWeight:600,color:'var(--text-primary)'}}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Cálculo */}
        <div className="card" style={{marginBottom:16}}>
          <h3 style={{fontSize:12,fontWeight:700,marginBottom:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px'}}>Detalhamento do Cálculo</h3>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Componente</th><th>Fórmula</th><th>Valor</th></tr></thead>
              <tbody>
                <tr>
                  <td>Custo Material</td>
                  <td style={{color:'var(--text-muted)',fontSize:12,fontFamily:'var(--font-mono)'}}>
                    {parseFloat(orc.peso_gramas).toFixed(2)}g × R${parseFloat(orc.custo_por_grama).toFixed(4).replace('.',',')}
                  </td>
                  <td>{fmtMoeda(orc.custo_material)}</td>
                </tr>
                <tr>
                  <td>Custo Impressão</td>
                  <td style={{color:'var(--text-muted)',fontSize:12,fontFamily:'var(--font-mono)'}}>
                    {parseFloat(orc.horas_impressao).toFixed(2)}h × {fmtMoeda(orc.valor_hora_maquina)}
                  </td>
                  <td>{fmtMoeda(orc.custo_impressao)}</td>
                </tr>
                <tr>
                  <td><strong>Valor por Peça</strong></td>
                  <td style={{color:'var(--text-muted)',fontSize:12}}>Custo Material + Custo Impressão</td>
                  <td className="text-accent fw-bold">{fmtMoeda(orc.valor_por_peca)}</td>
                </tr>
                <tr>
                  <td><strong>Total Peças</strong></td>
                  <td style={{color:'var(--text-muted)',fontSize:12,fontFamily:'var(--font-mono)'}}>
                    {fmtMoeda(orc.valor_por_peca)} × {orc.quantidade} un
                  </td>
                  <td className="fw-bold">{fmtMoeda(orc.total_peca)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Serviços CAD */}
        {orc.servicos?.length > 0 && (
          <div className="card" style={{marginBottom:16}}>
            <h3 style={{fontSize:12,fontWeight:700,marginBottom:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px'}}>Serviços CAD</h3>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Serviço</th><th>Horas</th><th>Valor/h</th><th>Total</th></tr></thead>
                <tbody>
                  {orc.servicos.map(s => (
                    <tr key={s.id}>
                      <td>{s.servico_nome}</td>
                      <td>{s.quantidade_horas}h</td>
                      <td>{fmtMoeda(s.valor_hora)}</td>
                      <td className="text-accent fw-bold">{fmtMoeda(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {orc.observacao && (
          <div className="card" style={{marginBottom:16}}>
            <h3 style={{fontSize:12,fontWeight:700,marginBottom:8,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px'}}>Observações</h3>
            <p style={{fontSize:13,color:'var(--text-secondary)',lineHeight:1.7}}>{orc.observacao}</p>
          </div>
        )}

        {/* Status + Totais */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:16}}>
          <div className="card">
            <h3 style={{fontSize:12,fontWeight:700,marginBottom:12,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'1px'}}>Alterar Status</h3>
            <div className="flex gap-3" style={{flexWrap:'wrap'}}>
              {STATUS_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`btn ${orc.status === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                  onClick={() => handleStatus(s)}
                  disabled={orc.status === s}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="os-summary">
              <div className="os-summary-row">
                <span>Total Peças</span>
                <span>{fmtMoeda(orc.total_peca)}</span>
              </div>
              <div className="os-summary-row">
                <span>Total Serviços</span>
                <span>{fmtMoeda(orc.total_servico)}</span>
              </div>
              <div className="os-summary-row total">
                <span>TOTAL GERAL</span>
                <span>{fmtMoeda(orc.total_geral)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
