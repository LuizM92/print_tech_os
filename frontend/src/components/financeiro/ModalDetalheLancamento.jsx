import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import Modal, { ConfirmModal } from '../shared/Modal';
import StatusLancamento from './StatusLancamento';
import ModalBaixa from './ModalBaixa';
import {
  fmtMoeda, fmtDiaISO, fmtDataHora, rotuloForma, centavos,
} from '../../utils/format';

const tituloSecao = {
  fontSize: 12, fontWeight: 700, margin: '20px 0 10px', color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '1px',
};

const linha = { display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0', fontSize: 13.5 };

/**
 * Uma parcela por dentro: valores, pagamentos já registrados (com estorno, para o
 * admin), edição de vencimento e observações e o cancelamento.
 *
 * Mudar o valor é do admin e só enquanto nada foi recebido — a mesma regra do servidor,
 * que é quem de fato recusa; aqui o campo só aparece quando vale.
 */
export default function ModalDetalheLancamento({ id, natureza, onClose, onMudou }) {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const recebendo = natureza === 'receber';

  const [conta, setConta] = useState(null);
  const [edicao, setEdicao] = useState(null);
  const [baixando, setBaixando] = useState(false);
  const [confirmacao, setConfirmacao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [novoValor, setNovoValor] = useState('');

  // Os callbacks do pai mudam a cada render dele; guardados em ref, não refazem a busca.
  const aoFechar = useRef(onClose);
  aoFechar.current = onClose;
  const aoMudar = useRef(onMudou);
  aoMudar.current = onMudou;

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/${natureza}/${id}`);
      setConta(data);
      setEdicao({
        vencimento: data.vencimento,
        descricao: data.descricao,
        observacao: data.observacao || '',
        documento: data.documento || '',
        valor: data.valor.toFixed(2),
      });
    } catch {
      toast.error('Conta não encontrada');
      aoFechar.current();
    }
  }, [id, natureza]);

  useEffect(() => { carregar(); }, [carregar]);

  const depoisDeMudar = async () => {
    await carregar();
    aoMudar.current();
  };

  const salvarEdicao = async (e) => {
    e.preventDefault();
    if (salvando) return;

    // Só manda o que mudou: o servidor registra cada alteração no histórico da OS.
    const corpo = {};
    if (edicao.vencimento !== conta.vencimento) corpo.vencimento = edicao.vencimento;
    if (edicao.descricao !== conta.descricao) corpo.descricao = edicao.descricao;
    if (edicao.observacao !== (conta.observacao || '')) corpo.observacao = edicao.observacao;
    if (edicao.documento !== (conta.documento || '')) corpo.documento = edicao.documento;
    if (centavos(edicao.valor) !== centavos(conta.valor)) corpo.valor = edicao.valor;
    if (Object.keys(corpo).length === 0) {
      toast('Nada para alterar');
      return;
    }

    setSalvando(true);
    try {
      await api.put(`/${natureza}/${id}`, corpo);
      toast.success('Conta atualizada');
      await depoisDeMudar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao atualizar');
    } finally {
      setSalvando(false);
    }
  };

  const cancelar = async () => {
    setConfirmacao(null);
    try {
      await api.post(`/${natureza}/${id}/cancelar`, {});
      toast.success('Conta cancelada');
      await depoisDeMudar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao cancelar');
    }
  };

  const estornar = async (baixa) => {
    setConfirmacao(null);
    try {
      await api.delete(`/${natureza}/${id}/baixas/${baixa.id}`);
      toast.success('Pagamento estornado');
      await depoisDeMudar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao estornar');
    }
  };

  // "Esta e as próximas" da despesa recorrente: só as em aberto e sem pagamento.
  const mexerNaSerie = async (acao) => {
    setConfirmacao(null);
    try {
      const { data } = acao === 'cancelar'
        ? await api.post(`/${natureza}/${id}/serie/cancelar`, {})
        : await api.put(`/${natureza}/${id}/serie/valor`, { valor: novoValor });
      toast.success(data.mensagem);
      await depoisDeMudar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao alterar a série');
    }
  };

  const campo = (nome) => (e) => setEdicao((f) => ({ ...f, [nome]: e.target.value }));

  if (!conta || !edicao) {
    return <Modal isOpen onClose={onClose} title="Conta"><div className="empty-state"><span className="spinner" /></div></Modal>;
  }

  const aberta = conta.status === 'aberto';
  const semPagamento = conta.valor_pago === 0 && conta.desconto === 0;
  const podeMudarValor = isAdmin() && aberta && semPagamento;
  const parte = recebendo ? 'Cliente' : 'Fornecedor';

  return (
    <>
      <Modal isOpen onClose={onClose} title={conta.rotulo ? `${conta.rotulo} — ${conta.descricao}` : conta.descricao} size="lg">
        <div style={{ marginBottom: 12 }}><StatusLancamento situacao={conta.situacao} /></div>

        <div style={linha}><span className="text-muted">{parte}</span><span>{conta.cliente_nome || conta.fornecedor_nome || '—'}</span></div>
        {conta.categoria_nome && <div style={linha}><span className="text-muted">Categoria</span><span>{conta.categoria_nome}</span></div>}
        {conta.orcamento_id && (
          <div style={linha}>
            <span className="text-muted">Documento</span>
            <button
              type="button"
              className="link-button"
              onClick={() => { onClose(); navigate(`/orcamentos/${conta.orcamento_id}`); }}
            >
              {conta.numero_aprovado || conta.numero_orcamento}
            </button>
          </div>
        )}
        <div style={linha}><span className="text-muted">Vencimento</span><span>{fmtDiaISO(conta.vencimento)}</span></div>
        <div style={linha}><span className="text-muted">Valor</span><span>{fmtMoeda(conta.valor)}</span></div>
        <div style={linha}><span className="text-muted">{recebendo ? 'Recebido' : 'Pago'}</span><span>{fmtMoeda(conta.valor_pago)}</span></div>
        {conta.desconto > 0 && <div style={linha}><span className="text-muted">Desconto concedido</span><span>{fmtMoeda(conta.desconto)}</span></div>}
        <div style={{ ...linha, fontWeight: 700 }}>
          <span>Saldo</span>
          <span className={conta.saldo > 0 ? '' : 'text-success'}>{fmtMoeda(conta.saldo)}</span>
        </div>
        {conta.quitado_em && <div style={linha}><span className="text-muted">Quitada em</span><span>{fmtDiaISO(conta.quitado_em)}</span></div>}

        <h4 style={tituloSecao}>{recebendo ? 'Recebimentos' : 'Pagamentos'}</h4>
        {conta.baixas.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Nada registrado ainda.</div>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Data</th><th>Forma</th><th>Valor</th><th>Desconto</th><th>Registrado por</th>{isAdmin() && <th />}</tr>
              </thead>
              <tbody>
                {conta.baixas.map((b) => (
                  <tr key={b.id}>
                    <td>{fmtDiaISO(b.data_pagamento)}</td>
                    <td>{rotuloForma(b.forma)}{b.observacao && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.observacao}</div>}</td>
                    <td className="text-success fw-bold">{fmtMoeda(b.valor)}</td>
                    <td>{b.desconto > 0 ? fmtMoeda(b.desconto) : '—'}</td>
                    <td style={{ fontSize: 12 }}>{b.usuario_nome || '—'}<div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDataHora(b.criado_em)}</div></td>
                    {isAdmin() && conta.status !== 'cancelado' && (
                      <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmacao({ estornar: b })}>Estornar</button></td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aberta && (
          <div style={{ marginTop: 14 }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setBaixando(true)}>
              {recebendo ? 'Registrar recebimento' : 'Registrar pagamento'}
            </button>
          </div>
        )}

        {aberta && (
          <form onSubmit={salvarEdicao}>
            <h4 style={tituloSecao}>Editar</h4>
            <div className="form-row">
              <div className="form-group">
                <label>Vencimento</label>
                <input type="date" value={edicao.vencimento} onChange={campo('vencimento')} required />
              </div>
              {podeMudarValor && (
                <div className="form-group">
                  <label>Valor (R$)</label>
                  <input type="number" step="0.01" min="0.01" value={edicao.valor} onChange={campo('valor')} />
                </div>
              )}
              <div className="form-group">
                <label>{recebendo ? 'Nº do boleto / NF' : 'Nº do boleto / NF do fornecedor'}</label>
                <input value={edicao.documento} onChange={campo('documento')} maxLength={60} />
              </div>
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <input value={edicao.descricao} onChange={campo('descricao')} maxLength={200} required />
            </div>
            <div className="form-group">
              <label>Observação</label>
              <input value={edicao.observacao} onChange={campo('observacao')} maxLength={255} />
            </div>
            {conta.orcamento_id && podeMudarValor && (
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
                Mudar o valor de uma parcela desta OS deixa a cobrança diferente do total do orçamento —
                a tela do orçamento vai avisar se não fechar.
              </div>
            )}
            <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
              {isAdmin() && semPagamento && (
                <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmacao('cancelar')}>
                  Cancelar conta
                </button>
              )}
            </div>
          </form>
        )}

        {aberta && conta.recorrencia_id && (
          <>
            <h4 style={tituloSecao}>Despesa recorrente</h4>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
              Esta conta é a {conta.parcela} de {conta.total_parcelas} da série. As ações abaixo valem
              para esta e as próximas que estiverem em aberto e sem pagamento — o que já foi pago não muda.
            </div>
            <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
              <input
                type="number" step="0.01" min="0.01" value={novoValor} placeholder="Novo valor"
                onChange={(e) => setNovoValor(e.target.value)} style={{ width: 150 }}
              />
              <button type="button" className="btn btn-ghost btn-sm" disabled={centavos(novoValor) <= 0} onClick={() => mexerNaSerie('reajustar')}>
                Reajustar esta e as próximas
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => setConfirmacao('serie')}>
                Cancelar esta e as próximas
              </button>
            </div>
          </>
        )}

        {!aberta && conta.observacao && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 14 }}>{conta.observacao}</div>
        )}
      </Modal>

      {baixando && (
        <ModalBaixa
          conta={conta}
          natureza={natureza}
          onClose={() => setBaixando(false)}
          onSalvo={async () => { setBaixando(false); await depoisDeMudar(); }}
        />
      )}

      <ConfirmModal
        isOpen={confirmacao === 'cancelar'}
        onClose={() => setConfirmacao(null)}
        onConfirm={cancelar}
        title="Cancelar esta conta?"
        message="Ela deixa de contar nos totais. Dá para refazer a cobrança depois."
      />
      <ConfirmModal
        isOpen={confirmacao === 'serie'}
        onClose={() => setConfirmacao(null)}
        onConfirm={() => mexerNaSerie('cancelar')}
        title="Cancelar esta e as próximas?"
        message="As contas em aberto e sem pagamento, a partir desta, são canceladas. As já pagas ficam como estão."
      />
      <ConfirmModal
        isOpen={!!confirmacao?.estornar}
        onClose={() => setConfirmacao(null)}
        onConfirm={() => estornar(confirmacao.estornar)}
        title="Estornar este pagamento?"
        message={confirmacao?.estornar
          ? `${fmtMoeda(confirmacao.estornar.valor)} em ${fmtDiaISO(confirmacao.estornar.data_pagamento)} sai do registro e a parcela volta ao saldo anterior.`
          : ''}
      />
    </>
  );
}
