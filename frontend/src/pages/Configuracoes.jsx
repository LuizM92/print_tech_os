import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const fmtMoeda = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;

export default function Configuracoes() {
  const [valorHoraMaquina, setValorHoraMaquina] = useState('');
  const [original, setOriginal] = useState('');
  const [loading, setLoading] = useState(false);
  const { isAdmin } = useAuth();

  useEffect(() => {
    api.get('/configuracoes').then(res => {
      const cfg = res.data.find(c => c.chave === 'valor_hora_maquina');
      if (cfg) { setValorHoraMaquina(cfg.valor); setOriginal(cfg.valor); }
    });
  }, []);

  const handleSalvar = async (e) => {
    e.preventDefault();
    if (!valorHoraMaquina || parseFloat(valorHoraMaquina) <= 0) {
      return toast.error('Informe um valor válido');
    }
    setLoading(true);
    try {
      await api.post('/configuracoes', { chave: 'valor_hora_maquina', valor: valorHoraMaquina });
      setOriginal(valorHoraMaquina);
      toast.success('Configuração salva com sucesso!');
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  const alterado = valorHoraMaquina !== original;

  return (
    <>
      <div className="page-header">
        <h2>Configurações</h2>
        <p>Parâmetros globais utilizados nos cálculos dos orçamentos</p>
      </div>

      <div className="page-content">
        <div className="card" style={{maxWidth: 560}}>
          <h3 style={{fontSize:14,fontWeight:700,marginBottom:6}}>Valor Hora-Máquina</h3>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginBottom:20,lineHeight:1.7}}>
            Custo fixo por hora de impressão. Inclui aluguel, energia elétrica, impostos e depreciação do equipamento.
            Este valor é usado automaticamente em todos os novos orçamentos.
          </p>

          {/* Fórmula visual */}
          <div style={{background:'var(--bg-secondary)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'16px 20px',marginBottom:24,fontFamily:'var(--font-mono)',fontSize:13}}>
            <div style={{color:'var(--text-muted)',fontSize:11,marginBottom:8,textTransform:'uppercase',letterSpacing:'1px'}}>Fórmula do orçamento</div>
            <div style={{color:'var(--text-primary)'}}>
              <span style={{color:'var(--accent)'}}>Preço</span>
              <span style={{color:'var(--text-muted)'}}> = </span>
              <span>(Peso em gramas</span>
              <span style={{color:'var(--text-muted)'}}> × </span>
              <span style={{color:'var(--success)'}}>custo/grama</span>
              <span>)</span>
            </div>
            <div style={{color:'var(--text-primary)',paddingLeft:52}}>
              <span style={{color:'var(--text-muted)'}}>+ </span>
              <span>(Horas de impressão</span>
              <span style={{color:'var(--text-muted)'}}> × </span>
              <span style={{color:'var(--warning)'}}>Hora-Máquina</span>
              <span>)</span>
            </div>
            <div style={{marginTop:12,fontSize:12,color:'var(--text-muted)'}}>
              Ex: 200g × R$0,15 + 2h × {fmtMoeda(valorHoraMaquina || 7)} = R$ {((200 * 0.15) + (2 * parseFloat(valorHoraMaquina || 7))).toFixed(2).replace('.', ',')}
            </div>
          </div>

          {isAdmin() ? (
            <form onSubmit={handleSalvar}>
              <div className="form-group">
                <label>Valor por Hora-Máquina (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorHoraMaquina}
                  onChange={e => setValorHoraMaquina(e.target.value)}
                  placeholder="7.00"
                  style={{maxWidth:200}}
                />
                <div style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>
                  Valor atual salvo: <strong style={{color:'var(--text-primary)'}}>{fmtMoeda(original)}/hora</strong>
                </div>
              </div>

              <div className="form-actions" style={{justifyContent:'flex-start', paddingTop:16}}>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading || !alterado}
                >
                  {loading ? <span className="spinner"/> : (
                    <>
                      <svg viewBox="0 0 24 24" fill="none" style={{width:15,height:15}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" stroke="currentColor"/></svg>
                      Salvar Configuração
                    </>
                  )}
                </button>
                {alterado && (
                  <button type="button" className="btn btn-ghost" onClick={() => setValorHoraMaquina(original)}>
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div style={{background:'var(--bg-secondary)',borderRadius:'var(--radius-sm)',padding:'14px 18px',fontSize:14}}>
              <div style={{color:'var(--text-muted)',fontSize:11,marginBottom:4,textTransform:'uppercase',letterSpacing:'1px'}}>Valor Atual</div>
              <div style={{fontSize:22,fontWeight:700,color:'var(--warning)'}}>{fmtMoeda(valorHoraMaquina)}<span style={{fontSize:13,color:'var(--text-muted)',fontWeight:400}}>/hora</span></div>
              <div style={{fontSize:12,color:'var(--text-muted)',marginTop:6}}>Somente administradores podem alterar este valor.</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
