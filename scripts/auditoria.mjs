// Auditoria de contaminação — roda antes de empacotar o app para o aluno.
//
// O app do aluno nasceu de um projeto real. Esta trava existe porque a
// contaminação volta em silêncio: basta alguém copiar um arquivo de volta, ou
// um teste velho, para uma chave ou o nome de uma obra viajar junto no ZIP.
// Falhar aqui é barato; descobrir depois de publicar, não.
//
// Uso: npm run auditoria

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const RAIZ = process.cwd();

const IGNORAR_PASTAS = new Set(['node_modules', 'dist', '.git', '.vercel', 'scripts']);
const IGNORAR_ARQUIVOS = new Set(['package-lock.json']);
const EXT_TEXTO = /\.(jsx?|mjs|cjs|tsx?|css|html|json|md|webmanifest|sql|env|example|txt|yml|yaml)$/i;

// Cada regra é [nome, expressão, explicação do risco].
const REGRAS = [
  ['chave JWT do Supabase', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./,
    'chave de projeto no código — nunca pode ir junto'],
  ['URL de projeto Supabase', /https:\/\/[a-z0-9]{15,}\.supabase\.co/i,
    'aponta para um projeto real em vez do projeto do aluno'],
  ['string de conexão Postgres', /postgres(ql)?:\/\/[^\s'"]+/i,
    'credencial de banco'],
  ['caminho local de máquina', /[A-Za-z]:[\\/]Users[\\/][A-Za-z0-9._-]+/,
    'caminho da máquina de quem montou o pacote'],
  ['marca de terceiro (laer)', /\blaer\b/i,
    'marca que não é do aluno'],
  // sem \b: em teste o nome vem colado num "\t" (ex.: '1\tOLIVEIRAS'), e o \b não enxerga
  ['empreiteira de obra real', /oliveiras|sloboda|(?<!por)ventura/i,
    'nome de empresa de uma obra real'],
  ['obra real (1468)', /\b1468\b/,
    'código de uma obra real'],
  ['app externo (construreport/construcheck)', /constru(report|check)/i,
    'nome de outro produto'],
  ['deploy de terceiro', /[a-z0-9-]+\.vercel\.app/i,
    'link para um app publicado que não é o do aluno'],
  ['nome de pessoa real', /\b(Andressa|Andr[ée] Cardoso|Gledson)\b/,
    'nome de pessoa real em comentário ou dado de teste'],
];

function arquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (IGNORAR_PASTAS.has(nome) || nome.startsWith('.')) continue;
      saida.push(...arquivos(caminho));
      continue;
    }
    if (IGNORAR_ARQUIVOS.has(nome)) continue;
    if (!EXT_TEXTO.test(nome)) continue;
    saida.push(caminho);
  }
  return saida;
}

const achados = [];
for (const caminho of arquivos(RAIZ)) {
  let texto;
  try { texto = readFileSync(caminho, 'utf8'); } catch { continue; }
  const linhas = texto.split('\n');
  for (const [nome, expressao, risco] of REGRAS) {
    linhas.forEach((linha, i) => {
      if (expressao.test(linha)) {
        achados.push({
          arquivo: relative(RAIZ, caminho).split(sep).join('/'),
          linha: i + 1,
          regra: nome,
          risco,
          trecho: linha.trim().slice(0, 120),
        });
      }
    });
  }
}

// ── Sobra de trabalho: backup, cópia, arquivo temporário ─────────────────────
// A varredura acima só lê arquivos de texto conhecidos, então um `.bak` passava
// batido e ia junto no ZIP do aluno. Aqui é pelo NOME, não pelo conteúdo.
const LIXO = /(\.bak\b|\.bak[-.]|\.orig$|\.rej$|~$|\.tmp$|[-.]copia\b|[-.]copy\b| \(\d\)\.)/i;
function todosOsArquivos(dir) {
  const saida = [];
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) {
      if (IGNORAR_PASTAS.has(nome) || nome.startsWith('.')) continue;
      saida.push(...todosOsArquivos(caminho));
      continue;
    }
    saida.push(caminho);
  }
  return saida;
}
const sobras = todosOsArquivos(RAIZ).filter(c => LIXO.test(c.split(sep).pop()));
for (const c of sobras) {
  achados.push({
    arquivo: relative(RAIZ, c).split(sep).join('/'),
    linha: 0,
    regra: 'sobra de trabalho',
    risco: 'backup ou cópia temporária não pode viajar no pacote do aluno',
    trecho: '(apague o arquivo, ou mova para fora da pasta do app)',
  });
}

if (achados.length === 0) {
  console.log('Auditoria OK — nada de terceiros encontrado no pacote.');
  process.exit(0);
}

console.error(`Auditoria REPROVADA — ${achados.length} ocorrência(s):\n`);
for (const a of achados) {
  console.error(`  ${a.arquivo}:${a.linha}  [${a.regra}] ${a.risco}`);
  console.error(`      ${a.trecho}\n`);
}
console.error('Corrija cada linha acima antes de empacotar.');
process.exit(1);
