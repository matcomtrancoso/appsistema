// Contagem de motivos de não execução ("ocorrências" do planejamento).
// Sem imports de propósito: roda no Node, no teste, sem banco.

// Uma atividade conta como não feita se o status geral for nao_feita ou se
// qualquer dia dela estiver assim — com dias_semana o status mora no mapa.
export function ehNaoFeita(a) {
  if (a.status === 'nao_feita') return true;
  const porDia = a.status_por_dia;
  return !!porDia && Object.values(porDia).some(s => s === 'nao_feita');
}

export const SEM_MOTIVO = '__sem';

// `de` e `ate` são ISO (YYYY-MM-DD) e comparam como texto — ordem lexicográfica
// já é ordem cronológica nesse formato. Passar null nos dois = toda a obra.
export function contarMotivos(atividades, de, ate) {
  const contagem = new Map();
  let total = 0;
  for (const a of atividades || []) {
    if (!a.data) continue;
    if (de && a.data < de) continue;
    if (ate && a.data > ate) continue;
    if (!ehNaoFeita(a)) continue;
    const id = a.motivo_nao_exec || SEM_MOTIVO;
    contagem.set(id, (contagem.get(id) || 0) + 1);
    total++;
  }
  const linhas = [...contagem]
    .map(([id, n]) => ({ id, n, pct: Math.round((n / total) * 100) }))
    .sort((x, y) => y.n - x.n || String(x.id).localeCompare(String(y.id)));
  return { total, linhas };
}

// A ocorrência que um "não foi feita" gera para o relatório do cliente.
//
// O Relatório Semanal (app irmão, mesmo banco) monta o item 5 lendo a tabela
// `ocorrencias` pelos RDOs da semana. Gravar a não-execução ali é o que faz o
// motivo — e o detalhe opcional que a pessoa escreveu — aparecer no relatório
// sem ninguém redigitar. O texto é composto aqui porque é frase de RELATÓRIO:
// quem lê é o cliente, não a equipe.
export function ocorrenciaDeNaoExecucao(atividade, motivoNome, obs) {
  const desc = String(atividade?.descricao || 'Atividade').trim();
  const motivo = String(motivoNome || '').trim();
  const detalhe = String(obs || '').trim();
  let texto = `${desc} não realizada` + (motivo ? ` — ${motivo.toLowerCase()}` : '');
  if (detalhe) texto += `. ${detalhe}`;
  return {
    descricao: texto,
    empresa: (atividade?.empreiteiro || '').trim() || null,
    categoria: 'Serviço não realizado',
  };
}
