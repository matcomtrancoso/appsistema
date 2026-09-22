// Contas do orçamento: um item vale quantidade × preço unitário, e o total
// do orçamento é a soma dos itens. Fica aqui (não na tela) porque a conta
// vale igual não importa onde é mostrada — na lista, no PDF, no resumo.

/** Quanto vale uma linha do orçamento. */
export function valorItem(item) {
  const q = Number(item?.quantidade) || 0;
  const p = Number(item?.preco_unitario) || 0;
  return q * p;
}

/** Soma de todas as linhas. */
export function totalOrcamento(itens) {
  return (itens || []).reduce((soma, item) => soma + valorItem(item), 0);
}

/**
 * Compara o total orçado com o valor do contrato (quando existe).
 * Devolve null quando não há valor de contrato para comparar — orçamento
 * sem contrato precificado ainda não tem "estourou/sobrou" para mostrar.
 */
export function saldoOrcamento(valorContrato, itens) {
  if (valorContrato == null) return null;
  return Number(valorContrato) - totalOrcamento(itens);
}
