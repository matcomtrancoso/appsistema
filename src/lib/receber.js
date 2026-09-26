// Contas a receber: o que a obra já "vale" (percentual medido × valor fechado
// com o cliente) contra o que já entrou de dinheiro, mês a mês.
// Regra pura (sem tela, sem banco).
//
// O percentual vem das Medições (tabela medicoes_obra): é o avanço ACUMULADO
// que alguém mediu numa data. O medido de um mês é a diferença entre o acumulado
// no fim dele e o acumulado no fim do mês anterior.

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

/** Percentual acumulado medido até o fim do mês (a última medição até lá; 0 se não houver). */
export function percentualAteMes(medicoes, mes) {
  let melhor = null;
  for (const md of medicoes || []) {
    if (md.data && mesDe(md.data) <= mes && (!melhor || md.data > melhor.data)) melhor = md;
  }
  return melhor ? Number(melhor.percentual) || 0 : 0;
}

/**
 * Demonstrativo mês a mês.
 * @returns {{mes:string,percentual:number,medidoNoMes:number,medidoAcumulado:number,
 *            recebidoNoMes:number,recebidoAcumulado:number,saldo:number}[]}
 *   `saldo` = medido acumulado − recebido acumulado (positivo: a receber; negativo: recebido adiantado).
 */
export function demonstrativoMensal({ valorContrato, medicoes = [], recebimentos = [], ateMes }) {
  const primeiros = [
    ...medicoes.filter(m => m.data).map(m => mesDe(m.data)),
    ...recebimentos.filter(r => r.data).map(r => mesDe(r.data)),
  ].sort();
  if (!primeiros.length) return [];
  const fim = [ateMes, ...primeiros].filter(Boolean).sort().pop();
  const valor = Number(valorContrato) || 0;

  let medidoAnterior = 0;
  let recebidoAcumulado = 0;
  return listarMeses(primeiros[0], fim).map(mes => {
    const percentual = percentualAteMes(medicoes, mes);
    const medidoAcumulado = r2(valor * percentual / 100);
    const recebidoNoMes = r2(recebimentos.filter(r => r.data && mesDe(r.data) === mes)
      .reduce((s, r) => s + (Number(r.valor) || 0), 0));
    recebidoAcumulado = r2(recebidoAcumulado + recebidoNoMes);
    const linha = {
      mes, percentual,
      medidoNoMes: r2(medidoAcumulado - medidoAnterior),
      medidoAcumulado,
      recebidoNoMes,
      recebidoAcumulado,
      saldo: r2(medidoAcumulado - recebidoAcumulado),
    };
    medidoAnterior = medidoAcumulado;
    return linha;
  });
}

/** Os números grandes do topo da tela. */
export function resumoGeral({ valorContrato, medicoes = [], recebimentos = [] }) {
  const valor = valorContrato == null ? null : Number(valorContrato) || 0;
  const ultima = [...medicoes].filter(m => m.data).sort((a, b) => (a.data < b.data ? 1 : -1))[0];
  const percentual = ultima ? Number(ultima.percentual) || 0 : 0;
  const medido = valor == null ? 0 : r2(valor * percentual / 100);
  const recebido = r2(recebimentos.reduce((s, r) => s + (Number(r.valor) || 0), 0));
  return {
    valorContrato: valor,
    percentual,
    medido,
    recebido,
    aReceber: r2(medido - recebido),                       // já medido e ainda não recebido
    faltaMedir: valor == null ? null : r2(valor - medido), // parte do contrato que ainda não foi medida
  };
}
