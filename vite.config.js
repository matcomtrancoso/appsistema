import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, statSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'

// ─────────────────────────────────────────────────────────────────────────────
// Nome do app vindo de src/marca.js
//
// O aluno troca o nome da empresa em src/marca.js e pronto: a aba do navegador,
// o nome do atalho na tela do celular e o manifest (o "cartão" que o celular lê
// para instalar o app) passam a usar esse nome sozinhos, no `npm run dev` e no
// `npm run build`. Antes esses três lugares diziam "FlowPlanner" para sempre.
//
// O manifest não mora mais em public/: ele é montado aqui, a partir da marca.
// ─────────────────────────────────────────────────────────────────────────────
const ARQUIVO_MARCA = fileURLToPath(new URL('./src/marca.js', import.meta.url))

async function lerMarca() {
  try {
    // O ?v=<data de modificação> faz o Node reler o arquivo quando ele muda.
    const versao = statSync(ARQUIVO_MARCA).mtimeMs
    const { MARCA } = await import(`${pathToFileURL(ARQUIVO_MARCA).href}?v=${versao}`)
    if (MARCA?.nome) return MARCA
  } catch {
    // marca.js com erro de digitação: cai no plano B abaixo, sem derrubar o app
  }
  try {
    const texto = readFileSync(ARQUIVO_MARCA, 'utf8')
    const nome = texto.match(/nome:\s*['"`]([^'"`]+)['"`]/)?.[1]
    const descricao = texto.match(/descricao:\s*['"`]([^'"`]+)['"`]/)?.[1]
    if (nome) return { nome, descricao }
  } catch {
    // sem marca.js: segue com o nome padrão
  }
  return { nome: 'Meu app de obra', descricao: 'Planejamento e relatórios de obra.' }
}

// O nome curto aparece embaixo do ícone no celular, onde cabe pouco. Até 12
// letras: se o nome inteiro não cabe, ficam as primeiras palavras que cabem
// ("Obra Nova Engenharia" vira "Obra Nova"), sem terminar em "&", "e", "de";
// se nem a primeira palavra cabe, ela é cortada em 12.
function nomeCurto(nome) {
  const limpo = String(nome).trim().replace(/\s+/g, ' ')
  if (limpo.length <= 12) return limpo
  const palavras = limpo.split(' ')
  let curto = ''
  for (const p of palavras) {
    const junto = curto ? `${curto} ${p}` : p
    if (junto.length > 12) break
    curto = junto
  }
  curto = curto.replace(/\s+(&|e|de|da|do|das|dos|-|\+)$/i, '')
  return curto || palavras[0].slice(0, 12)
}

const escaparHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function montarManifest(marca) {
  return JSON.stringify({
    name: marca.nome,
    short_name: nomeCurto(marca.nome),
    description: marca.descricao || 'Planejamento e relatórios de obra.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#EEF3F4',
    theme_color: '#087B8B',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
  }, null, 2)
}

function marcaDoAluno() {
  return {
    name: 'marca-do-aluno',

    // Troca o <title>, o nome do atalho do iPhone e a descrição no index.html.
    async transformIndexHtml(html) {
      const marca = await lerMarca()
      const nome = escaparHtml(marca.nome)
      let saida = html
        .replace(/<title>[\s\S]*?<\/title>/, `<title>${nome}</title>`)
        .replace(/(<meta name="apple-mobile-web-app-title" content=")[^"]*(")/, `$1${escaparHtml(nomeCurto(marca.nome))}$2`)
      if (marca.descricao) {
        saida = saida.replace(/(<meta name="description" content=")[^"]*(")/, `$1${escaparHtml(marca.descricao)}$2`)
      }
      return saida
    },

    // npm run dev: entrega o manifest montado na hora.
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.split('?')[0] !== '/manifest.webmanifest') return next()
        res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-cache')
        res.end(montarManifest(await lerMarca()))
      })
    },

    // npm run build: grava o manifest dentro de dist/, junto com o site.
    async generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: montarManifest(await lerMarca()),
      })
    },

    // Salvou src/marca.js com o app aberto: recarrega a página inteira, para
    // a aba já mostrar o nome novo.
    handleHotUpdate({ file, server }) {
      if (file.replace(/\\/g, '/').endsWith('/src/marca.js')) {
        server.ws.send({ type: 'full-reload' })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), marcaDoAluno()],
  build: {
    rollupOptions: {
      output: {
        // Separa libs de terceiros (React/Supabase) num chunk próprio = melhor cache
        manualChunks: {
          vendor: ['react', 'react-dom', '@supabase/supabase-js'],
        },
      },
    },
  },
})
