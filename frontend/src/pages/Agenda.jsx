import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import usePersistido from '../hooks/usePersistido';
import Icon from '../components/shared/Icon';
import VisaoMes from '../components/agenda/VisaoMes';
import VisaoGrade from '../components/agenda/VisaoGrade';
import VisaoLista from '../components/agenda/VisaoLista';
import ModalItem from '../components/agenda/ModalItem';
import ModalDetalheItem from '../components/agenda/ModalDetalheItem';
import ModalExcluirItem from '../components/agenda/ModalExcluirItem';
import {
  VISOES, CAMADAS, intervaloDaVisao, intervalo, andar, tituloDoPeriodo, camadaComoItem, inicioDaSemana,
  minParaHora, horaParaMin, somarDias, hojeBR, horaBR,
} from '../utils/agenda';

// O que o calendário mostra. Cada chave liga ou desliga um tipo de item.
const FILTROS = [
  { id: 'eventos', rotulo: 'Eventos', cor: '#6c63ff' },
  { id: 'tarefas', rotulo: 'Tarefas', cor: '#f5a623' },
  { id: 'os', rotulo: CAMADAS.os.rotulo, cor: CAMADAS.os.cor },
  { id: 'receber', rotulo: CAMADAS.receber.rotulo, cor: CAMADAS.receber.cor },
  { id: 'pagar', rotulo: CAMADAS.pagar.rotulo, cor: CAMADAS.pagar.cor, somenteAdmin: true },
];
const FILTROS_PADRAO = { eventos: true, tarefas: true, os: true, receber: true, pagar: true };

const ehDiaISO = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Hoje às 09:00 — ou, se agora já passou das 09:00, a próxima hora cheia. */
const horaPadraoDeHoje = (agora) => {
  const proxima = Math.ceil((horaParaMin(agora) + 1) / 60) * 60;
  return minParaHora(Math.min(Math.max(proxima, 9 * 60), 23 * 60));
};

export default function Agenda() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { isAdmin } = useAuth();
  const admin = isAdmin();

  const diaDaUrl = params.get('dia');
  const [hoje, setHoje] = useState(hojeBR());
  const [agora, setAgora] = useState(horaBR());
  const [foco, setFoco] = useState(ehDiaISO(diaDaUrl) ? diaDaUrl : hojeBR());

  // No celular a grade do mês fica apertada: a primeira visão é a lista.
  const [visaoSalva, setVisao] = usePersistido('pt.agenda.visao', window.innerWidth < 768 ? 'lista' : 'mes');
  const visao = VISOES.some((v) => v.id === visaoSalva) ? visaoSalva : 'mes';
  const [filtros, setFiltros] = usePersistido('pt.agenda.filtros', FILTROS_PADRAO);

  const [dados, setDados] = useState({ itens: [], camadas: [] });
  const [carregando, setCarregando] = useState(true);
  const [responsaveis, setResponsaveis] = useState([]);

  const [detalhe, setDetalhe] = useState(null);
  const [formulario, setFormulario] = useState(null); // { item } ao editar, { padrao } ao criar
  const [excluindo, setExcluindo] = useState(null);

  const { de, ate } = useMemo(() => intervaloDaVisao(visao, foco), [visao, foco]);

  // Chegar de uma notificação (/agenda?dia=…) leva o calendário para aquele dia.
  useEffect(() => { if (ehDiaISO(diaDaUrl)) setFoco(diaDaUrl); }, [diaDaUrl]);

  // A linha do "agora" anda sozinha.
  useEffect(() => {
    const timer = setInterval(() => {
      setAgora(horaBR());
      setHoje(hojeBR());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Respostas fora de ordem (clicar rápido em ‹ ›) não podem sobrescrever a mais nova.
  const pedido = useRef(0);
  const carregar = useCallback(async () => {
    const meu = pedido.current + 1;
    pedido.current = meu;
    try {
      const { data } = await api.get('/agenda', { params: { de, ate } });
      if (meu !== pedido.current) return;
      setDados({ itens: data.itens, camadas: data.camadas });
      setHoje(data.hoje);
    } catch {
      if (meu === pedido.current) toast.error('Erro ao carregar a agenda');
    } finally {
      if (meu === pedido.current) setCarregando(false);
    }
  }, [de, ate]);

  useEffect(() => { carregar(); }, [carregar]);

  // Outra pessoa pode ter criado algo enquanto a aba estava em segundo plano.
  useEffect(() => {
    const aoVoltar = () => { if (!document.hidden) carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar]);

  useEffect(() => {
    api.get('/agenda/responsaveis').then(({ data }) => setResponsaveis(data)).catch(() => {});
  }, []);

  const itens = useMemo(() => [
    ...dados.itens.filter((it) => (it.tipo === 'tarefa' ? filtros.tarefas : filtros.eventos) !== false),
    ...dados.camadas.filter((c) => filtros[c.camada] !== false).map(camadaComoItem),
  ], [dados, filtros]);

  const diasDaGrade = useMemo(() => (
    visao === 'dia' ? [foco] : intervalo(inicioDaSemana(foco), somarDias(inicioDaSemana(foco), 6))
  ), [visao, foco]);

  // ─── Ações ────────────────────────────────────────────────────────────────

  const verDia = (dia) => { setFoco(dia); setVisao('dia'); };

  const novo = (dia = foco, hora = null, diaInteiro = false) => {
    // Do botão e do mês não há horário clicado: sugere um que faça sentido para o dia.
    const horaFinal = diaInteiro ? null : (hora || (dia === hoje ? horaPadraoDeHoje(agora) : '09:00'));
    setFormulario({ padrao: { data: dia, hora: horaFinal, diaInteiro } });
  };

  const abrir = (item) => setDetalhe(item);

  const editar = (item) => { setDetalhe(null); setFormulario({ item }); };

  const salvou = () => { setFormulario(null); setDetalhe(null); carregar(); };

  const alternarTarefa = async (item) => {
    const concluida = !item.concluida;
    // Marca na tela na hora; se o servidor recusar, a recarga desfaz.
    setDados((d) => ({ ...d, itens: d.itens.map((it) => (it.id === item.id ? { ...it, concluida } : it)) }));
    setDetalhe((d) => (d && d.id === item.id ? { ...d, concluida } : d));
    try {
      await api.post(`/agenda/${item.id}/concluir`, { concluida });
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao atualizar a tarefa');
      carregar();
    }
  };

  const excluir = async (escopo) => {
    const item = excluindo;
    try {
      const { data } = await api.delete(`/agenda/${item.id}`, { params: { escopo, data: item.data } });
      toast.success(data.mensagem);
      setExcluindo(null);
      setDetalhe(null);
      carregar();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao excluir');
    }
  };

  const abrirOrigem = (item) => { setDetalhe(null); navigate(item.url); };

  const alternarFiltro = (id) => setFiltros((f) => ({ ...FILTROS_PADRAO, ...f, [id]: f[id] === false }));

  const anoAtual = parseInt(hoje.slice(0, 4), 10);
  const filtrosVisiveis = FILTROS.filter((f) => !f.somenteAdmin || admin);

  return (
    <>
      <div className="page-header">
        <h2>Agenda</h2>
        <p>Eventos, tarefas e lembretes — com as entregas das OS e os vencimentos no mesmo calendário</p>
      </div>

      <div className="page-content">
        <div className="card ag-card">
          <div className="ag-barra">
            <div className="ag-nav">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFoco(hoje)}>Hoje</button>
              <button type="button" className="btn-icon" onClick={() => setFoco(andar(visao, foco, -1))} aria-label="Anterior">
                <Icon name="recolher" />
              </button>
              <button type="button" className="btn-icon" onClick={() => setFoco(andar(visao, foco, 1))} aria-label="Próximo">
                <Icon name="avancar" />
              </button>
              <h3 className="ag-titulo">{tituloDoPeriodo(visao, foco)}</h3>
            </div>
            <div className="ag-acoes">
              <div className="ag-segmentos" role="tablist" aria-label="Visão do calendário">
                {VISOES.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={visao === v.id}
                    className={visao === v.id ? 'ativo' : ''}
                    onClick={() => setVisao(v.id)}
                  >
                    {v.rotulo}
                  </button>
                ))}
              </div>
              <button type="button" className="btn btn-primary" onClick={() => novo(visao === 'dia' ? foco : (de <= hoje && hoje <= ate ? hoje : foco))}>
                <Icon name="mais" />
                Criar
              </button>
            </div>
          </div>

          <div className="ag-filtros" role="group" aria-label="O que mostrar">
            {filtrosVisiveis.map((f) => {
              const ligado = filtros[f.id] !== false;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`ag-filtro ${ligado ? 'ligado' : ''}`}
                  style={{ '--ag-cor': f.cor }}
                  aria-pressed={ligado}
                  onClick={() => alternarFiltro(f.id)}
                >
                  <span className="ag-ponto" />
                  {f.rotulo}
                </button>
              );
            })}
          </div>

          {carregando ? (
            <div className="ag-carregando"><span className="spinner" /></div>
          ) : (
            <>
              {visao === 'mes' && (
                <VisaoMes
                  foco={foco} hoje={hoje} itens={itens}
                  onNovo={novo} onAbrir={abrir} onVerDia={verDia} onAlternarTarefa={alternarTarefa}
                />
              )}
              {(visao === 'semana' || visao === 'dia') && (
                <VisaoGrade
                  dias={diasDaGrade} hoje={hoje} agora={agora} itens={itens}
                  onNovo={novo} onAbrir={abrir} onVerDia={verDia} onAlternarTarefa={alternarTarefa}
                />
              )}
              {visao === 'lista' && (
                <VisaoLista
                  de={de} ate={ate} hoje={hoje} itens={itens}
                  onNovo={novo} onAbrir={abrir} onAlternarTarefa={alternarTarefa}
                />
              )}
            </>
          )}
        </div>
      </div>

      {formulario && (
        <ModalItem
          item={formulario.item}
          padrao={formulario.padrao}
          responsaveis={responsaveis}
          onClose={() => setFormulario(null)}
          onSalvo={salvou}
        />
      )}
      {/* Com a confirmação de exclusão aberta, o detalhe sai de cena (e volta se ela for cancelada). */}
      {detalhe && !excluindo && (
        <ModalDetalheItem
          item={detalhe}
          anoAtual={anoAtual}
          onClose={() => setDetalhe(null)}
          onEditar={editar}
          onExcluir={setExcluindo}
          onAlternarTarefa={alternarTarefa}
          onAbrirOrigem={abrirOrigem}
        />
      )}
      {excluindo && (
        <ModalExcluirItem item={excluindo} onClose={() => setExcluindo(null)} onConfirmar={excluir} />
      )}
    </>
  );
}
