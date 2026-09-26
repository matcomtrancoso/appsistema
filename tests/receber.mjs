import { mesDe, listarMeses, percentualAteMes, demonstrativoMensal, resumoGeral } from '../src/lib/receber.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

t('mesDe', mesDe('2026-09-15') === '2026-09');
t('meses seguidos', igual(listarMeses('2026-08', '2026-10'), ['2026-08', '2026-09', '2026-10']));
t('vira o ano', igual(listarMeses('2026-11', '2027-01'), ['2026-11', '2026-12', '2027-01']));
t('intervalo invertido é vazio', igual(listarMeses('2026-10', '2026-08'), []));

const med = [
  { data: '2026-08-20', percentual: 10 },
  { data: '2026-09-05', percentual: 20 },
  { data: '2026-09-28', percentual: 30 },   // a última do mês vale
  { data: '2026-11-10', percentual: 50 },
];
t('vale a última medição do mês', percentualAteMes(med, '2026-09') === 30);
t('mês sem medição mantém o acumulado anterior', percentualAteMes(med, '2026-10') === 30);
t('antes da primeira medição é zero', percentualAteMes(med, '2026-07') === 0);
t('sem medições é zero', percentualAteMes([], '2026-09') === 0);

const rec = [
  { data: '2026-09-10', valor: 10000 },
  { data: '2026-09-25', valor: 5000 },
  { data: '2026-11-15', valor: 20000 },
];
const dem = demonstrativoMensal({ valorContrato: 100000, medicoes: med, recebimentos: rec, ateMes: '2026-11' });
t('vai do primeiro mês com movimento até o mês pedido', igual(dem.map(l => l.mes), ['2026-08', '2026-09', '2026-10', '2026-11']));
t('agosto: mediu 10% de 100 mil', dem[0].medidoNoMes === 10000 && dem[0].medidoAcumulado === 10000);
t('setembro: medido no mês é a diferença (30% − 10%)', dem[1].medidoNoMes === 20000 && dem[1].medidoAcumulado === 30000);
t('setembro: somou os dois recebimentos', dem[1].recebidoNoMes === 15000 && dem[1].recebidoAcumulado === 15000);
t('setembro: saldo a receber', dem[1].saldo === 15000);
t('outubro sem medição nem recebimento: nada novo, saldo mantido', dem[2].medidoNoMes === 0 && dem[2].recebidoNoMes === 0 && dem[2].saldo === 15000);
t('novembro: 50% acumulado, recebeu 20 mil', dem[3].medidoAcumulado === 50000 && dem[3].recebidoAcumulado === 35000 && dem[3].saldo === 15000);
t('sem movimento nenhum devolve vazio', igual(demonstrativoMensal({ valorContrato: 1, ateMes: '2026-09' }), []));
t('sem valor de contrato não inventa medido', demonstrativoMensal({ valorContrato: null, medicoes: med, recebimentos: [], ateMes: '2026-09' }).every(l => l.medidoAcumulado === 0));
t('recebido adiantado fica com saldo negativo',
  demonstrativoMensal({ valorContrato: 1000, medicoes: [{ data: '2026-09-01', percentual: 10 }], recebimentos: [{ data: '2026-09-02', valor: 300 }], ateMes: '2026-09' })[0].saldo === -200);

const g = resumoGeral({ valorContrato: 100000, medicoes: med, recebimentos: rec });
t('resumo: percentual atual é o da última medição', g.percentual === 50);
t('resumo: medido, recebido, a receber e falta medir', g.medido === 50000 && g.recebido === 35000 && g.aReceber === 15000 && g.faltaMedir === 50000);
t('resumo sem contrato: falta medir indefinido', resumoGeral({ valorContrato: null, medicoes: med, recebimentos: [] }).faltaMedir === null);

console.log(`receber: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
