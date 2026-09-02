import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import {
  fmtMoeda, fmtNum, fmtQtd, fmtData, fmtDataHora, badgeClass, rotuloStatus,
} from '../utils/format';
import { ConfirmModal } from '../components/shared/Modal';

const STATUS_OPTIONS = ['rascunho', 'aprovado', 'reprovado', 'cancelado'];

const tituloCard = {
  fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '1px',
};

export default function DetalheOrcamento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [orc, setOrc] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [pdfCarregando, setPdfCarregando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/orcamentos/${id}`);
      setOrc(data);
    } catch {
      toast.error('Orçamento não encontrado');
      navigate('/orcamentos');
    } finally {
      setCarregando(false);
    }
  }, [id, navigate]);

  useEffect(() => { carregar(); }, [carregar]);

  // Os dois tipos compartilham esta tela; o que muda são os itens, os rótulos e a
  // rota de edição. Venda fala em Pedido; impressão fala em Ordem de Serviço.
  const ehVenda = orc?.tipo === 'produto';
  const numeroAprovado = ehVenda ? orc?.numero_pedido : orc?.numero_os;
  const ehOS = orc?.status === 'aprovado' && !!numeroAprovado;

  const textos = ehVenda
    ? {
      aprovado: 'Pedido de Venda',
      badge: 'PEDIDO DE VENDA',
      baixar: 'Baixar Pedido',
      baixarOrcamento: 'Baixar Orçamento',
      rotaEditar: `/vendas/${id}/editar`,
      rotaLista: '/vendas',
      rotaReprecificar: `/orcamentos-venda/${id}/reprecificar`,
      avisoNaoAprovado: 'O Pedido de Venda, com número próprio, é gerado quando você aprovar.',
      textoReprecificar: 'traz o preço dos produtos para os valores atuais do catálogo.',
    }
    : {
      aprovado: 'Ordem de Serviço',
      badge: 'ORDEM DE SERVIÇO',
      baixar: 'Baixar OS',
      baixarOrcamento: 'Baixar Orçamento',
      rotaEditar: `/orcamentos/${id}/editar`,
      rotaLista: '/orcamentos',
      rotaReprecificar: `/orcamentos/${id}/reprecificar`,
      avisoNaoAprovado: 'A Ordem de Serviço, com número próprio, é gerada quando você aprovar.',
      textoReprecificar: 'traz o material, os serviços e a hora-máquina para a tabela atual.',
    };

  const alterarStatus = async (status) => {
    try {
      const { data } = await api.patch(`/orcamentos/${id}/status`, { status });
      toast.success(data.mensagem);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao alterar status');
    }
  };

  const reprecificar = async () => {
    try {
      const { data } = await api.post(textos.rotaReprecificar);
      toast.success(`${data.mensagem} — novo total ${fmtMoeda(data.total_geral)}`);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao atualizar preços');
    }
  };

  const excluir = async () => {
    try {
      await api.delete(`/orcamentos/${id}`);
      toast.success('Orçamento excluído');
      navigate(textos.rotaLista);
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao excluir');
    }
  };

  const baixarPDF = async () => {
    setPdfCarregando(true);
    try {
      const res = await api.get(`/orcamentos/${id}/pdf`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ehOS ? numeroAprovado : orc.numero_orcamento}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar PDF');
    } finally {
      setPdfCarregando(false);
    }
  };

  if (carregando) return <div className="loading-screen"><span className="spinner" /><span>Carregando...</span></div>;
  if (!orc) return null;

  return (
    <>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3" style={{ marginBottom: 4 }}>
              <button className="btn-icon" onClick={() => navigate(textos.rotaLista)}>
                <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" stroke="currentColor" />
                </svg>
              </button>
              <h2 style={{ margin: 0 }}>{ehOS ? numeroAprovado : orc.numero_orcamento}</h2>
              <span className={`badge ${badgeClass(orc.status)}`}>{rotuloStatus(orc.status)}</span>
              {ehOS && (
                <span className="badge badge-aprovado" style={{ background: 'var(--success-dim)', color: 'var(--success)' }}>
                  {textos.aprovado}
                </span>
              )}
            </div>
            <p>
              {ehOS && <>Orçamento de origem <strong>{orc.numero_orcamento}</strong> · </>}
              Criado em {fmtDataHora(orc.criado_em)} por {orc.criado_por_nome}
              {orc.aprovado_em && <> · Aprovado em {fmtData(orc.aprovado_em)}{orc.aprovado_por_nome ? ` por ${orc.aprovado_por_nome}` : ''}</>}
            </p>
          </div>
          <div className="flex gap-3">
            <button className="btn btn-ghost" onClick={() => navigate(textos.rotaEditar)}>
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 15, height: 15 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" />
              </svg>
              Editar
            </button>
            <button className="btn btn-primary" onClick={baixarPDF} disabled={pdfCarregando}>
              {pdfCarregando ? <span className="spinner" /> : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" style={{ width: 16, height: 16 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" stroke="currentColor" />
                  </svg>
                  {ehOS ? textos.baixar : textos.baixarOrcamento}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {!ehOS && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Este documento ainda é um <strong style={{ color: 'var(--text-primary)' }}>orçamento</strong>.
              {' '}{textos.avisoNaoAprovado}
            </div>
          </div>
        )}

        {/* Cliente */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={tituloCard}>Cliente</h3>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{orc.cliente_nome}</div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div>{orc.rua}, {orc.numero}{orc.complemento ? ` - ${orc.complemento}` : ''}</div>
            <div>{orc.bairro} — {orc.cidade}/{orc.estado} · CEP: {orc.cep}</div>
            <div style={{ marginTop: 4, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              {orc.tipo_documento?.toUpperCase()}: {orc.cpf_cnpj}
            </div>
          </div>
        </div>

        {/* Produtos — orçamento de venda */}
        {ehVenda && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={tituloCard}>Produtos ({orc.produtos.length})</h3>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Produto</th>
                    <th>Qtd</th>
                    <th>Unitário</th>
                    <th>Desconto</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {orc.produtos.map((p, i) => (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{p.descricao}</div>
                        {[p.marca, p.cor, p.tipo_material, p.especificacao].filter(Boolean).length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {[p.marca, p.cor, p.tipo_material, p.especificacao].filter(Boolean).join(' · ')}
                            {p.codigo && <span className="font-mono"> · {p.codigo}</span>}
                          </div>
                        )}
                      </td>
                      <td>{fmtQtd(p.quantidade, p.unidade)}</td>
                      <td>{fmtMoeda(p.preco_unitario)}</td>
                      <td className={parseFloat(p.total_desconto) > 0 ? 'text-danger' : ''}>
                        {parseFloat(p.total_desconto) > 0 ? `- ${fmtMoeda(p.total_desconto)}` : '—'}
                      </td>
                      <td className="text-accent fw-bold">{fmtMoeda(p.total_item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Itens — orçamento de impressão */}
        {!ehVenda && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
            <h3 style={{ ...tituloCard, marginBottom: 0 }}>Itens ({orc.itens.length})</h3>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Hora-máquina do orçamento: {fmtMoeda(orc.valor_hora_maquina)}/h
            </span>
          </div>

          {orc.itens.map((item, i) => (
            <div
              key={item.id}
              style={{
                padding: '12px 0',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
                <div className="flex items-center gap-3">
                  <span style={{
                    background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 700, fontSize: 11,
                    width: 22, height: 22, borderRadius: '50%', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  <strong style={{ fontSize: 14 }}>{item.descricao || `Item ${i + 1}`}</strong>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {item.material_nome} · {item.tipo_peca === 'tecnica' ? 'Técnica' : 'Decorativa'}
                  </span>
                </div>
                <strong style={{ color: 'var(--accent)', fontSize: 15 }}>{fmtMoeda(item.total_item)}</strong>
              </div>

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12,
                fontSize: 12, background: 'var(--bg-secondary)', padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
              }}>
                {[
                  ['Peso', `${fmtNum(item.peso_gramas)} g`],
                  ['Horas', `${fmtNum(item.horas_impressao)} h`],
                  ['Quantidade', item.quantidade],
                  ['Valor unitário', fmtMoeda(item.valor_por_peca)],
                  ['Total peças', fmtMoeda(item.total_pecas)],
                ].map(([rotulo, valor]) => (
                  <div key={rotulo}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {rotulo}
                    </div>
                    <div style={{ fontWeight: 600 }}>{valor}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                {fmtNum(item.peso_gramas)}g × R${fmtNum(item.custo_por_grama, 4)} = {fmtMoeda(item.custo_material)}
                {'   +   '}
                {fmtNum(item.horas_impressao)}h × {fmtMoeda(orc.valor_hora_maquina)} = {fmtMoeda(item.custo_impressao)}
              </div>

              {item.servicos.length > 0 && (
                <div style={{ marginTop: 8, paddingLeft: 12, borderLeft: '2px solid var(--border-accent)' }}>
                  {item.servicos.map((s) => (
                    <div key={s.id} className="flex items-center justify-between" style={{ fontSize: 12, padding: '3px 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {s.servico_nome} — {fmtNum(s.quantidade_horas)}h × {fmtMoeda(s.valor_hora)}/h
                      </span>
                      <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{fmtMoeda(s.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        )}

        {/* Serviços gerais */}
        {orc.servicos_gerais.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={tituloCard}>Serviços gerais do orçamento</h3>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Serviço</th><th>Horas</th><th>Valor/h</th><th>Total</th></tr></thead>
                <tbody>
                  {orc.servicos_gerais.map((s) => (
                    <tr key={s.id}>
                      <td>{s.servico_nome}</td>
                      <td>{fmtNum(s.quantidade_horas)}h</td>
                      <td>{fmtMoeda(s.valor_hora)}</td>
                      <td className="text-accent fw-bold">{fmtMoeda(s.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {orc.observacao && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h3 style={{ ...tituloCard, marginBottom: 8 }}>Observações</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {orc.observacao}
            </p>
          </div>
        )}

        {/* Ações + Totais */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, marginBottom: 16 }}>
          <div className="card">
            <h3 style={tituloCard}>Status</h3>
            <div className="flex gap-3" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  className={`btn ${orc.status === s ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                  onClick={() => (s === 'aprovado' && !orc.numero_os
                    ? setConfirmacao('aprovar')
                    : alterarStatus(s))}
                  disabled={orc.status === s}
                >
                  {rotuloStatus(s)}
                </button>
              ))}
            </div>

            <h3 style={tituloCard}>Outras ações</h3>
            <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmacao('reprecificar')}>
                Atualizar preços do cadastro
              </button>
              {isAdmin() && orc.status === 'rascunho' && (
                <button className="btn btn-danger btn-sm" onClick={() => setConfirmacao('excluir')}>
                  Excluir orçamento
                </button>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.6 }}>
              Os preços deste orçamento estão congelados nos valores de quando foi feito.
              "Atualizar preços" {textos.textoReprecificar}
            </div>
          </div>

          <div className="card">
            <div className="os-summary">
              {ehVenda ? (
                <>
                  <div className="os-summary-row">
                    <span>Subtotal</span>
                    <span>{fmtMoeda(orc.total_produtos)}</span>
                  </div>
                  {parseFloat(orc.total_descontos) > 0 && (
                    <div className="os-summary-row">
                      <span>Descontos</span>
                      <span className="text-danger">- {fmtMoeda(orc.total_descontos)}</span>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="os-summary-row">
                    <span>Total peças</span>
                    <span>{fmtMoeda(orc.total_itens)}</span>
                  </div>
                  {parseFloat(orc.total_servicos_itens) > 0 && (
                    <div className="os-summary-row">
                      <span>Serviços dos itens</span>
                      <span>{fmtMoeda(orc.total_servicos_itens)}</span>
                    </div>
                  )}
                  {parseFloat(orc.total_servicos_gerais) > 0 && (
                    <div className="os-summary-row">
                      <span>Serviços gerais</span>
                      <span>{fmtMoeda(orc.total_servicos_gerais)}</span>
                    </div>
                  )}
                </>
              )}
              <div className="os-summary-row total">
                <span>TOTAL GERAL</span>
                <span>{fmtMoeda(orc.total_geral)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Histórico */}
        {orc.historico?.length > 0 && (
          <div className="card">
            <h3 style={tituloCard}>Histórico</h3>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th><th>Total</th></tr></thead>
                <tbody>
                  {orc.historico.map((h) => (
                    <tr key={h.id}>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtDataHora(h.criado_em)}</td>
                      <td>{h.usuario_nome || '—'}</td>
                      <td>{h.acao}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{h.detalhe || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {h.total_anterior !== null && parseFloat(h.total_anterior) !== parseFloat(h.total_novo) ? (
                          <>
                            <span style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                              {fmtMoeda(h.total_anterior)}
                            </span>
                            {' → '}
                            <strong>{fmtMoeda(h.total_novo)}</strong>
                          </>
                        ) : (
                          fmtMoeda(h.total_novo)
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={confirmacao === 'aprovar'}
        onClose={() => setConfirmacao(null)}
        onConfirm={() => { setConfirmacao(null); alterarStatus('aprovado'); }}
        title="Aprovar orçamento?"
        message={`O orçamento ${orc.numero_orcamento} vira Ordem de Serviço e recebe um número de OS. Total: ${fmtMoeda(orc.total_geral)}.`}
      />
      <ConfirmModal
        isOpen={confirmacao === 'reprecificar'}
        onClose={() => setConfirmacao(null)}
        onConfirm={() => { setConfirmacao(null); reprecificar(); }}
        title="Atualizar preços?"
        message="Os custos de material, serviços e hora-máquina serão trazidos para os valores atuais do cadastro. O total do orçamento pode mudar."
      />
      <ConfirmModal
        isOpen={confirmacao === 'excluir'}
        onClose={() => setConfirmacao(null)}
        onConfirm={() => { setConfirmacao(null); excluir(); }}
        title="Excluir orçamento?"
        message={`${orc.numero_orcamento} e todos os seus itens serão removidos definitivamente.`}
      />
    </>
  );
}
