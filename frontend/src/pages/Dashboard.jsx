import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { fmtMoeda, fmtData, badgeClass, rotuloStatus } from '../utils/format';
import GraficoBarras from '../components/shared/GraficoBarras';
import { PERIODOS, intervaloDoPeriodo } from '../utils/periodo';

const filtroVazio = {
  periodo: 'tudo', de: '', ate: '',
  tipo: '', status: '', cliente_id: '', criado_por: '',
  material_id: '', produto_id: '', valor_min: '', valor_max: '', descricao_item: '',
};

const rotuloCard = { fontSize: 11 };

export default function Dashboard() {
  const { usuario, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState(filtroVazio);
  const [maisFiltros, setMaisFiltros] = useState(false);

  // Listas dos selects — carregadas uma vez.
  const [clientes, setClientes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [materiais, setMateriais] = useState([]);
  const [produtos, setProdutos] = useState([]);

  useEffect(() => {
    const carregarListas = async () => {
      const pedidos = [api.get('/clientes'), api.get('/materiais'), api.get('/produtos')];
      // Só admin enxerga a lista de usuários; operador simplesmente não vê esse filtro.
      if (isAdmin()) pedidos.push(api.get('/usuarios'));

      const [c, m, p, u] = await Promise.all(pedidos.map((r) => r.catch(() => ({ data: [] }))));
      setClientes(c.data);
      setMateriais(m.data);
      setProdutos(p.data);
      setUsuarios(u?.data || []);
    };
    carregarListas();
  }, [isAdmin]);

  // Só os campos que o servidor entende, e só os preenchidos.
  const parametros = useMemo(() => {
    const p = {};
    for (const chave of ['de', 'ate', 'tipo', 'status', 'cliente_id', 'criado_por',
      'material_id', 'produto_id', 'valor_min', 'valor_max', 'descricao_item']) {
      if (String(filtro[chave] ?? '').trim() !== '') p[chave] = filtro[chave];
    }
    return p;
  }, [filtro]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/orcamentos/resumo', { params: parametros });
      setResumo(data);
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao carregar o dashboard');
    } finally {
      setCarregando(false);
    }
  }, [parametros]);

  useEffect(() => {
    // Digitar na descrição não deve disparar uma consulta por tecla.
    const atraso = filtro.descricao_item ? 400 : 0;
    const timer = setTimeout(carregar, atraso);
    return () => clearTimeout(timer);
  }, [carregar, filtro.descricao_item]);

  const escolherPeriodo = (valor) =>
    setFiltro((f) => ({ ...f, periodo: valor, ...intervaloDoPeriodo(valor) }));

  const campo = (nome) => (e) => setFiltro((f) => ({ ...f, [nome]: e.target.value }));

  const qtdFiltros = (resumo?.filtros_ativos || []).length;
  const limpar = () => setFiltro(filtroVazio);

  const cards = [
    { rotulo: 'Orçamentos', valor: resumo?.orcamentos ?? 0, classe: 'accent',
      detalhe: resumo ? `${resumo.impressao} impressão · ${resumo.venda} venda` : null },
    { rotulo: 'Aprovados', valor: resumo?.aprovados ?? 0, classe: 'success',
      detalhe: resumo ? `${resumo.rascunhos} em rascunho` : null },
    { rotulo: 'Taxa de aprovação', valor: `${resumo?.taxa_aprovacao ?? 0}%`, classe: 'success',
      detalhe: resumo?.reprovados > 0 ? `${resumo.reprovados} reprovado(s)` : null },
    { rotulo: 'Ticket médio', valor: fmtMoeda(resumo?.ticket_medio), classe: '', pequeno: true,
      detalhe: resumo?.ticket_medio_aprovado > 0 ? `${fmtMoeda(resumo.ticket_medio_aprovado)} nos aprovados` : null },
    { rotulo: 'Volume aprovado', valor: fmtMoeda(resumo?.volume_aprovado), classe: 'success', pequeno: true,
      detalhe: resumo ? `de ${fmtMoeda(resumo.volume_total)} orçados` : null },
    { rotulo: 'Clientes', valor: qtdFiltros > 0 ? (resumo?.clientes_no_periodo ?? 0) : (resumo?.clientes ?? 0),
      classe: '',
      detalhe: qtdFiltros > 0 ? 'com orçamento no filtro' : 'cadastrados e ativos' },
  ];

  return (
    <>
      <div className="page-header">
        <h2>Dashboard</h2>
        <p>
          Bem-vindo, <strong>{usuario?.nome}</strong> —{' '}
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <div className="page-content">
        {/* ── Filtros ──────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="form-row">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Período</label>
              <select value={filtro.periodo} onChange={(e) => escolherPeriodo(e.target.value)}>
                {PERIODOS.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
              </select>
            </div>

            {filtro.periodo === 'personalizado' ? (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>De</label>
                  <input type="date" value={filtro.de} onChange={campo('de')} max={filtro.ate || undefined} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Até</label>
                  <input type="date" value={filtro.ate} onChange={campo('ate')} min={filtro.de || undefined} />
                </div>
              </>
            ) : (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Tipo</label>
                  <select value={filtro.tipo} onChange={campo('tipo')}>
                    <option value="">Impressão e venda</option>
                    <option value="impressao">Só impressão</option>
                    <option value="produto">Só venda</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Status</label>
                  <select value={filtro.status} onChange={campo('status')}>
                    <option value="">Todos</option>
                    <option value="rascunho">Rascunho</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="reprovado">Reprovado</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>
              </>
            )}

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Cliente</label>
              <select value={filtro.cliente_id} onChange={campo('cliente_id')}>
                <option value="">Todos os clientes</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome_fantasia || c.nome}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Com período personalizado, tipo e status descem para a segunda linha */}
          {filtro.periodo === 'personalizado' && (
            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Tipo</label>
                <select value={filtro.tipo} onChange={campo('tipo')}>
                  <option value="">Impressão e venda</option>
                  <option value="impressao">Só impressão</option>
                  <option value="produto">Só venda</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select value={filtro.status} onChange={campo('status')}>
                  <option value="">Todos</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="aprovado">Aprovado</option>
                  <option value="reprovado">Reprovado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>
            </div>
          )}

          {maisFiltros && (
            <>
              <div className="form-row" style={{ marginTop: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Material</label>
                  <select value={filtro.material_id} onChange={campo('material_id')}>
                    <option value="">Qualquer material</option>
                    {materiais.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Produto</label>
                  <select value={filtro.produto_id} onChange={campo('produto_id')}>
                    <option value="">Qualquer produto</option>
                    {produtos.map((p) => (
                      <option key={p.id} value={p.id}>{p.nome}{p.cor ? ` · ${p.cor}` : ''}</option>
                    ))}
                  </select>
                </div>
                {isAdmin() && (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Responsável</label>
                    <select value={filtro.criado_por} onChange={campo('criado_por')}>
                      <option value="">Todos</option>
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="form-row" style={{ marginTop: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label>Descrição do item</label>
                  <input
                    value={filtro.descricao_item}
                    onChange={campo('descricao_item')}
                    placeholder="Ex: suporte do motor, bico 0,4"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Valor de (R$)</label>
                  <input type="number" step="0.01" min="0" value={filtro.valor_min} onChange={campo('valor_min')} placeholder="0,00" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Valor até (R$)</label>
                  <input type="number" step="0.01" min="0" value={filtro.valor_max} onChange={campo('valor_max')} placeholder="sem limite" />
                </div>
              </div>
            </>
          )}

          <div className="flex items-center justify-between" style={{ marginTop: 14 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMaisFiltros((v) => !v)}>
              {maisFiltros ? 'Menos filtros' : 'Mais filtros'}
            </button>
            <div className="flex items-center gap-3">
              {qtdFiltros > 0 && (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {qtdFiltros} filtro(s) aplicado(s)
                </span>
              )}
              {qtdFiltros > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={limpar}>Limpar</button>
              )}
              {carregando && <span className="spinner" />}
            </div>
          </div>
        </div>

        {/* ── Indicadores ──────────────────────────────────────────── */}
        <div className="stats-grid">
          {cards.map((c) => (
            <div className="stat-card" key={c.rotulo}>
              <div className="stat-label" style={rotuloCard}>{c.rotulo}</div>
              <div className={`stat-value ${c.classe}`} style={c.pequeno ? { fontSize: 18 } : undefined}>
                {c.valor}
              </div>
              {c.detalhe && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{c.detalhe}</div>
              )}
            </div>
          ))}
        </div>

        {/* ── Evolução ─────────────────────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Evolução</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {resumo?.escala === 'dia' ? 'por dia' : 'por mês'}
            </span>
          </div>
          <GraficoBarras serie={resumo?.serie || []} escala={resumo?.escala || 'mes'} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
          {/* ── Top clientes ───────────────────────────────────────── */}
          <div className="card">
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Top clientes</h3>
            {!resumo?.top_clientes?.length ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum cliente no filtro</div>
            ) : resumo.top_clientes.map((c, i) => (
              <div
                key={c.id}
                className="flex items-center gap-3"
                style={{
                  padding: '9px 0',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setFiltro((f) => ({ ...f, cliente_id: String(c.id) }))}
                title="Filtrar por este cliente"
              >
                <span style={{
                  background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, fontSize: 11,
                  width: 22, height: 22, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {c.nome_fantasia || c.nome}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.qtd} orçamento(s)</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="text-success" style={{ fontSize: 13, fontWeight: 700 }}>
                    {fmtMoeda(c.valor_aprovado)}
                  </div>
                  {parseFloat(c.valor) !== parseFloat(c.valor_aprovado) && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {fmtMoeda(c.valor)} orçados
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* ── Orçamentos ─────────────────────────────────────────── */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>
                {qtdFiltros > 0 ? 'Orçamentos do filtro' : 'Orçamentos recentes'}
              </h3>
              <button className="btn btn-ghost btn-sm" onClick={() => navigate('/orcamentos')}>Ver todos</button>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nº Orçamento</th>
                    <th>Nº OS / Pedido</th>
                    <th>Cliente</th>
                    <th>Itens</th>
                    <th>Total Geral</th>
                    <th>Status</th>
                    <th>Data</th>
                  </tr>
                </thead>
                <tbody>
                  {!resumo?.recentes?.length ? (
                    <tr><td colSpan={7}><div className="empty-state"><p>Nenhum orçamento encontrado</p></div></td></tr>
                  ) : resumo.recentes.map((o) => (
                    <tr key={o.id} onClick={() => navigate(`/orcamentos/${o.id}`)} style={{ cursor: 'pointer' }}>
                      <td><span className="font-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{o.numero_orcamento}</span></td>
                      <td>
                        {o.numero_aprovado
                          ? <span className="font-mono" style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>{o.numero_aprovado}</span>
                          : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td>{o.cliente_nome}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{o.qtd_itens}</td>
                      <td className="text-success fw-bold">{fmtMoeda(o.total_geral)}</td>
                      <td><span className={`badge ${badgeClass(o.status)}`}>{rotuloStatus(o.status)}</span></td>
                      <td>{fmtData(o.criado_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
