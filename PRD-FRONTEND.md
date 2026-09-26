# PRD Frontend — SISTEMA ENGENHARIA

> Especificação da interface **como ela está hoje**, levantada do código e do app rodando em modo demonstração (dados de mentira, sem banco).
> Fonte das decisões: `PLANO-DO-PROJETO.md`. Os dados por trás de cada tela estão em `PRD-BACKEND.md`.
> Rascunho v0 — 21/09/2026.
>
> **Como ler os selos:** `[VISTO]` = abri a tela rodando e conferi. `[LIDO]` = vem do código, não abri a tela. `[A CONFERIR]` = não consegui confirmar. Onde não há selo, é estrutura óbvia do código.

## O que o sistema é

Um app de gestão de obra: o mestre lança o diário do dia (efetivo, frentes de serviço, ocorrências, fotos) e a engenharia planeja a semana, acompanha pendências, cronograma, visitas, projetos e contratações, e gera o relatório semanal em PDF. Usado no **celular, no canteiro** (mestre e engenharia em campo) e no **computador, no escritório** (engenharia). `[A CONFIRMAR COM VOCÊ: qual dos dois pesa mais]`

## Padrão técnico

- React 19 + Vite 6, sem biblioteca de componente pronta.
- Visual a partir de um `index.css` próprio (variáveis de cor, componentes `.btn`, `.card`, `.chip`...).
- Navegação por estado, sem endereço no navegador (não existe `/pendencias/123`). Gesto de arrastar para voltar no celular.
- Cor principal `#087B8B` (teal), fundo `#EEF3F4`. Tema **claro** (o seletor do menu só oferece "Claro").
- **Celular** (largura menor que 900 px): barra inferior fixa de 5 itens. **Computador** (900 px ou mais): menu lateral à esquerda.
- Instalável na tela do celular (manifesto com nome, ícones 192/512 e ícone da Apple, gerado a partir de `src/marca.js`).
- Recarrega sozinho quando o app volta depois de mais de 1 hora escondido (evita dado e código velhos).
- Nome do app, obra e data de início vêm de `src/marca.js`.

## Perfis

- **Engenharia** (`engenheiro`): entra em **Início** da engenharia. Vê todas as telas. É quem planeja, confere, cadastra e gera relatório.
- **Mestre** (`mestre`): entra em **Início** do mestre. Vê só o essencial do dia: diário, pendências, equipamentos, galeria de fotos e efetivo histórico.
- **Visitante** (`visitante`): usa a **casca da engenharia**, vê tudo, mas não altera nada. Faixa fixa no topo: "👁 MODO VISITANTE · somente leitura". Qualquer tentativa de gravar mostra "Modo visitante: você pode ver tudo, mas não alterar." `[VISTO no código]`
- **Administrador** (`is_admin`): é uma marca a mais sobre engenharia ou mestre. Ganha o **Painel de admin** (atalho no menu do avatar).
- Quem tem login mas ainda **não tem perfil**: vê "Seu acesso ainda não foi liberado. Peça ao administrador da obra para definir o seu tipo de usuário: engenharia, mestre ou visitante." com o botão Sair.

## Mapa de navegação

```
Login
└── Engenharia / Visitante
    ├── Barra inferior (celular): Início · Planejar · Pendências · Visitas · Cronograma
    ├── Menu lateral (computador): Início · Planejar · Cronograma · Medições · Efetivo · Pendências ·
    │                              Visitas · Contratações · Orçamentos · Projetos · Gestão visual ·
    │                              Equipamentos · Fotos · Cadastros · Relatórios
    ├── Início ── atalhos: Efetivo · Cronograma · Pendências · Equipamentos · Contratações ·
    │             Projetos · Gestão visual · Visitas · Fotos · Relatórios
    ├── Menu do avatar: Configurações · Gerenciar obras e Painel de admin (só admin) · Outras telas · Tema · Sair da conta
    │   [NOTA: este mapa ainda não cobre a fatia 2 do multi-obra (seletor de obra, telas Obras e
    │   Configurações) por inteiro — só o que a fatia de Orçamentos/Medições acrescentou.]
    ├── Planejar ── Nova atividade (4 etapas) · Não realizadas · Realocar · Semana · Fechamento · PDF
    ├── RDO (por Início → "Fazer RDO"): escolha do jeito → Por equipe | Por ambiente | Clássico
    │                                     → Resumo do dia → Enviar; Ocorrência; Histórico de RDOs
    ├── Pendências → Detalhe · Nova
    ├── Relatórios → Montar relatório (PDF)
    └── Meus to-dos (tela pessoal)

└── Mestre
    ├── Barra inferior: Início · Diário · Pendências · Equipamentos · Mais
    ├── Início (RDO de hoje, efetivo, galeria, atividades de hoje)
    ├── Diário → Por equipe | Clássico → atividade → Resumo → Enviar; Ocorrência
    └── Mais → Pendências · Galeria de fotos · Efetivo histórico
```

---

## Tela: Login

**Quem acessa:** todos, antes de entrar.

**O que aparece**
No computador, um painel de marca à esquerda (ícone do app, nome, "RDO, equipe e indicadores num lugar só, pensado para quem vive o canteiro.", três destaques). No celular, a marca no topo. Cartão com "Bem-vindo de volta" e "Entre com seu usuário da obra, ou com seu e-mail completo". `[VISTO]`

**Campos e informações**

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Usuário ou e-mail | texto | sim | sem `@`, o app completa com o domínio da casa (`src/marca.js`); com `@`, usa o e-mail inteiro |
| Senha | senha | sim | |

**Ações**
- **Entrar:** valida. Erro de senha: "Usuário ou senha incorretos." E-mail não confirmado: "Este e-mail ainda não foi confirmado. Fale com o administrador da obra." Falha de rede vira mensagem de rede, **não** de senha.
- Não existe "Criar conta" nem "Esqueci a senha". Conta nova só o administrador cria.

**Regras por perfil:** o app leva ao Início do perfil.
**Estado vazio:** não se aplica. Rodapé: "Problemas de acesso? Fale com o administrador da obra."

---

## Tela: Início da engenharia

**Quem acessa:** engenharia e visitante. **Chega aqui por:** login, ou item "Início".

**O que aparece** `[VISTO]`
Cabeçalho: "SEMANA N" (contada a partir da data de início da obra), data, "Olá, [nome]", nome da obra. Cartão **"O DIA"** com a situação do RDO de hoje ("Aguardando envio" ou enviado) e o botão grande **Fazer RDO**. Abaixo, **Atalhos** em grade de 2 colunas, com contadores nos que têm pendência (Pendências, Equipamentos). Avatar no canto abre o menu do usuário.

Ao abrir, se há colaboradores cadastrados pelo mestre e ainda não conferidos, aparece antes de tudo a janela **"N pessoas novas no canteiro"** (ver Revisão de colaboradores).

**Ações**
- **Fazer RDO:** abre a escolha do jeito de fazer o diário.
- **Atalho:** abre a tela correspondente.
- **Avatar:** abre o menu do usuário.

**Regras por perfil:** visitante vê tudo igual, sem poder gravar.
**Estado vazio:** "O mestre ainda não lançou o efetivo de hoje."

---

## Tela: Menu do usuário (avatar)

**Quem acessa:** engenharia e visitante.
**O que aparece** `[VISTO]`: nome e e-mail; **Painel de admin** (só admin); "Outras telas" (Efetivo, Contratações, Projetos, Gestão visual, Equipamentos, Fotos, Cadastros, Relatórios); **Tema do app** (só "Claro"); **Sair da conta**.
**Ações:** cada item abre a tela. Sair encerra a sessão só neste aparelho.

---

## Tela: Início do mestre

**Quem acessa:** mestre. **Chega aqui por:** login, ou item "Início". `[LIDO]`

**O que aparece**
"Bom dia, [nome]." Cartão **"RDO DE HOJE"** ("Em aberto" ou "✓ Concluído"), com o botão **✓ Concluir RDO de hoje** (desligado enquanto não há ninguém no efetivo) e o botão **Continuar diário** (ou **Editar diário** depois de enviado). Cartão **"EFETIVO NO CANTEIRO"**: número grande de pessoas, "N empreitada · N ADM", uma etiqueta colorida por empresa, e os botões **Registrar/Ajustar** e **Resumo**. Atalho **Galeria de fotos**. Lista **Atividades de hoje**, se houver.

**Ações**
- **Concluir RDO de hoje:** envia o diário. O cartão vira verde, "✓ Concluído".
- **Continuar / Editar diário:** abre o diário.
- **Registrar / Ajustar:** abre o diário no efetivo.
- **Resumo:** abre o resumo de efetivo.

**Estado vazio:** "Ninguém registrado ainda. Registre colaboradores na aba RDO."

> Esta é a **tela do dia a dia do mestre**. `[PENDENTE: confirmar com você que é mesmo a primeira coisa que ele faz de manhã]`

---

## Tela: RDO — escolha do jeito

**Quem acessa:** engenharia e mestre. **Chega aqui por:** Fazer RDO / item "Diário".
**O que aparece** `[VISTO]`: "Como quer fazer hoje?" e "Os dois geram o mesmo diário. Escolha o mais fácil no dia." Duas opções: **Por equipe** ("Marca todo mundo que veio e depois distribui nas frentes." · "Rápido se já sabe quem veio") e **Por ambiente** ("Anda pela obra e vai ambiente por ambiente: quem está e o que faz." · "Bom pra ir caminhando"). Link **RDO clássico** no canto.
**Ações:** escolher o jeito abre o passo a passo. **Início** volta.

## Tela: RDO por equipe (passo a passo)

**O que aparece** `[VISTO os passos 1 e 2; LIDO os passos 3 e 4]`
Faixa "Diário de 21/09/2026 · hoje" (a data pode ser trocada para lançar um dia anterior). Indicador de 4 passos.
1. **"Quem está no canteiro?"** Busca de empresa ("Buscar empresa…"), lista de fornecedores com o número de pessoas. Tocar numa empresa mostra os colaboradores dela: caixa de marcar por pessoa, botão **ADM** (marca a pessoa como administrativa, fora da produção), busca "Digitar nome…", **+ Outra empresa**, **Continuar →**, e a contagem "N de [empresa] · N no canteiro hoje".
2. **"Quem trabalhou em cada frente?"** ("Abra a frente e marque as pessoas.") Lista de frentes (atividades do dia) com o número de pessoas, etiqueta "fora" quando a frente não está no plano do dia, e botão de foto. Aviso "N sem frente: nomes" para quem foi marcado e não foi distribuído. **+ Frente fora do plano** cria uma frente na hora (serviço, pavimento e ambiente).
3. **"Teve algum imprevisto?"** ("O que não deu pra fazer, o que atrapalhou.") Ver "Ocorrência" abaixo.
4. **"Foto do dia e conferir"** ("Registre uma foto e revise antes de salvar.") Foto do dia (tirar ou escolher; pode adicionar outras e remover), três números (no canteiro, frentes, fotos), **👥 Lançar outra equipe** (volta ao passo 1 sem perder o lançado, e mostra "já apropriadas: [empresas]") e o botão **Salvar diário** (fica cinza, mostra "salvando" e termina com o check "Diário salvo").

**Campos e informações** (o que o passo grava)

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Colaboradores presentes | lista de pessoas | sim, para enviar | grava em `efetivo_rdo` e no rascunho `efetivo_draft` |
| Frente da pessoa | atividade do dia | não | `atividade_descricao` |
| ADM | sim/não | não | fora da produção |
| Status de cada frente | Feita / Parcial / Não feita | não | ver "Atividade do diário" |

**Ações**
- **Continuar →:** vai ao passo seguinte.
- **Voltar / Trocar modo:** volta sem perder o marcado (fica no rascunho do aparelho e no servidor).
- **Salvar diário** (passo 4): grava e envia o diário do dia. Se o banco recusar, o botão volta ao normal em vez de mentir "salvo".
- **Foto na frente / foto do dia:** anexa foto (vai para a galeria, catalogada por dia, ambiente e serviço).
- **× na foto (passo 4):** remove a foto do diário. `[A CONFERIR: apaga só o registro; o arquivo continua no armazenamento. Ver "A conta que vai chegar depois"]`

**Regras por perfil:** o mestre e a engenharia usam **a mesma tela**. Quando o mestre lança alguém que não está no cadastro, o colaborador nasce "pendente de revisão".
**Estado vazio:** "Nenhuma empreiteira encontrada." (busca sem resultado).

## Tela: RDO por ambiente e RDO clássico

**O que aparece** `[LIDO]`: as outras duas formas de chegar ao mesmo diário. "Por ambiente" percorre os ambientes e marca quem está e o que faz. O **clássico** é uma única tela com atividades, status por atividade, e a busca "Buscar por nome ou empresa…" com a opção **Adicionar avulso**.
`[A CONFERIR: se vale manter três jeitos de fazer o mesmo diário]`

## Tela: Atividade do diário

**Quem acessa:** engenharia e mestre. **Chega aqui por:** tocar numa frente do diário. `[LIDO]`
**O que aparece:** ambiente e nome da atividade; três botões **Feita**, **Parcial**, **Não feita**; se não for "Feita", a lista de **MOTIVO**.
**Campos e informações**

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Situação | Feita, Parcial, Não feita | sim | grava `atividades_rdo.status` |
| Motivo | uma de 10 opções | quando não for "Feita" | Falta de material · Falta de frente liberada · Falta de mão de obra · Falta de energia · Falta de água · Falta de projeto · Retrabalho · Chuva · Equipamento indisponível · Outro |

**Ações:** **Confirmar e voltar** salva e volta ao diário.

## Tela: Resumo do dia

**O que aparece** `[LIDO]`: "RESUMO DO DIA — Quase lá! Confira os números antes de enviar." Contagem de frentes (feitas, em andamento, não feitas, pendentes) e de pessoas; botão de enviar.
**Ações:** **Enviar** marca o RDO como enviado (`submetido`). O mestre pode reabrir ("Editar diário").
**Regras por perfil:** o status de cada frente é **derivado do efetivo** enquanto não é gravado à mão; o que a pessoa gravou à mão manda.

## Tela: Ocorrência

**O que aparece** `[LIDO]`: no passo 3 do diário. Ocorrências já registradas no dia em faixas vermelhas; grade de 8 tipos marcáveis (**vários de uma vez**); texto livre; turno; botão **+ Registrar imprevisto**.
**Campos e informações**

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Tipo | 8 opções marcáveis: Choveu · Faltou material · Faltou gente · Faltou equipamento · Faltou energia/água · Problema de projeto · Faltou frente · Segurança do trabalho | sim (ao menos um) | o banco grava **os nomes juntos num texto só**, ex.: "Choveu, Faltou material" |
| Descrição | texto | não | se vazio, usa os tipos como descrição |
| Turno | Manhã · Tarde · Dia todo | sim | padrão Dia todo; grava `manha`, `tarde`, `dia` |

**Ações:** **+ Registrar imprevisto** cria a ocorrência no RDO do dia (com a data do diário e o nome de quem registrou); aparece no Efetivo (faixa "N Ocorrência(s)") e nos relatórios. Erro de gravação aparece em vermelho na própria tela.
**Limite conhecido:** como os tipos ficam juntos num texto, **não dá para contar "quantos dias choveu"** sem separar o texto. Ver "A pergunta de um ano" no plano.
**Nesta tela não há:** empresa, fotos nem ditado por voz.

## Tela: Histórico de RDOs

**Quem acessa:** engenharia e mestre. **Chega aqui por:** botão "Histórico de RDOs" no Efetivo, ou menu. `[LIDO]`
**O que aparece:** lista de diários por data, com o que foi enviado. **Ao tocar**, abre o diário daquela data para editar (retroativo).
**Regras por perfil:** o mestre só edita dias até hoje (RDO retroativo).

---

**Dias sem RDO e outro dia (adicionado depois):** o histórico também lista, em linha tracejada, os dias da janela de 60 dias que ficaram **sem RDO** (exceto domingos e dias antes do início da obra), com **＋ Preencher**; e o botão **＋ Outro dia** abre o seletor de data para registrar qualquer dia até hoje. O RDO de dia anterior abre com o aviso "retroativo" e a barra **Trocar dia** (no passo a passo, no clássico e na engenharia). Editar um RDO antigo usa o botão **Editar** do detalhe.

## Tela: Planejar (Planejamento semanal)

**Quem acessa:** engenharia e visitante (visitante só vê). **Chega aqui por:** barra inferior / menu lateral. `[VISTO]`

> Esta é a **tela do dia a dia da engenharia** `[PENDENTE: confirmar com você]`.

**O que aparece**
Cabeçalho "Planejamento" com a obra, o número da semana e "N atividades". Botões: **Não realizadas**, **Realocar**, **Semana**, **+** (nova atividade). No computador, também **Planejar semana** e **Fechamento**. Linha do mês com setas de semana, **PDF**, **Enviar**, **Copiar semana (N)**. Faixa de sete dias (Seg a Dom), o de hoje destacado. Linha "Hoje · Segunda-Feira, 21 de Setembro" com o número de pessoas no canteiro e o botão **Recolher tudo**. Alternância **Por empreiteiro | Por pavimento**. Grupos por empreiteiro (ou pavimento), cada atividade em um cartão: descrição, ambiente, status do dia (Em andamento, Feita, Não feita), lápis (editar) e X (apagar).

**Campos e informações** (cartão da atividade)

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Descrição | texto | sim | |
| Ambiente | escolha do cadastro | não | |
| Empreiteiro | escolha do cadastro | não | |
| Dias da semana | Seg–Dom | não | vazio = atividade avulsa ("Sem dia fixo") |
| Item do cronograma | escolha | não | opcional; o app sugere um parecido ("Parece ser X — toque para vincular") |
| Status do dia | Pendente, Em andamento, Feita, Parcial, Não feita | — | por dia |

**Ações**
- **+ (Nova atividade):** assistente de 4 etapas: **1.** ambiente (por pavimento) · **2.** empreiteiro · **3.** descrição (+ vínculo opcional ao cronograma) · **4.** dias da semana, com **Adicionar** e **Pular e adicionar sem dias**. O "Próximo" fica esmaecido enquanto a descrição está vazia. `[VISTO]`
- **Lápis:** edita a atividade. **X:** apaga (pede confirmação). `[A CONFERIR: o texto da confirmação]`
- **Copiar semana:** copia o plano da semana para a próxima.
- **Realocar:** move atividades de dia. **Não realizadas:** lista o que não foi feito e por quê, com opção de replanejar. **Fechamento:** resumo do fechamento da semana.
- **PDF / Enviar:** gera o planejamento em PDF (paisagem) e o envia. `[A CONFERIR: para quem e por qual meio]`
- **Semana:** troca a visão. `[A CONFERIR]`

**Regras por perfil:** visitante vê e não altera.
**Estado vazio:** `[A CONFERIR: texto quando a semana não tem atividade]` (o teste do PDF prevê "semana vazia avisa em vez de imprimir tabela oca").

---

## Tela: Cronograma

**Quem acessa:** engenharia e visitante. `[VISTO]`
**O que aparece:** título "Cronograma", "N tarefas · N% da obra". Dois números lado a lado: **"DEVERIA ESTAR"** (avanço previsto até a semana atual) e **"ESTÁ"** (avanço real, com "N pp atrás/adiantado"). Botões **Atualizar serviços** e **Importar**. Filtros: Em andamento · A iniciar · Não iniciado. Busca "Buscar tarefa do cronograma…". Árvore de grupos (Fundação, Estrutura, Alvenaria) que abre em tarefas; cada tarefa mostra número, nome, etiqueta (Atrasado / Em andamento), barra de percentual, datas e "iniciou em".
**Campos e informações:** ver `cronograma_itens`. Percentual de 0 a 100.
**Ações:**
- **Importar:** carrega o cronograma de planilha (grupos e tarefas). `[A CONFERIR: formato aceito]`
- **Tocar na tarefa:** abre a edição (percentual, datas, observação).
- **Atualizar serviços:** `[A CONFERIR: o que faz]`
**Regras por perfil:** visitante vê e não altera.
**Estado vazio:** "Nenhum cronograma importado".

## Tela: Efetivo (resumo do canteiro)

**Quem acessa:** engenharia, mestre e visitante. **Chega aqui por:** atalho "Efetivo" do Início. `[VISTO]`
**O que aparece:** "Canteiro de obras" com abas **Por dia · Semana · Período** e botões **Histórico de RDOs** e **PDF**. Número grande de colaboradores no canteiro e cinco contadores (Oficiais, Ajudantes, ADM, Frente, Empresas). Faixa vermelha "N Ocorrência(s)" com o texto e a hora. Um cartão por empresa, com barra, número de pessoas, "N sem função" e as frentes do dia com os nomes.
**Ações:** trocar de dia/semana/período, abrir o histórico, gerar o PDF.
**Regras por perfil:** o mestre chega aqui pelo Início dele ("Resumo") e pelo menu "Mais → Efetivo histórico".
**Estado vazio:** `[A CONFERIR]`

## Tela: Revisão de colaboradores (janela)

**Quem acessa:** engenharia, ao abrir o Início. `[VISTO]`
**O que aparece:** janela **"N pessoas novas no canteiro"**: "O mestre lançou no efetivo gente que não estava no cadastro. **Confira a documentação de segurança do trabalho** antes de liberar." Cada pessoa com função e empresa, e o botão **Conferido**.
**Ações:** **Conferido** tira a pessoa da fila (`pendente_revisao` vira falso). **Ver depois** fecha a janela (volta a aparecer na próxima abertura).

---

## Tela: Pendências (lista, detalhe e nova)

**Quem acessa:** engenharia, mestre, visitante (vê). **Chega aqui por:** barra inferior / "Mais". `[VISTO a lista]`
**O que aparece (lista):** "N pendências no filtro". Abas **Atrasadas · Em aberto · Resolvidas · Todas** (com contagem). Busca "Buscar por ambiente, empresa…" e botão **Filtros**. Botões **Relatório** e **+ Nova**. Cartões: data, status (Aberta, Em andamento, Atrasada), título, ambiente, quem resolve, prazo ("vence em 3d" / "2d atrasada"), número de fotos e um círculo para **resolver com um toque**.
A bolinha vermelha "Pendências" na barra inferior mostra quantas estão em aberto e acompanha ao resolver.
**Campos e informações** (nova pendência)

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| Título | texto (aceita ditado) | sim | |
| Descrição | texto | não | |
| Ambiente | escolha do cadastro | não | pavimento vem do ambiente |
| Empresa (quem resolve) | escolha do cadastro | não | |
| Prazo | data | não | |
| Prioridade | Alta, Média, Baixa | não | padrão Média |
| Fotos do problema | fotos | não | |
| Foto da solução | foto | não | ao resolver |

**Ações**
- **Círculo de check:** resolve (ou reabre) na hora.
- **Tocar no cartão:** abre o detalhe (histórico, fotos, mudança de status: Em andamento, Resolvida, Fechada).
- **+ Nova:** cria.
- **Relatório:** gera PDF do que está filtrado.
- **Excluir:** só a engenharia vê o botão (no detalhe e na janela de edição). O código registra a regra: "apagar pendência é da engenharia".
**Regras por perfil:** o **mestre** vê a lista e pode criar e resolver, mas **não** vê **Excluir**. A engenharia tem o conjunto completo, e um quadro em colunas no computador. `[Regra só da interface: o banco não impede o mestre de apagar. Ver PRD-BACKEND.]`
**Estado vazio:** `[A CONFERIR]`

## Tela: Equipamentos

**Quem acessa:** engenharia e mestre. `[VISTO]`
**O que aparece:** "Equipamentos", "N em alerta". Abas **Ativos · Alertas · Devolvidos · Todos**. Cartão: nome, fornecedor e tipo de locação ("Mensal"), "Até 26 de set", "5d restantes", selo ALERTA/ATIVO, botões **Renovar** e **Devolver**, lápis de editar. Botão **+ Novo**.
**Campos:** ver `equipamentos` (nome, fornecedor, tipo de locação, recebimento, fim previsto, observações).
**Ações:** **Renovar** estende o prazo e conta a renovação ("🔄 Nx renovado"). **Devolver** agenda a devolução (mostra "📅 Devolução [data]") ou registra que foi devolvido (mostra "Devolvido [data]"). **+ Novo** cadastra. `[LIDO os estados; A CONFERIR o passo a passo de cada botão]`
**Estado vazio:** `[A CONFERIR]`

## Tela: Contratações

**Quem acessa:** **só a engenharia** (e visitante, vendo). O mestre não tem esta tela. `[VISTO]`
**O que aparece:** "Contratações", "N em aberto · N enviadas". Abas **Em aberto · Enviadas · Aprovadas**. Busca "Buscar por descrição, responsável…". Filtro por responsável. **+ Nova**.
**Campos e informações:** ver `contratacoes` (descrição, tipo — projeto, mão de obra, material, equipamento —, responsável, fornecedor, prazos, número, **valor do contrato**) e os comentários por etapa.
**Ações:** criar; avançar de etapa (em aberto → enviado → aprovado); comentar e marcar comentário como resolvido; editar; apagar.
**Regras por perfil:** o **valor do contrato** é dinheiro; só aparece na tela da engenharia. `[PENDENTE: ver decisão de permissão do mestre em PRD-BACKEND]`
**Estado vazio:** "Nenhuma contratação aqui. Crie uma nova contratação com o botão acima."

## Tela: Orçamentos

**Quem acessa:** só a engenharia — mesma regra de Contratações; o mestre não tem esta tela. `[VISTO]`
**O que aparece:** lista de contratações, cada uma com orçado (soma dos itens), valor do contrato, saldo (contrato − orçado, verde/vermelho) e número de itens. Ao abrir uma: os itens do orçamento (descrição, unidade, quantidade, preço unitário) editáveis em linha, com total no rodapé.
**Campos e informações:** ver `orcamento_itens`.
**Ações:** adicionar item; editar campo (salva ao sair do campo); apagar item. **Apagar a contratação em Contratações apaga o orçamento dela junto** (aviso na tela de exclusão).
**Estado vazio:** "Nenhuma contratação cadastrada ainda." (orçamento se organiza por contratação).

## Tela: Medições

**Quem acessa:** engenharia e mestre — quem mede no canteiro é normalmente o mestre. `[VISTO]`
**O que aparece:** "Medições" com aviso de que é diferente do avanço calculado pelo Cronograma. Cartão de destaque com a última medição (%). Lista das anteriores (%, data, observações, quem registrou). **+ Medir**.
**Campos e informações:** ver `medicoes_obra` (data, percentual 0–100, observações, responsável).
**Ações:** registrar nova medição (uma por dia); apagar (não existe editar — apaga e registra de novo).
**Estado vazio:** "Nenhuma medição registrada ainda."

## Tela: Projetos

**Quem acessa:** engenharia e visitante. `[VISTO]`
**O que aparece:** "Projetos", "N atrasados · N em alerta". Abas **Não iniciados · Em andamento · Recebidos**. Recorte de período (**Tudo · Semana · Mês**, com setas). Busca "Buscar…" e botões **Editar**, **Vencimento**, **Ocultos**, **Relatório**, **+ Novo**. Cartões de projeto com disciplina, responsável, data prevista ("vence em Nd"), situação e etiquetas de alerta: Atrasado · Sem prazo · Predecessora atrasada · Cadeia em atraso · Aguardando N entrega(s) · Vai estourar a entrega.
**Campos e informações:** ver `projetos` (nome, disciplina, etapa: Pré-executivo, Detalhamento..., responsável, prazos, predecessor, dependências, revisão, observações).
**Ações:** criar; marcar como **recebido** (com a data); encadear dependências; comentar; ocultar; relatório.
**Estado vazio:** "Nenhum projeto aqui. Nada em desenvolvimento agora."

## Tela: Visitas e Reuniões

**Quem acessa:** engenharia e visitante (na barra inferior). `[VISTO só o vazio]`
**O que aparece:** "REGISTROS — Visitas e Reuniões". Lista por data.
**Campos e informações:** ver `visitas` e `reunioes`: data, assunto, empresas e pessoas presentes (com sugestão a partir da agenda), itens da ata, ata em arquivo, marca de "prevista".
**Ações:** **+ Visita**; **+ Registrar primeira visita**; tipo **Visita** ou **Reunião**; adicionar empresa e pessoa (sugestão pelo que já foi usado); anexar ata.
**Estado vazio:** "Nenhuma visita ou reunião registrada. Registre empresas e pessoas presentes em cada visita à obra."

## Tela: Gestão visual (plantas)

**Quem acessa:** engenharia e visitante. `[VISTO só o vazio]`
**O que aparece:** "ACOMPANHAMENTO NA PLANTA — Gestão visual". Botão **+ Planta**. Cada planta abre num editor com **Pincel**, **Detectar** (varinha), **Apagar**, cores por etapa, quantidades, lotes/viagens (placa + nota) e rótulos.
**Ações:** subir a planta em PDF (fundação, formas...) e **pintar o que foi executado**, por etapa e por dia; marcar viagens; imprimir a planta com legenda.
**Estado vazio:** "Nenhuma planta ainda. Suba o PDF da planta (fundação, formas...) e pinte o que já foi executado."

## Tela: Galeria de fotos

**Quem acessa:** engenharia e mestre. `[VISTO só o vazio]`
**O que aparece:** "Galeria de fotos" com abas **Por dia · Pavimento · Ambiente**. Fotos vêm dos cartões do RDO.
**Ações:** abrir foto (visualizador com legenda); apagar foto. `[A CONFERIR: se o mestre vê o botão de apagar]`
**Estado vazio:** "Nenhuma foto ainda. Tire fotos pela camerinha nos cards do RDO: elas aparecem aqui."

## Tela: Cadastros base

**Quem acessa:** engenharia e mestre. **Chega aqui por:** menu do avatar / "Outras telas". `[VISTO]`
**O que aparece:** "Cadastros base — Fornecedores, colaboradores e ambientes". Abas **Fornecedores · Colaboradores · Ambientes**. Fornecedor: iniciais coloridas, nome, "N colaboradores ativos", lápis e X. Botão **+ Novo fornecedor**.
**Campos:** fornecedor (nome, cor); colaborador (nome, função, fornecedor, ativo); ambiente (nome, pavimento, ordem).
**Ações:** criar, editar, apagar. Apagar fornecedor pede confirmação: "Remover "[nome]"? Os colaboradores vinculados perderão o vínculo." **Renomear** fornecedor ou ambiente **não** atualiza o histórico já gravado (ver PRD-BACKEND, "Ligações por nome").

## Tela: Relatórios

**Quem acessa:** engenharia e visitante. `[VISTO]`
**O que aparece:** "Relatório da obra — Aqui você monta o relatório com os módulos que quiser — RDO, efetivo, pendências, equipamentos, visitas e contratações — escolha o período e imprima ou salve em PDF na próxima tela." Botão **Montar relatório**.
**Tela seguinte (Montar relatório):** "Relatório semanal · Semana N", seletor **Semana | Mês** com setas de período, abas de módulo (RDO, Efetivo, Pendências, Equipamentos, Visitas, Contratações, Planejamento...), pré-visualização da página ("Visão geral da semana": efetivo médio, atividades em andamento, pendências abertas, PPC — percentual de planos concluídos, atividades em destaque) e botão **Exportar**.
**Ações:** escolher período e módulos, ver a prévia página a página, **Exportar** (imprimir ou salvar em PDF).
**Dados fixos do cabeçalho:** `relatorio_semanal_config` (código da obra, local, arquiteto, cliente, logo, capa, assinaturas).

## Tela: Painel de admin (Usuários)

**Quem acessa:** só administrador. **Chega aqui por:** menu do avatar. `[VISTO]`
**O que aparece:** "ADMINISTRAÇÃO — Usuários". Uma linha por pessoa: inicial, login, selo **ADMIN** (se for), tipo (Engenharia, Mestre, Visitante), e-mail e "último acesso". Lápis e lixeira (a lixeira some para si mesmo). Botão **+ Novo**.
**Campos:** e-mail, senha (mínimo 8 caracteres), nome, tipo de acesso, é administrador.
**Ações:** criar usuário; editar (tipo, nome, e-mail, senha); apagar (não a si mesmo). Visitante não pode ser admin.

## Tela: Meus to-dos

**Quem acessa:** ninguém hoje. `[LIDO]`
**O que aparece:** "PESSOAL — Meus to-dos", com o texto "Em breve — O modulo de to-dos pessoais esta em desenvolvimento." É um espaço reservado. **Nenhum botão ou menu leva até ele**, e o "Voltar" aponta para uma tela ("mais") que não existe na engenharia.
**Decisão:** ou vira módulo de verdade (precisa de tabela), ou sai do código. `[PENDENTE]`

---

## Textos do sistema

- Botões: Entrar, Continuar →, Voltar, Cancelar, Remover, Conferido, Ver depois, Enviar, Exportar, + Novo, + Nova, + Planta, + Visita.
- Confirmação de exclusão (fornecedor): "Remover "[nome]"? Os colaboradores vinculados perderão o vínculo." `[VISTO]`
- Aviso de conta pendente: "Seu acesso ainda não foi liberado."
- Sessão expirada: "Sua sessão expirou. Entre de novo para continuar." / botão "Fazer login novamente".
- Erro genérico da tela: "Algo deu errado" + botão Recarregar.
- Carregando: "Carregando…", "Carregando perfil…".
- Modo visitante: "Modo visitante: você pode ver tudo, mas não alterar."

## Dados de exemplo

O app já traz um **modo demonstração** (`VITE_DEMO=1` no `.env.local`): roda tudo com dados fictícios, sem banco, com um usuário engenheiro-admin "João". Os dados estão em `src/lib/demo-dados.js`: 3 empreiteiros, 5 colaboradores, ambientes, 4 pendências (uma de cada status: aberta, em andamento, atrasada, resolvida), 5 itens de cronograma, 2 equipamentos, 2 visitas, projetos e contratações.
**Limites conhecidos do demo:** ignora filtros (listas aparecem inteiras), não grava nada, o item de cronograma não tem `pai_wbs_id` (então grupos mostram "0 tarefas"), e não há usuário mestre. `[PENDENTE: um usuário mestre no demo para conferir a tela dele]`

## Critérios de aceite

- [ ] Cada perfil abre na sua tela inicial: engenharia e visitante em Início da engenharia; mestre em Início do mestre.
- [ ] Criar uma pendência a faz aparecer na lista sem recarregar; resolver uma pendência diminui o número da barra inferior na hora.
- [ ] O mestre **não vê** Contratações, Projetos, Cronograma, Gestão visual, Visitas, Relatórios nem o Painel de admin.
- [ ] Visitante vê tudo e, ao tentar gravar, recebe o aviso e nada é gravado.
- [ ] O diário do mestre no celular aparece na tela da engenharia sem recarregar (tempo real).
- [ ] Toda busca acha "Hidráulica" digitando "hidraulica" (sem acento e em qualquer caixa).
- [ ] Todo botão desabilitado tem aparência de desabilitado.
- [ ] Todas as telas funcionam no celular sem rolagem horizontal.
- [ ] Cada lista tem estado vazio com texto próprio.

## A conta que vai chegar depois

- `[PENDENTE: telas não abertas]` — mestre (Início/Diário completo), Visitas e Gestão visual com dados, Contratações e Projetos com dados, Realocar, Não realizadas e Fechamento. O selo `[A CONFERIR]` marca cada uma. Custo: uma rodada de conferência no app real, com login do mestre.
- `[PENDENTE: três jeitos de fazer o RDO]` — por equipe, por ambiente e clássico fazem o mesmo diário. Custo de manter: três telas com regras quase iguais (`mestre-rdo-wizard`, `mestre-rdo-v2`, mais as variantes da engenharia).
- `[PENDENTE: telas gigantes]` — `engenheiro.jsx` (~170 KB), `projetos.jsx`, `gestao-visual.jsx`, `relatorio-pdf.jsx` (~100 KB cada). Custo: cada mudança nelas é arriscada e lenta de testar.
- `[PENDENTE: tema escuro]` — o seletor só oferece "Claro". Se o canteiro pedir escuro, é trabalho de CSS em todas as telas.

## Decidir depois de usar

- `[DESCOBRIR NO USO: menu do computador com 13 itens]` — passa do teto de 6 do plano-padrão. Por enquanto fica: a engenharia usa todos.
- `[DESCOBRIR NO USO: "Meus to-dos"]` — por enquanto fica sem menu.
