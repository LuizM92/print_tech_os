import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificacoes } from '../../contexts/NotificacoesContext';
import Icon from './Icon';

// Cor e ícone de cada tipo — os mesmos estados do card da impressora.
const TIPOS = {
  concluida: { cor: 'var(--success)', icone: 'check' },
  erro: { cor: 'var(--danger)', icone: 'alerta' },
  pausada: { cor: 'var(--warning)', icone: 'pausar' },
  offline: { cor: 'var(--danger)', icone: 'semRede' },
  online: { cor: 'var(--success)', icone: 'impressora' },
  financeiro: { cor: 'var(--warning)', icone: 'dinheiro' },
};

/** "agora", "há 5 min", "há 3 h", "ontem 14:20", "12/09 08:15". */
function quando(data) {
  const d = new Date(data);
  const seg = (Date.now() - d.getTime()) / 1000;
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const hoje = new Date();
  const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
  if (d.toDateString() === hoje.toDateString()) return `há ${Math.floor(seg / 3600)} h`;
  if (d.toDateString() === ontem.toDateString()) return `ontem ${hora}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`;
}

/** O painel do sino. Fica no layout e abre ao lado do menu (ou embaixo da barra, no celular). */
export default function PainelNotificacoes() {
  const { itens, naoLidas, aberto, fechar, marcarLida, marcarTodas } = useNotificacoes();
  const navigate = useNavigate();
  const ref = useRef(null);

  // Fecha no Esc e no clique fora — menos no próprio botão do sino, que alterna sozinho.
  useEffect(() => {
    if (!aberto) return undefined;
    const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };
    const aoClicar = (e) => {
      if (ref.current?.contains(e.target) || e.target.closest?.('[data-sino]')) return;
      fechar();
    };
    window.addEventListener('keydown', aoTeclar);
    document.addEventListener('mousedown', aoClicar);
    return () => { window.removeEventListener('keydown', aoTeclar); document.removeEventListener('mousedown', aoClicar); };
  }, [aberto, fechar]);

  if (!aberto) return null;

  const abrirItem = (n) => {
    if (!n.lida) marcarLida(n.id);
    fechar();
    if (n.url) navigate(n.url);
  };

  return (
    <div className="notif-painel" ref={ref} role="dialog" aria-label="Notificações">
      <div className="notif-topo">
        <strong>Notificações</strong>
        {naoLidas > 0 && (
          <button type="button" className="link-button" onClick={marcarTodas}>Marcar todas como lidas</button>
        )}
      </div>
      <div className="notif-lista">
        {itens.length === 0 ? (
          <div className="notif-vazio">
            <Icon name="sino" />
            <p>Nada por aqui ainda.</p>
            <p>Quando uma impressora terminar, falhar, pausar sozinha ou cair da rede, aparece aqui.</p>
          </div>
        ) : itens.map((n) => {
          const t = TIPOS[n.tipo] || { cor: 'var(--accent)', icone: 'sino' };
          return (
            <button
              key={n.id}
              type="button"
              className={`notif-item ${n.lida ? '' : 'nova'}`}
              onClick={() => abrirItem(n)}
            >
              <span className="notif-icone" style={{ color: t.cor }}><Icon name={t.icone} /></span>
              <span className="notif-texto">
                <strong>{n.titulo}</strong>
                {n.corpo && <span>{n.corpo}</span>}
                <small>{quando(n.criado_em)}</small>
              </span>
              {!n.lida && <span className="notif-ponto" aria-label="Não lida" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
