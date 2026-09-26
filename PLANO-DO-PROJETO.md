# Plano do Projeto — SISTEMA ENGENHARIA

> Fonte da verdade deste projeto. Quando mudar de ideia, mude aqui primeiro.
> Última atualização: 21/09/2026 — **rascunho v0**, montado a partir do app que já existe.
>
> **Como este plano foi feito:** o app já está construído. Então tudo que é *estrutura* (telas, tabelas, permissões, processos) foi **levantado do código** e está nos dois PRDs. O que o código não sabe — o problema, o custo, as pessoas, o prazo, o mercado — está marcado `[AINDA NÃO RESPONDIDO]` e é o que falta você me dizer. Não inventei nada disso.
>
> Os detalhes estão em `PRD-FRONTEND.md` (telas) e `PRD-BACKEND.md` (dados e permissões).

## Em uma frase

Um sistema de **gestão de obra** que reúne o diário do dia (RDO), o efetivo, as pendências, o planejamento semanal, o cronograma, as visitas, os projetos, as contratações e os equipamentos, para a **obra NAMPUR MATA — Fase 2, Casa 12 e 13**, fazendo o **mestre lançar o dia no celular** enquanto a **engenharia planeja, acompanha e gera o relatório semanal em PDF**.
`[AINDA NÃO RESPONDIDO: o problema principal, que é o que completa esta frase]`

---

# 1. Visão Estratégica

## Os problemas

`[AINDA NÃO RESPONDIDO]` — o código mostra **o que o sistema resolve**, não **o que doía antes**. Preciso das suas palavras, no formato abaixo, para no máximo três problemas.

### Problema 1 — `[AINDA NÃO RESPONDIDO]`
- **Como acontece hoje:** `[...]`
- **Frequência:** `[...]`
- **Custo:** `[horas por semana ou R$; se não souber, PENDENTE]`
- **Último caso:** `[o exemplo concreto]`

### Problema 2 — `[AINDA NÃO RESPONDIDO]`
### Problema 3 — `[AINDA NÃO RESPONDIDO]`

> Pistas do que o sistema **sabe fazer** (pode ser o que resolve os seus problemas, ou não): o diário sai do celular do mestre para a tela da engenharia em tempo real; o relatório semanal sai em PDF com RDO, efetivo, pendências, equipamentos, visitas e contratações; o cronograma mostra "deveria estar × está"; o planejamento vira PDF; o app avisa quando alguém novo entra no canteiro sem cadastro.

## A solução

Um app que roda no celular e no computador, com três tipos de acesso (engenharia, mestre, visitante) e um administrador. O **mestre** abre o dia no celular, marca quem veio e onde cada um trabalhou, registra imprevistos e uma foto, e envia. A **engenharia** planeja a semana por empreiteiro ou por pavimento, confere o que foi feito, acompanha pendências, cronograma, projetos, visitas e contratações, pinta o avanço nas plantas e monta o relatório.

**O que ele NÃO faz** (proposta minha; confirme):
- App nativo de loja (é instalável pela tela do celular, mas não está na loja).
- Contabilidade ou folha de pagamento completa (encargos, férias, 13º, impostos sobre salário). O financeiro que existe é o de **Contas a pagar** (equipe própria por quinzena a partir da diária × dias presente, e despesas) e **Contas a receber** (valor fechado × medição mensal fechada × recebido), mais o **valor do contrato** e o **orçamento de compra por contratação**. Não guarda custo de locação de equipamento como conta a pagar.
- Chat interno ou notificações.

**Adicionado depois:** orçamento de compra por contratação (tela Orçamentos de compra, só engenharia). O primeiro passo da obra agora é o *Orçamento da obra* (EAP: 1, 1.1, 1.1.1… com quantidade e preço): importado de planilha ou digitado, é aprovado e dele nascem o **Cronograma** (uma tarefa por linha) e a **Medição mensal** (o % acumulado de cada linha no fim do mês, com fechamento — tela Medições, mestre e engenharia). O mês fechado é o que alimenta o Contas a receber. **Financeiro:** *Contas a pagar* (pagamento da equipe própria por quinzena, a partir da presença nos RDOs × diária de cada pessoa, mais despesas lançadas à mão) e *Contas a receber* (valor fechado com o cliente × o que as medições fechadas mediram, contra o que já entrou, mês a mês) — mestre e engenharia veem e lançam.

**Limite de uso da licença:** o app é de uso interno. O `LICENCA.txt` proíbe vender, revender, alugar ou distribuir o app ou versões dele. `[AINDA NÃO RESPONDIDO: existe plano de oferecer o sistema a outras empresas? Se sim, isto muda tudo]`

## Funcionalidades

Resumo dos 13 módulos. O detalhe de cada um está no `PRD-FRONTEND.md`.

| Módulo | Quem usa | Abre em | O que faz |
|---|---|---|---|
| **RDO (diário)** | mestre e engenharia | passo a passo de 4 etapas | Quem veio, quem trabalhou em cada frente, imprevistos, foto do dia. Enviar. |
| **Planejar** | engenharia | semana por dia | Atividades por empreiteiro ou pavimento, dias da semana, status por dia, copiar/realocar semana, PDF. |
| **Cronograma** | engenharia | árvore de grupos e tarefas | Importa planilha, % por tarefa, "deveria estar × está". |
| **Efetivo** | todos | resumo por dia, semana, período | Quantos, de que empresa, em que frente, ocorrências. PDF. |
| **Pendências** | todos | lista com abas | Criar, resolver com um toque, prazo, fotos do problema e da solução, relatório. |
| **Visitas e reuniões** | engenharia | lista por data | Registrar presentes, itens da ata, anexar ata. |
| **Contratações** | engenharia | abas Em aberto/Enviadas/Aprovadas | Processo de contratar projeto, mão de obra, material, equipamento; valor do contrato. |
| **Projetos** | engenharia | abas por situação | Entregas de projeto com prazo, predecessor, alertas de atraso em cadeia. |
| **Gestão visual** | engenharia | lista de plantas | Pintar na planta o que foi executado; lotes e viagens. |
| **Equipamentos** | engenharia e mestre | abas Ativos/Alertas/Devolvidos | Locações com prazo, renovar, devolver. |
| **Fotos** | engenharia e mestre | por dia, pavimento, ambiente | Galeria das fotos do RDO. |
| **Cadastros** | engenharia e mestre | abas Fornecedores/Colaboradores/Ambientes | Base do resto: quem e onde. |
| **Relatórios** | engenharia | "Montar relatório" | PDF semanal ou mensal, módulos à escolha. |

**A tela do dia a dia** — o skill chama isto de um dos três pontos que decidem o sistema. Pelo código, são duas:
- **Mestre:** Início → Continuar diário (RDO). `[AINDA NÃO RESPONDIDO: é isso mesmo que ele faz primeiro de manhã?]`
- **Engenharia:** Planejar. `[AINDA NÃO RESPONDIDO: é a primeira que você abre na segunda?]`

## Perfis de usuário

- **Engenharia:** planeja, confere, cadastra, gera relatório · primeira tela: Início da engenharia.
- **Mestre:** lança o dia no celular · primeira tela: Início do mestre.
- **Visitante:** vê tudo, não altera nada (cliente, arquiteto, diretor?) · primeira tela: Início da engenharia, com faixa "somente leitura". `[AINDA NÃO RESPONDIDO: quem é o visitante na sua obra?]`
- **Administrador:** marca a mais sobre engenharia ou mestre; cria e gerencia usuários.

### Matriz de permissões

Duas colunas por perfil: o que a **interface** deixa fazer e o que o **banco** deixa fazer. A diferença entre as duas é o risco.

| Ação | Engenharia | Mestre (interface) | Mestre (banco) | Visitante |
|---|---|---|---|---|
| Ver tudo | sim | só o essencial (5 telas) | **sim, tudo** | sim |
| Criar | sim | diário, pendência, ocorrência, colaborador novo | **qualquer tabela** | não |
| Editar | sim | o que cria | **qualquer tabela** | não |
| Apagar | sim | não vê botão (Pendências); **Galeria: a conferir** | **qualquer tabela** | não |
| Ver valor de contrato | sim | não vê a tela | **sim, se consultar direto** | sim (vê a tela) |
| Gerenciar usuários | só se admin | não | não | não |

Ponto 3 dos três que decidem o sistema, **preciso da sua palavra:**
`[AINDA NÃO RESPONDIDO: hoje o banco trata mestre e engenheiro iguais e só a interface os separa. Você quer que o banco também impeça o mestre de apagar e de ver valor de contrato, ou a confiança na equipe basta?]`

## Fluxo de cadastro

Diferente do padrão do pacote (cadastro livre + liberação): **não existe "Criar conta"**. O administrador cria cada usuário no Painel de admin, escolhendo o tipo. O login é criado já confirmado. Quem ganhar login por outro caminho nasce visitante, só lê. O primeiro administrador é criado por SQL (`COMECE-AQUI.md`). Quem tem e-mail do domínio da casa entra digitando só o usuário.

## Ferramentas e custo

| Peça | Para que serve | Custo |
|---|---|---|
| Claude (plano Pro) | construir e evoluir o sistema | ~US$ 20/mês (fonte: `COMECE-AQUI.md`) |
| React 19 + Vite 6 | a interface | grátis |
| Supabase | banco, login, arquivos | grátis (fonte: `COMECE-AQUI.md`) — `[PENDENTE: confirmar o plano e o limite de armazenamento de fotos]` |
| Vercel | colocar no ar | grátis (Hobby) |
| GitHub | guardar o código | grátis |

**Total por mês:** `[PENDENTE: fechar quando o plano do Supabase for conferido]` (só a assinatura do Claude, se tudo estiver no gratuito).
**O que custaria a alternativa pronta:** `[PENDENTE: benchmark não pesquisado]`
**Quanto você paga hoje, ou pagaria, por um sistema pronto pra isso?** `[AINDA NÃO RESPONDIDO]`

## Prazo

- **Quer usar de verdade em:** `[AINDA NÃO RESPONDIDO]`. Observação: `src/marca.js` marca o **início da obra em 21/09/2026** (contagem de "Semana N"). O sistema já roda.
- **Horas por semana disponíveis:** `[AINDA NÃO RESPONDIDO]`

---

# 2. Insights do Mercado

## Benchmark

`[PENDENTE: benchmark não pesquisado]` — as regras do pacote proíbem escrever nome, preço ou função de concorrente sem ter visto numa busca. Faço a pesquisa depois que você responder a primeira pergunta abaixo, para pesquisar o problema certo.

## Por que ainda vale construir o meu

`[AINDA NÃO RESPONDIDO]` — esta é a resposta que sustenta o projeto nos dias difíceis, e tem que ser sua.

Pergunta de ouro: **você já tentou resolver isso com algum programa? Qual, e por que não deu certo?** (caro, engessado, ninguém da equipe adotou, ou travava sem sinal?)

## Referências de interface

O que o código já decidiu (confirme ou troque):
- **Usa mais em:** celular no canteiro **e** computador no escritório (o app tem os dois layouts). `[AINDA NÃO RESPONDIDO: qual pesa mais?]`
- **Cor principal:** `#087B8B` (teal). Fundo `#EEF3F4`.
- **Tema:** claro (o seletor só tem "Claro").
- **Logo:** existe `public/minha-logo.png` e os ícones gerados a partir dela.
- **Gosta de / Odeia:** `[AINDA NÃO RESPONDIDO]`

---

# 3. Arquitetura

## Mapa de telas

Está no `PRD-FRONTEND.md`, seção "Mapa de navegação". Resumo: **engenharia e visitante** têm barra inferior de 5 itens no celular e menu lateral de **13 itens** no computador; **mestre** tem barra inferior de 5 itens (Início, Diário, Pendências, Equipamentos, Mais).

## Processos automáticos

Detalhe (gatilho, passos, resultado, se falhar) no `PRD-BACKEND.md`. São cinco, todos já existentes:
1. **Nascer o perfil** ao ganhar login (sempre visitante).
2. **Carimbar `updated_at`** nas tabelas que têm.
3. **Pendência vencida vira atrasada** ao abrir a lista (só quando alguém abre; ninguém é avisado).
4. **Efetivo do dia ao vivo** do celular do mestre para a tela da engenharia.
5. **Pessoa nova no canteiro entra para revisão** (o mestre lança, a engenharia confere a documentação de segurança).

## Modelagem de dados

**27 tabelas**, descritas uma a uma no `PRD-BACKEND.md`. Traço central: **um banco = uma obra** (não existe tabela de obras).

## A pergunta de um ano

`[AINDA NÃO RESPONDIDO: daqui a um ano, com o sistema cheio, qual pergunta você vai querer fazer pra ele?]`

Já dá para dizer **o que o sistema consegue responder e o que não**:

| Pergunta possível | O dado existe? |
|---|---|
| Quantas pessoas por empresa por dia? Produtividade por frente? | **Sim** (`efetivo_rdo` guarda desde o primeiro dia) |
| Quantas pendências abertas por empresa? Quanto tempo levam para resolver? | **Sim** (datas de cada mudança) |
| Quanto a obra está atrasada em cada tarefa, ao longo do tempo? | **Sim** (`cronograma_avanco` guarda uma foto por dia) |
| Quantos dias choveu? Qual a causa que mais para a obra? | **Não direto**: a ocorrência grava os tipos juntos num texto só |
| Quanto gastei de mão de obra por empreiteiro? Por obra? | **Não**: não há custo em lugar nenhum |
| Quanto custou cada equipamento locado? | **Não**: só datas e renovações |
| Comparar duas obras | **Não**: o sistema tem uma obra só |

> Dado que não foi guardado não volta. Se a sua pergunta cair numa linha "Não", ela tem que entrar **agora**.

## Melhorias para a v2

- **Segunda obra** — hoje é um banco por obra; criar `obras` mexe em quase todas as tabelas.
- **Permissões do mestre no banco** — só apagar e ver valor para a engenharia.
- **Ligar tudo por `id`** em vez de por nome (fornecedor, ambiente, autor).
- **Tipo de ocorrência** guardado à parte, para contar.
- **Custo** de mão de obra por empreiteira e de locação.
- **Aviso de pendência vencida** (hoje só muda de cor quando alguém abre).
- **Tema escuro**, se o canteiro pedir.
- **Enxugar:** os três jeitos de fazer o RDO (equipe, ambiente, clássico) e as telas gigantes.

---

# O tamanho do que já existe

O plano-padrão do pacote manda a v1 ficar em **até 6 telas, 7 tabelas e 2 processos**. O app tem hoje cerca de **26 telas, 27 tabelas e 5 processos**: quatro vezes o teto. Não é para cortar (já está construído e roda); é para **saber onde está o risco**: cada tela extra é uma que alguém precisa manter e testar.
`[AINDA NÃO RESPONDIDO: dos 13 módulos, quais você usa toda semana, quais uma vez por mês e quais nunca usou? Os do "nunca" são candidatos a congelar, não a apagar.]`

# A conta que vai chegar depois

Coisas que você sabe que precisam de resposta e ainda não tinham o dado. O detalhe técnico está no fim de cada PRD.

- `[PENDENTE: quantas obras vão usar o sistema?]` — custo: se for mais de uma, decisão de arquitetura antes de crescer.
- `[PENDENTE: permissões do mestre no banco]` — custo: regras por tipo em cerca de 10 tabelas e teste com um login de mestre.
- `[PENDENTE: benchmark não pesquisado]` — custo: sem a régua do "quanto custaria o pronto", o retorno do projeto fica no escuro.
- `[PENDENTE: plano e limite do Supabase]` — custo: fotos e plantas em PDF enchem o gratuito; conferir antes de acontecer.
- `[PENDENTE: backup do banco]` — custo: sem rotina conferida, um erro no banco não volta.
- `[PENDENTE: conferir as telas marcadas A CONFERIR no PRD-FRONTEND]` — custo: uma rodada no app real, com login do mestre.
- `[PENDENTE: quem é o visitante e se o mestre já usa]` — custo: se o mestre nunca opinou, é o maior risco do projeto (o sistema é para ele usar, no celular, com sinal ruim).

# Decidir depois de usar

- `[DESCOBRIR NO USO: qual dos três jeitos de fazer o RDO o mestre realmente usa]` — por enquanto ficam os três.
- `[DESCOBRIR NO USO: se o menu de 13 itens da engenharia atrapalha]` — por enquanto fica.
- `[DESCOBRIR NO USO: qual fonte manda no nome da obra, `src/marca.js` ou a configuração do relatório]` — por enquanto valem as duas, cada uma em seu lugar.
- `[DESCOBRIR NO USO: "Meus to-dos"]` — por enquanto fica escondido, sem menu.
