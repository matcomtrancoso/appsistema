// ── Ciclo do chip de status por toque ─────────────────────────────────────
// No RDO o mestre não escolhe de uma lista: toca no chip e ele avança.
//   Não iniciou → Em andamento → Concluído.
// No Concluído o toque NÃO segue o ciclo (senão desmarcaria sem querer um
// serviço pronto). Em vez disso devolve { pedirConfirmacao: true } e a tela
// abre o popup "voltar para andamento / reiniciar o serviço".
export const CICLO_STATUS = ['nao_iniciou', 'em_andamento', 'concluida'];

// Ações do popup que aparece ao tocar num serviço já concluído.
//   voltar   → volta para "Em andamento" (mantém o início real, some a conclusão)
//   reiniciar→ volta para "Não iniciou" (zera início e conclusão)
export const ACOES_CONCLUIDA = {
  voltar: 'em_andamento',
  reiniciar: 'nao_iniciou',
};

// Dado o status atual do chip, qual é o próximo ao tocar. Um status
// desconhecido (ex.: 'ocorrencia' ou vazio) recomeça o ciclo de forma segura.
export function proximoStatus(atual) {
  const cur = CICLO_STATUS.includes(atual) ? atual : 'nao_iniciou';
  if (cur === 'concluida') return { pedirConfirmacao: true };
  return { status: CICLO_STATUS[CICLO_STATUS.indexOf(cur) + 1] };
}

// Regras puras do status da atividade: dado o novo status, qual patch vai para
// o banco. Sem imports de propósito — assim o teste (tests/status-atividade.mjs)
// roda no Node direto, sem banco e sem bundler.
export function patchDeStatus(newStatus, { dayKey, statusPorDia, motivo, dataInicioAtual, hoje } = {}) {
  const patch = {};
  if (dayKey) patch.status_por_dia = { ...(statusPorDia || {}), [dayKey]: newStatus };
  else patch.status = newStatus;

  if (newStatus === 'em_andamento') {
    patch.data_inicio = hoje;
    patch.data_conclusao = null;   // voltou de "feita": a conclusão não vale mais
  }
  if (newStatus === 'feita') {
    patch.data_conclusao = hoje;
    if (!dataInicioAtual) patch.data_inicio = hoje;   // concluída sem nunca ter iniciado
  }
  // Reiniciar limpa as datas, senão sobraria conclusão num serviço reaberto.
  if (newStatus === 'pendente') { patch.data_inicio = null; patch.data_conclusao = null; }
  // O motivo só existe enquanto a atividade está como não feita.
  patch.motivo_nao_exec = newStatus === 'nao_feita' ? (motivo || null) : null;
  return patch;
}

// Patch de status vindo do RDO de UM dia. Uma atividade planejada na semana
// (tem dias_semana) precisa gravar o status só naquele dia — em status_por_dia —
// senão o RDO de quinta carimba o status da semana inteira, porque o
// planejamento cai no `status` liso quando não há valor por dia. Atividade de um
// dia só (presa ao RDO, sem dias_semana) continua gravando no `status` liso.
export function patchStatusDoDia(atividade, novoStatus, dayKey) {
  const multiDia = Array.isArray(atividade?.dias_semana) && atividade.dias_semana.length > 0;
  if (multiDia && dayKey) {
    return { status_por_dia: { ...(atividade?.status_por_dia || {}), [dayKey]: novoStatus } };
  }
  return { status: novoStatus };
}
