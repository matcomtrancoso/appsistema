// Como o ditado entra num campo que já tem texto. Parece bobo até a barra
// invertida do \s sumir numa edição — já aconteceu duas vezes neste projeto —
// e o campo passar a colar as frases sem espaço, calado.
import { juntarDitado } from '../src/lib/texto-ditado.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = real === esperado;
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome + '  ->  ' + JSON.stringify(real));
};

t('campo vazio recebe o ditado inteiro', juntarDitado('', 'infiltração na parede'), 'infiltração na parede');
t('campo nulo não vira "null"', juntarDitado(null, 'trinca no pilar'), 'trinca no pilar');
t('segunda tomada é acrescentada, não troca',
  juntarDitado('infiltração na parede', 'do banheiro do térreo'), 'infiltração na parede do banheiro do térreo');
t('só um espaço entre as tomadas',
  juntarDitado('infiltração na parede ', 'do banheiro'), 'infiltração na parede do banheiro');
t('espaços sobrando no fim somem',
  juntarDitado('trinca no pilar   \n', 'do subsolo'), 'trinca no pilar do subsolo');
t('ditado vazio não mexe no que estava escrito',
  juntarDitado('já escrito', '   '), 'já escrito');
t('campo só com espaço conta como vazio', juntarDitado('   ', 'texto novo'), 'texto novo');

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
