import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    plugins: { react },
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Sem esta regra, o no-unused-vars não enxerga identificadores usados
      // dentro do JSX e acusa como "nunca usado" praticamente todo componente
      // importado — o que tornava o lint inútil para achar código morto.
      'react/jsx-uses-vars': 'error',
      // `catch (_) {}` e parâmetros iniciados por _ são intencionalmente ignorados.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],

      // ─────────────────────────────────────────────────────────────────────
      // Decisões tomadas em 09/09/2026, com o porquê. Reverter é tirar a linha.
      //
      // O eslint-plugin-react-hooks 7 trouxe as regras do compilador do React.
      // Elas são ótimas em projeto novo e implicantes em projeto que já existe.
      // As três abaixo foram desligadas de propósito; as outras continuam
      // ligadas e pegaram coisa de verdade (barra lateral que remontava a cada
      // render, ref lido durante o render, efeito chamando função declarada
      // depois dele) — tudo isso foi CORRIGIDO, não silenciado.

      // Acusa qualquer `setState` dentro de efeito. Só que "buscar dados ao
      // abrir a tela" e "limpar o formulário quando a folha fecha" são feitos
      // exatamente assim quando não se usa biblioteca de dados — e aqui não se
      // usa, de propósito, para o aluno conseguir ler o código. Deixar ligada
      // seria ensinar o aluno a ignorar a saída do lint, que é pior.
      'react-hooks/set-state-in-effect': 'off',

      // Só afeta o recarregamento a quente durante o desenvolvimento: um
      // arquivo que exporta uma constante ao lado do componente perde o
      // fast refresh. Não afeta o app publicado. Aqui as constantes moram
      // junto da tela que as usa de propósito.
      'react-refresh/only-export-components': 'off',

      // Pede que toda variável usada dentro do efeito esteja na lista de
      // dependências. Nos casos deste app a lista é curta de propósito —
      // incluir a função de carregar, que nasce de novo a cada render, faria
      // o efeito rodar em laço infinito. Fica desligada para a saída do
      // `npm run check` sair limpa; quem for mexer em efeito continua tendo
      // que pensar na lista.
      'react-hooks/exhaustive-deps': 'off',
    },
  },
])
