import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSidebar } from '../../contexts/SidebarContext';
import usePersistido from '../../hooks/usePersistido';
import Icon from './Icon';

// O Dashboard fica solto no topo: é a porta de entrada, não pertence a grupo nenhum.
const INICIO = { to: '/dashboard', icone: 'dashboard', rotulo: 'Dashboard' };

// Os grupos seguem a ordem do negócio: vender → fabricar → manter os cadastros → administrar.
const GRUPOS = [
  {
    id: 'comercial',
    titulo: 'Comercial',
    itens: [
      { to: '/orcamentos', icone: 'budget', rotulo: 'Orçamentos' },
      { to: '/vendas', icone: 'vendas', rotulo: 'Vendas' },
      { to: '/clientes', icone: 'clients', rotulo: 'Clientes' },
    ],
  },
  {
    id: 'oficina',
    titulo: 'Oficina',
    itens: [
      { to: '/producao', icone: 'producao', rotulo: 'Produção' },
      // Catálogo do que a gente fabrica (SKU pai e variações). O rótulo não repete
      // "Produtos" para não confundir com a mercadoria de revenda, em Cadastros.
      { to: '/fabricacao/produtos', icone: 'fabricacao', rotulo: 'Fabricação' },
    ],
  },
  {
    id: 'cadastros',
    titulo: 'Cadastros',
    itens: [
      { to: '/produtos', icone: 'produtos', rotulo: 'Produtos' },
      { to: '/materiais', icone: 'materials', rotulo: 'Materiais' },
      { to: '/servicos', icone: 'services', rotulo: 'Serviços' },
    ],
  },
  {
    id: 'admin',
    titulo: 'Administração',
    itens: [
      { to: '/usuarios', icone: 'users', rotulo: 'Usuários', somenteAdmin: true },
      { to: '/configuracoes', icone: 'settings', rotulo: 'Configurações' },
    ],
  },
];

/** Mesmo critério do NavLink: a rota e tudo que está abaixo dela (/orcamentos/novo, /orcamentos/12). */
const rotaAtiva = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);

const classeItem = ({ isActive }) => `nav-item ${isActive ? 'active' : ''}`;

export default function Sidebar() {
  const { usuario, logout, isAdmin } = useAuth();
  const { recolhida, menuMobileAberto, alternarRecolhida, fecharMenuMobile } = useSidebar();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Só guarda o que o usuário fechou; grupo novo já nasce aberto.
  const [gruposFechados, setGruposFechados] = usePersistido('pt.menu.gruposFechados', {});
  const [dica, setDica] = useState(null);

  const admin = isAdmin();
  const grupos = GRUPOS
    .map((g) => ({ ...g, itens: g.itens.filter((i) => !i.somenteAdmin || admin) }))
    .filter((g) => g.itens.length > 0);

  const grupoDaRota = GRUPOS.find((g) => g.itens.some((i) => rotaAtiva(pathname, i.to)))?.id;

  // Entrar numa tela abre o grupo dela: o item ativo nunca fica escondido atrás de um
  // grupo fechado. Fechar de novo depois disso é escolha do usuário e é respeitado.
  useEffect(() => {
    if (!grupoDaRota) return;
    setGruposFechados((f) => (f[grupoDaRota] ? { ...f, [grupoDaRota]: false } : f));
  }, [grupoDaRota, setGruposFechados]);

  // Trocar de tela fecha a gaveta do celular; Esc também.
  useEffect(() => { fecharMenuMobile(); }, [pathname, fecharMenuMobile]);
  useEffect(() => {
    if (!menuMobileAberto) return undefined;
    const aoTeclar = (e) => { if (e.key === 'Escape') fecharMenuMobile(); };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [menuMobileAberto, fecharMenuMobile]);

  // Recolhido, o rótulo some e vira uma dica ao lado do ícone. A dica é renderizada
  // fora do <aside> com posição fixa, para escapar do overflow da lista.
  useEffect(() => { if (!recolhida) setDica(null); }, [recolhida]);
  const comDica = (texto) => {
    if (!recolhida) return {};
    const mostrar = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      setDica({ texto, top: r.top + r.height / 2 });
    };
    const esconder = () => setDica(null);
    return { onMouseEnter: mostrar, onMouseLeave: esconder, onFocus: mostrar, onBlur: esconder };
  };

  const alternarGrupo = (id) => setGruposFechados((f) => ({ ...f, [id]: !f[id] }));
  const handleLogout = () => { logout(); navigate('/login'); };

  const iniciais = usuario?.nome?.split(' ').map((n) => n[0]).slice(0, 2).join('') || 'U';
  const primeiroNome = usuario?.nome?.split(' ')[0];
  const rotuloAlternar = recolhida ? 'Expandir menu (Ctrl+B)' : 'Recolher menu (Ctrl+B)';

  const renderItem = (item) => (
    <NavLink key={item.to} to={item.to} className={classeItem} aria-label={item.rotulo} {...comDica(item.rotulo)}>
      <Icon name={item.icone} />
      <span className="nav-item-texto">{item.rotulo}</span>
    </NavLink>
  );

  return (
    <>
      <aside
        className={`sidebar ${recolhida ? 'recolhida' : ''} ${menuMobileAberto ? 'aberta' : ''}`}
        aria-label="Menu principal"
      >
        <div className="sidebar-logo">
          <h1 className="sidebar-marca">
            {recolhida ? <>P<span>T</span></> : <>Print<span>Tech</span></>}
          </h1>
          <span className="sidebar-versao">v1.0.0</span>
          <button type="button" className="btn-icon sidebar-fechar" onClick={fecharMenuMobile} aria-label="Fechar menu">
            <Icon name="fechar" />
          </button>
        </div>

        <button
          type="button"
          className="sidebar-alternar"
          onClick={alternarRecolhida}
          aria-expanded={!recolhida}
          aria-label={rotuloAlternar}
          title={recolhida ? undefined : rotuloAlternar}
          {...comDica(rotuloAlternar)}
        >
          <Icon name="recolher" />
        </button>

        <nav className="sidebar-nav" onScroll={() => setDica(null)}>
          <div className="nav-section">{renderItem(INICIO)}</div>

          {grupos.map((grupo) => {
            // Recolhido em ícones não há cabeçalho para clicar, então todo grupo aparece aberto.
            const fechado = !!gruposFechados[grupo.id] && !recolhida;
            const idItens = `nav-grupo-${grupo.id}`;
            return (
              <div key={grupo.id} className={`nav-grupo ${fechado ? 'fechado' : ''}`}>
                <button
                  type="button"
                  className="nav-grupo-cabecalho"
                  onClick={() => alternarGrupo(grupo.id)}
                  aria-expanded={!fechado}
                  aria-controls={idItens}
                  tabIndex={recolhida ? -1 : 0}
                >
                  <span className="nav-grupo-titulo">{grupo.titulo}</span>
                  {/* Grupo fechado com a tela atual dentro: um ponto mostra onde você está. */}
                  {fechado && grupo.id === grupoDaRota && <span className="nav-grupo-ponto" aria-hidden="true" />}
                  <Icon name="chevron" />
                </button>
                <div id={idItens} className="nav-grupo-itens">
                  <div>{grupo.itens.map(renderItem)}</div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar" {...comDica(`${usuario?.nome} · ${usuario?.perfil}`)}>{iniciais}</div>
            <div className="user-texto">
              <div className="user-name">{primeiroNome}</div>
              <div className="user-role">{usuario?.perfil}</div>
            </div>
            <button
              type="button"
              className="btn-icon user-sair"
              onClick={handleLogout}
              aria-label="Sair"
              title={recolhida ? undefined : 'Sair'}
              {...comDica('Sair')}
            >
              <Icon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      {recolhida && dica && (
        <div className="sidebar-dica" role="tooltip" style={{ top: dica.top }}>{dica.texto}</div>
      )}
    </>
  );
}
