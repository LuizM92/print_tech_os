import React from 'react';
import { useSidebar } from '../../contexts/SidebarContext';
import Icon from './Icon';

/** Barra fina no topo das telas estreitas: é dela que a gaveta do menu abre. Só existe via CSS abaixo de 768px. */
export default function BarraMobile() {
  const { abrirMenuMobile, menuMobileAberto } = useSidebar();
  return (
    <header className="barra-mobile">
      <button type="button" className="btn-icon" onClick={abrirMenuMobile} aria-label="Abrir menu" aria-expanded={menuMobileAberto}>
        <Icon name="menu" />
      </button>
      <span className="sidebar-marca">Print<span>Tech</span></span>
    </header>
  );
}
