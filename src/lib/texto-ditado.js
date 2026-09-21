// Como o texto ditado entra num campo que já tem conteúdo.
//
// Acrescenta em vez de trocar: quem dita em duas tomadas — para pensar, ou
// porque o Chrome encerrou o reconhecimento sozinho — não pode perder a
// primeira. Um espaço separa as tomadas, e só um: sem isso os trechos grudam
// ("infiltraçãona parede") ou sobram espaços no fim do campo.
//
// Mora em lib e não junto do hook porque é regra pura, sem React — assim o
// teste roda no Node direto, sem bundler.
export function juntarDitado(atual, novo) {
  const base = String(atual || '');
  const add = String(novo || '');
  if (!add.trim()) return base;
  if (!base.trim()) return add;
  return base.replace(/\s+$/, '') + ' ' + add;
}
