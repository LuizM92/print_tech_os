import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import toast from 'react-hot-toast';

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const empty = { nome: '', cpf_cnpj: '', tipo_documento: 'cpf', rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: 'SP', cep: '', markup: '' };

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isAdmin } = useAuth();

  const load = async () => {
    const res = await api.get('/clientes');
    setClientes(res.data);
  };

  useEffect(() => { load(); }, []);

  const filtrados = clientes.filter(c =>
    c.nome.toLowerCase().includes(busca.toLowerCase()) ||
    c.cpf_cnpj.includes(busca)
  );

  const openNovo = () => { setForm(empty); setEditId(null); setModal(true); };
  const openEdit = (c) => {
    setForm({ nome: c.nome, cpf_cnpj: c.cpf_cnpj, tipo_documento: c.tipo_documento, rua: c.rua, numero: c.numero, complemento: c.complemento || '', bairro: c.bairro, cidade: c.cidade, estado: c.estado, cep: c.cep, markup: c.markup });
    setEditId(c.id);
    setModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editId) {
        await api.put(`/clientes/${editId}`, form);
        toast.success('Cliente atualizado!');
      } else {
        await api.post('/clientes', form);
        toast.success('Cliente cadastrado!');
      }
      setModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/clientes/${confirm}`);
      toast.success('Cliente removido!');
      setConfirm(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao excluir');
    }
  };

  const f = (field) => (e) => setForm({ ...form, [field]: e.target.value });

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
              <svg viewBox="0 0 24 24" fill="none"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor"/></svg>
              <input placeholder="Buscar por nome ou CPF/CNPJ..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={openNovo}>
              <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor"/></svg>
              Novo Cliente
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Nome</th><th>CPF/CNPJ</th><th>Cidade/UF</th><th>Markup</th><th>Ações</th></tr>
              </thead>
              <tbody>
                {filtrados.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state"><p>Nenhum cliente encontrado</p></div></td></tr>
                ) : filtrados.map(c => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td><span className="font-mono" style={{fontSize:12}}>{c.cpf_cnpj}</span></td>
                    <td>{c.cidade}/{c.estado}</td>
                    <td><span className="text-accent">{c.markup}%</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-icon" onClick={() => openEdit(c)} title="Editar">
                          <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor"/></svg>
                        </button>
                        {isAdmin() && (
                          <button className="btn-icon danger" onClick={() => setConfirm(c.id)} title="Excluir">
                            <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor"/></svg>
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
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group" style={{gridColumn:'1/-1'}}>
              <label>Nome completo</label>
              <input value={form.nome} onChange={f('nome')} placeholder="Razão social ou nome" required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Tipo</label>
              <select value={form.tipo_documento} onChange={f('tipo_documento')}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
              </select>
            </div>
            <div className="form-group">
              <label>{form.tipo_documento === 'cpf' ? 'CPF' : 'CNPJ'}</label>
              <input value={form.cpf_cnpj} onChange={f('cpf_cnpj')} placeholder={form.tipo_documento === 'cpf' ? '000.000.000-00' : '00.000.000/0001-00'} required />
            </div>
            <div className="form-group">
              <label>Markup (%)</label>
              <input type="number" step="0.01" min="0" value={form.markup} onChange={f('markup')} placeholder="0.00" />
            </div>
          </div>
          <div className="divider" />
          <div className="form-row">
            <div className="form-group" style={{gridColumn:'span 2'}}>
              <label>Rua / Logradouro</label>
              <input value={form.rua} onChange={f('rua')} placeholder="Rua, Avenida..." required />
            </div>
            <div className="form-group">
              <label>Número</label>
              <input value={form.numero} onChange={f('numero')} placeholder="123" required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Complemento</label>
              <input value={form.complemento} onChange={f('complemento')} placeholder="Apto, sala..." />
            </div>
            <div className="form-group">
              <label>Bairro</label>
              <input value={form.bairro} onChange={f('bairro')} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Cidade</label>
              <input value={form.cidade} onChange={f('cidade')} required />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select value={form.estado} onChange={f('estado')}>
                {ESTADOS.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>CEP</label>
              <input value={form.cep} onChange={f('cep')} placeholder="00000-000" required />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner"/> : (editId ? 'Salvar' : 'Cadastrar')}</button>
          </div>
        </form>
      </Modal>

      <ConfirmModal isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete} message="Esta ação não pode ser desfeita." />
    </>
  );
}
