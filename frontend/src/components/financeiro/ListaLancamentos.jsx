import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { fmtMoeda, fmtDiaISO, FILTROS_LANCAMENTO } from '../../utils/format';
import StatusLancamento from './StatusLancamento';
import ModalBaixa from './ModalBaixa';
import ModalLancamento from './ModalLancamento';
import ModalDetalheLancamento from './ModalDetalheLancamento';

/**
 * A lista de contas, usada pelas duas telas: `natureza` decide os textos e o que cada
 * linha oferece. A busca, o recorte e o período vão para o servidor — a situação de cada
 * conta (vencida, vence hoje) é calculada lá contra o "hoje" de Brasília.
 *
 * Os cartões do topo também são filtros: clicar em "Vencido" abre a lista de vencidas.
 */
export default function ListaLancamentos({ natureza }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const recebendo = natureza === 'receber';

  const textos = recebendo
    ? {
      titulo: 'A receber',
      subtitulo: 'O que os clientes devem — cobranças das OS e Pedidos aprovados e lançamentos avulsos',
      cartaoAberto: 'A receber',
      cartaoMes: 'Recebido no mês',
      acao: 'Receber',
      novo: 'Nova cobrança',
      placeholder: 'Buscar por cliente, OS, pedido ou descrição...',
      vazio: 'As cobranças aparecem aqui depois de geradas na OS ou no Pedido aprovado.',
      coluna: 'Cliente',
    }
    : {
      titulo: 'A pagar',
      subtitulo: 'Despesas do negócio — fornecedores, contas fixas e impostos',
      cartaoAberto: 'A pagar',
      cartaoMes: 'Pago no mês',
      acao: 'Pagar',
      novo: 'Nova despesa',
      placeholder: 'Buscar por fornecedor, descrição ou nº do documento...',
      vazio: 'Lance a primeira despesa em "Nova despesa".',
      coluna: 'Fornecedor / categoria',
    };

  const [contas, setContas] = useState([]);
  const [totais, setTotais] = useState({ valor: 0, saldo: 0 });
  const [paginacao, setPaginacao] = useState({ pagina: 1, paginas: 1, total: 0 });
  const [resumo, setResumo] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Quem chega da OS traz o número dela na URL (?busca=OS-...).
  const [busca, setBusca] = useState(params.get('busca') || '');
  const [status, setStatus] = useState(params.get('busca') ? '' : 'aberto');
  // O calendário da agenda manda o dia (?de=…&ate=…) de quem vence nele.
  const [de, setDe] = useState(params.get('de') || '');
  const [ate, setAte] = useState(params.get('ate') || '');
  const [pagina, setPagina] = useState(1);

  const [detalhe, setDetalhe] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const [novo, setNovo] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [lista, cartoes] = await Promise.all([
        api.get(`/${natureza}`, {
          params: {
            pagina,
            status: status || undefined,
            busca: busca || undefined,
            de: de || undefined,
            ate: ate || undefined,
          },
        }),
        api.get(`/${natureza}/resumo`),
      ]);
      setContas(lista.data.dados);
      setTotais(lista.data.totais);
      setPaginacao(lista.data.paginacao);
      setResumo(cartoes.data);
    } catch {
      toast.error('Erro ao carregar as contas');
    } finally {
      setCarregando(false);
    }
  }, [natureza, pagina, status, busca, de, ate]);

  useEffect(() => {
    const timer = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(timer);
  }, [carregar, busca]);

  const filtrarPor = (valor) => { setStatus(valor); setPagina(1); };

  // A lista de quem escolhe cliente/fornecedor só é buscada quando o modal vai abrir.
  const abrirNovo = async () => {
    try {
      if (recebendo) {
        const { data } = await api.get('/clientes');
        setNovo({ clientes: data });
      } else {
        const [fornecedores, categorias] = await Promise.all([
          api.get('/fornecedores'), api.get('/categorias-despesa'),
        ]);
        setNovo({ fornecedores: fornecedores.data, categorias: categorias.data });
      }
    } catch {
      toast.error('Erro ao abrir o formulário');
    }
  };

  const cartoes = resumo && [
    { chave: 'aberto', rotulo: textos.cartaoAberto, valor: resumo.em_aberto.valor, qtd: resumo.em_aberto.qtd, filtro: 'aberto', classe: 'accent' },
    { chave: 'vencido', rotulo: 'Vencido', valor: resumo.vencido.valor, qtd: resumo.vencido.qtd, filtro: 'vencido', classe: resumo.vencido.qtd > 0 ? 'danger' : '' },
    { chave: 'vence_hoje', rotulo: 'Vence hoje', valor: resumo.vence_hoje.valor, qtd: resumo.vence_hoje.qtd, filtro: 'vence_hoje', classe: resumo.vence_hoje.qtd > 0 ? 'warning' : '' },
    { chave: 'semana', rotulo: 'Próximos 7 dias', valor: resumo.proximos_7_dias.valor, qtd: resumo.proximos_7_dias.qtd, filtro: null, classe: '' },
    { chave: 'mes', rotulo: textos.cartaoMes, valor: resumo.realizado_mes, qtd: null, filtro: 'pago', classe: 'success' },
  ];

  return (
    <>
      <div className="page-header">
        <h2>{textos.titulo}</h2>
        <p>{textos.subtitulo}</p>
      </div>

      <div className="page-content">
        {cartoes && (
          <div className="stats-grid">
            {cartoes.map((c) => {
              const corpo = (
                <>
                  <div className="stat-label">{c.rotulo}</div>
                  <div className={`stat-value ${c.classe}`} style={{ fontSize: 22 }}>{fmtMoeda(c.valor)}</div>
                  {c.qtd !== null && <div className="stat-detalhe">{c.qtd} conta(s)</div>}
                </>
              );
              return c.filtro !== null ? (
                <button
                  key={c.chave}
                  type="button"
                  className={`stat-card ${status === c.filtro ? 'ativo' : ''}`}
                  onClick={() => filtrarPor(c.filtro)}
                >
                  {corpo}
                </button>
              ) : (
                <div key={c.chave} className="stat-card">{corpo}</div>
              );
            })}
          </div>
        )}

        <div className="card">
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <div className="flex gap-3 items-center" style={{ flex: 1, flexWrap: 'wrap' }}>
              <div className="search-box">
                <svg viewBox="0 0 24 24" fill="none">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
                </svg>
                <input
                  placeholder={textos.placeholder}
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                />
              </div>
              <select value={status} onChange={(e) => filtrarPor(e.target.value)} style={{ width: 'auto', flex: 'none' }}>
                {FILTROS_LANCAMENTO.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </select>
              <div className="flex gap-2 items-center" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                vence de
                <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(1); }} style={{ width: 'auto' }} />
                até
                <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(1); }} style={{ width: 'auto' }} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={abrirNovo}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
              </svg>
              {textos.novo}
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Vencimento</th>
                  <th>Descrição</th>
                  <th>{textos.coluna}</th>
                  <th>Valor</th>
                  <th>Saldo</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={7}><div className="empty-state"><span className="spinner" /></div></td></tr>
                ) : contas.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" />
                      </svg>
                      <h3>Nenhuma conta</h3>
                      <p>{busca || status || de || ate ? 'Nada encontrado com esses filtros' : textos.vazio}</p>
                    </div>
                  </td></tr>
                ) : contas.map((c) => (
                  <tr key={c.id} onClick={() => setDetalhe(c.id)} style={{ cursor: 'pointer' }}>
                    <td className="font-mono" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{fmtDiaISO(c.vencimento)}</td>
                    <td>
                      <div>{c.descricao}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {c.total_parcelas > 1 && <>{c.recorrencia_id ? 'recorrente' : 'parcela'} {c.parcela}/{c.total_parcelas}</>}
                        {c.total_parcelas > 1 && c.documento && ' · '}
                        {c.documento && <>doc. {c.documento}</>}
                      </div>
                    </td>
                    <td>
                      {c.cliente_nome || c.fornecedor_nome || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      {c.categoria_nome && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.categoria_nome}</div>}
                      {c.orcamento_id && (
                        <div>
                          <button
                            type="button"
                            className="link-button font-mono"
                            style={{ fontSize: 11 }}
                            onClick={(e) => { e.stopPropagation(); navigate(`/orcamentos/${c.orcamento_id}`); }}
                          >
                            {c.numero_aprovado || c.numero_orcamento}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="fw-bold" style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(c.valor)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{c.status === 'aberto' ? fmtMoeda(c.saldo) : '—'}</td>
                    <td><StatusLancamento situacao={c.situacao} /></td>
                    <td style={{ textAlign: 'right' }}>
                      {c.status === 'aberto' && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={(e) => { e.stopPropagation(); setBaixando(c); }}
                        >
                          {textos.acao}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!carregando && contas.length > 0 && (
            <div className="flex items-center justify-between" style={{ marginTop: 16, fontSize: 13, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ color: 'var(--text-muted)' }}>
                {paginacao.total} conta(s) no filtro · total {fmtMoeda(totais.valor)} · em aberto {fmtMoeda(totais.saldo)}
              </span>
              {paginacao.paginas > 1 && (
                <div className="flex gap-2 items-center">
                  <span style={{ color: 'var(--text-muted)' }}>Página {paginacao.pagina} de {paginacao.paginas}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPagina((p) => p - 1)} disabled={paginacao.pagina <= 1}>
                    Anterior
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setPagina((p) => p + 1)} disabled={paginacao.pagina >= paginacao.paginas}>
                    Próxima
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {detalhe && (
        <ModalDetalheLancamento
          id={detalhe}
          natureza={natureza}
          onClose={() => setDetalhe(null)}
          onMudou={carregar}
        />
      )}

      {baixando && (
        <ModalBaixa
          conta={baixando}
          natureza={natureza}
          onClose={() => setBaixando(null)}
          onSalvo={() => { setBaixando(null); carregar(); }}
        />
      )}

      {novo && (
        <ModalLancamento
          natureza={natureza}
          clientes={novo.clientes}
          fornecedores={novo.fornecedores}
          categorias={novo.categorias}
          onClose={() => setNovo(null)}
          onSalvo={() => { setNovo(null); carregar(); }}
        />
      )}
    </>
  );
}
