import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';

/**
 * Liga e desliga os alertas da farm NESTE aparelho. Cada celular ou computador se
 * inscreve por conta própria — é o navegador dele que recebe o aviso.
 */

const SW = '/sw-alertas.js';

/** A chave VAPID vem em base64url; o navegador quer os bytes. */
function paraBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/** "Android · Chrome", "iPhone · Safari" — para a pessoa reconhecer o aparelho depois. */
function nomeDoAparelho() {
  const ua = navigator.userAgent;
  const sistema = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Aparelho';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'navegador';
  return `${sistema} · ${navegador}`;
}

const suportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// No iPhone o push só existe com o site instalado na Tela de Início.
const iphoneSemInstalar = () => /iPhone|iPad/.test(navigator.userAgent)
  && !window.matchMedia('(display-mode: standalone)').matches && !navigator.standalone;

export default function AlertasAparelho() {
  // 'carregando' | 'sem_suporte' | 'iphone' | 'bloqueado' | 'inativo' | 'ativo'
  const [situacao, setSituacao] = useState('carregando');
  const [ocupado, setOcupado] = useState(false);

  const verificar = useCallback(async () => {
    if (iphoneSemInstalar()) return setSituacao('iphone');
    if (!suportado()) return setSituacao('sem_suporte');
    if (Notification.permission === 'denied') return setSituacao('bloqueado');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const inscricao = await reg?.pushManager.getSubscription();
      if (!inscricao) return setSituacao('inativo');
      // O navegador acha que está inscrito; confere se o servidor também (pode ter sido
      // apagada, por exemplo, depois de uma falha de entrega). Se não, reenvia.
      const { data } = await api.post('/alertas/situacao', { endpoint: inscricao.endpoint });
      if (!data.inscrito) {
        await api.post('/alertas/inscricao', { inscricao: inscricao.toJSON(), aparelho: nomeDoAparelho() });
      }
      setSituacao('ativo');
    } catch {
      setSituacao('inativo');
    }
  }, []);

  useEffect(() => { verificar(); }, [verificar]);

  const ativar = async () => {
    setOcupado(true);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== 'granted') {
        setSituacao(permissao === 'denied' ? 'bloqueado' : 'inativo');
        return;
      }
      const reg = await navigator.serviceWorker.register(SW);
      await navigator.serviceWorker.ready;
      const { data } = await api.get('/alertas/chave');
      const inscricao = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: paraBytes(data.chave),
      });
      await api.post('/alertas/inscricao', { inscricao: inscricao.toJSON(), aparelho: nomeDoAparelho() });
      setSituacao('ativo');
      toast.success('Alertas ativados neste aparelho');
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Não foi possível ativar os alertas neste navegador');
    } finally {
      setOcupado(false);
    }
  };

  const desativar = async () => {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration('/');
      const inscricao = await reg?.pushManager.getSubscription();
      if (inscricao) {
        await api.delete('/alertas/inscricao', { data: { endpoint: inscricao.endpoint } });
        await inscricao.unsubscribe();
      }
      setSituacao('inativo');
      toast.success('Alertas desativados neste aparelho');
    } catch {
      toast.error('Erro ao desativar');
    } finally {
      setOcupado(false);
    }
  };

  const testar = async () => {
    setOcupado(true);
    try {
      const { data } = await api.post('/alertas/teste');
      toast.success(data.mensagem);
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao enviar o teste');
    } finally {
      setOcupado(false);
    }
  };

  if (situacao === 'carregando') return null;

  const textos = {
    ativo: 'Alertas ativos neste aparelho: impressão concluída, erro, pausa inesperada e queda da rede.',
    inativo: 'Receba um aviso neste aparelho quando uma impressora terminar, falhar, pausar sozinha ou cair da rede.',
    bloqueado: 'As notificações deste site estão bloqueadas no navegador. Libere nas configurações do site para ativar.',
    iphone: 'No iPhone, os alertas só funcionam com o sistema na Tela de Início: toque em Compartilhar → "Adicionar à Tela de Início" e abra por lá.',
    sem_suporte: 'Este navegador não recebe notificações. No celular, use o Chrome (Android) ou o sistema instalado na Tela de Início (iPhone).',
  };

  return (
    <div className={`alertas-aparelho ${situacao === 'ativo' ? 'ativo' : ''}`}>
      <span>{textos[situacao]}</span>
      <div className="flex gap-2">
        {situacao === 'inativo' && (
          <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={ativar}>Ativar alertas</button>
        )}
        {situacao === 'ativo' && (
          <>
            <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={testar}>Enviar teste</button>
            <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={desativar}>Desativar</button>
          </>
        )}
      </div>
    </div>
  );
}
