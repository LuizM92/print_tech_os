import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from './AuthContext';

/**
 * Estado do sino compartilhado: o item do menu lateral e o botão da barra do celular
 * mostram o mesmo contador, e o painel abre de qualquer um deles. Uma busca só, aqui.
 */

const NotificacoesContext = createContext(null);

// A tela de Impressoras já é ao vivo; o sino é o aviso de fundo nas outras telas.
const INTERVALO_MS = 20000;

export function NotificacoesProvider({ children }) {
  const { usuario } = useAuth();
  const [itens, setItens] = useState([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [aberto, setAberto] = useState(false);
  // Maior id já visto: o que chegar acima dele durante o uso vira um aviso na tela.
  // Na primeira carga não avisa nada — seria despejar o histórico em toasts.
  const ultimoVisto = useRef(null);

  const aplicar = useCallback((data) => {
    setItens(data.itens);
    setNaoLidas(data.nao_lidas);
    const maior = data.itens[0]?.id || 0;
    if (ultimoVisto.current !== null) {
      data.itens
        .filter((n) => n.id > ultimoVisto.current && !n.lida)
        .reverse()
        .forEach((n) => toast(n.titulo, { icon: '🔔', duration: 6000 }));
    }
    ultimoVisto.current = Math.max(ultimoVisto.current || 0, maior);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/notificacoes');
      aplicar(data);
    } catch {
      // Falha de polling não merece aviso: tenta de novo no próximo ciclo.
    }
  }, [aplicar]);

  useEffect(() => {
    if (!usuario) {
      setItens([]);
      setNaoLidas(0);
      ultimoVisto.current = null;
      return undefined;
    }
    carregar();
    const timer = setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);
    const aoVoltar = () => { if (!document.hidden) carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [usuario, carregar]);

  const marcarLida = useCallback(async (id) => {
    // Marca na tela na hora; o servidor confirma com a lista atualizada.
    setItens((lista) => lista.map((n) => (n.id === id ? { ...n, lida: true } : n)));
    setNaoLidas((n) => Math.max(0, n - 1));
    try {
      const { data } = await api.post(`/notificacoes/${id}/lida`);
      aplicar(data);
    } catch {
      carregar();
    }
  }, [aplicar, carregar]);

  const marcarTodas = useCallback(async () => {
    setItens((lista) => lista.map((n) => ({ ...n, lida: true })));
    setNaoLidas(0);
    try {
      const { data } = await api.post('/notificacoes/lidas');
      aplicar(data);
    } catch {
      carregar();
    }
  }, [aplicar, carregar]);

  const valor = {
    itens, naoLidas, aberto,
    abrir: () => { setAberto(true); carregar(); },
    fechar: () => setAberto(false),
    alternar: () => setAberto((a) => { if (!a) carregar(); return !a; }),
    marcarLida, marcarTodas,
  };

  return <NotificacoesContext.Provider value={valor}>{children}</NotificacoesContext.Provider>;
}

export const useNotificacoes = () => {
  const ctx = useContext(NotificacoesContext);
  if (!ctx) throw new Error('useNotificacoes deve ser usado dentro de NotificacoesProvider');
  return ctx;
};
