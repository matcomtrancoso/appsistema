# SISTEMA ENGENHARIA

App de gestão de obra: o mestre lança o diário (RDO) no celular; a engenharia planeja, confere e gera o relatório em PDF.
React 19 + Vite 6 + Supabase + Vercel, uma biblioteca só (`@supabase/supabase-js`) e CSS próprio (`src/index.css`).
Três tipos de acesso: engenharia (`src/pages/AppEngenheiro.jsx`), mestre (`AppMestre.jsx`) e visitante (usa a casca da engenharia, só lê). Administrador é uma marca (`is_admin`) sobre engenharia ou mestre.

O plano vive em `PLANO-DO-PROJETO.md`, `PRD-FRONTEND.md` e `PRD-BACKEND.md`. Mudou de ideia: **atualize o arquivo junto com o código**.

## Onde o código novo vai

Uma pergunta decide: **"isto continuaria verdade se a tela fosse outra?"**

- **Sim → `src/lib/*.js`.** Regra pura: cálculo, recorte, decisão, formatação. Sem React, sem banco, sem `window`. Roda no Node sem bundler (import com `.js` explícito). É a única camada com teste (`tests/*.mjs`).
- **Não → `src/screens/*.jsx`.** Estado de interface e layout. A tela pede a decisão à lib.
- `src/lib/supabase.js` — a conexão. É um Proxy que troca o cliente por um somente-leitura para visitante e por dados fictícios com `VITE_DEMO=1`. Mexer aqui afeta os dois.
- **Não existe `lib/dados.js`.** As telas chamam `supabase.from(...)` direto (mais de cem chamadas). Ao mexer numa tela, se a regra decide *o que é verdade* (filtro, status, recorte), puxe para `lib`. Não espalhe consulta nova sem necessidade.

Constante compartilhada tem um dono só (dias da semana, status, papéis, rótulos em `src/data/index.js` e `src/lib/`). Cópias divergem caladas.

## Régua de verificação

```bash
npm run check
```

Auditoria + build + lint + testes (incluindo `check-schema`). **Fecha em zero**: lint sem avisos, testes todos verdes. Aviso novo é seu; conserte no mesmo lote.
Nada disso prova que a tela funciona: olhe a tela (`npm run dev`, e `VITE_DEMO=1` para ver sem banco).
**Todo bug corrigido em `src/lib/` nasce com teste junto.**

## Antes de subir pro GitHub

Diff que toca em `src/lib/supabase.js`, `supabase/` (migrations e função de admin), `banco.sql`, políticas RLS ou `contratacoes.valor_contrato` → rodar `/code-review` antes de subir. Nesses arquivos o erro não aparece na tela.

## Banco (Supabase)

- **Migration é arquivo.** Todo SQL que muda o banco vira `supabase/migrations/AAAAMMDD-descricao.sql`, vai para o Git e é aplicado pelas ferramentas do Supabase. `banco.sql` é só o retrato inicial (igual a `20260917-banco_inicial.sql`): não edite, crie migration nova.
- **Depois de qualquer migration, regenere `tests/_schema-snapshot.json`.** Snapshot velho passa verde mentindo. `check-schema` só cobre `select` e filtros, não colunas de `insert`/`update`: cheque sempre o `error` do insert.
- Nunca apague tabela, coluna ou dado por "limpeza". Órfão fica até decisão do dono.
- Chave `anon` vai no `.env.local`. **Nunca** a chave de serviço no `src`; ela só existe na função `supabase/functions/admin-usuarios`.

## Deploy

Vercel a partir do GitHub: a pessoa diz "sobe pro GitHub", o agente roda `npm run check`, `git add`, `git commit`, `git push`, e a Vercel publica. Antes de assumir que um push publica, confira se o projeto na Vercel está ligado ao repositório.

## Armadilhas desta base

- **Mestre e engenheiro são iguais no banco.** O RLS só distingue visitante (`e_visitante()`); qualquer não-visitante cria, edita e apaga em qualquer tabela e lê `contratacoes.valor_contrato`. A separação é só de interface. Não trate "o mestre não vê o botão" como segurança.
- **`role` e `is_admin` só mudam pelo Painel de admin** (função `admin-usuarios`, chave de serviço). O app não escreve em `profiles` além do nome.
- **Multi-obra em andamento (5 fatias, arquivos `supabase/migrations/20260921-multiobra-*.sql`).** Fatia 1 aplicada: existem `obras` e `obra_membros`, e as 20 tabelas da obra têm `obra_id` **ainda aceitando vazio**, com a Obra 1 como valor padrão. **O app ainda não informa a obra** (fatia 2). Até a fatia 3 sair: **não** tire o DEFAULT do `obra_id`, **não** torne `NOT NULL` e **não** apague as chaves únicas antigas (`rdos.data`, `cronograma_itens.wbs_id`, `planta_etapas.nome`), senão o app no ar quebra. Empreiteiros, colaboradores, responsáveis de contratação e as agendas de visitas são compartilhados entre obras (sem `obra_id`). Quem vê cada obra sai de `minhas_obras()`; administrador vê todas.
- **Cópia de segurança do banco antes do multi-obra:** esquema `backup_20260921_multiobra` (27 tabelas, fora da API). Só apague com OK do dono, depois das fatias 3 e 5.
- **Nome da obra e início ainda vêm de `src/marca.js` e de `relatorio_semanal_config`** até a fatia 2 passar a ler de `obras`. **`relatorio_semanal_config` continua com CHECK `id = 1`** (uma linha só): guardar o cabeçalho do relatório por obra vai em `obras`, não numa segunda linha ali.
- **Não reaplique `20260921-multiobra-fatia1-preparar.sql` depois da fatia 2:** ele devolve o acesso à Obra 1 a todos os perfis.
- **Listas fechadas têm CHECK no banco e o texto tem que ser idêntico ao da tela** (status de atividade, pendência, contratação, equipamento). Vários campos de lista não têm CHECK (`projetos.status`, `colaboradores.funcao`…): gravam qualquer texto.
- **`atividades_rdo.motivo_nao_exec` guarda códigos `m1`…`m10`.** Não renumere nem reordene `MOTIVOS_NAO_EXEC` em `src/data/index.js`: corrompe o histórico.
- **Ligação por nome, não por id:** `empreiteiro`, `ambiente`, `empresa`, autores. Renomear em Cadastros não atualiza o histórico.
- **Busca:** use `contem()` de `src/lib/busca.js` (ignora acento e caixa). Nunca `toLowerCase().includes(...)` numa caixa de busca.
- **Botão desabilitado:** a regra `.btn:disabled` é global em `index.css`. Não ponha opacidade inline nele (escurece em dobro).
- **Modo demo (`VITE_DEMO=1`) ignora filtros, não grava e não tem usuário mestre.** Serve para ver layout; não prova filtro, permissão nem persistência.
- **`node_modules` copiado de outra máquina quebra** (falta `.bin`, arquivos faltando). Apague a pasta e rode `npm ci`.
- **A auditoria (`npm run auditoria`) varre inclusive os `.md`.** Reprova URL de projeto Supabase, caminho absoluto de usuário do Windows, links de deploy da Vercel e nomes de empresas de outras obras (regras em `scripts/auditoria.mjs`). Esses valores ficam só no `.env.local` (que o Git ignora).
- **Licença de uso interno** (`LICENCA.txt`): proíbe vender, revender, alugar ou distribuir o app.

## Higiene de código (vale para toda mudança)

Cada função morta é uma mentira que o próximo leitor precisa desmascarar.

- **Ao remover um recurso, cace a cadeia inteira no mesmo lote:** a exposição no contexto, os chamadores nas telas, a query. Função exposta que nenhuma tela chama é lixo.
- **Zero avisos novos de lint.** Aviso antigo que encontrar, limpe se já estiver tocando no arquivo.
- **Código comentado não é backup, o git é.** Comentário explica *por quê*. Bloco comentado sem explicação, apague.
- **Antes de apagar, prove que está morto:** grep pelo símbolo no projeto inteiro, e verifique quem chama o *wrapper*, não só a função. Depois confira órfãos.
- **Estado que nunca muda ou nunca é lido é lixo** — `useState` sem setter, prop que ninguém consome, flag que ninguém liga.
- **Limpeza NUNCA toca no banco nem em arquivo de dado.** Tabela ou coluna órfã continua existindo até decisão de quem é dono. Na dúvida, pergunte.
