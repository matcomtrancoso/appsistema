-- =========================================================================
--  MULTI-OBRA, fatia 1: PREPARAR (só acrescenta, nada muda para o app)
--
--  Antes: um banco = uma obra. Depois: várias obras no mesmo banco, cada
--  pessoa vendo só as obras em que foi liberada (o administrador vê todas).
--
--  Esta fatia:
--   - cria `obras` e `obra_membros`, com as regras de acesso delas;
--   - cria a Obra 1 com os dados de hoje e liga TODOS os registros atuais a ela;
--   - acrescenta `obra_id` (ainda aceitando vazio) nas 20 tabelas que são da obra,
--     já com a Obra 1 como valor padrão, para o app atual seguir gravando sem
--     saber que existe mais de uma;
--   - acrescenta as chaves únicas novas POR OBRA ao lado das antigas.
--
--  Fica para as próximas fatias: o app passar a informar a obra (fatia 2);
--  tornar obrigatório, tirar as chaves antigas e ligar o acesso por obra
--  nas tabelas (fatia 3).
--
--  Não apaga nada e não duplica tabela, coluna nem índice ao rodar de novo.
--  MAS não é seguro reaplicar DEPOIS que a fatia 2 estiver no ar: o passo final
--  devolve o acesso à Obra 1 a todos os perfis (desfaz quem foi retirado) e o
--  DEFAULT do obra_id volta a apontar para a Obra 1. Vale só para criar o banco
--  do zero ou antes de existir uma segunda obra.
--  (Os índices só em obra_id de rdos, cronograma_itens e planta_etapas sobram,
--  porque os índices únicos por obra já começam por obra_id: sai na fatia 3.)
--  Compartilhadas entre obras (sem obra_id): profiles, empreiteiros,
--  colaboradores, contratacoes_responsaveis, visitas_dir_empresas,
--  visitas_dir_pessoas.
-- =========================================================================


-- ========================================================================
-- FUNÇÕES DE APOIO
-- ========================================================================

-- Quem é administrador (is_admin). Não depende de tabela da obra.
create or replace function public.e_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false);
$$;


-- ========================================================================
-- TABELAS NOVAS
-- ========================================================================

create table if not exists public.obras (
  id               uuid not null default gen_random_uuid(),
  nome             text not null,
  codigo           text not null default ''::text,
  localizacao      text not null default ''::text,
  cliente          text,
  arquiteto        text not null default ''::text,
  data_inicio      date,
  capa_padrao_url  text,
  assinaturas      jsonb not null default '[]'::jsonb,
  ativa            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint obras_pkey PRIMARY KEY (id),
  constraint obras_nome_key UNIQUE (nome)
);

create table if not exists public.obra_membros (
  obra_id     uuid not null,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  constraint obra_membros_pkey PRIMARY KEY (obra_id, user_id)
);

alter table public.obra_membros drop constraint if exists obra_membros_obra_id_fkey;
alter table public.obra_membros add constraint obra_membros_obra_id_fkey
  FOREIGN KEY (obra_id) REFERENCES public.obras(id) ON DELETE CASCADE;
alter table public.obra_membros drop constraint if exists obra_membros_user_id_fkey;
alter table public.obra_membros add constraint obra_membros_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

create index if not exists idx_obra_membros_user on public.obra_membros (user_id);

drop trigger if exists trg_obras_updated_at on public.obras;
create trigger trg_obras_updated_at before update on public.obras
  for each row execute function public.set_updated_at();


-- As obras que a pessoa logada pode ver: todas, se for administrador; senão,
-- só aquelas em que está liberada. É a frase que TODA regra de acesso por obra
-- vai repetir. O (select ...) em volta é para o banco calcular uma vez por
-- consulta, e não uma vez por linha.
create or replace function public.minhas_obras()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select o.id from public.obras o where (select public.e_admin())
  union
  select m.obra_id from public.obra_membros m where m.user_id = (select auth.uid());
$$;


-- ========================================================================
-- REGRAS DE ACESSO DAS TABELAS NOVAS
-- ========================================================================

alter table public.obras enable row level security;
drop policy if exists "obras: ve as suas" on public.obras;
create policy "obras: ve as suas" on public.obras for select to authenticated using (id in (select public.minhas_obras()));
drop policy if exists "obras: admin cria" on public.obras;
create policy "obras: admin cria" on public.obras for insert to authenticated with check ((select public.e_admin()));
drop policy if exists "obras: admin altera" on public.obras;
create policy "obras: admin altera" on public.obras for update to authenticated using ((select public.e_admin())) with check ((select public.e_admin()));
-- Sem política de exclusão de propósito: obra não se apaga pelo app (apagaria
-- junto tudo o que é dela). Para encerrar uma obra, marca-se ativa = falso.

alter table public.obra_membros enable row level security;
drop policy if exists "membros: ve o proprio ou admin" on public.obra_membros;
create policy "membros: ve o proprio ou admin" on public.obra_membros for select to authenticated
  using (user_id = (select auth.uid()) or (select public.e_admin()));
drop policy if exists "membros: admin libera" on public.obra_membros;
create policy "membros: admin libera" on public.obra_membros for insert to authenticated with check ((select public.e_admin()));
drop policy if exists "membros: admin altera" on public.obra_membros;
create policy "membros: admin altera" on public.obra_membros for update to authenticated using ((select public.e_admin())) with check ((select public.e_admin()));
drop policy if exists "membros: admin retira" on public.obra_membros;
create policy "membros: admin retira" on public.obra_membros for delete to authenticated using ((select public.e_admin()));

-- As regras de acesso chamam estas funções com o papel de quem está logado:
-- "authenticated" PRECISA poder executar; o anônimo, não.
revoke execute on function public.e_admin() from public, anon;
grant execute on function public.e_admin() to authenticated;
revoke execute on function public.minhas_obras() from public, anon;
grant execute on function public.minhas_obras() to authenticated;


-- ========================================================================
-- OBRA 1 + obra_id NAS TABELAS DA OBRA
-- ========================================================================

do $$
declare
  v_obra uuid;
  c      record;
  t      text;
  tabelas text[] := array[
    'ambientes', 'cronograma_itens', 'cronograma_avanco',
    'rdos', 'atividades_rdo', 'efetivo_rdo', 'ocorrencias', 'rdo_fotos',
    'pendencias', 'equipamentos',
    'contratacoes', 'contratacoes_comentarios',
    'projetos', 'projetos_comentarios', 'projetos_dependencias',
    'planta_etapas', 'plantas_visuais', 'planta_marcacoes',
    'reunioes', 'visitas'
  ];
begin
  -- A Obra 1 é a que o app já vinha usando: nome e início vinham de src/marca.js,
  -- o resto do cabeçalho do relatório (código, local, arquiteto...) da linha única
  -- de relatorio_semanal_config.
  select id into v_obra from public.obras order by created_at limit 1;
  if v_obra is null then
    select * into c from public.relatorio_semanal_config where id = 1;
    insert into public.obras (nome, codigo, localizacao, cliente, arquiteto, data_inicio, capa_padrao_url, assinaturas)
    values (
      'NAMPUR MATA - FASE 2 - CASA 12 E 13',
      coalesce(c.obra_codigo, ''), coalesce(c.obra_local, ''), c.cliente, coalesce(c.arquiteto, ''),
      coalesce(c.data_inicio_obra, date '2026-09-21'), c.capa_padrao_url, coalesce(c.assinaturas, '[]'::jsonb)
    )
    returning id into v_obra;
  end if;

  foreach t in array tabelas loop
    execute format('alter table public.%I add column if not exists obra_id uuid', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_obra_id_fkey');
    execute format('alter table public.%I add constraint %I FOREIGN KEY (obra_id) REFERENCES public.obras(id)', t, t || '_obra_id_fkey');
    -- tudo o que existe hoje é da Obra 1
    execute format('update public.%I set obra_id = %L where obra_id is null', t, v_obra);
    -- enquanto o app não informa a obra, o que ele gravar cai na Obra 1
    execute format('alter table public.%I alter column obra_id set default %L', t, v_obra);
    execute format('create index if not exists %I on public.%I (obra_id)', 'idx_' || t || '_obra', t);
  end loop;

  -- Quem já tem perfil hoje continua enxergando a Obra 1.
  insert into public.obra_membros (obra_id, user_id)
  select v_obra, id from public.profiles
  on conflict do nothing;
end $$;


-- ========================================================================
-- CHAVES ÚNICAS POR OBRA (as antigas continuam até a fatia 3)
-- ========================================================================

-- Um RDO por data, POR OBRA.
create unique index if not exists rdos_obra_data_key on public.rdos (obra_id, data);
-- O número da tarefa (EAP) é único DENTRO da obra.
create unique index if not exists cronograma_itens_obra_wbs_key on public.cronograma_itens (obra_id, wbs_id);
-- O nome da etapa da planta é único DENTRO da obra.
create unique index if not exists planta_etapas_obra_nome_key on public.planta_etapas (obra_id, nome);
