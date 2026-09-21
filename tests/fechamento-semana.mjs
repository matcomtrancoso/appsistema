/**
 * Fechamento da semana: status consolidado e regra das contratações.
 * Não toca no banco. Rodar: node tests/fechamento-semana.mjs
 */
import assert from 'assert';
import { statusDaSemana, contratacoesDaSemana, indicadores, paraTSV, C, I, N }
  from '../src/lib/fechamento-semana.js';

// ── Status consolidado da atividade na semana ───────────────────────────────
assert.equal(statusDaSemana({ status: 'feita' }), C);
assert.equal(statusDaSemana({ status: 'em_andamento' }), I);
assert.equal(statusDaSemana({ status: 'pendente' }), N);
assert.equal(statusDaSemana({ status: 'nao_feita' }), N);
assert.equal(statusDaSemana({}), N);

// Com dias: só é C quando nenhum dia ficou para trás.
assert.equal(statusDaSemana({ status_por_dia: { seg: 'feita', ter: 'feita' } }), C);
assert.equal(statusDaSemana({ status_por_dia: { seg: 'feita', ter: 'pendente' } }), I);
assert.equal(statusDaSemana({ status_por_dia: { seg: 'feita', ter: 'nao_feita' } }), I);
assert.equal(statusDaSemana({ status_por_dia: { seg: 'pendente', ter: 'nao_feita' } }), N);
// O mapa manda sobre o status geral.
assert.equal(statusDaSemana({ status: 'feita', status_por_dia: { seg: 'pendente' } }), N);

// O caso que quebrava o PPC: atividade de seg a sex marcada dia a dia pelo chip
// dos cards. O status geral fica em 'pendente' e o que vale está no mapa.
assert.equal(statusDaSemana({
  status: 'pendente',
  status_por_dia: { seg: 'feita', ter: 'feita', qua: 'feita', qui: 'feita', sex: 'feita' },
}), C);

// ── Contratações da semana (22/06 a 26/06) ──────────────────────────────────
const DE = '2026-06-22', ATE = '2026-06-26';
const lista = [
  // aprovada nesta semana → C
  { id: 1, descricao: 'Esquadrias', responsavel_nome: 'Arthur', fornecedor_nome: 'ALUFORT',
    prazo_envio: '2026-06-01', data_envio: '2026-06-05', data_aprovacao: '2026-06-24' },
  // enviada nesta semana, ainda sem aprovação → I
  { id: 2, descricao: 'Impermeabilização', responsavel_nome: 'Arthur',
    prazo_envio: '2026-06-22', data_envio: '2026-06-23', data_aprovacao: null },
  // deveria ter sido enviada nesta semana e não foi → N
  { id: 3, descricao: 'Piso laminado', responsavel_nome: 'Marina',
    prazo_envio: '2026-06-25', data_envio: null, data_aprovacao: null },
  // prazo em outra semana e ainda não cotada → fora
  { id: 4, descricao: 'Louças', responsavel_nome: 'Arthur',
    prazo_envio: '2026-08-10', data_envio: null, data_aprovacao: null },
  // enviada e aprovada em semanas anteriores → fora
  { id: 5, descricao: 'Estrutura', responsavel_nome: 'Arthur', fornecedor_nome: 'X',
    prazo_envio: '2026-05-01', data_envio: '2026-05-04', data_aprovacao: '2026-05-20' },
  // atrasada de semana anterior: o prazo não é desta semana → fora
  { id: 6, descricao: 'Marcenaria', responsavel_nome: 'Arthur',
    prazo_envio: '2026-06-10', data_envio: null, data_aprovacao: null },
];

const linhas = contratacoesDaSemana(lista, DE, ATE);
assert.deepEqual(linhas.map(l => [l.id, l.status]), [[1, C], [2, I], [3, N]]);
// Aprovada mostra o fornecedor; as outras, o responsável.
assert.equal(linhas[0].responsavel, 'ALUFORT');
assert.equal(linhas[1].responsavel, 'Arthur');

// Enviada dentro da semana em que também vencia o prazo conta como enviada.
assert.equal(contratacoesDaSemana([lista[1]], DE, ATE)[0].status, I);

// ── Indicadores ─────────────────────────────────────────────────────────────
assert.deepEqual(indicadores(linhas), { total: 3, C: 1, I: 1, N: 1, pctC: 33, pctI: 33, pctN: 33 });
assert.deepEqual(indicadores([]), { total: 0, C: 0, I: 0, N: 0, pctC: 0, pctI: 0, pctN: 0 });

// ── TSV para colar de volta no Excel ────────────────────────────────────────
const tsv = paraTSV(linhas, ['descricao', 'responsavel', 'status']);
assert.equal(tsv.split('\n').length, 3);
assert.equal(tsv.split('\n')[0], 'Esquadrias\tALUFORT\tC');
// Quebra de linha na descrição não pode virar linha nova na colagem.
assert.equal(paraTSV([{ a: 'x\ny' }], ['a']), 'x y');

console.log('✓ fechamento da semana OK');
