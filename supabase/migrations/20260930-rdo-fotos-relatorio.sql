-- Marca quais fotos do RDO entram no relatório semanal/mensal (tela Relatórios).
-- Com muita foto por obra, ninguém quer TODAS indo pro PDF — a Galeria de
-- fotos ganha um botão de "usar no relatório" por foto (e em lote, na seleção).
alter table public.rdo_fotos
  add column if not exists usar_no_relatorio boolean not null default false;

create index if not exists idx_rdo_fotos_relatorio
  on public.rdo_fotos (obra_id, data) where usar_no_relatorio;
