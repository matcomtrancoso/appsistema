// O que sobra de uma semana e é oferecido como sugestão na seguinte.
//
// Estava dentro da tela de planejamento, no meio de uma consulta ao banco —
// lugar onde teste não alcança, embora seja regra de negócio pura: decide o
// que continua pendente e o que já não interessa repetir.
//
// Sem imports de banco de propósito: roda no Node, no teste, sem bundler.
import { DIA_ORDEM } from './atividades-do-dia.js';

// O status que vale para julgar a atividade é o do ÚLTIMO dia planejado dela.
// Uma frente marcada seg-sex que ficou "não feita" na quarta mas fechou na
// sexta está resolvida — sugerir de novo seria ruído. Sem dias marcados (ou sem
// registro naquele dia), cai no status liso, e a falta dele conta como
// pendente, que é o estado de quem nunca foi tocado.
export function statusDoUltimoDia(a) {
  const dias = Array.isArray(a?.dias_semana) ? a.dias_semana : [];
  const ultimo = dias.length
    ? [...dias].sort((x, y) => DIA_ORDEM.indexOf(x) - DIA_ORDEM.indexOf(y)).pop()
    : null;
  return (ultimo && a?.status_por_dia?.[ultimo]) || a?.status || 'pendente';
}

// Duas atividades são "a mesma coisa" quando descrição, empreiteira e ambiente
// coincidem. Sem isso, uma frente que se repete de segunda a sexta viraria
// cinco sugestões iguais na lista.
export function chaveDeSugestao(a) {
  return [
    String(a?.descricao || '').trim().toLowerCase(),
    a?.empreiteiro || '',
    a?.ambiente || '',
  ].join('|');
}

// Entra tudo que não está concluído — pendente, em andamento e não feita —
// porque os três significam trabalho que atravessou a semana.
export function sugestoesDaSemana(atividades) {
  const vistos = new Set();
  const saida = [];
  for (const a of atividades || []) {
    if (statusDoUltimoDia(a) === 'feita') continue;
    const chave = chaveDeSugestao(a);
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push({ key: a.id, desc: a.descricao, empreiteiro: a.empreiteiro, ambiente: a.ambiente });
  }
  return saida;
}
