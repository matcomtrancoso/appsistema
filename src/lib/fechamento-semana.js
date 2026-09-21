// Fechamento da semana: o que o app já sabe, no formato do Planejamento
// Semanal. Status da planilha: C = concluído, I = iniciado,
// N = não executado.
//
// Sem imports de propósito: roda no Node, no teste, sem banco.

export const C = 'C', I = 'I', N = 'N';

const dentro = (data, de, ate) => !!data && data >= de && data <= ate;

// ── Canteiro de obra ────────────────────────────────────────────────────────
// A planilha tem uma linha por atividade na semana, com um status só. A
// atividade no app pode ter status por dia, então o da semana é o consolidado:
// terminou = C, encostou = I, não saiu do lugar = N.
export function statusDaSemana(atividade) {
  const porDia = atividade?.status_por_dia;
  const todos = porDia && Object.keys(porDia).length
    ? Object.values(porDia)
    : [atividade?.status || 'pendente'];

  if (todos.some(s => s === 'feita') && !todos.some(s => s === 'pendente' || s === 'nao_feita')) return C;
  if (todos.some(s => s === 'feita' || s === 'em_andamento' || s === 'parcial')) return I;
  return N;
}

// ── Contratações / compra de materiais ──────────────────────────────────────
// Entra na semana o que teve movimento OU o que deveria ter tido:
//   aprovada na semana                        → C
//   enviada na semana (aguardando aprovação)  → I
//   deveria ter sido enviada e não foi        → N
// Uma cotação cujo prazo cai em outra semana não aparece — é o que diferencia
// "não fiz o que era desta semana" de "ainda não chegou a vez".
export function contratacoesDaSemana(contratacoes, de, ate) {
  const linhas = [];
  for (const c of contratacoes || []) {
    let status = null, motivo = '';

    if (dentro(c.data_aprovacao, de, ate)) {
      status = C; motivo = 'Aprovada na semana';
    } else if (dentro(c.data_envio, de, ate)) {
      status = I; motivo = 'Enviada para cotação, aguardando aprovação';
    } else if (dentro(c.prazo_envio, de, ate) && !c.data_envio) {
      status = N; motivo = 'Deveria ter sido enviada para cotação nesta semana';
    }
    if (!status) continue;

    linhas.push({
      id: c.id,
      descricao: c.descricao || '',
      responsavel: (status === C ? c.fornecedor_nome : c.responsavel_nome) || '',
      status,
      observacao: motivo,
    });
  }
  return linhas;
}

// ── Indicadores do topo da planilha ─────────────────────────────────────────
export function indicadores(linhas) {
  const total = linhas.length;
  const conta = (s) => linhas.filter(l => l.status === s).length;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const c = conta(C), i = conta(I), n = conta(N);
  return { total, C: c, I: i, N: n, pctC: pct(c), pctI: pct(i), pctN: pct(n) };
}

// Colagem de volta no Excel: uma linha por atividade, colunas separadas por tab.
export function paraTSV(linhas, colunas) {
  return linhas.map(l => colunas.map(k => String(l[k] ?? '').replace(/\t|\n/g, ' ')).join('\t')).join('\n');
}
