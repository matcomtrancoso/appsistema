// Lote da marcação na planta: identidade (BT x NF), cor e resumo.
import {
  normalizarLote, chaveDoLote, rotuloDoLote, lotesDoDia, coresDeLote,
  resumoDeLotes, resumoDeLotesPeriodo, CORES_LOTE,
} from '../src/lib/lotes-planta.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome + (bate ? '' : '\n       obtido:   ' + JSON.stringify(real) + '\n       esperado: ' + JSON.stringify(esperado)));
};

// ── Normalização ─────────────────────────────────────────────────────────
t('placa escrita de qualquer jeito vira uma só', normalizarLote('bt 1111'), 'BT1111');
t('traço e ponto somem', normalizarLote('BT-1111.'), 'BT1111');
t('vazio é null, não string vazia', normalizarLote('   '), null);

// ── Identidade: a NF manda quando existe ─────────────────────────────────
// A MESMA placa volta da usina: duas viagens, um BT. Sem a NF, as duas
// viagens virariam um lote só — que é o problema que a NF resolve.
const v1 = { lote: 'BT1111', nota: '4521' };
const v2 = { lote: 'BT1111', nota: '4522' };
t('mesma placa, notas diferentes = viagens diferentes',
  chaveDoLote(v1) === chaveDoLote(v2), false);
t('a chave é a nota quando existe', chaveDoLote(v1), '4521');
t('sem nota, a placa continua valendo', chaveDoLote({ lote: 'BT1111' }), 'BT1111');
t('sem nada, não há lote', chaveDoLote({}), null);

t('rótulo junta placa e nota', rotuloDoLote('BT1111', '4521'), 'BT1111 · NF 4521');
t('só placa', rotuloDoLote('BT1111', null), 'BT1111');
t('só nota', rotuloDoLote('', '4521'), 'NF 4521');

// ── Lotes do dia ─────────────────────────────────────────────────────────
const marcas = [
  { id: 1, data: '2026-09-02', etapa: 'Concretado', lote: 'BT1111', nota: '4521', rotulo: 'P12', quantidade: 8 },
  { id: 2, data: '2026-09-02', etapa: 'Concretado', lote: 'BT2222', nota: '4530', rotulo: 'P13', quantidade: 8 },
  { id: 3, data: '2026-09-02', etapa: 'Concretado', lote: 'BT1111', nota: '4599', rotulo: 'P14', quantidade: 7 },
  { id: 4, data: '2026-09-02', etapa: 'Concretado', rotulo: 'P15' },              // sem lote
  { id: 5, data: '2026-09-03', etapa: 'Concretado', lote: 'BT3333', rotulo: 'P16' },
];

t('a ordem é a de chegada, não alfabética',
  lotesDoDia(marcas, '2026-09-02').map(l => l.chave), ['4521', '4530', '4599']);
t('a volta da mesma placa é um lote à parte',
  lotesDoDia(marcas, '2026-09-02').map(l => l.rotulo),
  ['BT1111 · NF 4521', 'BT2222 · NF 4530', 'BT1111 · NF 4599']);
t('marcação sem lote não entra', lotesDoDia(marcas, '2026-09-02').length, 3);
t('outro dia, outros lotes', lotesDoDia(marcas, '2026-09-03').map(l => l.rotulo), ['BT3333']);

// ── Cores ────────────────────────────────────────────────────────────────
const cores = coresDeLote(lotesDoDia(marcas, '2026-09-02'));
t('primeiro a chegar, primeira cor', cores.get('4521'), CORES_LOTE[0]);
t('as duas viagens da mesma placa têm cores diferentes',
  cores.get('4521') === cores.get('4599'), false);

// Cor escolhida à mão ganha da paleta.
const comCor = [{ data: 'd', lote: 'BT9', nota: null, lote_cor: '#123456' }];
t('cor manual manda', coresDeLote(lotesDoDia(comCor, 'd')).get('BT9'), '#123456');
// A última gravada vence: é a que a pessoa acabou de escolher para o lote.
const duas = [
  { data: 'd', lote: 'BT9', lote_cor: '#111111' },
  { data: 'd', lote: 'BT9', lote_cor: '#222222' },
];
t('a última cor gravada vale para o lote', coresDeLote(lotesDoDia(duas, 'd')).get('BT9'), '#222222');

// ── Resumo: o que cada viagem fez ────────────────────────────────────────
const r = resumoDeLotes(marcas, '2026-09-02');
t('soma o volume da viagem', r[0].quantidade, 8);
t('conta as peças', r[0].pecas, 1);
t('lista as peças pelo nome', r.map(x => x.nomes), [['P12'], ['P13'], ['P14']]);
t('guarda em que etapa entrou', r[0].etapas, ['Concretado']);

// Peça sem nome não quebra a lista.
t('peça sem nome não vira buraco na lista',
  resumoDeLotes([{ data: 'd', lote: 'BT1', quantidade: 3 }], 'd')[0].nomes, []);

// ── Resumo do período ────────────────────────────────────────────────────
const per = resumoDeLotesPeriodo(marcas, '2026-09-01', '2026-09-30');
t('período traz todas as viagens, por dia', per.map(x => x.data + '/' + x.rotulo),
  ['2026-09-02/BT1111 · NF 4521', '2026-09-02/BT2222 · NF 4530', '2026-09-02/BT1111 · NF 4599', '2026-09-03/BT3333']);
t('fora do período não entra', resumoDeLotesPeriodo(marcas, '2026-09-03', '2026-09-30').length, 1);
t('lista vazia não quebra', resumoDeLotesPeriodo(null, null, null), []);

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
