// O recorte do diário por dia. Os casos saem de dados reais da obra:
// a semana de 24/08/2026 (segunda) planejada no RDO da própria segunda, e a
// semana anterior (17/08) que a busca de 14 dias arrastava junto.
import { atividadesDoDia, agruparPorAmbiente, semanaDe, chaveDoDia, mesclarStatusDerivado, SEM_AMBIENTE } from '../src/lib/atividades-do-dia.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome + (bate ? '' : '\n       obtido:   ' + JSON.stringify(real) + '\n       esperado: ' + JSON.stringify(esperado)));
};

// ── Semana e dia ─────────────────────────────────────────────────────────
t('segunda-feira é o começo da própria semana', semanaDe('2026-08-24'), { segunda: '2026-08-24', domingo: '2026-08-30' });
t('quinta cai na semana da segunda anterior',   semanaDe('2026-08-27'), { segunda: '2026-08-24', domingo: '2026-08-30' });
t('domingo fecha a semana, não abre a próxima', semanaDe('2026-08-30'), { segunda: '2026-08-24', domingo: '2026-08-30' });
t('chave do dia', [chaveDoDia('2026-08-24'), chaveDoDia('2026-08-28')], ['seg', 'sex']);

// ── Recorte do dia ───────────────────────────────────────────────────────
const RDO_SEG = 'rdo-24', RDO_SEG_ANTES = 'rdo-17', RDO_QUI = 'rdo-27';
const dataDoRdo = (id) => ({ [RDO_SEG]: '2026-08-24', [RDO_SEG_ANTES]: '2026-08-17', [RDO_QUI]: '2026-08-27' }[id] || null);

const semana = [
  { id: 1, descricao: 'Escavação sapatas (parte 1)', rdo_id: RDO_SEG, dias_semana: ['seg', 'ter', 'qua', 'qui', 'sex'], ambiente: 'Obra' },
  { id: 2, descricao: 'Instalação de refletores',    rdo_id: RDO_SEG, dias_semana: ['ter', 'qua', 'qui'],               ambiente: 'Canteiro' },
  { id: 3, descricao: 'Marcar eixos do gabarito',    rdo_id: RDO_SEG, dias_semana: ['seg'],                             ambiente: 'Obra' },
];
const nomes = (l) => l.map(a => a.descricao);

t('segunda mostra só o que é de segunda, não a semana toda',
  nomes(atividadesDoDia(semana, '2026-08-24', dataDoRdo)),
  ['Escavação sapatas (parte 1)', 'Marcar eixos do gabarito']);

t('terça troca o recorte',
  nomes(atividadesDoDia(semana, '2026-08-25', dataDoRdo)),
  ['Escavação sapatas (parte 1)', 'Instalação de refletores']);

t('sábado sem nada planejado fica vazio',
  nomes(atividadesDoDia(semana, '2026-08-29', dataDoRdo)), []);

// O plano da semana passada tem 'seg' marcado igual ao desta. Só não pode
// aparecer porque não está na semana da data — quem garante isso é a consulta,
// mas se um resquício escapar o recorte por dia sozinho NÃO o barra.
t('plano da semana anterior também casa por dia (por isso a janela é a semana)',
  nomes(atividadesDoDia([{ id: 9, descricao: 'Limpeza e organização', rdo_id: RDO_SEG_ANTES, dias_semana: ['seg'], ambiente: 'Canteiro' }], '2026-08-24', dataDoRdo)),
  ['Limpeza e organização']);

// ── Avulsas: sem dias_semana, valem só no dia em que foram lançadas ───────
const avulsa = { id: 4, descricao: 'Troca do cerquite', rdo_id: RDO_QUI, dias_semana: [], ambiente: null };
t('avulsa aparece no dia dela',        nomes(atividadesDoDia([avulsa], '2026-08-27', dataDoRdo)), ['Troca do cerquite']);
t('avulsa não vaza para o dia seguinte', nomes(atividadesDoDia([avulsa], '2026-08-28', dataDoRdo)), []);
t('dias_semana ausente é tratado como avulsa',
  nomes(atividadesDoDia([{ id: 5, descricao: 'Sem campo', rdo_id: RDO_QUI, ambiente: null }], '2026-08-27', dataDoRdo)), ['Sem campo']);

// Serviço concluído continua no dia: é ali que o mestre marcou que concluiu.
t('concluída não some do próprio dia',
  nomes(atividadesDoDia([{ id: 6, descricao: 'Baia de aço', rdo_id: RDO_SEG, dias_semana: ['seg'], status: 'feita', status_por_dia: { seg: 'feita' } }], '2026-08-24', dataDoRdo)),
  ['Baia de aço']);

// ── Agrupamento por ambiente ─────────────────────────────────────────────
const pav = { Obra: 'Subsolo', Canteiro: 'Térreo' };
const grupos = agruparPorAmbiente([...semana, avulsa], (n) => pav[n] || '');
// Ordena por pavimento antes do nome: Obra fica no Subsolo, Canteiro no Térreo.
t('agrupa por ambiente na ordem do pavimento, sem ambiente por último',
  grupos.map(g => [g.ambiente, g.itens.length]),
  [['Obra', 2], ['Canteiro', 1], [SEM_AMBIENTE, 1]]);
t('grupo sem ambiente não inventa pavimento',
  grupos[grupos.length - 1].pavimento, '');
t('ambiente vazio conta como sem ambiente',
  agruparPorAmbiente([{ id: 7, ambiente: '   ' }]).map(g => g.ambiente), [SEM_AMBIENTE]);

// ── Status derivado do efetivo ───────────────────────────────────────────
// O caso real: "Escavação sapatas (parte 1)", planejada seg-sex no RDO da
// segunda. Na terça o mestre aponta a equipe, o status vira "em andamento" —
// e quarta, quinta e sexta apareciam "em andamento" junto, sem ninguém ter
// tocado nelas.
const semanal = { dias_semana: ['seg', 'ter', 'qua', 'qui', 'sex'], status: 'pendente', status_por_dia: { seg: 'em_andamento' } };
const r1 = mesclarStatusDerivado(semanal, { doProprioDia: null, deHoje: 'em_andamento', diaDoRdo: 'seg', diaDeHoje: 'ter' });
t('derivado de hoje entra no dia de hoje', r1.status_por_dia, { seg: 'em_andamento', ter: 'em_andamento' });
t('derivado NAO vaza para o status liso (quarta segue pendente)', r1.status, 'pendente');

t('derivado do proprio RDO cai no dia daquele RDO',
  mesclarStatusDerivado({ dias_semana: ['seg', 'ter'], status: 'pendente', status_por_dia: {} },
    { doProprioDia: 'em_andamento', deHoje: null, diaDoRdo: 'seg', diaDeHoje: 'ter' }).status_por_dia,
  { seg: 'em_andamento' });

t('o que a pessoa gravou a mao ganha do derivado',
  mesclarStatusDerivado({ dias_semana: ['seg', 'ter'], status: 'pendente', status_por_dia: { ter: 'nao_feita' } },
    { doProprioDia: null, deHoje: 'em_andamento', diaDoRdo: 'seg', diaDeHoje: 'ter' }).status_por_dia,
  { ter: 'nao_feita' });

t('sem derivado nenhum, devolve a atividade intacta',
  mesclarStatusDerivado(semanal, { doProprioDia: null, deHoje: null }), semanal);

// Atividade de um dia só não tem mapa: nela o status liso É o status do dia.
t('atividade avulsa usa o status liso',
  mesclarStatusDerivado({ dias_semana: [], status: 'pendente' },
    { doProprioDia: 'em_andamento', deHoje: null, diaDoRdo: 'ter', diaDeHoje: 'ter' }),
  { dias_semana: [], status: 'em_andamento' });

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
