// Dinheiro em real, no formato que o campo de digitação pede.
//
// O usuário digita só dígitos e a máscara vai empurrando a vírgula da direita
// para a esquerda — por isso o valor cru é tratado em centavos (inteiro) e só
// vira decimal na hora de salvar. Digitar "1250" mostra R$ 12,50.

/** String digitada (só os dígitos contam) → texto mascarado "R$ 12,50". */
export function fmtV(v) {
  const n = (v || '').replace(/\D/g, '');
  if (!n) return '';
  return (parseInt(n, 10) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** String digitada → número para gravar no banco (null quando vazio). */
export function parseV(s) {
  const n = (s || '').replace(/\D/g, '');
  return n ? parseInt(n, 10) / 100 : null;
}

/** Número vindo do banco → texto para exibir. */
export function fmtCur(n) {
  return n == null ? '' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Percentual para exibir: 33.333 → "33,33%" (até 2 casas). */
export function fmtPct(n) {
  return `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
