/**
 * Leitura do Planejamento Semanal colado do Excel.
 * Não toca no banco. Rodar: node tests/planilha-semanal.mjs
 */
import assert from 'assert';
import { parsePlanilhaSemanal, normalizar } from '../src/lib/planilha-semanal.js';

assert.equal(normalizar('  AÇÃO   Térreo '), 'acao terreo');
assert.equal(normalizar('ALFA'), 'alfa');
assert.equal(normalizar(null), '');

// Colagem real: título de seção, cabeçalho com a lacuna da célula mesclada
// (ATIVIDADE ocupa D:E) e as linhas de dados.
const colado = [
  'CANTEIRO DE OBRA\t\t\t\t\t\t\t\t\t\t\t\tATIVIDADES PROGRAMADAS',
  '#\tITEM\tFORNECEDOR\tATIVIDADE\t\tAMBIENTE\tSTATUS\tEFETIVO\tOBSERVAÇÃO',
  '1\t1\tALFA\tLimpeza e organização da obra\t\tCANTEIRO\tC\t1\t',
  '1\t2\tALFA\tDrenagem das escavações\t\tPARTE 01 E 03\tI\t1\t',
  '\t\t\t\t\t\t\t\t',
  'ATIVIDADES DA ENGENHARIA\t\t\t\t\t\t\t\t\t\t\t\tATIVIDADES PROGRAMADAS',
  '#\tITEM\tRESPONSÁVEL\tATIVIDADE\t\t\tSTATUS\tOBSERVAÇÃO\t\tDATA',
  '\t\t\tROTINAS ADMINISTRATIVAS',
  '1\t1\tMarina\tPlanejamento semanal\t\t\tC\t\t\tquinta-feira',
].join('\n');

const itens = parsePlanilhaSemanal(colado);

// 4 atividades: 2 do canteiro, 1 subtítulo de grupo e 1 da engenharia.
// O subtítulo "ROTINAS ADMINISTRATIVAS" cai na coluna da atividade, então entra
// como linha — é o preço de não manter lista de exceções, e o usuário apaga.
assert.equal(itens.length, 4);

assert.deepEqual(itens[0], {
  atividade: 'Limpeza e organização da obra',
  fornecedor: 'ALFA',
  ambiente: 'CANTEIRO',
});
assert.deepEqual(itens[1], {
  atividade: 'Drenagem das escavações',
  fornecedor: 'ALFA',
  ambiente: 'PARTE 01 E 03',
});

// A segunda seção troca FORNECEDOR por RESPONSÁVEL e não tem AMBIENTE:
// o mapa de colunas tem que ter sido refeito.
assert.deepEqual(itens[3], {
  atividade: 'Planejamento semanal',
  fornecedor: 'Marina',
  ambiente: '',
});

// Sem cabeçalho não inventa nada.
assert.deepEqual(parsePlanilhaSemanal('1\tALFA\tFazer alguma coisa'), []);
assert.deepEqual(parsePlanilhaSemanal(''), []);
assert.deepEqual(parsePlanilhaSemanal(null), []);

console.log('✓ leitura da planilha semanal OK');

// ── Caminho de volta: app → planilha ────────────────────────────────────────
{
  const { paraPlanilhaSemanal } = await import('../src/lib/planilha-semanal.js');

  const tsv = paraPlanilhaSemanal([
    { descricao: 'Gabarito do subsolo', empreiteiro: 'ALFA', ambiente: 'Subsolo', dias_semana: ['seg','ter','qua'] },
    { descricao: 'Ajuste de talude',    empreiteiro: 'BETA',   ambiente: '',        dias_semana: ['qui'] },
    { descricao: '  ',                  empreiteiro: 'X' },                       // vazia some
    null,
  ]);
  const linhas = tsv.split('\n');
  assert.equal(linhas[0], 'FORNECEDOR\tATIVIDADE\tAMBIENTE\tDIAS');
  assert.equal(linhas.length, 3, 'cabecalho + 2 atividades');
  assert.equal(linhas[1], 'ALFA\tGabarito do subsolo\tSubsolo\tseg, ter, qua');
  assert.equal(linhas[2], 'BETA\tAjuste de talude\t\tqui');

  // Os dias saem na ordem da semana, não na ordem em que foram marcados
  const t2 = paraPlanilhaSemanal([{ descricao: 'X', dias_semana: ['sex','seg','qua'] }]);
  assert.match(t2.split('\n')[1], /seg, qua, sex$/);

  // Tabulação e quebra de linha no texto não podem estourar a colagem
  const t3 = paraPlanilhaSemanal([{ descricao: 'A\tB\nC', empreiteiro: 'E' }]);
  assert.equal(t3.split('\n').length, 2);
  assert.match(t3, /A B C/);

  // O que sai daqui volta a ser lido pelo parser
  const volta = parsePlanilhaSemanal(tsv);
  assert.equal(volta.length, 2);
  assert.equal(volta[0].atividade, 'Gabarito do subsolo');
  assert.equal(volta[0].fornecedor, 'ALFA');
  assert.equal(volta[0].ambiente, 'Subsolo');

  assert.equal(paraPlanilhaSemanal(null).split('\n').length, 1);   // só o cabeçalho
}

console.log('✓ ida e volta da planilha semanal OK');
