import assert from 'node:assert';
import { intervalo, rotuloPeriodo, dataDoPeriodo, filtrarPorPeriodo } from '../src/lib/periodo-projetos.js';

// 28/07/2026 é uma terça-feira → semana de 27/07 (seg) a 02/08 (dom)
const HOJE = '2026-07-28';

assert.deepEqual(intervalo('semana', 0, HOJE), { de: '2026-07-27', ate: '2026-08-02' });
assert.deepEqual(intervalo('semana', -1, HOJE), { de: '2026-07-20', ate: '2026-07-26' });
assert.deepEqual(intervalo('semana', 1, HOJE), { de: '2026-08-03', ate: '2026-08-09' });
assert.deepEqual(intervalo('mes', 0, HOJE), { de: '2026-07-01', ate: '2026-07-31' });
assert.deepEqual(intervalo('mes', -1, HOJE), { de: '2026-06-01', ate: '2026-06-30' });
assert.deepEqual(intervalo('mes', 1, HOJE), { de: '2026-08-01', ate: '2026-08-31' });
assert.deepEqual(intervalo('tudo', 0, HOJE), { de: null, ate: null });

// Segunda-feira é o primeiro dia da própria semana, não da anterior.
assert.deepEqual(intervalo('semana', 0, '2026-07-27').de, '2026-07-27');
// Domingo fecha a semana que começou na segunda.
assert.deepEqual(intervalo('semana', 0, '2026-08-02'), { de: '2026-07-27', ate: '2026-08-02' });
// Virada de ano
assert.deepEqual(intervalo('mes', 1, '2026-12-15'), { de: '2027-01-01', ate: '2027-01-31' });
// Fevereiro de ano não bissexto
assert.equal(intervalo('mes', 0, '2026-02-10').ate, '2026-02-28');

assert.match(rotuloPeriodo('semana', 0, HOJE), /Esta semana/);
assert.match(rotuloPeriodo('semana', -1, HOJE), /Semana passada/);
assert.equal(rotuloPeriodo('tudo', 0, HOJE), 'Todos os períodos');
assert.match(rotuloPeriodo('mes', 0, HOJE), /jul\/26/);

// A data que vale muda conforme o status
assert.equal(dataDoPeriodo({ status: 'recebido', data_recebida: '2026-07-14', data_prevista: '2026-06-25' }), '2026-07-14');
assert.equal(dataDoPeriodo({ status: 'em_andamento', data_prevista: '2026-07-31', data_inicio: '2026-07-08' }), '2026-07-31');
assert.equal(dataDoPeriodo({ status: 'nao_iniciado', data_inicio: '2026-08-10', data_prevista: '2026-09-04' }), '2026-08-10');
// Não iniciado sem início cai na prevista em vez de sumir
assert.equal(dataDoPeriodo({ status: 'nao_iniciado', data_prevista: '2026-09-04' }), '2026-09-04');
assert.equal(dataDoPeriodo({ status: 'nao_iniciado' }), null);
assert.equal(dataDoPeriodo(null), null);

{
  const ps = [
    { id: 'a', status: 'recebido',     data_recebida: '2026-07-14' },       // mês atual
    { id: 'b', status: 'em_andamento', data_prevista: '2026-07-31' },       // mês atual e semana atual
    { id: 'c', status: 'nao_iniciado', data_inicio: '2026-09-14' },         // fora
    { id: 'd', status: 'nao_iniciado' },                                     // sem data
  ];
  const mes = filtrarPorPeriodo(ps, 'mes', 0, HOJE);
  assert.deepEqual(mes.dentro.map(p => p.id), ['a', 'b']);
  assert.deepEqual(mes.semData.map(p => p.id), ['d']);

  const semana = filtrarPorPeriodo(ps, 'semana', 0, HOJE);
  assert.deepEqual(semana.dentro.map(p => p.id), ['b']);

  // "Tudo" não esconde nem separa nada
  const tudo = filtrarPorPeriodo(ps, 'tudo', 0, HOJE);
  assert.equal(tudo.dentro.length, 4);
  assert.equal(tudo.semData.length, 0);
}

assert.deepEqual(filtrarPorPeriodo(null, 'mes', 0, HOJE), { dentro: [], semData: [] });

console.log('periodo-projetos: ok');
