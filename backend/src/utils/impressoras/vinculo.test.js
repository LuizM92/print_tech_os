const test = require('node:test');
const assert = require('node:assert');
const { numeroOsDoArquivo, decidir } = require('./vinculo');

test('acha a OS no nome como a farm já salva os arquivos', () => {
  assert.strictEqual(numeroOsDoArquivo('OS-202609-0005 - Deposito Borra de cafe_PETG_1h2m.gcode'), 'OS-202609-0005');
  assert.strictEqual(numeroOsDoArquivo('pecas/OS-202609-0012_suporte.gcode'), 'OS-202609-0012');
});

test('aceita as variações de digitação do número', () => {
  assert.strictEqual(numeroOsDoArquivo('os2026090007 tampa.gcode'), 'OS-202609-0007');
  assert.strictEqual(numeroOsDoArquivo('suporte OS_202609_0003.3mf'), 'OS-202609-0003');
});

test('arquivo sem número, ou com número em outro formato, não vincula', () => {
  assert.strictEqual(numeroOsDoArquivo('suporte_PLA_0.2mm.gcode'), null);
  assert.strictEqual(numeroOsDoArquivo('OS-2026-05 teste.gcode'), null);
  assert.strictEqual(numeroOsDoArquivo('CAOS-202609-0005.gcode'), null); // "os" no meio de palavra
  assert.strictEqual(numeroOsDoArquivo('OS-202609-00051.gcode'), null);
  assert.strictEqual(numeroOsDoArquivo(null), null);
});

test('o número na pasta não conta — só o nome do arquivo', () => {
  assert.strictEqual(numeroOsDoArquivo('OS-202609-0001/placa_2.gcode'), null);
});

const leitura = (estado, arquivo = null, decorrido = null) => ({
  estado, job: arquivo ? { arquivo, decorrido_s: decorrido } : null,
});

test('começou a imprimir: abre a impressão', () => {
  assert.deepStrictEqual(decidir(null, leitura('imprimindo', 'a.gcode', 30)), { acao: 'abrir', arquivo: 'a.gcode', decorrido_s: 30 });
});

test('servidor reiniciado no meio do job: adota a impressão que já estava rodando', () => {
  const r = decidir(null, leitura('pausada', 'a.gcode', 5000));
  assert.strictEqual(r.acao, 'abrir');
  assert.strictEqual(r.decorrido_s, 5000);
});

test('mesma impressão continuando não faz nada', () => {
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('imprimindo', 'a.gcode')).acao, 'nada');
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('pausada', 'a.gcode')).acao, 'nada');
});

test('outro arquivo começando por cima troca a impressão', () => {
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('imprimindo', 'b.gcode')).acao, 'trocar');
});

test('fim do job fecha com o resultado e a duração da impressora', () => {
  assert.deepStrictEqual(decidir({ arquivo: 'a.gcode' }, leitura('concluida', 'a.gcode', 3720)),
    { acao: 'fechar', resultado: 'concluida', decorrido_s: 3720 });
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('cancelada', 'a.gcode')).resultado, 'cancelada');
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('erro', 'a.gcode')).resultado, 'erro');
});

test('offline no meio do job não fecha nada — ela pode voltar imprimindo', () => {
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('offline')).acao, 'nada');
});

test('ficou ociosa sem dizer que terminou: interrompida', () => {
  assert.deepStrictEqual(decidir({ arquivo: 'a.gcode' }, leitura('ociosa')),
    { acao: 'fechar', resultado: 'interrompida', decorrido_s: null });
});

test('concluída com outro arquivo: o fim da aberta se perdeu, fecha como interrompida', () => {
  assert.strictEqual(decidir({ arquivo: 'a.gcode' }, leitura('concluida', 'b.gcode')).resultado, 'interrompida');
});

test('concluída que já estava concluída (sem impressão aberta) não faz nada', () => {
  assert.strictEqual(decidir(null, leitura('concluida', 'a.gcode')).acao, 'nada');
});
