-- =========================================================================
--  CONTAS A PAGAR / RECEBER — trava de verdade no banco (revisão de código)
--
--  A migration 20260926-contas-pagar-receber.sql copiou o RLS do resto da
--  base (lê todo mundo logado, escreve quem não é visitante). Para dinheiro e
--  salário isso é pouco:
--   1. o VISITANTE (cliente, arquiteto...) lia diária e valor fechado — nunca
--      fez parte da decisão "engenharia e mestre veem";
--   2. quem só tem acesso à obra A conseguia ler/gravar na obra B chamando a
--      API sem o filtro que o app injeta (o filtro do app é só de tela).
--
--  Estas três tabelas são novas e estão vazias, então já entram com a regra
--  definitiva (a das outras 20 tabelas só chega na fatia 3):
--    lê e grava: quem NÃO é visitante E tem acesso à obra da linha
--    (minhas_obras(): administrador vê todas; os demais, as liberadas).
--
--  Também: CHECK de diária não negativa, CHECK de despesa completa (vencimento
--  e valor — sem vencimento a despesa sumia de todos os meses) e índice na
--  chave estrangeira do colaborador.
-- =========================================================================

do $$
declare t text;
begin
  foreach t in array array['contas_pagar', 'recebimentos', 'obra_contrato'] loop
    execute format('drop policy if exists %I on public.%I', t || ': logado ve', t);
    execute format('drop policy if exists %I on public.%I', t || ': logado cria', t);
    execute format('drop policy if exists %I on public.%I', t || ': logado altera', t);
    execute format('drop policy if exists %I on public.%I', t || ': logado apaga', t);

    execute format($f$create policy %I on public.%I for select to authenticated
      using (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$,
      t || ': ve da obra', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$,
      t || ': cria na obra', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))
      with check (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$,
      t || ': altera na obra', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (not (select public.e_visitante()) and obra_id in (select public.minhas_obras()))$f$,
      t || ': apaga na obra', t);
  end loop;
end $$;

alter table public.colaboradores drop constraint if exists colaboradores_valor_diaria_check;
alter table public.colaboradores add constraint colaboradores_valor_diaria_check
  CHECK (valor_diaria is null or valor_diaria >= 0);

alter table public.contas_pagar drop constraint if exists contas_pagar_despesa_check;
alter table public.contas_pagar add constraint contas_pagar_despesa_check
  CHECK (tipo <> 'despesa' or (vencimento is not null and valor > 0));

alter table public.contas_pagar drop constraint if exists contas_pagar_valor_diaria_check;
alter table public.contas_pagar add constraint contas_pagar_valor_diaria_check CHECK (valor_diaria >= 0);

create index if not exists idx_contas_pagar_colaborador on public.contas_pagar (colaborador_id);
