// A busca do app não pode depender de acento nem de caixa alta: no celular, no
// canteiro, ninguém acentua. Foi o que faltava: "hidrau" não achava "Hidráulica".
import { contem } from '../src/lib/busca.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = real === esperado;
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome);
};

t('sem acento acha com acento', contem('Hidráulica Prime', 'hidrau'), true);
t('com acento acha sem acento', contem('Hidraulica Prime', 'hidráu'), true);
t('caixa alta não atrapalha', contem('Elétrica Nova Luz', 'ELETRICA'), true);
t('cedilha e til', contem('Fundação e instalação', 'fundacao'), true);
t('trecho do meio', contem('Alvenaria Souza', 'ria sou'), true);
t('espaço a mais no fim não esconde', contem('Alvenaria Souza', 'souza  '), true);
t('espaço duplo no meio do termo', contem('Alvenaria Souza', 'alvenaria   souza'), true);
t('o que não existe continua sem achar', contem('Alvenaria Souza', 'hidrau'), false);
t('termo vazio casa com tudo', contem('qualquer coisa', ''), true);
t('termo só de espaços casa com tudo', contem('qualquer coisa', '   '), true);
t('texto nulo não quebra e não casa', contem(null, 'abc'), false);
t('texto ausente não quebra e não casa', contem(undefined, 'abc'), false);
t('número vira texto (nº da pendência)', contem(12, '1'), true);

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
