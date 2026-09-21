// node tests/moeda.mjs
import assert from 'node:assert';
import { fmtV, parseV, fmtCur } from '../src/lib/moeda.js';

// Atenção: toLocaleString em BRL separa "R$" do número com espaço NÃO quebrável
// (U+00A0), não com espaço comum. Comparar com ' ' aqui falha sem explicar por quê.
const NB = ' ';

// Máscara: dígitos entram pela direita
assert.strictEqual(fmtV(''), '');
assert.strictEqual(fmtV('abc'), '');
assert.strictEqual(fmtV('1250'), `R$${NB}12,50`);
assert.strictEqual(fmtV(`R$${NB}12,50` + '0'), `R$${NB}125,00`); // continuar digitando empurra

assert.strictEqual(parseV(''), null);
assert.strictEqual(parseV(`R$${NB}1.250,50`), 1250.5);

// Ida e volta: é assim que o popup de contratação abre um valor já gravado
// (fmtCur para preencher o campo) e grava de novo (parseV). Se este par
// divergir, editar a contratação sem mexer no valor muda o valor.
for (const n of [0.01, 12.5, 1250.5, 987654.32]) {
  assert.strictEqual(parseV(fmtCur(n)), n, `round-trip quebrou em ${n}`);
}
assert.strictEqual(fmtCur(null), '');

console.log('✓ moeda: máscara e ida-e-volta ok');
