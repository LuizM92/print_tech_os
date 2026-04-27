import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import toast from 'react-hot-toast';

const fmtMoeda = (v) => `R$ ${parseFloat(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;

export default function Servicos() {
  const [servicos, setServicos] = useState([]);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nome: '', valor_hora: '', descricao: '' });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isAdmin } = useAuth();

  const load = async () => { const res = await api.get('/servicos'); setServicos(res.data); };
  useEffect(() => { load(); }, []);

  const openNovo = () => { setForm({ nome: '', valor_hora: '', descricao: '' }); setEditId(null); setModal(true); };
  const openEdit = (s) => { setForm({ nome: s.nome, valor_hora: s.valor_hora, descricao: s.descricao || '' }); setEditId(s.id); setModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editId) { await api.put(`/servicos/${editId}`, form); toast.success('Serviço atualizado!'); }
      else { await api.post('/servicos', form); toast.success('Serviço criado!'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.erro || 'Erro ao salvar'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/servicos/${confirm}`); toast.success('Serviço removido!'); setConfirm(null); load(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const f = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <>
      <div className="page-header">
        <h2>Serviços</h2>
        <p>Cadastre os tipos de serviço (CAD, pós-processo etc) e seus valores por hora</p>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div />
            {isAdmin() && (
              <button className="btn btn-primary" onClick={openNovo}>
                <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor"/></svg>
                Novo Serviço
              </button>
            )}
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Serviço</th><th>Valor/hora</th><th>Descrição</th>{isAdmin() && <th>Ações</th>}</tr></thead>
              <tbody>
                {servicos.length === 0 ? (
                  <tr><td colSpan={4}><div className="empty-state"><p>Nenhum serviço cadastrado</p></div></td></tr>
                ) : servicos.map(s => (
                  <tr key={s.id}>
                    <td><strong>{s.nome}</strong></td>
                    <td><span className="text-accent fw-bold">{fmtMoeda(s.valor_hora)}/h</span></td>
                    <td style={{color:'var(--text-muted)',fontSize:13}}>{s.descricao || '—'}</td>
                    {isAdmin() && (
                      <td>
                        <div className="flex gap-2">
                          <button className="btn-icon" onClick={() => openEdit(s)}>
                            <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor"/></svg>
                          </button>
                          <button className="btn-icon danger" onClick={() => setConfirm(s.id)}>
                            <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor"/></svg>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Serviço' : 'Novo Serviço'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Nome do Serviço</label><input value={form.nome} onChange={f('nome')} placeholder="Ex: CAD Técnico..." required /></div>
          <div className="form-group"><label>Valor por Hora (R$)</label><input type="number" step="0.01" min="0" value={form.valor_hora} onChange={f('valor_hora')} placeholder="0.00" required /></div>
          <div className="form-group"><label>Descrição</label><textarea value={form.descricao} onChange={f('descricao')} placeholder="Descrição opcional..." rows={3}/></div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner"/> : 'Salvar'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete} message="Este serviço será removido." />
    </>
  );
}
