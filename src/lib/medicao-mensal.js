// Medição mensal por linha do orçamento. Regra pura (sem tela, sem banco).
//
// Cada mês tem, para cada linha (folha) do orçamento, o % ACUMULADO executado
// até o fim daquele mês. O valor medido no mês é o que avançou desde o mês
// anterior:   valor da linha × (% deste mês − % do mês anterior) / 100.
// Grupo não é medido: vale a soma das folhas dele.
import { valorFolha, valoresPorCodigo, nivel, r2 } from './eap.js';

const pct = r2;   // percentual também com 2 casas

/** '2026-09-01' -> '2026-09' */
export const ymDe = (mes) => String(mes).slice(0, 7);
/** '2026-09' -> '2026-09-01' (o banco guarda o mês como o dia 1) */
export const primeiroDia = (ym) => `${ym}-01`;

/** itens de uma medição -> Map(eap_id -> percentual acumulado) */
export function mapaDePercentuais(itens = [], medicaoId) {
  const m = new Map();
  for (const it of itens) if (it.medicao_id === medicaoId) m.set(it.eap_id, Number(it.percentual_acumulado) || 0);
  return m;
}

/**
 * Faz a conta de um mês.
 * @param {object[]} linhas   linhas do orçamento (id, codigo, pai_codigo, is_grupo, quantidade, preco_unitario)
 * @param {Map} atuais        eap_id -> % acumulado lançado neste mês (linha sem valor = sem avanço: fica no do mês anterior)
 * @param {Map} anteriores    eap_id -> % acumulado do mês anterior
 */
export function calcularMedicao({ linhas, atuais = new Map(), anteriores = new Map() }) {
  const porLinha = new Map();
  for (const l of linhas) {
    if (l.is_grupo) continue;
    const anterior = anteriores.get(l.id) ?? 0;
    const acum = atuais.has(l.id) ? atuais.get(l.id) : anterior;
    const valorLinha = valorFolha(l);
    porLinha.set(l.id, {
      pctAnterior: anterior,
      pctAcum: acum,
      pctNoMes: pct(acum - anterior),
      valorLinha,
      valorNoMes: r2(valorLinha * (acum - anterior) / 100),
      valorAcumulado: r2(valorLinha * acum / 100),
    });
  }

  // Grupos: somam as folhas de baixo (mesma ideia de valoresPorCodigo).
  const somaGrupo = (campo) => {
    const v = new Map();
    for (const l of linhas) if (!l.is_grupo) v.set(l.codigo, porLinha.get(l.id)[campo]);
    const grupos = linhas.filter(l => l.is_grupo).sort((a, b) => nivel(b.codigo) - nivel(a.codigo));
    for (const g of grupos) v.set(g.codigo, r2(linhas.filter(l => l.pai_codigo === g.codigo).reduce((s, f) => s + (v.get(f.codigo) || 0), 0)));
    return v;
  };
  const valores = valoresPorCodigo(linhas);
  const noMes = somaGrupo('valorNoMes');
  const acumulado = somaGrupo('valorAcumulado');
  const porGrupo = new Map();
  for (const g of linhas.filter(l => l.is_grupo)) {
    const total = valores.get(g.codigo) || 0;
    porGrupo.set(g.codigo, {
      valorLinha: total,
      valorNoMes: noMes.get(g.codigo) || 0,
      valorAcumulado: acumulado.get(g.codigo) || 0,
      pctAcum: total ? pct((acumulado.get(g.codigo) || 0) / total * 100) : 0,
    });
  }

  const raiz = linhas.filter(l => !l.pai_codigo);
  const valorTotal = r2(raiz.reduce((s, l) => s + (valores.get(l.codigo) || 0), 0));
  const medidoNoMes = r2(raiz.reduce((s, l) => s + (noMes.get(l.codigo) || 0), 0));
  const medidoAcumulado = r2(raiz.reduce((s, l) => s + (acumulado.get(l.codigo) || 0), 0));
  return {
    porLinha, porGrupo,
    total: { valorTotal, medidoNoMes, medidoAcumulado, pctGeral: valorTotal ? pct(medidoAcumulado / valorTotal * 100) : 0 },
  };
}

/** Mensagem de erro para um % digitado, ou null se serve. */
export function validarPercentual(valor, anterior = 0) {
  const n = Number(valor);
  if (valor === '' || valor === null || valor === undefined || Number.isNaN(n)) return 'Digite um número de 0 a 100.';
  if (n < 0 || n > 100) return 'O percentual vai de 0 a 100.';
  if (n < anterior) return `Não pode ser menor que o do mês anterior (${anterior}%).`;
  return null;
}

// ── Que mês pode ser aberto, fechado, reaberto ──────────────────────────────
const ordenadas = (medicoes) => [...medicoes].sort((a, b) => (ymDe(a.mes) < ymDe(b.mes) ? -1 : 1));

/** Só se abre um mês novo depois de fechar todos os anteriores, e sempre depois do último já aberto. */
export function podeAbrirMes(medicoes, ym) {
  if (medicoes.some(m => ymDe(m.mes) === ym)) return { ok: false, motivo: 'Este mês já foi aberto.' };
  const ult = ordenadas(medicoes).at(-1);
  if (ult && ymDe(ult.mes) > ym) return { ok: false, motivo: 'Não dá para abrir um mês antes de outro já medido.' };
  const aberta = medicoes.find(m => m.status !== 'fechada');
  if (aberta) return { ok: false, motivo: `Feche primeiro a medição de ${ymDe(aberta.mes)}.` };
  return { ok: true, motivo: null };
}

/** Só a ÚLTIMA medição da obra reabre (senão os meses seguintes perdem a base) — o banco também exige. */
export function podeReabrir(medicoes, ym) {
  const ult = ordenadas(medicoes).at(-1);
  if (!ult) return { ok: false, motivo: 'Não há medição.' };
  if (ymDe(ult.mes) !== ym) {
    return { ok: false, motivo: ult.status === 'fechada'
      ? 'Só a última medição pode ser reaberta.'
      : `Só a última medição pode ser reaberta: apague ou feche a de ${ymDe(ult.mes)} antes.` };
  }
  if (ult.status !== 'fechada') return { ok: false, motivo: 'Esta medição já está aberta.' };
  return { ok: true, motivo: null };
}

/**
 * O que cada mês FECHADO mediu, na ordem — é o que o Contas a receber usa.
 * @returns {{mes:string, medidoNoMes:number, medidoAcumulado:number, pctGeral:number}[]}
 */
export function resumoMesesFechados({ linhas, medicoes, itens }) {
  const fechadas = ordenadas(medicoes).filter(m => m.status === 'fechada');
  const saida = [];
  let anteriores = new Map();
  for (const m of fechadas) {
    const atuais = mapaDePercentuais(itens, m.id);
    const c = calcularMedicao({ linhas, atuais, anteriores });
    saida.push({ mes: ymDe(m.mes), medidoNoMes: c.total.medidoNoMes, medidoAcumulado: c.total.medidoAcumulado, pctGeral: c.total.pctGeral });
    // o acumulado de quem não foi lançado neste mês continua o do anterior
    const prox = new Map(anteriores);
    atuais.forEach((v, k) => prox.set(k, v));
    anteriores = prox;
  }
  return saida;
}

/**
 * Os % acumulados vigentes ANTES do mês `ym` (o que ficou dos meses anteriores):
 * é a base do mês — o valor medido nele é só o que passar disso.
 */
export function percentuaisAntesDe(medicoes, itens, ym) {
  const base = new Map();
  for (const m of ordenadas(medicoes)) {
    if (ymDe(m.mes) >= ym) break;
    mapaDePercentuais(itens, m.id).forEach((v, k) => base.set(k, v));
  }
  return base;
}
