import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import toast from 'react-hot-toast';

const fmtMoeda = (v) => `R$ ${parseFloat(v).toFixed(4).replace('.', ',')}`;

export default function Materiais() {
  const [materiais, setMateriais] = useState([]);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nome: '', custo_por_grama: '', descricao: '' });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const { isAdmin } = useAuth();

  const load = async () => { const res = await api.get('/materiais'); setMateriais(res.data); };
  useEffect(() => { load(); }, []);

  const openNovo = () => { setForm({ nome: '', custo_por_grama: '', descricao: '' }); setEditId(null); setModal(true); };
  const openEdit = (m) => { setForm({ nome: m.nome, custo_por_grama: m.custo_por_grama, descricao: m.descricao || '' }); setEditId(m.id); setModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      if (editId) { await api.put(`/materiais/${editId}`, form); toast.success('Material atualizado!'); }
      else { await api.post('/materiais', form); toast.success('Material criado!'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.erro || 'Erro ao salvar'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/materiais/${confirm}`); toast.success('Material removido!'); setConfirm(null); load(); }
    catch { toast.error('Erro ao excluir'); }
  };

  const f = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <>
      <div className="page-header">
        <h2>Materiais</h2>
        <p>Cadastre os tipos de filamento/material e o custo por grama</p>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div />
            {isAdmin() && (
              <button className="btn btn-primary" onClick={openNovo}>
                <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor"/></svg>
                Novo Material
              </button>
            )}
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Custo/grama</th>
                  <th>Equivalente kg</th>
                  <th>Descrição</th>
                  {isAdmin() && <th>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {materiais.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state"><p>Nenhum material cadastrado</p></div></td></tr>
                ) : materiais.map(m => (
                  <tr key={m.id}>
                    <td><strong>{m.nome}</strong></td>
                    <td>
                      <span className="text-success fw-bold font-mono">
                        R$ {parseFloat(m.custo_por_grama).toFixed(4).replace('.', ',')}/g
                      </span>
                    </td>
                    <td>
                      <span style={{color:'var(--text-muted)', fontSize:12, fontFamily:'var(--font-mono)'}}>
                        R$ {(parseFloat(m.custo_por_grama) * 1000).toFixed(2).replace('.', ',')}/kg
                      </span>
                    </td>
                    <td style={{color:'var(--text-muted)', fontSize:13}}>{m.descricao || '—'}</td>
                    {isAdmin() && (
                      <td>
                        <div className="flex gap-2">
                          <button className="btn-icon" onClick={() => openEdit(m)}>
                            <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor"/></svg>
                          </button>
                          <button className="btn-icon danger" onClick={() => setConfirm(m.id)}>
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

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Material' : 'Novo Material'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Nome do Material</label>
            <input value={form.nome} onChange={f('nome')} placeholder="Ex: PLA, ABS, PETG..." required />
          </div>
          <div className="form-group">
            <label>Custo por Grama (R$)</label>
            <input
              type="number" step="0.0001" min="0.0001"
              value={form.custo_por_grama} onChange={f('custo_por_grama')}
              placeholder="0.1500" required
            />
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:5}}>
              {form.custo_por_grama > 0 && (
                <>Equivale a R$ {(parseFloat(form.custo_por_grama) * 1000).toFixed(2).replace('.', ',')} por kg</>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Descrição</label>
            <textarea value={form.descricao} onChange={f('descricao')} placeholder="Descrição opcional..." rows={3} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner"/> : 'Salvar'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete} message="Este material será removido." />
    </>
  );
}
