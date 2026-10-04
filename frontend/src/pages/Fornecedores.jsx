import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import Modal, { ConfirmModal } from '../components/shared/Modal';

const formVazio = {
  nome: '', cpf_cnpj: '', telefone: '', email: '', pix_chave: '', observacoes: '',
};

const IconeEditar = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" />
  </svg>
);

const IconeExcluir = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" />
  </svg>
);

/** Categorias das despesas: acrescentar, renomear e desativar (nunca apagar). */
function CategoriasDespesa() {
  const [categorias, setCategorias] = useState([]);
  const [nova, setNova] = useState('');
  const [editando, setEditando] = useState(null); // { id, nome }

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/categorias-despesa');
      setCategorias(data);
    } catch {
      toast.error('Erro ao carregar as categorias');
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const adicionar = async (e) => {
    e.preventDefault();
    if (!nova.trim()) return;
    try {
      await api.post('/categorias-despesa', { nome: nova });
      setNova('');
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao criar a categoria');
    }
  };

  const renomear = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/categorias-despesa/${editando.id}`, { nome: editando.nome });
      setEditando(null);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao renomear');
    }
  };

  const desativar = async (categoria) => {
    try {
      await api.delete(`/categorias-despesa/${categoria.id}`);
      toast.success(`"${categoria.nome}" desativada — as despesas antigas continuam com ela`);
      carregar();
    } catch {
      toast.error('Erro ao desativar');
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Categorias de despesa</h3>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16 }}>
        Agrupam as contas a pagar. Desativar tira a categoria das novas despesas, sem mexer nas antigas.
      </p>

      <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {categorias.map((c) => (
          editando?.id === c.id ? (
            <form key={c.id} onSubmit={renomear} className="flex gap-2">
              <input
                value={editando.nome}
                onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                maxLength={100}
                autoFocus
                style={{ width: 200 }}
              />
              <button type="submit" className="btn btn-primary btn-sm">Salvar</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>×</button>
            </form>
          ) : (
            <span
              key={c.id}
              className="badge badge-rascunho"
              style={{ textTransform: 'none', fontSize: 12.5, padding: '5px 4px 5px 12px', gap: 4 }}
            >
              {c.nome}
              <button type="button" className="btn-icon" style={{ padding: 3, border: 'none', background: 'transparent' }} onClick={() => setEditando({ id: c.id, nome: c.nome })} title="Renomear">
                <IconeEditar />
              </button>
              <button type="button" className="btn-icon danger" style={{ padding: 3, border: 'none', background: 'transparent' }} onClick={() => desativar(c)} title="Desativar">
                <IconeExcluir />
              </button>
            </span>
          )
        ))}
      </div>

      <form onSubmit={adicionar} className="flex gap-2" style={{ maxWidth: 420 }}>
        <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Nova categoria..." maxLength={100} />
        <button type="submit" className="btn btn-primary" disabled={!nova.trim()}>Adicionar</button>
      </form>
    </div>
  );
}

export default function Fornecedores() {
  const [fornecedores, setFornecedores] = useState([]);
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(formVazio);
  const [editId, setEditId] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/fornecedores', { params: { busca: busca || undefined } });
      setFornecedores(data);
    } catch {
      toast.error('Erro ao carregar os fornecedores');
    }
  }, [busca]);

  useEffect(() => {
    const timer = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(timer);
  }, [carregar, busca]);

  const abrirNovo = () => { setForm(formVazio); setEditId(null); setModal(true); };
  const abrirEdicao = (f) => {
    setForm({
      nome: f.nome, cpf_cnpj: f.cpf_cnpj || '', telefone: f.telefone || '', email: f.email || '',
      pix_chave: f.pix_chave || '', observacoes: f.observacoes || '',
    });
    setEditId(f.id);
    setModal(true);
  };

  const salvar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      if (editId) await api.put(`/fornecedores/${editId}`, form);
      else await api.post('/fornecedores', form);
      toast.success(editId ? 'Fornecedor atualizado' : 'Fornecedor cadastrado');
      setModal(false);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const desativar = async () => {
    const id = confirmar;
    setConfirmar(null);
    try {
      await api.delete(`/fornecedores/${id}`);
      toast.success('Fornecedor desativado');
      carregar();
    } catch {
      toast.error('Erro ao desativar');
    }
  };

  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  return (
    <>
      <div className="page-header">
        <h2>Fornecedores</h2>
        <p>A quem o negócio paga — usados nas contas a pagar</p>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
              </svg>
              <input placeholder="Buscar por nome ou CPF/CNPJ..." value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={abrirNovo}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
              </svg>
              Novo fornecedor
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Nome</th><th>CPF/CNPJ</th><th>Contato</th><th>Chave PIX</th><th /></tr>
              </thead>
              <tbody>
                {fornecedores.length === 0 ? (
                  <tr><td colSpan={5}><div className="empty-state"><p>Nenhum fornecedor cadastrado</p></div></td></tr>
                ) : fornecedores.map((f) => (
                  <tr key={f.id}>
                    <td><strong>{f.nome}</strong></td>
                    <td className="font-mono" style={{ fontSize: 12.5 }}>{f.cpf_cnpj || '—'}</td>
                    <td style={{ fontSize: 13 }}>
                      {f.telefone || '—'}
                      {f.email && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.email}</div>}
                    </td>
                    <td style={{ fontSize: 13 }}>{f.pix_chave || '—'}</td>
                    <td>
                      <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                        <button className="btn-icon" onClick={() => abrirEdicao(f)} title="Editar"><IconeEditar /></button>
                        <button className="btn-icon danger" onClick={() => setConfirmar(f.id)} title="Desativar"><IconeExcluir /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <CategoriasDespesa />
      </div>

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editId ? 'Editar fornecedor' : 'Novo fornecedor'}>
        <form onSubmit={salvar}>
          <div className="form-group">
            <label>Nome</label>
            <input value={form.nome} onChange={campo('nome')} maxLength={150} required autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>CPF/CNPJ (opcional)</label>
              <input value={form.cpf_cnpj} onChange={campo('cpf_cnpj')} placeholder="Só números ou com máscara" />
            </div>
            <div className="form-group">
              <label>Telefone</label>
              <input value={form.telefone} onChange={campo('telefone')} maxLength={30} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>E-mail</label>
              <input type="email" value={form.email} onChange={campo('email')} maxLength={150} />
            </div>
            <div className="form-group">
              <label>Chave PIX</label>
              <input value={form.pix_chave} onChange={campo('pix_chave')} maxLength={150} />
            </div>
          </div>
          <div className="form-group">
            <label>Observações</label>
            <textarea value={form.observacoes} onChange={campo('observacoes')} rows={3} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={desativar}
        title="Desativar fornecedor?"
        message="Ele sai da lista de novos lançamentos. As contas antigas continuam com o nome dele."
      />
    </>
  );
}
