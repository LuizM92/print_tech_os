import React, { useState, useEffect } from 'react';
import api from '../services/api';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import { useAuth } from '../contexts/AuthContext';
import toast from 'react-hot-toast';

const fmtData = (d) => new Date(d).toLocaleDateString('pt-BR');

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [form, setForm] = useState({ nome: '', email: '', senha: '', perfil: 'operador', ativo: 1 });
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const { usuario: me } = useAuth();

  const load = async () => { const res = await api.get('/usuarios'); setUsuarios(res.data); };
  useEffect(() => { load(); }, []);

  const openNovo = () => { setForm({ nome: '', email: '', senha: '', perfil: 'operador', ativo: 1 }); setEditId(null); setModal(true); };
  const openEdit = (u) => { setForm({ nome: u.nome, email: u.email, senha: '', perfil: u.perfil, ativo: u.ativo }); setEditId(u.id); setModal(true); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const data = { ...form };
      if (editId && !data.senha) delete data.senha;
      if (editId) { await api.put(`/usuarios/${editId}`, data); toast.success('Usuário atualizado!'); }
      else { await api.post('/usuarios', data); toast.success('Usuário criado!'); }
      setModal(false); load();
    } catch (err) { toast.error(err.response?.data?.erro || 'Erro ao salvar'); }
    finally { setLoading(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/usuarios/${confirm}`); toast.success('Usuário excluído!'); setConfirm(null); load(); }
    catch (err) { toast.error(err.response?.data?.erro || 'Erro ao excluir'); }
  };

  const f = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <>
      <div className="page-header">
        <h2>Usuários</h2>
        <p>Gerencie os usuários e seus privilégios de acesso</p>
      </div>
      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div />
            <button className="btn btn-primary" onClick={openNovo}>
              <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor"/></svg>
              Novo Usuário
            </button>
          </div>
          <div className="table-wrapper">
            <table>
              <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Ativo</th><th>Cadastrado em</th><th>Ações</th></tr></thead>
              <tbody>
                {usuarios.map(u => (
                  <tr key={u.id}>
                    <td>
                      {u.nome}
                      {u.id === me?.id && <span style={{marginLeft:6,fontSize:10,color:'var(--accent)',fontFamily:'var(--font-mono)'}}>(você)</span>}
                    </td>
                    <td style={{color:'var(--text-muted)',fontSize:13}}>{u.email}</td>
                    <td><span className={`badge badge-${u.perfil}`}>{u.perfil}</span></td>
                    <td><span className={`badge ${u.ativo ? 'badge-aprovado' : 'badge-reprovado'}`}>{u.ativo ? 'sim' : 'não'}</span></td>
                    <td style={{color:'var(--text-muted)',fontSize:13}}>{fmtData(u.criado_em)}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn-icon" onClick={() => openEdit(u)}>
                          <svg viewBox="0 0 24 24" fill="none" style={{width:14,height:14}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor"/></svg>
                        </button>
                        {u.id !== me?.id && (
                          <button className="btn-icon danger" onClick={() => setConfirm(u.id)}>
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

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar Usuário' : 'Novo Usuário'}>
        <form onSubmit={handleSubmit}>
          <div className="form-group"><label>Nome completo</label><input value={form.nome} onChange={f('nome')} required /></div>
          <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={f('email')} required /></div>
          <div className="form-group">
            <label>{editId ? 'Nova Senha (deixe em branco para manter)' : 'Senha'}</label>
            <input type="password" value={form.senha} onChange={f('senha')} required={!editId} minLength={6} placeholder={editId ? 'Deixe em branco para não alterar' : 'Mínimo 6 caracteres'} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Perfil</label>
              <select value={form.perfil} onChange={f('perfil')}>
                <option value="operador">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
            <div className="form-group">
              <label>Ativo</label>
              <select value={form.ativo} onChange={(e) => setForm({...form, ativo: parseInt(e.target.value)})}>
                <option value={1}>Sim</option>
                <option value={0}>Não</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? <span className="spinner"/> : 'Salvar'}</button>
          </div>
        </form>
      </Modal>
      <ConfirmModal isOpen={!!confirm} onClose={() => setConfirm(null)} onConfirm={handleDelete} title="Excluir usuário?" message="Esta ação não pode ser desfeita." />
    </>
  );
}
