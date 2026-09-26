-- =========================================================================
--  ORÇAMENTO DA OBRA (EAP) → CRONOGRAMA → MEDIÇÃO MENSAL POR LINHA
--
--  O primeiro passo de uma obra é o orçamento. Cada linha dele (na EAP:
--  1, 1.1, 1.1.1...) gera uma tarefa do cronograma e é medida no fim do mês.
--
--  orcamento_eap        as linhas do orçamento da obra (grupos e folhas).
--                       Folha = quantidade × preço; grupo = soma dos filhos
--                       (calculado na tela, não guardado).
--  cronograma_itens     ganha orcamento_eap_id: de que linha a tarefa nasceu.
--  medicoes_mensais     uma medição por obra por mês (aberta → fechada).
--  medicao_itens        o % ACUMULADO de cada linha naquele mês.
--                       Valor do mês = preço da linha × (% deste mês − % do mês anterior).
--  Mês fechado não muda mais (trigger): é ele que alimenta o Contas a receber.
--
--  A aprovação do orçamento fica em obra_contrato (valor_aprovado + aprovado_em).
--
--  Também remove as três chaves únicas ANTIGAS que valiam para o banco inteiro
--  (rdos.data, cronograma_itens.wbs_id, planta_etapas.nome). Com mais de uma
--  obra elas impediam duas obras de ter RDO no mesmo dia, ou a mesma etapa de
--  planta. As chaves por obra (obra_id, ...) já existem e são as que o app usa
--  em todo upsert.
-- =========================================================================

alter table public.rdos              drop constraint if exists rdos_data_key;
alter table public.cronograma_itens  drop constraint if exists cronograma_itens_wbs_id_key;
alter table public.planta_etapas     drop constraint if exists planta_etapas_nome_key;

-- ------------------------------------------------------------------------
create table if not exists public.orcamento_eap (
  id              uuid not null default gen_random_uuid(),
  obra_id         uuid not null,
  codigo          text not null,
  pai_codigo      text,
  descricao       text not null,
  unidade         text not null default ''::text,
  quantidade      numeric not null default 0,
  preco_unitario  numeric not null default 0,
  is_grupo        boolean not null default false,
  ordem           integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint orcamento_eap_pkey PRIMARY KEY (id),
  constraint orcamento_eap_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint orcamento_eap_quantidade_check CHECK (quantidade >= 0),
  constraint orcamento_eap_preco_check CHECK (preco_unitario >= 0),
  constraint orcamento_eap_codigo_check CHECK (length(btrim(codigo)) > 0)
);
create unique index if not exists orcamento_eap_obra_codigo_key on public.orcamento_eap (obra_id, codigo);
create index if not exists idx_orcamento_eap_obra_ordem on public.orcamento_eap (obra_id, ordem);

drop trigger if exists trg_orcamento_eap_updated_at on public.orcamento_eap;
create trigger trg_orcamento_eap_updated_at before update on public.orcamento_eap
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------------
alter table public.cronograma_itens add column if not exists orcamento_eap_id uuid;
alter table public.cronograma_itens drop constraint if exists cronograma_itens_orcamento_eap_id_fkey;
alter table public.cronograma_itens add constraint cronograma_itens_orcamento_eap_id_fkey
  FOREIGN KEY (orcamento_eap_id) REFERENCES public.orcamento_eap(id) ON DELETE SET NULL;
create index if not exists idx_cronograma_itens_orcamento_eap on public.cronograma_itens (orcamento_eap_id);

-- ------------------------------------------------------------------------
create table if not exists public.medicoes_mensais (
  id                 uuid not null default gen_random_uuid(),
  obra_id            uuid not null,
  mes                date not null,
  status             text not null default 'aberta'::text,
  fechada_em         timestamptz,
  fechada_por_nome   text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint medicoes_mensais_pkey PRIMARY KEY (id),
  constraint medicoes_mensais_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint medicoes_mensais_status_check CHECK (status = ANY (ARRAY['aberta'::text, 'fechada'::text])),
  constraint medicoes_mensais_mes_check CHECK (extract(day from mes) = 1),
  constraint medicoes_mensais_fechada_check CHECK (status <> 'fechada' or fechada_em is not null)
);
create unique index if not exists medicoes_mensais_obra_mes_key on public.medicoes_mensais (obra_id, mes);

drop trigger if exists trg_medicoes_mensais_updated_at on public.medicoes_mensais;
create trigger trg_medicoes_mensais_updated_at before update on public.medicoes_mensais
  for each row execute function public.set_updated_at();

create table if not exists public.medicao_itens (
  id                     uuid not null default gen_random_uuid(),
  obra_id                uuid not null,
  medicao_id             uuid not null,
  eap_id                 uuid not null,
  percentual_acumulado   numeric not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint medicao_itens_pkey PRIMARY KEY (id),
  constraint medicao_itens_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint medicao_itens_medicao_id_fkey FOREIGN KEY (medicao_id) REFERENCES public.medicoes_mensais(id) ON DELETE CASCADE,
  constraint medicao_itens_eap_id_fkey FOREIGN KEY (eap_id) REFERENCES public.orcamento_eap(id) ON DELETE CASCADE,
  constraint medicao_itens_percentual_check CHECK (percentual_acumulado >= 0 and percentual_acumulado <= 100)
);
create unique index if not exists medicao_itens_medicao_eap_key on public.medicao_itens (medicao_id, eap_id);
create index if not exists idx_medicao_itens_eap on public.medicao_itens (eap_id);
create index if not exists idx_medicao_itens_obra on public.medicao_itens (obra_id);

drop trigger if exists trg_medicao_itens_updated_at on public.medicao_itens;
create trigger trg_medicao_itens_updated_at before update on public.medicao_itens
  for each row execute function public.set_updated_at();

-- Mês fechado não muda: nem item novo, nem alteração, nem apagar. Reabrir o
-- mês (status volta a 'aberta') é o único caminho, e o app só oferece para o
-- último mês fechado.
create or replace function public.trava_medicao_fechada()
returns trigger language plpgsql set search_path = '' as $$
declare v_medicao uuid; v_status text;
begin
  v_medicao := coalesce(new.medicao_id, old.medicao_id);
  select status into v_status from public.medicoes_mensais where id = v_medicao;
  if v_status = 'fechada' then
    raise exception 'Mês fechado: reabra a medição para alterar.' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_medicao_itens_trava on public.medicao_itens;
create trigger trg_medicao_itens_trava before insert or update or delete on public.medicao_itens
  for each row execute function public.trava_medicao_fechada();

create or replace function public.trava_apagar_medicao_fechada()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'fechada' then
    raise exception 'Mês fechado não pode ser apagado: reabra antes.' using errcode = 'P0001';
  end if;
  return old;
end $$;
drop trigger if exists trg_medicoes_mensais_trava_apagar on public.medicoes_mensais;
create trigger trg_medicoes_mensais_trava_apagar before delete on public.medicoes_mensais
  for each row execute function public.trava_apagar_medicao_fechada();

-- ------------------------------------------------------------------------
-- Acesso: igual ao das contas (só quem NÃO é visitante e tem acesso à obra da linha).
do $$
declare t text;
begin
  foreach t in array array['orcamento_eap', 'medicoes_mensais', 'medicao_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || ': ve da obra', t);
    execute format('drop policy if exists %I on public.%I', t || ': cria na obra', t);
    execute format('drop policy if exists %I on public.%I', t || ': altera na obra', t);
    execute format('drop policy if exists %I on public.%I', t || ': apaga na obra', t);
    execute format($f$create policy %I on public.%I for select to authenticated
      using (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$, t || ': ve da obra', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$, t || ': cria na obra', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))
      with check (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$, t || ': altera na obra', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$, t || ': apaga na obra', t);
  end loop;
end $$;
