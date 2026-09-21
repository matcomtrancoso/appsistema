// Leitura do "Planejamento Semanal" colado do Excel: Ctrl+C na
// planilha e Ctrl+V no app vêm como texto separado por tabulação.
//
// A planilha tem várias seções (CANTEIRO DE OBRA, ATIVIDADES DA ENGENHARIA,
// APROVAÇÕES PENDENTES...), cada uma com o próprio cabeçalho e colunas um
// pouco diferentes. Por isso o mapa de colunas é reavaliado linha a linha, em
// vez de fixado no primeiro cabeçalho.
//
// Só depende de outra lib pura: roda no Node, no teste, sem navegador e sem
// bundler — por isso o `.js` explícito no import.

import { DIA_ORDEM } from './atividades-do-dia.js';

export function normalizar(s) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

const COLUNAS = {
  fornecedor: ['fornecedor', 'empreiteiro', 'empresa', 'responsavel'],
  atividade:  ['atividade', 'servico', 'descricao', 'servico/material', 'conteudo'],
  ambiente:   ['ambiente', 'local', 'pavimento'],
};

// Uma linha só vale como cabeçalho se traz a coluna da atividade e pelo menos
// mais uma conhecida. Os títulos de seção ("CANTEIRO DE OBRA") não passam
// nesse teste, então são ignorados sem precisar de lista de exceções.
function mapaDeColunas(celulas) {
  const mapa = {};
  celulas.forEach((c, i) => {
    const n = normalizar(c);
    for (const [campo, nomes] of Object.entries(COLUNAS)) {
      if (mapa[campo] === undefined && nomes.includes(n)) mapa[campo] = i;
    }
  });
  return (mapa.atividade !== undefined && Object.keys(mapa).length >= 2) ? mapa : null;
}

const limpar = (c) => String(c ?? '').replace(/^"|"$/g, '').replace(/\s+/g, ' ').trim();

// ── Caminho de volta: do app para o Excel ───────────────────────────────────
// Mesmas colunas que o parser acima lê, para o ciclo fechar: colo da planilha,
// ajusto no app e devolvo sem redigitar. A coluna DIAS é extra — o parser a
// ignora, porque procura cabeçalho por nome.
const DIAS_ORDEM = DIA_ORDEM;

export function paraPlanilhaSemanal(atividades) {
  const linhas = (atividades || [])
    .filter(a => a && String(a.descricao || '').trim())
    .map(a => ({
      fornecedor: String(a.empreiteiro || '').trim(),
      atividade:  String(a.descricao).trim(),
      ambiente:   String(a.ambiente || '').trim(),
      dias: DIAS_ORDEM.filter(d => (a.dias_semana || []).includes(d)).join(', '),
    }))
    .sort((x, y) => x.fornecedor.localeCompare(y.fornecedor, 'pt-BR')
                 || x.atividade.localeCompare(y.atividade, 'pt-BR'));

  const limpa = (v) => String(v ?? '').replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
  return ['FORNECEDOR\tATIVIDADE\tAMBIENTE\tDIAS',
    ...linhas.map(l => [l.fornecedor, l.atividade, l.ambiente, l.dias].map(limpa).join('\t'))
  ].join('\n');
}

export function parsePlanilhaSemanal(texto) {
  const linhas = String(texto || '').split(/\r?\n/);
  let mapa = null;
  const itens = [];

  for (const linha of linhas) {
    const celulas = linha.split('\t').map(limpar);

    const novoMapa = mapaDeColunas(celulas);
    if (novoMapa) { mapa = novoMapa; continue; }
    if (!mapa) continue;

    const atividade = celulas[mapa.atividade] || '';
    if (!atividade) continue;

    itens.push({
      atividade,
      fornecedor: mapa.fornecedor !== undefined ? (celulas[mapa.fornecedor] || '') : '',
      ambiente:   mapa.ambiente   !== undefined ? (celulas[mapa.ambiente]   || '') : '',
    });
  }
  return itens;
}
