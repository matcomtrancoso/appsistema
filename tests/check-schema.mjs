// Copie para `tests/check-schema.mjs`. Só faz sentido em projeto com Supabase.
//
// O que faz: cruza as colunas e tabelas que o CÓDIGO usa contra um retrato do
// banco real (`tests/_schema-snapshot.json`). Pega o erro mais silencioso deste
// padrão — o código pede uma coluna que não existe (ou que mudou de nome no
// banco) e a tela só mostra vazio, sem erro nenhum.
//
// É estático: não precisa de internet nem de chave.
//
// LIMITAÇÃO CONHECIDA — ele NÃO enxerga as colunas de `insert()`/`update()`,
// só as de `select()` e as dos filtros (`.eq`, `.order`, ...). Coluna errada
// num insert continua passando por aqui. Por isso: SEMPRE cheque o `error` que
// o Supabase devolve nos inserts. Ele não estoura exceção, devolve o erro
// dentro do objeto — `const { error } = await supabase.from(...).insert(...)`.
//
// Depois de QUALQUER migration, regenere o snapshot — senão este teste passa a
// mentir. O formato é um objeto tabela -> lista de colunas:
//   { "pedidos": ["id", "titulo", "status", "created_at"], "profiles": [...] }
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.join(__dirname, '..', 'src')
const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '_schema-snapshot.json'), 'utf8'))

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) return walk(p)
    return p.endsWith('.jsx') || p.endsWith('.js') ? [p] : []
  })
}

const files = walk(SRC)
const reFilter = /\.from\('([a-z_0-9]+)'\)|\.(eq|neq|gt|gte|lt|lte|order|is|in|contains|ilike|like|match)\('([a-z_0-9.]+)'/g
const reSelect = /\.from\('([a-z_0-9]+)'\)\s*\.select\(\s*[`'"]([^`'"]*)[`'"]/g

const problems = []
let okCount = 0

// 1) Colunas usadas em filtros e em order()
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8')
  let cur = null
  let m
  reFilter.lastIndex = 0
  while ((m = reFilter.exec(txt))) {
    if (m[1]) { cur = m[1]; continue }
    if (!cur) continue
    const col = m[3].split('.')[0]
    if (!schema[cur]) continue // tabela fora do snapshot (storage, outro app)
    if (schema[cur].includes(col)) okCount++
    else problems.push(`[FILTRO] ${cur}.${col}  (${path.basename(f)})`)
  }
}

// 2) Colunas listadas em select('a,b,c')
for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8')
  let m
  reSelect.lastIndex = 0
  while ((m = reSelect.exec(txt))) {
    const t = m[1]
    const sel = m[2]
    if (!schema[t] || sel.trim() === '*' || sel.includes('count')) continue
    let depth = 0
    let buf = ''
    const toks = []
    for (const ch of sel) {
      if (ch === '(') depth++
      else if (ch === ')') depth--
      if (ch === ',' && depth === 0) { toks.push(buf); buf = '' } else buf += ch
    }
    toks.push(buf)
    for (let tok of toks) {
      tok = tok.trim()
      if (!tok || tok === '*' || tok.includes('(')) continue // embed: alias:fk(...)
      const col = tok.split(':').pop().trim()
      if (!/^[a-z_0-9]+$/.test(col)) continue
      if (schema[t].includes(col)) okCount++
      else problems.push(`[SELECT] ${t}.${col}  (${path.basename(f)})`)
    }
  }
}

console.log(`Colunas validadas OK: ${okCount}`)
if (problems.length === 0) {
  console.log('✓ check-schema: código e banco batem.')
  process.exit(0)
}
console.log(`✗ ${problems.length} divergência(s) entre código e banco:`)
;[...new Set(problems)].forEach((p) => console.log('   ' + p))
process.exit(1)
