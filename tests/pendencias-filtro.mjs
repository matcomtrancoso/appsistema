/**
 * Filtro das pendências (tela e relatório usam o mesmo).
 * Não toca no banco. Rodar: node tests/pendencias-filtro.mjs
 */
import assert from 'assert';
import { filtrarPendencias, contarStatus, resumoPorEmpresa, descreverFiltro, ordenarPendencias }
  from '../src/lib/pendencias-filtro.js';

const lista = [
  { id: 1, empresa: 'Alfa', pavimento: 'Térreo',       status: 'aberta',       created_at: '2026-07-01T10:00:00Z' },
  { id: 2, empresa: 'Alfa', pavimento: '1º Pavimento', status: 'atrasada',     created_at: '2026-07-10T10:00:00Z' },
  { id: 3, empresa: 'Gama',   pavimento: 'Térreo',       status: 'em_andamento', created_at: '2026-07-15T10:00:00Z' },
  { id: 4, empresa: 'Alfa', pavimento: 'Térreo',       status: 'resolvida',    created_at: '2026-07-20T10:00:00Z' },
  { id: 5, empresa: '',          pavimento: '',             status: 'fechada',      created_at: '2026-06-01T10:00:00Z' },
];

const ids = (f) => filtrarPendencias(lista, f).map(p => p.id);

// Padrão: só as abertas (aberta + em andamento + atrasada).
assert.deepEqual(ids({}), [1, 2, 3]);
assert.deepEqual(ids({ status: 'todas' }), [1, 2, 3, 4, 5]);
assert.deepEqual(ids({ status: 'resolvidas' }), [4, 5]);
// Status específico, não o grupo.
assert.deepEqual(ids({ status: 'atrasada' }), [2]);
assert.deepEqual(ids({ status: 'aberta' }), [1]);

// Por fornecedor e por pavimento, combinando com o status.
assert.deepEqual(ids({ empresa: 'Alfa' }), [1, 2]);
assert.deepEqual(ids({ empresa: 'Alfa', status: 'todas' }), [1, 2, 4]);
assert.deepEqual(ids({ pavimento: 'Térreo', status: 'todas' }), [1, 3, 4]);
assert.deepEqual(ids({ empresa: 'Alfa', pavimento: 'Térreo', status: 'todas' }), [1, 4]);

// Período pela data da vistoria, com as pontas incluídas.
assert.deepEqual(ids({ status: 'todas', de: '2026-07-01', ate: '2026-07-10' }), [1, 2]);
assert.deepEqual(ids({ status: 'todas', de: '2026-07-15' }), [3, 4]);
assert.deepEqual(ids({ status: 'todas', ate: '2026-06-30' }), [5]);

// Sem data não entra em filtro por período — não pode virar "hoje" por engano.
assert.deepEqual(filtrarPendencias([{ status: 'aberta' }], { de: '2026-01-01' }), []);

// ── Contagem ────────────────────────────────────────────────────────────────
assert.deepEqual(contarStatus(lista), { total: 5, pendentes: 2, andamento: 1, resolvidas: 2 });
assert.deepEqual(contarStatus([]), { total: 0, pendentes: 0, andamento: 0, resolvidas: 0 });

// ── Resumo por empresa ──────────────────────────────────────────────────────
const resumo = resumoPorEmpresa(lista);
// Uma linha por empresa — o relatório antigo repetia a mesma duas vezes.
assert.equal(resumo.length, 3);
assert.deepEqual(resumo[0], { nome: 'Alfa', total: 3, pendentes: 2, andamento: 0, resolvidas: 1 });
// Quem não tem responsável continua na conta.
assert.ok(resumo.some(r => r.nome === 'Sem responsável' && r.total === 1));

// ── Descrição impressa no cabeçalho ─────────────────────────────────────────
assert.equal(descreverFiltro({}), 'Em aberto');
// 'todas' não é botão, mas ainda precisa sair escrito no cabeçalho do relatório.
assert.equal(
  descreverFiltro({ status: 'todas', empresa: 'Alfa', pavimento: 'Térreo', de: '2026-07-01', ate: '2026-07-31' }),
  'Todas · Alfa · Térreo · 2026-07-01 a 2026-07-31',
);
assert.equal(descreverFiltro({ de: '2026-07-01' }), 'Em aberto · a partir de 2026-07-01');

// ── Ordenação ───────────────────────────────────────────────────────────────
// Padrão: da mais antiga para a mais nova.
assert.deepEqual(ordenarPendencias(lista).map(p => p.id), [5, 1, 2, 3, 4]);
assert.deepEqual(ordenarPendencias(lista, []).map(p => p.id), [5, 1, 2, 3, 4]);

// Por fornecedor agrupa e mantém a data ordenando dentro do grupo.
// Sem empresa vai para o fim, não some.
assert.deepEqual(ordenarPendencias(lista, ['fornecedor']).map(p => p.id), [1, 2, 4, 3, 5]);

// Marcar os dois dá o mesmo que só fornecedor — a data nunca deixa de ordenar.
assert.deepEqual(
  ordenarPendencias(lista, ['fornecedor', 'data']).map(p => p.id),
  ordenarPendencias(lista, ['fornecedor']).map(p => p.id),
);

// Não altera a lista recebida.
const original = [...lista];
ordenarPendencias(lista, ['fornecedor']);
assert.deepEqual(lista, original);

console.log('✓ filtro de pendências OK');
