// ── Cronograma: parser do export do MS Project e regras de avanço ───────────
import { hojeLocal, parseISODate, toISODate } from './date';
import { supabase } from './supabase';

// O PDF/impressão do Project sai como uma linha por tarefa, no formato:
//   <Id> <Nome da Tarefa> <N> dias <Dia> <dd/mm/aa> <Dia> <dd/mm/aa>
// Ex.: "17 Alvenaria subsolo 22 dias Sex 27/11/26 Qui 11/02/27"
// As linhas vêm coladas umas nas outras quando copiadas do PDF, por isso o
// parser varre o texto inteiro em vez de trabalhar linha a linha.
const DIA_SEM = '(?:Seg|Ter|Qua|Qui|Sex|S[áa]b|Dom)';

// O número de dígitos do ano precisa ser FIXO. Com `\d{2,4}`, numa data de ano
// curto seguida do Id da próxima tarefa ("22/04/26" + "4 Gabarito...") o regex
// engolia "264" como ano e desalinhava todas as linhas seguintes.
function regexLinha(digitosAno) {
  return new RegExp(
    '(\\d+)\\s+(.+?)\\s+(\\d+)\\s+dias?\\s+' +
    `${DIA_SEM}\\s+(\\d{2}\\/\\d{2}\\/\\d{${digitosAno}})\\s*` +
    `${DIA_SEM}\\s+(\\d{2}\\/\\d{2}\\/\\d{${digitosAno}})`,
    'g'
  );
}

function paraISO(br) {
  const [d, m, a] = br.split('/');
  const ano = a.length === 2 ? `20${a}` : a;
  return `${ano}-${m}-${d}`;
}

/**
 * Lê o texto colado do cronograma e devolve { itens, erros }.
 * Não grava nada — a tela mostra a prévia antes de confirmar.
 */
export function parseCronograma(texto) {
  const erros = [];
  if (!texto || !texto.trim()) return { itens: [], erros: ['Cole o texto do cronograma.'] };

  // O Project imprime o ano com 2 ou 4 dígitos conforme a configuração.
  // Roda os dois e fica com o que reconheceu mais tarefas.
  function extrair(digitosAno) {
    const re = regexLinha(digitosAno);
    const achados = [];
    let m;
    while ((m = re.exec(texto)) !== null) {
      const [, id, nomeBruto, dur, ini, fim] = m;
      const nome = nomeBruto.replace(/\s+/g, ' ').trim()
        // o cabeçalho da tabela vem grudado na primeira linha
        .replace(/^(Id\s+)?Modo da\s*Tarefa\s*Nome da Tarefa\s*Duração\s*Início\s*Término\s*/i, '')
        .trim();
      if (!nome) continue;
      achados.push({
        wbs_id: parseInt(id, 10),
        nome,
        duracao_dias: parseInt(dur, 10),
        inicio_previsto: paraISO(ini),
        termino_previsto: paraISO(fim),
      });
    }
    return achados;
  }

  const comAnoCurto = extrair(2);
  const comAnoLongo = extrair(4);
  const brutos = comAnoLongo.length > comAnoCurto.length ? comAnoLongo : comAnoCurto;

  if (brutos.length === 0) {
    return { itens: [], erros: ['Não reconheci nenhuma tarefa. Confira se o texto foi copiado do cronograma do Project (precisa ter Id, duração em dias e as datas de início e término).'] };
  }

  // Remove duplicatas por wbs_id, mantendo a primeira ocorrência.
  const porId = new Map();
  for (const b of brutos) if (!porId.has(b.wbs_id)) porId.set(b.wbs_id, b);
  const itens = [...porId.values()].sort((a, b) => a.wbs_id - b.wbs_id);

  // A indentação da EAP se perde no texto, mas a regra do Project não: uma
  // tarefa de RESUMO começa exatamente quando o primeiro filho começa e termina
  // exatamente quando o último termina. Testar só "cabe dentro" produzia falsos
  // grupos (ex.: "Pintura - Subsolo" virava pai de "Esquadrias"); exigir o
  // intervalo idêntico ao do bloco elimina todos eles.
  for (const it of itens) { it.is_grupo = false; it.pai_wbs_id = null; it.nivel = 0; it.ordem = it.wbs_id; }

  const dentro = (filho, pai) =>
    filho.inicio_previsto >= pai.inicio_previsto && filho.termino_previsto <= pai.termino_previsto;

  function montar(de, ate, paiId, nivel) {
    let k = de;
    while (k <= ate) {
      const at = itens[k];
      at.pai_wbs_id = paiId;
      at.nivel = nivel;

      // bloco contíguo de itens que cabem dentro deste
      let j = k + 1;
      while (j <= ate && dentro(itens[j], at)) j++;
      const bloco = itens.slice(k + 1, j);

      const fecha = bloco.length > 0 &&
        bloco.reduce((min, b) => b.inicio_previsto < min ? b.inicio_previsto : min, bloco[0].inicio_previsto) === at.inicio_previsto &&
        bloco.reduce((max, b) => b.termino_previsto > max ? b.termino_previsto : max, bloco[0].termino_previsto) === at.termino_previsto;

      if (fecha) {
        at.is_grupo = true;
        montar(k + 1, j - 1, at.wbs_id, nivel + 1);
        k = j;
      } else {
        k = k + 1;
      }
    }
  }
  montar(0, itens.length - 1, null, 0);

  // Avisos (não impedem a importação)
  const faltando = [];
  for (let i = itens[0].wbs_id; i <= itens[itens.length - 1].wbs_id; i++) {
    if (!porId.has(i)) faltando.push(i);
  }
  if (faltando.length) {
    erros.push(`Aviso: os Ids ${faltando.slice(0, 8).join(', ')}${faltando.length > 8 ? '…' : ''} não foram encontrados. Pode ser que o texto tenha vindo incompleto.`);
  }
  for (const it of itens) {
    if (it.termino_previsto < it.inicio_previsto) {
      erros.push(`Aviso: "${it.nome}" tem término antes do início.`);
    }
  }

  return { itens, erros };
}

// ── Situação de um item ─────────────────────────────────────────────────────
// Regras (combinadas com o usuário):
//   · início real é automático (primeiro RDO com efetivo numa atividade ligada)
//   · término é manual (só o usuário sabe que acabou)
//   · % é manual, com sugestão pelo tempo decorrido
export const SIT = {
  concluido:   { chave: 'concluido',   label: 'Concluído',    cor: '#16A34A' },
  atrasado:    { chave: 'atrasado',    label: 'Atrasado',     cor: '#DC2626' },
  andamento:   { chave: 'andamento',   label: 'Em andamento', cor: '#D97706' },
  a_iniciar:   { chave: 'a_iniciar',   label: 'A iniciar',    cor: '#2563EB' },
  nao_iniciado:{ chave: 'nao_iniciado',label: 'Não iniciado', cor: '#94A3B8' },
};

export function situacaoItem(item, hoje = hojeLocal()) {
  if (item.concluido) return SIT.concluido;
  const comecou = !!item.inicio_real || (item.percentual || 0) > 0;

  // Passou do término previsto sem estar concluído → atrasado.
  if (item.termino_previsto && item.termino_previsto < hoje) return SIT.atrasado;
  // Deveria ter começado e não começou → atrasado.
  if (!comecou && item.inicio_previsto && item.inicio_previsto < hoje) return SIT.atrasado;

  if (comecou) return SIT.andamento;
  // Começa nos próximos 14 dias.
  if (item.inicio_previsto) {
    const dias = Math.round((parseISODate(item.inicio_previsto) - parseISODate(hoje)) / 86400000);
    if (dias >= 0 && dias <= 14) return SIT.a_iniciar;
  }
  return SIT.nao_iniciado;
}

// Sugestão de % pelo tempo decorrido — é só um palpite exibido ao lado do
// campo; o valor que vale é sempre o que o usuário digitar.
export function percentualSugerido(item, hoje = hojeLocal()) {
  const ini = item.inicio_real || item.inicio_previsto;
  if (!ini || !item.termino_previsto) return null;
  const a = parseISODate(ini), b = parseISODate(item.termino_previsto), h = parseISODate(hoje);
  if (!a || !b || !h || b <= a) return null;
  const pct = Math.round(((h - a) / (b - a)) * 100);
  return Math.max(0, Math.min(100, pct));
}

// Avanço de um grupo = média dos filhos, ponderada pela duração planejada.
export function percentualGrupo(filhos) {
  const validos = filhos.filter(f => Number(f.duracao_dias) > 0);
  if (!validos.length) return 0;
  const total = validos.reduce((s, f) => s + Number(f.duracao_dias), 0);
  const soma  = validos.reduce((s, f) => s + Number(f.duracao_dias) * (f.concluido ? 100 : (f.percentual || 0)), 0);
  return Math.round(soma / total);
}

// ── Dias úteis ──────────────────────────────────────────────────────────────
// As durações do cronograma do Project são em dias úteis (seg–sex).
// Data de término a partir de um início e uma duração em dias úteis
// (o dia de início conta como o primeiro dia).
export function terminoPorDuracao(inicioISO, duracaoUteis) {
  if (!inicioISO || !duracaoUteis || duracaoUteis < 1) return null;
  const d = parseISODate(inicioISO);
  if (!d) return null;
  let contados = (d.getDay() !== 0 && d.getDay() !== 6) ? 1 : 0;
  while (contados < duracaoUteis) {
    d.setDate(d.getDate() + 1);
    const s = d.getDay();
    if (s !== 0 && s !== 6) contados++;
  }
  return toISODate(d);
}

// ── Curva S: previsto × realizado ───────────────────────────────────────────
// O peso de cada tarefa é a duração planejada — é o único indicador de "tamanho"
// que o cronograma exportado traz. Dentro da tarefa, o avanço previsto é
// distribuído linearmente entre início e término. Períodos sem tarefa nenhuma
// (recesso, por exemplo) aparecem como patamar reto, que é o comportamento certo.
function fracaoPrevista(item, dataISO) {
  const ini = parseISODate(item.inicio_previsto);
  const fim = parseISODate(item.termino_previsto);
  const d   = parseISODate(dataISO);
  if (!ini || !fim || !d) return 0;
  if (d <= ini) return 0;
  if (d >= fim) return 1;
  const total = fim - ini;
  return total > 0 ? (d - ini) / total : 1;
}

function ultimoMes(iso) {
  const d = parseISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/**
 * Devolve um ponto por mês: { mes: 'YYYY-MM', ate, previsto, realizado }.
 * `realizado` é null para meses no futuro — não se inventa medição.
 */
export function curvaS(folhas, historico = [], hoje = hojeLocal()) {
  const validos = (folhas || []).filter(f =>
    f.inicio_previsto && f.termino_previsto && Number(f.duracao_dias) > 0);
  if (!validos.length) return [];

  const pesoTotal = validos.reduce((s, f) => s + Number(f.duracao_dias), 0);

  // Histórico por item, ordenado por data
  const hist = {};
  for (const h of historico) (hist[h.item_id] ||= []).push(h);
  for (const k of Object.keys(hist)) hist[k].sort((a, b) => a.data_ref.localeCompare(b.data_ref));

  // O valor de hoje pode ainda não ter virado linha de histórico; garante que conte.
  const agora = {};
  for (const f of validos) agora[f.id] = f.concluido ? 100 : (f.percentual || 0);

  const pctEm = (item, dataISO) => {
    if (item.concluido && item.concluido_em && item.concluido_em <= dataISO) return 100;
    const lista = hist[item.id] || [];
    let v = 0;
    for (const h of lista) { if (h.data_ref <= dataISO) v = h.percentual; else break; }
    if (dataISO >= hoje) v = Math.max(v, agora[item.id] || 0);
    return v;
  };

  const inicioObra = validos.reduce((m, f) => f.inicio_previsto < m ? f.inicio_previsto : m, validos[0].inicio_previsto);
  const fimObra    = validos.reduce((m, f) => f.termino_previsto > m ? f.termino_previsto : m, validos[0].termino_previsto);

  const pontos = [];
  const cursor = parseISODate(inicioObra);
  cursor.setDate(1);
  const limite = parseISODate(fimObra);

  while (cursor <= limite) {
    const mes = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
    const ate = ultimoMes(`${mes}-01`);

    let sp = 0, sr = 0;
    for (const f of validos) {
      const peso = Number(f.duracao_dias);
      sp += peso * fracaoPrevista(f, ate);
      sr += peso * (pctEm(f, ate) / 100);
    }
    pontos.push({
      mes,
      ate,
      previsto: Math.round((sp / pesoTotal) * 1000) / 10,
      // mês inteiramente no futuro não tem realizado
      realizado: ate <= ultimoMes(hoje) ? Math.round((sr / pesoTotal) * 1000) / 10 : null,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return pontos;
}

/**
 * Indicadores do topo da tela: onde a obra deveria estar, onde está, e em que
 * ponto do tempo ela se encontra.
 *   previsto/realizado -> calculados para HOJE (e não para o fim do mês)
 *   dias               -> corridos de calendário, que é como se conta prazo de obra
 *   semana             -> mesma contagem do Planejar (semana 1 = semana do início)
 */
export function indicadoresObra(folhas, hoje = hojeLocal()) {
  const validos = (folhas || []).filter(f =>
    f.inicio_previsto && f.termino_previsto && Number(f.duracao_dias) > 0);
  if (!validos.length) return null;

  const inicio = validos.reduce((m, f) => f.inicio_previsto < m ? f.inicio_previsto : m, validos[0].inicio_previsto);
  const fim    = validos.reduce((m, f) => f.termino_previsto > m ? f.termino_previsto : m, validos[0].termino_previsto);

  const pesoTotal = validos.reduce((s, f) => s + Number(f.duracao_dias), 0);
  let sp = 0, sr = 0;
  for (const f of validos) {
    const peso = Number(f.duracao_dias);
    sp += peso * fracaoPrevista(f, hoje);
    sr += peso * ((f.concluido ? 100 : (f.percentual || 0)) / 100);
  }
  const previsto  = Math.round((sp / pesoTotal) * 1000) / 10;
  const realizado = Math.round((sr / pesoTotal) * 1000) / 10;

  const dia = 86400000;
  const dTotal = Math.round((parseISODate(fim) - parseISODate(inicio)) / dia) + 1;
  const dPassados = Math.max(0, Math.min(dTotal, Math.round((parseISODate(hoje) - parseISODate(inicio)) / dia) + 1));
  const semana = Math.max(1, Math.floor((parseISODate(hoje) - parseISODate(inicio)) / (7 * dia)) + 1);

  return {
    inicio, fim,
    previsto, realizado,
    desvio: Math.round((realizado - previsto) * 10) / 10,
    diasTotais: dTotal,
    diasPassados: dPassados,
    diasRestantes: Math.max(0, dTotal - dPassados),
    pctTempo: Math.round((dPassados / dTotal) * 1000) / 10,
    semana,
    comecou: hoje >= inicio,
    terminou: hoje > fim,
  };
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function rotuloMes(mes) {
  const [a, m] = mes.split('-');
  return `${MES_CURTO[Number(m) - 1]}/${a.slice(2)}`;
}

// Dias de atraso/adiantamento em relação ao término previsto (negativo = folga).
export function diasDeAtraso(item, hoje = hojeLocal()) {
  if (!item.termino_previsto || item.concluido) return null;
  const d = Math.round((parseISODate(hoje) - parseISODate(item.termino_previsto)) / 86400000);
  return d > 0 ? d : null;
}

// ── Início real automático ────────────────────────────────────────────────
// Grava a data APENAS onde `inicio_real` ainda está vazio, para ficar
// registrado o primeiro dia em que a equipe tocou o item. Nunca lança: é
// efeito colateral e não pode derrubar quem chamou.
async function iniciarItens(ids, dataISO) {
  const unicos = [...new Set((ids || []).filter(Boolean))];
  if (!unicos.length) return;
  const { error } = await supabase
    .from('cronograma_itens').update({ inicio_real: dataISO })
    .in('id', unicos).is('inicio_real', null);
  if (error) console.error('Cronograma: erro ao registrar início real:', error);
}

// Chamado ao concluir o RDO: pega os itens ligados às atividades daquele dia.
export async function registrarInicioRealDoRDO(rdoId, dataISO) {
  if (!rdoId || !dataISO) return;
  try {
    const { data, error } = await supabase
      .from('atividades_rdo').select('cronograma_item_id')
      .eq('rdo_id', rdoId).not('cronograma_item_id', 'is', null);
    if (error) {
      if (!/does not exist/i.test(error.message)) console.error('Cronograma: erro ao ler vínculos:', error);
      return;
    }
    await iniciarItens((data || []).map(a => a.cronograma_item_id), dataISO);
  } catch (e) {
    console.error('Cronograma: falha ao registrar início real:', e);
  }
}

// Chamado quando uma atividade passa a "em andamento" (ou "feita"): o item do
// cronograma ligado a ela começa na mesma hora, sem esperar o fecho do RDO.
export async function registrarInicioRealDaAtividade(activityId, dataISO) {
  if (!activityId || !dataISO) return;
  try {
    const { data, error } = await supabase
      .from('atividades_rdo').select('cronograma_item_id').eq('id', activityId).maybeSingle();
    if (error) {
      if (!/does not exist/i.test(error.message)) console.error('Cronograma: erro ao ler vínculo:', error);
      return;
    }
    await iniciarItens([data?.cronograma_item_id], dataISO);
  } catch (e) {
    console.error('Cronograma: falha ao registrar início real:', e);
  }
}
