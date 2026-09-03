// Filtro de período — compartilhado pelo dashboard e pelo quadro de produção.
// Cada tela decide sobre qual data o intervalo incide; a lista de opções é a mesma.

/** Datas em AAAA-MM-DD, no fuso local — `toISOString` devolveria em UTC e erraria o dia. */
export const iso = (d) => {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
};

export const hoje = () => new Date();
export const menosDias = (n) => { const d = hoje(); d.setDate(d.getDate() - n); return d; };

export const PERIODOS = [
  { valor: 'tudo', rotulo: 'Todo o período', intervalo: () => ({ de: '', ate: '' }) },
  { valor: 'hoje', rotulo: 'Hoje', intervalo: () => ({ de: iso(hoje()), ate: iso(hoje()) }) },
  { valor: '7d', rotulo: 'Últimos 7 dias', intervalo: () => ({ de: iso(menosDias(6)), ate: iso(hoje()) }) },
  { valor: '30d', rotulo: 'Últimos 30 dias', intervalo: () => ({ de: iso(menosDias(29)), ate: iso(hoje()) }) },
  {
    valor: 'mes',
    rotulo: 'Mês atual',
    intervalo: () => {
      const d = hoje();
      return { de: iso(new Date(d.getFullYear(), d.getMonth(), 1)), ate: iso(d) };
    },
  },
  {
    valor: 'ano',
    rotulo: 'Ano atual',
    intervalo: () => {
      const d = hoje();
      return { de: iso(new Date(d.getFullYear(), 0, 1)), ate: iso(d) };
    },
  },
  { valor: 'personalizado', rotulo: 'Escolher datas...', intervalo: null },
];

/** Datas do período escolhido; `{}` no personalizado, que não mexe no que já está lá. */
export const intervaloDoPeriodo = (valor) => {
  const escolhido = PERIODOS.find((p) => p.valor === valor);
  return escolhido?.intervalo ? escolhido.intervalo() : {};
};
