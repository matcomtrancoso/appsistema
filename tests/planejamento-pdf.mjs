// O quadro semanal em papel: ordem fixa de fornecedores e a matriz certa.
import { ordemDeFornecedores, ordenarPorFornecedor, htmlPlanejamentoSemanal, rotuloColuna } from '../src/lib/planejamento-pdf.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome + (bate ? '' : '\n       obtido:   ' + JSON.stringify(real) + '\n       esperado: ' + JSON.stringify(esperado)));
};

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex'];
const atvs = [
  { id: 1, descricao: 'Escavação',  empreiteiro: 'Beta',   ambiente: 'Obra', dias_semana: SEMANA, status_por_dia: { seg: 'em_andamento' } },
  { id: 2, descricao: 'Armação',    empreiteiro: 'Alfa', ambiente: 'Obra', dias_semana: SEMANA, status_por_dia: { seg: 'nao_feita' } },
  { id: 3, descricao: 'Limpeza',    empreiteiro: 'Alfa', ambiente: 'Canteiro', dias_semana: SEMANA, status_por_dia: {} },
  { id: 4, descricao: 'Refletores', empreiteiro: 'Gama',   ambiente: null, dias_semana: ['ter'], status_por_dia: {} },
  { id: 5, descricao: 'Visita',     empreiteiro: null,        ambiente: null, dias_semana: [], status: 'pendente' },
];

// ── Ordem dos fornecedores ───────────────────────────────────────────────
t('mais atividades primeiro, sem fornecedor por último',
  ordemDeFornecedores(atvs), ['Alfa', 'Beta', 'Gama', 'Sem fornecedor']);

t('empate desempata por alfabeto',
  ordemDeFornecedores([
    { empreiteiro: 'Zeta' }, { empreiteiro: 'Alfa' },
  ]), ['Alfa', 'Zeta']);

t('a lista do dia segue a ordem da semana',
  ordenarPorFornecedor(atvs, ordemDeFornecedores(atvs)).map(a => a.id),
  [2, 3, 1, 4, 5]);   // Alfa (Armação, Limpeza), Beta, Gama, sem forn.

t('fornecedor fora da ordem não quebra, vai para o fim',
  ordenarPorFornecedor([{ id: 9, empreiteiro: 'Novo', descricao: 'x' }], ['Alfa']).map(a => a.id), [9]);

// ── HTML ─────────────────────────────────────────────────────────────────
const dias = [{ iso: '2026-08-24', rotulo: 'Seg 24/08' }, { iso: '2026-08-25', rotulo: 'Ter 25/08' }];
const html = htmlPlanejamentoSemanal({
  obra: 'OBRA-01 - Residencial Aurora', rotulo: '24/08 – 30/08', dias,
  porDia: {
    '2026-08-24': atvs.filter(a => a.dias_semana?.includes('seg')),
    '2026-08-25': atvs.filter(a => a.dias_semana?.includes('ter')),
  },
  corDe: (n) => (n === 'Beta' ? '#E91E63' : '#888'),
});

t('uma linha por fornecedor', (html.match(/class="forn" style/g) || []).length, 3);
t('fornecedor aparece uma vez só (linha), não uma por dia',
  (html.match(/>Beta</g) || []).length, 1);
t('cor da empresa entra na linha', html.includes('border-left:5px solid #E91E63'), true);
t('status do dia pinta a bolinha (seg em andamento)', html.includes('background:#D97706'), true);
t('não feita aparece em vermelho', html.includes('background:#DC2626'), true);
t('ambiente vai junto da atividade', html.includes('· Canteiro'), true);
t('paisagem para caber a semana', html.includes('A4 landscape'), true);
t('html escapa texto malicioso',
  htmlPlanejamentoSemanal({ rotulo: 'x', dias, porDia: { '2026-08-24': [{ descricao: '<script>alert(1)</script>', dias_semana: ['seg'] }] } }).includes('<script>alert'),
  false);

t('semana vazia avisa em vez de imprimir tabela oca',
  htmlPlanejamentoSemanal({ rotulo: 'x', dias, porDia: {} }).includes('Nenhuma atividade nesta semana'), true);

t('rótulo da coluna', rotuloColuna('2026-08-24'), 'Seg 24/08');

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
