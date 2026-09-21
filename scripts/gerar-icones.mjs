// Gera os ícones do app a partir da SUA logo.
//
// Como usar:
//   1. Salve a logo da sua empresa, de preferência quadrada, dentro da pasta
//      public do app, com o nome minha-logo.png (ou minha-logo.jpg).
//   2. No terminal do Cursor, rode:  npm run icones
//
// Sai em public/: icon-192.png, icon-512.png, apple-touch-icon.png (180),
// favicon-32.png, favicon-16.png e favicon.ico. São os ícones da aba do
// navegador, do atalho na tela do celular e da tela de entrada do app.
//
// Logo que não é quadrada fica centralizada num quadrado de fundo branco.
// Sem logo, nada muda: ficam os ícones que vieram com o app.
//
// Usa a biblioteca jimp, que é 100% JavaScript: funciona em qualquer Windows
// ou Mac sem instalar nem compilar nada além do `npm install`.

import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const PASTA = join(RAIZ, 'public');
const PASTA_MOSTRADA = relative(process.cwd(), PASTA) || 'public';

// Tamanho de cada ícone, em pixels.
const ICONES = [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
  ['favicon-16.png', 16],
];
const TAMANHOS_ICO = [16, 32, 48];

const linha = () => console.log('');
function parar(...mensagens) {
  linha();
  for (const m of mensagens) console.log(m);
  linha();
  process.exit(1);
}
// Sem logo não é erro: só não há nada a fazer.
function semNadaAFazer(...mensagens) {
  linha();
  for (const m of mensagens) console.log(m);
  linha();
  process.exit(0);
}

// ── 1. Achar a logo ─────────────────────────────────────────────────────────
// O Windows costuma esconder a extensão: quem salva "minha-logo.png" às vezes
// fica com "minha-logo.png.png". Aceitamos isso também.
let arquivos = [];
try { arquivos = readdirSync(PASTA); } catch {
  parar(`Não achei a pasta public do app (${PASTA}).`,
    'Rode este comando dentro da pasta do app, a mesma onde está o arquivo package.json.');
}
const ACEITA = /^minha-logo(\.(png|jpe?g))+$/i;
const achadas = arquivos.filter(n => ACEITA.test(n));
const png = achadas.find(n => /\.png$/i.test(n));
const escolhida = png || achadas[0];

if (!escolhida) {
  const parecida = arquivos.find(n => /^minha-logo/i.test(n));
  if (parecida) {
    parar(`Achei o arquivo ${parecida}, mas ele não é PNG nem JPG.`,
      'Abra a logo num editor de imagem (até o Paint serve) e salve de novo como PNG,',
      `com o nome minha-logo.png, dentro da pasta: ${PASTA}`,
      'Depois rode de novo:  npm run icones');
  }
  semNadaAFazer('Não achei a sua logo.',
    'Salve a imagem com o nome  minha-logo.png  (ou minha-logo.jpg)',
    `dentro desta pasta:  ${PASTA}`,
    'Depois rode de novo:  npm run icones',
    '',
    'Sem logo, o app continua com os ícones que vieram com ele. Não precisa fazer nada.');
}
if (achadas.length > 1) {
  console.log(`Achei mais de uma logo (${achadas.join(', ')}). Vou usar a ${escolhida}.`);
}
const caminhoLogo = join(PASTA, escolhida);

// ── 2. Carregar a biblioteca de imagem ──────────────────────────────────────
let Jimp, ResizeStrategy;
try {
  ({ Jimp, ResizeStrategy } = await import('jimp'));
} catch {
  parar('Falta instalar uma peça do app.',
    'Rode primeiro:  npm install',
    'e depois de novo:  npm run icones');
}

// ── 3. Abrir a logo ─────────────────────────────────────────────────────────
let logo;
try {
  if (statSync(caminhoLogo).size === 0) throw new Error('arquivo vazio');
  logo = await Jimp.read(caminhoLogo);
} catch (e) {
  parar(`Não consegui abrir a imagem ${escolhida}.`,
    'Confira se ela abre normalmente no seu computador e se é PNG ou JPG de verdade',
    '(trocar só o nome do arquivo não muda o formato da imagem).',
    'Se preciso, abra a logo num editor de imagem e salve de novo como PNG.',
    `Detalhe técnico: ${e?.message || e}`);
}

const largura = logo.bitmap.width;
const altura = logo.bitmap.height;

// ── 4. Quadrado de fundo branco, com a logo no meio ─────────────────────────
// O fundo branco também resolve a logo com fundo transparente: o iPhone pinta
// de preto o que é transparente no atalho da tela inicial.
const lado = Math.max(largura, altura);
const quadrado = new Jimp({ width: lado, height: lado, color: 0xffffffff });
quadrado.composite(logo, Math.round((lado - largura) / 2), Math.round((lado - altura) / 2));

// Reduz em etapas (metade por vez): reduzir de uma vez só, de 2000 para 16
// pixels, deixa o ícone serrilhado.
function reduzir(imagem, alvo) {
  let atual = imagem.clone();
  while (atual.bitmap.width / 2 > alvo) {
    const metade = Math.round(atual.bitmap.width / 2);
    atual = atual.resize({ w: metade, h: metade, mode: ResizeStrategy.BILINEAR });
  }
  return atual.resize({ w: alvo, h: alvo, mode: ResizeStrategy.BICUBIC });
}

// favicon.ico com PNGs dentro (o formato que todo navegador atual aceita).
function montarIco(pngs) {
  const cabecalho = Buffer.alloc(6 + 16 * pngs.length);
  cabecalho.writeUInt16LE(0, 0);            // reservado
  cabecalho.writeUInt16LE(1, 2);            // tipo 1 = ícone
  cabecalho.writeUInt16LE(pngs.length, 4);  // quantas imagens
  let posicao = cabecalho.length;
  pngs.forEach(({ tamanho, dados }, i) => {
    const e = 6 + 16 * i;
    cabecalho.writeUInt8(tamanho >= 256 ? 0 : tamanho, e);      // largura
    cabecalho.writeUInt8(tamanho >= 256 ? 0 : tamanho, e + 1);  // altura
    cabecalho.writeUInt8(0, e + 2);             // paleta: nenhuma
    cabecalho.writeUInt8(0, e + 3);             // reservado
    cabecalho.writeUInt16LE(1, e + 4);          // planos
    cabecalho.writeUInt16LE(32, e + 6);         // bits por pixel
    cabecalho.writeUInt32LE(dados.length, e + 8);
    cabecalho.writeUInt32LE(posicao, e + 12);
    posicao += dados.length;
  });
  return Buffer.concat([cabecalho, ...pngs.map(p => p.dados)]);
}

// ── 5. Gerar e gravar ───────────────────────────────────────────────────────
const gerados = [];
try {
  for (const [nome, tamanho] of ICONES) {
    const dados = await reduzir(quadrado, tamanho).getBuffer('image/png');
    writeFileSync(join(PASTA, nome), dados);
    gerados.push(`${nome} (${tamanho} x ${tamanho})`);
  }
  const pngsIco = [];
  for (const tamanho of TAMANHOS_ICO) {
    pngsIco.push({ tamanho, dados: await reduzir(quadrado, tamanho).getBuffer('image/png') });
  }
  writeFileSync(join(PASTA, 'favicon.ico'), montarIco(pngsIco));
  gerados.push(`favicon.ico (${TAMANHOS_ICO.join(', ')})`);
} catch (e) {
  parar('Deu erro ao gerar os ícones.',
    'Tente salvar a logo de novo como PNG e rode outra vez:  npm run icones',
    `Detalhe técnico: ${e?.message || e}`);
}

linha();
console.log(`Pronto! Gerei os ícones do app a partir de ${escolhida}:`);
for (const g of gerados) console.log(`  - ${PASTA_MOSTRADA}/${g}`);
linha();
if (lado < 512) {
  console.log(`Atenção: a sua logo tem ${largura} x ${altura} pixels. O ícone grande pode ficar borrado.`);
  console.log('Se tiver uma versão maior (512 x 512 ou mais), salve por cima e rode de novo.');
  linha();
}
if (largura !== altura) {
  console.log(`A logo não é quadrada (${largura} x ${altura}): ela ficou no meio de um quadrado branco.`);
  linha();
}
console.log('Para ver: recarregue a página do app com Ctrl+F5 (no Mac, Cmd+Shift+R).');
console.log('O navegador guarda o ícone antigo por um tempo; se ainda aparecer o antigo, feche e abra a aba.');
console.log('No celular, apague o atalho antigo da tela inicial e adicione de novo.');
console.log(`Guarde a ${escolhida} na pasta public: ela vai junto para o GitHub, e dá para gerar de novo quando quiser.`);
linha();
