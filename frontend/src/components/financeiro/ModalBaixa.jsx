import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../shared/Modal';
import {
  fmtMoeda, fmtDiaISO, hojeISO, centavos, FORMAS_PAGAMENTO, DESCONTO_PIX,
} from '../../utils/format';

/**
 * Registra um recebimento (a receber) ou um pagamento (a pagar) numa parcela.
 *
 * O valor já vem preenchido com o saldo; receber menos deixa a parcela parcial, e
 * receber mais (juros, multa) é aceito. O desconto é separado do dinheiro: a parcela
 * quita quando recebido + desconto alcançam o valor. O atalho do PIX só preenche os
 * campos — quem decide se vale o desconto é quem está recebendo.
 */
export default function ModalBaixa({ conta, natureza, onClose, onSalvo }) {
  const recebendo = natureza === 'receber';
  const substantivo = recebendo ? 'recebimento' : 'pagamento';

  const [form, setForm] = useState({
    valor: conta.saldo.toFixed(2),
    desconto: '',
    data_pagamento: hojeISO(),
    forma: 'pix',
    observacao: '',
  });
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  const saldo = centavos(conta.saldo);
  const cobre = centavos(form.valor) + centavos(form.desconto);
  const sobra = saldo - cobre;

  const aplicarDescontoPix = () => {
    const desconto = Math.round(saldo * DESCONTO_PIX);
    setForm((f) => ({
      ...f,
      forma: 'pix',
      desconto: (desconto / 100).toFixed(2),
      valor: ((saldo - desconto) / 100).toFixed(2),
    }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      const { data } = await api.post(`/${natureza}/${conta.id}/baixas`, {
        valor: form.valor || 0,
        desconto: form.desconto || 0,
        data_pagamento: form.data_pagamento,
        forma: form.forma,
        observacao: form.observacao,
      });
      toast.success(data.mensagem);
      onSalvo();
    } catch (err) {
      toast.error(err.response?.data?.erro || `Erro ao registrar o ${substantivo}`);
      setSalvando(false);
    }
  };

  let dica = null;
  if (cobre > 0) {
    if (sobra > 0) dica = { texto: `Fica parcial — restam ${fmtMoeda(sobra / 100)}`, cor: 'var(--text-secondary)' };
    else if (sobra === 0) dica = { texto: 'Quita a parcela', cor: 'var(--success)' };
    else dica = { texto: `${fmtMoeda(-sobra / 100)} a mais que o saldo (juros ou multa?) — a parcela é quitada`, cor: 'var(--warning)' };
  }

  return (
    <Modal isOpen onClose={onClose} title={recebendo ? 'Registrar recebimento' : 'Registrar pagamento'}>
      <div style={{
        background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', padding: '12px 14px',
        fontSize: 13, lineHeight: 1.8, marginBottom: 18, color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: 'var(--text-primary)' }}>{conta.rotulo || conta.descricao}</strong>
        {' '}— {conta.cliente_nome || conta.fornecedor_nome || conta.descricao}<br />
        Vence em {fmtDiaISO(conta.vencimento)} · valor {fmtMoeda(conta.valor)}
        {conta.valor_pago > 0 && <> · já {recebendo ? 'recebido' : 'pago'} {fmtMoeda(conta.valor_pago)}</>}<br />
        Saldo: <strong style={{ color: 'var(--text-primary)' }}>{fmtMoeda(conta.saldo)}</strong>
      </div>

      <form onSubmit={enviar}>
        <div className="form-row">
          <div className="form-group">
            <label>{recebendo ? 'Valor recebido' : 'Valor pago'} (R$)</label>
            <input type="number" step="0.01" min="0" value={form.valor} onChange={campo('valor')} autoFocus />
          </div>
          <div className="form-group">
            <label>Desconto (R$)</label>
            <input type="number" step="0.01" min="0" value={form.desconto} onChange={campo('desconto')} placeholder="0,00" />
          </div>
        </div>

        {recebendo && (
          <div style={{ marginTop: -6, marginBottom: 14 }}>
            <button type="button" className="link-button" onClick={aplicarDescontoPix}>
              Pagou tudo no PIX? Aplicar {Math.round(DESCONTO_PIX * 100)}% de desconto
            </button>
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Data</label>
            <input type="date" value={form.data_pagamento} max={hojeISO()} onChange={campo('data_pagamento')} required />
          </div>
          <div className="form-group">
            <label>Forma</label>
            <select value={form.forma} onChange={campo('forma')}>
              {FORMAS_PAGAMENTO.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Observação</label>
          <input value={form.observacao} onChange={campo('observacao')} maxLength={255} placeholder="Opcional" />
        </div>

        {dica && <div style={{ fontSize: 12, color: dica.cor, marginBottom: 14 }}>{dica.texto}</div>}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando || cobre <= 0}>
            {salvando ? 'Salvando...' : `Registrar ${substantivo}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
