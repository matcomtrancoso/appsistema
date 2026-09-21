// Exclusão que distingue "apagou" de "não podia".
//
// Bloqueio de RLS não devolve erro: o banco apaga zero linhas e responde ok.
// Sem conferir o que voltou, a tela finge sucesso e o item reaparece calado —
// foi assim com visita, pendência e pedido, cada um descoberto de novo.
// O .select() no fim força o PostgREST a dizer QUANTAS linhas saíram.
import { supabase } from './supabase';

export async function apagarLinha(tabela, id) {
  const { data, error } = await supabase.from(tabela).delete().eq('id', id).select('id');
  if (error) return { ok: false, barrado: false, erro: error };
  if (!data || data.length === 0) return { ok: false, barrado: true, erro: null };
  return { ok: true, barrado: false, erro: null };
}
