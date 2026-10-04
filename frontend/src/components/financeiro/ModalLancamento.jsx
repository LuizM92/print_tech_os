import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../shared/Modal';
import SeletorCliente from '../shared/SeletorCliente';
import { fmtMoeda, hojeISO, centavos, MAX_PARCELAS } from '../../utils/format';

/**
 * Conta avulsa, sem OS por trás: uma cobrança de cliente (`receber`) ou uma despesa
 * (`pagar`). Parcelar cria N contas mensais a partir do primeiro vencimento; o servidor
 * divide o valor e põe os centavos que sobrarem na última.
 */
export default function ModalLancamento({
  natureza, clientes = [], fornecedores = [], categorias = [], onClose, onSalvo,
}) {
  const recebendo = natureza === 'receber';

  const [form, setForm] = useState({
    cliente_id: '', categoria_id: '', fornecedor_id: '',
    descricao: '', valor: '', parcelas: 1, primeiro_vencimento: hojeISO(),
    documento: '', observacao: '',
  });
  const [salvando, setSalvando] = useState(false);

  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  const parcelas = Math.min(Math.max(parseInt(form.parcelas, 10) || 1, 1), MAX_PARCELAS);
  const porParcela = centavos(form.valor) / 100 / parcelas;

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      const { data } = await api.post(`/${natureza}`, {
        ...form,
        parcelas,
        cliente_id: recebendo ? form.cliente_id : undefined,
        categoria_id: recebendo ? undefined : form.categoria_id,
        fornecedor_id: recebendo ? undefined : (form.fornecedor_id || undefined),
      });
      toast.success(data.mensagem);
      onSalvo();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao lançar a conta');
      setSalvando(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={recebendo ? 'Nova cobrança' : 'Nova despesa'} size="lg">
      <form onSubmit={enviar}>
        {recebendo ? (
          <SeletorCliente
            clientes={clientes}
            valor={form.cliente_id}
            onChange={(id) => setForm((f) => ({ ...f, cliente_id: id }))}
          />
        ) : (
          <div className="form-row">
            <div className="form-group">
              <label>Categoria</label>
              <select value={form.categoria_id} onChange={campo('categoria_id')} required>
                <option value="">Selecione...</option>
                {categorias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Fornecedor (opcional)</label>
              <select value={form.fornecedor_id} onChange={campo('fornecedor_id')}>
                <option value="">— sem fornecedor —</option>
                {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="form-group" style={recebendo ? { marginTop: 18 } : undefined}>
          <label>Descrição</label>
          <input
            value={form.descricao}
            onChange={campo('descricao')}
            maxLength={200}
            placeholder={recebendo ? 'Ex.: manutenção da impressora' : 'Ex.: aluguel do galpão — outubro'}
            required
          />
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Valor total (R$)</label>
            <input type="number" step="0.01" min="0.01" value={form.valor} onChange={campo('valor')} required />
          </div>
          <div className="form-group">
            <label>Parcelas</label>
            <input type="number" step="1" min="1" max={MAX_PARCELAS} value={form.parcelas} onChange={campo('parcelas')} />
          </div>
          <div className="form-group">
            <label>{parcelas > 1 ? '1º vencimento' : 'Vencimento'}</label>
            <input type="date" value={form.primeiro_vencimento} onChange={campo('primeiro_vencimento')} required />
          </div>
        </div>

        {parcelas > 1 && centavos(form.valor) > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: -6, marginBottom: 14 }}>
            {parcelas} parcelas mensais de cerca de {fmtMoeda(porParcela)}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>{recebendo ? 'Nº do boleto / NF' : 'Nº do boleto / NF do fornecedor'}</label>
            <input value={form.documento} onChange={campo('documento')} maxLength={60} placeholder="Opcional" />
          </div>
          <div className="form-group">
            <label>Observação</label>
            <input value={form.observacao} onChange={campo('observacao')} maxLength={255} placeholder="Opcional" />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : (parcelas > 1 ? `Lançar ${parcelas} parcelas` : 'Lançar')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
