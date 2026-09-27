// Contas a pagar: a conta da mão de obra própria por quinzena.
// Regra pura (sem tela, sem banco): quem esteve presente, quantos dias, quanto vale.

import { MESES_CURTOS, parseISODate, addDaysISO } from './date.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const nomeChave = (nome) => String(nome || '').trim().toLowerCase();

// ── Quinzena ────────────────────────────────────────────────────────────────
// Ciclo fixo de 14 dias, ancorado em 12/09/2026 (pedido do dono do produto —
// deixou de ser 1–15/16–fim do mês, então uma quinzena pode atravessar dois
// meses, tipo 26/09 a 09/10). `periodo` é só um contador de ciclos desde a
// âncora (pode ser negativo, para ciclos antes dela); nada além deste arquivo
// olha esse número.
const DIA_MS = 86400000;
const ANCORA_QUINZENA = '2026-09-12';

export function quinzenaDe(iso) {
  const dias = Math.round((parseISODate(iso) - parseISODate(ANCORA_QUINZENA)) / DIA_MS);
  const periodo = Math.floor(dias / 14);
  const inicio = addDaysISO(ANCORA_QUINZENA, periodo * 14);
  return { periodo, inicio, fim: addDaysISO(inicio, 13) };
}

/** A quinzena `delta` ciclos adiante (negativo = para trás). */
export function quinzenaVizinha(q, delta) {
  return quinzenaDe(addDaysISO(q.inicio, delta * 14));
}

export function rotuloQuinzena(q) {
  // Fatia a string em vez de `Number()` para não perder o zero à esquerda do dia (09, não 9).
  const [ai, mi, di] = [q.inicio.slice(0, 4), Number(q.inicio.slice(5, 7)), q.inicio.slice(8, 10)];
  const [af, mf, df] = [q.fim.slice(0, 4), Number(q.fim.slice(5, 7)), q.fim.slice(8, 10)];
  const fimTxt = `${df} de ${MESES_CURTOS[mf - 1]}/${af}`;
  if (ai === af && mi === mf) return `${di} a ${fimTxt}`;   // mesmo mês: "12 a 25 de set/2026"
  const inicioTxt = ai === af ? `${di} de ${MESES_CURTOS[mi - 1]}` : `${di} de ${MESES_CURTOS[mi - 1]}/${ai}`;
  return `${inicioTxt} a ${fimTxt}`;   // atravessa mês (ou ano): "26 de set a 09 de out/2026"
}

// ── Presença da equipe própria (ADM) ────────────────────────────────────────
// Mesma regra da aba "Período" do Efetivo (efetivo-resumo.jsx): junta o que foi
// enviado (efetivo_rdo) com o rascunho do dia, conta cada pessoa UMA vez por
// dia, e só é "equipe própria" quem estava como ADM (marca do dia, empresa com
// "ADM" no nome, ou sem empresa nenhuma). Mexeu lá, mexa aqui.
/**
 * @param {{id:string,data:string,efetivo_draft?:any[]}[]} rdos   RDOs do período
 * @param {{rdo_id:string,colaborador_id?:string,colaborador_nome?:string,empreiteiro?:string}[]} efetivo
 * @returns {{chave:string,nome:string,colaboradorId:string|null,dias:string[]}[]} ordenado por nome
 */
export function presencasAdm({ rdos = [], efetivo = [] }) {
  const dataDoRdo = {};
  rdos.forEach(r => { dataDoRdo[r.id] = r.data; });

  // Marca "é ADM naquele dia", que só existe no rascunho.
  const admNoDia = new Set();
  rdos.forEach(r => (r.efetivo_draft || []).forEach(w => {
    if (w.is_adm) admNoDia.add(r.data + '|' + (w.colab_id || nomeChave(w.nome)));
  }));

  const vistos = new Set();
  const pessoas = new Map();   // chave (nome minúsculo) -> { nome, colaboradorId, dias:Set }
  const registrar = (data, nome, colabId, ehAdm) => {
    const chave = nomeChave(nome);
    if (!chave) return;
    const dia = data + '|' + chave;
    if (vistos.has(dia)) return;   // já contou essa pessoa nesse dia (o primeiro registro vale)
    vistos.add(dia);
    if (!ehAdm) return;
    const p = pessoas.get(chave) || { nome: String(nome).trim(), colaboradorId: null, dias: new Set() };
    if (colabId && !p.colaboradorId) p.colaboradorId = colabId;
    p.dias.add(data);
    pessoas.set(chave, p);
  };

  efetivo.forEach(e => {
    const data = dataDoRdo[e.rdo_id];
    if (!data) return;
    const ck = e.colaborador_id || nomeChave(e.colaborador_nome);
    const adm = admNoDia.has(data + '|' + ck) || /adm/i.test(e.empreiteiro || '') || !e.empreiteiro;
    registrar(data, e.colaborador_nome, e.colaborador_id, adm);
  });
  rdos.forEach(r => (r.efetivo_draft || []).forEach(w => {
    const adm = !!w.is_adm || /adm/i.test(w.empresa_nome || '') || !w.empresa_nome;
    registrar(r.data, w.nome, w.colab_id, adm);
  }));

  return [...pessoas.entries()]
    .map(([chave, p]) => ({ chave, nome: p.nome, colaboradorId: p.colaboradorId, dias: [...p.dias].sort() }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

// ── Valor do pagamento ──────────────────────────────────────────────────────
export function valorPagamento({ dias, valorDiaria, adicional = 0, desconto = 0 }) {
  const subtotal = r2((Number(dias) || 0) * (Number(valorDiaria) || 0));
  const total = r2(subtotal + (Number(adicional) || 0) - (Number(desconto) || 0));
  return { subtotal, total, ajuste: r2((Number(adicional) || 0) - (Number(desconto) || 0)) };
}

// ── A conta da quinzena (o que a tela mostra) ───────────────────────────────
/**
 * Junta presença, pagamentos já feitos e cadastro de diárias numa lista só.
 * Quem foi pago mas não aparece mais nas presenças (RDO apagado depois, por
 * exemplo) continua na lista, para o pagamento não sumir da tela.
 * @returns {{chave,nome,colaboradorId,dias:string[],colab:object|null,pago:object|null}[]}
 */
export function linhasDaQuinzena({ presencas = [], pagos = [], colaboradores = [] }) {
  const porId = new Map(colaboradores.map(c => [c.id, c]));
  const porNome = new Map(colaboradores.map(c => [nomeChave(c.nome), c]));
  const pagoDe = (chave) => pagos.find(x => nomeChave(x.colaborador_nome) === chave) || null;
  const linhas = presencas.map(p => ({
    ...p,
    colab: (p.colaboradorId && porId.get(p.colaboradorId)) || porNome.get(p.chave) || null,
    pago: pagoDe(p.chave),
  }));
  const chaves = new Set(linhas.map(l => l.chave));
  pagos.forEach(x => {
    const chave = nomeChave(x.colaborador_nome);
    if (chaves.has(chave)) return;
    chaves.add(chave);
    linhas.push({ chave, nome: x.colaborador_nome, colaboradorId: x.colaborador_id, dias: [], colab: null, pago: x });
  });
  return linhas;
}

/** Os números do topo: a pagar (só quem ainda não foi pago), já pago e quantos estão sem diária. */
export function resumoQuinzena(linhas) {
  const abertas = linhas.filter(l => !l.pago);
  return {
    aPagar: r2(abertas.reduce((s, l) => s + valorPagamento({ dias: l.dias.length, valorDiaria: l.colab?.valor_diaria }).total, 0)),
    jaPago: r2(linhas.reduce((s, l) => s + (l.pago ? Number(l.pago.valor) || 0 : 0), 0)),
    semDiaria: abertas.filter(l => !Number(l.colab?.valor_diaria)).length,
  };
}

/** Situação de uma despesa para a tela. */
export function situacaoDespesa(d, hoje) {
  if (d.status === 'pago') return 'paga';
  return d.vencimento && d.vencimento < hoje ? 'vencida' : 'aberta';
}

/** Totais de uma lista de despesas do mês. */
export function totaisDespesas(despesas) {
  const soma = (l) => r2(l.reduce((s, d) => s + (Number(d.valor) || 0), 0));
  const emAberto = soma(despesas.filter(d => d.status === 'aberto'));
  const pagas = soma(despesas.filter(d => d.status === 'pago'));
  return { emAberto, pagas, total: r2(emAberto + pagas) };
}
