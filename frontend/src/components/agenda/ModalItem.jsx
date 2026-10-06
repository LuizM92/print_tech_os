import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api from '../../services/api';
import Modal from '../shared/Modal';
import Icon from '../shared/Icon';
import {
  CORES, REPETICOES, MAX_LEMBRETES, opcoesDeLembrete, lembretesPadrao, rotuloRepeticao,
  paraMinutos, deMinutos,
} from '../../utils/agenda';

const doItem = (item) => ({
  tipo: item.tipo,
  titulo: item.titulo,
  descricao: item.descricao || '',
  lugar: item.lugar || '',
  cor: item.cor,
  data_inicio: item.data,
  hora_inicio: item.hora_inicio || '09:00',
  data_fim: item.data_fim,
  hora_fim: item.hora_fim || '10:00',
  dia_inteiro: item.dia_inteiro,
  repete: item.repete,
  repete_cada: item.repete_cada || 1,
  repete_ate: item.repete_ate || '',
  privado: item.privado,
  quem: item.para_todos ? 'todos' : (item.responsavel_id ? String(item.responsavel_id) : ''),
  lembretes: [...item.lembretes],
});

/** Item novo a partir do clique: a data e, se veio de um horário da grade, a hora. */
const doPadrao = ({ data, hora, diaInteiro = false, tipo = 'evento' }) => {
  const inicio = hora || '09:00';
  const fim = deMinutos(paraMinutos(data, inicio) + 60);
  return {
    tipo,
    titulo: '',
    descricao: '',
    lugar: '',
    cor: 'roxo',
    data_inicio: data,
    hora_inicio: inicio,
    data_fim: fim.data,
    hora_fim: fim.hora,
    dia_inteiro: diaInteiro,
    repete: 'nao',
    repete_cada: 1,
    repete_ate: '',
    privado: false,
    quem: '',
    lembretes: lembretesPadrao(tipo, diaInteiro),
  };
};

/**
 * Criar ou editar um evento ou tarefa. Na edição `item` é a ocorrência clicada; como a
 * mudança vale para a série toda, o servidor recebe também a data dela (`ocorrencia`) e
 * desloca o início da série pelo mesmo tanto que a data foi movida.
 */
export default function ModalItem({ item, padrao, responsaveis, onClose, onSalvo }) {
  const editando = !!item;
  const [form, setForm] = useState(() => (editando ? doItem(item) : doPadrao(padrao)));
  const [lembretesMexidos, setLembretesMexidos] = useState(editando);
  const [salvando, setSalvando] = useState(false);

  const tarefa = form.tipo === 'tarefa';
  const repetindo = !tarefa && form.repete !== 'nao';
  const unidade = REPETICOES.find((r) => r.valor === form.repete)?.unidade;

  const campo = (nome) => (e) => {
    const valor = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [nome]: valor }));
  };

  /** Mexer no início leva o fim junto, mantendo a duração — como no Google Agenda. */
  const mudarInicio = (nome) => (e) => {
    const valor = e.target.value;
    if (!valor) { setForm((f) => ({ ...f, [nome]: valor })); return; }
    setForm((f) => {
      const novo = { ...f, [nome]: valor };
      if (f.tipo === 'tarefa') return novo;
      const h = (data, hora) => paraMinutos(data, f.dia_inteiro ? '00:00' : hora);
      const duracao = Math.max(h(f.data_fim, f.hora_fim) - h(f.data_inicio, f.hora_inicio), 0);
      const fim = deMinutos(paraMinutos(novo.data_inicio, f.dia_inteiro ? '00:00' : novo.hora_inicio) + duracao);
      return { ...novo, data_fim: fim.data, hora_fim: f.dia_inteiro ? f.hora_fim : fim.hora };
    });
  };

  const mudarTipo = (tipo) => setForm((f) => ({
    ...f,
    tipo,
    lembretes: lembretesMexidos ? f.lembretes : lembretesPadrao(tipo, f.dia_inteiro),
  }));

  // Dia inteiro e com horário têm listas de lembrete diferentes: o que não existe no novo
  // modo sai, e se o usuário nunca mexeu nos lembretes, volta o padrão do modo.
  const mudarDiaInteiro = (e) => {
    const diaInteiro = e.target.checked;
    setForm((f) => {
      const permitidos = opcoesDeLembrete(diaInteiro).map((o) => o.min);
      let lembretes = lembretesMexidos ? f.lembretes.filter((m) => permitidos.includes(m)) : lembretesPadrao(f.tipo, diaInteiro);
      if (lembretes.length === 0 && !lembretesMexidos) lembretes = lembretesPadrao(f.tipo, diaInteiro);
      return { ...f, dia_inteiro: diaInteiro, lembretes };
    });
  };

  const opcoes = opcoesDeLembrete(form.dia_inteiro);
  const trocarLembrete = (indice, min) => {
    setLembretesMexidos(true);
    setForm((f) => ({ ...f, lembretes: f.lembretes.map((m, i) => (i === indice ? min : m)) }));
  };
  const removerLembrete = (indice) => {
    setLembretesMexidos(true);
    setForm((f) => ({ ...f, lembretes: f.lembretes.filter((_, i) => i !== indice) }));
  };
  const adicionarLembrete = () => {
    const livre = opcoes.find((o) => !form.lembretes.includes(o.min));
    if (!livre) return;
    setLembretesMexidos(true);
    setForm((f) => ({ ...f, lembretes: [...f.lembretes, livre.min] }));
  };

  const enviar = async (e) => {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    const corpo = {
      tipo: form.tipo,
      titulo: form.titulo,
      descricao: form.descricao,
      lugar: form.lugar,
      cor: form.cor,
      data_inicio: form.data_inicio,
      data_fim: tarefa ? form.data_inicio : form.data_fim,
      dia_inteiro: form.dia_inteiro,
      hora_inicio: form.dia_inteiro ? null : form.hora_inicio,
      hora_fim: form.dia_inteiro || tarefa ? null : form.hora_fim,
      repete: tarefa ? 'nao' : form.repete,
      repete_cada: form.repete_cada,
      repete_ate: repetindo && form.repete_ate ? form.repete_ate : null,
      privado: form.privado,
      para_todos: !form.privado && form.quem === 'todos',
      responsavel_id: !form.privado && form.quem && form.quem !== 'todos' ? Number(form.quem) : null,
      lembretes: form.lembretes,
      ocorrencia: editando ? item.data : undefined,
    };
    try {
      const { data } = editando ? await api.put(`/agenda/${item.id}`, corpo) : await api.post('/agenda', corpo);
      toast.success(data.mensagem);
      onSalvo();
    } catch (err) {
      toast.error(err.response?.data?.erro || 'Erro ao salvar');
      setSalvando(false);
    }
  };

  let titulo = tarefa ? 'Nova tarefa' : 'Novo evento';
  if (editando) titulo = tarefa ? 'Editar tarefa' : 'Editar evento';

  return (
    <Modal isOpen onClose={onClose} title={titulo} size="lg">
      <form onSubmit={enviar}>
        <div className="ag-segmentos" role="tablist" aria-label="Tipo">
          {[['evento', 'Evento'], ['tarefa', 'Tarefa']].map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={form.tipo === valor}
              className={form.tipo === valor ? 'ativo' : ''}
              onClick={() => mudarTipo(valor)}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label htmlFor="ag-titulo">Título</label>
          <input
            id="ag-titulo"
            value={form.titulo}
            onChange={campo('titulo')}
            maxLength={150}
            placeholder={tarefa ? 'Ex.: ligar para o fornecedor de filamento' : 'Ex.: manutenção das impressoras'}
            autoFocus
            required
          />
        </div>

        <div className="ag-quando">
          <div className="form-group">
            <label>{tarefa ? 'Data' : 'Início'}</label>
            <input type="date" value={form.data_inicio} onChange={mudarInicio('data_inicio')} required />
          </div>
          {!form.dia_inteiro && (
            <div className="form-group">
              <label>{tarefa ? 'Hora' : 'Das'}</label>
              <input type="time" value={form.hora_inicio} onChange={mudarInicio('hora_inicio')} required />
            </div>
          )}
          {!tarefa && (
            <div className="form-group">
              <label>Fim</label>
              <input type="date" value={form.data_fim} min={form.data_inicio} onChange={campo('data_fim')} required />
            </div>
          )}
          {!tarefa && !form.dia_inteiro && (
            <div className="form-group">
              <label>Até</label>
              <input type="time" value={form.hora_fim} onChange={campo('hora_fim')} required />
            </div>
          )}
        </div>

        <label className="ag-opcao">
          <input type="checkbox" checked={form.dia_inteiro} onChange={mudarDiaInteiro} />
          {tarefa ? 'Sem horário (a tarefa vale o dia todo)' : 'Dia inteiro'}
        </label>

        {!tarefa && (
          <div className="form-row" style={{ marginBottom: 14 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Repetição</label>
              <select value={form.repete} onChange={campo('repete')}>
                {REPETICOES.map((r) => <option key={r.valor} value={r.valor}>{r.rotulo}</option>)}
              </select>
            </div>
            {repetindo && (
              <>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>A cada ({unidade[1]})</label>
                  <input type="number" min="1" max="99" value={form.repete_cada} onChange={campo('repete_cada')} required />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Repetir até (opcional)</label>
                  <input type="date" value={form.repete_ate} min={form.data_inicio} onChange={campo('repete_ate')} />
                </div>
              </>
            )}
          </div>
        )}
        {repetindo && (
          <div className="ag-dica">
            {rotuloRepeticao({ ...form, repete_cada: Number(form.repete_cada) || 1, repete_ate: form.repete_ate || null })}
            {editando && item.repete !== 'nao' && ' — a edição vale para toda a série'}
          </div>
        )}

        <div className="form-group">
          <label>Lembretes</label>
          <div className="ag-lembretes">
            {form.lembretes.map((min, i) => (
              <div key={min} className="ag-lembrete">
                <select value={min} onChange={(e) => trocarLembrete(i, Number(e.target.value))}>
                  {opcoes
                    .filter((o) => o.min === min || !form.lembretes.includes(o.min))
                    .map((o) => <option key={o.min} value={o.min}>{o.rotulo}</option>)}
                </select>
                <button type="button" className="btn-icon" onClick={() => removerLembrete(i)} aria-label="Remover lembrete">
                  <Icon name="fechar" />
                </button>
              </div>
            ))}
            {form.lembretes.length < Math.min(MAX_LEMBRETES, opcoes.length) && (
              <button type="button" className="link-button" onClick={adicionarLembrete}>+ Adicionar lembrete</button>
            )}
            {form.lembretes.length === 0 && <span className="ag-dica">Sem lembrete: o item aparece só no calendário.</span>}
          </div>
        </div>

        {!tarefa && (
          <div className="form-group">
            <label htmlFor="ag-lugar">Local (opcional)</label>
            <input id="ag-lugar" value={form.lugar} onChange={campo('lugar')} maxLength={150} placeholder="Ex.: galpão, cliente, videochamada" />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="ag-descricao">Descrição (opcional)</label>
          <textarea id="ag-descricao" value={form.descricao} onChange={campo('descricao')} maxLength={1000} style={{ minHeight: 70 }} />
        </div>

        <div className="form-group">
          <label>Cor</label>
          <div className="ag-cores">
            {CORES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`ag-cor ${form.cor === c.id ? 'ativa' : ''}`}
                style={{ background: c.hex }}
                aria-label={c.rotulo}
                aria-pressed={form.cor === c.id}
                title={c.rotulo}
                onClick={() => setForm((f) => ({ ...f, cor: c.id }))}
              />
            ))}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Quem recebe os lembretes</label>
            <select value={form.privado ? '' : form.quem} onChange={campo('quem')} disabled={form.privado}>
              <option value="">Quem criou</option>
              <option value="todos">Todos</option>
              {responsaveis.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Quem vê</label>
            <label className="ag-opcao" style={{ margin: '10px 0 0' }}>
              <input type="checkbox" checked={form.privado} onChange={campo('privado')} />
              Privado — só eu vejo
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
