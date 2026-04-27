import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

const Icon = ({ name }) => {
  const icons = {
    dashboard: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />,
    clients: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />,
    budget: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />,
    materials: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />,
    services: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z" />,
    users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    settings: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />,
    logout: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:16,height:16}}>
      {icons[name]}
    </svg>
  );
};

export default function Sidebar() {
  const { usuario, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };
  const initials = usuario?.nome?.split(' ').map(n => n[0]).slice(0, 2).join('') || 'U';

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Print<span style={{color:'var(--accent)'}}>Tech</span></h1>
        <span>v1.0.0</span>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-title">Principal</div>
          <NavLink to="/dashboard" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="dashboard" /> Dashboard
          </NavLink>
          <NavLink to="/orcamentos" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="budget" /> Orçamentos
          </NavLink>
          <NavLink to="/clientes" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="clients" /> Clientes
          </NavLink>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Cadastros</div>
          <NavLink to="/materiais" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="materials" /> Materiais
          </NavLink>
          <NavLink to="/servicos" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="services" /> Serviços
          </NavLink>
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Administração</div>
          {isAdmin() && (
            <NavLink to="/usuarios" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon name="users" /> Usuários
            </NavLink>
          )}
          <NavLink to="/configuracoes" className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon name="settings" /> Configurações
          </NavLink>
        </div>
      </nav>

      <div className="sidebar-footer">
        <div className="user-info" onClick={handleLogout} title="Clique para sair">
          <div className="user-avatar">{initials}</div>
          <div>
            <div className="user-name">{usuario?.nome?.split(' ')[0]}</div>
            <div className="user-role">{usuario?.perfil}</div>
          </div>
          <div style={{marginLeft:'auto', color:'var(--text-muted)'}}>
            <Icon name="logout" />
          </div>
        </div>
      </div>
    </aside>
  );
}
