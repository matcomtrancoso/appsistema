// Filtro das pendências — o mesmo objeto alimenta a tela e o relatório, para
// que o que você vê seja exatamente o que sai impresso.
// Sem imports de propósito: roda no Node, no teste, sem banco.

export const ABERTAS    = ['aberta', 'em_andamento', 'atrasada'];
export const RESOLVIDAS = ['resolvida', 'fechada'];

// Rótulo de todo status possível — inclusive os que não viram botão, porque o
// relatório ainda precisa saber escrever o filtro no cabeçalho.
const LABEL_STATUS = {
  abertas: 'Em aberto', resolvidas: 'Resolvidas', todas: 'Todas',
  aberta: 'Aberta', em_andamento: 'Em andamento', atrasada: 'Atrasadas',
};

// Só três botões. "Em aberto" já contém as atrasadas; ter um botão por status
// enchia a faixa e obrigava a rolar de lado para ver o que interessa.
export const OPCOES_STATUS = [
  { valor: 'atrasada',   label: 'Atrasadas' },
  { valor: 'abertas',    label: 'Em aberto' },
  { valor: 'resolvidas', label: 'Resolvidas' },
  { valor: 'todas',      label: 'Todas' },
];

// Ordenação. Sempre da mais antiga para a mais nova; marcar "fornecedor"
// agrupa por empresa e a data continua ordenando dentro de cada grupo.
export function ordenarPendencias(lista, ordem = []) {
  const porFornecedor = ordem.includes('fornecedor');
  return [...(lista || [])].sort((a, b) => {
    if (porFornecedor) {
      const c = String(a.empresa || 'zzz').localeCompare(String(b.empresa || 'zzz'), 'pt-BR');
      if (c !== 0) return c;
    }
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

export const FILTRO_VAZIO = { status: 'abertas', empresa: '', pavimento: '', de: '', ate: '' };

// A data que interessa é a da vistoria, ou seja, quando a pendência foi criada.
const diaDaPendencia = (p) => String(p.created_at || '').slice(0, 10);

export function filtrarPendencias(lista, filtro = {}) {
  const f = { ...FILTRO_VAZIO, ...filtro };
  return (lista || []).filter(p => {
    if (f.status === 'abertas'    && !ABERTAS.includes(p.status)) return false;
    if (f.status === 'resolvidas' && !RESOLVIDAS.includes(p.status)) return false;
    if (!['abertas', 'resolvidas', 'todas'].includes(f.status) && p.status !== f.status) return false;

    if (f.empresa   && (p.empresa   || '') !== f.empresa) return false;
    if (f.pavimento && (p.pavimento || '') !== f.pavimento) return false;

    const dia = diaDaPendencia(p);
    if (f.de  && (!dia || dia < f.de)) return false;
    if (f.ate && (!dia || dia > f.ate)) return false;
    return true;
  });
}

export function contarStatus(lista) {
  const conta = (fn) => (lista || []).filter(fn).length;
  return {
    total:      (lista || []).length,
    pendentes:  conta(p => p.status === 'aberta' || p.status === 'atrasada'),
    andamento:  conta(p => p.status === 'em_andamento'),
    resolvidas: conta(p => RESOLVIDAS.includes(p.status)),
  };
}

// Uma linha por empresa. O relatório antigo repetia a mesma empresa em cards
// separados — aqui ela é agrupada de verdade, e sem responsável vira "Sem
// responsável" em vez de sumir da soma.
export function resumoPorEmpresa(lista) {
  const mapa = new Map();
  for (const p of lista || []) {
    const nome = (p.empresa || '').trim() || 'Sem responsável';
    if (!mapa.has(nome)) mapa.set(nome, { nome, total: 0, pendentes: 0, andamento: 0, resolvidas: 0 });
    const r = mapa.get(nome);
    r.total++;
    if (p.status === 'aberta' || p.status === 'atrasada') r.pendentes++;
    else if (p.status === 'em_andamento') r.andamento++;
    else if (RESOLVIDAS.includes(p.status)) r.resolvidas++;
  }
  return [...mapa.values()].sort((a, b) => b.pendentes - a.pendentes || a.nome.localeCompare(b.nome));
}

// Frase do que está filtrado, para sair impressa no cabeçalho. Sem isso, dois
// relatórios diferentes ficam indistinguíveis depois de impressos.
export function descreverFiltro(filtro = {}, fmtData = (d) => d) {
  const f = { ...FILTRO_VAZIO, ...filtro };
  const partes = [LABEL_STATUS[f.status] || f.status];
  if (f.empresa)   partes.push(f.empresa);
  if (f.pavimento) partes.push(f.pavimento);
  if (f.de && f.ate)  partes.push(`${fmtData(f.de)} a ${fmtData(f.ate)}`);
  else if (f.de)      partes.push(`a partir de ${fmtData(f.de)}`);
  else if (f.ate)     partes.push(`até ${fmtData(f.ate)}`);
  return partes.join(' · ');
}
