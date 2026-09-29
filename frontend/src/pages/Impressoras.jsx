import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
  sem_suporte: { rotulo: 'Em breve', classe: 'imp-ociosa' },
};

/** Estados em que a impressora não responde a comando nem tem câmera para abrir. */
const SEM_CONEXAO = ['offline', 'sem_suporte'];
const MODOS_VELOCIDADE = { 1: 'Silencioso', 2: 'Padrão', 3: 'Esporte', 4: 'Ludicrous' };

const AGUARDANDO = { rotulo: 'Conectando…', classe: 'imp-ociosa' };

const ROTULO_EVENTO = {
  inicio: 'Começou', concluida: 'Concluiu', cancelada: 'Cancelada', pausada: 'Pausou',
  retomada: 'Retomou', erro: 'Erro', offline: 'Saiu da rede', online: 'Voltou à rede', comando: 'Comando',
};

// Os modelos da farm. Escolher o modelo decide como o backend fala com a impressora
// (protocolo) e quais campos o cadastro pede. Modelo novo de uma marca que já existe
// é só uma linha aqui.
const PROTOCOLOS = {
  moonraker: { porta: '7125', suportado: true },
  bambu: { porta: '8883', suportado: true },
  flashforge: { porta: '8898', suportado: true },
};

const MODELOS = [
  { id: 'k1c', marca: 'Creality', modelo: 'K1C', protocolo: 'moonraker' },
  { id: 'k1se', marca: 'Creality', modelo: 'K1 SE', protocolo: 'moonraker', semCamera: true },
  { id: 'k1max', marca: 'Creality', modelo: 'K1 Max', protocolo: 'moonraker' },
  { id: 'n4max', marca: 'Elegoo', modelo: 'Neptune 4 Max', protocolo: 'moonraker', semCamera: true },
  { id: 'ad5x', marca: 'Flashforge', modelo: 'AD5X', protocolo: 'flashforge' },
  { id: 'a1', marca: 'Bambu Lab', modelo: 'A1', protocolo: 'bambu' },
  { id: 'p1s', marca: 'Bambu Lab', modelo: 'P1S', protocolo: 'bambu' },
];
const OUTRA = { id: 'outra', marca: '', modelo: '', protocolo: 'moonraker' };
const MARCAS_CATALOGO = [...new Set(MODELOS.map((m) => m.marca))];

const modeloPorId = (id) => MODELOS.find((m) => m.id === id) || OUTRA;
/** Na edição, reencontra o item do catálogo pelo que está gravado. */
const modeloDoCadastro = (imp) =>
  MODELOS.find((m) => m.marca === imp.marca && m.modelo === imp.modelo && m.protocolo === imp.protocolo) || OUTRA;

const FORM_VAZIO = {
  tipo: 'k1c', nome: '', marca: '', modelo: '', host: '', porta: '7125',
  api_key: '', url_camera: '', serial: '', codigo_acesso: '', ordem: '0',
};

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
  const [vinculandoDe, setVinculandoDe] = useState(null);

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
                  temCodigo: imp.tem_codigo_acesso,
                  protocoloGravado: imp.protocolo,
                  form: {
                    ...FORM_VAZIO,
                    tipo: modeloDoCadastro(imp).id,
                    nome: imp.nome, marca: imp.marca || '', modelo: imp.modelo || '', host: imp.host,
                    porta: String(imp.porta || ''), url_camera: imp.url_camera || '',
                    serial: imp.serial || '', ordem: String(imp.ordem || 0),
                  },
                })}
                onRemover={() => setRemoverId(imp.id)}
                onVincular={() => setVinculandoDe(imp.id)}
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
      {vinculandoDe && lista.find((i) => i.id === vinculandoDe)?.impressao && (
        <ModalVincular
          imp={lista.find((i) => i.id === vinculandoDe)}
          onFechar={() => setVinculandoDe(null)}
          onVinculado={() => { setVinculandoDe(null); carregar(); }}
        />
      )}
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

function CartaoImpressora({ imp, admin, enviando, onComando, onConfirmar, onCamera, onControles, onEditar, onRemover, onVincular }) {
  const navigate = useNavigate();
  const impressao = imp.impressao;
  const s = imp.status;
  const est = (s && ESTADOS[s.estado]) || AGUARDANDO;
  const job = s?.job;
  const ocupado = (acao) => enviando === `${imp.id}:${acao}`;
  const online = s && !SEM_CONEXAO.includes(s.estado);
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

      {/* Na pausa também: a Bambu pausa sozinha por filamento, porta aberta... e diz por quê. */}
      {s?.mensagem && ['erro', 'offline', 'iniciando', 'pausada'].includes(s.estado) && (
        <div className="imp-mensagem">{s.mensagem}</div>
      )}

      {job ? (
        <div className="imp-job">
          <div className="imp-arquivo" title={job.arquivo}>{nomeArquivo(job.arquivo)}</div>
          {job.etapa && <div className="imp-etapa">{job.etapa}</div>}
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
        <div className="imp-job imp-job-vazio">
          {s?.estado === 'sem_suporte'
            ? `O monitor da ${imp.marca || 'marca'} chega na próxima etapa`
            : online ? 'Sem impressão em andamento' : ' '}
        </div>
      )}

      {/* A OS da impressão atual: pelo número no nome do arquivo, ou vinculada à mão. */}
      {job && impressao && (
        <div className="imp-os">
          {impressao.numero_os ? (
            <>
              <button type="button" className="link-button" onClick={() => navigate(`/orcamentos/${impressao.orcamento_id}`)}>
                {impressao.numero_os}
              </button>
              <span className="text-muted">{impressao.vinculo === 'manual' ? 'vinculada à mão' : 'pelo nome do arquivo'}</span>
              <button type="button" className="imp-os-trocar" onClick={onVincular}>trocar</button>
            </>
          ) : (
            <>
              <span className="text-muted">Sem OS</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={onVincular}>Vincular OS</button>
            </>
          )}
        </div>
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
          <button className="btn-icon" onClick={onControles} disabled={s?.estado === 'sem_suporte'} title="Controles e histórico" aria-label="Controles e histórico"><Icon name="settings" /></button>
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

  const tipo = modeloPorId(form.tipo);
  const { protocolo } = tipo;
  const suportado = PROTOCOLOS[protocolo].suportado;
  const pedeSerial = protocolo !== 'moonraker';
  // O código gravado só vale enquanto o protocolo não muda — Access Code da Bambu não
  // serve para a Flashforge.
  const temCodigo = inicial.temCodigo && inicial.protocoloGravado === protocolo;

  /** Trocar o modelo acerta a porta padrão do jeito de conectar dele. */
  const escolherTipo = (e) => {
    const novo = modeloPorId(e.target.value);
    setForm({
      ...form,
      tipo: novo.id,
      porta: PROTOCOLOS[novo.protocolo].porta,
    });
    setTeste(null);
  };

  const corpo = () => ({
    ...form,
    id: inicial.id,
    protocolo,
    marca: tipo.id === 'outra' ? form.marca : tipo.marca,
    modelo: tipo.id === 'outra' ? form.modelo : tipo.modelo,
    remover_api_key: removerKey,
  });

  const testar = async () => {
    setTeste({ ok: null, texto: 'Testando…' });
    try {
      const { data } = await api.post('/impressoras/testar', corpo());
      setTeste({ ok: true, texto: `Conectou: ${data.nome} · ${data.versao} · ${data.estado}` });
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
        <div className="form-group">
          <label>Modelo</label>
          <select value={form.tipo} onChange={escolherTipo}>
            {MARCAS_CATALOGO.map((marca) => (
              <optgroup key={marca} label={marca}>
                {MODELOS.filter((m) => m.marca === marca).map((m) => (
                  <option key={m.id} value={m.id}>{m.marca} {m.modelo}</option>
                ))}
              </optgroup>
            ))}
            <option value="outra">Outra com Klipper (Moonraker)</option>
          </select>
        </div>

        {tipo.id === 'outra' && (
          <div className="form-row">
            <div className="form-group">
              <label>Marca</label>
              <input value={form.marca} onChange={f('marca')} placeholder="Ex: Voron" />
            </div>
            <div className="form-group">
              <label>Modelo</label>
              <input value={form.modelo} onChange={f('modelo')} placeholder="Ex: 2.4" />
            </div>
          </div>
        )}

        {!suportado && (
          <div className="imp-aviso">
            O monitor da {tipo.marca} chega na próxima etapa. Dá para cadastrar agora — ela aparece
            como "Em breve" e passa a ser monitorada sozinha quando o suporte entrar.
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Nome</label>
            <input value={form.nome} onChange={f('nome')} placeholder={`Ex: ${tipo.modelo || 'K1C'}-01`} required />
          </div>
          <div className="form-group">
            <label>Ordem na tela</label>
            <input type="number" value={form.ordem} onChange={f('ordem')} />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>IP na rede interna</label>
            <input value={form.host} onChange={f('host')} placeholder="192.168.3.50" required />
          </div>
          {protocolo === 'moonraker' && (
            <div className="form-group">
              <label>Porta do Moonraker</label>
              <input type="number" value={form.porta} onChange={f('porta')} placeholder="7125" />
            </div>
          )}
        </div>

        {pedeSerial && (
          <div className="form-row">
            <div className="form-group">
              <label>Número de série</label>
              <input value={form.serial} onChange={f('serial')} required />
              <div className="imp-dica">
                Aparece nas informações do aparelho, na tela da impressora
              </div>
            </div>
            <div className="form-group">
              <label>{protocolo === 'bambu' ? 'Access Code' : 'Código do modo LAN'}</label>
              <input
                value={form.codigo_acesso}
                onChange={f('codigo_acesso')}
                required={!temCodigo}
                placeholder={temCodigo ? '•••••• gravado — deixe em branco para manter' : ''}
              />
              <div className="imp-dica">
                {protocolo === 'bambu' ? 'Aparece nas configurações de rede da impressora' : 'Aparece na tela da impressora ao ligar o modo LAN'}
              </div>
            </div>
          </div>
        )}

        {protocolo === 'moonraker' && (
          <>
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
            {!tipo.semCamera && (
              <div className="form-group">
                <label>URL da câmera (opcional)</label>
                <input value={form.url_camera} onChange={f('url_camera')} placeholder="Vazio = usa a câmera configurada no Klipper" />
                <div className="imp-dica">Só preencha se a câmera não abrir. Nas K1 costuma ser http://IP:8080/?action=stream</div>
              </div>
            )}
          </>
        )}

        {teste && (
          <div className={`imp-teste ${teste.ok === true ? 'ok' : teste.ok === false ? 'falhou' : ''}`}>{teste.texto}</div>
        )}

        <div className="form-actions">
          {suportado && (
            <button type="button" className="btn btn-ghost" onClick={testar} disabled={!form.host}>Testar conexão</button>
          )}
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? <span className="spinner" /> : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Escolhe a OS da impressão atual — para arquivo sem o número no nome, ou vínculo errado. */
function ModalVincular({ imp, onFechar, onVinculado }) {
  const [ordens, setOrdens] = useState(null);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    // Só o que ainda pode ir para a impressora: da fila até o acabamento (reimpressão).
    const ABERTAS = ['fila', 'desenho', 'producao', 'acabamento'];
    api.get('/producao')
      .then(({ data }) => setOrdens(data.colunas.filter((c) => ABERTAS.includes(c.codigo)).flatMap((c) =>
        c.ordens.map((o) => ({ ...o, etapa_rotulo: c.rotulo })))))
      .catch(() => setOrdens([]));
  }, []);

  const salvar = async (orcamentoId) => {
    setSalvando(true);
    try {
      const { data } = await api.put(`/impressoras/${imp.id}/vinculo`, { orcamento_id: orcamentoId });
      toast.success(data.mensagem);
      onVinculado();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao vincular');
    } finally {
      setSalvando(false);
    }
  };

  const termo = busca.trim().toLowerCase();
  const filtradas = (ordens || []).filter((o) => !termo
    || o.numero_os?.toLowerCase().includes(termo) || o.cliente_nome?.toLowerCase().includes(termo));

  return (
    <Modal isOpen onClose={onFechar} title={`Vincular OS — ${imp.nome}`}>
      <p className="imp-dica" style={{ marginTop: 0, marginBottom: 12 }}>
        Arquivo: <strong>{nomeArquivo(imp.impressao.arquivo)}</strong>. Salvando o arquivo com o número
        da OS no nome (ex.: OS-202609-0005 - peça.gcode), o vínculo é automático.
      </p>
      <input placeholder="Buscar por número da OS ou cliente..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
      <div className="imp-vincular-lista">
        {!ordens ? <div className="loading-screen"><span className="spinner" /></div>
          : filtradas.length === 0 ? <p className="text-muted" style={{ padding: 12, fontSize: 13 }}>Nenhuma OS aberta encontrada.</p>
            : filtradas.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`imp-vincular-item ${o.id === imp.impressao.orcamento_id ? 'atual' : ''}`}
                disabled={salvando}
                onClick={() => salvar(o.id)}
              >
                <strong>{o.numero_os}</strong>
                <span>{o.cliente_nome}</span>
                <span className="text-muted">{o.etapa_rotulo}</span>
              </button>
            ))}
      </div>
      {imp.impressao.orcamento_id && (
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" disabled={salvando} onClick={() => salvar(null)}>Tirar o vínculo</button>
        </div>
      )}
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
      modo_velocidade: s.modo_velocidade ?? 2,
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

  const online = s.estado && !SEM_CONEXAO.includes(s.estado);
  // Cada adaptador diz o que a impressora aceita; leitura antiga sem a lista = Klipper.
  const tem = (acao) => (s.controles || ['temperatura_bico', 'temperatura_mesa', 'velocidade', 'fluxo', 'ventilador', 'emergencia', 'reiniciar_firmware']).includes(acao);
  const todasLinhas = [
    { acao: 'temperatura_bico', rotulo: 'Temperatura do bico', unidade: '°C', atual: fmtTemp(s.temperaturas?.bico), max: 350 },
    { acao: 'temperatura_mesa', rotulo: 'Temperatura da mesa', unidade: '°C', atual: fmtTemp(s.temperaturas?.mesa), max: 120 },
    { acao: 'velocidade', rotulo: 'Velocidade', unidade: '%', atual: s.velocidade_pct != null ? `${s.velocidade_pct}%` : '—', min: 10, max: 300 },
    { acao: 'fluxo', rotulo: 'Fluxo', unidade: '%', atual: s.fluxo_pct != null ? `${s.fluxo_pct}%` : '—', min: 50, max: 150 },
    { acao: 'ventilador', rotulo: 'Ventilador da peça', unidade: '%', atual: s.ventilador_pct != null ? `${s.ventilador_pct}%` : '—', max: 100 },
  ];
  const linhas = todasLinhas.filter((l) => tem(l.acao));

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
            {tem('modo_velocidade') && (
              <div className="imp-controle">
                <label>Modo de velocidade <span className="text-muted">agora {MODOS_VELOCIDADE[s.modo_velocidade] || '—'}{s.velocidade_pct != null ? ` (${s.velocidade_pct}%)` : ''}</span></label>
                <div className="flex gap-2 items-center">
                  <select value={valores.modo_velocidade ?? 2} onChange={(e) => setValores({ ...valores, modo_velocidade: Number(e.target.value) })}>
                    {Object.entries(MODOS_VELOCIDADE).map(([v, nome]) => <option key={v} value={v}>{nome}</option>)}
                  </select>
                  <button className="btn btn-ghost btn-sm" disabled={enviando === `${imp.id}:modo_velocidade`} onClick={() => aplicar('modo_velocidade')}>Aplicar</button>
                </div>
              </div>
            )}
            {tem('luz') && (
              <div className="imp-controle">
                <label>Luz <span className="text-muted">agora {s.luz === true ? 'acesa' : s.luz === false ? 'apagada' : '—'}</span></label>
                <div className="flex gap-2 items-center">
                  <button className="btn btn-ghost btn-sm" disabled={enviando === `${imp.id}:luz`} onClick={() => onComando('luz', 'on')}>Acender</button>
                  <button className="btn btn-ghost btn-sm" disabled={enviando === `${imp.id}:luz`} onClick={() => onComando('luz', 'off')}>Apagar</button>
                </div>
              </div>
            )}
          </div>
          {(tem('emergencia') || tem('reiniciar_firmware')) && (
            <div className="flex gap-2 mt-4" style={{ flexWrap: 'wrap' }}>
              {tem('emergencia') && <button className="btn btn-danger" onClick={() => onConfirmar('emergencia')}>Parada de emergência</button>}
              {tem('reiniciar_firmware') && <button className="btn btn-ghost" onClick={() => onConfirmar('reiniciar_firmware')}>Reiniciar firmware</button>}
            </div>
          )}
          {imp.protocolo === 'bambu' && (
            <div className="imp-dica mt-4">
              Na Bambu, pausar, cancelar e os ajustes só funcionam com a impressora em LAN Only + Modo
              Desenvolvedor. Sem isso ela recusa o comando — leitura e câmera continuam normais.
            </div>
          )}
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
