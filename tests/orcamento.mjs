import { valorItem, totalOrcamento, saldoOrcamento } from '../src/lib/orcamento.js';

let ok = 0, tot = 0;
function t(nome, cond) {
  tot++;
  if (cond) { ok++; } else { console.error('FALHOU:', nome); }
}

t('valorItem multiplica quantidade por preço', valorItem({ quantidade: 10, preco_unitario: 2.5 }) === 25);
t('valorItem sem quantidade/preço conta como zero', valorItem({}) === 0);
t('valorItem com texto em vez de número não vira NaN', valorItem({ quantidade: 'abc', preco_unitario: 5 }) === 0);

t('totalOrcamento soma as linhas', totalOrcamento([
  { quantidade: 2, preco_unitario: 10 },
  { quantidade: 1, preco_unitario: 5 },
]) === 25);
t('totalOrcamento de lista vazia é zero', totalOrcamento([]) === 0);
t('totalOrcamento aceita undefined', totalOrcamento(undefined) === 0);

t('saldoOrcamento sem valor de contrato devolve null', saldoOrcamento(null, [{ quantidade: 1, preco_unitario: 10 }]) === null);
t('saldoOrcamento positivo quando o orçamento cabe no contrato', saldoOrcamento(100, [{ quantidade: 2, preco_unitario: 30 }]) === 40);
t('saldoOrcamento negativo quando o orçamento estoura o contrato', saldoOrcamento(50, [{ quantidade: 2, preco_unitario: 30 }]) === -10);

console.log(`orcamento: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
