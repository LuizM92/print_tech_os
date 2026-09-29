const { Readable } = require('stream');
const jwt = require('jsonwebtoken');
const db = require('../utils/db');
const monitor = require('../utils/impressoras/monitor');
const moonraker = require('../utils/impressoras/moonraker');

// Bambu e Flashforge entram aqui quando os adaptadores existirem.
const PROTOCOLOS = ['moonraker'];
const PORTA_PADRAO = { moonraker: moonraker.PORTA_PADRAO };

const ROTULO_ACAO = {
  pausar: 'Pausou',
  retomar: 'Retomou',
  cancelar: 'Cancelou',
  emergencia: 'Parada de emergência',
  reiniciar_firmware: 'Reiniciou o firmware',
  temperatura_bico: 'Bico →',
  temperatura_mesa: 'Mesa →',
  velocidade: 'Velocidade →',
  fluxo: 'Fluxo →',
  ventilador: 'Ventilador →',
};

const UNIDADE_ACAO = {
  temperatura_bico: ' °C', temperatura_mesa: ' °C', velocidade: '%', fluxo: '%', ventilador: '%',
};

/** O cadastro como a tela vê: sem as credenciais, só se elas existem. */
const publico = (imp) => ({
  id: imp.id,
  nome: imp.nome,
  marca: imp.marca,
  modelo: imp.modelo,
  protocolo: imp.protocolo,
  host: imp.host,
  porta: imp.porta,
  url_camera: imp.url_camera,
  ordem: imp.ordem,
  tem_api_key: !!imp.api_key,
});

const listar = async (req, res) => {
  res.json(monitor.lista().map((imp) => ({ ...publico(imp), status: monitor.estadoDe(imp.id) })));
};

const eventos = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.id, e.tipo, e.arquivo, e.detalhe, e.duracao_s, e.criado_em, u.nome AS usuario
         FROM impressora_eventos e
         LEFT JOIN usuarios u ON u.id = e.usuario_id
        WHERE e.impressora_id = ?
        ORDER BY e.criado_em DESC, e.id DESC
        LIMIT 50`,
      [req.params.id],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

function lerCadastro(body) {
  const protocolo = body.protocolo || 'moonraker';
  const host = String(body.host || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  if (!body.nome?.trim()) return { erro: 'Informe o nome da impressora' };
  if (!host) return { erro: 'Informe o IP da impressora' };
  if (!PROTOCOLOS.includes(protocolo)) return { erro: 'Protocolo ainda não suportado' };
  const porta = body.porta ? parseInt(body.porta, 10) : PORTA_PADRAO[protocolo];
  if (!Number.isInteger(porta) || porta < 1 || porta > 65535) return { erro: 'Porta inválida' };
  return {
    dados: {
      nome: body.nome.trim(),
      marca: body.marca?.trim() || null,
      modelo: body.modelo?.trim() || null,
      protocolo,
      host,
      porta,
      url_camera: body.url_camera?.trim() || null,
      ordem: parseInt(body.ordem, 10) || 0,
    },
  };
}

const criar = async (req, res) => {
  const { erro, dados } = lerCadastro(req.body);
  if (erro) return res.status(400).json({ erro });
  try {
    const [r] = await db.query('INSERT INTO impressoras SET ?', [{ ...dados, api_key: req.body.api_key?.trim() || null }]);
    await monitor.recarregar();
    monitor.lerAgora(r.insertId);
    res.status(201).json({ id: r.insertId, mensagem: 'Impressora cadastrada' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const atualizar = async (req, res) => {
  const { erro, dados } = lerCadastro(req.body);
  if (erro) return res.status(400).json({ erro });
  // API key em branco na edição = manter a que já está gravada (a tela nunca a recebe).
  // Para apagar de fato, a tela manda `remover_api_key`.
  if (req.body.remover_api_key) dados.api_key = null;
  else if (req.body.api_key?.trim()) dados.api_key = req.body.api_key.trim();
  try {
    const [r] = await db.query('UPDATE impressoras SET ? WHERE id = ? AND ativo = 1', [dados, req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ erro: 'Impressora não encontrada' });
    await monitor.recarregar();
    monitor.lerAgora(req.params.id);
    res.json({ mensagem: 'Impressora atualizada' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

const excluir = async (req, res) => {
  try {
    // Desativa em vez de apagar: o histórico de eventos continua valendo.
    await db.query('UPDATE impressoras SET ativo = 0 WHERE id = ?', [req.params.id]);
    await monitor.recarregar();
    res.json({ mensagem: 'Impressora removida' });
  } catch (err) {
    res.status(500).json({ erro: 'Erro interno do servidor' });
  }
};

/** "Testar conexão" do cadastro: fala com a impressora sem gravar nada. */
const testar = async (req, res) => {
  const { erro, dados } = lerCadastro({ nome: 'teste', ...req.body });
  if (erro) return res.status(400).json({ erro });
  let apiKey = req.body.api_key?.trim() || null;
  if (!apiKey && req.body.id && !req.body.remover_api_key) apiKey = monitor.buscar(req.body.id)?.api_key || null;
  try {
    const info = await moonraker.identificar({ ...dados, api_key: apiKey });
    res.json(info);
  } catch (err) {
    res.status(502).json({ erro: monitor.motivoFalha(err) });
  }
};

const comando = async (req, res) => {
  const imp = monitor.buscar(req.params.id);
  if (!imp) return res.status(404).json({ erro: 'Impressora não encontrada' });
  const adaptador = monitor.adaptadorDe(imp);
  const { acao, valor } = req.body;
  if (!adaptador?.ACOES.includes(acao)) return res.status(400).json({ erro: 'Comando desconhecido' });

  try {
    await adaptador.comandar(imp, acao, valor);
  } catch (err) {
    if (err.validacao) return res.status(400).json({ erro: err.message });
    return res.status(502).json({ erro: `A impressora recusou: ${monitor.motivoFalha(err)}` });
  }

  const status = monitor.estadoDe(imp.id);
  const detalhe = UNIDADE_ACAO[acao] ? `${ROTULO_ACAO[acao]} ${valor}${UNIDADE_ACAO[acao]}` : ROTULO_ACAO[acao];
  await monitor.registrarEvento(imp.id, {
    tipo: 'comando', arquivo: status?.job?.arquivo || null, detalhe,
  }, req.usuario.id);
  await monitor.lerAgora(imp.id);
  res.json({ mensagem: detalhe, status: monitor.estadoDe(imp.id) });
};

// ─── Câmera ──────────────────────────────────────────────────────────────────
// O <img> do navegador não manda o header Authorization, então o vídeo não passa pelo
// `autenticar`. A tela pede antes um token curto, só para esta câmera, e o põe na URL.
// Ele vale 2 minutos para abrir o vídeo — o vídeo aberto continua até fechar o modal.

const CAMERA_TTL = '2m';

const cameras = async (req, res) => {
  const imp = monitor.buscar(req.params.id);
  if (!imp) return res.status(404).json({ erro: 'Impressora não encontrada' });
  try {
    const lista = await monitor.adaptadorDe(imp).cameras(imp);
    const token = jwt.sign({ camera: imp.id }, process.env.JWT_SECRET, { expiresIn: CAMERA_TTL });
    // O endereço interno da câmera não sai daqui: a tela só recebe o caminho do proxy.
    res.json(lista.map((c, i) => ({
      nome: c.nome,
      girar: c.girar,
      espelhar_h: c.espelhar_h,
      espelhar_v: c.espelhar_v,
      stream: `/api/impressoras/${imp.id}/camera/${i}/stream?t=${token}`,
      snapshot: c.snapshot ? `/api/impressoras/${imp.id}/camera/${i}/snapshot?t=${token}` : null,
    })));
  } catch (err) {
    res.status(502).json({ erro: monitor.motivoFalha(err) });
  }
};

const cameraProxy = (tipo) => async (req, res) => {
  try {
    const dados = jwt.verify(req.query.t, process.env.JWT_SECRET);
    if (dados.camera !== Number(req.params.id)) throw new Error('token de outra câmera');
  } catch {
    return res.status(401).json({ erro: 'Link da câmera expirado — abra de novo' });
  }

  const imp = monitor.buscar(req.params.id);
  if (!imp) return res.status(404).end();
  let camera;
  try {
    camera = (await monitor.adaptadorDe(imp).cameras(imp))[Number(req.params.idx)];
  } catch {
    return res.status(502).end();
  }
  const url = camera?.[tipo];
  if (!url) return res.status(404).end();

  // Fechou o modal → derruba a conexão com a câmera também, senão o stream fica
  // puxando banda da impressora sem ninguém olhar.
  const controle = new AbortController();
  res.on('close', () => controle.abort());

  try {
    const origem = await fetch(url, { signal: controle.signal });
    if (!origem.ok || !origem.body) return res.status(502).end();
    res.status(200);
    res.set('Content-Type', origem.headers.get('content-type') || 'application/octet-stream');
    res.set('Cache-Control', 'no-store');
    // Sem isso, proxies no caminho (o túnel) seguram o MJPEG em buffer e o vídeo trava.
    res.set('X-Accel-Buffering', 'no');
    Readable.fromWeb(origem.body).on('error', () => res.end()).pipe(res);
  } catch {
    if (!res.headersSent) res.status(502).end();
  }
};

module.exports = {
  listar,
  eventos,
  criar,
  atualizar,
  excluir,
  testar,
  comando,
  cameras,
  cameraStream: cameraProxy('stream'),
  cameraSnapshot: cameraProxy('snapshot'),
};
