import React, { useState, useMemo, useRef, useEffect } from 'react';

/** Texto comparável: sem acento, minúsculo e sem pontuação de CPF/CNPJ. */
const chave = (valor) =>
  String(valor || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.\-/]/g, '');

const IconeBusca = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" />
  </svg>
);

/**
 * Escolha do cliente do orçamento: um campo só, que busca e seleciona.
 *
 * Digitar filtra a lista por nome, nome fantasia ou CPF/CNPJ — com ou sem máscara, já
 * que o número costuma ser digitado dos dois jeitos. Escolher é clicar no resultado ou
 * andar com as setas e apertar Enter; o campo passa a mostrar o cliente escolhido.
 */
export default function SeletorCliente({ clientes, valor, onChange }) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const caixa = useRef(null);
  const lista = useRef(null);

  const selecionado = clientes.find((c) => c.id === parseInt(valor, 10)) || null;

  const filtrados = useMemo(() => {
    const termo = chave(busca);
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        chave(c.nome).includes(termo) ||
        chave(c.nome_fantasia).includes(termo) ||
        chave(c.cpf_cnpj).includes(termo)
    );
  }, [clientes, busca]);

  // Clique fora fecha a lista e desfaz a busca — o campo volta a mostrar o escolhido.
  useEffect(() => {
    if (!aberto) return undefined;
    const fechar = (e) => {
      if (caixa.current && !caixa.current.contains(e.target)) {
        setAberto(false);
        setBusca('');
      }
    };
    document.addEventListener('mousedown', fechar);
    return () => document.removeEventListener('mousedown', fechar);
  }, [aberto]);

  // Mantém à vista a opção que as setas estão percorrendo.
  useEffect(() => {
    if (!aberto || !lista.current) return;
    lista.current.querySelector('.combo-item.ativo')?.scrollIntoView({ block: 'nearest' });
  }, [ativo, aberto]);

  const abrir = () => {
    setAberto(true);
    setBusca('');
    setAtivo(Math.max(0, filtrados.findIndex((c) => c.id === selecionado?.id)));
  };

  const escolher = (cliente) => {
    onChange(String(cliente.id));
    setBusca('');
    setAberto(false);
  };

  const limpar = () => {
    onChange('');
    setBusca('');
    setAberto(false);
  };

  const teclado = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!aberto) return abrir();
      const passo = e.key === 'ArrowDown' ? 1 : -1;
      return setAtivo((i) => (filtrados.length === 0 ? 0 : (i + passo + filtrados.length) % filtrados.length));
    }
    // Enter escolhe da lista em vez de enviar o formulário sem cliente.
    if (e.key === 'Enter' && aberto) {
      e.preventDefault();
      if (filtrados[ativo]) escolher(filtrados[ativo]);
      return undefined;
    }
    if (e.key === 'Escape' && aberto) {
      setAberto(false);
      setBusca('');
    }
    return undefined;
  };

  return (
    <>
      <div className="form-group">
        <label>Cliente</label>

        <div className="combo" ref={caixa}>
          <IconeBusca />
          <input
            type="text"
            className={selecionado && !aberto ? 'combo-escolhido' : ''}
            value={aberto ? busca : selecionado?.nome || ''}
            onChange={(e) => { setBusca(e.target.value); setAtivo(0); if (!aberto) setAberto(true); }}
            onFocus={abrir}
            onKeyDown={teclado}
            placeholder="Busque por nome, fantasia ou CPF/CNPJ..."
            autoComplete="off"
          />

          {selecionado && !aberto && (
            <button type="button" className="combo-limpar" onClick={limpar} title="Trocar cliente">
              <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor" />
              </svg>
            </button>
          )}

          {aberto && (
            <div className="combo-lista" ref={lista}>
              {filtrados.length === 0 ? (
                <div className="combo-vazio">Nenhum cliente encontrado</div>
              ) : filtrados.map((c, i) => (
                <div
                  key={c.id}
                  className={`combo-item ${i === ativo ? 'ativo' : ''} ${c.id === selecionado?.id ? 'escolhido' : ''}`}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(c)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div className="combo-nome">{c.nome}</div>
                    {c.nome_fantasia && c.nome_fantasia !== c.nome && (
                      <div className="combo-sub">{c.nome_fantasia}</div>
                    )}
                  </div>
                  <div className="combo-doc">{c.cpf_cnpj}</div>
                </div>
              ))}
            </div>
          )}
        </div>
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
