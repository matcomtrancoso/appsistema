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
- **Multi-obra em andamento (5 fatias, arquivos `supabase/migrations/20260921-multiobra-*.sql`).** Fatia 1 (banco) e fatia 2 (front) aplicadas. O app agora escolhe a obra (`src/lib/obra-selecionada.jsx`) e injeta o filtro sozinho: `src/lib/obra-escopo.js` embrulha o cliente do Supabase para toda tabela de `TABELAS_DA_OBRA` ganhar `.eq('obra_id', ...)` no `select`/`update`/`delete` e `obra_id` no `insert`/`upsert` — **nenhuma tela precisa passar `obra_id` na mão; ao criar uma tabela nova "da obra", só falta acrescentar o nome nessa lista.** Até a fatia 3 sair: **não** tire o DEFAULT do `obra_id` no banco nem torne `NOT NULL` — sem RLS por obra ainda (fatia 3), o filtro de hoje é só no front. **As três chaves únicas antigas (`rdos.data`, `cronograma_itens.wbs_id`, `planta_etapas.nome`) já foram removidas** (`20260927-orcamento-eap-medicao-mensal.sql`; elas impediam duas obras de ter RDO no mesmo dia) — valem só as por obra. **Todo `upsert` nessas colunas usa `onConflict: 'obra_id,<coluna>'`** (`rdos`, `cronograma_itens` — grep por `onConflict:` antes de mexer); sem o `obra_id` no alvo o Postgres recusa o upsert (não existe mais chave só nessa coluna). Empreiteiros, colaboradores, responsáveis de contratação e as agendas de visitas são compartilhados entre obras (sem `obra_id`). Quem vê cada obra sai de `minhas_obras()`; administrador vê todas; a tela **Obras** (admin) cria/edita obras e libera acesso por pessoa.
- **Canal realtime não filtra por obra ainda** (`postgres_changes` em `rdos` no `AppEngenheiro`/`AppMestre` escuta a tabela inteira, sem `filter: obra_id=eq...`). Com uma obra só não dá sintoma; a fatia 3 resolve de graça, porque RLS por obra também vale para realtime.
- **Nome da obra e início ainda vêm de `src/marca.js` e de `relatorio_semanal_config`** nas telas que usam constante de módulo (`engenheiro.jsx`, `checklist.jsx`, `relatorio-pdf.jsx`, `visitas.jsx`) — só o cabeçalho do app (barra lateral, topo do mestre, tela Configurações) já lê de `obras`. Migrar o resto fica para quando o cabeçalho do relatório em PDF também for por obra. **`relatorio_semanal_config` continua com CHECK `id = 1`** (uma linha só): guardar o cabeçalho do relatório por obra vai em `obras`, não numa segunda linha ali.
- **Não reaplique `20260921-multiobra-fatia1-preparar.sql` depois da fatia 2:** ele devolve o acesso à Obra 1 a todos os perfis.
- **Cópia de segurança do banco antes do multi-obra:** esquema `backup_20260921_multiobra` (27 tabelas, fora da API). Só apague com OK do dono, depois das fatias 3 e 5.
- **`profiles` não tem coluna `email`** (quem lê e-mail é a Edge Function `admin-usuarios`, com a chave de serviço). `check-schema` pegou isso uma vez (tela Obras, lista de quem acessa); se aparecer de novo, é o mesmo engano.
- **RDO de outro dia (retroativo).** Mestre e engenharia abrem qualquer dia até hoje e, se o dia nunca foi preenchido, o RDO é criado na hora (`upsert` em `rdos` com `onConflict: 'obra_id,data'`). O seletor de dia é um componente só, `BarraDiaRDO` (+ a fita `LinhaDoTempoRDO`) em `mestre-rdo-v2.jsx`, usado no clássico, no wizard e na casca da engenharia — não crie outro. O **início é sempre "hoje"**: ao voltar para ele, a casca solta o dia antigo (`soltarRdoAntigo` / `setActiveDate(today)`); sem isso o "Concluir" do início enviava o RDO do dia velho. O aviso "enviado hoje" (`dailyState`) só muda quando o RDO que mudou é o de hoje. `src/lib/rdo-lacunas.js` decide quais dias o histórico mostra como "sem RDO" (domingo e dias antes do início da obra não contam).
- **Contas a pagar / a receber** (`contas_pagar`, `recebimentos`, `obra_contrato`, mais `colaboradores.valor_diaria`). Mestre **e** engenharia veem e lançam (decisão do dono); **visitante não** — sumiu do menu e o banco recusa (as três tabelas novas já têm RLS por obra + `not e_visitante()`, ver `20260926-contas-pagar-receber-rls-por-obra.sql`, antes da fatia 3 das outras tabelas). No banco mestre e engenharia continuam iguais entre si; para restringir mais, RLS com `e_admin()`, não só esconder o botão. **Exceção que sobra:** `colaboradores.valor_diaria` é coluna de uma tabela que o visitante lê, então a diária de cada pessoa fica legível para ele por fora do app, e a diária é **global entre obras** (uma pessoa, um valor) — se o mesmo colaborador tiver valor diferente por obra, ela precisa virar tabela por obra. **Mão de obra:** presença = aparece no efetivo do RDO (enviado *ou* rascunho) como ADM (própria); a regra mora em `src/lib/pagar.js` (`presencasAdm`) e é a **mesma da aba Período do Efetivo** (`efetivo-resumo.jsx`) — mexeu lá, mexa aqui. O pagamento grava o **retrato** (dias, diária, ajuste, total) em `contas_pagar`; mudar a diária depois não reescreve o passado, e há chave única (obra, pessoa, quinzena) contra pagar duas vezes. `contas_pagar` guarda dois tipos (`mao_de_obra`, `despesa`) — **sempre filtre por `tipo`**. Despesa é da obra atual (não há despesa "geral da empresa" sem obra). **A receber:** vem das **medições mensais FECHADAS** (ver o bullet do Orçamento da obra) contra os recebimentos; `obra_contrato.valor_aprovado` é o valor do orçamento aprovado (não se digita mais na tela de receber). O cálculo mês a mês mora em `src/lib/receber.js`. **Armadilha:** mês de medição ainda aberto não conta como medido — se "sumiu" valor do receber, veja se o mês foi fechado. Recebimento e pagamento de pessoa não têm edição, só apagar e refazer. Pagar no meio da quinzena fecha o valor com os dias de agora (a chave única impede um segundo pagamento); a tela avisa antes e mostra "pago com X dias; hoje aparecem Y" se a presença mudar depois. Leituras que passam de 1000 linhas (`efetivo_rdo`) vão paginadas — o servidor corta em 1000 sem avisar. A regra de presença (`presencasAdm`) está duplicada em `efetivo-resumo.jsx` (aba Período) e ainda diverge num detalhe: lá a chave do nome não faz `trim()`.
- **Orçamento da obra → Cronograma → Medição (o fluxo do dinheiro).** O primeiro passo da obra é o **Orçamento da obra** (`orcamento_eap`, EAP com códigos `1`, `1.1`…; folha = quantidade × preço, grupo = soma dos filhos, calculada, não guardada). A regra mora em `src/lib/eap.js` (ler a planilha colada, montar a árvore, valores, gerar o cronograma) e `src/lib/medicao-mensal.js`. Fluxo: importar/digitar → **aprovar** (grava `obra_contrato`, trava as linhas *na tela*) → **Gerar cronograma** (uma tarefa por linha em `cronograma_itens`, ligada por `orcamento_eap_id`, `wbs_id` continua depois do maior existente, datas em branco) → **Medições** por mês (`medicoes_mensais` + `medicao_itens` com o **% acumulado** de cada linha; valor do mês = valor × (% agora − % mês anterior)) → **Fechar mês** → só o mês fechado alimenta **Contas a receber**. **O banco trava** (`20260927` + `20260928-medicao-travas-reforco.sql`): item de mês fechado não muda nem se move para outro mês, mês fechado não se apaga, só a **última** medição da obra reabre, obra e mês de uma medição não mudam, só **uma medição aberta por obra**, item/medição/linha têm que ser da mesma obra, e com mês fechado quantidade/preço/código do `orcamento_eap` não mudam. Apagar linha do orçamento que tem medição dá erro (FK `RESTRICT`, não cascata). A trava de "orçamento aprovado" (editar linhas) é só da **tela**. Reabrir o orçamento só sem **nenhuma** medição (nem aberta) e só limpa `obra_contrato.aprovado_em` (a linha e as observações ficam); trocar o orçamento inteiro por planilha só no rascunho, sem medição e sem cronograma gerado (senão as tarefas perdem o vínculo e duplicam). Importar cronograma do MS Project por cima de tarefas geradas do orçamento pede confirmação (mesmos `wbs_id`). Regras em `eap.js`: `orcamentoAprovado`, `podeReabrirOrcamento`, `podeSubstituirOrcamento`. Mestre e engenharia medem; **o Orçamento da obra é só da engenharia e nenhuma das três tabelas é do visitante** (RLS por obra + `not e_visitante()`). Leituras longas usam `todasAsLinhas` (`src/lib/paginar.js`, o servidor corta em 1000). `medicoes_obra` (o % geral antigo) **não tem mais tela mas continua no banco** — nunca apague.
- **Orçamentos de compra (`orcamento_itens`) e o antigo `medicoes_obra`** nasceram já multi-obra (`obra_id` obrigatório, sem a transição da fatia 1). `orcamento_itens.contratacao_id` tem `ON DELETE CASCADE`: apagar uma contratação em Contratações apaga o orçamento dela junto — a tela avisa disso na confirmação, não tire o aviso sem trocar por outra trava. `medicoes_obra` (`unique(obra_id, data)`) já não tem tela: foi trocada pela medição mensal por linha e a tabela fica parada no banco.
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
