import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { fmtMoeda, fmtData, badgeClass, rotuloStatus } from '../utils/format';

/**
 * Listagem de orçamentos, usada pelas duas telas.
 *
 * `tipo` decide o que é listado e como as colunas se chamam: impressão fala em OS,
 * venda fala em Pedido. A busca e os filtros vão para o servidor — filtrar no cliente
 * exigia baixar a tabela inteira.
 */
export function ListaOrcamentos({ tipo }) {
  const navigate = useNavigate();
  const ehVenda = tipo === 'produto';

  const [orcamentos, setOrcamentos] = useState([]);
  const [paginacao, setPaginacao] = useState({ pagina: 1, paginas: 1, total: 0 });
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get('/orcamentos', {
        params: { tipo, pagina, status: filtroStatus || undefined, busca: busca || undefined },
      });
      setOrcamentos(data.dados);
      setPaginacao(data.paginacao);
    } catch {
      toast.error('Erro ao carregar orçamentos');
    } finally {
      setCarregando(false);
    }
  }, [tipo, pagina, filtroStatus, busca]);

  useEffect(() => {
    const timer = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(timer);
  }, [carregar, busca]);

  const textos = ehVenda
    ? {
      titulo: 'Vendas',
      subtitulo: 'Orçamentos de produtos — o Pedido de Venda é gerado na aprovação',
      colunaAprovado: 'Nº Pedido',
      statusAprovado: 'Aprovado (Pedido)',
      placeholder: 'Buscar por nº do orçamento, nº do pedido ou cliente...',
      botao: 'Novo Orçamento de Venda',
      rotaNovo: '/vendas/novo',
      vazio: 'Crie o primeiro clicando em "Novo Orçamento de Venda"',
      colunaQtd: 'Produtos',
    }
    : {
      titulo: 'Orçamentos',
      subtitulo: 'Serviços de impressão — a Ordem de Serviço é gerada na aprovação',
      colunaAprovado: 'Nº OS',
      statusAprovado: 'Aprovado (OS)',
      placeholder: 'Buscar por nº do orçamento, nº da OS ou cliente...',
      botao: 'Novo Orçamento',
      rotaNovo: '/orcamentos/novo',
      vazio: 'Crie o primeiro clicando em "Novo Orçamento"',
      colunaQtd: 'Itens',
    };

  return (
    <>
      <div className="page-header">
        <h2>{textos.titulo}</h2>
        <p>{textos.subtitulo}</p>
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
                  placeholder={textos.placeholder}
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                />
              </div>
              <select
                value={filtroStatus}
                onChange={(e) => { setFiltroStatus(e.target.value); setPagina(1); }}
                style={{ width: 'auto', flex: 'none' }}
              >
                <option value="">Todos os status</option>
                <option value="rascunho">Rascunho</option>
                <option value="aprovado">{textos.statusAprovado}</option>
                <option value="reprovado">Reprovado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={() => navigate(textos.rotaNovo)}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" stroke="currentColor" />
              </svg>
              {textos.botao}
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Nº Orçamento</th>
                  <th>{textos.colunaAprovado}</th>
                  <th>Cliente</th>
                  <th>{textos.colunaQtd}</th>
                  <th>Total Geral</th>
                  <th>Status</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {carregando ? (
                  <tr><td colSpan={7}><div className="empty-state"><span className="spinner" /></div></td></tr>
                ) : orcamentos.length === 0 ? (
                  <tr><td colSpan={7}>
                    <div className="empty-state">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" />
                      </svg>
                      <h3>Nenhum orçamento</h3>
                      <p>{busca || filtroStatus ? 'Nada encontrado com esses filtros' : textos.vazio}</p>
                    </div>
                  </td></tr>
                ) : orcamentos.map((o) => (
                  <tr key={o.id} onClick={() => navigate(`/orcamentos/${o.id}`)} style={{ cursor: 'pointer' }}>
                    <td><span className="font-mono" style={{ fontSize: 12, color: 'var(--accent)' }}>{o.numero_orcamento}</span></td>
                    <td>
                      {o.numero_aprovado ? (
                        <span className="font-mono" style={{ fontSize: 12, color: 'var(--success)', fontWeight: 700 }}>
                          {o.numero_aprovado}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>{o.cliente_nome}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{o.qtd_itens}</td>
                    <td className="text-success fw-bold">{fmtMoeda(o.total_geral)}</td>
                    <td><span className={`badge ${badgeClass(o.status)}`}>{rotuloStatus(o.status)}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtData(o.criado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginacao.paginas > 1 && (
            <div className="flex items-center justify-between" style={{ marginTop: 16, fontSize: 13 }}>
              <span style={{ color: 'var(--text-muted)' }}>
                Página {paginacao.pagina} de {paginacao.paginas} · {paginacao.total} orçamento(s)
              </span>
              <div className="flex gap-2">
                <button className="btn btn-ghost btn-sm" onClick={() => setPagina((p) => p - 1)} disabled={paginacao.pagina <= 1}>
                  Anterior
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPagina((p) => p + 1)} disabled={paginacao.pagina >= paginacao.paginas}>
                  Próxima
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function Orcamentos() {
  return <ListaOrcamentos tipo="impressao" />;
}
