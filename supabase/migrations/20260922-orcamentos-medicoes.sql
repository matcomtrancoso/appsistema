-- =========================================================================
--  ORÇAMENTOS (itens por contratação) E MEDIÇÕES (avanço físico da obra)
--
--  Duas tabelas novas, sem histórico anterior — por isso já nascem
--  multi-obra de verdade (obra_id obrigatório desde o início, sem o
--  DEFAULT/transição que as 20 tabelas da fatia 1 precisaram).
--
--  orcamento_itens: a lista de itens (descrição, quantidade, preço) de uma
--  Contratação — "quanto planejamos pagar por isso". Só quem é engenharia
--  vê a tela (mesma regra de contratacoes.valor_contrato); a trava de
--  verdade é essa, não o RLS (RLS aqui só distingue visitante, igual ao
--  resto da base — ver "Mestre e engenheiro são iguais no banco" no CLAUDE.md).
--
--  medicoes_obra: o percentual de avanço físico que alguém MEDIU e registrou
--  (mestre no campo, ou engenharia), por data — diferente do percentual que o
--  Cronograma CALCULA a partir do avanço de cada item. As duas coisas
--  convivem: uma é medição, a outra é conta.
-- =========================================================================

create table if not exists public.orcamento_itens (
  id               uuid not null default gen_random_uuid(),
  obra_id          uuid not null,
  contratacao_id   uuid not null,
  descricao        text not null,
  unidade          text not null default ''::text,
  quantidade       numeric not null default 0,
  preco_unitario   numeric not null default 0,
  ordem            integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint orcamento_itens_pkey PRIMARY KEY (id),
  constraint orcamento_itens_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint orcamento_itens_contratacao_id_fkey FOREIGN KEY (contratacao_id) REFERENCES public.contratacoes(id) ON DELETE CASCADE
);
create index if not exists idx_orcamento_itens_obra on public.orcamento_itens (obra_id);
create index if not exists idx_orcamento_itens_contratacao on public.orcamento_itens (contratacao_id);

drop trigger if exists trg_orcamento_itens_updated_at on public.orcamento_itens;
create trigger trg_orcamento_itens_updated_at before update on public.orcamento_itens
  for each row execute function public.set_updated_at();

alter table public.orcamento_itens enable row level security;
drop policy if exists "orcamento_itens: logado ve" on public.orcamento_itens;
create policy "orcamento_itens: logado ve" on public.orcamento_itens for select to authenticated using (true);
drop policy if exists "orcamento_itens: logado cria" on public.orcamento_itens;
create policy "orcamento_itens: logado cria" on public.orcamento_itens for insert to authenticated with check (not public.e_visitante());
drop policy if exists "orcamento_itens: logado altera" on public.orcamento_itens;
create policy "orcamento_itens: logado altera" on public.orcamento_itens for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "orcamento_itens: logado apaga" on public.orcamento_itens;
create policy "orcamento_itens: logado apaga" on public.orcamento_itens for delete to authenticated using (not public.e_visitante());


create table if not exists public.medicoes_obra (
  id               uuid not null default gen_random_uuid(),
  obra_id          uuid not null,
  data             date not null,
  percentual       numeric not null,
  observacoes      text,
  responsavel_nome text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint medicoes_obra_pkey PRIMARY KEY (id),
  constraint medicoes_obra_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint medicoes_obra_percentual_check CHECK (percentual >= 0 and percentual <= 100)
);
-- Uma medição por dia, por obra — igual ao rdos.data de hoje, só que já
-- nascendo com obra_id na chave (não precisa da transição da fatia 1/3).
create unique index if not exists medicoes_obra_obra_data_key on public.medicoes_obra (obra_id, data);

drop trigger if exists trg_medicoes_obra_updated_at on public.medicoes_obra;
create trigger trg_medicoes_obra_updated_at before update on public.medicoes_obra
  for each row execute function public.set_updated_at();

alter table public.medicoes_obra enable row level security;
drop policy if exists "medicoes_obra: logado ve" on public.medicoes_obra;
create policy "medicoes_obra: logado ve" on public.medicoes_obra for select to authenticated using (true);
drop policy if exists "medicoes_obra: logado cria" on public.medicoes_obra;
create policy "medicoes_obra: logado cria" on public.medicoes_obra for insert to authenticated with check (not public.e_visitante());
drop policy if exists "medicoes_obra: logado altera" on public.medicoes_obra;
create policy "medicoes_obra: logado altera" on public.medicoes_obra for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "medicoes_obra: logado apaga" on public.medicoes_obra;
create policy "medicoes_obra: logado apaga" on public.medicoes_obra for delete to authenticated using (not public.e_visitante());
