import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';

const fmtMoeda = (v) => `R$ ${parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

const emptyServico = (id) => ({ _id: id, servico_id: '', quantidade_horas: '' });

export default function NovoOrcamento() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [valorHoraMaquina, setValorHoraMaquina] = useState(7.00);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    cliente_id: '',
    material_id: '',
    tipo_peca: 'tecnica',
    observacao: '',
    quantidade: '1',
    peso_gramas: '',
    horas_impressao: '',
  });

  const [servicosOrc, setServicosOrc] = useState([]);

  const [calc, setCalc] = useState({
    custoMaterial: 0,
    custoImpressao: 0,
    valorPorPeca: 0,
    totalPeca: 0,
    totalServico: 0,
    totalGeral: 0,
  });

  useEffect(() => {
    const load = async () => {
      const [c, m, s, cfg] = await Promise.all([
        api.get('/clientes'),
        api.get('/materiais'),
        api.get('/servicos'),
        api.get('/configuracoes'),
      ]);
      setClientes(c.data);
      setMateriais(m.data);
      setServicos(s.data);
      const horaMaquina = cfg.data.find(x => x.chave === 'valor_hora_maquina');
      if (horaMaquina) setValorHoraMaquina(parseFloat(horaMaquina.valor));
    };
    load();
  }, []);

  // Recalcula sempre que form ou serviços mudam
  useEffect(() => {
    const material = materiais.find(m => m.id === parseInt(form.material_id));
    const custoPorGrama = material ? parseFloat(material.custo_por_grama) : 0;
    const gramas = parseFloat(form.peso_gramas) || 0;
    const horas = parseFloat(form.horas_impressao) || 0;
    const qtd = parseInt(form.quantidade) || 0;

    // Fórmula: (gramas × custo/g) + (horas × valor hora-máquina)
    const custoMaterial = gramas * custoPorGrama;
    const custoImpressao = horas * valorHoraMaquina;
    const valorPorPeca = custoMaterial + custoImpressao;
    const totalPeca = valorPorPeca * qtd;

    let totalServico = 0;
    servicosOrc.forEach(s => {
      const srv = servicos.find(sv => sv.id === parseInt(s.servico_id));
      if (srv) totalServico += parseFloat(srv.valor_hora) * (parseFloat(s.quantidade_horas) || 0);
    });

    setCalc({ custoMaterial, custoImpressao, valorPorPeca, totalPeca, totalServico, totalGeral: totalPeca + totalServico });
  }, [form, servicosOrc, materiais, servicos, valorHoraMaquina]);

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  const addServico = () => setServicosOrc(prev => [...prev, emptyServico(Date.now())]);
  const removeServico = (id) => setServicosOrc(prev => prev.filter(s => s._id !== id));
  const updateServico = (id, field, value) => setServicosOrc(prev => prev.map(s => s._id === id ? { ...s, [field]: value } : s));

  const clienteSelecionado = clientes.find(c => c.id === parseInt(form.cliente_id));
  const materialSelecionado = materiais.find(m => m.id === parseInt(form.material_id));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.cliente_id) return toast.error('Selecione um cliente');
    if (!form.material_id) return toast.error('Selecione um material');
    if (!form.peso_gramas || parseFloat(form.peso_gramas) <= 0) return toast.error('Informe o peso da peça em gramas');
    if (!form.horas_impressao || parseFloat(form.horas_impressao) <= 0) return toast.error('Informe as horas de impressão');

    const payload = {
      ...form,
      servicos: servicosOrc
        .filter(s => s.servico_id && s.quantidade_horas)
        .map(s => ({ servico_id: parseInt(s.servico_id), quantidade_horas: parseFloat(s.quantidade_horas) })),
    };

    setLoading(true);
    try {
      const res = await api.post('/orcamentos', payload);
      toast.success(`Orçamento ${res.data.numero_os} criado!`);
      navigate(`/orcamentos/${res.data.id}`);
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao criar orçamento');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Novo Orçamento</h2>
        <p>Preencha os campos para gerar a Ordem de Serviço</p>
      </div>

      <div className="page-content">
        <form onSubmit={handleSubmit}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 320px', gap:20, alignItems:'start'}}>
            <div>

              {/* Cliente */}
              <div className="card" style={{marginBottom:16}}>
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:14,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.8px'}}>Cliente</h3>
                <div className="form-group">
                  <label>Selecione o cliente</label>
                  <select
                    value={form.cliente_id}
                    onChange={e => {
                      const id = e.target.value;
                      setForm(prev => ({ ...prev, cliente_id: id }));
                    }}
                    required
                  >
                    <option value="">Selecione...</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{c.nome} — {c.cpf_cnpj}</option>)}
                  </select>
                </div>
                {clienteSelecionado && (
                  <div style={{background:'var(--bg-secondary)',borderRadius:'var(--radius-sm)',padding:'12px 14px',fontSize:13,color:'var(--text-secondary)',lineHeight:1.8}}>
                    <strong style={{color:'var(--text-primary)'}}>{clienteSelecionado.nome}</strong><br/>
                    {clienteSelecionado.rua}, {clienteSelecionado.numero} — {clienteSelecionado.bairro}<br/>
                    {clienteSelecionado.cidade}/{clienteSelecionado.estado} — CEP {clienteSelecionado.cep}
                    {clienteSelecionado.markup > 0 && (
                      <div style={{color:'var(--accent)',marginTop:4,fontSize:12}}>Markup cadastrado: {clienteSelecionado.markup}%</div>
                    )}
                  </div>
                )}
              </div>

              {/* Peça */}
              <div className="card" style={{marginBottom:16}}>
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:14,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.8px'}}>Dados da Peça</h3>

                <div className="form-row">
                  <div className="form-group" style={{gridColumn:'span 2'}}>
                    <label>Tipo de Material / Filamento</label>
                    <select value={form.material_id} onChange={f('material_id')} required>
                      <option value="">Selecione o material...</option>
                      {materiais.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.nome} — R$ {parseFloat(m.custo_por_grama).toFixed(4).replace('.', ',')}/g
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Tipo de Peça</label>
                    <select value={form.tipo_peca} onChange={f('tipo_peca')}>
                      <option value="tecnica">Peça Técnica</option>
                      <option value="decorativa">Decorativa</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Peso da Peça (gramas)</label>
                    <input
                      type="number" step="0.01" min="0.01"
                      value={form.peso_gramas} onChange={f('peso_gramas')}
                      placeholder="Ex: 200" required
                    />
                    {form.peso_gramas > 0 && materialSelecionado && (
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                        Custo material: {fmtMoeda(parseFloat(form.peso_gramas) * parseFloat(materialSelecionado.custo_por_grama))}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Horas de Impressão</label>
                    <input
                      type="number" step="0.1" min="0.1"
                      value={form.horas_impressao} onChange={f('horas_impressao')}
                      placeholder="Ex: 2.5" required
                    />
                    {form.horas_impressao > 0 && (
                      <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                        Custo impressão: {fmtMoeda(parseFloat(form.horas_impressao) * valorHoraMaquina)}
                        <span style={{marginLeft:6,color:'var(--warning)'}}>({fmtMoeda(valorHoraMaquina)}/h)</span>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label>Quantidade de Peças</label>
                    <input type="number" min="1" value={form.quantidade} onChange={f('quantidade')} required />
                  </div>
                </div>
              </div>

              {/* Serviços CAD */}
              <div className="card" style={{marginBottom:16}}>
                <div className="flex items-center justify-between" style={{marginBottom:14}}>
                  <h3 style={{fontSize:13,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.8px'}}>Serviços CAD (Opcional)</h3>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={addServico}>
                    <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor"/></svg>
                    Adicionar
                  </button>
                </div>

                {servicosOrc.length === 0 ? (
                  <div style={{textAlign:'center',padding:'20px',color:'var(--text-muted)',fontSize:13}}>
                    Clique em "Adicionar" para incluir serviços de CAD ou pós-processo
                  </div>
                ) : servicosOrc.map(s => {
                  const srvInfo = servicos.find(sv => sv.id === parseInt(s.servico_id));
                  const totalLinha = srvInfo ? parseFloat(srvInfo.valor_hora) * (parseFloat(s.quantidade_horas) || 0) : 0;
                  return (
                    <div key={s._id} style={{display:'grid',gridTemplateColumns:'1fr 150px 150px auto',gap:10,alignItems:'end',marginBottom:10,padding:12,background:'var(--bg-secondary)',borderRadius:'var(--radius-sm)'}}>
                      <div className="form-group" style={{marginBottom:0}}>
                        <label>Serviço</label>
                        <select value={s.servico_id} onChange={e => updateServico(s._id, 'servico_id', e.target.value)}>
                          <option value="">Selecione...</option>
                          {servicos.map(sv => <option key={sv.id} value={sv.id}>{sv.nome} — {fmtMoeda(sv.valor_hora)}/h</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{marginBottom:0}}>
                        <label>Horas</label>
                        <input type="number" step="0.5" min="0.5" value={s.quantidade_horas} onChange={e => updateServico(s._id, 'quantidade_horas', e.target.value)} placeholder="0" />
                      </div>
                      <div style={{paddingBottom:2}}>
                        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>TOTAL</div>
                        <div style={{fontSize:14,fontWeight:700,color:'var(--accent)',padding:'9px 0'}}>{fmtMoeda(totalLinha)}</div>
                      </div>
                      <button type="button" className="btn-icon danger" onClick={() => removeServico(s._id)} style={{marginBottom:2}}>
                        <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Observação */}
              <div className="card">
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:14,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.8px'}}>Observações</h3>
                <div className="form-group" style={{marginBottom:0}}>
                  <textarea
                    value={form.observacao} onChange={f('observacao')}
                    placeholder="Informações adicionais sobre o orçamento..."
                    rows={4} maxLength={1000} style={{minHeight:100}}
                  />
                  <div style={{fontSize:11,color:'var(--text-muted)',textAlign:'right',marginTop:4}}>{form.observacao.length}/1000</div>
                </div>
              </div>
            </div>

            {/* Sidebar resumo */}
            <div style={{position:'sticky',top:20}}>
              <div className="card">
                <h3 style={{fontSize:13,fontWeight:700,marginBottom:16,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.8px'}}>Resumo do Cálculo</h3>

                {/* Fórmula */}
                <div style={{background:'var(--bg-secondary)',borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:14,fontSize:11,color:'var(--text-muted)',fontFamily:'var(--font-mono)',lineHeight:1.8}}>
                  <div style={{color:'var(--accent)'}}>Preço por peça =</div>
                  <div style={{paddingLeft:8}}>
                    ({form.peso_gramas || 0}g × R${materialSelecionado ? parseFloat(materialSelecionado.custo_por_grama).toFixed(4) : '0,0000'})
                  </div>
                  <div style={{paddingLeft:8}}>
                    + ({form.horas_impressao || 0}h × {fmtMoeda(valorHoraMaquina)})
                  </div>
                </div>

                <div className="os-summary">
                  <div className="os-summary-row">
                    <span>Custo Material</span>
                    <span>{fmtMoeda(calc.custoMaterial)}</span>
                  </div>
                  <div className="os-summary-row">
                    <span>Custo Impressão</span>
                    <span>{fmtMoeda(calc.custoImpressao)}</span>
                  </div>
                  <div className="os-summary-row">
                    <span>Valor por Peça</span>
                    <span className="text-accent">{fmtMoeda(calc.valorPorPeca)}</span>
                  </div>
                  <div className="os-summary-row">
                    <span>× {form.quantidade} peça(s)</span>
                    <span>{fmtMoeda(calc.totalPeca)}</span>
                  </div>
                  <div className="os-summary-row">
                    <span>Total Serviços CAD</span>
                    <span>{fmtMoeda(calc.totalServico)}</span>
                  </div>
                  <div className="os-summary-row total">
                    <span>TOTAL GERAL</span>
                    <span>{fmtMoeda(calc.totalGeral)}</span>
                  </div>
                </div>

                <div style={{marginTop:16,padding:'10px 12px',background:'var(--warning-dim)',borderRadius:'var(--radius-sm)',fontSize:11,color:'var(--warning)'}}>
                  Hora-Máquina: {fmtMoeda(valorHoraMaquina)}/h
                  <span style={{color:'var(--text-muted)',marginLeft:6}}>(configurável)</span>
                </div>

                <div style={{marginTop:16,display:'flex',flexDirection:'column',gap:10}}>
                  <button type="submit" className="btn btn-success" style={{width:'100%',justifyContent:'center'}} disabled={loading}>
                    {loading ? <span className="spinner"/> : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor"/></svg>
                        Gerar OS
                      </>
                    )}
                  </button>
                  <button type="button" className="btn btn-ghost" style={{width:'100%',justifyContent:'center'}} onClick={() => navigate('/orcamentos')}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>
    </>
  );
}
