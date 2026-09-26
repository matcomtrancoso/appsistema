-- =========================================================================
--  REFORÇO DAS TRAVAS DA MEDIÇÃO MENSAL (achados da revisão do 20260927)
--
--  1. O gatilho do item olhava só a medição NOVA: dava para "mover" um item de
--     mês fechado para um mês aberto e o valor sumia do mês fechado. Agora olha
--     a de antes e a de depois. Também roda como SECURITY DEFINER: com RLS ele
--     não enxergava a medição de outra obra (e deixava passar). E confere que a
--     linha, a medição e o orçamento são da MESMA obra.
--  2. Mês fechado só voltava a "aberta" por regra da tela. Agora o banco só
--     deixa reabrir a ÚLTIMA medição da obra, e nunca muda obra ou mês.
--  3. Com mês fechado, quantidade/preço/grupo/código do orçamento não mudam
--     (mudaria o valor já medido e fechado).
--  4. Apagar linha do orçamento que já tem medição lançada deixa de apagar a
--     medição junto (CASCADE -> RESTRICT): dá erro em vez de perder dado.
--  5. Uma tarefa de cronograma por linha do orçamento (não deixa gerar duas vezes).
-- =========================================================================

create or replace function public.trava_medicao_fechada()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_obra uuid; v_eap_obra uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select status into v_status from public.medicoes_mensais where id = old.medicao_id;
    if v_status = 'fechada' then
      raise exception 'Mês fechado: reabra a medição para alterar.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select status, obra_id into v_status, v_obra from public.medicoes_mensais where id = new.medicao_id;
    if v_status = 'fechada' then
      raise exception 'Mês fechado: reabra a medição para alterar.' using errcode = 'P0001';
    end if;
    select obra_id into v_eap_obra from public.orcamento_eap where id = new.eap_id;
    if v_obra is distinct from new.obra_id or v_eap_obra is distinct from new.obra_id then
      raise exception 'A linha, a medição e o orçamento têm que ser da mesma obra.' using errcode = 'P0001';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create or replace function public.trava_apagar_medicao_fechada()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'fechada' then
    raise exception 'Mês fechado não pode ser apagado: reabra antes.' using errcode = 'P0001';
  end if;
  return old;
end $$;

create or replace function public.trava_alterar_medicao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.obra_id is distinct from old.obra_id or new.mes is distinct from old.mes then
    raise exception 'A obra e o mês de uma medição não mudam.' using errcode = 'P0001';
  end if;
  if old.status = 'fechada' then
    if new.status = 'fechada' then
      raise exception 'Mês fechado: reabra a medição para alterar.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.medicoes_mensais where obra_id = old.obra_id and mes > old.mes) then
      raise exception 'Só a última medição pode ser reaberta.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists trg_medicoes_mensais_trava_alterar on public.medicoes_mensais;
create trigger trg_medicoes_mensais_trava_alterar before update on public.medicoes_mensais
  for each row execute function public.trava_alterar_medicao();

create or replace function public.trava_valores_orcamento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (new.quantidade, new.preco_unitario, new.is_grupo, new.codigo, new.pai_codigo)
     is distinct from (old.quantidade, old.preco_unitario, old.is_grupo, old.codigo, old.pai_codigo)
     and exists (select 1 from public.medicoes_mensais where obra_id = old.obra_id and status = 'fechada') then
    raise exception 'Há mês de medição fechado: os valores do orçamento não podem mais mudar.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_orcamento_eap_trava_valores on public.orcamento_eap;
create trigger trg_orcamento_eap_trava_valores before update on public.orcamento_eap
  for each row execute function public.trava_valores_orcamento();

alter table public.medicao_itens drop constraint if exists medicao_itens_eap_id_fkey;
alter table public.medicao_itens add constraint medicao_itens_eap_id_fkey
  FOREIGN KEY (eap_id) REFERENCES public.orcamento_eap(id) ON DELETE RESTRICT;

create unique index if not exists cronograma_itens_orcamento_eap_key
  on public.cronograma_itens (orcamento_eap_id) where orcamento_eap_id is not null;

-- No máximo UMA medição aberta por obra: fechar março antes de fevereiro
-- (duas telas abertas) faria o valor de março incluir o avanço de fevereiro.
create unique index if not exists medicoes_mensais_uma_aberta_key
  on public.medicoes_mensais (obra_id) where status <> 'fechada';
