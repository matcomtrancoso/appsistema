// Contas a receber: o que a obra já "vale" (medição mensal fechada, linha a linha
// do orçamento) contra o que já entrou de dinheiro, mês a mês.
// Regra pura (sem tela, sem banco).
//
// O medido vem de src/lib/medicao-mensal.js (resumoMesesFechados): só entra mês
// FECHADO. Este arquivo só junta isso com os recebimentos lançados.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

/** '2026-09-15' -> '2026-09' */
export const mesDe = (iso) => String(iso).slice(0, 7);

/** Sequência de meses 'AAAA-MM' de `de` até `ate`, inclusive. */
export function listarMeses(de, ate) {
  if (!de || !ate || de > ate) return [];
  const meses = [];
  let [a, m] = de.split('-').map(Number);
  const [af, mf] = ate.split('-').map(Number);
  while (a < af || (a === af && m <= mf)) {
    meses.push(`${a}-${pad(m)}`);
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return meses;
}

/**
 * Demonstrativo mês a mês.
 * @param {{mes:string,medidoNoMes:number,medidoAcumulado:number,pctGeral:number}[]} mesesMedidos  meses FECHADOS
 * @returns {{mes:string,percentual:number,medidoNoMes:number,medidoAcumulado:number,
 *            recebidoNoMes:number,recebidoAcumulado:number,saldo:number}[]}
 *   `saldo` = medido acumulado − recebido acumulado (positivo: a receber; negativo: recebido adiantado).
 *   Mês sem medição fechada mantém o acumulado do anterior (nada novo foi medido).
 */
export function demonstrativoMensal({ mesesMedidos = [], recebimentos = [], ateMes }) {
  const primeiros = [
    ...mesesMedidos.map(m => m.mes),
    ...recebimentos.filter(r => r.data).map(r => mesDe(r.data)),
  ].sort();
  if (!primeiros.length) return [];
  const fim = [ateMes, ...primeiros].filter(Boolean).sort().pop();
  const medidoDoMes = new Map(mesesMedidos.map(m => [m.mes, m]));

  let acumulado = 0, percentual = 0, recebidoAcumulado = 0;
  return listarMeses(primeiros[0], fim).map(mes => {
    const m = medidoDoMes.get(mes);
    if (m) { acumulado = m.medidoAcumulado; percentual = m.pctGeral; }
    const recebidoNoMes = r2(recebimentos.filter(r => r.data && mesDe(r.data) === mes)
      .reduce((s, r) => s + (Number(r.valor) || 0), 0));
    recebidoAcumulado = r2(recebidoAcumulado + recebidoNoMes);
    return {
      mes, percentual,
      medidoNoMes: m ? m.medidoNoMes : 0,
      medidoAcumulado: acumulado,
      recebidoNoMes,
      recebidoAcumulado,
      saldo: r2(acumulado - recebidoAcumulado),
    };
  });
}

/** Os números grandes do topo da tela. `valorTotal` é o total do orçamento aprovado. */
export function resumoGeral({ valorTotal, mesesMedidos = [], recebimentos = [] }) {
  const valor = valorTotal == null ? null : Number(valorTotal) || 0;
  const ultimo = [...mesesMedidos].sort((a, b) => (a.mes < b.mes ? 1 : -1))[0];
  const medido = ultimo ? ultimo.medidoAcumulado : 0;
  const recebido = r2(recebimentos.reduce((s, r) => s + (Number(r.valor) || 0), 0));
  return {
    valorContrato: valor,
    percentual: ultimo ? ultimo.pctGeral : 0,
    medido,
    recebido,
    aReceber: r2(medido - recebido),                       // já medido e ainda não recebido
    faltaMedir: valor == null ? null : r2(valor - medido), // parte do orçamento que ainda não foi medida
  };
}
