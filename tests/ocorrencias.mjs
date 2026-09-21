/**
 * Contagem de ocorrências (motivos de não execução) por período.
 * Não toca no banco. Rodar: node tests/ocorrencias.mjs
 */
import assert from 'assert';
import { ocorrenciaDeNaoExecucao, contarMotivos, ehNaoFeita, SEM_MOTIVO } from '../src/lib/ocorrencias.js';

// Não feita pelo status geral ou por qualquer dia do mapa.
assert.equal(ehNaoFeita({ status: 'nao_feita' }), true);
assert.equal(ehNaoFeita({ status: 'pendente', status_por_dia: { qua: 'nao_feita' } }), true);
assert.equal(ehNaoFeita({ status: 'pendente', status_por_dia: { qua: 'feita' } }), false);
assert.equal(ehNaoFeita({ status: 'feita' }), false);
assert.equal(ehNaoFeita({}), false);

const dados = [
  { data: '2026-07-27', status: 'nao_feita', motivo_nao_exec: 'm2' },
  { data: '2026-07-28', status: 'nao_feita', motivo_nao_exec: 'm2' },
  { data: '2026-07-29', status: 'nao_feita', motivo_nao_exec: 'm7' },
  { data: '2026-07-30', status: 'pendente', status_por_dia: { qui: 'nao_feita' }, motivo_nao_exec: 'm2' },
  { data: '2026-08-03', status: 'nao_feita', motivo_nao_exec: 'm9' },
  { data: '2026-07-28', status: 'feita', motivo_nao_exec: 'm2' },   // já foi feita: não conta
  { data: null,         status: 'nao_feita', motivo_nao_exec: 'm2' },// sem RDO: não conta
  { data: '2026-07-29', status: 'nao_feita' },                       // sem motivo
];

// Semana de 27/07 a 02/08.
const semana = contarMotivos(dados, '2026-07-27', '2026-08-02');
assert.equal(semana.total, 5);
assert.deepEqual(semana.linhas.map(l => [l.id, l.n]), [['m2', 3], [SEM_MOTIVO, 1], ['m7', 1]]);
assert.equal(semana.linhas[0].pct, 60);

// A de agosto fica de fora da semana e entra no mês seguinte.
assert.equal(contarMotivos(dados, '2026-08-01', '2026-08-31').total, 1);

// Sem intervalo = obra toda (as duas descartadas continuam fora).
assert.equal(contarMotivos(dados, null, null).total, 6);

// Período vazio não quebra a porcentagem.
assert.deepEqual(contarMotivos(dados, '2027-01-01', '2027-01-31'), { total: 0, linhas: [] });

// ── A frase que vai para o item 5 do Relatório Semanal ───────────────────
const oc = ocorrenciaDeNaoExecucao({ descricao: 'Armação sapatas', empreiteiro: 'Alfa' }, 'Falta de material', 'Aço só chega quinta');
assert.equal(oc.descricao, 'Armação sapatas não realizada — falta de material. Aço só chega quinta');
assert.equal(oc.empresa, 'Alfa');
assert.equal(oc.categoria, 'Serviço não realizado');

// Sem detalhe, a frase fecha limpa — sem ponto pendurado.
assert.equal(ocorrenciaDeNaoExecucao({ descricao: 'Limpeza' }, 'Chuva', '').descricao,
  'Limpeza não realizada — chuva');

// Sem empreiteira a coluna EMPRESA do relatório fica vazia, não "undefined".
assert.equal(ocorrenciaDeNaoExecucao({ descricao: 'Limpeza' }, 'Chuva', '').empresa, null);

// Detalhe com espaços em volta não gera frase torta.
assert.equal(ocorrenciaDeNaoExecucao({ descricao: 'X' }, 'Outro', '  faltou acesso  ').descricao,
  'X não realizada — outro. faltou acesso');

console.log('✓ contagem de ocorrências OK');
