import { mesDe, listarMeses, demonstrativoMensal, resumoGeral } from '../src/lib/receber.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

t('mesDe', mesDe('2026-09-15') === '2026-09');
t('meses seguidos', igual(listarMeses('2026-08', '2026-10'), ['2026-08', '2026-09', '2026-10']));
t('vira o ano', igual(listarMeses('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']));
t('intervalo invertido é vazio', igual(listarMeses('2026-10', '2026-08'), []));

// Meses FECHADOS de uma obra de 100 mil: ago mediu 10 mil, set mediu 20 mil (acum. 30 mil), nov chegou a 50 mil.
const fechados = [
  { mes: '2026-08', medidoNoMes: 10000, medidoAcumulado: 10000, pctGeral: 10 },
  { mes: '2026-09', medidoNoMes: 20000, medidoAcumulado: 30000, pctGeral: 30 },
  { mes: '2026-11', medidoNoMes: 20000, medidoAcumulado: 50000, pctGeral: 50 },
];
const rec = [
  { data: '2026-09-10', valor: 10000 },
  { data: '2026-09-25', valor: 5000 },
  { data: '2026-11-15', valor: 20000 },
];
const dem = demonstrativoMensal({ mesesMedidos: fechados, recebimentos: rec, ateMes: '2026-11' });
t('vai do primeiro mês com movimento até o mês pedido', igual(dem.map(l => l.mes), ['2026-08', '2026-09', '2026-10', '2026-11']));
t('agosto: mediu 10 mil', dem[0].medidoNoMes === 10000 && dem[0].medidoAcumulado === 10000 && dem[0].percentual === 10);
t('setembro: medido no mês e acumulado', dem[1].medidoNoMes === 20000 && dem[1].medidoAcumulado === 30000);
t('setembro: somou os dois recebimentos', dem[1].recebidoNoMes === 15000 && dem[1].recebidoAcumulado === 15000);
t('setembro: saldo a receber', dem[1].saldo === 15000);
t('outubro sem medição fechada: nada novo medido, acumulado mantido', dem[2].medidoNoMes === 0 && dem[2].medidoAcumulado === 30000 && dem[2].percentual === 30 && dem[2].saldo === 15000);
t('novembro: 50 mil medido, recebeu 20 mil', dem[3].medidoAcumulado === 50000 && dem[3].recebidoAcumulado === 35000 && dem[3].saldo === 15000);
t('sem movimento nenhum devolve vazio', igual(demonstrativoMensal({ ateMes: '2026-09' }), []));
t('só recebimentos (nada medido ainda): saldo negativo, recebido adiantado',
  demonstrativoMensal({ mesesMedidos: [], recebimentos: [{ data: '2026-09-02', valor: 300 }], ateMes: '2026-09' })[0].saldo === -300);

const g = resumoGeral({ valorTotal: 100000, mesesMedidos: fechados, recebimentos: rec });
t('resumo: percentual é o do último mês fechado', g.percentual === 50);
t('resumo: medido, recebido, a receber e falta medir', g.medido === 50000 && g.recebido === 35000 && g.aReceber === 15000 && g.faltaMedir === 50000);
t('resumo sem orçamento: falta medir indefinido', resumoGeral({ valorTotal: null, mesesMedidos: fechados, recebimentos: [] }).faltaMedir === null);
t('resumo sem nenhum mês fechado: nada medido', resumoGeral({ valorTotal: 1000, mesesMedidos: [], recebimentos: [] }).medido === 0);
t('meses fora de ordem não atrapalham o último', resumoGeral({ valorTotal: 1, mesesMedidos: [...fechados].reverse(), recebimentos: [] }).medido === 50000);

console.log(`receber: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
