-- =========================================================================
--  CONTAS A PAGAR E CONTAS A RECEBER
--
--  contas_pagar: uma tabela só para dois tipos de conta.
--    · mao_de_obra: o pagamento de UMA pessoa da equipe própria (ADM) numa
--      quinzena. Guarda o retrato do cálculo no dia em que foi pago (dias,
--      diária, ajuste, total): mudar a diária depois NÃO reescreve o passado.
--    · despesa: qualquer outro custo lançado à mão (material, aluguel, imposto...).
--  recebimentos: dinheiro que entrou (cliente pagou), lançado à mão.
--  obra_contrato: o valor fechado com o cliente (orçamento aprovado) de cada
--    obra. O "a receber" sai de % medido (medicoes_obra) × este valor.
--  colaboradores.valor_diaria: quanto vale o dia de cada pessoa.
--
--  As três tabelas novas já nascem multi-obra (obra_id obrigatório).
--  RLS igual ao resto da base: só distingue visitante (ver "Mestre e engenheiro
--  são iguais no banco" no CLAUDE.md). Quem vê ou não vê a tela é decisão de
--  interface, e aqui a decisão foi: engenharia e mestre veem.
-- =========================================================================

alter table public.colaboradores add column if not exists valor_diaria numeric;

-- ------------------------------------------------------------------------
create table if not exists public.contas_pagar (
  id                uuid not null default gen_random_uuid(),
  obra_id           uuid not null,
  tipo              text not null,
  descricao         text not null default ''::text,
  categoria         text not null default ''::text,
  colaborador_id    uuid,
  colaborador_nome  text,
  competencia_inicio date,
  competencia_fim    date,
  dias              integer not null default 0,
  valor_diaria      numeric not null default 0,
  ajuste            numeric not null default 0,
  valor             numeric not null default 0,
  vencimento        date,
  status            text not null default 'aberto'::text,
  pago_em           date,
  observacoes       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint contas_pagar_pkey PRIMARY KEY (id),
  constraint contas_pagar_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint contas_pagar_colaborador_id_fkey FOREIGN KEY (colaborador_id) REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  constraint contas_pagar_tipo_check CHECK (tipo = ANY (ARRAY['mao_de_obra'::text, 'despesa'::text])),
  constraint contas_pagar_status_check CHECK (status = ANY (ARRAY['aberto'::text, 'pago'::text])),
  constraint contas_pagar_valor_check CHECK (valor >= 0),
  constraint contas_pagar_dias_check CHECK (dias >= 0),
  -- pagamento de pessoa precisa dizer quem e de que quinzena
  constraint contas_pagar_mao_de_obra_check CHECK (
    tipo <> 'mao_de_obra'
    or (colaborador_nome is not null and competencia_inicio is not null and competencia_fim is not null)
  ),
  -- "pago" sempre tem data de pagamento
  constraint contas_pagar_pago_check CHECK (status <> 'pago' or pago_em is not null)
);
create index if not exists idx_contas_pagar_obra on public.contas_pagar (obra_id);
create index if not exists idx_contas_pagar_competencia on public.contas_pagar (obra_id, competencia_inicio);
create index if not exists idx_contas_pagar_vencimento on public.contas_pagar (obra_id, vencimento);
-- Uma pessoa não é paga duas vezes na mesma quinzena (por obra).
create unique index if not exists contas_pagar_pessoa_quinzena_key
  on public.contas_pagar (obra_id, lower(colaborador_nome), competencia_inicio)
  where tipo = 'mao_de_obra';

drop trigger if exists trg_contas_pagar_updated_at on public.contas_pagar;
create trigger trg_contas_pagar_updated_at before update on public.contas_pagar
  for each row execute function public.set_updated_at();

alter table public.contas_pagar enable row level security;
drop policy if exists "contas_pagar: logado ve" on public.contas_pagar;
create policy "contas_pagar: logado ve" on public.contas_pagar for select to authenticated using (true);
drop policy if exists "contas_pagar: logado cria" on public.contas_pagar;
create policy "contas_pagar: logado cria" on public.contas_pagar for insert to authenticated with check (not public.e_visitante());
drop policy if exists "contas_pagar: logado altera" on public.contas_pagar;
create policy "contas_pagar: logado altera" on public.contas_pagar for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "contas_pagar: logado apaga" on public.contas_pagar;
create policy "contas_pagar: logado apaga" on public.contas_pagar for delete to authenticated using (not public.e_visitante());


-- ------------------------------------------------------------------------
create table if not exists public.recebimentos (
  id          uuid not null default gen_random_uuid(),
  obra_id     uuid not null,
  data        date not null,
  valor       numeric not null,
  descricao   text not null default ''::text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint recebimentos_pkey PRIMARY KEY (id),
  constraint recebimentos_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint recebimentos_valor_check CHECK (valor > 0)
);
create index if not exists idx_recebimentos_obra_data on public.recebimentos (obra_id, data);

drop trigger if exists trg_recebimentos_updated_at on public.recebimentos;
create trigger trg_recebimentos_updated_at before update on public.recebimentos
  for each row execute function public.set_updated_at();

alter table public.recebimentos enable row level security;
drop policy if exists "recebimentos: logado ve" on public.recebimentos;
create policy "recebimentos: logado ve" on public.recebimentos for select to authenticated using (true);
drop policy if exists "recebimentos: logado cria" on public.recebimentos;
create policy "recebimentos: logado cria" on public.recebimentos for insert to authenticated with check (not public.e_visitante());
drop policy if exists "recebimentos: logado altera" on public.recebimentos;
create policy "recebimentos: logado altera" on public.recebimentos for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "recebimentos: logado apaga" on public.recebimentos;
create policy "recebimentos: logado apaga" on public.recebimentos for delete to authenticated using (not public.e_visitante());


-- ------------------------------------------------------------------------
create table if not exists public.obra_contrato (
  id             uuid not null default gen_random_uuid(),
  obra_id        uuid not null,
  valor_aprovado numeric not null,
  aprovado_em    date,
  observacoes    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint obra_contrato_pkey PRIMARY KEY (id),
  constraint obra_contrato_obra_id_fkey FOREIGN KEY (obra_id) REFERENCES public.obras(id),
  constraint obra_contrato_valor_check CHECK (valor_aprovado >= 0)
);
-- Um valor fechado por obra (a tela grava com upsert nesta chave).
create unique index if not exists obra_contrato_obra_key on public.obra_contrato (obra_id);

drop trigger if exists trg_obra_contrato_updated_at on public.obra_contrato;
create trigger trg_obra_contrato_updated_at before update on public.obra_contrato
  for each row execute function public.set_updated_at();

alter table public.obra_contrato enable row level security;
drop policy if exists "obra_contrato: logado ve" on public.obra_contrato;
create policy "obra_contrato: logado ve" on public.obra_contrato for select to authenticated using (true);
drop policy if exists "obra_contrato: logado cria" on public.obra_contrato;
create policy "obra_contrato: logado cria" on public.obra_contrato for insert to authenticated with check (not public.e_visitante());
drop policy if exists "obra_contrato: logado altera" on public.obra_contrato;
create policy "obra_contrato: logado altera" on public.obra_contrato for update to authenticated using (not public.e_visitante()) with check (not public.e_visitante());
drop policy if exists "obra_contrato: logado apaga" on public.obra_contrato;
create policy "obra_contrato: logado apaga" on public.obra_contrato for delete to authenticated using (not public.e_visitante());
