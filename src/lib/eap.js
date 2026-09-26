// EAP do orçamento da obra: códigos hierárquicos (1, 1.1, 1.1.2...), grupos e
// folhas, totais e a geração do cronograma. Regra pura (sem tela, sem banco).
//
//  · Folha  = linha que se mede e se orça: quantidade × preço unitário.
//  · Grupo  = linha que tem filhos. Não guarda valor: vale a soma dos filhos.

export const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Códigos ─────────────────────────────────────────────────────────────────
export const CODIGO_VALIDO = /^\d+(\.\d+)*$/;

export const segmentos = (codigo) => String(codigo).split('.');
export const nivel = (codigo) => segmentos(codigo).length;

/** '1.2.3' -> '1.2'; '1' -> null */
export function paiDe(codigo) {
  const s = segmentos(codigo);
  return s.length > 1 ? s.slice(0, -1).join('.') : null;
}

/** O orçamento está aprovado quando a engenharia aprovou (tem data de aprovação). Uma fonte só para as três telas. */
export const orcamentoAprovado = (contrato) => !!contrato?.aprovado_em;

/** Só se reabre o orçamento sem nenhuma medição (nem aberta): ela já mediu em cima dos valores. */
export function podeReabrirOrcamento({ contrato, medicoes = [] }) {
  if (!orcamentoAprovado(contrato)) return { ok: false, motivo: 'O orçamento não está aprovado.' };
  if (medicoes.length) return { ok: false, motivo: 'Já existe medição: o orçamento não pode mais ser reaberto.' };
  return { ok: true, motivo: null };
}

/**
 * Trocar TODO o orçamento por uma planilha nova só é seguro no rascunho, sem medição
 * e sem tarefa de cronograma nascida dele (as tarefas perderiam o vínculo e o
 * "Gerar cronograma" criaria tudo de novo).
 */
export function podeSubstituirOrcamento({ contrato, medicoes = [], tarefasLigadas = 0 }) {
  if (orcamentoAprovado(contrato)) return { ok: false, motivo: 'O orçamento está aprovado: reabra antes de substituir.' };
  if (medicoes.length) return { ok: false, motivo: 'Já existe medição: não dá para substituir o orçamento.' };
  if (tarefasLigadas > 0) return { ok: false, motivo: 'O cronograma já foi gerado a partir deste orçamento: substituir tudo duplicaria as tarefas. Ajuste as linhas uma a uma.' };
  return { ok: true, motivo: null };
}

/** Linhas que aparecem quando alguns grupos estão recolhidos (o Set tem os códigos dos grupos fechados). */
export function linhasVisiveis(linhas, fechados) {
  return linhas.filter(l => {
    for (let pai = paiDe(l.codigo); pai; pai = paiDe(pai)) if (fechados.has(pai)) return false;
    return true;
  });
}

/** Ordem natural: 1, 1.1, 1.2, 1.10, 2 (número por número, não texto). */
export function compararCodigos(a, b) {
  const x = segmentos(a).map(Number), y = segmentos(b).map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] === undefined) return -1;   // o pai vem antes dos filhos
    if (y[i] === undefined) return 1;
    if (x[i] !== y[i]) return x[i] - y[i];
  }
  return 0;
}

// ── Números de planilha em português ────────────────────────────────────────
/** 'R$ 1.234,56' -> 1234.56 · '1234.5' -> 1234.5 · '1.234' -> 1234 · '' -> 0 · 'abc' -> NaN */
export function numeroBR(texto) {
  let t = String(texto ?? '').replace(/R\$|\s/g, '');
  if (t === '') return 0;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');   // 1.234.567 = milhar (0.125 nunca é milhar)
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// ── Leitura do que foi colado (ou do arquivo) ───────────────────────────────
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALIASES = {
  codigo: ['item', 'codigo', 'eap', 'wbs', 'n', 'no', 'num', 'numero', 'cod'],
  descricao: ['descricao', 'servico', 'servicos', 'discriminacao', 'nome', 'atividade', 'descricao dos servicos'],
  unidade: ['un', 'und', 'unid', 'unidade'],
  quantidade: ['qtd', 'qtde', 'quant', 'quantidade', 'quantitativo'],
  preco: ['preco unitario', 'preco', 'p unit', 'p. unit', 'pu', 'valor unitario', 'vl unit', 'vl. unit', 'custo unitario', 'preco unit'],
};

/**
 * Lê texto colado do Excel/Sheets (colunas separadas por tab) ou CSV com ponto e
 * vírgula. Colunas: Item (EAP) · Descrição · Un · Quantidade · Preço unitário —
 * com ou sem cabeçalho (sem cabeçalho vale essa ordem).
 * Não grava nada: devolve { linhas, erros } para a tela mostrar a prévia.
 */
export function lerOrcamento(texto) {
  const erros = [];
  const bruto = String(texto || '').split(/\r?\n/).filter(l => l.trim() !== '');
  if (!bruto.length) return { linhas: [], erros: ['Cole as linhas do orçamento (Item, Descrição, Un, Quantidade, Preço unitário).'] };

  const sep = bruto.some(l => l.includes('\t')) ? '\t' : (bruto.some(l => l.includes(';')) ? ';' : null);
  if (!sep) return { linhas: [], erros: ['Não achei as colunas. Copie direto da planilha (Excel/Google) ou use ";" entre elas.'] };
  const celulas = bruto.map(l => l.split(sep).map(c => c.trim().replace(/^"|"$/g, '')));

  // Cabeçalho: a primeira linha não começa com um código de EAP.
  let col = { codigo: 0, descricao: 1, unidade: 2, quantidade: 3, preco: 4 };
  let inicio = 0;
  if (!CODIGO_VALIDO.test((celulas[0][0] || '').replace(/\.$/, ''))) {
    inicio = 1;
    const achado = {};
    celulas[0].forEach((nome, i) => {
      const n = semAcento(nome);
      for (const [campo, nomes] of Object.entries(ALIASES)) if (achado[campo] === undefined && nomes.includes(n)) achado[campo] = i;
    });
    if (achado.codigo === undefined || achado.descricao === undefined) {
      return { linhas: [], erros: ['Cabeçalho não reconhecido. Preciso das colunas "Item" (código da EAP) e "Descrição".'] };
    }
    col = { ...col, ...achado };
  }

  const linhas = [];
  const vistos = new Set();
  for (let i = inicio; i < celulas.length; i++) {
    const c = celulas[i];
    const rotulo = `Linha ${i + 1}`;
    const codigo = (c[col.codigo] || '').replace(/\.$/, '');
    if (!CODIGO_VALIDO.test(codigo)) { erros.push(`${rotulo}: o item "${c[col.codigo] || ''}" não é um código de EAP (ex.: 1, 1.2, 1.2.3).`); continue; }
    const descricao = (c[col.descricao] || '').trim();
    if (!descricao) { erros.push(`${rotulo} (${codigo}): falta a descrição.`); continue; }
    if (vistos.has(codigo)) { erros.push(`${rotulo}: o item ${codigo} aparece duas vezes.`); continue; }
    const quantidade = numeroBR(c[col.quantidade]);
    const preco = numeroBR(c[col.preco]);
    if (Number.isNaN(quantidade) || quantidade < 0) { erros.push(`${rotulo} (${codigo}): quantidade inválida "${c[col.quantidade]}".`); continue; }
    if (Number.isNaN(preco) || preco < 0) { erros.push(`${rotulo} (${codigo}): preço inválido "${c[col.preco]}".`); continue; }
    vistos.add(codigo);
    linhas.push({ codigo, descricao, unidade: (c[col.unidade] || '').trim(), quantidade, preco_unitario: preco });
  }
  return { linhas, erros };
}

// ── Montagem da árvore ──────────────────────────────────────────────────────
/**
 * Completa o que a planilha não disse: quem é pai de quem, quem é grupo, a ordem.
 * Pai que não veio na planilha é criado como grupo (com aviso). Valor colocado
 * em linha que tem filhos é ignorado (grupo vale a soma dos filhos).
 * @returns {{linhas:object[], avisos:string[]}}
 */
export function montarEap(brutas) {
  const avisos = [];
  const porCodigo = new Map(brutas.map(l => [l.codigo, { ...l }]));
  for (const l of brutas) {
    for (let pai = paiDe(l.codigo); pai; pai = paiDe(pai)) {
      if (!porCodigo.has(pai)) {
        porCodigo.set(pai, { codigo: pai, descricao: `Grupo ${pai}`, unidade: '', quantidade: 0, preco_unitario: 0 });
        avisos.push(`O item ${pai} não estava na planilha; criei como grupo "Grupo ${pai}" — renomeie depois.`);
      }
    }
  }
  const codigos = [...porCodigo.keys()].sort(compararCodigos);
  const comFilhos = new Set(codigos.map(paiDe).filter(Boolean));
  const linhas = codigos.map((codigo, i) => {
    const l = porCodigo.get(codigo);
    const grupo = comFilhos.has(codigo);
    if (grupo && (l.quantidade || l.preco_unitario)) avisos.push(`O item ${codigo} tem filhos: ignorei a quantidade e o preço dele (vale a soma dos filhos).`);
    return {
      codigo, pai_codigo: paiDe(codigo), descricao: l.descricao, unidade: grupo ? '' : l.unidade,
      quantidade: grupo ? 0 : l.quantidade, preco_unitario: grupo ? 0 : l.preco_unitario,
      is_grupo: grupo, ordem: i + 1,
    };
  });
  return { linhas, avisos };
}

// ── Valores ─────────────────────────────────────────────────────────────────
export const valorFolha = (l) => r2((Number(l.quantidade) || 0) * (Number(l.preco_unitario) || 0));

/** codigo -> valor (folha: qtd × preço; grupo: soma dos descendentes folha). */
export function valoresPorCodigo(linhas) {
  const valores = new Map();
  for (const l of linhas) if (!l.is_grupo) valores.set(l.codigo, valorFolha(l));
  // de baixo para cima: os mais profundos primeiro
  const grupos = linhas.filter(l => l.is_grupo).sort((a, b) => nivel(b.codigo) - nivel(a.codigo));
  for (const g of grupos) {
    const soma = linhas.filter(l => l.pai_codigo === g.codigo).reduce((s, f) => s + (valores.get(f.codigo) || 0), 0);
    valores.set(g.codigo, r2(soma));
  }
  return valores;
}

/** Total do orçamento: soma das linhas de primeiro nível. */
export function totalEap(linhas) {
  const v = valoresPorCodigo(linhas);
  return r2(linhas.filter(l => !l.pai_codigo).reduce((s, l) => s + (v.get(l.codigo) || 0), 0));
}

export const ordenarEap = (linhas) => [...linhas].sort((a, b) => compararCodigos(a.codigo, b.codigo));

/** A linha e tudo que está abaixo dela. */
export const subarvore = (linhas, codigo) => linhas.filter(l => l.codigo === codigo || l.codigo.startsWith(codigo + '.'));

/** Próximo código livre sob um pai (ou no primeiro nível, se `pai` for null). */
export function proximoCodigo(linhas, pai) {
  const irmaos = linhas.filter(l => (l.pai_codigo || null) === (pai || null));
  const maior = irmaos.reduce((m, l) => Math.max(m, Number(segmentos(l.codigo).at(-1))), 0);
  return pai ? `${pai}.${maior + 1}` : String(maior + 1);
}

// ── Cronograma a partir do orçamento ────────────────────────────────────────
/**
 * Quais tarefas de cronograma faltam criar. Uma por linha do orçamento que ainda
 * não tem tarefa ligada; grupos viram grupos. Os números (wbs_id) continuam
 * depois do maior que já existe, para não colidir com um cronograma importado.
 * @param {object[]} linhas    linhas do orçamento (com id)
 * @param {object[]} existentes tarefas já existentes ({wbs_id, orcamento_eap_id})
 * @returns {{itens:object[]}} itens prontos para inserir em cronograma_itens
 */
export function cronogramaDeEap(linhas, existentes = []) {
  const ligadas = new Map(existentes.filter(t => t.orcamento_eap_id).map(t => [t.orcamento_eap_id, t.wbs_id]));
  let proximo = existentes.reduce((m, t) => Math.max(m, Number(t.wbs_id) || 0), 0) + 1;
  const wbsPorCodigo = new Map();
  for (const l of linhas) if (ligadas.has(l.id)) wbsPorCodigo.set(l.codigo, ligadas.get(l.id));

  const itens = [];
  for (const l of ordenarEap(linhas)) {
    if (ligadas.has(l.id)) continue;
    const wbs = proximo++;
    wbsPorCodigo.set(l.codigo, wbs);
    itens.push({
      wbs_id: wbs,
      pai_wbs_id: l.pai_codigo ? (wbsPorCodigo.get(l.pai_codigo) ?? null) : null,
      nome: `${l.codigo} ${l.descricao}`,
      is_grupo: !!l.is_grupo,
      ordem: wbs,
      orcamento_eap_id: l.id,
    });
  }
  return { itens };
}
