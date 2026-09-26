// Contas a pagar: a conta da mão de obra própria por quinzena.
// Regra pura (sem tela, sem banco): quem esteve presente, quantos dias, quanto vale.

import { MESES_CURTOS } from './date.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');
const nomeChave = (nome) => String(nome || '').trim().toLowerCase();

// ── Quinzena ────────────────────────────────────────────────────────────────
// 1ª: dia 1 ao 15. 2ª: dia 16 ao último do mês.
export function quinzenaDe(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const ultimo = new Date(a, m, 0).getDate();
  const numero = d <= 15 ? 1 : 2;
  return {
    numero,
    inicio: `${a}-${pad(m)}-${numero === 1 ? '01' : '16'}`,
    fim: `${a}-${pad(m)}-${numero === 1 ? '15' : pad(ultimo)}`,
  };
}

/** A quinzena `delta` passos adiante (negativo = para trás). */
export function quinzenaVizinha(q, delta) {
  const [a, m] = q.inicio.split('-').map(Number);
  let idx = a * 24 + (m - 1) * 2 + (q.numero - 1) + delta;
  const ano = Math.floor(idx / 24);
  idx -= ano * 24;
  const mes = Math.floor(idx / 2) + 1;
  const numero = (idx % 2) + 1;
  return quinzenaDe(`${ano}-${pad(mes)}-${numero === 1 ? '01' : '16'}`);
}

export function rotuloQuinzena(q) {
  const [a, m] = q.inicio.split('-').map(Number);
  return `${q.numero}ª quinzena · ${MESES_CURTOS[m - 1]}/${a}`;
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
