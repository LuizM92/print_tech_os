import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import { useAuth } from '../contexts/AuthContext';
import {
  fmtMoeda, fmtNum, CATEGORIAS_PRODUTO, UNIDADES_PRODUTO,
  rotuloCategoria, ehConsumivel, fichaProduto,
} from '../utils/format';

const formVazio = {
  codigo: '', nome: '', categoria: 'filamento', marca: '', cor: '', tipo_material: '',
  diametro_mm: '', peso_liquido_g: '', especificacao: '', unidade: 'rolo',
  preco_venda: '', descricao: '',
};

export default function Produtos() {
  const { isAdmin } = useAuth();
  const [produtos, setProdutos] = useState([]);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [carregando, setCarregando] = useState(true);

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/produtos', {
        params: { categoria: categoria || undefined, busca: busca || undefined },
      });
      setProdutos(data);
    } catch {
      toast.error('Erro ao carregar produtos');
    } finally {
      setCarregando(false);
    }
  }, [categoria, busca]);

  useEffect(() => {
    const timer = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(timer);
  }, [carregar, busca]);

  const abrirNovo = () => { setEditando(null); setForm(formVazio); setModal(true); };

  const abrirEdicao = (p) => {
    setEditando(p);
    setForm({
      codigo: p.codigo || '', nome: p.nome, categoria: p.categoria,
      marca: p.marca || '', cor: p.cor || '', tipo_material: p.tipo_material || '',
      diametro_mm: p.diametro_mm != null ? String(parseFloat(p.diametro_mm)) : '',
      peso_liquido_g: p.peso_liquido_g != null ? String(parseFloat(p.peso_liquido_g)) : '',
      especificacao: p.especificacao || '', unidade: p.unidade,
      preco_venda: String(parseFloat(p.preco_venda)), descricao: p.descricao || '',
    });
    setModal(true);
  };

  const campo = (nome) => (e) => setForm((p) => ({ ...p, [nome]: e.target.value }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error('Informe o nome do produto');
    if (!(parseFloat(form.preco_venda) >= 0)) return toast.error('Informe um preço de venda válido');

    setSalvando(true);
    try {
      if (editando) {
        await api.put(`/produtos/${editando.id}`, form);
        toast.success('Produto atualizado');
      } else {
        await api.post('/produtos', form);
        toast.success('Produto cadastrado');
      }
      setModal(false);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar produto');
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    try {
      await api.delete(`/produtos/${confirmar.id}`);
      toast.success('Produto removido');
      setConfirmar(null);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao remover');
    }
  };

  const mostraConsumivel = ehConsumivel(form.categoria);

  return (
    <>
      <div className="page-header">
        <h2>Produtos</h2>
        <p>Catálogo de filamentos, peças e equipamentos usados nos orçamentos de venda</p>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="toolbar">
            <div className="flex gap-3 items-center" style={{ flex: 1 }}>
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
                </svg>
                <input
                  placeholder="Buscar por nome, marca, cor ou código..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
              <select
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                style={{ width: 'auto', flex: 'none' }}
              >
                <option value="">Todas as categorias</option>
                {CATEGORIAS_PRODUTO.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                ))}
              </select>
            </div>
            {isAdmin() && (
              <button className="btn btn-primary" onClick={abrirNovo}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
                </svg>
                Novo Produto
              </button>
            )}
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Especificação</th>
                  <th>Unidade</th>
                  <th>Preço</th>
                  {isAdmin() && <th style={{ width: 90 }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={7}><div className="empty-state"><span className="spinner" /></div></td></tr>
                ) : produtos.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <h3>Nenhum produto</h3>
                      <p>{busca || categoria ? 'Nada encontrado com esses filtros' : 'Cadastre o primeiro produto'}</p>
                    </div>
                  </td></tr>
                ) : produtos.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {p.codigo || '—'}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{p.nome}</div>
                      {fichaProduto(p) && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fichaProduto(p)}</div>
                      )}
                    </td>
                    <td><span className="badge badge-operador">{rotuloCategoria(p.categoria)}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      {[
                        p.diametro_mm && `Ø ${fmtNum(p.diametro_mm)} mm`,
                        p.peso_liquido_g && `${fmtNum(p.peso_liquido_g, 0)} g`,
                      ].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.unidade}</td>
                    <td className="text-success fw-bold">{fmtMoeda(p.preco_venda)}</td>
                    {isAdmin() && (
                      <td>
                        <div className="flex gap-2">
                          <button className="btn-icon" onClick={() => abrirEdicao(p)} title="Editar">
                            <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" />
                            </svg>
                          </button>
                          <button className="btn-icon danger" onClick={() => setConfirmar(p)} title="Remover">
                            <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" stroke="currentColor" />
                            </svg>
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

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editando ? 'Editar produto' : 'Novo produto'}
        size="lg"
      >
        <form onSubmit={salvar}>
          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Nome do produto *</label>
              <input value={form.nome} onChange={campo('nome')} placeholder="Ex: Filamento PLA 1,75mm 1kg" required />
            </div>
            <div className="form-group">
              <label>Código / SKU</label>
              <input value={form.codigo} onChange={campo('codigo')} placeholder="Opcional" />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Categoria</label>
              <select value={form.categoria} onChange={campo('categoria')}>
                {CATEGORIAS_PRODUTO.map((c) => (
                  <option key={c.valor} value={c.valor}>{c.rotulo}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Marca</label>
              <input value={form.marca} onChange={campo('marca')} placeholder="Ex: Creality" />
            </div>
            <div className="form-group">
              <label>Unidade de venda</label>
              <select value={form.unidade} onChange={campo('unidade')}>
                {UNIDADES_PRODUTO.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Cor, material, diâmetro e peso só fazem sentido em filamento e resina. */}
          {mostraConsumivel && (
            <div className="form-row">
              <div className="form-group">
                <label>Cor</label>
                <input value={form.cor} onChange={campo('cor')} placeholder="Ex: Preto" />
              </div>
              <div className="form-group">
                <label>Tipo de material</label>
                <input value={form.tipo_material} onChange={campo('tipo_material')} placeholder="Ex: PLA, ABS, PETG" />
              </div>
              <div className="form-group">
                <label>Diâmetro (mm)</label>
                <input type="number" step="0.01" min="0" value={form.diametro_mm} onChange={campo('diametro_mm')} placeholder="1,75" />
              </div>
              <div className="form-group">
                <label>Peso líquido (g)</label>
                <input type="number" step="1" min="0" value={form.peso_liquido_g} onChange={campo('peso_liquido_g')} placeholder="1000" />
              </div>
            </div>
          )}

          {!mostraConsumivel && (
            <div className="form-row">
              <div className="form-group">
                <label>Cor</label>
                <input value={form.cor} onChange={campo('cor')} placeholder="Opcional" />
              </div>
              <div className="form-group">
                <label>Material</label>
                <input value={form.tipo_material} onChange={campo('tipo_material')} placeholder="Ex: Latão, Aço" />
              </div>
            </div>
          )}

          <div className="form-row">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Especificação</label>
              <input value={form.especificacao} onChange={campo('especificacao')} placeholder="Ex: Bobina 1 kg · Rosca M6" />
            </div>
            <div className="form-group">
              <label>Preço de venda (R$) *</label>
              <input type="number" step="0.01" min="0" value={form.preco_venda} onChange={campo('preco_venda')} required />
            </div>
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <textarea value={form.descricao} onChange={campo('descricao')} rows={2} placeholder="Observações sobre o produto" />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? <span className="spinner" /> : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={excluir}
        title="Remover produto?"
        message={`${confirmar?.nome} sai do catálogo. Orçamentos que já usam esse produto não mudam.`}
      />
    </>
  );
}
