# PRD Backend — SISTEMA ENGENHARIA

> Especificação dos dados e das permissões **como o banco está hoje** (levantada de `banco.sql`, das regras de acesso e da função de admin). Serve de base para decidir o que muda.
> Fonte das decisões: `PLANO-DO-PROJETO.md`.
> Rascunho v0 — 21/09/2026. Tudo aqui é fato lido do código. O que depende de decisão sua está marcado `[PENDENTE]`.

## Convenções (e onde o banco atual foge delas)

O modelo do pacote pede algumas convenções. Estado real do projeto:

| Convenção do modelo | No banco de hoje |
|---|---|
| Tabelas no plural, minúsculo, sem acento | Segue. Exceções de plural: `rdos`, `atividades_rdo`, `efetivo_rdo` (ok). |
| Toda tabela tem `id` e `created_at` | Quase. `projetos_dependencias` (chave composta) e `relatorio_semanal_config` (`id` fixo = 1) fogem, e não têm `created_at` completo na segunda. |
| `id` inteiro | **Todos os ids são `uuid`** (gerado pelo banco). O modelo sugere inteiro; não vale trocar agora. |
| Chave estrangeira termina em `_id` | Segue onde existe FK. **Mas várias ligações são por nome em texto**, sem FK (ver "Ligações por nome"). |
| Lista fechada vira CHECK | Só em 8 campos. Vários campos de lista **não têm trava** (ver "Listas abertas"). |
| `profiles` com `email` e `ativo` | `profiles` **não guarda e-mail nem ativo**: o e-mail mora no login (Auth) e o painel de admin lê de lá. |
| Dinheiro `numeric(14,2)` | `valor_contrato` é `numeric` sem precisão. |
| Foto e PDF no Storage, banco guarda o link | Segue. Bucket `fotos`. |

### Ligações por nome (sem FK)
Guardam o **nome** em texto em vez do `id`. Se o nome for renomeado em Cadastros, o histórico antigo deixa de casar:

- `atividades_rdo.empreiteiro`, `efetivo_rdo.empreiteiro`, `ocorrencias.empresa`, `pendencias.empresa`, `rdo_fotos.empresa` → nome do fornecedor.
- `atividades_rdo.ambiente`, `pendencias.ambiente`, `rdo_fotos.ambiente` → nome do ambiente. `pavimento` idem.
- `efetivo_rdo.colaborador_nome` (além do `colaborador_id`).
- Autoria: `criada_por_nome`, `autor_nome`, `criado_por_nome`, `submetido_por_nome`, `cadastrado_por`, `registrado_por`, `resolvida_por` → texto, não `profiles.id`.
- `contratacoes.responsavel_nome` (além de `responsavel_id`), `contratacoes.fornecedor_nome`.

### Listas abertas (campo de lista sem CHECK)
Se a tela e o banco divergirem, nada falha: grava valor "estranho". Onde há lista, ela está só no código:
`atividades_rdo.motivo_nao_exec` (grava **códigos opacos** `m1` a `m10`, ex.: `m2` = "Falta de material"; a tradução só existe em `src/data/index.js`, então reordenar ou renumerar aquela lista corrompe o histórico), `projetos.status` (banco: padrão `'aguardando'`; a tela grava `nao_iniciado`, `em_andamento`, `recebido` — **o padrão do banco nunca é usado**), `projetos.disciplina`, `projetos.etapa`, `projetos.prazo_tipo`, `projetos_comentarios.tipo`, `contratacoes_comentarios.etapa`, `colaboradores.funcao`, `ocorrencias.categoria`, `ocorrencias.turno`, `rdo_fotos.status`, `planta_marcacoes.tipo`.

### Uma obra só
Não existe tabela `obras`. O nome da obra e a data de início vêm de `src/marca.js`. Três travas reforçam: `rdos.data` é **único no banco inteiro** (um RDO por dia, sem separar por obra), `cronograma_itens.wbs_id` é único no banco inteiro, e `relatorio_semanal_config` tem uma linha só (`id = 1`). **Um banco = uma obra.** Para uma segunda obra hoje, é um segundo banco. `[PENDENTE: quantas obras vão usar este sistema?]`

---

## Acesso e configuração

### Tabela `profiles`
Liga o login à pessoa e guarda o tipo de acesso. É ela que manda nas permissões.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave; **é o id do login** (FK para o Auth, apaga junto) |
| nome | text | sim | única coisa que a própria pessoa pode alterar |
| role | text | sim | CHECK: `mestre`, `engenheiro`, `visitante` |
| is_admin | boolean | sim | padrão falso. CHECK: **visitante nunca é admin** |
| created_at | timestamptz | não | automático |

Criada automaticamente por gatilho quando alguém ganha login, sempre como `visitante`, sem admin. O tipo de acesso **nunca** vem do cadastro.

### Tabela `relatorio_semanal_config`
Dados fixos do cabeçalho do relatório em PDF. **Uma linha só** (`id = 1`), criada vazia pelo `banco.sql`.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | integer | sim | CHECK `= 1` |
| obra_codigo, obra_local, arquiteto | text | sim | padrão vazio |
| cliente | text | não | |
| data_inicio_obra | date | não | |
| capa_padrao_url, logo_url | text | não | links no Storage |
| assinaturas | jsonb | sim | lista, padrão vazia |
| updated_at | timestamptz | sim | automático (gatilho) |

> Nota: o app também lê `src/marca.js` (nome da obra, início). Hoje **duas fontes** dizem o nome da obra e a data de início. `[DESCOBRIR NO USO: qual das duas manda]`

---

## Cadastros base

### Tabela `ambientes`
Os lugares da obra (Térreo, 1º Pavimento, Área externa...).

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| pavimento | text | não | padrão vazio; agrupa ambientes |
| ordem | integer | não | padrão 0 |
| created_at | timestamptz | não | |

### Tabela `empreiteiros`
Empresas/fornecedores que trabalham na obra.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| cor | text | não | padrão `#888888`; identifica a empresa nas telas |
| created_at | timestamptz | não | |

### Tabela `colaboradores`
Pessoas que aparecem no efetivo do dia.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| funcao | text | não | padrão `Oficial`; lista aberta |
| empreiteiro_id | uuid | não | FK `empreiteiros`; ao apagar a empresa, fica sem empresa |
| iniciais | text | não | |
| ativo | boolean | não | padrão verdadeiro |
| pendente_revisao | boolean | não | verdadeiro quando o **mestre** cadastra alguém novo no efetivo; a engenharia confere (ver processos) |
| cadastrado_por | text | não | nome de quem cadastrou |
| created_at | timestamptz | não | |

Índice parcial em `pendente_revisao`.

---

## Diário de obra (RDO)

### Tabela `rdos`
O diário do dia. **Um por data** (`data` única).

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| data | date | sim | padrão hoje; **único** |
| submetido | boolean | não | padrão falso; verdadeiro = diário enviado |
| submetido_em | timestamptz | não | |
| submetido_por_nome | text | não | |
| efetivo_draft | jsonb | sim | rascunho do efetivo do dia, atualizado ao vivo pelo mestre |
| created_at | timestamptz | não | |

Relações: tem vários `atividades_rdo`, `efetivo_rdo`, `rdo_fotos` (apagar o RDO apaga esses); tem várias `ocorrencias` (**sem** apagar em cascata: apagar um RDO com ocorrências é recusado).

### Tabela `atividades_rdo`
As frentes de serviço planejadas/executadas. **Serve também ao Planejamento semanal** (uma atividade tem dias da semana e status por dia).

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| rdo_id | uuid | não | FK `rdos`, apaga em cascata |
| descricao | text | sim | |
| ambiente | text | não | nome do ambiente |
| empreiteiro | text | não | nome do fornecedor |
| status | text | não | CHECK: `pendente`, `em_andamento`, `feita`, `parcial`, `nao_feita`; padrão `pendente` |
| motivo_nao_exec | text | não | por que não foi feita |
| dias_semana | text[] | não | dias em que ocorre; vazio = atividade avulsa |
| status_por_dia | jsonb | sim | status de cada dia; padrão `{}` |
| data_inicio, data_conclusao | date | não | |
| cronograma_item_id | uuid | não | FK `cronograma_itens`; ao apagar o item, desvincula |
| created_at | timestamptz | não | |

### Tabela `efetivo_rdo`
Quem trabalhou no dia, em qual frente.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| rdo_id | uuid | não | FK `rdos`, apaga em cascata |
| colaborador_id | uuid | não | FK `colaboradores` (sem regra de exclusão: apagar um colaborador com histórico é recusado) |
| colaborador_nome | text | sim | nome no dia |
| empreiteiro | text | não | nome do fornecedor |
| atividade_descricao | text | não | frente em que trabalhou |
| created_at | timestamptz | não | |

### Tabela `ocorrencias`
Fatos do dia (chuva, acidente, falta de material...).

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| rdo_id | uuid | não | FK `rdos` (sem cascata) |
| data | date | não | padrão hoje |
| categoria | text | não | lista aberta |
| descricao | text | sim | |
| empresa | text | não | nome do fornecedor |
| turno | text | não | lista aberta |
| fotos | integer | não | **só a contagem**; as fotos ficam em `rdo_fotos` |
| criada_por_nome, registrado_por | text | não | dois campos de autoria |
| created_at | timestamptz | não | |

### Tabela `rdo_fotos`
Fotos do dia, catalogadas por local e serviço.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| rdo_id | uuid | não | FK `rdos`, apaga em cascata |
| atividade_id | uuid | não | FK `atividades_rdo`; ao apagar, desvincula |
| data | date | sim | |
| pavimento, ambiente, servico, empresa, status | text | não | nomes em texto |
| legenda | text | não | |
| url | text | sim | link público no Storage |
| storage_path | text | não | caminho no Storage (para apagar o arquivo) |
| autor_nome | text | não | |
| created_at | timestamptz | sim | |

Índices: `rdo_id`, `data`, `ambiente`.

---

## Pendências

### Tabela `pendencias`
Coisas a resolver na obra, com prazo, responsável e fotos do problema e da solução.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| numero | text | não | número de exibição |
| titulo | text | sim | |
| descricao | text | não | |
| ambiente, pavimento | text | não | nomes em texto |
| empresa | text | não | quem resolve (nome do fornecedor) |
| prazo | date | não | |
| status | text | não | CHECK: `aberta`, `em_andamento`, `atrasada`, `resolvida`, `fechada`; padrão `aberta` |
| prioridade | text | não | CHECK: `alta`, `media`, `baixa`; padrão `media` |
| em_andamento_em, resolvida_em, fechada_em | date | não | datas de cada mudança |
| criada_por_nome, criado_por, resolvida_por | text | não | autoria |
| historico | jsonb | sim | linha do tempo; padrão `[]` |
| foto_problema, foto_solucao, foto_url | text | não | links no Storage (`foto_url` é campo antigo) |
| fotos | integer | não | contagem |
| created_at | timestamptz | não | |

Índices: `status`, `prazo`.
Regra: ao abrir a lista, toda pendência `aberta` ou `em_andamento` com prazo vencido vira `atrasada` (feito pelo app, não pelo banco).

---

## Cronograma da obra

### Tabela `cronograma_itens`
Árvore de tarefas (EAP): grupos e tarefas, importadas de planilha.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| wbs_id | integer | sim | número da tarefa; **único** |
| pai_wbs_id | integer | não | `wbs_id` do grupo pai (sem FK) |
| nome | text | sim | |
| is_grupo | boolean | não | grupo (soma filhos) ou tarefa |
| ordem | integer | não | |
| duracao_dias | integer | não | |
| inicio_previsto, termino_previsto | date | não | |
| inicio_real | date | não | |
| percentual | integer | não | 0 a 100 (CHECK); padrão 0 |
| concluido, concluido_em | boolean, date | não | |
| revisao | text | não | |
| datas_ajustadas | boolean | não | tarefa com data mexida à mão |
| observacao | text | não | |
| created_at, updated_at | timestamptz | não | `updated_at` por gatilho |

Índices: `ordem`, `pai_wbs_id`.

### Tabela `cronograma_avanco`
Foto do percentual de cada tarefa numa data. Alimenta a curva S.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| item_id | uuid | sim | FK `cronograma_itens`, apaga em cascata |
| data_ref | date | sim | |
| percentual | integer | sim | 0 a 100 (CHECK) |
| created_at | timestamptz | não | |

Regra: **um registro por tarefa por dia** (`item_id` + `data_ref` únicos).

---

## Contratações

### Tabela `contratacoes`
Processos de contratar projeto, mão de obra, material ou equipamento, do pedido à aprovação.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| descricao | text | sim | |
| tipo | text | sim | CHECK: `projeto`, `mao_de_obra`, `material`, `equipamento` |
| status | text | sim | CHECK: `em_aberto`, `enviado`, `aprovado`; padrão `em_aberto` |
| numero_contratacao | text | não | |
| responsavel_id | uuid | não | FK `contratacoes_responsaveis`; ao apagar, fica sem responsável |
| responsavel_nome | text | não | cópia do nome |
| fornecedor_nome | text | não | |
| prazo_envio, data_envio | date | não | |
| prazo_aprovacao, data_aprovacao | date | não | |
| valor_contrato | numeric | não | **dinheiro** |
| created_at, updated_at | timestamptz | não | `updated_at` por gatilho |

Índices: `status`, `data_aprovacao`.

### Tabela `contratacoes_comentarios`
Notas e pontos em aberto de cada etapa da contratação.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| contratacao_id | uuid | sim | FK `contratacoes`, apaga em cascata |
| etapa | text | sim | padrão `em_aberto`; lista aberta |
| texto | text | sim | |
| resolvido | boolean | sim | padrão falso |
| autor_nome | text | não | |
| created_at, updated_at | timestamptz | sim | |

### Tabela `orcamento_itens`
Os itens (descrição, quantidade, preço) do orçamento de uma contratação. Tela **Orçamentos**, só engenharia.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras` |
| contratacao_id | uuid | sim | FK `contratacoes`, **apaga em cascata** — apagar a contratação apaga o orçamento dela junto |
| descricao | text | sim | |
| unidade | text | sim | texto livre (m², un, vb…), padrão vazio |
| quantidade | numeric | sim | padrão 0 |
| preco_unitario | numeric | sim | **dinheiro**, padrão 0 |
| ordem | integer | sim | ordem de exibição, padrão 0 |
| created_at, updated_at | timestamptz | sim | `updated_at` por gatilho |

Índices: `obra_id`, `contratacao_id`.

### Tabela `orcamento_eap`
O **orçamento da obra** em EAP: uma linha por item (1, 1.1, 1.1.1…). É o primeiro passo: dele saem o cronograma e a medição. Tela **Orçamento da obra** (só engenharia). Diferente de `orcamento_itens`, que é o orçamento de compra de cada contratação.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras` |
| codigo | text | sim | o item da EAP (`1`, `1.2`, `1.2.3`); **único por obra** (`obra_id, codigo`) |
| pai_codigo | text | não | código do pai (o pai é o código sem o último trecho); vazio no 1º nível |
| descricao | text | sim | |
| unidade | text | sim | texto livre, padrão vazio |
| quantidade, preco_unitario | numeric | sim | **dinheiro** no preço; CHECK ≥ 0; ficam em 0 nos grupos |
| is_grupo | boolean | sim | grupo = tem filhos; vale a **soma dos filhos** (calculada na tela, não guardada) |
| ordem | integer | sim | ordem de exibição |
| created_at, updated_at | timestamptz | sim | `updated_at` por gatilho |

Aprovar o orçamento grava `obra_contrato` (`valor_aprovado` = total, `aprovado_em`). Depois de aprovado, a **tela** trava as linhas — o banco não impede (a trava de verdade é só a do mês fechado, abaixo).

### Tabela `medicoes_mensais`
Uma medição por obra por mês, no fim do mês. Tela **Medições**.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras` |
| mes | date | sim | sempre o **dia 1** do mês (CHECK); único por obra (`obra_id, mes`) |
| status | text | sim | CHECK: `aberta`, `fechada`; `fechada` exige `fechada_em` |
| fechada_em, fechada_por_nome | timestamptz, text | não | |
| created_at, updated_at | timestamptz | sim | |

### Tabela `medicao_itens`
O **% acumulado** (0–100, CHECK) de cada linha do orçamento naquele mês. Único por (`medicao_id, eap_id`); apagar a medição ou a linha do orçamento apaga em cascata. **Valor do mês = valor da linha × (% deste mês − % do mês anterior) / 100.** Linha sem lançamento no mês continua no % do mês anterior.

**Mês fechado não muda (gatilhos, `SECURITY DEFINER`, `20260927` + `20260928-medicao-travas-reforco`):** `trava_medicao_fechada` recusa inserir, alterar, **mover** e apagar itens de uma medição `fechada` (olha a medição de antes e a de depois) e exige que item, medição e linha do orçamento sejam da **mesma obra**; `trava_apagar_medicao_fechada` recusa apagar a medição fechada; `trava_alterar_medicao` não deixa mudar obra/mês e só deixa **reabrir a última** medição da obra; `trava_valores_orcamento` recusa mudar quantidade/preço/grupo/código do orçamento enquanto houver mês fechado. Índice único parcial: **uma só medição aberta por obra**. `medicao_itens.eap_id` é `ON DELETE RESTRICT` (apagar linha do orçamento com medição dá erro). `cronograma_itens.orcamento_eap_id` é único (uma tarefa por linha). O único caminho para mexer no mês fechado é **reabrir**. Só o mês **fechado** entra no Contas a receber.

**Acesso (as três — `orcamento_eap`, `medicoes_mensais`, `medicao_itens`):** RLS por obra + `not e_visitante()`, como as contas. Também `cronograma_itens.orcamento_eap_id` (FK `orcamento_eap`, `ON DELETE SET NULL`): de que linha do orçamento a tarefa nasceu.

**Chaves únicas antigas removidas** (`20260927`): `rdos_data_key`, `cronograma_itens_wbs_id_key`, `planta_etapas_nome_key` valiam para o banco inteiro e impediam duas obras de ter RDO no mesmo dia. Valem só as por obra (`obra_id, …`).

### Tabela `medicoes_obra` (em desuso)
O modelo antigo: um % geral da obra por data. **A tela não usa mais** (a medição agora é por linha, em `medicoes_mensais`); a tabela e os dados ficam — nunca se apaga por limpeza.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras` |
| data | date | sim | única por obra (`obra_id, data`) — uma medição por dia |
| percentual | numeric | sim | CHECK: 0 a 100 |
| observacoes | text | não | |
| responsavel_nome | text | não | nome de quem registrou |
| created_at, updated_at | timestamptz | sim | `updated_at` por gatilho |

Não existe edição pela tela — só apagar e registrar de novo (a chave única por dia não deixa duplicar).

### Tabela `contas_pagar`
Dois tipos de conta numa tabela só: o pagamento de **uma pessoa da equipe própria numa quinzena** (`mao_de_obra`) e **despesas** lançadas à mão (`despesa`). Telas **Contas a pagar** (abas Mão de obra e Despesas).

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras` |
| tipo | text | sim | CHECK: `mao_de_obra`, `despesa` |
| descricao, categoria | text | sim | padrão vazio; categoria é texto livre |
| colaborador_id | uuid | não | FK `colaboradores`; ao apagar, fica sem id (o nome permanece) |
| colaborador_nome | text | só `mao_de_obra` | ligação por nome, como no resto da base |
| competencia_inicio, competencia_fim | date | só `mao_de_obra` | a quinzena paga (1–15 ou 16–fim do mês) |
| dias | integer | sim | dias presente no pagamento (retrato); CHECK ≥ 0 |
| valor_diaria | numeric | sim | **dinheiro**; retrato da diária no dia do pagamento |
| ajuste | numeric | sim | adicional − desconto, com sinal |
| valor | numeric | sim | **dinheiro**, total pago/a pagar; CHECK ≥ 0 |
| vencimento | date | não | usado nas despesas |
| status | text | sim | CHECK: `aberto`, `pago`; `pago` exige `pago_em` |
| pago_em | date | não | |
| observacoes | text | não | |
| created_at, updated_at | timestamptz | sim | `updated_at` por gatilho |

Chave única parcial: (`obra_id`, minúsculo de `colaborador_nome`, `competencia_inicio`) só para `mao_de_obra` — ninguém é pago duas vezes na mesma quinzena. CHECKs: `valor >= 0`, `dias >= 0`, `valor_diaria >= 0`; `mao_de_obra` exige nome e quinzena; `pago` exige `pago_em`; `despesa` exige `vencimento` e `valor > 0`. Índices: `obra_id`, `(obra_id, competencia_inicio)`, `(obra_id, vencimento)`, `colaborador_id`.

**Acesso (as três tabelas financeiras — `contas_pagar`, `recebimentos`, `obra_contrato`):** RLS **por obra desde já** — lê e grava só quem **não é visitante** e tem a obra em `minhas_obras()` (administrador vê todas). É mais rígido que o resto da base (que só chega a isso na fatia 3) de propósito: é dinheiro e salário. Mestre e engenharia continuam iguais entre si.

### Tabela `recebimentos`
Dinheiro que entrou (o cliente pagou), lançado à mão. Tela **Contas a receber**.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras` |
| data | date | sim | |
| valor | numeric | sim | **dinheiro**; CHECK > 0 |
| descricao | text | sim | padrão vazio |
| created_at, updated_at | timestamptz | sim | |

### Tabela `obra_contrato`
O **valor fechado com o cliente** (orçamento aprovado) de cada obra: gravado quando a engenharia **aprova o Orçamento da obra** (`valor_aprovado` = total da EAP, `aprovado_em` = hoje). **Aprovado = `aprovado_em` preenchida.** Ao reabrir (só sem nenhuma medição) só a data de aprovação é limpa. O "a receber" sai das **medições mensais fechadas** contra os recebimentos.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| obra_id | uuid | sim | FK `obras`; **única** — uma linha por obra |
| valor_aprovado | numeric | sim | **dinheiro**; CHECK ≥ 0 |
| aprovado_em | date | não | |
| observacoes | text | não | |
| created_at, updated_at | timestamptz | sim | |

Também: `colaboradores.valor_diaria` (numeric, nulo, CHECK `>= 0`) — quanto vale o dia da pessoa, usado para calcular a quinzena. **Global entre obras** (a tabela não tem `obra_id`) e legível pelo visitante, que lê `colaboradores`.

### Tabela `contratacoes_responsaveis`
Lista de quem responde pelas contratações.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| created_at | timestamptz | não | |

---

## Equipamentos

### Tabela `equipamentos`
Equipamentos locados: prazo, renovação e devolução.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| fornecedor | text | não | |
| tipo_locacao | text | não | CHECK: `diaria`, `semanal`, `quinzenal`, `mensal`, `outro`; padrão `mensal` |
| data_recebimento | date | sim | padrão hoje |
| data_fim_previsto | date | sim | |
| status | text | sim | CHECK: `ativo`, `devolvido`; padrão `ativo` |
| renovacoes | integer | sim | quantas vezes renovou; padrão 0 |
| data_devolucao_agendada | date | não | |
| data_devolucao | date | não | |
| observacoes | text | não | |
| created_at | timestamptz | sim | |

Índice: `status`. **Não guarda custo da locação.**

---

## Projetos (entregas de projeto/documentos)

### Tabela `projetos`
Cada projeto/documento que alguém precisa entregar (arquitetônico, hidráulico...), com prazo e dependências.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| disciplina | text | não | lista aberta |
| etapa | text | não | lista aberta |
| responsavel_nome | text | não | |
| status | text | sim | **sem CHECK**; a tela usa `nao_iniciado`, `em_andamento`, `recebido` (o padrão do banco é `aguardando`) |
| data_prevista, data_recebida | date | não | |
| data_inicio, duracao_dias | date, integer | não | |
| prazo_dias, prazo_tipo | integer, text | não | prazo relativo (lista aberta) |
| predecessor_id | uuid | não | FK `projetos`; ao apagar o predecessor, desvincula |
| revisao | text | não | |
| ordem | integer | não | |
| oculto | boolean | sim | padrão falso; esconde da lista |
| observacao | text | não | |
| created_at | timestamptz | sim | |

Índice: `data_prevista`.

### Tabela `projetos_dependencias`
Um projeto depende de outro (vários por projeto). Chave composta.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| projeto_id | uuid | sim | FK `projetos`, apaga em cascata |
| depende_de_id | uuid | sim | FK `projetos`, apaga em cascata; CHECK: diferente de `projeto_id` |
| created_at | timestamptz | sim | |

### Tabela `projetos_comentarios`
Notas e pontos em aberto por projeto.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| projeto_id | uuid | não | FK `projetos`, apaga em cascata |
| tipo | text | sim | padrão `nota`; lista aberta |
| texto | text | sim | |
| data | date | sim | padrão hoje |
| resolvido | boolean | sim | padrão falso |
| autor_nome | text | não | |
| created_at, updated_at | timestamptz | sim | `updated_at` por gatilho |

---

## Gestão visual (plantas)

### Tabela `plantas_visuais`
Planta (imagem) de um pavimento, sobre a qual se pinta o que foi executado.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | |
| pavimento | text | não | |
| imagem_url | text | sim | link no Storage |
| largura, altura | integer | sim | tamanho da imagem |
| textos | jsonb | não | textos escritos sobre a planta |
| created_at | timestamptz | sim | |

### Tabela `planta_etapas`
As "cores" do acompanhamento (Fundação, Formas...), com meta.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | **único** |
| cor | text | sim | |
| ordem | integer | sim | padrão 0 |
| ativa | boolean | sim | padrão verdadeiro |
| meta | numeric | não | quantidade prevista |
| unidade | text | sim | padrão `un` |
| created_at | timestamptz | sim | |

### Tabela `planta_marcacoes`
Cada traço/pintura/objeto marcado na planta.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| planta_id | uuid | sim | FK `plantas_visuais`, apaga em cascata |
| etapa | text | sim | nome da etapa (texto, sem FK) |
| cor | text | sim | |
| tipo | text | sim | lista aberta (forma da marcação) |
| pontos | jsonb | sim | geometria |
| data | date | sim | padrão hoje |
| rotulo, nota | text | não | |
| quantidade | numeric | não | |
| rotacao, espessura | numeric | sim | padrão 0 e 1 |
| lote, lote_cor | text | não | viagem/lote (placa + nota) e sua cor |
| substitui | uuid | não | FK `planta_marcacoes`; marcação que esta refez |
| criado_por_nome | text | não | |
| created_at | timestamptz | sim | |

Índice: `planta_id`.

---

## Visitas e reuniões

### Tabelas `visitas` e `reunioes`
Registros de visita técnica e de reunião. **Mesma estrutura**, tabelas separadas.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| data | date | `visitas` sim; `reunioes` não | `visitas`: padrão hoje |
| assunto | text | não | |
| empresas | jsonb | `visitas` sim | quem estava presente (empresas e pessoas), padrão `[]` |
| itens | jsonb | `visitas` sim | itens da ata, padrão `[]` |
| prevista | boolean | sim | agendada e ainda não realizada |
| grupo_id | uuid | sim | agrupa registros do mesmo dia/evento |
| ata_url, ata_nome | text | não | ata em arquivo no Storage |
| created_at | timestamptz | não/sim | |

Índices: `grupo_id`; `visitas` também por `data`.

### Tabela `visitas_dir_empresas`
Agenda de empresas para sugerir ao registrar visita.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| nome | text | sim | **único** |
| created_at | timestamptz | sim | |

### Tabela `visitas_dir_pessoas`
Agenda de pessoas por empresa.

| Campo | Tipo | Obrigatório | Observação |
|---|---|---|---|
| id | uuid | sim | chave |
| empresa_nome | text | sim | nome da empresa (texto) |
| nome | text | sim | |
| cargo | text | não | |
| created_at | timestamptz | sim | |

Regra: o par (`empresa_nome`, `nome`) é **único**.

---

## Permissões

Escrito em português. É o que o banco faz **hoje** (regras de acesso do `banco.sql`).

### Regra geral (27 tabelas, exceto as duas abaixo)
- **Ver:** qualquer pessoa com login, de qualquer tipo (mestre, engenheiro, visitante). Sem login, nada.
- **Criar, editar e apagar:** qualquer pessoa com login que **não** seja visitante. **Mestre e engenheiro têm exatamente o mesmo poder no banco.** Quem não tem perfil é tratado como visitante (só lê).
- A diferença entre mestre e engenheiro é **só da interface** (o que o menu mostra). O banco não a impõe.

### `profiles`
- **Ver:** todos com login (todos veem nome e tipo de todos).
- **Criar:** ninguém pelo app (nasce por gatilho no cadastro do login).
- **Editar:** cada um altera **só o próprio nome**. Tipo de acesso e admin só mudam pelo painel de admin (função com chave de serviço) ou por SQL do dono.
- **Apagar:** ninguém pelo app. Apagar o login apaga o perfil.

### `relatorio_semanal_config`
- **Ver e editar:** como a regra geral.
- **Apagar:** o banco permite, mas a linha `id = 1` não pode faltar. `[PENDENTE: bloquear exclusão no banco]`

### Arquivos (bucket `fotos`)
- **Ver:** quem tiver o **link** vê sem login (bucket público; o nome do arquivo é difícil de adivinhar, a lista não é aberta).
- **Enviar, trocar, apagar:** quem tem login e não é visitante.
- Limite de 25 MB por arquivo. Tipos aceitos: JPEG, PNG, WebP, HEIC, HEIF, PDF.

### Consequências que pedem decisão sua
Isto é o "quem vê o quê" que o banco permite, e é mais aberto que a interface sugere:

1. **O mestre pode apagar qualquer registro** de qualquer tabela chamando o banco direto. A interface dele esconde a maior parte dos botões de apagar (nas Pendências, por exemplo), mas o banco não recusa. E a Galeria de fotos, que ele acessa pelo menu "Mais", tem exclusão de foto. `[A CONFERIR: se essa exclusão aparece para o mestre]`
2. **O mestre pode ler `contratacoes.valor_contrato`** (dinheiro) e os dados de fornecedor, mesmo a interface não mostrando a tela de Contratações para ele.
3. **Fotos são acessíveis por link sem login.**

`[PENDENTE: decidir se mestre precisa ser restringido no banco (ex.: só engenharia apaga e vê valores) ou se a confiança na equipe basta]`

---

## Fluxo de cadastro e liberação

Diferente do modelo do pacote (cadastro livre + liberação): aqui **não existe cadastro pela tela de login**.

1. O administrador entra no **Painel de admin** e cria o usuário (e-mail e senha de pelo menos 8 caracteres), já escolhendo o tipo: engenheiro, mestre ou visitante.
2. O login é criado já confirmado; o gatilho cria o perfil como visitante; o painel então grava o tipo escolhido.
3. Quem tem e-mail do domínio da casa (definido em `src/marca.js`) digita só o usuário no login; quem tem e-mail de fora digita completo.
4. Quem ganhar login por outro caminho (direto no Supabase) nasce **visitante**, só lê.
5. **O primeiro administrador** não pode ser criado pelo painel (o painel exige admin). Sai por SQL do dono, conforme o `COMECE-AQUI.md`.

Regras do painel (função `admin-usuarios`, valem sempre, conferidas no servidor):
- Só quem tem `is_admin` chama.
- Visitante nunca é admin.
- O admin não remove o próprio acesso, não vira visitante e não apaga a própria conta.
- Ações: listar (até 200 usuários), criar, atualizar (nome, tipo, admin, e-mail, senha), apagar.

---

## Processos automáticos

### Nascer o perfil
- **Gatilho:** alguém ganha login.
- **Passos:** o banco cria o perfil com o nome (ou o e-mail) como visitante sem admin.
- **Resultado:** a pessoa entra sem poder alterar nada, até o admin liberar.
- **Se falhar:** o login existe sem perfil; o app o trata como sem acesso ("Seu acesso ainda não foi liberado") e o `e_visitante` o trata como só leitura.

### Atualizar `updated_at`
- **Gatilho:** editar linha de `cronograma_itens`, `contratacoes`, `contratacoes_comentarios`, `projetos_comentarios` ou `relatorio_semanal_config`.
- **Resultado:** o banco carimba a hora.
- **Se falhar:** a edição inteira falha.

### Pendência vencida vira atrasada
- **Gatilho:** abrir a lista de Pendências.
- **Passos:** o app procura `aberta`/`em_andamento` com prazo antes de hoje e atualiza para `atrasada`.
- **Resultado:** o status muda uma vez, no carregamento.
- **Se falhar:** registra erro no console e mostra o status antigo; **ninguém é avisado**. Não roda sozinho: só quando alguém abre a tela.

### Efetivo do dia ao vivo
- **Gatilho:** o mestre altera o efetivo (`rdos.efetivo_draft`) ou envia o diário.
- **Passos:** o banco publica a mudança em tempo real (`rdos`, `atividades_rdo`, `ocorrencias`).
- **Resultado:** a tela da engenharia atualiza sem recarregar.
- **Se falhar:** a tela da engenharia fica com o dado de quando abriu. O rascunho também fica no aparelho como amortecedor do dia.

### Pessoa nova no canteiro entra para revisão
- **Gatilho:** o mestre lança no efetivo alguém que não está no cadastro.
- **Passos:** cria o colaborador com `pendente_revisao = verdadeiro` e `cadastrado_por`.
- **Resultado:** a engenharia vê o aviso "N pessoas novas no canteiro. Confira a documentação de segurança do trabalho antes de liberar" e marca cada uma como conferida.
- **Se falhar:** o colaborador não é criado e o efetivo do dia não o inclui.

## Critérios de aceite

- [ ] Um login recém-criado é visitante e não consegue criar, editar nem apagar nada.
- [ ] Ninguém consegue trocar o próprio tipo de acesso nem virar admin pelo app.
- [ ] Visitante nunca é admin (o banco recusa a combinação).
- [ ] Só um RDO por data; tentar um segundo na mesma data é recusado.
- [ ] Os valores de status do banco (atividades, pendências, contratações, equipamentos, tipo de contratação, prioridade) são **idênticos** aos usados nas telas.
- [ ] Apagar um RDO apaga suas atividades, efetivo e fotos.
- [ ] Apagar uma tarefa do cronograma não apaga as atividades ligadas a ela: só desvincula.
- [ ] Um percentual de cronograma fora de 0–100 é recusado.
- [ ] `[a decidir]` O mestre não consegue apagar registro de outras áreas, nem ler valor de contrato.

## A conta que vai chegar depois

- `[PENDENTE: quantas obras?]` — hoje é um banco por obra. Se vier uma segunda, escolher entre segundo banco (simples, caro de manter) ou criar `obras` e ligar tudo a ela (mexe em quase todas as tabelas e nas travas de unicidade).
- `[PENDENTE: permissões do mestre]` — ver "Consequências que pedem decisão sua". Custo: RLS por tipo em ~10 tabelas e teste com um login de mestre.
- `[PENDENTE: ligações por nome]` — renomear fornecedor ou ambiente em Cadastros quebra a ligação com o histórico. Custo: migrar para `id`, tela de renomear com aviso, ou travar a renomeação.
- `[PENDENTE: autoria por nome]` — se alguém trocar de nome, o histórico continua com o nome antigo. Custo: guardar `profiles.id` ao lado do nome.
- `[PENDENTE: lista fechada em falta]` — `projetos.status`, `colaboradores.funcao` e outras não têm trava. Custo: CHECK depois de conferir os valores já gravados.
- `[PENDENTE: backup]` — não há rotina de backup documentada no projeto. Conferir no painel do Supabase.
- `[PENDENTE: senhas vazadas]` — o Supabase avisa que a proteção contra senhas vazadas está desligada; é um botão no painel de Auth.
- `[PENDENTE: pendências no tempo real]` — `pendencias` não está na publicação de tempo real; o contador precisa ser recarregado pelo app. Funciona, mas dois usuários simultâneos só se veem ao trocar de tela.
- `[PENDENTE: ocorrência com tipos num texto só]` — `ocorrencias.categoria` guarda os tipos marcados juntos ("Choveu, Faltou material"). Não dá para contar dias de chuva ou de falta de material sem separar o texto. Custo: guardar cada tipo à parte (campo de lista ou tabela filha) e migrar o que já existe.
- `[PENDENTE: foto removida deixa arquivo]` — no passo 4 do diário, o "×" na foto apaga só o registro em `rdo_fotos` (o código dessa tela não remove o arquivo do armazenamento; a galeria parece remover os dois). Arquivos órfãos ocupam espaço do plano gratuito sem aparecer em lugar nenhum. `[A CONFERIR na galeria]`
- `[PENDENTE: custo não guardado]` — não há valor de mão de obra por empreiteira nem custo de locação de equipamento. Só `valor_contrato`. Se a "pergunta de um ano" for financeira, o dado precisa entrar agora.

## Decidir depois de usar

- `[DESCOBRIR NO USO: fonte do nome da obra e da data de início]` — por enquanto valem `src/marca.js` (telas) e `relatorio_semanal_config` (PDF).
- `[DESCOBRIR NO USO: índices]` — o Supabase lista 27 índices sem uso e 7 chaves estrangeiras sem índice; com pouco dado é normal. Rever quando houver volume.
- `[DESCOBRIR NO USO: `visitas` e `reunioes` como duas tabelas iguais]` — por enquanto ficam separadas.
