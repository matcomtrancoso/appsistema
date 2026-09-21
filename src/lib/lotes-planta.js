// Lote da marcação: a viagem de concreto (BT1111 · NF 4521), a remessa de aço,
// o lote de blocos.
//
// Por que é atributo da marcação e NÃO uma etapa: criar "Concreto BT1111" como
// etapa incharia a lista a cada concretagem e quebraria a meta — os m³ de
// "Concretagem" ficariam espalhados em dez etapas, cada uma com progresso
// próprio. Como atributo, a peça continua contando na etapa dela e o lote só
// diferencia quem veio de onde no MESMO dia.
//
// Sem imports de propósito: roda no Node, no teste, sem banco.

// Placa/nota chega escrita de todo jeito ("bt 1111", "BT-1111"). Guardar
// normalizado é o que faz duas grafias do mesmo caminhão virarem uma cor só.
export function normalizarLote(v) {
  const s = String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s || null;
}

// A MESMA placa volta à usina, carrega e volta: duas viagens, um BT. Quem
// separa uma da outra é a NOTA — por isso ela manda na identidade quando
// existe. Sem nota, a placa segue valendo (é o caso antigo, que continua
// funcionando igual).
export function chaveDoLote(m) {
  return normalizarLote(m?.nota) || normalizarLote(m?.lote);
}

// O que se lê na legenda: "BT1111 · NF 4521", ou só o que existir.
export function rotuloDoLote(bt, nota) {
  const b = normalizarLote(bt), n = normalizarLote(nota);
  if (b && n) return `${b} · NF ${n}`;
  return b || (n ? `NF ${n}` : '');
}

// Paleta separada da paleta das etapas de propósito: no modo "por lote" a cor
// deixa de significar etapa, e usar as mesmas cores confundiria as duas
// leituras. Tons distintos entre si e legíveis sobre planta clara.
export const CORES_LOTE = [
  '#2563EB', '#EA580C', '#16A34A', '#9333EA', '#DB2777',
  '#0891B2', '#CA8A04', '#DC2626', '#4F46E5', '#059669',
];

// Os lotes do dia, na ordem de PRIMEIRO uso (não alfabética): o primeiro
// caminhão que chegou fica com a primeira cor, e a legenda lê como a sequência
// da concretagem. Cada item traz a placa, a nota e a cor escolhida à mão (se
// alguém escolheu) — a última gravada vence, que é a que a pessoa acabou de
// definir para o lote inteiro.
export function lotesDoDia(marcas, data, etapa = null) {
  const ordem = [];
  const acc = new Map();
  for (const m of marcas || []) {
    if (data && m.data !== data) continue;
    if (etapa && m.etapa !== etapa) continue;
    const chave = chaveDoLote(m);
    if (!chave) continue;
    if (!acc.has(chave)) {
      acc.set(chave, { chave, bt: normalizarLote(m.lote), nota: normalizarLote(m.nota), corManual: null });
      ordem.push(chave);
    }
    const at = acc.get(chave);
    if (!at.bt) at.bt = normalizarLote(m.lote);
    if (!at.nota) at.nota = normalizarLote(m.nota);
    if (m.lote_cor) at.corManual = m.lote_cor;
  }
  return ordem.map(c => ({ ...acc.get(c), rotulo: rotuloDoLote(acc.get(c).bt, acc.get(c).nota) }));
}

// Mapa chave → cor. A cor escolhida à mão ganha da paleta; sem escolha, cai na
// sequência de chegada. Passando de 10 lotes num dia a paleta reinicia: é
// preferível repetir cor a inventar tom ilegível.
export function coresDeLote(lotes) {
  const m = new Map();
  (lotes || []).forEach((l, i) => {
    const chave = typeof l === 'string' ? l : l.chave;
    const manual = typeof l === 'string' ? null : l.corManual;
    m.set(chave, manual || CORES_LOTE[i % CORES_LOTE.length]);
  });
  return m;
}

// Quanto cada lote entregou naquele dia — soma a quantidade das marcações
// (m³, quando a etapa tem unidade), conta as peças e lista os nomes delas,
// que é o "o que este caminhão fez" que o resumo precisa mostrar.
export function resumoDeLotes(marcas, data, etapa = null) {
  const acc = new Map();
  for (const m of marcas || []) {
    if (data && m.data !== data) continue;
    if (etapa && m.etapa !== etapa) continue;
    const chave = chaveDoLote(m);
    if (!chave) continue;
    const at = acc.get(chave) || { pecas: 0, quantidade: 0, nomes: [], etapas: [] };
    at.pecas += 1;
    at.quantidade += m.quantidade == null ? 0 : (Number(m.quantidade) || 0);
    if (m.rotulo && !at.nomes.includes(m.rotulo)) at.nomes.push(m.rotulo);
    if (m.etapa && !at.etapas.includes(m.etapa)) at.etapas.push(m.etapa);
    acc.set(chave, at);
  }
  // Mesma ordem de lotesDoDia: sequência de chegada, não alfabética.
  return lotesDoDia(marcas, data, etapa)
    .map(l => ({ ...l, ...(acc.get(l.chave) || { pecas: 0, quantidade: 0, nomes: [], etapas: [] }) }));
}

// O mesmo resumo, mas de um PERÍODO — é o que a aba do 📊 Resumo mostra: cada
// viagem, o dia dela e o que descarregou. Ordena por dia e, dentro do dia, pela
// sequência de chegada.
export function resumoDeLotesPeriodo(marcas, de, ate) {
  const dias = [];
  for (const m of marcas || []) {
    if (!m.data) continue;
    if (de && m.data < de) continue;
    if (ate && m.data > ate) continue;
    if (!chaveDoLote(m)) continue;
    if (!dias.includes(m.data)) dias.push(m.data);
  }
  dias.sort();
  const saida = [];
  for (const d of dias) {
    for (const r of resumoDeLotes(marcas, d)) saida.push({ ...r, data: d });
  }
  return saida;
}
