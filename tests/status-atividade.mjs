/**
 * Regras de status da atividade (ciclo do chip + "não feita" pelo ✕ do card).
 * Não toca no banco. Rodar: node tests/status-atividade.mjs
 */
import assert from 'assert';
import { patchDeStatus, proximoStatus, CICLO_STATUS, ACOES_CONCLUIDA, patchStatusDoDia } from '../src/lib/status-atividade.js';

// ── RDO de um dia não pode carimbar a semana toda ──────────────────────────
// Atividade planejada na semana (dias_semana) grava só no dia, em status_por_dia.
assert.deepEqual(
  patchStatusDoDia({ dias_semana: ['qua', 'qui', 'sex'], status_por_dia: { qua: 'feita' } }, 'em_andamento', 'qui'),
  { status_por_dia: { qua: 'feita', qui: 'em_andamento' } },
);
// Não mexe no status liso nem nos outros dias.
assert.equal(patchStatusDoDia({ dias_semana: ['qui'] }, 'em_andamento', 'qui').status, undefined);
// Atividade de um dia só (sem dias_semana) continua no status liso.
assert.deepEqual(patchStatusDoDia({ dias_semana: [] }, 'feita', 'qui'), { status: 'feita' });
assert.deepEqual(patchStatusDoDia({}, 'feita', 'qui'), { status: 'feita' });
// Sem dayKey, cai no status liso mesmo sendo multi-dia (defensivo).
assert.deepEqual(patchStatusDoDia({ dias_semana: ['qui'] }, 'feita', null), { status: 'feita' });

// ── Ciclo do chip por toque ────────────────────────────────────────────────
// Toque avança: Não iniciou → Em andamento → Concluído.
assert.equal(proximoStatus('nao_iniciou').status, 'em_andamento');
assert.equal(proximoStatus('em_andamento').status, 'concluida');
// No Concluído o toque não segue o ciclo: pede confirmação (abre o popup).
assert.deepEqual(proximoStatus('concluida'), { pedirConfirmacao: true });
assert.equal(proximoStatus('concluida').status, undefined);
// Status desconhecido ou vazio recomeça o ciclo de forma segura.
assert.equal(proximoStatus(undefined).status, 'em_andamento');
assert.equal(proximoStatus('ocorrencia').status, 'em_andamento');
// O ciclo tem exatamente os três passos, nessa ordem.
assert.deepEqual(CICLO_STATUS, ['nao_iniciou', 'em_andamento', 'concluida']);
// Ações do popup mapeiam para os status certos (reiniciar volta pro começo).
assert.equal(ACOES_CONCLUIDA.voltar, 'em_andamento');
assert.equal(ACOES_CONCLUIDA.reiniciar, 'nao_iniciou');

const HOJE = '2026-07-27';
const p = (status, extra) => patchDeStatus(status, { hoje: HOJE, ...extra });

// Sem dias_semana grava em status; com dayKey grava no mapa por dia, preservando os outros dias.
assert.equal(p('em_andamento').status, 'em_andamento');
assert.deepEqual(
  p('feita', { dayKey: 'qua', statusPorDia: { seg: 'feita' }, dataInicioAtual: HOJE }).status_por_dia,
  { seg: 'feita', qua: 'feita' },
);
assert.equal(p('feita', { dayKey: 'qua' }).status, undefined);

// Iniciar marca início e apaga a conclusão — é o "voltar um atrás" de uma concluída.
assert.deepEqual(
  { i: p('em_andamento').data_inicio, c: p('em_andamento').data_conclusao },
  { i: HOJE, c: null },
);

// Concluir só inventa o início quando não existe.
assert.equal(p('feita', { dataInicioAtual: '2026-07-20' }).data_inicio, undefined);
assert.equal(p('feita', { dataInicioAtual: null }).data_inicio, HOJE);
assert.equal(p('feita', { dataInicioAtual: null }).data_conclusao, HOJE);

// Reiniciar zera as duas datas.
assert.deepEqual(
  { i: p('pendente').data_inicio, c: p('pendente').data_conclusao },
  { i: null, c: null },
);

// Motivo só vive enquanto está "não feita".
assert.equal(p('nao_feita', { motivo: 'm2' }).motivo_nao_exec, 'm2');
assert.equal(p('nao_feita').motivo_nao_exec, null);
assert.equal(p('em_andamento', { motivo: 'm2' }).motivo_nao_exec, null);
assert.equal(p('pendente', { motivo: 'm2' }).motivo_nao_exec, null);

console.log('✓ regras de status da atividade OK');
