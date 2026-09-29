import React from 'react';
import { useSidebar } from '../../contexts/SidebarContext';
import { useNotificacoes } from '../../contexts/NotificacoesContext';
import Icon from './Icon';

/** Barra fina no topo das telas estreitas: é dela que a gaveta do menu abre. Só existe via CSS abaixo de 768px. */
export default function BarraMobile() {
  const { abrirMenuMobile, menuMobileAberto } = useSidebar();
  const { naoLidas, alternar, aberto } = useNotificacoes();
  return (
    <header className="barra-mobile">
      <button type="button" className="btn-icon" onClick={abrirMenuMobile} aria-label="Abrir menu" aria-expanded={menuMobileAberto}>
        <Icon name="menu" />
      </button>
      <span className="sidebar-marca">Print<span>Tech</span></span>
      <button
        type="button"
        className="btn-icon barra-sino"
        data-sino
        onClick={alternar}
        aria-label={naoLidas ? `Notificações: ${naoLidas} não lidas` : 'Notificações'}
        aria-expanded={aberto}
      >
        <Icon name="sino" />
        {naoLidas > 0 && <span className="sino-contador">{naoLidas > 99 ? '99+' : naoLidas}</span>}
      </button>
    </header>
  );
}
