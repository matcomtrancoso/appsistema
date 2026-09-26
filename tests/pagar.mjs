import { quinzenaDe, quinzenaVizinha, rotuloQuinzena, presencasAdm, valorPagamento, linhasDaQuinzena, resumoQuinzena, situacaoDespesa, totaisDespesas } from '../src/lib/pagar.js';
import { fmtDataBR, rotuloMesAno, somaMesesYM, faixaDoMes } from '../src/lib/date.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── quinzena ──
t('dia 15 é 1ª quinzena', igual(quinzenaDe('2026-09-15'), { numero: 1, inicio: '2026-09-01', fim: '2026-09-15' }));
t('dia 16 é 2ª quinzena', igual(quinzenaDe('2026-09-16'), { numero: 2, inicio: '2026-09-16', fim: '2026-09-30' }));
t('2ª quinzena de fevereiro fecha no 28', quinzenaDe('2026-02-20').fim === '2026-02-28');
t('fevereiro bissexto fecha no 29', quinzenaDe('2028-02-20').fim === '2028-02-29');
t('31 de julho ainda é 2ª quinzena de julho', igual(quinzenaDe('2026-07-31'), { numero: 2, inicio: '2026-07-16', fim: '2026-07-31' }));
t('anterior à 1ª é a 2ª do mês passado', igual(quinzenaVizinha(quinzenaDe('2026-09-05'), -1), quinzenaDe('2026-08-20')));
t('próxima da 2ª é a 1ª do mês seguinte', igual(quinzenaVizinha(quinzenaDe('2026-09-20'), 1), quinzenaDe('2026-10-01')));
t('vira o ano para trás', igual(quinzenaVizinha(quinzenaDe('2026-01-03'), -1), quinzenaDe('2025-12-20')));
t('vira o ano para frente', igual(quinzenaVizinha(quinzenaDe('2026-12-20'), 1), quinzenaDe('2027-01-02')));
t('rótulo', rotuloQuinzena(quinzenaDe('2026-09-16')) === '2ª quinzena · set/2026');

// ── presença ──
const rdos = [
  { id: 'r1', data: '2026-09-01', efetivo_draft: [] },
  { id: 'r2', data: '2026-09-02', efetivo_draft: [{ nome: 'Carlos', empresa_nome: 'ADM (própria)', is_adm: true }, { nome: 'Pedro', empresa_nome: 'Alvenaria Souza' }] },
  { id: 'r3', data: '2026-09-03', efetivo_draft: [] },
];
const ef = [
  { rdo_id: 'r1', colaborador_id: 'c1', colaborador_nome: 'Carlos', empreiteiro: 'ADM (própria)' },
  { rdo_id: 'r1', colaborador_id: 'c1', colaborador_nome: 'Carlos', empreiteiro: 'ADM (própria)' },   // 2 atividades no dia
  { rdo_id: 'r1', colaborador_id: 'c2', colaborador_nome: 'Pedro', empreiteiro: 'Alvenaria Souza' },
  { rdo_id: 'r3', colaborador_id: 'c1', colaborador_nome: 'carlos ', empreiteiro: null },              // sem empresa = ADM
  { rdo_id: 'rX', colaborador_id: 'c9', colaborador_nome: 'Fora do período', empreiteiro: null },
];
const p = presencasAdm({ rdos, efetivo: ef });
const carlos = p.find(x => x.nome === 'Carlos');
t('pessoa com 2 atividades no mesmo dia conta 1 dia', carlos.dias.filter(d => d === '2026-09-01').length === 1);
t('Carlos: dia 1 (enviado), 2 (rascunho ADM) e 3 (sem empresa)', igual(carlos.dias, ['2026-09-01', '2026-09-02', '2026-09-03']));
t('nome com espaço/caixa diferente é a mesma pessoa', p.filter(x => x.chave === 'carlos').length === 1);
t('mantém o id do colaborador', carlos.colaboradorId === 'c1');
t('empreiteiro não entra na conta da equipe própria', !p.some(x => x.nome === 'Pedro'));
t('RDO fora do período é ignorado', !p.some(x => x.nome === 'Fora do período'));
t('sem dados devolve lista vazia', igual(presencasAdm({}), []));
t('rascunho de empreiteiro com marca ADM do dia conta como ADM',
  presencasAdm({ rdos: [{ id: 'a', data: '2026-09-10', efetivo_draft: [{ nome: 'Zé', empresa_nome: 'Elétrica', is_adm: true }] }], efetivo: [] }).length === 1);

// ── valor ──
t('dias × diária', valorPagamento({ dias: 10, valorDiaria: 150 }).total === 1500);
t('adicional e desconto', valorPagamento({ dias: 10, valorDiaria: 150, adicional: 100, desconto: 50 }).total === 1550);
t('centavos sem ruído de ponto flutuante', valorPagamento({ dias: 3, valorDiaria: 33.33 }).total === 99.99);
t('vazio vira zero', valorPagamento({}).total === 0);

t('ajuste é adicional − desconto', valorPagamento({ dias: 1, valorDiaria: 100, adicional: 30, desconto: 10 }).ajuste === 20);

// ── linhas e resumo da quinzena ──
const pres = [
  { chave: 'carlos', nome: 'Carlos', colaboradorId: 'c1', dias: ['2026-09-01', '2026-09-02', '2026-09-03'] },
  { chave: 'rafael', nome: 'Rafael', colaboradorId: null, dias: ['2026-09-01'] },
  { chave: 'zé', nome: 'Zé', colaboradorId: null, dias: ['2026-09-02'] },
];
const colabs = [{ id: 'c1', nome: 'Carlos', valor_diaria: 100 }, { id: 'c2', nome: ' RAFAEL ', valor_diaria: 50 }];
const pagos = [
  { colaborador_nome: 'Rafael', dias: 1, valor_diaria: 50, valor: 50 },
  { colaborador_nome: 'Fantasma', colaborador_id: 'c9', dias: 4, valor_diaria: 10, valor: 40 },
];
const linhas = linhasDaQuinzena({ presencas: pres, pagos, colaboradores: colabs });
t('acha o cadastro pelo id', linhas.find(l => l.chave === 'carlos').colab.valor_diaria === 100);
t('acha o cadastro pelo nome (sem caixa nem espaço)', linhas.find(l => l.chave === 'rafael').colab.id === 'c2');
t('marca quem já foi pago', linhas.find(l => l.chave === 'rafael').pago.valor === 50 && !linhas.find(l => l.chave === 'carlos').pago);
t('pago que sumiu das presenças continua na lista', linhas.some(l => l.chave === 'fantasma' && l.pago && l.dias.length === 0));
const res = resumoQuinzena(linhas);
t('a pagar soma só quem não foi pago e tem diária (Carlos 3×100)', res.aPagar === 300);
t('já pago soma os pagamentos (50 + 40)', res.jaPago === 90);
t('conta quem está sem diária (só o Zé; o fantasma já foi pago)', res.semDiaria === 1);

// ── despesas ──
t('despesa paga', situacaoDespesa({ status: 'pago', vencimento: '2026-01-01' }, '2026-09-26') === 'paga');
t('despesa em aberto vencida', situacaoDespesa({ status: 'aberto', vencimento: '2026-09-25' }, '2026-09-26') === 'vencida');
t('vence hoje ainda não está vencida', situacaoDespesa({ status: 'aberto', vencimento: '2026-09-26' }, '2026-09-26') === 'aberta');
const totD = totaisDespesas([{ status: 'aberto', valor: 10.1 }, { status: 'aberto', valor: 20.2 }, { status: 'pago', valor: 5 }]);
t('totais das despesas sem ruído de ponto flutuante', totD.emAberto === 30.3 && totD.pagas === 5 && totD.total === 35.3);

// ── helpers de data compartilhados ──
t('fmtDataBR', fmtDataBR('2026-09-05') === '05/09/2026' && fmtDataBR('') === '');
t('rotuloMesAno', rotuloMesAno('2026-09') === 'set/2026');
t('somaMesesYM vira o ano', somaMesesYM('2026-12', 1) === '2027-01' && somaMesesYM('2026-01', -1) === '2025-12');
t('faixaDoMes fevereiro bissexto', faixaDoMes('2028-02').fim === '2028-02-29' && faixaDoMes('2028-02').inicio === '2028-02-01');

console.log(`pagar: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
