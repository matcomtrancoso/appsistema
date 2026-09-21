// Recorte por período do módulo Projetos: semana, mês ou tudo, podendo andar
// para trás e para frente.
//
// A data que coloca o item dentro do período muda conforme onde ele está — é o
// que o engenheiro pergunta em cada coluna:
//   não iniciado → o que DEVERIA COMEÇAR nesta semana
//   em andamento → o que DEVERIA ENTREGAR nesta semana
//   recebido     → o que DE FATO CHEGOU nesta semana
// Uma data só para os três responderia a pergunta errada em duas delas.
//
// Importa só de date.js (que também não tem dependência), com extensão, para
// rodar no Node sem bundler.
import { toISODate, parseISODate } from './date.js';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// escopo: 'semana' | 'mes' | 'tudo' · offset: 0 = atual, -1 = anterior, 1 = próximo
export function intervalo(escopo, offset = 0, hojeISO = null) {
  const base = parseISODate(hojeISO) || new Date();

  if (escopo === 'semana') {
    const ini = new Date(base);
    const segunda = (ini.getDay() + 6) % 7;   // 0 = segunda, 6 = domingo
    ini.setDate(ini.getDate() - segunda + offset * 7);
    const fim = new Date(ini);
    fim.setDate(fim.getDate() + 6);
    return { de: toISODate(ini), ate: toISODate(fim) };
  }

  if (escopo === 'mes') {
    const ini = new Date(base.getFullYear(), base.getMonth() + offset, 1, 12);
    const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 0, 12);
    return { de: toISODate(ini), ate: toISODate(fim) };
  }

  return { de: null, ate: null };
}

export function rotuloPeriodo(escopo, offset = 0, hojeISO = null) {
  if (escopo === 'tudo') return 'Todos os períodos';
  const { de, ate } = intervalo(escopo, offset, hojeISO);
  const dm = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  if (escopo === 'semana') {
    const nome = offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana passada'
               : offset === 1 ? 'Próxima semana' : null;
    return (nome ? nome + ' · ' : '') + dm(de) + ' a ' + dm(ate);
  }
  const d = parseISODate(de);
  return MESES[d.getMonth()] + '/' + String(d.getFullYear()).slice(2) +
         (offset === 0 ? ' · mês atual' : '');
}

export function dataDoPeriodo(p) {
  if (!p) return null;
  if (p.data_recebida || p.status === 'recebido') return p.data_recebida || null;
  if (p.status === 'em_andamento') return p.data_prevista || null;
  // Não iniciado: a pergunta é quando devia começar; sem início informado, a
  // entrega prevista já serve de âncora em vez de sumir da tela.
  return p.data_inicio || p.data_prevista || null;
}

// Devolve { dentro, semData }: quem cai no período e quem não tem data para
// julgar. O segundo grupo não é descartado em silêncio — vira contador na tela.
export function filtrarPorPeriodo(projetos, escopo, offset = 0, hojeISO = null) {
  if (escopo === 'tudo') return { dentro: [...(projetos || [])], semData: [] };
  const { de, ate } = intervalo(escopo, offset, hojeISO);
  const dentro = [], semData = [];
  for (const p of projetos || []) {
    const d = dataDoPeriodo(p);
    if (!d) semData.push(p);
    else if (d >= de && d <= ate) dentro.push(p);
  }
  return { dentro, semData };
}
