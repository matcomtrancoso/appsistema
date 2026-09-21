import assert from 'node:assert';
import { somarDias, mapaSucessores, simularAtraso } from '../src/lib/projetos-simulacao.js';

const P = (id, nome, prev, status = 'nao_iniciado', resp = 'X') =>
  ({ id, nome, data_prevista: prev, status, responsavel_nome: resp });
const dep = (filho, pai) => ({ projeto_id: filho, depende_de_id: pai });

// somarDias não escorrega no fuso (o bug que já apareceu no app)
assert.equal(somarDias('2026-07-31', 1), '2026-08-01');
assert.equal(somarDias('2026-12-31', 1), '2027-01-01');
assert.equal(somarDias('2026-02-28', 1), '2026-03-01'); // 2026 não é bissexto
assert.equal(somarDias(null, 5), null);

assert.deepEqual(mapaSucessores([dep('b', 'a'), dep('c', 'a')]), { a: ['b', 'c'] });
assert.deepEqual(mapaSucessores(null), {});

// Cadeia simples: a → b → c. Atrasar 'a' empurra os dois.
{
  const projetos = [P('a', 'A', '2026-08-01'), P('b', 'B', '2026-08-10'), P('c', 'C', '2026-08-20')];
  const deps = [dep('b', 'a'), dep('c', 'b')];
  const r = simularAtraso(projetos, deps, 'a', 10);
  assert.equal(r.raiz.para, '2026-08-11');
  assert.equal(r.afetados.length, 2);
  assert.deepEqual(r.afetados.map(x => [x.id, x.nivel, x.para]),
    [['b', 1, '2026-08-20'], ['c', 2, '2026-08-30']]);
}

// Quem já foi recebido não escorrega — já aconteceu.
{
  const projetos = [P('a', 'A', '2026-08-01'), P('b', 'B', '2026-08-10', 'recebido')];
  const r = simularAtraso(projetos, [dep('b', 'a')], 'a', 5);
  assert.equal(r.afetados.length, 0);
}

// Item sem data prevista entra na lista marcado, não some.
{
  const projetos = [P('a', 'A', '2026-08-01'), P('b', 'B', null)];
  const r = simularAtraso(projetos, [dep('b', 'a')], 'a', 5);
  assert.equal(r.afetados.length, 1);
  assert.equal(r.afetados[0].semPrazo, true);
  assert.equal(r.afetados[0].para, null);
}

// Diamante: d depende de b e c, ambos de a. Nível é a distância MENOR (2), e d
// aparece uma vez só — não duplica por ter dois caminhos.
{
  const projetos = ['a', 'b', 'c', 'd'].map((k, i) => P(k, k.toUpperCase(), '2026-08-0' + (i + 1)));
  const deps = [dep('b', 'a'), dep('c', 'a'), dep('d', 'b'), dep('d', 'c')];
  const r = simularAtraso(projetos, deps, 'a', 3);
  assert.equal(r.afetados.length, 3);
  assert.equal(r.afetados.filter(x => x.id === 'd').length, 1);
  assert.equal(r.afetados.find(x => x.id === 'd').nivel, 2);
}

// Ciclo não trava o cálculo.
{
  const projetos = [P('a', 'A', '2026-08-01'), P('b', 'B', '2026-08-05')];
  const r = simularAtraso(projetos, [dep('b', 'a'), dep('a', 'b')], 'a', 2);
  assert.equal(r.afetados.length, 1);
}

// Sem atraso, sem afetados.
assert.deepEqual(simularAtraso([P('a', 'A', '2026-08-01')], [], 'a', 0).afetados, []);
assert.deepEqual(simularAtraso([], [], 'x', 5).afetados, []);

console.log('projetos-simulacao: ok');
