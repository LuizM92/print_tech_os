import React, { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import toast from 'react-hot-toast';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import { useAuth } from '../contexts/AuthContext';
import { fmtMoeda } from '../utils/format';

// Mesmas regras do backend (utils/sku.js), para o SKU aparecer montado enquanto digita.
const bloco = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const blocoTamanho = (valor) => {
  const t = bloco(valor) || 'U';
  return /^\d$/.test(t) ? `0${t}` : t;
};

const skuPaiDe = (form) => `${bloco(form.categoria)}-${bloco(form.modelo)}`;

const skuDe = (form, v) =>
  [bloco(form.categoria), bloco(form.modelo), bloco(v.material), bloco(v.variacao) || 'STD', blocoTamanho(v.tamanho)]
    .join('-');

const variacaoVazia = () => ({
  id: null, material: 'PLA', variacao: '', tamanho: '', nome_variacao: '', preco_venda: '', ativo: 1,
});

const formVazio = {
  categoria: 'BON', modelo: '', nome: '', descricao: '',
  variacoes: [variacaoVazia()],
  listagens: [],
};

export default function FabricacaoProdutos() {
  const { isAdmin } = useAuth();
  const [produtos, setProdutos] = useState([]);
  const [tabelas, setTabelas] = useState({ categorias: [], materiais: [], cores: [] });
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aberto, setAberto] = useState(null);

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(formVazio);
  const [salvando, setSalvando] = useState(false);
  const [confirmar, setConfirmar] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/fabricacao/produtos', {
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

  useEffect(() => {
    api.get('/fabricacao/tabelas')
      .then(({ data }) => setTabelas(data))
      .catch(() => toast.error('Erro ao carregar as tabelas do padrão de SKU'));
  }, []);

  const rotuloCategoria = (codigo) =>
    tabelas.categorias.find((c) => c.codigo === codigo)?.rotulo || codigo;

  const abrirNovo = () => { setEditando(null); setForm(formVazio); setModal(true); };

  const abrirEdicao = (p) => {
    setEditando(p);
    setForm({
      categoria: p.categoria,
      modelo: p.modelo,
      nome: p.nome,
      descricao: p.descricao || '',
      variacoes: p.variacoes.map((v) => ({
        id: v.id, material: v.material, variacao: v.variacao, tamanho: v.tamanho,
        nome_variacao: v.nome_variacao || '',
        preco_venda: String(parseFloat(v.preco_venda)),
        ativo: v.ativo,
      })),
      listagens: p.listagens.map((l) => ({ loja: l.loja, product_id: l.product_id || '' })),
    });
    setModal(true);
  };

  const campo = (nome) => (e) => setForm((p) => ({ ...p, [nome]: e.target.value }));

  const mudarVariacao = (i, nome, valor) =>
    setForm((p) => ({
      ...p,
      variacoes: p.variacoes.map((v, idx) => (idx === i ? { ...v, [nome]: valor } : v)),
    }));

  const addVariacao = () => setForm((p) => ({ ...p, variacoes: [...p.variacoes, variacaoVazia()] }));

  const removerVariacao = (i) =>
    setForm((p) => ({ ...p, variacoes: p.variacoes.filter((_, idx) => idx !== i) }));

  const mudarListagem = (i, nome, valor) =>
    setForm((p) => ({
      ...p,
      listagens: p.listagens.map((l, idx) => (idx === i ? { ...l, [nome]: valor } : l)),
    }));

  const addListagem = () =>
    setForm((p) => ({ ...p, listagens: [...p.listagens, { loja: '', product_id: '' }] }));

  const removerListagem = (i) =>
    setForm((p) => ({ ...p, listagens: p.listagens.filter((_, idx) => idx !== i) }));

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return toast.error('Informe o nome do produto');
    if (bloco(form.modelo).length < 3) return toast.error('O modelo precisa de ao menos 3 caracteres');
    if (form.variacoes.length === 0) return toast.error('Cadastre ao menos uma variação');

    const skus = form.variacoes.map((v) => skuDe(form, v));
    const repetido = skus.find((s, i) => skus.indexOf(s) !== i);
    if (repetido) return toast.error(`A variação ${repetido} está repetida`);

    setSalvando(true);
    try {
      if (editando) {
        await api.put(`/fabricacao/produtos/${editando.id}`, form);
        toast.success('Produto atualizado');
      } else {
        await api.post('/fabricacao/produtos', form);
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
      await api.delete(`/fabricacao/produtos/${confirmar.id}`);
      toast.success('Produto descontinuado');
      setConfirmar(null);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao remover');
    }
  };

  return (
    <>
      <div className="page-header">
        <h2>Produtos</h2>
        <p>Catálogo de fabricação própria — SKU pai e variações no padrão CAT-MODELO-MAT-VAR-TAM</p>
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
                  placeholder="Buscar por nome, modelo ou SKU..."
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
                {tabelas.categorias.map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.rotulo}</option>
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
                  <th style={{ width: 32 }} />
                  <th>SKU pai</th>
                  <th>Produto</th>
                  <th>Categoria</th>
                  <th>Variações</th>
                  <th>Lojas</th>
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
                      <p>{busca || categoria ? 'Nada encontrado com esses filtros' : 'Cadastre o primeiro produto de fabricação'}</p>
                    </div>
                  </td></tr>
                ) : produtos.map((p) => {
                  const ativas = p.variacoes.filter((v) => v.ativo);
                  return (
                    <React.Fragment key={p.id}>
                      <tr>
                        <td>
                          <button
                            className="btn-icon"
                            onClick={() => setAberto(aberto === p.id ? null : p.id)}
                            title={aberto === p.id ? 'Fechar variações' : 'Ver variações'}
                          >
                            <svg viewBox="0 0 24 24" fill="none" style={{
                              width: 14, height: 14,
                              transform: aberto === p.id ? 'rotate(90deg)' : 'none',
                              transition: 'transform .15s',
                            }}>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" stroke="currentColor" />
                            </svg>
                          </button>
                        </td>
                        <td>
                          <span className="font-mono" style={{ fontSize: 12, fontWeight: 600 }}>{p.sku_pai}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{p.nome}</div>
                          {p.descricao && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{p.descricao}</div>
                          )}
                        </td>
                        <td><span className="badge badge-operador">{rotuloCategoria(p.categoria)}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {ativas.length} ativa{ativas.length === 1 ? '' : 's'}
                          {p.variacoes.length > ativas.length && (
                            <span style={{ color: 'var(--text-muted)' }}>
                              {' '}· {p.variacoes.length - ativas.length} aposentada(s)
                            </span>
                          )}
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {p.listagens.map((l) => l.loja).join(', ') || '—'}
                        </td>
                        {isAdmin() && (
                          <td>
                            <div className="flex gap-2">
                              <button className="btn-icon" onClick={() => abrirEdicao(p)} title="Editar">
                                <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" />
                                </svg>
                              </button>
                              <button className="btn-icon danger" onClick={() => setConfirmar(p)} title="Descontinuar">
                                <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22" stroke="currentColor" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>

                      {aberto === p.id && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--bg-hover, rgba(0,0,0,.02))' }}>
                            <table style={{ margin: 0 }}>
                              <thead>
                                <tr>
                                  <th>SKU</th>
                                  <th>Material</th>
                                  <th>Variação</th>
                                  <th>Tamanho</th>
                                  <th>Preço</th>
                                  <th>Situação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {p.variacoes.map((v) => (
                                  <tr key={v.id} style={{ opacity: v.ativo ? 1 : 0.55 }}>
                                    <td><span className="font-mono" style={{ fontSize: 12 }}>{v.sku}</span></td>
                                    <td>{v.material}</td>
                                    <td>
                                      {v.variacao}
                                      {v.nome_variacao && (
                                        <span style={{ color: 'var(--text-muted)' }}> · {v.nome_variacao}</span>
                                      )}
                                    </td>
                                    <td>{v.tamanho}</td>
                                    <td className="text-success fw-bold">{fmtMoeda(v.preco_venda)}</td>
                                    <td>
                                      <span className={`badge ${v.ativo ? 'badge-aprovado' : 'badge-cancelado'}`}>
                                        {v.ativo ? 'Ativa' : 'Aposentada'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editando ? `Editar ${editando.sku_pai}` : 'Novo produto de fabricação'}
        size="lg"
      >
        <form onSubmit={salvar}>
          <div className="form-row">
            <div className="form-group">
              <label>Categoria *</label>
              <select value={form.categoria} onChange={campo('categoria')} disabled={!!editando}>
                {tabelas.categorias.map((c) => (
                  <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.rotulo}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Modelo * (3 a 12 caracteres)</label>
              <input
                value={form.modelo}
                onChange={campo('modelo')}
                placeholder="Ex: PACMAN"
                maxLength={12}
                disabled={!!editando}
                required
              />
            </div>
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Nome do produto *</label>
              <input value={form.nome} onChange={campo('nome')} placeholder="Ex: Vaso Pacman decorativo" required />
            </div>
          </div>

          <div className="form-group">
            <label>SKU pai</label>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)' }}>
              {skuPaiDe(form) || '—'}
            </div>
            <small style={{ color: 'var(--text-muted)' }}>
              {editando
                ? 'Categoria e modelo não mudam depois de gravados — o SKU já está anunciado lá fora.'
                : 'Montado a partir da categoria e do modelo. Confira antes de salvar: depois ele não muda.'}
            </small>
          </div>

          <div className="form-group">
            <label>Descrição</label>
            <textarea value={form.descricao} onChange={campo('descricao')} rows={2} placeholder="Observações sobre o produto" />
          </div>

          {/* ── Variações ──────────────────────────────────────────────── */}
          <div className="form-group">
            <label>Variações *</label>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 110 }}>Material</th>
                    <th style={{ width: 130 }}>Variação</th>
                    <th style={{ width: 90 }}>Tamanho</th>
                    <th>Nome da variação</th>
                    <th style={{ width: 110 }}>Preço</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {form.variacoes.map((v, i) => (
                    <React.Fragment key={i}>
                      <tr>
                        <td>
                          <select value={v.material} onChange={(e) => mudarVariacao(i, 'material', e.target.value)}>
                            {tabelas.materiais.map((m) => (
                              <option key={m.codigo} value={m.codigo}>{m.codigo}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            list="cores-sku"
                            value={v.variacao}
                            onChange={(e) => mudarVariacao(i, 'variacao', e.target.value)}
                            placeholder="AZL / V1 / STD"
                            maxLength={8}
                          />
                        </td>
                        <td>
                          <input
                            value={v.tamanho}
                            onChange={(e) => mudarVariacao(i, 'tamanho', e.target.value)}
                            placeholder="U / P / 02"
                            maxLength={4}
                          />
                        </td>
                        <td>
                          <input
                            value={v.nome_variacao}
                            onChange={(e) => mudarVariacao(i, 'nome_variacao', e.target.value)}
                            placeholder="Como aparece no anúncio"
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={v.preco_venda}
                            onChange={(e) => mudarVariacao(i, 'preco_venda', e.target.value)}
                          />
                        </td>
                        <td>
                          {form.variacoes.length > 1 && (
                            <button type="button" className="btn-icon danger" onClick={() => removerVariacao(i)} title="Remover">
                              <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={6} style={{ paddingTop: 0, borderTop: 'none' }}>
                          <span className="font-mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {skuDe(form, v)}
                          </span>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <datalist id="cores-sku">
              {tabelas.cores.map((c) => <option key={c.codigo} value={c.codigo}>{c.rotulo}</option>)}
            </datalist>
            <button type="button" className="btn btn-ghost" onClick={addVariacao} style={{ marginTop: 8 }}>
              + Adicionar variação
            </button>
            {editando && (
              <small style={{ display: 'block', color: 'var(--text-muted)', marginTop: 6 }}>
                Variação removida daqui vira <strong>aposentada</strong>: o SKU fica reservado e nunca é reaproveitado.
              </small>
            )}
          </div>

          {/* ── Lojas ──────────────────────────────────────────────────── */}
          <div className="form-group">
            <label>Anunciado em</label>
            {form.listagens.map((l, i) => (
              <div className="flex gap-2" key={i} style={{ marginBottom: 6 }}>
                <input
                  value={l.loja}
                  onChange={(e) => mudarListagem(i, 'loja', e.target.value)}
                  placeholder="Loja (ex: print_tech3d)"
                />
                <input
                  value={l.product_id}
                  onChange={(e) => mudarListagem(i, 'product_id', e.target.value)}
                  placeholder="ID do anúncio"
                />
                <button type="button" className="btn-icon danger" onClick={() => removerListagem(i)} title="Remover">
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost" onClick={addListagem}>+ Adicionar loja</button>
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
        title="Descontinuar produto?"
        message={`${confirmar?.sku_pai} e suas variações saem do catálogo. Os SKUs ficam aposentados e nunca são reaproveitados.`}
      />
    </>
  );
}
