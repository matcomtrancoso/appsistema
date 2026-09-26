import { ymDe, primeiroDia, mapaDePercentuais, calcularMedicao, validarPercentual, podeAbrirMes, podeReabrir, resumoMesesFechados, percentuaisAntesDe } from '../src/lib/medicao-mensal.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Orçamento: grupo 1 (folhas a=1000 e b=500), grupo 2 (folha c=2000). Total 3500.
const linhas = [
  { id: 'g1', codigo: '1', pai_codigo: null, is_grupo: true, quantidade: 0, preco_unitario: 0 },
  { id: 'a', codigo: '1.1', pai_codigo: '1', is_grupo: false, quantidade: 10, preco_unitario: 100 },
  { id: 'b', codigo: '1.2', pai_codigo: '1', is_grupo: false, quantidade: 5, preco_unitario: 100 },
  { id: 'g2', codigo: '2', pai_codigo: null, is_grupo: true, quantidade: 0, preco_unitario: 0 },
  { id: 'c', codigo: '2.1', pai_codigo: '2', is_grupo: false, quantidade: 1, preco_unitario: 2000 },
];

t('mês/dia 1', ymDe('2026-09-01') === '2026-09' && primeiroDia('2026-09') === '2026-09-01');

// ── conta de um mês ──
const m1 = calcularMedicao({ linhas, atuais: new Map([['a', 50], ['b', 20], ['c', 10]]) });
t('valor da folha no 1º mês = valor × %', m1.porLinha.get('a').valorNoMes === 500 && m1.porLinha.get('b').valorNoMes === 100 && m1.porLinha.get('c').valorNoMes === 200);
t('grupo soma as folhas', m1.porGrupo.get('1').valorNoMes === 600 && m1.porGrupo.get('2').valorNoMes === 200);
t('total do mês, acumulado e % geral', m1.total.medidoNoMes === 800 && m1.total.medidoAcumulado === 800 && m1.total.pctGeral === 22.86);
t('% do grupo é ponderado pelo valor (1000+500: 600/1500)', m1.porGrupo.get('1').pctAcum === 40);
t('valor total do orçamento', m1.total.valorTotal === 3500);

// ── segundo mês: só conta o que avançou ──
const m2 = calcularMedicao({ linhas, atuais: new Map([['a', 80], ['b', 20], ['c', 10]]), anteriores: new Map([['a', 50], ['b', 20], ['c', 10]]) });
t('mede só o avanço desde o mês anterior (a: 50→80 = 30%)', m2.porLinha.get('a').valorNoMes === 300 && m2.porLinha.get('a').pctNoMes === 30);
t('linha sem avanço vale zero no mês', m2.porLinha.get('b').valorNoMes === 0 && m2.porLinha.get('c').valorNoMes === 0);
t('acumulado soma tudo o que já foi medido', m2.total.medidoAcumulado === 1100 && m2.total.medidoNoMes === 300);
const m2b = calcularMedicao({ linhas, atuais: new Map([['a', 80]]), anteriores: new Map([['a', 50], ['b', 20]]) });
t('linha não lançada no mês fica no % do mês anterior', m2b.porLinha.get('b').pctAcum === 20 && m2b.porLinha.get('b').valorNoMes === 0);
t('sem nada lançado nem anterior: tudo zero', calcularMedicao({ linhas }).total.medidoAcumulado === 0);
t('orçamento vazio não quebra', calcularMedicao({ linhas: [] }).total.pctGeral === 0);
t('centavos sem ruído: 33,33% de 100', calcularMedicao({ linhas: [{ id: 'x', codigo: '1', pai_codigo: null, is_grupo: false, quantidade: 1, preco_unitario: 100 }], atuais: new Map([['x', 33.33]]) }).total.medidoNoMes === 33.33);

// ── validação do % ──
t('aceita igual ao anterior', validarPercentual(30, 30) === null);
t('recusa menor que o anterior', validarPercentual(20, 30).includes('30%'));
t('recusa acima de 100', validarPercentual(101, 0) !== null);
t('recusa negativo', validarPercentual(-1, 0) !== null);
t('recusa vazio e texto', validarPercentual('', 0) !== null && validarPercentual('abc', 0) !== null);

// ── quais meses podem abrir / reabrir ──
const meses = [{ id: 'm1', mes: '2026-08-01', status: 'fechada' }, { id: 'm2', mes: '2026-09-01', status: 'fechada' }];
t('abre o mês seguinte quando tudo está fechado', podeAbrirMes(meses, '2026-10').ok === true);
t('não abre mês repetido', podeAbrirMes(meses, '2026-09').ok === false);
t('não abre mês antes de um já medido', podeAbrirMes(meses, '2026-07').ok === false);
t('não abre com mês aberto pendente', podeAbrirMes([{ id: 'm1', mes: '2026-08-01', status: 'aberta' }], '2026-09').ok === false);
t('primeiro mês pode ser qualquer um', podeAbrirMes([], '2026-03').ok === true);
t('só o último mês fechado reabre', podeReabrir(meses, '2026-09').ok === true && podeReabrir(meses, '2026-08').ok === false);
t('mês aberto não precisa reabrir', podeReabrir([{ id: 'm1', mes: '2026-08-01', status: 'aberta' }], '2026-08').ok === false);
const agostoFechSetAberto = [{ id: 'm1', mes: '2026-08-01', status: 'fechada' }, { id: 'm2', mes: '2026-09-01', status: 'aberta' }];
t('com mês aberto depois, o fechado anterior não reabre (e diz o que fazer)', podeReabrir(agostoFechSetAberto, '2026-08').ok === false && podeReabrir(agostoFechSetAberto, '2026-08').motivo.includes('2026-09'));

// ── meses fechados (alimenta o Contas a receber) ──
const itens = [
  { medicao_id: 'm1', eap_id: 'a', percentual_acumulado: 50 }, { medicao_id: 'm1', eap_id: 'c', percentual_acumulado: 10 },
  { medicao_id: 'm2', eap_id: 'a', percentual_acumulado: 80 },
];
const res = resumoMesesFechados({ linhas, medicoes: [...meses, { id: 'm3', mes: '2026-10-01', status: 'aberta' }], itens: [...itens, { medicao_id: 'm3', eap_id: 'a', percentual_acumulado: 100 }] });
t('só conta mês fechado (o aberto não entra)', res.length === 2);
t('1º mês: a 50% (500) + c 10% (200)', res[0].medidoNoMes === 700 && res[0].medidoAcumulado === 700);
t('2º mês: só a avançou 30 pontos (300); c continua no do mês anterior', res[1].medidoNoMes === 300 && res[1].medidoAcumulado === 1000);
t('base antes do mês 3 = o que sobrou dos anteriores', igual([...percentuaisAntesDe(meses, itens, '2026-10').entries()].sort(), [['a', 80], ['c', 10]]));
t('base do 1º mês é vazia', percentuaisAntesDe(meses, itens, '2026-08').size === 0);
t('mapa de percentuais só pega a medição pedida', mapaDePercentuais(itens, 'm1').size === 2);

console.log(`medicao-mensal: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
