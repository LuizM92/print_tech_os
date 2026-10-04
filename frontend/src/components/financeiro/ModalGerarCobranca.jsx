import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../shared/Modal';
import { fmtMoeda, centavos } from '../../utils/format';

/**
 * Gera as parcelas a receber de uma OS/Pedido aprovado.
 *
 * O servidor devolve as formas de cobrar já calculadas (entrada + saldo, parcelado, à
 * vista) com as mesmas contas do PDF; aqui se escolhe uma e ajusta valor e vencimento de
 * cada parcela. O botão só libera quando a soma fecha com o total até o centavo — é a
 * mesma regra que o servidor aplica, mostrada antes do clique em vez de como erro.
 */
export default function ModalGerarCobranca({ orcamentoId, onClose, onGerado }) {
  const [dados, setDados] = useState(null);
  const [escolhida, setEscolhida] = useState(null);
  const [parcelas, setParcelas] = useState([]);
  const [salvando, setSalvando] = useState(false);

  const escolher = (opcao) => {
    setEscolhida(opcao.codigo);
    setParcelas(opcao.parcelas.map((p) => ({ ...p, valor: p.valor.toFixed(2) })));
  };

  useEffect(() => {
    let ativo = true;
    api.get(`/receber/plano-sugerido/${orcamentoId}`)
      .then(({ data }) => {
        if (!ativo) return;
        setDados(data);
        if (data.opcoes.length > 0) {
          setEscolhida(data.opcoes[0].codigo);
          setParcelas(data.opcoes[0].parcelas.map((p) => ({ ...p, valor: p.valor.toFixed(2) })));
        }
      })
      .catch((err) => {
        toast.error(err.response?.data?.erro || 'Erro ao montar a cobrança');
        onClose();
      });
    return () => { ativo = false; };
    // onClose vem do pai a cada render; o plano só precisa ser pedido uma vez.
  }, [orcamentoId]);

  const editar = (indice, campo) => (e) =>
    setParcelas((ps) => ps.map((p, i) => (i === indice ? { ...p, [campo]: e.target.value } : p)));

  const total = dados ? centavos(dados.orcamento.total_geral) : 0;
  const soma = parcelas.reduce((s, p) => s + centavos(p.valor), 0);
  const diferenca = total - soma;
  const fecha = diferenca === 0 && parcelas.every((p) => centavos(p.valor) > 0 && p.vencimento);

  const limite = dados?.cliente.limite_credito;
  const passaDoLimite = limite !== null && limite !== undefined
    && dados.cliente.em_aberto + dados.orcamento.total_geral > limite;

  const gerar = async () => {
    if (salvando) return;
    setSalvando(true);
    try {
      const { data } = await api.post(`/receber/da-os/${orcamentoId}`, {
        parcelas: parcelas.map((p) => ({
          rotulo: p.rotulo, valor: parseFloat(p.valor), vencimento: p.vencimento,
        })),
      });
      toast.success(data.mensagem);
      onGerado();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao gerar a cobrança');
      setSalvando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Gerar cobrança" size="lg">
      {!dados ? (
        <div className="empty-state"><span className="spinner" /></div>
      ) : dados.ja_cobrado ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
          Esta {dados.orcamento.documento} já tem cobrança. Para refazer, cancele as parcelas atuais primeiro.
        </p>
      ) : (
        <>
          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '12px 14px',
            fontSize: 13, lineHeight: 1.8, marginBottom: 18, color: 'var(--text-secondary)',
          }}>
            <strong style={{ color: 'var(--text-primary)' }}>{dados.orcamento.documento} {dados.orcamento.numero}</strong>
            {' '}— {dados.orcamento.cliente_nome}<br />
            Total a cobrar: <strong style={{ color: 'var(--success)' }}>{fmtMoeda(dados.orcamento.total_geral)}</strong>
            {dados.cliente.condicao_pagamento && <> · condição cadastrada do cliente: <strong>{dados.cliente.condicao_pagamento}</strong></>}
          </div>

          {passaDoLimite && (
            <div style={{
              background: 'var(--warning-dim)', color: 'var(--warning)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px', fontSize: 12.5, marginBottom: 18, lineHeight: 1.6,
            }}>
              Com esta cobrança o cliente passa do limite de crédito de {fmtMoeda(limite)}:
              já deve {fmtMoeda(dados.cliente.em_aberto)} em aberto.
            </div>
          )}

          <label>Como cobrar</label>
          <div className="flex gap-2" style={{ flexWrap: 'wrap', marginBottom: 18 }}>
            {dados.opcoes.map((o) => (
              <button
                key={o.codigo}
                type="button"
                className={`btn btn-sm ${escolhida === o.codigo ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => escolher(o)}
              >
                {o.titulo}
              </button>
            ))}
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Parcela</th><th>Valor (R$)</th><th>Vencimento</th></tr>
              </thead>
              <tbody>
                {parcelas.map((p, i) => (
                  <tr key={`${escolhida}-${i}`}>
                    <td>{p.rotulo}</td>
                    <td style={{ minWidth: 130 }}>
                      <input type="number" step="0.01" min="0.01" value={p.valor} onChange={editar(i, 'valor')} />
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <input type="date" value={p.vencimento} onChange={editar(i, 'vencimento')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{
            fontSize: 12.5, marginTop: 12, color: fecha ? 'var(--success)' : 'var(--warning)',
          }}>
            {diferenca === 0
              ? `Soma das parcelas: ${fmtMoeda(soma / 100)} — fecha com o total`
              : `Soma das parcelas: ${fmtMoeda(soma / 100)} — ${diferenca > 0 ? 'faltam' : 'sobram'} ${fmtMoeda(Math.abs(diferenca) / 100)} para fechar com o total`}
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.6 }}>
            O desconto do PIX não entra aqui: a cobrança fica pelo valor cheio e o desconto é dado
            na hora de registrar o recebimento.
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={gerar} disabled={!fecha || salvando}>
              {salvando ? 'Gerando...' : 'Gerar cobrança'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
