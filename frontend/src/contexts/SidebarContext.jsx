import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import usePersistido from '../hooks/usePersistido';

const SidebarContext = createContext(null);

// Mesmo ponto de corte do CSS: abaixo disso o menu vira gaveta.
const CONSULTA_MOBILE = '(max-width: 768px)';

function useEhMobile() {
  const [ehMobile, setEhMobile] = useState(() => window.matchMedia(CONSULTA_MOBILE).matches);
  useEffect(() => {
    const mq = window.matchMedia(CONSULTA_MOBILE);
    const aoMudar = (e) => setEhMobile(e.matches);
    mq.addEventListener('change', aoMudar);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);
  return ehMobile;
}

const emCampoDeTexto = (el) =>
  !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable);

/**
 * Estado do menu lateral compartilhado entre o Sidebar e o layout: o layout precisa
 * saber a largura para afastar o conteúdo, e a barra do celular precisa abrir a gaveta.
 */
export const SidebarProvider = ({ children }) => {
  const [recolhidaPreferida, setRecolhida] = usePersistido('pt.menu.recolhido', false);
  const [menuMobileAberto, setMenuMobileAberto] = useState(false);
  const ehMobile = useEhMobile();

  // No celular a preferência fica guardada, mas não vale: a gaveta abre sempre inteira.
  const recolhida = recolhidaPreferida && !ehMobile;

  const alternarRecolhida = useCallback(() => setRecolhida((v) => !v), [setRecolhida]);
  const abrirMenuMobile = useCallback(() => setMenuMobileAberto(true), []);
  const fecharMenuMobile = useCallback(() => setMenuMobileAberto(false), []);

  // Ctrl+B recolhe/expande, como nos editores de código. Fora de campos de texto,
  // para não atropelar um atalho de formatação.
  useEffect(() => {
    const aoTeclar = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if ((e.key || '').toLowerCase() !== 'b') return;
      if (emCampoDeTexto(document.activeElement)) return;
      e.preventDefault();
      if (ehMobile) setMenuMobileAberto((v) => !v);
      else setRecolhida((v) => !v);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [ehMobile, setRecolhida]);

  // Gaveta aberta trava a rolagem da página que ficou atrás dela.
  useEffect(() => {
    if (!(menuMobileAberto && ehMobile)) return undefined;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = anterior; };
  }, [menuMobileAberto, ehMobile]);

  // Se a janela alargar com a gaveta aberta, ela deixa de existir — fecha para não
  // sobrar o fundo escuro por cima do conteúdo.
  useEffect(() => { if (!ehMobile) setMenuMobileAberto(false); }, [ehMobile]);

  const valor = useMemo(
    () => ({ recolhida, ehMobile, menuMobileAberto, alternarRecolhida, abrirMenuMobile, fecharMenuMobile }),
    [recolhida, ehMobile, menuMobileAberto, alternarRecolhida, abrirMenuMobile, fecharMenuMobile]
  );

  return <SidebarContext.Provider value={valor}>{children}</SidebarContext.Provider>;
};

export const useSidebar = () => {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar deve ser usado dentro de SidebarProvider');
  return ctx;
};
