import { relatorioMaoDeObra, relatorioDespesas } from '../src/lib/pagar-relatorio.js';
import { quinzenaDe } from '../src/lib/pagar.js';
import { fmtCur } from '../src/lib/moeda.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }

const quinzena = quinzenaDe('2026-09-15');
const linhas = [
  { chave: 'carlos', nome: 'Carlos', colab: { valor_diaria: 100 }, dias: ['2026-09-13', '2026-09-14'], pago: null },
  { chave: 'rafael', nome: 'Rafael', colab: { valor_diaria: 50 }, dias: ['2026-09-13'],
    pago: { valor: 55, valor_diaria: 50, ajuste: 5, dias: 1, pago_em: '2026-09-14' } },
];
const html1 = relatorioMaoDeObra({ linhas, quinzena, obra: { obra_codigo: 'OBRA-01', cliente: 'Cliente X' } });
t('é uma página HTML completa', html1.startsWith('<!doctype html>'));
t('tem o nome das duas pessoas', html1.includes('Carlos') && html1.includes('Rafael'));
t('mostra o valor em aberto do Carlos (2 × 100)', html1.includes(fmtCur(200)));
t('mostra quem já foi pago com a data', html1.includes('PAGO 14/09/2026'));
t('mostra o ajuste de quem foi pago', html1.includes('+' + fmtCur(5)));
t('sem linhas não quebra', relatorioMaoDeObra({ linhas: [], quinzena, obra: {} }).includes('Ninguém da equipe própria'));

const itens = [
  { descricao: 'Cimento', categoria: 'Material', vencimento: '2026-09-10', valor: 1680, status: 'aberto' },
  { descricao: 'Aluguel do container', categoria: 'Aluguel', vencimento: '2026-09-05', valor: 900, status: 'pago', pago_em: '2026-09-05' },
];
const html2 = relatorioDespesas({ itens, mesRotulo: 'set/2026', hoje: '2026-09-26', obra: {} });
t('despesas: tem as duas descrições', html2.includes('Cimento') && html2.includes('Aluguel do container'));
t('despesas: a vencida (10/09, hoje 26/09) aparece como vencida', html2.includes('VENCIDA'));
t('despesas: a paga aparece como paga', html2.includes('>PAGA<'));
t('despesas vazio não quebra', relatorioDespesas({ itens: [], mesRotulo: 'out/2026', hoje: '2026-09-26', obra: {} }).includes('Nenhuma despesa'));

console.log(`pagar-relatorio: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
