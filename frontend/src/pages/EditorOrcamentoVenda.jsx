import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { fmtMoeda, fmtQtd, rotuloCategoria, fichaProduto } from '../utils/format';
import { calcularOrcamentoVenda } from '../utils/calculo';
import { ConfirmModal } from '../components/shared/Modal';

let contadorChave = 0;
const novaChave = () => `v${++contadorChave}`;

const linhaVazia = () => ({
  _key: novaChave(),
  produto_id: '',
  descricao: '',
  unidade: 'un',
  quantidade: '1',
  preco_unitario: '',
  desconto_tipo: 'percentual',
  desconto: '',
});

const tituloSecao = {
  fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.8px',
};

const IconePlus = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
  </svg>
);

export default function EditorOrcamentoVenda() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editando = Boolean(id);

  const [clientes, setClientes] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [form, setForm] = useState({
    cliente_id: '', observacao: '', desconto_tipo: 'percentual', desconto: '',
  });
  const [linhas, setLinhas] = useState([linhaVazia()]);

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [statusOrcamento, setStatusOrcamento] = useState(null);
  const [numeroOrcamento, setNumeroOrcamento] = useState(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        const [c, p] = await Promise.all([api.get('/clientes'), api.get('/produtos')]);
        setClientes(c.data);
        setCatalogo(p.data);

        if (editando) {
          const { data } = await api.get(`/orcamentos/${id}`);
          if (data.tipo !== 'produto') {
            toast.error('Este é um orçamento de impressão');
            return navigate(`/orcamentos/${id}`);
          }
          setForm({
            cliente_id: String(data.cliente_id),
            observacao: data.observacao || '',
            desconto_tipo: data.desconto_tipo,
            desconto: parseFloat(data.desconto) > 0 ? String(parseFloat(data.desconto)) : '',
          });
          setStatusOrcamento(data.status);
          setNumeroOrcamento(data.numero_orcamento);
          setLinhas(data.produtos.map((item) => ({
            _key: novaChave(),
            produto_id: item.produto_id ? String(item.produto_id) : '',
            descricao: item.descricao,
            unidade: item.unidade,
            quantidade: String(parseFloat(item.quantidade)),
            preco_unitario: String(parseFloat(item.preco_unitario)),
            desconto_tipo: item.desconto_tipo,
            desconto: parseFloat(item.desconto) > 0 ? String(parseFloat(item.desconto)) : '',
          })));
        }
      } catch (err) {
        toast.error(err.response?.data?.erro || 'Não foi possível carregar os dados');
        if (editando) navigate('/vendas');
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [id, editando, navigate]);

  const calculo = useMemo(
    () => calcularOrcamentoVenda({
      produtos: linhas,
      desconto_tipo: form.desconto_tipo,
      desconto: form.desconto,
    }),
    [linhas, form.desconto_tipo, form.desconto]
  );

  const atualizarLinha = (chave, campos) =>
    setLinhas((prev) => prev.map((l) => (l._key === chave ? { ...l, ...campos } : l)));

  // Escolher um produto do catálogo preenche descrição, unidade e preço de tabela.
  const escolherProduto = (chave, produtoId) => {
    const produto = catalogo.find((p) => p.id === parseInt(produtoId, 10));
    atualizarLinha(chave, produto
      ? {
        produto_id: produtoId,
        descricao: produto.nome,
        unidade: produto.unidade,
        preco_unitario: String(parseFloat(produto.preco_venda)),
      }
      : { produto_id: '', descricao: '', unidade: 'un', preco_unitario: '' });
  };

  const adicionarLinha = () => setLinhas((prev) => [...prev, linhaVazia()]);
  const removerLinha = (chave) =>
    setLinhas((prev) => (prev.length === 1 ? prev : prev.filter((l) => l._key !== chave)));

  const validar = () => {
    if (!form.cliente_id) return 'Selecione um cliente';
    for (const [i, l] of linhas.entries()) {
      const onde = `Produto ${i + 1}`;
      if (!l.produto_id && !l.descricao.trim()) return `${onde}: selecione um produto ou informe a descrição`;
      if (!(parseFloat(l.quantidade) > 0)) return `${onde}: quantidade deve ser maior que zero`;
      if (!(parseFloat(l.preco_unitario) >= 0)) return `${onde}: informe o preço unitário`;
      if (l.desconto_tipo === 'percentual' && parseFloat(l.desconto) > 100) {
        return `${onde}: desconto não pode passar de 100%`;
      }
    }
    if (form.desconto_tipo === 'percentual' && parseFloat(form.desconto) > 100) {
      return 'Desconto geral não pode passar de 100%';
    }
    return null;
  };

  const salvar = async (e) => {
    e.preventDefault();
    const erro = validar();
    if (erro) return toast.error(erro);

    const payload = {
      cliente_id: parseInt(form.cliente_id, 10),
      observacao: form.observacao,
      desconto_tipo: form.desconto_tipo,
      desconto: parseFloat(form.desconto) || 0,
      produtos: linhas.map((l) => ({
        produto_id: l.produto_id ? parseInt(l.produto_id, 10) : null,
        descricao: l.descricao,
        unidade: l.unidade,
        quantidade: parseFloat(l.quantidade),
        preco_unitario: parseFloat(l.preco_unitario),
        desconto_tipo: l.desconto_tipo,
        desconto: parseFloat(l.desconto) || 0,
      })),
    };

    setSalvando(true);
    try {
      if (editando) {
        await api.put(`/orcamentos-venda/${id}`, payload);
        toast.success('Orçamento de venda atualizado!');
        navigate(`/orcamentos/${id}`);
      } else {
        const { data } = await api.post('/orcamentos-venda', payload);
        toast.success(`Orçamento ${data.numero_orcamento} criado!`);
        navigate(`/orcamentos/${data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar orçamento');
    } finally {
      setSalvando(false);
    }
  };

  const clienteSelecionado = clientes.find((c) => c.id === parseInt(form.cliente_id, 10));

  if (carregando) {
    return <div className="loading-screen"><span className="spinner" /><span>Carregando...</span></div>;
  }

  return (
    <>
      <div className="page-header">
        <h2>{editando ? `Editar ${numeroOrcamento}` : 'Novo Orçamento de Venda'}</h2>
        <p>Venda de filamentos, peças e equipamentos — separado dos serviços de impressão</p>
      </div>

      <div className="page-content">
        {editando && statusOrcamento === 'aprovado' && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--warning)' }}>
            <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>
              Este orçamento já foi aprovado e virou Pedido de Venda
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Alterar os valores muda o que o cliente aprovou. A mudança fica registrada no histórico.
            </div>
          </div>
        )}

        <form onSubmit={salvar}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
            <div>
              {/* Cliente */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ ...tituloSecao, marginBottom: 14 }}>Cliente</h3>
                <div className="form-group">
                  <label>Selecione o cliente</label>
                  <select
                    value={form.cliente_id}
                    onChange={(e) => setForm((p) => ({ ...p, cliente_id: e.target.value }))}
                    required
                  >
                    <option value="">Selecione...</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>{c.nome} — {c.cpf_cnpj}</option>
                    ))}
                  </select>
                </div>
                {clienteSelecionado && (
                  <div style={{
                    background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                    padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
                  }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{clienteSelecionado.nome}</strong><br />
                    {clienteSelecionado.rua}, {clienteSelecionado.numero} — {clienteSelecionado.bairro}<br />
                    {clienteSelecionado.cidade}/{clienteSelecionado.estado} — CEP {clienteSelecionado.cep}
                  </div>
                )}
              </div>

              {/* Produtos */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                  <h3 style={tituloSecao}>Produtos ({linhas.length})</h3>
                  <button type="button" className="btn btn-primary btn-sm" onClick={adicionarLinha}>
                    <IconePlus /> Adicionar produto
                  </button>
                </div>

                {linhas.map((linha, i) => (
                  <LinhaProduto
                    key={linha._key}
                    linha={linha}
                    indice={i}
                    catalogo={catalogo}
                    calculo={calculo.produtos[i]}
                    podeRemover={linhas.length > 1}
                    onEscolherProduto={escolherProduto}
                    onChange={atualizarLinha}
                    onRemover={removerLinha}
                  />
                ))}
              </div>

              {/* Observações */}
              <div className="card">
                <h3 style={{ ...tituloSecao, marginBottom: 14 }}>Observações</h3>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <textarea
                    value={form.observacao}
                    onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                    placeholder="Condições de pagamento, prazo de entrega, garantia..."
                    rows={4}
                    maxLength={1000}
                    style={{ minHeight: 100 }}
                  />
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 4 }}>
                    {form.observacao.length}/1000
                  </div>
                </div>
              </div>
            </div>

            {/* Resumo */}
            <div style={{ position: 'sticky', top: 20 }}>
              <div className="card">
                <h3 style={{ ...tituloSecao, marginBottom: 16 }}>Resumo</h3>

                <div className="os-summary">
                  <div className="os-summary-row">
                    <span>Subtotal</span>
                    <span>{fmtMoeda(calculo.total_produtos)}</span>
                  </div>
                  {calculo.desconto_itens > 0 && (
                    <div className="os-summary-row">
                      <span>Descontos nos itens</span>
                      <span className="text-danger">- {fmtMoeda(calculo.desconto_itens)}</span>
                    </div>
                  )}
                  {calculo.desconto_geral > 0 && (
                    <div className="os-summary-row">
                      <span>Desconto geral</span>
                      <span className="text-danger">- {fmtMoeda(calculo.desconto_geral)}</span>
                    </div>
                  )}
                  <div className="os-summary-row total">
                    <span>TOTAL GERAL</span>
                    <span>{fmtMoeda(calculo.total_geral)}</span>
                  </div>
                </div>

                {/* Desconto geral */}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Desconto no total
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 78px', gap: 8, marginTop: 6 }}>
                    <input
                      type="number" step="0.01" min="0" placeholder="0"
                      value={form.desconto}
                      onChange={(e) => setForm((p) => ({ ...p, desconto: e.target.value }))}
                    />
                    <select
                      value={form.desconto_tipo}
                      onChange={(e) => setForm((p) => ({ ...p, desconto_tipo: e.target.value }))}
                    >
                      <option value="percentual">%</option>
                      <option value="valor">R$</option>
                    </select>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                    Aplicado depois dos descontos de cada item
                  </div>
                </div>

                <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button type="submit" className="btn btn-success" style={{ width: '100%', justifyContent: 'center' }} disabled={salvando}>
                    {salvando ? <span className="spinner" /> : (editando ? 'Salvar alterações' : 'Criar orçamento')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => setConfirmarSaida(true)}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      </div>

      <ConfirmModal
        isOpen={confirmarSaida}
        onClose={() => setConfirmarSaida(false)}
        onConfirm={() => navigate(editando ? `/orcamentos/${id}` : '/vendas')}
        title="Descartar alterações?"
        message="O que você preencheu nesta tela será perdido."
      />
    </>
  );
}

// ── Uma linha de produto ──────────────────────────────────────────────────
function LinhaProduto({
  linha, indice, catalogo, calculo, podeRemover, onEscolherProduto, onChange, onRemover,
}) {
  const produto = catalogo.find((p) => p.id === parseInt(linha.produto_id, 10));
  const campo = (nome) => (e) => onChange(linha._key, { [nome]: e.target.value });
  const avulso = !linha.produto_id;

  return (
    <div style={{
      padding: 12, marginBottom: 10, background: 'var(--bg-secondary)',
      borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent)',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <span style={{
          background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, fontSize: 11,
          width: 22, height: 22, borderRadius: '50%', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}>{indice + 1}</span>

        <select value={linha.produto_id} onChange={(e) => onEscolherProduto(linha._key, e.target.value)}>
          <option value="">Item avulso (fora do catálogo)</option>
          {catalogo.map((p) => (
            <option key={p.id} value={p.id}>
              [{rotuloCategoria(p.categoria)}] {p.nome}{fichaProduto(p) ? ` — ${fichaProduto(p)}` : ''}
            </option>
          ))}
        </select>

        {podeRemover && (
          <button type="button" className="btn-icon danger" onClick={() => onRemover(linha._key)} title="Remover">
            <svg viewBox="0 0 24 24" fill="none" style={{ width: 13, height: 13 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor" />
            </svg>
          </button>
        )}
      </div>

      {/* Item avulso precisa de descrição digitada; do catálogo já vem preenchida. */}
      {avulso && (
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label>Descrição do item</label>
          <input
            value={linha.descricao}
            onChange={campo('descricao')}
            placeholder="Ex: Peça usada, item de terceiro"
            maxLength={150}
          />
        </div>
      )}

      {produto && fichaProduto(produto) && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
          {fichaProduto(produto)}
          {produto.codigo && <span className="font-mono"> · {produto.codigo}</span>}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 110px 70px auto', gap: 8, alignItems: 'end' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Qtd ({linha.unidade})</label>
          <input type="number" step="0.001" min="0.001" value={linha.quantidade} onChange={campo('quantidade')} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Preço unitário</label>
          <input type="number" step="0.01" min="0" value={linha.preco_unitario} onChange={campo('preco_unitario')} placeholder="0,00" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>Desconto</label>
          <input type="number" step="0.01" min="0" value={linha.desconto} onChange={campo('desconto')} placeholder="0" />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label>&nbsp;</label>
          <select value={linha.desconto_tipo} onChange={campo('desconto_tipo')}>
            <option value="percentual">%</option>
            <option value="valor">R$</option>
          </select>
        </div>
        <div style={{ textAlign: 'right', paddingBottom: 2, minWidth: 90 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', padding: '7px 0' }}>
            {fmtMoeda(calculo?.total_item)}
          </div>
        </div>
      </div>

      {calculo?.total_desconto > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, textAlign: 'right' }}>
          {fmtQtd(linha.quantidade, linha.unidade)} × {fmtMoeda(linha.preco_unitario)} = {fmtMoeda(calculo.total_bruto)}
          <span className="text-danger"> − {fmtMoeda(calculo.total_desconto)} de desconto</span>
        </div>
      )}
    </div>
  );
}
