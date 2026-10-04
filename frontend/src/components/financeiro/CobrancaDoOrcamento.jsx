import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtMoeda, fmtDiaISO } from '../../utils/format';
import StatusLancamento from './StatusLancamento';
import ModalBaixa from './ModalBaixa';
import ModalGerarCobranca from './ModalGerarCobranca';
import ModalDetalheLancamento from './ModalDetalheLancamento';

const tituloCard = {
  fontSize: 12, fontWeight: 700, marginBottom: 12, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '1px',
};

/**
 * A cobrança dentro da OS/Pedido: as parcelas, quanto já entrou e o botão de gerar.
 *
 * Se o orçamento foi editado depois de cobrar, as parcelas já não fecham com o total e o
 * aviso aparece — nada é refeito sozinho, porque mexer em dinheiro que já foi combinado
 * com o cliente é decisão de quem está olhando a tela.
 */
export default function CobrancaDoOrcamento({ orc, onMudou }) {
  const navigate = useNavigate();
  const [gerando, setGerando] = useState(false);
  const [baixando, setBaixando] = useState(null);
  const [detalhe, setDetalhe] = useState(null);

  const documento = orc.tipo === 'produto' ? 'Pedido' : 'OS';
  const numero = orc.tipo === 'produto' ? orc.numero_pedido : orc.numero_os;
  const parcelas = (orc.cobranca || []).filter((p) => p.status !== 'cancelado');
  const canceladas = (orc.cobranca || []).length - parcelas.length;
  const fin = orc.financeiro;
  const aprovado = orc.status === 'aprovado';

  // Fora de "aprovado" e sem parcelas vivas, não há o que mostrar nem o que gerar.
  if (!aprovado && parcelas.length === 0) return null;

  const depois = () => { setGerando(false); setBaixando(null); onMudou(); };

  return (
    <>
      <h3 style={tituloCard}>Cobrança</h3>

      {parcelas.length === 0 ? (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
            Nenhuma cobrança gerada para {documento === 'OS' ? 'esta OS' : 'este Pedido'}.
            {canceladas > 0 && ` (${canceladas} parcela(s) cancelada(s) antes.)`}
          </div>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setGerando(true)}>
            Gerar cobrança
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: 16 }}>
          {fin.divergente && (
            <div style={{
              background: 'var(--warning-dim)', color: 'var(--warning)', borderRadius: 'var(--radius-sm)',
              padding: '10px 14px', fontSize: 12.5, marginBottom: 12, lineHeight: 1.6,
            }}>
              O total do {documento} ({fmtMoeda(orc.total_geral)}) não fecha com a cobrança
              ({fmtMoeda(fin.cobrado)}): {fin.diferenca > 0 ? 'faltam' : 'sobram'} {fmtMoeda(Math.abs(fin.diferenca))}.
              {' '}Ajuste o valor de uma parcela em aberto (administrador) ou lance a diferença como cobrança avulsa em A receber.
            </div>
          )}

          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Parcela</th><th>Vencimento</th><th>Valor</th><th>Situação</th><th /></tr>
              </thead>
              <tbody>
                {parcelas.map((p) => (
                  <tr key={p.id} onClick={() => setDetalhe(p.id)} style={{ cursor: 'pointer' }}>
                    <td>{p.rotulo || p.descricao}</td>
                    <td className="font-mono" style={{ fontSize: 12.5 }}>{fmtDiaISO(p.vencimento)}</td>
                    <td className="fw-bold">
                      {fmtMoeda(p.valor)}
                      {p.status === 'aberto' && p.valor_pago > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>falta {fmtMoeda(p.saldo)}</div>
                      )}
                    </td>
                    <td><StatusLancamento situacao={p.situacao} /></td>
                    <td style={{ textAlign: 'right' }}>
                      {p.status === 'aberto' && (
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          onClick={(e) => { e.stopPropagation(); setBaixando(p); }}
                        >
                          Receber
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 10, lineHeight: 1.8 }}>
            Cobrado <strong>{fmtMoeda(fin.cobrado)}</strong> · recebido <strong className="text-success">{fmtMoeda(fin.recebido)}</strong>
            {fin.desconto > 0 && <> (+ {fmtMoeda(fin.desconto)} de desconto)</>}
            {' '}· em aberto <strong>{fmtMoeda(fin.em_aberto)}</strong>
            {canceladas > 0 && <> · {canceladas} cancelada(s)</>}
          </div>

          <div className="flex gap-3" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/receber?busca=${encodeURIComponent(numero || orc.numero_orcamento)}`)}
            >
              Ver em A receber
            </button>
          </div>
        </div>
      )}

      {gerando && (
        <ModalGerarCobranca orcamentoId={orc.id} onClose={() => setGerando(false)} onGerado={depois} />
      )}
      {baixando && (
        <ModalBaixa conta={baixando} natureza="receber" onClose={() => setBaixando(null)} onSalvo={depois} />
      )}
      {detalhe && (
        <ModalDetalheLancamento id={detalhe} natureza="receber" onClose={() => setDetalhe(null)} onMudou={onMudou} />
      )}
    </>
  );
}
