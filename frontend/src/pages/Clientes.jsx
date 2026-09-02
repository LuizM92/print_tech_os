import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import toast from 'react-hot-toast';
import { fmtMoeda } from '../utils/format';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const REGIMES = [
  { valor: '', rotulo: 'Não informado' },
  { valor: 'simples', rotulo: 'Simples Nacional' },
  { valor: 'mei', rotulo: 'MEI' },
  { valor: 'presumido', rotulo: 'Lucro Presumido' },
  { valor: 'real', rotulo: 'Lucro Real' },
];

const TIPOS_CONTA = [
  { valor: '', rotulo: '—' },
  { valor: 'corrente', rotulo: 'Corrente' },
  { valor: 'poupanca', rotulo: 'Poupança' },
  { valor: 'pagamento', rotulo: 'Pagamento' },
];

const TIPOS_PIX = [
  { valor: '', rotulo: '—' },
  { valor: 'cpf_cnpj', rotulo: 'CPF/CNPJ' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'telefone', rotulo: 'Telefone' },
  { valor: 'aleatoria', rotulo: 'Aleatória' },
];

const vazio = {
  nome: '', cpf_cnpj: '', tipo_documento: 'cpf', rua: '', numero: '', complemento: '',
  bairro: '', cidade: '', estado: 'PR', cep: '', markup: '',
  nome_fantasia: '', inscricao_estadual: '', ie_isento: false, inscricao_municipal: '',
  regime_tributario: '', cnae: '', situacao_cadastral: '',
  contato_nome: '', contato_cargo: '', telefone: '', celular: '', email: '',
  banco: '', agencia: '', conta: '', tipo_conta: '', pix_tipo: '', pix_chave: '',
  condicao_pagamento: '', limite_credito: '', observacoes: '',
};

const tituloSecao = {
  fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '1px', margin: '4px 0 12px',
};

export default function Clientes() {
  const { isAdmin } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [confirmar, setConfirmar] = useState(null);
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [consultando, setConsultando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/clientes');
      setClientes(data);
    } catch {
      toast.error('Erro ao carregar clientes');
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const filtrados = clientes.filter((c) => {
    const termo = busca.toLowerCase();
    return c.nome.toLowerCase().includes(termo)
      || (c.nome_fantasia || '').toLowerCase().includes(termo)
      || c.cpf_cnpj.includes(busca)
      || (c.contato_nome || '').toLowerCase().includes(termo);
  });

  const abrirNovo = () => { setForm(vazio); setEditId(null); setModal(true); };

  const abrirEdicao = (c) => {
    // Converte nulls do banco em strings, para os inputs continuarem controlados.
    const preenchido = { ...vazio };
    for (const chave of Object.keys(vazio)) {
      if (c[chave] !== undefined && c[chave] !== null) preenchido[chave] = c[chave];
    }
    preenchido.ie_isento = Boolean(c.ie_isento);
    preenchido.markup = c.markup != null ? String(parseFloat(c.markup)) : '';
    preenchido.limite_credito = c.limite_credito != null ? String(parseFloat(c.limite_credito)) : '';
    setForm(preenchido);
    setEditId(c.id);
    setModal(true);
  };

  const campo = (nome) => (e) => setForm((p) => ({ ...p, [nome]: e.target.value }));

  /**
   * Busca os dados públicos do CNPJ e completa **apenas os campos vazios** — o que
   * você digitou à mão fica intacto, para um dado desatualizado da Receita não
   * apagar uma correção sua.
   */
  const importarCnpj = async () => {
    const digitos = form.cpf_cnpj.replace(/\D/g, '');
    if (digitos.length !== 14) return toast.error('Digite o CNPJ completo antes de importar');

    setConsultando(true);
    try {
      const { data } = await api.get(`/clientes/consulta-cnpj/${digitos}`);

      let preenchidos = 0;
      const atualizado = { ...form };
      for (const [chave, valor] of Object.entries(data.dados)) {
        if (valor === null || valor === undefined || !(chave in vazio)) continue;
        if (String(atualizado[chave] ?? '').trim() !== '') continue; // já preenchido: não toca
        atualizado[chave] = valor;
        preenchidos++;
      }
      setForm(atualizado);

      if (preenchidos === 0) {
        toast('Nada a preencher — os campos já estavam completos', { icon: 'ℹ️' });
      } else {
        toast.success(`${preenchidos} campo(s) preenchido(s) · ${data.fonte}`);
      }
      if (!data.tem_inscricao_estadual) {
        toast('A inscrição estadual não vem nesta consulta — preencha à mão', { icon: '📝', duration: 5000 });
      }
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Não foi possível consultar o CNPJ');
    } finally {
      setConsultando(false);
    }
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (editId) {
        await api.put(`/clientes/${editId}`, form);
        toast.success('Cliente atualizado!');
      } else {
        await api.post('/clientes', form);
        toast.success('Cliente cadastrado!');
      }
      setModal(false);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    try {
      await api.delete(`/clientes/${confirmar.id}`);
      toast.success('Cliente removido!');
      setConfirmar(null);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao excluir');
    }
  };

  const ehCnpj = form.tipo_documento === 'cnpj';

  return (
    <>
      <div className="page-header">
        <h2>Clientes</h2>
        <p>Gerencie os clientes cadastrados no sistema</p>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
              </svg>
              <input placeholder="Buscar por nome, fantasia, CPF/CNPJ ou contato..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={abrirNovo}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
              </svg>
              Novo Cliente
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Nome</th><th>CPF/CNPJ</th><th>Contato</th><th>Cidade/UF</th><th>Markup</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={6}><div className="empty-state"><p>Nenhum cliente encontrado</p></div></td></tr>
                ) : filtrados.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.nome}</div>
                      {c.nome_fantasia && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.nome_fantasia}</div>
                      )}
                    </td>
                    <td>
                      <span className="font-mono" style={{ fontSize: 12 }}>{c.cpf_cnpj}</span>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {c.tipo_documento}
                      </div>
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {c.contato_nome && <div>{c.contato_nome}</div>}
                      {(c.celular || c.telefone) && (
                        <div style={{ color: 'var(--text-muted)' }}>{c.celular || c.telefone}</div>
                      )}
                      {!c.contato_nome && !c.celular && !c.telefone && (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>{c.cidade}/{c.estado}</td>
                    <td><span className="text-accent">{parseFloat(c.markup || 0)}%</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-icon" onClick={() => abrirEdicao(c)} title="Editar">
                          <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" />
                          </svg>
                        </button>
                        {isAdmin() && (
                          <button className="btn-icon danger" onClick={() => setConfirmar(c)} title="Excluir">
                            <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Cliente' : 'Novo Cliente'} size="lg">
        <form onSubmit={salvar}>
          {/* ── Identificação ─────────────────────────────────────────── */}
          <h4 style={tituloSecao}>Identificação</h4>

          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <select value={form.tipo_documento} onChange={campo('tipo_documento')}>
                <option value="cpf">Pessoa Física (CPF)</option>
                <option value="cnpj">Pessoa Jurídica (CNPJ)</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: ehCnpj ? 'span 2' : 'span 1' }}>
              <label>{ehCnpj ? 'CNPJ' : 'CPF'}</label>
              {ehCnpj ? (
                // Botão colado no campo: digita o CNPJ e traz o cadastro pronto.
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <input
                    value={form.cpf_cnpj}
                    onChange={campo('cpf_cnpj')}
                    placeholder="00.000.000/0001-00"
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={importarCnpj}
                    disabled={consultando}
                    title="Buscar os dados públicos deste CNPJ e preencher o formulário"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    {consultando ? <span className="spinner" /> : (
                      <>
                        <svg viewBox="0 0 24 24" fill="none" style={{ width: 15, height: 15 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke="currentColor" />
                        </svg>
                        Importar
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <input value={form.cpf_cnpj} onChange={campo('cpf_cnpj')} placeholder="000.000.000-00" required />
              )}
            </div>
            <div className="form-group">
              <label>Markup (%)</label>
              <input type="number" step="0.01" min="0" value={form.markup} onChange={campo('markup')} placeholder="0,00" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: ehCnpj ? 'span 2' : '1/-1' }}>
              <label>{ehCnpj ? 'Razão social' : 'Nome completo'}</label>
              <input value={form.nome} onChange={campo('nome')} required />
            </div>
            {ehCnpj && (
              <div className="form-group">
                <label>Nome fantasia</label>
                <input value={form.nome_fantasia} onChange={campo('nome_fantasia')} />
              </div>
            )}
          </div>

          {/* ── Fiscal (só PJ) ────────────────────────────────────────── */}
          {ehCnpj && (
            <>
              <div className="divider" />
              <h4 style={tituloSecao}>Dados fiscais</h4>

              <div className="form-row">
                <div className="form-group">
                  <label>Inscrição estadual</label>
                  <input
                    value={form.inscricao_estadual}
                    onChange={campo('inscricao_estadual')}
                    disabled={form.ie_isento}
                    placeholder={form.ie_isento ? 'ISENTO' : ''}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.ie_isento}
                      onChange={(e) => setForm((p) => ({
                        ...p,
                        ie_isento: e.target.checked,
                        inscricao_estadual: e.target.checked ? '' : p.inscricao_estadual,
                      }))}
                      style={{ width: 'auto', margin: 0 }}
                    />
                    Isento de inscrição estadual
                  </label>
                </div>
                <div className="form-group">
                  <label>Inscrição municipal</label>
                  <input value={form.inscricao_municipal} onChange={campo('inscricao_municipal')} />
                </div>
                <div className="form-group">
                  <label>Regime tributário</label>
                  <select value={form.regime_tributario} onChange={campo('regime_tributario')}>
                    {REGIMES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label>CNAE principal</label>
                  <input value={form.cnae} onChange={campo('cnae')} placeholder="Atividade econômica" />
                </div>
                <div className="form-group">
                  <label>Situação cadastral</label>
                  <input value={form.situacao_cadastral} onChange={campo('situacao_cadastral')} placeholder="ATIVA" />
                </div>
              </div>
            </>
          )}

          {/* ── Endereço ──────────────────────────────────────────────── */}
          <div className="divider" />
          <h4 style={tituloSecao}>Endereço</h4>

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Rua / Logradouro</label>
              <input value={form.rua} onChange={campo('rua')} placeholder="Rua, Avenida..." required />
            </div>
            <div className="form-group">
              <label>Número</label>
              <input value={form.numero} onChange={campo('numero')} placeholder="123" required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Complemento</label>
              <input value={form.complemento} onChange={campo('complemento')} placeholder="Sala, andar..." />
            </div>
            <div className="form-group">
              <label>Bairro</label>
              <input value={form.bairro} onChange={campo('bairro')} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Cidade</label>
              <input value={form.cidade} onChange={campo('cidade')} required />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select value={form.estado} onChange={campo('estado')}>
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>CEP</label>
              <input value={form.cep} onChange={campo('cep')} placeholder="00000-000" required />
            </div>
          </div>

          {/* ── Contato ───────────────────────────────────────────────── */}
          <div className="divider" />
          <h4 style={tituloSecao}>Contato</h4>

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Nome do contato</label>
              <input value={form.contato_nome} onChange={campo('contato_nome')} placeholder="Quem você fala na empresa" />
            </div>
            <div className="form-group">
              <label>Cargo</label>
              <input value={form.contato_cargo} onChange={campo('contato_cargo')} placeholder="Compras, Engenharia..." />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Telefone</label>
              <input value={form.telefone} onChange={campo('telefone')} placeholder="(00) 0000-0000" />
            </div>
            <div className="form-group">
              <label>Celular / WhatsApp</label>
              <input value={form.celular} onChange={campo('celular')} placeholder="(00) 00000-0000" />
            </div>
            <div className="form-group">
              <label>E-mail</label>
              <input type="email" value={form.email} onChange={campo('email')} placeholder="contato@empresa.com.br" />
            </div>
          </div>

          {/* ── Bancário ──────────────────────────────────────────────── */}
          <div className="divider" />
          <h4 style={tituloSecao}>Dados bancários</h4>

          <div className="form-row">
            <div className="form-group">
              <label>Banco</label>
              <input value={form.banco} onChange={campo('banco')} placeholder="Ex: 341 - Itaú" />
            </div>
            <div className="form-group">
              <label>Agência</label>
              <input value={form.agencia} onChange={campo('agencia')} placeholder="0000" />
            </div>
            <div className="form-group">
              <label>Conta</label>
              <input value={form.conta} onChange={campo('conta')} placeholder="00000-0" />
            </div>
            <div className="form-group">
              <label>Tipo</label>
              <select value={form.tipo_conta} onChange={campo('tipo_conta')}>
                {TIPOS_CONTA.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Tipo de chave PIX</label>
              <select value={form.pix_tipo} onChange={campo('pix_tipo')}>
                {TIPOS_PIX.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Chave PIX</label>
              <input value={form.pix_chave} onChange={campo('pix_chave')} />
            </div>
          </div>

          {/* ── Comercial ─────────────────────────────────────────────── */}
          <div className="divider" />
          <h4 style={tituloSecao}>Comercial</h4>

          <div className="form-row">
            <div className="form-group">
              <label>Condição de pagamento</label>
              <input value={form.condicao_pagamento} onChange={campo('condicao_pagamento')} placeholder="À vista, 30 dias, 30/60..." />
            </div>
            <div className="form-group">
              <label>Limite de crédito (R$)</label>
              <input type="number" step="0.01" min="0" value={form.limite_credito} onChange={campo('limite_credito')} placeholder="0,00" />
              {parseFloat(form.limite_credito) > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  {fmtMoeda(form.limite_credito)}
                </div>
              )}
            </div>
          </div>

          <div className="form-group">
            <label>Observações internas</label>
            <textarea
              value={form.observacoes}
              onChange={campo('observacoes')}
              rows={2}
              placeholder="Notas sobre o cliente — não aparecem no orçamento"
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? <span className="spinner" /> : (editId ? 'Salvar' : 'Cadastrar')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={excluir}
        title="Excluir cliente?"
        message={`${confirmar?.nome} sai da lista. Orçamentos já feitos para ele continuam intactos.`}
      />
    </>
  );
}
