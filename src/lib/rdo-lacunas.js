// Quais dias ficaram sem RDO. Regra pura, sem tela nem banco: o histórico usa
// para oferecer "preencher" nos dias esquecidos.
//
// Domingo não conta como lacuna (a obra costuma parar); quem trabalhou num
// domingo registra pelo botão "Outro dia", e se o RDO existir ele aparece na
// lista normalmente. Dia antes do início da obra também não é lacuna.

const proximoDia = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};

/**
 * @param {string[]} existentes datas (AAAA-MM-DD) que já têm RDO
 * @param {string} de  primeiro dia da janela (inclusive)
 * @param {string} ate último dia da janela (inclusive, normalmente hoje)
 * @param {string|null} inicioObra primeiro dia da obra; dias antes dele não entram
 * @returns {string[]} datas sem RDO, da mais antiga para a mais nova
 */
export function diasSemRdo({ existentes = [], de, ate, inicioObra = null }) {
  if (!de || !ate || de > ate) return [];
  const tem = new Set(existentes);
  const inicio = inicioObra && inicioObra > de ? inicioObra : de;
  const faltando = [];
  for (let dia = inicio; dia <= ate; dia = proximoDia(dia)) {
    if (tem.has(dia)) continue;
    if (new Date(dia + 'T12:00:00').getDay() === 0) continue;   // domingo
    faltando.push(dia);
  }
  return faltando;
}
