// O que a semana passada deixa como sugestão para a seguinte.
// Esta regra viveu dentro da tela de planejamento, no meio de uma consulta ao
// banco — nenhum dos casos abaixo era verificável ali.
import { sugestoesDaSemana, statusDoUltimoDia, chaveDeSugestao } from '../src/lib/sugestoes-semana.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome + (bate ? '' : '\n       obtido:   ' + JSON.stringify(real) + '\n       esperado: ' + JSON.stringify(esperado)));
};
const descs = (l) => l.map(x => x.desc);

const SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex'];

// ── Qual status julga a atividade ────────────────────────────────────────
t('vale o último dia planejado, não o primeiro',
  statusDoUltimoDia({ dias_semana: SEMANA, status_por_dia: { seg: 'nao_feita', sex: 'feita' } }), 'feita');
t('dia sem registro cai no status liso',
  statusDoUltimoDia({ dias_semana: SEMANA, status_por_dia: { seg: 'em_andamento' }, status: 'pendente' }), 'pendente');
t('sem dias marcados usa o status liso',
  statusDoUltimoDia({ dias_semana: [], status: 'em_andamento' }), 'em_andamento');
t('sem nada gravado conta como pendente', statusDoUltimoDia({}), 'pendente');
// A ordem é a da semana (seg→dom), não a ordem em que a pessoa marcou os dias.
t('a ordem dos dias no array não muda o resultado',
  statusDoUltimoDia({ dias_semana: ['sex', 'seg', 'qua'], status_por_dia: { sex: 'feita', seg: 'nao_feita' } }), 'feita');

// ── Quem entra ───────────────────────────────────────────────────────────
const semanaPassada = [
  { id: 1, descricao: 'Escavação sapatas', empreiteiro: 'Beta', ambiente: 'Obra', dias_semana: SEMANA, status_por_dia: { sex: 'em_andamento' } },
  { id: 2, descricao: 'Baia de aço',       empreiteiro: 'Alfa', ambiente: 'Canteiro', dias_semana: ['ter'], status_por_dia: { ter: 'feita' } },
  { id: 3, descricao: 'Armação sapatas',   empreiteiro: 'Alfa', ambiente: 'Obra', dias_semana: SEMANA, status_por_dia: { sex: 'nao_feita' } },
  { id: 4, descricao: 'Limpeza',           empreiteiro: 'Alfa', ambiente: 'Canteiro', dias_semana: SEMANA, status: 'pendente', status_por_dia: {} },
];
t('em andamento, não feita e pendente entram; concluída sai',
  descs(sugestoesDaSemana(semanaPassada)), ['Escavação sapatas', 'Armação sapatas', 'Limpeza']);

t('devolve o que a tela precisa para reaproveitar',
  sugestoesDaSemana([semanaPassada[0]]),
  [{ key: 1, desc: 'Escavação sapatas', empreiteiro: 'Beta', ambiente: 'Obra' }]);

// ── Repetição ────────────────────────────────────────────────────────────
// Uma frente lançada em dois RDOs da semana não pode virar duas sugestões.
const repetida = [
  { id: 10, descricao: 'Escavação sapatas', empreiteiro: 'Beta', ambiente: 'Obra', dias_semana: ['seg'], status: 'pendente' },
  { id: 11, descricao: '  escavação SAPATAS ', empreiteiro: 'Beta', ambiente: 'Obra', dias_semana: ['qua'], status: 'pendente' },
];
t('mesma frente escrita com outro caixa/espaço conta uma vez só',
  descs(sugestoesDaSemana(repetida)), ['Escavação sapatas']);

t('mesma descrição em empreiteira diferente são duas sugestões',
  descs(sugestoesDaSemana([
    { id: 20, descricao: 'Limpeza', empreiteiro: 'Alfa', ambiente: 'Obra', status: 'pendente' },
    { id: 21, descricao: 'Limpeza', empreiteiro: 'Geplan', ambiente: 'Obra', status: 'pendente' },
  ])), ['Limpeza', 'Limpeza']);

t('mesma descrição em ambiente diferente são duas sugestões',
  sugestoesDaSemana([
    { id: 30, descricao: 'Limpeza', empreiteiro: 'Alfa', ambiente: 'Obra', status: 'pendente' },
    { id: 31, descricao: 'Limpeza', empreiteiro: 'Alfa', ambiente: 'Canteiro', status: 'pendente' },
  ]).length, 2);

t('chave junta descrição, empreiteira e ambiente',
  chaveDeSugestao({ descricao: ' Limpeza ', empreiteiro: 'Alfa', ambiente: 'Obra' }), 'limpeza|Alfa|Obra');

t('lista vazia não quebra', sugestoesDaSemana(null), []);

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
