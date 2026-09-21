// Quais serviços entram no diário de UM dia.
//
// O planejamento da semana grava todas as atividades no RDO da SEGUNDA, com
// `dias_semana` dizendo em que dias cada uma acontece. Quem lê um dia precisa
// aplicar esse recorte: sem ele a segunda-feira mostra a semana inteira, e o
// mestre acaba apontando gente num serviço que só começa na quinta.
//
// A busca antiga varria 14 dias para trás — e 14 dias atravessam duas
// segundas, então o diário de hoje vinha com o plano da semana passada
// misturado ao de hoje. A janela certa é a semana da própria data.
//
// Sem import de banco de propósito: roda no Node, no teste, sem bundler.
import { parseISODate, toISODate } from './date.js';

// A CHAVE do dia — a que vai para `dias_semana` e `status_por_dia`, no banco.
// Sem acento, e é o dono único: esta lista já esteve copiada em dez arquivos, e
// numa das cópias o sábado tinha acento. Dez cópias sobrevivem até a décima
// divergir, e ela diverge calada.
export const DIA_KEY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

// O RÓTULO do dia — o que aparece na tela. Separado da chave de propósito: o
// rótulo leva acento e a chave não. Se um dia virarem a mesma lista, o "sáb"
// acentuado entra no banco e para de casar com o que já está gravado.
export const DIA_ROTULO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// A semana na ORDEM em que se lê e se planeja: começa na segunda. É lista
// diferente de DIA_KEY, que começa no domingo porque é indexada por getDay().
// As duas convivem de propósito — uma é índice, a outra é ordem de leitura.
export const DIA_ORDEM = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

// Rótulo curto por chave, para chip e cabeçalho de coluna.
export const DIA_CURTO = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };

export function chaveDoDia(iso) {
  const d = parseISODate(iso);
  return d ? DIA_KEY[d.getDay()] : null;
}

// Segunda a domingo — a mesma semana que o planejador usa para gravar.
export function semanaDe(iso) {
  const d = parseISODate(iso);
  if (!d) return { segunda: null, domingo: null };
  const dow = d.getDay();
  const seg = new Date(d);
  seg.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return { segunda: toISODate(seg), domingo: toISODate(dom) };
}

// `dataDoRdo(rdo_id)` devolve a data ISO do RDO onde a atividade está gravada.
//
// Não há filtro por status aqui de propósito. O filtro antigo derrubava quem
// tivesse `status === 'feita'`, mas numa atividade planejada o status do dia
// mora em `status_por_dia` — o campo liso não é a verdade daquele dia. E,
// mesmo que fosse: esconder do diário o serviço já concluído tira do mestre
// justamente a linha onde ele marca que concluiu.
function ehDoDia(a, dataISO, dataDoRdo) {
  const dias = Array.isArray(a?.dias_semana) ? a.dias_semana : [];
  // Planejada na semana: vale o recorte por dia da semana.
  if (dias.length > 0) return dias.includes(chaveDoDia(dataISO));
  // Sem dias marcados é lançamento avulso — fica no dia em que foi lançado.
  return dataDoRdo(a?.rdo_id) === dataISO;
}

export function atividadesDoDia(lista, dataISO, dataDoRdo) {
  return (lista || []).filter(a => ehDoDia(a, dataISO, dataDoRdo));
}

// Onde encaixar um status DERIVADO do efetivo (quem está apontado na frente).
//
// Ele vale para um dia só: o dia do RDO de onde aquele efetivo veio. Já foi
// gravado no `status` liso da atividade, e o liso é o que a tela mostra em todo
// dia sem valor próprio em status_por_dia — então marcar "em andamento" na
// terça pintava quarta, quinta e sexta de "em andamento" num serviço que nem
// tinha começado nesses dias.
//
// Só preenche buraco: o que a pessoa gravou à mão continua mandando. Atividade
// de um dia só não tem mapa — nela o `status` liso É o status daquele dia.
export function mesclarStatusDerivado(a, { doProprioDia, deHoje, diaDoRdo, diaDeHoje } = {}) {
  if (!doProprioDia && !deHoje) return a;
  const multiDia = Array.isArray(a?.dias_semana) && a.dias_semana.length > 0;
  if (!multiDia) return { ...a, status: deHoje || doProprioDia };
  const mapa = { ...(a.status_por_dia || {}) };
  if (doProprioDia && diaDoRdo && !mapa[diaDoRdo]) mapa[diaDoRdo] = doProprioDia;
  if (deHoje && diaDeHoje && !mapa[diaDeHoje]) mapa[diaDeHoje] = deHoje;
  return { ...a, status_por_dia: mapa };
}

export const SEM_AMBIENTE = 'Sem ambiente';

// Agrupa as frentes do dia por ambiente, na ordem de quem anda pela obra:
// por pavimento, depois por nome. O que não tem ambiente vira um grupo de
// verdade, no fim — antes essas frentes não tinham onde aparecer.
export function agruparPorAmbiente(atividades, pavimentoDe = () => '') {
  const m = new Map();
  for (const a of atividades || []) {
    const nome = String(a.ambiente || '').trim() || SEM_AMBIENTE;
    if (!m.has(nome)) {
      const sem = nome === SEM_AMBIENTE;
      m.set(nome, { ambiente: nome, semAmbiente: sem, pavimento: sem ? '' : (pavimentoDe(nome) || ''), itens: [] });
    }
    m.get(nome).itens.push(a);
  }
  return [...m.values()].sort((x, y) => {
    if (x.semAmbiente !== y.semAmbiente) return x.semAmbiente ? 1 : -1;
    const p = (x.pavimento || '').localeCompare(y.pavimento || '', 'pt-BR');
    return p !== 0 ? p : x.ambiente.localeCompare(y.ambiente, 'pt-BR');
  });
}
