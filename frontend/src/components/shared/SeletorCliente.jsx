import React, { useState, useMemo } from 'react';

/** Texto comparável: sem acento, minúsculo e sem pontuação de CPF/CNPJ. */
const chave = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.\-/]/g, '');

/**
 * Escolha do cliente do orçamento: campo de busca que filtra o select.
 *
 * A busca olha nome, nome fantasia e CPF/CNPJ — com ou sem máscara, já que o número
 * costuma ser digitado dos dois jeitos. O cliente já escolhido continua na lista mesmo
 * que não case com o filtro, senão o select perderia o valor no meio da edição.
 */
export default function SeletorCliente({ clientes, valor, onChange }) {
  const [busca, setBusca] = useState('');

  const selecionado = clientes.find((c) => c.id === parseInt(valor, 10));

  const filtrados = useMemo(() => {
    const termo = chave(busca);
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        c.id === parseInt(valor, 10) ||
        chave(c.nome).includes(termo) ||
        chave(c.nome_fantasia).includes(termo) ||
        chave(c.cpf_cnpj).includes(termo)
    );
  }, [clientes, busca, valor]);

  const nenhum = busca && filtrados.every((c) => c.id === parseInt(valor, 10));

  return (
    <>
      <div className="form-group">
        <label>Selecione o cliente</label>

        <div className="search-box" style={{ maxWidth: 'none', marginBottom: 8 }}>
          <svg viewBox="0 0 24 24" fill="none">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
          </svg>
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, fantasia ou CPF/CNPJ..."
          />
        </div>

        <select value={valor} onChange={(e) => onChange(e.target.value)} required>
          <option value="">Selecione...</option>
          {filtrados.map((c) => (
            <option key={c.id} value={c.id}>{c.nome} — {c.cpf_cnpj}</option>
          ))}
        </select>

        {nenhum && (
          <small style={{ color: 'var(--text-muted)' }}>
            Nenhum cliente encontrado para "{busca}"
          </small>
        )}
      </div>

      {selecionado && (
        <div style={{
          background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
          padding: '12px 14px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.8,
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>{selecionado.nome}</strong><br />
          {selecionado.rua}, {selecionado.numero} — {selecionado.bairro}<br />
          {selecionado.cidade}/{selecionado.estado} — CEP {selecionado.cep}
        </div>
      )}
    </>
  );
}
