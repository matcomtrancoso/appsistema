-- =========================================================================
--  FlowPlanner: banco de dados
--
--  Este arquivo monta, de uma vez, tudo o que o app precisa no Supabase.
--  Quem aplica é o agente, pelas ferramentas do Supabase, seguindo o
--  COMECE-AQUI.md. Ele vai inteiro, do começo ao fim, numa aplicação só.
--
--  É idempotente: pode rodar de novo sem medo. Nada aqui apaga dado. Tabela
--  que já existe fica como está; regra e função são substituídas pela versão
--  deste arquivo; a linha de configuração e o bucket de fotos não são
--  sobrescritos.
--
--  O que este arquivo cria:
--   - 27 tabelas (RDO, pendências, cronograma, visitas, projetos...)
--   - as ligações entre elas
--   - as regras de acesso: quem está logado vê e edita; "visitante" só vê
--   - o perfil que nasce sozinho quando alguém ganha login (sempre visitante)
--   - o armazenamento das fotos
--   - o tempo real do RDO e das ocorrências (celular e computador juntos)
-- =========================================================================


-- ========================================================================
-- FUNÇÕES DE APOIO
-- ========================================================================

-- Carimba a hora da última alteração.
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Quando alguém ganha login, nasce o perfil dele SÓ LEITURA (visitante, sem
-- administrador). Quem define o papel é o administrador (Painel de admin, pela
-- edge function) ou o update da ETAPA 5 do COMECE-AQUI. O papel NUNCA vem do
-- cadastro, porque esse dado é escrito por quem se cadastra.
-- (plpgsql: o corpo só é conferido quando roda, por isso pode vir antes das tabelas.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, nome, role, is_admin)
  values (new.id, coalesce(new.raw_user_meta_data->>'nome', new.email), 'visitante', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- A função e_visitante() fica no começo de REGRAS DE ACESSO, depois das
-- tabelas: ela é "language sql", e o Postgres confere o corpo na hora de criar.


-- ========================================================================
-- TABELAS
-- ========================================================================

create table if not exists public.profiles (
  id                         uuid not null,
  nome                       text not null,
  role                       text not null,
  created_at                 timestamptz default now(),
  is_admin                   boolean not null default false,
  constraint profiles_pkey PRIMARY KEY (id),
  constraint profiles_role_check CHECK ((role = ANY (ARRAY['mestre'::text, 'engenheiro'::text, 'visitante'::text])))
);

create table if not exists public.ambientes (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  ordem                      integer default 0,
  created_at                 timestamptz default now(),
  pavimento                  text default ''::text,
  constraint ambientes_pkey PRIMARY KEY (id)
);

create table if not exists public.cronograma_itens (
  id                         uuid not null default gen_random_uuid(),
  wbs_id                     integer not null,
  nome                       text not null,
  pai_wbs_id                 integer,
  is_grupo                   boolean default false,
  ordem                      integer,
  duracao_dias               integer,
  inicio_previsto            date,
  termino_previsto           date,
  revisao                    text,
  percentual                 integer default 0,
  inicio_real                date,
  concluido                  boolean default false,
  concluido_em               date,
  observacao                 text,
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now(),
  datas_ajustadas            boolean default false,
  constraint cronograma_itens_pkey PRIMARY KEY (id),
  constraint cronograma_itens_wbs_id_key UNIQUE (wbs_id),
  constraint cronograma_itens_percentual_check CHECK (((percentual >= 0) AND (percentual <= 100)))
);

create table if not exists public.rdos (
  id                         uuid not null default gen_random_uuid(),
  data                       date not null default CURRENT_DATE,
  submetido                  boolean default false,
  submetido_em               timestamptz,
  submetido_por_nome         text,
  created_at                 timestamptz default now(),
  efetivo_draft              jsonb not null default '[]'::jsonb,
  constraint rdos_pkey PRIMARY KEY (id),
  constraint rdos_data_key UNIQUE (data)
);

create table if not exists public.atividades_rdo (
  id                         uuid not null default gen_random_uuid(),
  rdo_id                     uuid,
  descricao                  text not null,
  ambiente                   text,
  empreiteiro                text,
  status                     text default 'pendente'::text,
  motivo_nao_exec            text,
  created_at                 timestamptz default now(),
  dias_semana                text[] default '{}'::text[],
  data_inicio                date,
  data_conclusao             date,
  status_por_dia             jsonb not null default '{}'::jsonb,
  cronograma_item_id         uuid,
  constraint atividades_rdo_pkey PRIMARY KEY (id),
  constraint atividades_rdo_status_check CHECK ((status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'feita'::text, 'parcial'::text, 'nao_feita'::text])))
);

create table if not exists public.empreiteiros (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  cor                        text default '#888888'::text,
  created_at                 timestamptz default now(),
  constraint empreiteiros_pkey PRIMARY KEY (id)
);

create table if not exists public.colaboradores (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  funcao                     text default 'Oficial'::text,
  empreiteiro_id             uuid,
  iniciais                   text,
  created_at                 timestamptz default now(),
  ativo                      boolean default true,
  pendente_revisao           boolean default false,
  cadastrado_por             text,
  constraint colaboradores_pkey PRIMARY KEY (id)
);

create table if not exists public.contratacoes_responsaveis (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  created_at                 timestamptz default now(),
  constraint contratacoes_responsaveis_pkey PRIMARY KEY (id)
);

create table if not exists public.contratacoes (
  id                         uuid not null default gen_random_uuid(),
  descricao                  text not null,
  tipo                       text not null,
  prazo_envio                date,
  responsavel_id             uuid,
  responsavel_nome           text,
  status                     text not null default 'em_aberto'::text,
  data_envio                 date,
  numero_contratacao         text,
  prazo_aprovacao            date,
  data_aprovacao             date,
  fornecedor_nome            text,
  created_at                 timestamptz default now(),
  updated_at                 timestamptz default now(),
  valor_contrato             numeric,
  constraint contratacoes_pkey PRIMARY KEY (id),
  constraint contratacoes_status_check CHECK ((status = ANY (ARRAY['em_aberto'::text, 'enviado'::text, 'aprovado'::text]))),
  constraint contratacoes_tipo_check CHECK ((tipo = ANY (ARRAY['projeto'::text, 'mao_de_obra'::text, 'material'::text, 'equipamento'::text])))
);

create table if not exists public.contratacoes_comentarios (
  id                         uuid not null default gen_random_uuid(),
  contratacao_id             uuid not null,
  etapa                      text not null default 'em_aberto'::text,
  texto                      text not null,
  resolvido                  boolean not null default false,
  autor_nome                 text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint contratacoes_comentarios_pkey PRIMARY KEY (id)
);

create table if not exists public.cronograma_avanco (
  id                         uuid not null default gen_random_uuid(),
  item_id                    uuid not null,
  data_ref                   date not null,
  percentual                 integer not null,
  created_at                 timestamptz default now(),
  constraint cronograma_avanco_pkey PRIMARY KEY (id),
  constraint cronograma_avanco_item_data_key UNIQUE (item_id, data_ref),
  constraint cronograma_avanco_percentual_check CHECK (((percentual >= 0) AND (percentual <= 100)))
);

create table if not exists public.efetivo_rdo (
  id                         uuid not null default gen_random_uuid(),
  rdo_id                     uuid,
  colaborador_nome           text not null,
  empreiteiro                text,
  atividade_descricao        text,
  created_at                 timestamptz default now(),
  colaborador_id             uuid,
  constraint efetivo_rdo_pkey PRIMARY KEY (id)
);

create table if not exists public.equipamentos (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  fornecedor                 text,
  tipo_locacao               text default 'mensal'::text,
  data_recebimento           date not null default CURRENT_DATE,
  data_fim_previsto          date not null,
  status                     text not null default 'ativo'::text,
  renovacoes                 integer not null default 0,
  observacoes                text,
  created_at                 timestamptz not null default now(),
  data_devolucao             date,
  data_devolucao_agendada    date,
  constraint equipamentos_pkey PRIMARY KEY (id),
  constraint equipamentos_status_check CHECK ((status = ANY (ARRAY['ativo'::text, 'devolvido'::text]))),
  constraint equipamentos_tipo_locacao_check CHECK ((tipo_locacao = ANY (ARRAY['diaria'::text, 'semanal'::text, 'quinzenal'::text, 'mensal'::text, 'outro'::text])))
);

create table if not exists public.ocorrencias (
  id                         uuid not null default gen_random_uuid(),
  rdo_id                     uuid,
  data                       date default CURRENT_DATE,
  categoria                  text,
  descricao                  text not null,
  criada_por_nome            text,
  fotos                      integer default 0,
  created_at                 timestamptz default now(),
  empresa                    text,
  turno                      text,
  registrado_por             text,
  constraint ocorrencias_pkey PRIMARY KEY (id)
);

create table if not exists public.pendencias (
  id                         uuid not null default gen_random_uuid(),
  numero                     text,
  titulo                     text not null,
  descricao                  text,
  ambiente                   text,
  empresa                    text,
  prazo                      date,
  status                     text default 'aberta'::text,
  prioridade                 text default 'media'::text,
  criada_por_nome            text,
  fotos                      integer default 0,
  created_at                 timestamptz default now(),
  foto_url                   text,
  em_andamento_em            date,
  resolvida_em               date,
  fechada_em                 date,
  historico                  jsonb not null default '[]'::jsonb,
  criado_por                 text,
  resolvida_por              text,
  foto_problema              text,
  foto_solucao               text,
  pavimento                  text,
  constraint pendencias_pkey PRIMARY KEY (id),
  constraint pendencias_prioridade_check CHECK ((prioridade = ANY (ARRAY['alta'::text, 'media'::text, 'baixa'::text]))),
  constraint pendencias_status_check CHECK ((status = ANY (ARRAY['aberta'::text, 'em_andamento'::text, 'atrasada'::text, 'resolvida'::text, 'fechada'::text])))
);

create table if not exists public.planta_etapas (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  cor                        text not null,
  ordem                      integer not null default 0,
  ativa                      boolean not null default true,
  meta                       numeric,
  unidade                    text not null default 'un'::text,
  created_at                 timestamptz not null default now(),
  constraint planta_etapas_pkey PRIMARY KEY (id),
  constraint planta_etapas_nome_key UNIQUE (nome)
);

create table if not exists public.plantas_visuais (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  imagem_url                 text not null,
  largura                    integer not null,
  altura                     integer not null,
  created_at                 timestamptz not null default now(),
  pavimento                  text,
  textos                     jsonb,
  constraint plantas_visuais_pkey PRIMARY KEY (id)
);

create table if not exists public.planta_marcacoes (
  id                         uuid not null default gen_random_uuid(),
  planta_id                  uuid not null,
  etapa                      text not null,
  cor                        text not null,
  tipo                       text not null,
  pontos                     jsonb not null,
  data                       date not null default CURRENT_DATE,
  criado_por_nome            text,
  created_at                 timestamptz not null default now(),
  substitui                  uuid,
  rotulo                     text,
  quantidade                 numeric,
  rotacao                    numeric not null default 0,
  espessura                  numeric not null default 1,
  lote                       text,
  nota                       text,
  lote_cor                   text,
  constraint planta_marcacoes_pkey PRIMARY KEY (id)
);

create table if not exists public.projetos (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  disciplina                 text,
  responsavel_nome           text,
  data_prevista              date,
  data_recebida              date,
  status                     text not null default 'aguardando'::text,
  predecessor_id             uuid,
  observacao                 text,
  created_at                 timestamptz not null default now(),
  data_inicio                date,
  duracao_dias               integer,
  ordem                      integer,
  oculto                     boolean not null default false,
  etapa                      text,
  revisao                    text,
  prazo_dias                 integer,
  prazo_tipo                 text,
  constraint projetos_pkey PRIMARY KEY (id)
);

create table if not exists public.projetos_comentarios (
  id                         uuid not null default gen_random_uuid(),
  projeto_id                 uuid,
  texto                      text not null,
  resolvido                  boolean not null default false,
  autor_nome                 text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  tipo                       text not null default 'nota'::text,
  data                       date not null default CURRENT_DATE,
  constraint projetos_comentarios_pkey PRIMARY KEY (id)
);

create table if not exists public.projetos_dependencias (
  projeto_id                 uuid not null,
  depende_de_id              uuid not null,
  created_at                 timestamptz not null default now(),
  constraint projetos_dependencias_pkey PRIMARY KEY (projeto_id, depende_de_id),
  constraint projetos_dependencias_check CHECK ((projeto_id <> depende_de_id))
);

create table if not exists public.rdo_fotos (
  id                         uuid not null default gen_random_uuid(),
  rdo_id                     uuid,
  atividade_id               uuid,
  data                       date not null,
  pavimento                  text,
  ambiente                   text,
  servico                    text,
  empresa                    text,
  status                     text,
  legenda                    text,
  url                        text not null,
  storage_path               text,
  autor_nome                 text,
  created_at                 timestamptz not null default now(),
  constraint rdo_fotos_pkey PRIMARY KEY (id)
);

create table if not exists public.relatorio_semanal_config (
  id                         integer not null default 1,
  obra_codigo                text not null default ''::text,
  obra_local                 text not null default ''::text,
  arquiteto                  text not null default ''::text,
  capa_padrao_url            text,
  assinaturas                jsonb not null default '[]'::jsonb,
  updated_at                 timestamptz not null default now(),
  data_inicio_obra           date,
  cliente                    text,
  logo_url                   text,
  constraint relatorio_semanal_config_pkey PRIMARY KEY (id),
  constraint relatorio_semanal_config_id_check CHECK ((id = 1))
);

create table if not exists public.reunioes (
  id                         uuid not null default gen_random_uuid(),
  data                       date,
  assunto                    text,
  empresas                   jsonb,
  itens                      jsonb,
  created_at                 timestamptz default now(),
  grupo_id                   uuid not null default gen_random_uuid(),
  ata_url                    text,
  ata_nome                   text,
  prevista                   boolean not null default false,
  constraint reunioes_pkey PRIMARY KEY (id)
);

create table if not exists public.visitas (
  id                         uuid not null default gen_random_uuid(),
  data                       date not null default CURRENT_DATE,
  assunto                    text,
  empresas                   jsonb not null default '[]'::jsonb,
  itens                      jsonb not null default '[]'::jsonb,
  created_at                 timestamptz not null default now(),
  grupo_id                   uuid not null default gen_random_uuid(),
  ata_url                    text,
  ata_nome                   text,
  prevista                   boolean not null default false,
  constraint visitas_pkey PRIMARY KEY (id)
);

create table if not exists public.visitas_dir_empresas (
  id                         uuid not null default gen_random_uuid(),
  nome                       text not null,
  created_at                 timestamptz not null default now(),
  constraint visitas_dir_empresas_pkey PRIMARY KEY (id),
  constraint visitas_dir_empresas_nome_key UNIQUE (nome)
);

create table if not exists public.visitas_dir_pessoas (
  id                         uuid not null default gen_random_uuid(),
  empresa_nome               text not null,
  nome                       text not null,
  cargo                      text,
  created_at                 timestamptz not null default now(),
  constraint visitas_dir_pessoas_pkey PRIMARY KEY (id),
  constraint visitas_dir_pessoas_empresa_nome_nome_key UNIQUE (empresa_nome, nome)
);


-- ========================================================================
-- LIGAÇÕES ENTRE TABELAS
-- ========================================================================

alter table public.atividades_rdo drop constraint if exists atividades_rdo_cronograma_item_id_fkey;
alter table public.atividades_rdo add constraint atividades_rdo_cronograma_item_id_fkey FOREIGN KEY (cronograma_item_id) REFERENCES cronograma_itens(id) ON DELETE SET NULL;

alter table public.atividades_rdo drop constraint if exists atividades_rdo_rdo_id_fkey;
alter table public.atividades_rdo add constraint atividades_rdo_rdo_id_fkey FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE;

alter table public.colaboradores drop constraint if exists colaboradores_empreiteiro_id_fkey;
alter table public.colaboradores add constraint colaboradores_empreiteiro_id_fkey FOREIGN KEY (empreiteiro_id) REFERENCES empreiteiros(id) ON DELETE SET NULL;

alter table public.contratacoes drop constraint if exists contratacoes_responsavel_id_fkey;
alter table public.contratacoes add constraint contratacoes_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES contratacoes_responsaveis(id) ON DELETE SET NULL;

alter table public.contratacoes_comentarios drop constraint if exists contratacoes_comentarios_contratacao_id_fkey;
alter table public.contratacoes_comentarios add constraint contratacoes_comentarios_contratacao_id_fkey FOREIGN KEY (contratacao_id) REFERENCES contratacoes(id) ON DELETE CASCADE;

alter table public.cronograma_avanco drop constraint if exists cronograma_avanco_item_id_fkey;
alter table public.cronograma_avanco add constraint cronograma_avanco_item_id_fkey FOREIGN KEY (item_id) REFERENCES cronograma_itens(id) ON DELETE CASCADE;

alter table public.efetivo_rdo drop constraint if exists efetivo_rdo_colaborador_id_fkey;
alter table public.efetivo_rdo add constraint efetivo_rdo_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES colaboradores(id);

alter table public.efetivo_rdo drop constraint if exists efetivo_rdo_rdo_id_fkey;
alter table public.efetivo_rdo add constraint efetivo_rdo_rdo_id_fkey FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE;

alter table public.ocorrencias drop constraint if exists ocorrencias_rdo_id_fkey;
alter table public.ocorrencias add constraint ocorrencias_rdo_id_fkey FOREIGN KEY (rdo_id) REFERENCES rdos(id);

alter table public.planta_marcacoes drop constraint if exists planta_marcacoes_planta_id_fkey;
alter table public.planta_marcacoes add constraint planta_marcacoes_planta_id_fkey FOREIGN KEY (planta_id) REFERENCES plantas_visuais(id) ON DELETE CASCADE;

alter table public.planta_marcacoes drop constraint if exists planta_marcacoes_substitui_fkey;
alter table public.planta_marcacoes add constraint planta_marcacoes_substitui_fkey FOREIGN KEY (substitui) REFERENCES planta_marcacoes(id) ON DELETE SET NULL;

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.projetos drop constraint if exists projetos_predecessor_id_fkey;
alter table public.projetos add constraint projetos_predecessor_id_fkey FOREIGN KEY (predecessor_id) REFERENCES projetos(id) ON DELETE SET NULL;

alter table public.projetos_comentarios drop constraint if exists projetos_comentarios_projeto_id_fkey;
alter table public.projetos_comentarios add constraint projetos_comentarios_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE;

alter table public.projetos_dependencias drop constraint if exists projetos_dependencias_depende_de_id_fkey;
alter table public.projetos_dependencias add constraint projetos_dependencias_depende_de_id_fkey FOREIGN KEY (depende_de_id) REFERENCES projetos(id) ON DELETE CASCADE;

alter table public.projetos_dependencias drop constraint if exists projetos_dependencias_projeto_id_fkey;
alter table public.projetos_dependencias add constraint projetos_dependencias_projeto_id_fkey FOREIGN KEY (projeto_id) REFERENCES projetos(id) ON DELETE CASCADE;

alter table public.rdo_fotos drop constraint if exists rdo_fotos_atividade_id_fkey;
alter table public.rdo_fotos add constraint rdo_fotos_atividade_id_fkey FOREIGN KEY (atividade_id) REFERENCES atividades_rdo(id) ON DELETE SET NULL;

alter table public.rdo_fotos drop constraint if exists rdo_fotos_rdo_id_fkey;
alter table public.rdo_fotos add constraint rdo_fotos_rdo_id_fkey FOREIGN KEY (rdo_id) REFERENCES rdos(id) ON DELETE CASCADE;


-- ========================================================================
-- TRAVA: VISITANTE NUNCA É ADMINISTRADOR
-- ========================================================================

-- Visitante só lê; administrador mexe nos logins de todo mundo. Os dois juntos
-- não fazem sentido. Primeiro limpa quem já esteja assim (uma versão antiga
-- deixava acontecer), senão a trava não entra e derruba o arquivo inteiro.
update public.profiles set is_admin = false where role = 'visitante' and is_admin;
alter table public.profiles drop constraint if exists profiles_visitante_nao_admin;
alter table public.profiles add constraint profiles_visitante_nao_admin CHECK ((not (role = 'visitante'::text and is_admin)));


-- ========================================================================
-- ÍNDICES (deixam as buscas rápidas)
-- ========================================================================

create index if not exists idx_atividades_cronograma ON public.atividades_rdo USING btree (cronograma_item_id);
create index if not exists idx_atividades_rdo_rdo_id ON public.atividades_rdo USING btree (rdo_id);
create index if not exists idx_atividades_rdo_status ON public.atividades_rdo USING btree (status);
create index if not exists colaboradores_pendente_revisao_idx ON public.colaboradores USING btree (pendente_revisao) WHERE pendente_revisao;
create index if not exists idx_contratacoes_aprovacao ON public.contratacoes USING btree (data_aprovacao);
create index if not exists idx_contratacoes_status ON public.contratacoes USING btree (status);
create index if not exists idx_contratacoes_comentarios_contratacao ON public.contratacoes_comentarios USING btree (contratacao_id, created_at);
create index if not exists idx_cronograma_avanco_data ON public.cronograma_avanco USING btree (data_ref);
create index if not exists idx_cronograma_avanco_item ON public.cronograma_avanco USING btree (item_id);
create index if not exists idx_cronograma_itens_ordem ON public.cronograma_itens USING btree (ordem);
create index if not exists idx_cronograma_itens_pai ON public.cronograma_itens USING btree (pai_wbs_id);
create index if not exists idx_efetivo_rdo_rdo_id ON public.efetivo_rdo USING btree (rdo_id);
create index if not exists idx_equipamentos_status ON public.equipamentos USING btree (status);
create index if not exists idx_ocorrencias_rdo_id ON public.ocorrencias USING btree (rdo_id);
create index if not exists idx_pendencias_prazo ON public.pendencias USING btree (prazo);
create index if not exists idx_pendencias_status ON public.pendencias USING btree (status);
create index if not exists idx_projetos_data_prevista ON public.projetos USING btree (data_prevista);
create index if not exists idx_projetos_comentarios_projeto ON public.projetos_comentarios USING btree (projeto_id, created_at);
create index if not exists projetos_comentarios_tipo_data_ix ON public.projetos_comentarios USING btree (tipo, data DESC);
create index if not exists rdo_fotos_ambiente_idx ON public.rdo_fotos USING btree (ambiente);
create index if not exists rdo_fotos_data_idx ON public.rdo_fotos USING btree (data DESC);
create index if not exists rdo_fotos_rdo_idx ON public.rdo_fotos USING btree (rdo_id);
create index if not exists reunioes_grupo_id_idx ON public.reunioes USING btree (grupo_id);
create index if not exists visitas_data_idx ON public.visitas USING btree (data DESC);
create index if not exists visitas_grupo_id_idx ON public.visitas USING btree (grupo_id);
create index if not exists visitas_dir_pessoas_empresa_idx ON public.visitas_dir_pessoas USING btree (empresa_nome);
-- A tela da planta filtra as marcações pela planta.
create index if not exists idx_planta_marcacoes_planta ON public.planta_marcacoes USING btree (planta_id);

-- ========================================================================
-- GATILHOS
-- ========================================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists trg_cronograma_itens_updated_at on public.cronograma_itens;
create trigger trg_cronograma_itens_updated_at before update on public.cronograma_itens
  for each row execute function public.set_updated_at();

drop trigger if exists trg_contratacoes_updated_at on public.contratacoes;
create trigger trg_contratacoes_updated_at before update on public.contratacoes
  for each row execute function public.set_updated_at();

drop trigger if exists trg_contratacoes_comentarios_updated_at on public.contratacoes_comentarios;
create trigger trg_contratacoes_comentarios_updated_at before update on public.contratacoes_comentarios
  for each row execute function public.set_updated_at();

drop trigger if exists trg_projetos_comentarios_updated_at on public.projetos_comentarios;
create trigger trg_projetos_comentarios_updated_at before update on public.projetos_comentarios
  for each row execute function public.set_updated_at();

drop trigger if exists trg_relatorio_semanal_config_updated_at on public.relatorio_semanal_config;
create trigger trg_relatorio_semanal_config_updated_at before update on public.relatorio_semanal_config
  for each row execute function public.set_updated_at();


-- ========================================================================
-- REGRAS DE ACESSO
-- ========================================================================

-- Modelo: é o banco da SUA empresa. Quem tem login vê e edita tudo;
-- quem tem papel "visitante" só vê. Do próprio perfil, cada um só troca o nome.

-- Visitante enxerga tudo e não mexe em nada. As regras de acesso usam isto.
-- Fica DEPOIS das tabelas: função "language sql" é conferida na criação e lê
-- profiles. Quem não tem perfil é tratado como visitante (só lê).
create or replace function public.e_visitante()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select role = 'visitante' from public.profiles where id = auth.uid()), true);
$$;

alter table public.profiles enable row level security;
drop policy if exists "perfil: todos veem" on public.profiles;
create policy "perfil: todos veem" on public.profiles for select to authenticated using (true);
drop policy if exists "perfil: edita o proprio" on public.profiles;
create policy "perfil: edita o proprio" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Cada um só pode trocar o PRÓPRIO NOME. Papel (role) e administrador (is_admin)
-- só mudam pelo Painel de admin (edge function, que usa a chave de serviço) ou
-- por SQL do dono do banco. Sem isto, qualquer logado se promovia a admin.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (nome) on public.profiles to authenticated;

alter table public.ambientes enable row level security;
drop policy if exists "ambientes: logado ve" on public.ambientes;
create policy "ambientes: logado ve" on public.ambientes for select to authenticated using (true);
drop policy if exists "ambientes: logado edita" on public.ambientes;
create policy "ambientes: logado edita" on public.ambientes for insert to authenticated with check (not public.e_visitante());
drop policy if exists "ambientes: logado altera" on public.ambientes;
create policy "ambientes: logado altera" on public.ambientes for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "ambientes: logado apaga" on public.ambientes;
create policy "ambientes: logado apaga" on public.ambientes for delete to authenticated using (not public.e_visitante());

alter table public.cronograma_itens enable row level security;
drop policy if exists "cronograma_itens: logado ve" on public.cronograma_itens;
create policy "cronograma_itens: logado ve" on public.cronograma_itens for select to authenticated using (true);
drop policy if exists "cronograma_itens: logado edita" on public.cronograma_itens;
create policy "cronograma_itens: logado edita" on public.cronograma_itens for insert to authenticated with check (not public.e_visitante());
drop policy if exists "cronograma_itens: logado altera" on public.cronograma_itens;
create policy "cronograma_itens: logado altera" on public.cronograma_itens for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "cronograma_itens: logado apaga" on public.cronograma_itens;
create policy "cronograma_itens: logado apaga" on public.cronograma_itens for delete to authenticated using (not public.e_visitante());

alter table public.rdos enable row level security;
drop policy if exists "rdos: logado ve" on public.rdos;
create policy "rdos: logado ve" on public.rdos for select to authenticated using (true);
drop policy if exists "rdos: logado edita" on public.rdos;
create policy "rdos: logado edita" on public.rdos for insert to authenticated with check (not public.e_visitante());
drop policy if exists "rdos: logado altera" on public.rdos;
create policy "rdos: logado altera" on public.rdos for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "rdos: logado apaga" on public.rdos;
create policy "rdos: logado apaga" on public.rdos for delete to authenticated using (not public.e_visitante());

alter table public.atividades_rdo enable row level security;
drop policy if exists "atividades_rdo: logado ve" on public.atividades_rdo;
create policy "atividades_rdo: logado ve" on public.atividades_rdo for select to authenticated using (true);
drop policy if exists "atividades_rdo: logado edita" on public.atividades_rdo;
create policy "atividades_rdo: logado edita" on public.atividades_rdo for insert to authenticated with check (not public.e_visitante());
drop policy if exists "atividades_rdo: logado altera" on public.atividades_rdo;
create policy "atividades_rdo: logado altera" on public.atividades_rdo for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "atividades_rdo: logado apaga" on public.atividades_rdo;
create policy "atividades_rdo: logado apaga" on public.atividades_rdo for delete to authenticated using (not public.e_visitante());

alter table public.empreiteiros enable row level security;
drop policy if exists "empreiteiros: logado ve" on public.empreiteiros;
create policy "empreiteiros: logado ve" on public.empreiteiros for select to authenticated using (true);
drop policy if exists "empreiteiros: logado edita" on public.empreiteiros;
create policy "empreiteiros: logado edita" on public.empreiteiros for insert to authenticated with check (not public.e_visitante());
drop policy if exists "empreiteiros: logado altera" on public.empreiteiros;
create policy "empreiteiros: logado altera" on public.empreiteiros for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "empreiteiros: logado apaga" on public.empreiteiros;
create policy "empreiteiros: logado apaga" on public.empreiteiros for delete to authenticated using (not public.e_visitante());

alter table public.colaboradores enable row level security;
drop policy if exists "colaboradores: logado ve" on public.colaboradores;
create policy "colaboradores: logado ve" on public.colaboradores for select to authenticated using (true);
drop policy if exists "colaboradores: logado edita" on public.colaboradores;
create policy "colaboradores: logado edita" on public.colaboradores for insert to authenticated with check (not public.e_visitante());
drop policy if exists "colaboradores: logado altera" on public.colaboradores;
create policy "colaboradores: logado altera" on public.colaboradores for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "colaboradores: logado apaga" on public.colaboradores;
create policy "colaboradores: logado apaga" on public.colaboradores for delete to authenticated using (not public.e_visitante());

alter table public.contratacoes_responsaveis enable row level security;
drop policy if exists "contratacoes_responsaveis: logado ve" on public.contratacoes_responsaveis;
create policy "contratacoes_responsaveis: logado ve" on public.contratacoes_responsaveis for select to authenticated using (true);
drop policy if exists "contratacoes_responsaveis: logado edita" on public.contratacoes_responsaveis;
create policy "contratacoes_responsaveis: logado edita" on public.contratacoes_responsaveis for insert to authenticated with check (not public.e_visitante());
drop policy if exists "contratacoes_responsaveis: logado altera" on public.contratacoes_responsaveis;
create policy "contratacoes_responsaveis: logado altera" on public.contratacoes_responsaveis for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "contratacoes_responsaveis: logado apaga" on public.contratacoes_responsaveis;
create policy "contratacoes_responsaveis: logado apaga" on public.contratacoes_responsaveis for delete to authenticated using (not public.e_visitante());

alter table public.contratacoes enable row level security;
drop policy if exists "contratacoes: logado ve" on public.contratacoes;
create policy "contratacoes: logado ve" on public.contratacoes for select to authenticated using (true);
drop policy if exists "contratacoes: logado edita" on public.contratacoes;
create policy "contratacoes: logado edita" on public.contratacoes for insert to authenticated with check (not public.e_visitante());
drop policy if exists "contratacoes: logado altera" on public.contratacoes;
create policy "contratacoes: logado altera" on public.contratacoes for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "contratacoes: logado apaga" on public.contratacoes;
create policy "contratacoes: logado apaga" on public.contratacoes for delete to authenticated using (not public.e_visitante());

alter table public.contratacoes_comentarios enable row level security;
drop policy if exists "contratacoes_comentarios: logado ve" on public.contratacoes_comentarios;
create policy "contratacoes_comentarios: logado ve" on public.contratacoes_comentarios for select to authenticated using (true);
drop policy if exists "contratacoes_comentarios: logado edita" on public.contratacoes_comentarios;
create policy "contratacoes_comentarios: logado edita" on public.contratacoes_comentarios for insert to authenticated with check (not public.e_visitante());
drop policy if exists "contratacoes_comentarios: logado altera" on public.contratacoes_comentarios;
create policy "contratacoes_comentarios: logado altera" on public.contratacoes_comentarios for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "contratacoes_comentarios: logado apaga" on public.contratacoes_comentarios;
create policy "contratacoes_comentarios: logado apaga" on public.contratacoes_comentarios for delete to authenticated using (not public.e_visitante());

alter table public.cronograma_avanco enable row level security;
drop policy if exists "cronograma_avanco: logado ve" on public.cronograma_avanco;
create policy "cronograma_avanco: logado ve" on public.cronograma_avanco for select to authenticated using (true);
drop policy if exists "cronograma_avanco: logado edita" on public.cronograma_avanco;
create policy "cronograma_avanco: logado edita" on public.cronograma_avanco for insert to authenticated with check (not public.e_visitante());
drop policy if exists "cronograma_avanco: logado altera" on public.cronograma_avanco;
create policy "cronograma_avanco: logado altera" on public.cronograma_avanco for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "cronograma_avanco: logado apaga" on public.cronograma_avanco;
create policy "cronograma_avanco: logado apaga" on public.cronograma_avanco for delete to authenticated using (not public.e_visitante());

alter table public.efetivo_rdo enable row level security;
drop policy if exists "efetivo_rdo: logado ve" on public.efetivo_rdo;
create policy "efetivo_rdo: logado ve" on public.efetivo_rdo for select to authenticated using (true);
drop policy if exists "efetivo_rdo: logado edita" on public.efetivo_rdo;
create policy "efetivo_rdo: logado edita" on public.efetivo_rdo for insert to authenticated with check (not public.e_visitante());
drop policy if exists "efetivo_rdo: logado altera" on public.efetivo_rdo;
create policy "efetivo_rdo: logado altera" on public.efetivo_rdo for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "efetivo_rdo: logado apaga" on public.efetivo_rdo;
create policy "efetivo_rdo: logado apaga" on public.efetivo_rdo for delete to authenticated using (not public.e_visitante());

alter table public.equipamentos enable row level security;
drop policy if exists "equipamentos: logado ve" on public.equipamentos;
create policy "equipamentos: logado ve" on public.equipamentos for select to authenticated using (true);
drop policy if exists "equipamentos: logado edita" on public.equipamentos;
create policy "equipamentos: logado edita" on public.equipamentos for insert to authenticated with check (not public.e_visitante());
drop policy if exists "equipamentos: logado altera" on public.equipamentos;
create policy "equipamentos: logado altera" on public.equipamentos for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "equipamentos: logado apaga" on public.equipamentos;
create policy "equipamentos: logado apaga" on public.equipamentos for delete to authenticated using (not public.e_visitante());

alter table public.ocorrencias enable row level security;
drop policy if exists "ocorrencias: logado ve" on public.ocorrencias;
create policy "ocorrencias: logado ve" on public.ocorrencias for select to authenticated using (true);
drop policy if exists "ocorrencias: logado edita" on public.ocorrencias;
create policy "ocorrencias: logado edita" on public.ocorrencias for insert to authenticated with check (not public.e_visitante());
drop policy if exists "ocorrencias: logado altera" on public.ocorrencias;
create policy "ocorrencias: logado altera" on public.ocorrencias for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "ocorrencias: logado apaga" on public.ocorrencias;
create policy "ocorrencias: logado apaga" on public.ocorrencias for delete to authenticated using (not public.e_visitante());

alter table public.pendencias enable row level security;
drop policy if exists "pendencias: logado ve" on public.pendencias;
create policy "pendencias: logado ve" on public.pendencias for select to authenticated using (true);
drop policy if exists "pendencias: logado edita" on public.pendencias;
create policy "pendencias: logado edita" on public.pendencias for insert to authenticated with check (not public.e_visitante());
drop policy if exists "pendencias: logado altera" on public.pendencias;
create policy "pendencias: logado altera" on public.pendencias for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "pendencias: logado apaga" on public.pendencias;
create policy "pendencias: logado apaga" on public.pendencias for delete to authenticated using (not public.e_visitante());

alter table public.planta_etapas enable row level security;
drop policy if exists "planta_etapas: logado ve" on public.planta_etapas;
create policy "planta_etapas: logado ve" on public.planta_etapas for select to authenticated using (true);
drop policy if exists "planta_etapas: logado edita" on public.planta_etapas;
create policy "planta_etapas: logado edita" on public.planta_etapas for insert to authenticated with check (not public.e_visitante());
drop policy if exists "planta_etapas: logado altera" on public.planta_etapas;
create policy "planta_etapas: logado altera" on public.planta_etapas for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "planta_etapas: logado apaga" on public.planta_etapas;
create policy "planta_etapas: logado apaga" on public.planta_etapas for delete to authenticated using (not public.e_visitante());

alter table public.plantas_visuais enable row level security;
drop policy if exists "plantas_visuais: logado ve" on public.plantas_visuais;
create policy "plantas_visuais: logado ve" on public.plantas_visuais for select to authenticated using (true);
drop policy if exists "plantas_visuais: logado edita" on public.plantas_visuais;
create policy "plantas_visuais: logado edita" on public.plantas_visuais for insert to authenticated with check (not public.e_visitante());
drop policy if exists "plantas_visuais: logado altera" on public.plantas_visuais;
create policy "plantas_visuais: logado altera" on public.plantas_visuais for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "plantas_visuais: logado apaga" on public.plantas_visuais;
create policy "plantas_visuais: logado apaga" on public.plantas_visuais for delete to authenticated using (not public.e_visitante());

alter table public.planta_marcacoes enable row level security;
drop policy if exists "planta_marcacoes: logado ve" on public.planta_marcacoes;
create policy "planta_marcacoes: logado ve" on public.planta_marcacoes for select to authenticated using (true);
drop policy if exists "planta_marcacoes: logado edita" on public.planta_marcacoes;
create policy "planta_marcacoes: logado edita" on public.planta_marcacoes for insert to authenticated with check (not public.e_visitante());
drop policy if exists "planta_marcacoes: logado altera" on public.planta_marcacoes;
create policy "planta_marcacoes: logado altera" on public.planta_marcacoes for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "planta_marcacoes: logado apaga" on public.planta_marcacoes;
create policy "planta_marcacoes: logado apaga" on public.planta_marcacoes for delete to authenticated using (not public.e_visitante());

alter table public.projetos enable row level security;
drop policy if exists "projetos: logado ve" on public.projetos;
create policy "projetos: logado ve" on public.projetos for select to authenticated using (true);
drop policy if exists "projetos: logado edita" on public.projetos;
create policy "projetos: logado edita" on public.projetos for insert to authenticated with check (not public.e_visitante());
drop policy if exists "projetos: logado altera" on public.projetos;
create policy "projetos: logado altera" on public.projetos for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "projetos: logado apaga" on public.projetos;
create policy "projetos: logado apaga" on public.projetos for delete to authenticated using (not public.e_visitante());

alter table public.projetos_comentarios enable row level security;
drop policy if exists "projetos_comentarios: logado ve" on public.projetos_comentarios;
create policy "projetos_comentarios: logado ve" on public.projetos_comentarios for select to authenticated using (true);
drop policy if exists "projetos_comentarios: logado edita" on public.projetos_comentarios;
create policy "projetos_comentarios: logado edita" on public.projetos_comentarios for insert to authenticated with check (not public.e_visitante());
drop policy if exists "projetos_comentarios: logado altera" on public.projetos_comentarios;
create policy "projetos_comentarios: logado altera" on public.projetos_comentarios for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "projetos_comentarios: logado apaga" on public.projetos_comentarios;
create policy "projetos_comentarios: logado apaga" on public.projetos_comentarios for delete to authenticated using (not public.e_visitante());

alter table public.projetos_dependencias enable row level security;
drop policy if exists "projetos_dependencias: logado ve" on public.projetos_dependencias;
create policy "projetos_dependencias: logado ve" on public.projetos_dependencias for select to authenticated using (true);
drop policy if exists "projetos_dependencias: logado edita" on public.projetos_dependencias;
create policy "projetos_dependencias: logado edita" on public.projetos_dependencias for insert to authenticated with check (not public.e_visitante());
drop policy if exists "projetos_dependencias: logado altera" on public.projetos_dependencias;
create policy "projetos_dependencias: logado altera" on public.projetos_dependencias for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "projetos_dependencias: logado apaga" on public.projetos_dependencias;
create policy "projetos_dependencias: logado apaga" on public.projetos_dependencias for delete to authenticated using (not public.e_visitante());

alter table public.rdo_fotos enable row level security;
drop policy if exists "rdo_fotos: logado ve" on public.rdo_fotos;
create policy "rdo_fotos: logado ve" on public.rdo_fotos for select to authenticated using (true);
drop policy if exists "rdo_fotos: logado edita" on public.rdo_fotos;
create policy "rdo_fotos: logado edita" on public.rdo_fotos for insert to authenticated with check (not public.e_visitante());
drop policy if exists "rdo_fotos: logado altera" on public.rdo_fotos;
create policy "rdo_fotos: logado altera" on public.rdo_fotos for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "rdo_fotos: logado apaga" on public.rdo_fotos;
create policy "rdo_fotos: logado apaga" on public.rdo_fotos for delete to authenticated using (not public.e_visitante());

alter table public.relatorio_semanal_config enable row level security;
drop policy if exists "relatorio_semanal_config: logado ve" on public.relatorio_semanal_config;
create policy "relatorio_semanal_config: logado ve" on public.relatorio_semanal_config for select to authenticated using (true);
drop policy if exists "relatorio_semanal_config: logado edita" on public.relatorio_semanal_config;
create policy "relatorio_semanal_config: logado edita" on public.relatorio_semanal_config for insert to authenticated with check (not public.e_visitante());
drop policy if exists "relatorio_semanal_config: logado altera" on public.relatorio_semanal_config;
create policy "relatorio_semanal_config: logado altera" on public.relatorio_semanal_config for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
-- Sem regra de apagar: a linha 1 é fixa e nenhuma tela a recria se sumir.
drop policy if exists "relatorio_semanal_config: logado apaga" on public.relatorio_semanal_config;

alter table public.reunioes enable row level security;
drop policy if exists "reunioes: logado ve" on public.reunioes;
create policy "reunioes: logado ve" on public.reunioes for select to authenticated using (true);
drop policy if exists "reunioes: logado edita" on public.reunioes;
create policy "reunioes: logado edita" on public.reunioes for insert to authenticated with check (not public.e_visitante());
drop policy if exists "reunioes: logado altera" on public.reunioes;
create policy "reunioes: logado altera" on public.reunioes for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "reunioes: logado apaga" on public.reunioes;
create policy "reunioes: logado apaga" on public.reunioes for delete to authenticated using (not public.e_visitante());

alter table public.visitas enable row level security;
drop policy if exists "visitas: logado ve" on public.visitas;
create policy "visitas: logado ve" on public.visitas for select to authenticated using (true);
drop policy if exists "visitas: logado edita" on public.visitas;
create policy "visitas: logado edita" on public.visitas for insert to authenticated with check (not public.e_visitante());
drop policy if exists "visitas: logado altera" on public.visitas;
create policy "visitas: logado altera" on public.visitas for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "visitas: logado apaga" on public.visitas;
create policy "visitas: logado apaga" on public.visitas for delete to authenticated using (not public.e_visitante());

alter table public.visitas_dir_empresas enable row level security;
drop policy if exists "visitas_dir_empresas: logado ve" on public.visitas_dir_empresas;
create policy "visitas_dir_empresas: logado ve" on public.visitas_dir_empresas for select to authenticated using (true);
drop policy if exists "visitas_dir_empresas: logado edita" on public.visitas_dir_empresas;
create policy "visitas_dir_empresas: logado edita" on public.visitas_dir_empresas for insert to authenticated with check (not public.e_visitante());
drop policy if exists "visitas_dir_empresas: logado altera" on public.visitas_dir_empresas;
create policy "visitas_dir_empresas: logado altera" on public.visitas_dir_empresas for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "visitas_dir_empresas: logado apaga" on public.visitas_dir_empresas;
create policy "visitas_dir_empresas: logado apaga" on public.visitas_dir_empresas for delete to authenticated using (not public.e_visitante());

alter table public.visitas_dir_pessoas enable row level security;
drop policy if exists "visitas_dir_pessoas: logado ve" on public.visitas_dir_pessoas;
create policy "visitas_dir_pessoas: logado ve" on public.visitas_dir_pessoas for select to authenticated using (true);
drop policy if exists "visitas_dir_pessoas: logado edita" on public.visitas_dir_pessoas;
create policy "visitas_dir_pessoas: logado edita" on public.visitas_dir_pessoas for insert to authenticated with check (not public.e_visitante());
drop policy if exists "visitas_dir_pessoas: logado altera" on public.visitas_dir_pessoas;
create policy "visitas_dir_pessoas: logado altera" on public.visitas_dir_pessoas for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "visitas_dir_pessoas: logado apaga" on public.visitas_dir_pessoas;
create policy "visitas_dir_pessoas: logado apaga" on public.visitas_dir_pessoas for delete to authenticated using (not public.e_visitante());


-- ========================================================================
-- ARMAZENAMENTO DAS FOTOS
-- ========================================================================

-- O bucket nasce público: quem tiver o link de uma foto a vê sem login (o nome
-- do arquivo é difícil de adivinhar e a lista de arquivos é fechada). Se ele já
-- existe, fica como está: rodar este arquivo de novo não o reabre se alguém o
-- fechou no painel.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 26214400, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists "fotos: logado ve" on storage.objects;
create policy "fotos: logado ve" on storage.objects for select to authenticated using (bucket_id = 'fotos');
drop policy if exists "fotos: logado envia" on storage.objects;
create policy "fotos: logado envia" on storage.objects for insert to authenticated with check (bucket_id = 'fotos' and not public.e_visitante());
drop policy if exists "fotos: logado troca" on storage.objects;
create policy "fotos: logado troca" on storage.objects for update to authenticated using (bucket_id = 'fotos' and not public.e_visitante());
drop policy if exists "fotos: logado apaga" on storage.objects;
create policy "fotos: logado apaga" on storage.objects for delete to authenticated using (bucket_id = 'fotos' and not public.e_visitante());


-- ========================================================================
-- LINHA INICIAL DA CONFIGURAÇÃO DOS RELATÓRIOS
-- ========================================================================

-- O app lê sempre a linha 1. Nasce vazia e não pode ser apagada pelo app.
insert into public.relatorio_semanal_config (id) values (1) on conflict (id) do nothing;


-- ========================================================================
-- TEMPO REAL (o que o mestre muda no celular aparece no computador na hora)
-- ========================================================================

-- O app escuta mudanças em rdos (efetivo do dia e diário enviado), em
-- atividades_rdo (status das atividades) e em ocorrencias (novas ocorrências).
-- Só entra na publicação quem ainda não está nela, então pode rodar de novo.
-- Não precisa de "replica identity full": o app filtra UPDATE só pela chave
-- (id) ou não filtra, filtra INSERT pela linha nova, e não escuta DELETE.
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['rdos', 'atividades_rdo', 'ocorrencias'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;


-- ========================================================================
-- QUEM PODE CHAMAR AS FUNÇÕES
-- ========================================================================

-- Ninguém chama o gatilho pela API (o gatilho roda sozinho, sem essa permissão).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
-- As regras de acesso chamam e_visitante() com o papel de quem está logado:
-- "authenticated" PRECISA poder executar; o anônimo, não.
revoke execute on function public.e_visitante() from public, anon;
grant execute on function public.e_visitante() to authenticated;

