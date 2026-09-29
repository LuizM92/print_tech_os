import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import Modal, { ConfirmModal } from '../components/shared/Modal';
import Icon from '../components/shared/Icon';
import toast from 'react-hot-toast';
import { fmtDataHora } from '../utils/format';

// O backend lê as impressoras a cada 3 s; a tela acompanha no mesmo passo.
const INTERVALO_MS = 3000;

const ESTADOS = {
  imprimindo: { rotulo: 'Imprimindo', classe: 'imp-imprimindo' },
  pausada: { rotulo: 'Pausada', classe: 'imp-pausada' },
  concluida: { rotulo: 'Concluída', classe: 'imp-concluida' },
  cancelada: { rotulo: 'Cancelada', classe: 'imp-ociosa' },
  erro: { rotulo: 'Erro', classe: 'imp-erro' },
  offline: { rotulo: 'Offline', classe: 'imp-offline' },
  iniciando: { rotulo: 'Iniciando', classe: 'imp-pausada' },
  ociosa: { rotulo: 'Livre', classe: 'imp-ociosa' },
};
const AGUARDANDO = { rotulo: 'Conectando…', classe: 'imp-ociosa' };

const ROTULO_EVENTO = {
  inicio: 'Começou', concluida: 'Concluiu', cancelada: 'Cancelada', pausada: 'Pausou',
  retomada: 'Retomou', erro: 'Erro', offline: 'Saiu da rede', online: 'Voltou à rede', comando: 'Comando',
};

const MARCAS = ['Creality', 'Elegoo', 'Flashforge', 'Bambu Lab', 'Outra'];

const FORM_VAZIO = { nome: '', marca: 'Creality', modelo: '', host: '', porta: '7125', api_key: '', url_camera: '', ordem: '0' };

/** 1h 23min · 12min · <1min */
const fmtDuracao = (s) => {
  if (s === null || s === undefined) return '—';
  const min = Math.round(s / 60);
  if (min < 1) return '<1min';
  const h = Math.floor(min / 60);
  return h ? `${h}h ${String(min % 60).padStart(2, '0')}min` : `${min}min`;
};

const fmtHora = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** "às 16:40", ou "amanhã às 03:10" quando vira o dia. */
const previsaoTermino = (restante) => {
  if (!restante) return null;
  const fim = new Date(Date.now() + restante * 1000);
  const hoje = new Date();
  const dias = Math.round((new Date(fim.toDateString()) - new Date(hoje.toDateString())) / 86400000);
  if (dias === 0) return `às ${fmtHora(fim)}`;
  if (dias === 1) return `amanhã às ${fmtHora(fim)}`;
  return `${fim.toLocaleDateString('pt-BR')} ${fmtHora(fim)}`;
};

const fmtTemp = (t) => (t && t.atual !== null ? `${Math.round(t.atual)}°${t.alvo ? ` / ${Math.round(t.alvo)}°` : ''}` : '—');

/** Nome do arquivo sem pasta nem extensão — é o que se reconhece de longe. */
const nomeArquivo = (a) => a?.split('/').pop().replace(/\.gcode$/i, '');

export default function Impressoras() {
  const { isAdmin } = useAuth();
  const [lista, setLista] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(null); // `${id}:${acao}` enquanto o comando está no ar
  const [confirmar, setConfirmar] = useState(null); // { imp, acao, titulo, mensagem }
  const [cadastro, setCadastro] = useState(null);   // null | { id?, form }
  const [cameraDe, setCameraDe] = useState(null);
  const [controlesDe, setControlesDe] = useState(null);
  const [removerId, setRemoverId] = useState(null);

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get('/impressoras');
      setLista(data);
    } catch {
      // Polling: uma falha isolada não merece toast a cada 3 s. A tela fica com o
      // último estado e tenta de novo.
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    const timer = setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);
    const aoVoltar = () => { if (!document.hidden) carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [carregar]);

  const comandar = async (imp, acao, valor) => {
    setEnviando(`${imp.id}:${acao}`);
    try {
      const { data } = await api.post(`/impressoras/${imp.id}/comando`, { acao, valor });
      toast.success(`${imp.nome}: ${data.mensagem}`);
      setLista((atual) => atual.map((i) => (i.id === imp.id ? { ...i, status: data.status } : i)));
      return true;
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao mandar o comando');
      return false;
    } finally {
      setEnviando(null);
    }
  };

  const pedirConfirmacao = (imp, acao) => {
    const textos = {
      cancelar: { titulo: 'Cancelar impressão?', mensagem: `${imp.nome} vai parar "${nomeArquivo(imp.status?.job?.arquivo)}". Não dá para retomar depois.` },
      emergencia: { titulo: 'Parada de emergência?', mensagem: `${imp.nome} desliga motores e aquecimento na hora. Depois é preciso reiniciar o firmware.` },
      reiniciar_firmware: { titulo: 'Reiniciar o firmware?', mensagem: `O Klipper de ${imp.nome} reinicia. Se houver impressão rodando, ela é perdida.` },
    };
    setConfirmar({ imp, acao, ...textos[acao] });
  };

  const executarConfirmado = async () => {
    const { imp, acao } = confirmar;
    setConfirmar(null);
    await comandar(imp, acao);
  };

  const remover = async () => {
    try {
      await api.delete(`/impressoras/${removerId}`);
      toast.success('Impressora removida');
      setRemoverId(null);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao remover');
    }
  };

  const contagem = (estados) => lista.filter((i) => estados.includes(i.status?.estado)).length;
  const controlando = lista.find((i) => i.id === controlesDe);

  return (
    <>
      <div className="page-header">
        <h2>Impressoras</h2>
        <p>Estado da farm ao vivo — atualiza a cada {INTERVALO_MS / 1000} segundos</p>
      </div>
      <div className="page-content">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Imprimindo</div><div className="stat-value accent">{contagem(['imprimindo'])}</div></div>
          <div className="stat-card"><div className="stat-label">Pausadas</div><div className="stat-value warning">{contagem(['pausada'])}</div></div>
          <div className="stat-card"><div className="stat-label">Livres</div><div className="stat-value success">{contagem(['ociosa', 'concluida', 'cancelada'])}</div></div>
          <div className="stat-card"><div className="stat-label">Com problema</div><div className="stat-value" style={{ color: 'var(--danger)' }}>{contagem(['erro', 'offline'])}</div></div>
        </div>

        {isAdmin() && (
          <div className="toolbar">
            <div />
            <button className="btn btn-primary" onClick={() => setCadastro({ form: FORM_VAZIO })}>
              <Icon name="mais" /> Nova impressora
            </button>
          </div>
        )}

        {carregando ? (
          <div className="loading-screen"><span className="spinner" /></div>
        ) : lista.length === 0 ? (
          <div className="card">
            <div className="empty-state">
              <Icon name="impressora" />
              <h3>Nenhuma impressora cadastrada</h3>
              <p>{isAdmin() ? 'Cadastre a primeira com o IP dela na rede interna.' : 'Peça ao administrador para cadastrar as impressoras.'}</p>
            </div>
          </div>
        ) : (
          <div className="imp-grid">
            {lista.map((imp) => (
              <CartaoImpressora
                key={imp.id}
                imp={imp}
                admin={isAdmin()}
                enviando={enviando}
                onComando={(acao) => comandar(imp, acao)}
                onConfirmar={(acao) => pedirConfirmacao(imp, acao)}
                onCamera={() => setCameraDe(imp)}
                onControles={() => setControlesDe(imp.id)}
                onEditar={() => setCadastro({
                  id: imp.id,
                  temApiKey: imp.tem_api_key,
                  form: {
                    nome: imp.nome, marca: imp.marca || 'Outra', modelo: imp.modelo || '', host: imp.host,
                    porta: String(imp.porta || ''), api_key: '', url_camera: imp.url_camera || '', ordem: String(imp.ordem || 0),
                  },
                })}
                onRemover={() => setRemoverId(imp.id)}
              />
            ))}
          </div>
        )}
      </div>

      {cadastro && (
        <ModalCadastro
          inicial={cadastro}
          onFechar={() => setCadastro(null)}
          onSalvo={() => { setCadastro(null); carregar(); }}
        />
      )}
      {cameraDe && <ModalCamera imp={cameraDe} onFechar={() => setCameraDe(null)} />}
      {controlando && (
        <ModalControles
          imp={controlando}
          enviando={enviando}
          onComando={(acao, valor) => comandar(controlando, acao, valor)}
          onConfirmar={(acao) => pedirConfirmacao(controlando, acao)}
          onFechar={() => setControlesDe(null)}
        />
      )}
      <ConfirmModal
        isOpen={!!confirmar}
        onClose={() => setConfirmar(null)}
        onConfirm={executarConfirmado}
        title={confirmar?.titulo}
        message={confirmar?.mensagem}
      />
      <ConfirmModal
        isOpen={!!removerId}
        onClose={() => setRemoverId(null)}
        onConfirm={remover}
        title="Remover impressora?"
        message="Ela sai do monitor. O histórico de eventos fica guardado."
      />
    </>
  );
}

function CartaoImpressora({ imp, admin, enviando, onComando, onConfirmar, onCamera, onControles, onEditar, onRemover }) {
  const s = imp.status;
  const est = (s && ESTADOS[s.estado]) || AGUARDANDO;
  const job = s?.job;
  const ocupado = (acao) => enviando === `${imp.id}:${acao}`;
  const online = s && s.estado !== 'offline';
  const emAndamento = ['imprimindo', 'pausada'].includes(s?.estado);

  return (
    <div className={`imp-card ${est.classe}`}>
      <div className="imp-topo">
        <div className="imp-titulo">
          <strong>{imp.nome}</strong>
          <span>{[imp.marca, imp.modelo].filter(Boolean).join(' · ') || imp.host}</span>
        </div>
        <span className="imp-estado">{est.rotulo}</span>
      </div>

      {s?.mensagem && ['erro', 'offline', 'iniciando'].includes(s.estado) && (
        <div className="imp-mensagem">{s.mensagem}</div>
      )}

      {job ? (
        <div className="imp-job">
          <div className="imp-arquivo" title={job.arquivo}>{nomeArquivo(job.arquivo)}</div>
          <div className="imp-barra"><div style={{ width: `${Math.min(100, job.progresso ?? 0)}%` }} /></div>
          <div className="imp-job-linha">
            <span className="font-mono">{job.progresso !== null ? `${Math.round(job.progresso)}%` : '—'}</span>
            {job.camadas ? <span>Camada {job.camada ?? '?'}/{job.camadas}</span> : null}
            <span>{fmtDuracao(job.decorrido_s)} decorrido</span>
          </div>
          {emAndamento && job.restante_s ? (
            <div className="imp-job-linha">
              <span>Faltam <strong>{fmtDuracao(job.restante_s)}</strong></span>
              <span>termina {previsaoTermino(job.restante_s)}</span>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="imp-job imp-job-vazio">{online ? 'Sem impressão em andamento' : ' '}</div>
      )}

      {online && (
        <div className="imp-temps">
          <span>Bico <strong>{fmtTemp(s.temperaturas?.bico)}</strong></span>
          <span>Mesa <strong>{fmtTemp(s.temperaturas?.mesa)}</strong></span>
          {s.velocidade_pct !== null && s.velocidade_pct !== undefined && s.velocidade_pct !== 100 && (
            <span>Vel. <strong>{s.velocidade_pct}%</strong></span>
          )}
        </div>
      )}

      <div className="imp-acoes">
        {s?.estado === 'imprimindo' && (
          <button className="btn btn-ghost btn-sm" disabled={ocupado('pausar')} onClick={() => onComando('pausar')}>
            <Icon name="pausar" /> Pausar
          </button>
        )}
        {s?.estado === 'pausada' && (
          <button className="btn btn-success btn-sm" disabled={ocupado('retomar')} onClick={() => onComando('retomar')}>
            <Icon name="retomar" /> Retomar
          </button>
        )}
        {emAndamento && (
          <button className="btn btn-danger btn-sm" disabled={ocupado('cancelar')} onClick={() => onConfirmar('cancelar')}>
            <Icon name="fechar" /> Cancelar
          </button>
        )}
        <div className="imp-acoes-direita">
          <button className="btn-icon" onClick={onCamera} disabled={!online} title="Câmera" aria-label="Câmera"><Icon name="camera" /></button>
          <button className="btn-icon" onClick={onControles} title="Controles e histórico" aria-label="Controles e histórico"><Icon name="settings" /></button>
          {admin && <button className="btn-icon" onClick={onEditar} title="Editar cadastro" aria-label="Editar cadastro"><Icon name="editar" /></button>}
          {admin && <button className="btn-icon danger" onClick={onRemover} title="Remover" aria-label="Remover"><Icon name="excluir" /></button>}
        </div>
      </div>
    </div>
  );
}

function ModalCadastro({ inicial, onFechar, onSalvo }) {
  const [form, setForm] = useState(inicial.form);
  const [removerKey, setRemoverKey] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [teste, setTeste] = useState(null); // { ok, texto }
  const editando = !!inicial.id;
  const f = (campo) => (e) => { setForm({ ...form, [campo]: e.target.value }); setTeste(null); };

  const corpo = () => ({ ...form, id: inicial.id, protocolo: 'moonraker', remover_api_key: removerKey });

  const testar = async () => {
    setTeste({ ok: null, texto: 'Testando…' });
    try {
      const { data } = await api.post('/impressoras/testar', corpo());
      setTeste({ ok: true, texto: `Conectou: ${data.nome} · Klipper ${data.versao} · ${data.estado}` });
    } catch (err) {
      setTeste({ ok: false, texto: err.response?.data?.erro || 'Não conectou' });
    }
  };

  const salvar = async (e) => {
    e.preventDefault();
    setSalvando(true);
    try {
      if (editando) await api.put(`/impressoras/${inicial.id}`, corpo());
      else await api.post('/impressoras', corpo());
      toast.success(editando ? 'Impressora atualizada' : 'Impressora cadastrada');
      onSalvo();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Modal isOpen onClose={onFechar} title={editando ? 'Editar impressora' : 'Nova impressora'}>
      <form onSubmit={salvar}>
        <div className="form-row">
          <div className="form-group">
            <label>Nome</label>
            <input value={form.nome} onChange={f('nome')} placeholder="Ex: K1C-01" required />
          </div>
          <div className="form-group">
            <label>Ordem na tela</label>
            <input type="number" value={form.ordem} onChange={f('ordem')} />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Marca</label>
            <select value={form.marca} onChange={f('marca')}>
              {MARCAS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Modelo</label>
            <input value={form.modelo} onChange={f('modelo')} placeholder="Ex: K1 Max" />
          </div>
        </div>
        {['Bambu Lab', 'Flashforge'].includes(form.marca) && (
          <div className="imp-aviso">
            Esta primeira versão fala só com Klipper (Moonraker). {form.marca} entra na próxima etapa —
            dá para cadastrar agora, mas ela vai aparecer offline até lá.
          </div>
        )}
        <div className="form-row">
          <div className="form-group">
            <label>IP na rede interna</label>
            <input value={form.host} onChange={f('host')} placeholder="192.168.1.50" required />
          </div>
          <div className="form-group">
            <label>Porta do Moonraker</label>
            <input type="number" value={form.porta} onChange={f('porta')} placeholder="7125" />
          </div>
        </div>
        <div className="form-group">
          <label>API key do Moonraker (opcional)</label>
          <input
            value={form.api_key}
            onChange={f('api_key')}
            disabled={removerKey}
            placeholder={inicial.temApiKey ? '•••••• gravada — deixe em branco para manter' : 'Só se o servidor não estiver em trusted_clients'}
          />
          {inicial.temApiKey && (
            <label className="imp-check">
              <input type="checkbox" checked={removerKey} onChange={(e) => setRemoverKey(e.target.checked)} /> Apagar a API key gravada
            </label>
          )}
        </div>
        <div className="form-group">
          <label>URL da câmera (opcional)</label>
          <input value={form.url_camera} onChange={f('url_camera')} placeholder="Vazio = usa a câmera configurada no Klipper" />
          <div className="imp-dica">Só preencha se a câmera não abrir. Nas K1 costuma ser http://IP:8080/?action=stream</div>
        </div>

        {teste && (
          <div className={`imp-teste ${teste.ok === true ? 'ok' : teste.ok === false ? 'falhou' : ''}`}>{teste.texto}</div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={testar} disabled={!form.host}>Testar conexão</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? <span className="spinner" /> : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ModalCamera({ imp, onFechar }) {
  const [cameras, setCameras] = useState(null);
  const [erro, setErro] = useState(null);
  const [atual, setAtual] = useState(0);
  const [falhouStream, setFalhouStream] = useState(false);

  const abrir = useCallback(async () => {
    setErro(null);
    setFalhouStream(false);
    try {
      const { data } = await api.get(`/impressoras/${imp.id}/cameras`);
      setCameras(data);
    } catch (err) {
      setErro(err.response?.data?.erro || 'Não foi possível abrir a câmera');
    }
  }, [imp.id]);

  useEffect(() => { abrir(); }, [abrir]);

  const cam = cameras?.[atual];
  const transformar = cam ? [
    cam.girar ? `rotate(${cam.girar}deg)` : '',
    cam.espelhar_h ? 'scaleX(-1)' : '',
    cam.espelhar_v ? 'scaleY(-1)' : '',
  ].join(' ').trim() : '';

  return (
    <Modal isOpen onClose={onFechar} title={`Câmera — ${imp.nome}`} size="lg">
      {erro ? (
        <div className="empty-state"><p>{erro}</p><button className="btn btn-ghost btn-sm" onClick={abrir}>Tentar de novo</button></div>
      ) : !cameras ? (
        <div className="loading-screen"><span className="spinner" /></div>
      ) : cameras.length === 0 ? (
        <div className="empty-state">
          <p>Nenhuma câmera configurada nesta impressora.</p>
          <p>Configure a webcam no Klipper (Fluidd/Mainsail) ou informe a URL no cadastro.</p>
        </div>
      ) : (
        <>
          {cameras.length > 1 && (
            <div className="flex gap-2 mb-4">
              {cameras.map((c, i) => (
                <button key={c.nome} className={`btn btn-sm ${i === atual ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setAtual(i); setFalhouStream(false); }}>{c.nome}</button>
              ))}
            </div>
          )}
          <div className="imp-camera">
            {falhouStream ? (
              <div className="empty-state">
                <p>O vídeo caiu ou não abriu.</p>
                <button className="btn btn-ghost btn-sm" onClick={abrir}>Reconectar</button>
              </div>
            ) : (
              // O stream é MJPEG: o próprio <img> toca, sem player.
              <img src={cam.stream} alt={`Câmera ${cam.nome}`} style={{ transform: transformar || undefined }} onError={() => setFalhouStream(true)} />
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function ModalControles({ imp, enviando, onComando, onConfirmar, onFechar }) {
  const s = imp.status || {};
  const [eventos, setEventos] = useState(null);
  const [valores, setValores] = useState({});
  const iniciou = useRef(false);

  // Os campos começam com o valor atual da impressora — só na abertura, para a
  // atualização a cada 3 s não apagar o que a pessoa está digitando.
  useEffect(() => {
    if (iniciou.current || !imp.status) return;
    iniciou.current = true;
    setValores({
      temperatura_bico: s.temperaturas?.bico?.alvo ?? 0,
      temperatura_mesa: s.temperaturas?.mesa?.alvo ?? 0,
      velocidade: s.velocidade_pct ?? 100,
      fluxo: s.fluxo_pct ?? 100,
      ventilador: s.ventilador_pct ?? 0,
    });
  }, [imp.status]);

  const carregarEventos = useCallback(async () => {
    try {
      const { data } = await api.get(`/impressoras/${imp.id}/eventos`);
      setEventos(data);
    } catch {
      setEventos([]);
    }
  }, [imp.id]);

  useEffect(() => { carregarEventos(); }, [carregarEventos]);

  const aplicar = async (acao) => {
    if (await onComando(acao, valores[acao])) carregarEventos();
  };

  const online = s.estado && s.estado !== 'offline';
  const linhas = [
    { acao: 'temperatura_bico', rotulo: 'Temperatura do bico', unidade: '°C', atual: fmtTemp(s.temperaturas?.bico), max: 350 },
    { acao: 'temperatura_mesa', rotulo: 'Temperatura da mesa', unidade: '°C', atual: fmtTemp(s.temperaturas?.mesa), max: 120 },
    { acao: 'velocidade', rotulo: 'Velocidade', unidade: '%', atual: s.velocidade_pct != null ? `${s.velocidade_pct}%` : '—', min: 10, max: 300 },
    { acao: 'fluxo', rotulo: 'Fluxo', unidade: '%', atual: s.fluxo_pct != null ? `${s.fluxo_pct}%` : '—', min: 50, max: 150 },
    { acao: 'ventilador', rotulo: 'Ventilador da peça', unidade: '%', atual: s.ventilador_pct != null ? `${s.ventilador_pct}%` : '—', max: 100 },
  ];

  return (
    <Modal isOpen onClose={onFechar} title={`Controles — ${imp.nome}`} size="lg">
      {!online ? (
        <div className="imp-aviso">A impressora está offline — os controles voltam quando ela responder.</div>
      ) : (
        <>
          <div className="imp-controles">
            {linhas.map((l) => (
              <div key={l.acao} className="imp-controle">
                <label>{l.rotulo} <span className="text-muted">agora {l.atual}</span></label>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" min={l.min ?? 0} max={l.max}
                    value={valores[l.acao] ?? ''}
                    onChange={(e) => setValores({ ...valores, [l.acao]: e.target.value })}
                  />
                  <span className="text-muted">{l.unidade}</span>
                  <button className="btn btn-ghost btn-sm" disabled={enviando === `${imp.id}:${l.acao}` || valores[l.acao] === ''} onClick={() => aplicar(l.acao)}>Aplicar</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
            <button className="btn btn-danger" onClick={() => onConfirmar('emergencia')}>Parada de emergência</button>
            <button className="btn btn-ghost" onClick={() => onConfirmar('reiniciar_firmware')}>Reiniciar firmware</button>
          </div>
        </>
      )}

      <div className="divider" />
      <h4 className="imp-subtitulo">Histórico</h4>
      {!eventos ? (
        <div className="loading-screen"><span className="spinner" /></div>
      ) : eventos.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>Nada registrado ainda.</p>
      ) : (
        <div className="imp-eventos">
          {eventos.map((e) => (
            <div key={e.id} className={`imp-evento ev-${e.tipo}`}>
              <span className="imp-evento-quando">{fmtDataHora(e.criado_em)}</span>
              <span className="imp-evento-tipo">{ROTULO_EVENTO[e.tipo] || e.tipo}</span>
              <span className="imp-evento-texto">
                {[e.detalhe, e.arquivo && nomeArquivo(e.arquivo), e.duracao_s ? fmtDuracao(e.duracao_s) : null].filter(Boolean).join(' · ')}
                {e.usuario && <em> — {e.usuario}</em>}
              </span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
