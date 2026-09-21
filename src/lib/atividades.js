import { supabase } from './supabase';
import { hojeLocal } from './date';
import { registrarInicioRealDaAtividade } from './cronograma';
import { patchDeStatus } from './status-atividade';

// Gravação do status de uma atividade do RDO. Fica fora dos componentes porque
// dois caminhos escrevem o mesmo registro: o chip de status (toque avança) e o
// ✕ do card em Planejar (marca "não feita" com motivo). As datas e o gancho do
// cronograma precisam valer nos dois.
export async function salvarStatusAtividade(activityId, newStatus, { dayKey, statusPorDia, motivo } = {}) {
  const today = hojeLocal();
  let dataInicioAtual = null;
  if (newStatus === 'feita') {
    const { data: cur } = await supabase.from('atividades_rdo').select('data_inicio').eq('id', activityId).maybeSingle();
    dataInicioAtual = cur?.data_inicio || null;
  }
  const patch = patchDeStatus(newStatus, { dayKey, statusPorDia, motivo, dataInicioAtual, hoje: today });
  const newMap = patch.status_por_dia;

  const { error } = await supabase.from('atividades_rdo').update(patch).eq('id', activityId);
  if (error) {
    console.error('Erro ao salvar status da atividade:', error);
    return { error };
  }

  // Cronograma: a atividade entrou em execução, então o item ligado a ela
  // começa agora — sem esperar o fechamento do RDO. Só grava se o item ainda
  // não tiver início real, então fica a primeira vez.
  if (newStatus === 'em_andamento' || newStatus === 'feita') {
    await registrarInicioRealDaAtividade(activityId, today);
  }
  return { newMap };
}
