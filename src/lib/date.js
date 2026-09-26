// ── Helpers de data ───────────────────────────────────────────────────────
// Datas de calendário (YYYY-MM-DD) precisam ser calculadas no fuso LOCAL.
// `toISOString()` converte para UTC: no Brasil (UTC-3), a partir das 21h ele
// devolve o dia seguinte, o que jogava RDO, prazos e filtros para o dia errado.

export function toISODate(d) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function hojeLocal() {
  return toISODate(new Date());
}

// ISO (YYYY-MM-DD) → Date ao meio-dia local, imune a fuso e horário de verão.
export function parseISODate(iso) {
  if (!iso) return null;
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

// Soma dias a uma data ISO (padrão: hoje) e devolve ISO local.
export function addDaysISO(iso, n) {
  const base = parseISODate(iso) || new Date();
  base.setDate(base.getDate() + n);
  return toISODate(base);
}

// Soma meses preservando o fim do mês: 31/01 + 1 mês = 28/02 (e não 03/03).
export function addMonthsISO(iso, n) {
  const base = parseISODate(iso) || new Date();
  const diaOriginal = base.getDate();
  base.setDate(1);
  base.setMonth(base.getMonth() + n);
  const ultimoDiaDoMes = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  base.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return toISODate(base);
}

// Dias até o prazo, comparando DIA a DIA (não instante a instante).
// Negativo = atrasado · 0 = vence hoje · null = sem prazo.
export function diasRestantes(iso) {
  const alvo = parseISODate(iso);
  if (!alvo) return null;
  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);
  return Math.round((alvo - hoje) / 86400000);
}

// ── Data para exibir e mês ('AAAA-MM') ───────────────────────────────────────
export const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-09-05' -> '05/09/2026' */
export function fmtDataBR(iso) {
  return iso ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}/${String(iso).slice(0, 4)}` : '';
}

/** '2026-09' -> 'set/2026' */
export function rotuloMesAno(ym) {
  return `${MESES_CURTOS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;
}

/** Soma `n` meses a um mês 'AAAA-MM' ('2026-12', 1 -> '2027-01'). */
export function somaMesesYM(ym, n) {
  return addMonthsISO(`${ym}-01`, n).slice(0, 7);
}

/** Primeiro e último dia de um mês 'AAAA-MM' (o intervalo que o banco compara). */
export function faixaDoMes(ym) {
  const ultimo = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  return { inicio: `${ym}-01`, fim: `${ym}-${String(ultimo).padStart(2, '0')}` };
}
