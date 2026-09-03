import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { fmtMoeda, fmtData, fmtHoras, ETAPAS_PRODUCAO, rotuloEtapa } from '../utils/format';

const HOJE = () => new Date().toISOString().slice(0, 10);

/** Data que o <input type="date"> entende, a partir do que vem do banco. */
const paraInput = (valor) => (valor ? String(valor).slice(0, 10) : '');

/** Quanto tempo a OS está parada nesta etapa, no jeito que se fala. */
const tempoNaEtapa = (dias) => {
  const n = parseInt(dias, 10);
  if (Number.isNaN(n) || n < 0) return null;
  if (n === 0) return 'hoje';
  if (n === 1) return 'há 1 dia';
  return `há ${n} dias`;
};

export default function Producao() {
  const navigate = useNavigate();
  const [colunas, setColunas] = useState([]);
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [arrastando, setArrastando] = useState(null);
  const [sobre, setSobre] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/producao', { params: { busca: busca || undefined } });
      setColunas(data.colunas);
    } catch {
      toast.error('Erro ao carregar a fila de produção');
    } finally {
      setCarregando(false);
    }
  }, [busca]);

  useEffect(() => {
    const timer = setTimeout(carregar, busca ? 350 : 0);
    return () => clearTimeout(timer);
  }, [carregar, busca]);

  /**
   * Move o cartão na tela antes da resposta do servidor: arrastar tem que parecer
   * instantâneo. Se a chamada falhar, recarrega e o quadro volta ao que o banco diz.
   */
  const mover = async (ordem, etapa) => {
    if (etapa === ordem.etapa_producao) return;

    setColunas((atual) => atual.map((c) => {
      if (c.codigo === ordem.etapa_producao) {
        return { ...c, ordens: c.ordens.filter((o) => o.id !== ordem.id) };
      }
      if (c.codigo === etapa) {
        return { ...c, ordens: [...c.ordens, { ...ordem, etapa_producao: etapa, dias_na_etapa: 0 }] };
      }
      return c;
    }));

    try {
      await api.patch(`/producao/${ordem.id}`, { etapa });
      toast.success(`${ordem.numero_os} — ${rotuloEtapa(etapa)}`);
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao mover a OS');
    } finally {
      carregar();
    }
  };

  const alterarPrevisao = async (ordem, data) => {
    try {
      await api.patch(`/producao/${ordem.id}`, { previsao_entrega: data || null });
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar a previsão');
    }
  };

  const largar = (etapa) => (e) => {
    e.preventDefault();
    setSobre(null);
    if (arrastando) mover(arrastando, etapa);
    setArrastando(null);
  };

  const totalOrdens = colunas.reduce((soma, c) => soma + c.ordens.length, 0);

  return (
    <>
      <div className="page-header">
        <h2>Produção</h2>
        <p>Fila das ordens de serviço aprovadas — arraste o cartão para mudar a etapa</p>
      </div>

      <div className="page-content">
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <div className="search-box">
              <svg viewBox="0 0 24 24" fill="none">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
              </svg>
              <input
                placeholder="Buscar por cliente ou número da OS..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {totalOrdens} OS na fila · entregues somem do quadro depois de 15 dias
            </div>
          </div>
        </div>

        {carregando ? (
          <div className="empty-state"><span className="spinner" /></div>
        ) : (
          <div className="kanban">
            {colunas.map((coluna) => (
              <div
                key={coluna.codigo}
                className={`kanban-coluna ${sobre === coluna.codigo ? 'sobre' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setSobre(coluna.codigo); }}
                onDragLeave={() => setSobre((s) => (s === coluna.codigo ? null : s))}
                onDrop={largar(coluna.codigo)}
              >
                <div className="kanban-topo">
                  <div className="flex items-center justify-between">
                    <strong>{coluna.rotulo}</strong>
                    <span className="kanban-contador">{coluna.ordens.length}</span>
                  </div>
                  <div className="kanban-sub">{coluna.descricao}</div>
                  {coluna.ordens.length > 0 && (
                    <div className="kanban-sub">
                      {fmtMoeda(coluna.total)} · {fmtHoras(coluna.horas)} de impressão
                    </div>
                  )}
                </div>

                <div className="kanban-lista">
                  {coluna.ordens.length === 0 ? (
                    <div className="kanban-vazio">Nada aqui</div>
                  ) : coluna.ordens.map((ordem) => {
                    const atrasada = ordem.previsao_entrega
                      && paraInput(ordem.previsao_entrega) < HOJE()
                      && ordem.etapa_producao !== 'entregue';
                    const posicao = ETAPAS_PRODUCAO.findIndex((e) => e.codigo === coluna.codigo);

                    return (
                      <div
                        key={ordem.id}
                        className={`kanban-card ${atrasada ? 'atrasada' : ''}`}
                        draggable
                        onDragStart={() => setArrastando(ordem)}
                        onDragEnd={() => { setArrastando(null); setSobre(null); }}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            className="kanban-numero"
                            onClick={() => navigate(`/orcamentos/${ordem.id}`)}
                            title="Abrir a OS"
                          >
                            {ordem.numero_os}
                          </button>
                          <span className="kanban-valor">{fmtMoeda(ordem.total_geral)}</span>
                        </div>

                        <div className="kanban-cliente">{ordem.cliente_nome}</div>

                        <div className="kanban-meta">
                          {parseInt(ordem.pecas, 10)} peça{parseInt(ordem.pecas, 10) === 1 ? '' : 's'}
                          {' · '}{fmtHoras(ordem.horas)}
                          {parseFloat(ordem.gramas) > 0 && ` · ${Math.round(ordem.gramas)} g`}
                        </div>

                        <div className="kanban-rodape">
                          <input
                            type="date"
                            className="kanban-data"
                            value={paraInput(ordem.previsao_entrega)}
                            onChange={(e) => alterarPrevisao(ordem, e.target.value)}
                            title="Previsão de entrega"
                          />
                          <div className="kanban-passos">
                            <button
                              type="button"
                              className="btn-icon"
                              disabled={posicao === 0}
                              onClick={() => mover(ordem, ETAPAS_PRODUCAO[posicao - 1].codigo)}
                              title={posicao > 0 ? `Voltar para ${ETAPAS_PRODUCAO[posicao - 1].rotulo}` : ''}
                            >
                              <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" stroke="currentColor" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              disabled={posicao === ETAPAS_PRODUCAO.length - 1}
                              onClick={() => mover(ordem, ETAPAS_PRODUCAO[posicao + 1].codigo)}
                              title={posicao < ETAPAS_PRODUCAO.length - 1
                                ? `Avançar para ${ETAPAS_PRODUCAO[posicao + 1].rotulo}` : ''}
                            >
                              <svg viewBox="0 0 24 24" fill="none" style={{ width: 12, height: 12 }}>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" stroke="currentColor" />
                              </svg>
                            </button>
                          </div>
                        </div>

                        {(atrasada || tempoNaEtapa(ordem.dias_na_etapa)) && (
                          <div className="kanban-tempo">
                            {atrasada && <span className="text-danger">Venceu {fmtData(ordem.previsao_entrega)} · </span>}
                            {tempoNaEtapa(ordem.dias_na_etapa) && `Nesta etapa ${tempoNaEtapa(ordem.dias_na_etapa)}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
