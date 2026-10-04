import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../shared/Modal';
import SeletorCliente from '../shared/SeletorCliente';
import {
  fmtMoeda, fmtDiaISO, hojeISO, centavos, MAX_PARCELAS, FREQUENCIAS,
} from '../../utils/format';

/**
 * Conta avulsa, sem OS por trás: uma cobrança de cliente (`receber`) ou uma despesa
 * (`pagar`). Parcelar cria N contas mensais a partir do primeiro vencimento; o servidor
 * divide o valor e põe os centavos que sobrarem na última.
 *
 * Despesa também pode ser recorrente (aluguel, internet): informa-se o intervalo e a
 * frequência, e o servidor lança uma conta, de valor cheio, para cada vencimento do período.
 */
export default function ModalLancamento({
  natureza, clientes = [], fornecedores = [], categorias = [], onClose, onSalvo,
}) {
  const recebendo = natureza === 'receber';

  const [form, setForm] = useState({
    cliente_id: '', categoria_id: '', fornecedor_id: '',
    descricao: '', valor: '', parcelas: 1, primeiro_vencimento: hojeISO(),
    documento: '', observacao: '',
    repetir: false, frequencia: 'mensal', fim: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [previa, setPrevia] = useState(null);

  const campo = (nome) => (e) => setForm((f) => ({ ...f, [nome]: e.target.value }));

  const recorrente = !recebendo && form.repetir;

  // Quem diz quantas contas saem é o servidor — a mesma regra que vai lançar.
  useEffect(() => {
    if (!recorrente || !form.primeiro_vencimento || !form.fim) { setPrevia(null); return undefined; }
    let ativo = true;
    api.get('/pagar/recorrencia/previa', {
      params: { inicio: form.primeiro_vencimento, fim: form.fim, frequencia: form.frequencia },
    })
      .then(({ data }) => { if (ativo) setPrevia(data); })
      .catch((err) => { if (ativo) setPrevia({ erro: err.response?.data?.erro || 'Intervalo inválido' }); });
    return () => { ativo = false; };
  }, [recorrente, form.primeiro_vencimento, form.fim, form.frequencia]);

  const parcelas = Math.min(Math.max(parseInt(form.parcelas, 10) || 1, 1), MAX_PARCELAS);
  const porParcela = centavos(form.valor) / 100 / parcelas;

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    try {
      const { data } = recorrente
        ? await api.post('/pagar/recorrencia', {
          descricao: form.descricao,
          valor: form.valor,
          categoria_id: form.categoria_id,
          fornecedor_id: form.fornecedor_id || undefined,
          frequencia: form.frequencia,
          inicio: form.primeiro_vencimento,
          fim: form.fim,
          documento: form.documento,
          observacao: form.observacao,
        })
        : await api.post(`/${natureza}`, {
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

        {!recebendo && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, textTransform: 'none', letterSpacing: 0, fontSize: 13.5, marginBottom: 14, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.repetir}
              onChange={(e) => setForm((f) => ({ ...f, repetir: e.target.checked }))}
              style={{ width: 'auto' }}
            />
            Despesa recorrente (aluguel, internet, assinatura…)
          </label>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>{recorrente ? 'Valor de cada conta (R$)' : 'Valor total (R$)'}</label>
            <input type="number" step="0.01" min="0.01" value={form.valor} onChange={campo('valor')} required />
          </div>
          {recorrente ? (
            <div className="form-group">
              <label>Frequência</label>
              <select value={form.frequencia} onChange={campo('frequencia')}>
                {FREQUENCIAS.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
              </select>
            </div>
          ) : (
            <div className="form-group">
              <label>Parcelas</label>
              <input type="number" step="1" min="1" max={MAX_PARCELAS} value={form.parcelas} onChange={campo('parcelas')} />
            </div>
          )}
          <div className="form-group">
            <label>{recorrente || parcelas > 1 ? '1º vencimento' : 'Vencimento'}</label>
            <input type="date" value={form.primeiro_vencimento} onChange={campo('primeiro_vencimento')} required />
          </div>
          {recorrente && (
            <div className="form-group">
              <label>Lançar até</label>
              <input type="date" value={form.fim} min={form.primeiro_vencimento} onChange={campo('fim')} required />
            </div>
          )}
        </div>

        {recorrente && previa && (
          <div style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14, color: previa.erro ? 'var(--danger)' : 'var(--text-secondary)', lineHeight: 1.6 }}>
            {previa.erro || (
              <>
                Serão lançadas <strong>{previa.total}</strong> conta(s) de {fmtMoeda(centavos(form.valor) / 100)}, de {fmtDiaISO(previa.primeira)} a {fmtDiaISO(previa.ultima)}
                {centavos(form.valor) > 0 && <> — total de {fmtMoeda((centavos(form.valor) * previa.total) / 100)}</>}.
              </>
            )}
          </div>
        )}

        {!recorrente && parcelas > 1 && centavos(form.valor) > 0 && (
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
          <button type="submit" className="btn btn-primary" disabled={salvando || (recorrente && (!previa || !!previa.erro))}>
            {salvando ? 'Salvando...' : (recorrente
              ? (previa?.total ? `Lançar ${previa.total} contas` : 'Lançar')
              : (parcelas > 1 ? `Lançar ${parcelas} parcelas` : 'Lançar'))}
          </button>
        </div>
      </form>
    </Modal>
  );
}
