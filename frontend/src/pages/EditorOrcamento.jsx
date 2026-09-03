import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { fmtMoeda, fmtNum } from '../utils/format';
import { calcularOrcamento } from '../utils/calculo';
import { ConfirmModal } from '../components/shared/Modal';
import SeletorCliente from '../components/shared/SeletorCliente';

let contadorChave = 0;
const novaChave = () => `k${++contadorChave}`;

const itemVazio = () => ({
  _key: novaChave(),
  descricao: '',
  material_id: '',
  tipo_peca: 'tecnica',
  peso_gramas: '',
  horas_impressao: '',
  quantidade: '1',
  servicos: [],
});

const servicoVazio = () => ({ _key: novaChave(), servico_id: '', quantidade_horas: '' });

const IconePlus = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
  </svg>
);

const IconeX = ({ size = 14 }) => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: size, height: size }}>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor" />
  </svg>
);

const tituloSecao = {
  fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.8px',
};

export default function EditorOrcamento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editando = Boolean(id);

  const [clientes, setClientes] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [servicos, setServicos] = useState([]);
  const [valorHoraMaquina, setValorHoraMaquina] = useState(7.0);

  const [form, setForm] = useState({ cliente_id: '', observacao: '' });
  const [itens, setItens] = useState([itemVazio()]);
  const [servicosGerais, setServicosGerais] = useState([]);

  // Preços com que este orçamento já foi fechado. Enquanto o material/serviço seguir
  // no orçamento, é esse preço que vale — no preview e no que o servidor grava.
  const [custosOrcados, setCustosOrcados] = useState({ materiais: new Map(), servicos: new Map() });

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [confirmarSaida, setConfirmarSaida] = useState(false);
  const [statusOrcamento, setStatusOrcamento] = useState(null);
  const [numeroOrcamento, setNumeroOrcamento] = useState(null);

  useEffect(() => {
    const carregar = async () => {
      try {
        const [c, m, s, cfg] = await Promise.all([
          api.get('/clientes'), api.get('/materiais'), api.get('/servicos'), api.get('/configuracoes'),
        ]);
        setClientes(c.data);
        setMateriais(m.data);
        setServicos(s.data);

        const horaMaquina = cfg.data.find((x) => x.chave === 'valor_hora_maquina');
        if (horaMaquina) setValorHoraMaquina(parseFloat(horaMaquina.valor));

        if (editando) {
          const { data } = await api.get(`/orcamentos/${id}`);
          setForm({ cliente_id: String(data.cliente_id), observacao: data.observacao || '' });
          setStatusOrcamento(data.status);
          setNumeroOrcamento(data.numero_orcamento);
          // Preserva o hora-máquina com que o orçamento foi feito, não o valor atual.
          setValorHoraMaquina(parseFloat(data.valor_hora_maquina));

          const todosServicos = [...data.itens.flatMap((i) => i.servicos), ...data.servicos_gerais];
          setCustosOrcados({
            materiais: new Map(data.itens.map((i) => [i.material_id, parseFloat(i.custo_por_grama)])),
            servicos: new Map(todosServicos.map((s) => [s.servico_id, parseFloat(s.valor_hora)])),
          });

          setItens(
            data.itens.map((item) => ({
              _key: novaChave(),
              id: item.id,
              descricao: item.descricao || '',
              material_id: String(item.material_id),
              tipo_peca: item.tipo_peca,
              peso_gramas: String(parseFloat(item.peso_gramas)),
              horas_impressao: String(parseFloat(item.horas_impressao)),
              quantidade: String(item.quantidade),
              servicos: item.servicos.map((sv) => ({
                _key: novaChave(),
                id: sv.id,
                servico_id: String(sv.servico_id),
                quantidade_horas: String(parseFloat(sv.quantidade_horas)),
              })),
            }))
          );
          setServicosGerais(
            data.servicos_gerais.map((sv) => ({
              _key: novaChave(),
              id: sv.id,
              servico_id: String(sv.servico_id),
              quantidade_horas: String(parseFloat(sv.quantidade_horas)),
            }))
          );
        }
      } catch (err) {
        toast.error(err.response?.data?.erro || 'Não foi possível carregar os dados');
        if (editando) navigate('/orcamentos');
      } finally {
        setCarregando(false);
      }
    };
    carregar();
  }, [id, editando, navigate]);

  // ── Cálculo ao vivo (o valor gravado é sempre o que o servidor calcula) ──
  const calculo = useMemo(
    () => calcularOrcamento(
      { itens, servicos_gerais: servicosGerais },
      {
        valorHoraMaquina, materiais, servicos,
        materiaisOrcados: custosOrcados.materiais,
        servicosOrcados: custosOrcados.servicos,
      }
    ),
    [itens, servicosGerais, valorHoraMaquina, materiais, servicos, custosOrcados]
  );

  // ── Manipulação de itens ────────────────────────────────────────────────
  const atualizarItem = useCallback((chave, campo, valor) => {
    setItens((prev) => prev.map((i) => (i._key === chave ? { ...i, [campo]: valor } : i)));
  }, []);

  const adicionarItem = () => setItens((prev) => [...prev, itemVazio()]);

  const removerItem = (chave) =>
    setItens((prev) => (prev.length === 1 ? prev : prev.filter((i) => i._key !== chave)));

  const duplicarItem = (chave) =>
    setItens((prev) => {
      const original = prev.find((i) => i._key === chave);
      const copia = {
        ...original,
        _key: novaChave(),
        id: undefined, // cópia é item novo: pega o custo atual do cadastro
        servicos: original.servicos.map((s) => ({ ...s, _key: novaChave(), id: undefined })),
      };
      const indice = prev.findIndex((i) => i._key === chave);
      return [...prev.slice(0, indice + 1), copia, ...prev.slice(indice + 1)];
    });

  const adicionarServicoItem = (chaveItem) =>
    setItens((prev) => prev.map((i) =>
      i._key === chaveItem ? { ...i, servicos: [...i.servicos, servicoVazio()] } : i));

  const atualizarServicoItem = (chaveItem, chaveServico, campo, valor) =>
    setItens((prev) => prev.map((i) =>
      i._key === chaveItem
        ? { ...i, servicos: i.servicos.map((s) => (s._key === chaveServico ? { ...s, [campo]: valor } : s)) }
        : i));

  const removerServicoItem = (chaveItem, chaveServico) =>
    setItens((prev) => prev.map((i) =>
      i._key === chaveItem ? { ...i, servicos: i.servicos.filter((s) => s._key !== chaveServico) } : i));

  // ── Envio ───────────────────────────────────────────────────────────────
  const montarPayload = () => ({
    cliente_id: parseInt(form.cliente_id, 10),
    observacao: form.observacao,
    itens: itens.map((item) => ({
      id: item.id,
      descricao: item.descricao,
      material_id: parseInt(item.material_id, 10),
      tipo_peca: item.tipo_peca,
      peso_gramas: parseFloat(item.peso_gramas),
      horas_impressao: parseFloat(item.horas_impressao),
      quantidade: parseInt(item.quantidade, 10),
      servicos: item.servicos
        .filter((s) => s.servico_id && s.quantidade_horas)
        .map((s) => ({ id: s.id, servico_id: parseInt(s.servico_id, 10), quantidade_horas: parseFloat(s.quantidade_horas) })),
    })),
    servicos_gerais: servicosGerais
      .filter((s) => s.servico_id && s.quantidade_horas)
      .map((s) => ({ id: s.id, servico_id: parseInt(s.servico_id, 10), quantidade_horas: parseFloat(s.quantidade_horas) })),
  });

  const validar = () => {
    if (!form.cliente_id) return 'Selecione um cliente';
    for (const [i, item] of itens.entries()) {
      const onde = `Item ${i + 1}`;
      if (!item.material_id) return `${onde}: selecione o material`;
      if (!(parseFloat(item.peso_gramas) > 0)) return `${onde}: informe o peso em gramas`;
      if (!(parseFloat(item.horas_impressao) > 0)) return `${onde}: informe as horas de impressão`;
      if (!(parseInt(item.quantidade, 10) > 0)) return `${onde}: quantidade deve ser maior que zero`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const erro = validar();
    if (erro) return toast.error(erro);

    setSalvando(true);
    try {
      if (editando) {
        await api.put(`/orcamentos/${id}`, montarPayload());
        toast.success('Orçamento atualizado!');
        navigate(`/orcamentos/${id}`);
      } else {
        const { data } = await api.post('/orcamentos', montarPayload());
        toast.success(`Orçamento ${data.numero_orcamento} criado!`);
        navigate(`/orcamentos/${data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar orçamento');
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return <div className="loading-screen"><span className="spinner" /><span>Carregando...</span></div>;
  }

  return (
    <>
      <div className="page-header">
        <h2>{editando ? `Editar ${numeroOrcamento}` : 'Novo Orçamento'}</h2>
        <p>
          {editando
            ? 'As alterações são recalculadas e registradas no histórico do orçamento'
            : 'Monte o orçamento com quantos itens forem necessários'}
        </p>
      </div>

      <div className="page-content">
        {editando && statusOrcamento === 'aprovado' && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--warning)' }}>
            <div style={{ fontSize: 13, color: 'var(--warning)', fontWeight: 600, marginBottom: 4 }}>
              Este orçamento já foi aprovado e virou Ordem de Serviço
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Alterar os valores muda o que o cliente aprovou. A mudança fica registrada no histórico.
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
            <div>
              {/* ── Cliente ─────────────────────────────────────────── */}
              <div className="card" style={{ marginBottom: 16 }}>
                <h3 style={{ ...tituloSecao, marginBottom: 14 }}>Cliente</h3>
                <SeletorCliente
                  clientes={clientes}
                  valor={form.cliente_id}
                  onChange={(id) => setForm((p) => ({ ...p, cliente_id: id }))}
                />
              </div>

              {/* ── Itens ───────────────────────────────────────────── */}
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <h3 style={tituloSecao}>Itens do orçamento ({itens.length})</h3>
                <button type="button" className="btn btn-primary btn-sm" onClick={adicionarItem}>
                  <IconePlus /> Adicionar item
                </button>
              </div>

              {itens.map((item, indice) => (
                <ItemCard
                  key={item._key}
                  item={item}
                  indice={indice}
                  podeRemover={itens.length > 1}
                  materiais={materiais}
                  servicos={servicos}
                  valorHoraMaquina={valorHoraMaquina}
                  calculo={calculo.itens[indice]}
                  onChange={atualizarItem}
                  onRemover={removerItem}
                  onDuplicar={duplicarItem}
                  onAddServico={adicionarServicoItem}
                  onChangeServico={atualizarServicoItem}
                  onRemoverServico={removerServicoItem}
                />
              ))}

              {/* ── Serviços gerais ─────────────────────────────────── */}
              <div className="card" style={{ marginBottom: 16 }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
                  <div>
                    <h3 style={tituloSecao}>Serviços gerais do orçamento</h3>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                      Serviços que cobrem o trabalho inteiro, não um item específico
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setServicosGerais((p) => [...p, servicoVazio()])}
                  >
                    <IconePlus /> Adicionar
                  </button>
                </div>

                {servicosGerais.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)', fontSize: 13 }}>
                    Nenhum serviço geral
                  </div>
                ) : (
                  servicosGerais.map((s) => (
                    <LinhaServico
                      key={s._key}
                      servico={s}
                      servicos={servicos}
                      onChange={(campo, valor) =>
                        setServicosGerais((p) => p.map((x) => (x._key === s._key ? { ...x, [campo]: valor } : x)))}
                      onRemover={() => setServicosGerais((p) => p.filter((x) => x._key !== s._key))}
                    />
                  ))
                )}
              </div>

              {/* ── Observações ─────────────────────────────────────── */}
              <div className="card">
                <h3 style={{ ...tituloSecao, marginBottom: 14 }}>Observações</h3>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <textarea
                    value={form.observacao}
                    onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                    placeholder="Informações adicionais sobre o orçamento..."
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

            {/* ── Resumo ────────────────────────────────────────────── */}
            <div style={{ position: 'sticky', top: 20 }}>
              <div className="card">
                <h3 style={{ ...tituloSecao, marginBottom: 16 }}>Resumo</h3>

                <div className="os-summary">
                  {itens.map((item, i) => (
                    <div className="os-summary-row" key={item._key}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>
                        {item.descricao || `Item ${i + 1}`}
                        {parseInt(item.quantidade, 10) > 1 && (
                          <span style={{ color: 'var(--text-muted)' }}> ×{item.quantidade}</span>
                        )}
                      </span>
                      <span>{fmtMoeda(calculo.itens[i]?.total_item)}</span>
                    </div>
                  ))}

                  {calculo.total_servicos_gerais > 0 && (
                    <div className="os-summary-row">
                      <span>Serviços gerais</span>
                      <span>{fmtMoeda(calculo.total_servicos_gerais)}</span>
                    </div>
                  )}

                  <div className="os-summary-row total">
                    <span>TOTAL GERAL</span>
                    <span>{fmtMoeda(calculo.total_geral)}</span>
                  </div>
                </div>

                <div style={{
                  marginTop: 16, padding: '10px 12px', background: 'var(--warning-dim)',
                  borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--warning)',
                }}>
                  Hora-Máquina: {fmtMoeda(valorHoraMaquina)}/h
                  {editando && <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>(do orçamento)</span>}
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
        onConfirm={() => navigate(editando ? `/orcamentos/${id}` : '/orcamentos')}
        title="Descartar alterações?"
        message="O que você preencheu nesta tela será perdido."
      />
    </>
  );
}

// ── Card de um item ───────────────────────────────────────────────────────
function ItemCard({
  item, indice, podeRemover, materiais, servicos, valorHoraMaquina, calculo,
  onChange, onRemover, onDuplicar, onAddServico, onChangeServico, onRemoverServico,
}) {
  const material = materiais.find((m) => m.id === parseInt(item.material_id, 10));
  const campo = (nome) => (e) => onChange(item._key, nome, e.target.value);

  return (
    <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid var(--accent)' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <div className="flex items-center gap-3">
          <span style={{
            background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, fontSize: 12,
            width: 24, height: 24, borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
          }}>
            {indice + 1}
          </span>
          <input
            value={item.descricao}
            onChange={campo('descricao')}
            placeholder={`Item ${indice + 1} — descrição opcional (ex: Suporte do motor)`}
            maxLength={150}
            style={{ border: 'none', background: 'transparent', fontWeight: 600, padding: 0, fontSize: 14 }}
          />
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onDuplicar(item._key)} title="Duplicar item">
            Duplicar
          </button>
          {podeRemover && (
            <button type="button" className="btn-icon danger" onClick={() => onRemover(item._key)} title="Remover item">
              <IconeX />
            </button>
          )}
        </div>
      </div>

      <div className="form-row">
        <div className="form-group" style={{ gridColumn: 'span 2' }}>
          <label>Material / Filamento</label>
          <select value={item.material_id} onChange={campo('material_id')} required>
            <option value="">Selecione o material...</option>
            {materiais.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} — R$ {fmtNum(m.custo_por_grama, 4)}/g
              </option>
            ))}
          </select>
          {material && calculo && parseFloat(material.custo_por_grama) !== calculo.custo_por_grama && (
            <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
              Orçado a R$ {fmtNum(calculo.custo_por_grama, 4)}/g — o preço do orçamento vale
              até você usar "Atualizar preços do cadastro"
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Tipo de Peça</label>
          <select value={item.tipo_peca} onChange={campo('tipo_peca')}>
            <option value="tecnica">Peça Técnica</option>
            <option value="decorativa">Decorativa</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label>Peso (gramas)</label>
          <input type="number" step="0.01" min="0.01" value={item.peso_gramas} onChange={campo('peso_gramas')} placeholder="Ex: 200" required />
          {material && parseFloat(item.peso_gramas) > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Material: {fmtMoeda(calculo?.custo_material)}
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Horas de Impressão</label>
          <input type="number" step="0.1" min="0.1" value={item.horas_impressao} onChange={campo('horas_impressao')} placeholder="Ex: 2.5" required />
          {parseFloat(item.horas_impressao) > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              Impressão: {fmtMoeda(calculo?.custo_impressao)}
              <span style={{ marginLeft: 4, color: 'var(--warning)' }}>({fmtMoeda(valorHoraMaquina)}/h)</span>
            </div>
          )}
        </div>
        <div className="form-group">
          <label>Quantidade</label>
          <input type="number" min="1" value={item.quantidade} onChange={campo('quantidade')} required />
        </div>
      </div>

      {/* Serviços deste item */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: item.servicos.length ? 10 : 0 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            Serviços deste item
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAddServico(item._key)}>
            <IconePlus /> Serviço
          </button>
        </div>

        {item.servicos.map((s) => (
          <LinhaServico
            key={s._key}
            servico={s}
            servicos={servicos}
            onChange={(nome, valor) => onChangeServico(item._key, s._key, nome, valor)}
            onRemover={() => onRemoverServico(item._key, s._key)}
          />
        ))}
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 13,
      }}>
        <span style={{ color: 'var(--text-muted)' }}>
          {fmtMoeda(calculo?.valor_por_peca)} × {item.quantidade || 0} un
          {calculo?.total_servicos > 0 && ` + ${fmtMoeda(calculo.total_servicos)} em serviços`}
        </span>
        <strong style={{ color: 'var(--accent)', fontSize: 15 }}>{fmtMoeda(calculo?.total_item)}</strong>
      </div>
    </div>
  );
}

// ── Linha de serviço (usada nos dois níveis) ──────────────────────────────
function LinhaServico({ servico, servicos, onChange, onRemover }) {
  const cadastro = servicos.find((s) => s.id === parseInt(servico.servico_id, 10));
  const total = cadastro ? parseFloat(cadastro.valor_hora) * (parseFloat(servico.quantidade_horas) || 0) : 0;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 110px 110px auto', gap: 10, alignItems: 'end',
      marginBottom: 8, padding: 10, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
    }}>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Serviço</label>
        <select value={servico.servico_id} onChange={(e) => onChange('servico_id', e.target.value)}>
          <option value="">Selecione...</option>
          {servicos.map((s) => (
            <option key={s.id} value={s.id}>{s.nome} — {fmtMoeda(s.valor_hora)}/h</option>
          ))}
        </select>
      </div>
      <div className="form-group" style={{ marginBottom: 0 }}>
        <label>Horas</label>
        <input
          type="number" step="0.5" min="0.5" placeholder="0"
          value={servico.quantidade_horas}
          onChange={(e) => onChange('quantidade_horas', e.target.value)}
        />
      </div>
      <div style={{ paddingBottom: 2 }}>
        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>TOTAL</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', padding: '9px 0' }}>
          {fmtMoeda(total)}
        </div>
      </div>
      <button type="button" className="btn-icon danger" onClick={onRemover} style={{ marginBottom: 2 }}>
        <IconeX size={13} />
      </button>
    </div>
  );
}
