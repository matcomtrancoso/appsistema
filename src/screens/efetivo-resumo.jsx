import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, PageHeader } from '../components/index';
import { hojeLocal, toISODate } from '../lib/date';

const DIAS_FULL  = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];

function getWeekDates(weekOffset = 0) {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1) + weekOffset * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

function weekLabel(dates, offset) {
  if (!dates.length) return '';
  const start = new Date(dates[0] + 'T12:00');
  const end   = new Date(dates[dates.length - 1] + 'T12:00');
  const fmt = d => d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
  const range = `${fmt(start)} – ${fmt(end)}`;
  if (offset === 0)  return `Semana atual · ${range}`;
  if (offset === -1) return `Semana passada · ${range}`;
  return `${Math.abs(offset)} semanas atrás · ${range}`;
}

function fmtDate(str) {
  return new Date(str + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// Math.round para bater com a média do relatório do engenheiro, que usava
// arredondamento normal enquanto esta tela arredondava sempre para cima —
// a mesma semana aparecia com médias diferentes nas duas telas.
function avg(values) {
  const filtered = values.filter(n => n > 0);
  if (!filtered.length) return null;
  return Math.round(filtered.reduce((s, n) => s + n, 0) / filtered.length);
}

async function fetchByDates(dates) {
  const { data: rdos, error } = await supabase
    .from('rdos').select('id, data, efetivo_draft').in('data', dates);
  if (error) console.error('Erro ao carregar o efetivo:', error);
  if (!rdos?.length) return Object.fromEntries(dates.map(d => [d, {}]));

  const rdoIds = rdos.map(r => r.id);
  const rdoById = {}; rdos.forEach(r => { rdoById[r.id] = r; });
  const { data: ef, error: eEf } = await supabase
    .from('efetivo_rdo')
    .select('rdo_id, colaborador_nome, empreiteiro')
    .in('rdo_id', rdoIds);
  if (eEf) console.error('Erro ao carregar o efetivo:', eEf);

  const byDate = {};
  const vistos = {};
  dates.forEach(d => { byDate[d] = {}; vistos[d] = new Set(); });

  // Cada pessoa conta UMA vez por dia. Antes não havia deduplicação: o submit
  // grava uma linha por atividade, então quem trabalhou em duas atividades era
  // contado duas vezes — e esta aba divergia da aba "Período", que deduplicava.
  const incluir = (data, empresa, nome) => {
    if (!byDate[data]) return;
    const chave = (nome || '').trim().toLowerCase();
    if (!chave || vistos[data].has(chave)) return;
    vistos[data].add(chave);
    const emp = empresa || 'ADM Própria';
    (byDate[data][emp] ||= []).push(nome || '');
  };

  (ef || []).forEach(e => {
    const rdo = rdoById[e.rdo_id];
    if (rdo) incluir(rdo.data, e.empreiteiro, e.colaborador_nome);
  });

  // Une o rascunho ao que foi submetido, em vez de usar um OU outro. Num dia em
  // que só parte do efetivo foi submetida, o restante das pessoas sumia daqui.
  rdos.forEach(r => {
    (r.efetivo_draft || []).forEach(w => incluir(r.data, w.empresa_nome, w.nome));
  });

  return byDate;
}

// Detalhado p/ a aba Período: junta submetido + rascunho (sem perder empresas) e traz função/ADM.
// Retorna byDate[data] = [{ nome, grupo, funcao }]
async function fetchPeriodoDetalhado(dates) {
  const ADM = 'ADM (própria)';
  const normFun = (f) => { const s = (f || '').toLowerCase(); if (s.startsWith('ofic')) return 'Oficial'; if (s.startsWith('ajud')) return 'Ajudante'; return 'Outro'; };
  const byDate = {};
  dates.forEach(d => { byDate[d] = []; });
  const { data: rdos } = await supabase.from('rdos').select('id, data, efetivo_draft').in('data', dates);
  if (!rdos?.length) return byDate;
  const rdoIds = rdos.map(r => r.id);
  const rdoById = {}; rdos.forEach(r => { rdoById[r.id] = r; });

  const { data: colabs } = await supabase.from('colaboradores').select('id, nome, funcao');
  const funById = {}, funByNome = {};
  (colabs || []).forEach(c => { funById[c.id] = c.funcao; funByNome[(c.nome || '').toLowerCase()] = c.funcao; });

  // O flag "é ADM naquele dia" (o check no diário) só existe no rascunho.
  // Mapeia por (data, colaborador) para aplicar também aos registros submetidos.
  const admByDayColab = {};  // "data|chave" -> true
  const funByDayColab = {};  // "data|chave" -> funcao do rascunho
  rdos.forEach(r => {
    (r.efetivo_draft || []).forEach(w => {
      const ck = w.colab_id || (w.nome || '').toLowerCase();
      if (w.is_adm) admByDayColab[r.data + '|' + ck] = true;
      if (w.funcao) funByDayColab[r.data + '|' + ck] = w.funcao;
    });
  });

  const { data: ef } = await supabase.from('efetivo_rdo')
    .select('rdo_id, colaborador_nome, colaborador_id, empreiteiro').in('rdo_id', rdoIds).limit(50000);

  const seen = {}; dates.forEach(d => { seen[d] = new Set(); });
  const add = (data, key, nome, grupo, funcao) => {
    if (!byDate[data] || seen[data].has(key)) return;
    seen[data].add(key);
    byDate[data].push({ nome, grupo, funcao });
  };

  (ef || []).forEach(e => {
    const r = rdoById[e.rdo_id]; if (!r) return;
    const nome = e.colaborador_nome || '';
    const ck = e.colaborador_id || nome.toLowerCase();
    const isAdm = admByDayColab[r.data + '|' + ck] || /adm/i.test(e.empreiteiro || '');
    const grupo = isAdm ? ADM : (e.empreiteiro || ADM);
    const funcao = normFun(funByDayColab[r.data + '|' + ck] || funById[e.colaborador_id] || funByNome[nome.toLowerCase()]);
    add(r.data, (nome || '').trim().toLowerCase(), nome, grupo, funcao);
  });

  // Une o rascunho ao submetido (o `add` já deduplica por pessoa). Antes, um dia
  // com QUALQUER linha submetida ignorava o rascunho inteiro: como o submit só
  // gravava quem tinha atividade descrita, um dia com 10 pessoas e 2 com
  // atividade era reportado com 2 — silenciosamente.
  rdos.forEach(r => {
    (r.efetivo_draft || []).forEach(w => {
      const nome = w.nome || '';
      const isAdm = w.is_adm || /adm/i.test(w.empresa_nome || '');
      const grupo = isAdm ? ADM : (w.empresa_nome || ADM);
      add(r.data, (nome || '').trim().toLowerCase(), nome, grupo, normFun(w.funcao || funById[w.colab_id] || funByNome[nome.toLowerCase()]));
    });
  });

  return byDate;
}

// Detalhado para a aba "Por dia": quem esteve no canteiro, de que empresa, em que
// função e — o que faltava — em qual frente de serviço. Antes esta aba só sabia
// somar cabeças por empresa, e "6 da empreiteira A" não dizia nada sobre o dia.
async function fetchDiaDetalhado(dateStr) {
  const ADM = 'ADM (própria)';
  const { data: rdo, error } = await supabase
    .from('rdos').select('id, efetivo_draft').eq('data', dateStr).maybeSingle();
  if (error) console.error('Erro ao buscar o RDO do dia:', error);
  if (!rdo) return null;

  const [{ data: ef }, { data: ats }, { data: colabs }] = await Promise.all([
    supabase.from('efetivo_rdo')
      .select('colaborador_nome, colaborador_id, empreiteiro, atividade_descricao').eq('rdo_id', rdo.id),
    supabase.from('atividades_rdo').select('id, descricao, ambiente').eq('rdo_id', rdo.id),
    supabase.from('colaboradores').select('id, nome, funcao'),
  ]);

  const atById = {};
  (ats || []).forEach(a => { atById[a.id] = a; });
  const funById = {}, funByNome = {};
  (colabs || []).forEach(c => { funById[c.id] = c.funcao; funByNome[(c.nome || '').toLowerCase()] = c.funcao; });

  // O check "é ADM hoje" e a função do dia só existem no rascunho; valem também
  // para as linhas já submetidas da mesma pessoa.
  const admDoDia = {}, funDoDia = {}, frenteDoDia = {};
  (rdo.efetivo_draft || []).forEach(w => {
    const ck = w.colab_id || (w.nome || '').toLowerCase();
    if (w.is_adm) admDoDia[ck] = true;
    if (w.funcao) funDoDia[ck] = w.funcao;
    const at = w.atividade_id ? atById[w.atividade_id] : null;
    const nome = at?.descricao || w.atividade_livre || '';
    if (nome) frenteDoDia[ck] = { frente: nome, ambiente: at?.ambiente || '' };
  });

  const pessoas = [];
  const vistos = new Set();
  const add = (nome, ck, empresaBruta, frente, ambiente, funcao) => {
    const chave = (nome || '').trim().toLowerCase();
    if (!chave || vistos.has(chave)) return;
    vistos.add(chave);
    const isAdm = admDoDia[ck] || /adm/i.test(empresaBruta || '');
    pessoas.push({
      nome,
      empresa: isAdm ? ADM : (empresaBruta || ADM),
      funcao: funcao || 'Não informada',
      frente: frente || '',
      ambiente: ambiente || '',
    });
  };

  (ef || []).forEach(e => {
    const nome = e.colaborador_nome || '';
    const ck = e.colaborador_id || nome.toLowerCase();
    const f = frenteDoDia[ck];
    add(nome, ck, e.empreiteiro,
        e.atividade_descricao || f?.frente, f?.ambiente,
        funDoDia[ck] || funById[e.colaborador_id] || funByNome[nome.toLowerCase()]);
  });

  // Une o rascunho ao submetido: num dia parcialmente enviado, quem ficou só no
  // rascunho continua aparecendo.
  (rdo.efetivo_draft || []).forEach(w => {
    const nome = w.nome || '';
    const ck = w.colab_id || nome.toLowerCase();
    const f = frenteDoDia[ck];
    add(nome, ck, w.empresa_nome, f?.frente, f?.ambiente,
        w.funcao || funById[w.colab_id] || funByNome[nome.toLowerCase()]);
  });

  return pessoas;
}

// Agrupa as pessoas do dia por empresa e, dentro dela, por frente de serviço.
function agruparDia(pessoas) {
  const porEmpresa = {};
  (pessoas || []).forEach(p => {
    const e = (porEmpresa[p.empresa] ||= { empresa: p.empresa, pessoas: [], funcoes: {}, frentes: {} });
    e.pessoas.push(p);
    e.funcoes[p.funcao] = (e.funcoes[p.funcao] || 0) + 1;
    const chave = p.frente || '__sem__';
    (e.frentes[chave] ||= { frente: p.frente, ambiente: p.ambiente, pessoas: [] }).pessoas.push(p);
  });
  return Object.values(porEmpresa)
    .map(e => ({
      ...e,
      n: e.pessoas.length,
      listaFrentes: Object.values(e.frentes).sort((a, b) => b.pessoas.length - a.pessoas.length),
    }))
    .sort((a, b) => b.n - a.n);
}

export function EfetivoResumo({ goto }) {
  const [tab, setTab]           = useState('hoje');
  const [loading, setLoading]   = useState(true);

  const [selectedDate, setSelectedDate] = useState(hojeLocal());
  const todayStr = hojeLocal();

  const [diaPessoas, setDiaPessoas] = useState(null);   // null = ainda não carregou / sem RDO
  const [diaLoading, setDiaLoading] = useState(false);

  const [semanaOffset, setSemanaOffset]       = useState(0);
  const [semanaWeekDates, setSemanaWeekDates] = useState([]);
  const [semanaData, setSemanaData]           = useState({});
  const [semanaLoading, setSemanaLoading]     = useState(false);

  const [periodoStart, setPeriodoStart]     = useState('');
  const [periodoEnd, setPeriodoEnd]         = useState('');
  const [periodoData, setPeriodoData]       = useState(null);
  const [periodoLoading, setPeriodoLoading] = useState(false);
  const [periodoAviso, setPeriodoAviso]     = useState('');

  useEffect(() => {
    let vivo = true;
    setDiaLoading(true);
    fetchDiaDetalhado(selectedDate).then(p => {
      if (!vivo) return;
      setDiaPessoas(p);
      setDiaLoading(false);
      setLoading(false);
    });
    return () => { vivo = false; };
  }, [selectedDate]);


  async function loadSemana(offset) {
    setSemanaLoading(true);
    const dates = getWeekDates(offset);
    setSemanaWeekDates(dates);
    const byDate = await fetchByDates(dates);
    setSemanaData(byDate);
    setSemanaLoading(false);
  }
  useEffect(() => {
    if (tab === 'semana') loadSemana(semanaOffset);
  }, [tab, semanaOffset]);

  // Um período muito longo virava centenas de datas num `.in(...)`, estourando o
  // tamanho da URL do PostgREST: a consulta falhava e a tela dizia "sem dados"
  // para um intervalo que tinha dados. Agora consulta em lotes.
  const MAX_DIAS_PERIODO = 370;

  async function loadPeriodo() {
    if (!periodoStart || !periodoEnd || periodoStart > periodoEnd) return;
    setPeriodoLoading(true);
    setPeriodoAviso('');
    const dates = [];
    const cur = new Date(periodoStart + 'T12:00');
    const end = new Date(periodoEnd + 'T12:00');
    while (cur <= end && dates.length < MAX_DIAS_PERIODO) {
      dates.push(toISODate(cur));
      cur.setDate(cur.getDate() + 1);
    }
    if (cur <= end) {
      setPeriodoAviso(`Período muito longo: mostrando os primeiros ${MAX_DIAS_PERIODO} dias (até ${dates[dates.length - 1].split('-').reverse().join('/')}).`);
    }
    const LOTE = 60;
    const byDate = {};
    for (let i = 0; i < dates.length; i += LOTE) {
      Object.assign(byDate, await fetchPeriodoDetalhado(dates.slice(i, i + LOTE)));
    }
    setPeriodoData(byDate);
    setPeriodoLoading(false);
  }

  // Ocorrências do dia selecionado
  const [dayOcorrencias, setDayOcorrencias] = useState([]);

  useEffect(() => {
    setDayOcorrencias([]);
    if (selectedDate > hojeLocal()) return;
    supabase.from('rdos').select('id').eq('data', selectedDate).maybeSingle().then(({ data: rdo, error }) => {
      if (error) { console.error('Erro ao buscar RDO do dia:', error); return; }
      if (!rdo) return;
      supabase.from('ocorrencias').select('*').eq('rdo_id', rdo.id).order('created_at').then(({ data, error: e2 }) => {
        if (e2) { console.error('Erro ao carregar ocorrências:', e2); return; }
        setDayOcorrencias(data || []);
      });
    });
  }, [selectedDate]);

  function navigateDay(delta) {
    const d = new Date(selectedDate + 'T12:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(toISODate(d));
  }

  const dayRows       = agruparDia(diaPessoas);
  const dayTotal      = (diaPessoas || []).length;
  const dayOficiais   = (diaPessoas || []).filter(p => /ofic/i.test(p.funcao)).length;
  const dayAjudantes  = (diaPessoas || []).filter(p => /ajud/i.test(p.funcao)).length;
  const dayAdm        = (diaPessoas || []).filter(p => p.empresa === 'ADM (própria)').length;
  const dayFrentes    = new Set((diaPessoas || []).filter(p => p.frente).map(p => p.frente)).size;
  const daySemFrente  = (diaPessoas || []).filter(p => !p.frente).length;

  const semTodayIdx  = semanaWeekDates.indexOf(todayStr);
  const semEmpresas  = [...new Set(Object.values(semanaData).flatMap(d => Object.keys(d)))].sort();
  const semDayTotals = semanaWeekDates.map(d =>
    Object.values(semanaData[d] || {}).reduce((s, arr) => s + arr.length, 0)
  );

  const periodoDates        = periodoData ? Object.keys(periodoData).sort() : [];
  const periodoAll          = periodoDates.flatMap(d => periodoData[d] || []);
  const periodoTotaisPorDia = periodoDates.map(d => (periodoData?.[d] || []).length);
  const periodoGrandTotal   = periodoAll.length;
  const periodoDiasComDados = periodoTotaisPorDia.filter(n => n > 0).length;
  const periodoMediaTotal   = periodoDiasComDados > 0 ? Math.ceil(periodoGrandTotal / periodoDiasComDados) : 0;
  const periodoOficiais     = periodoAll.filter(w => w.funcao === 'Oficial').length;
  const periodoAjudantes    = periodoAll.filter(w => w.funcao === 'Ajudante').length;

  const periodoGrupos = {};
  periodoDates.forEach(d => (periodoData?.[d] || []).forEach(w => {
    const g = (periodoGrupos[w.grupo] = periodoGrupos[w.grupo] || { total: 0, oficiais: 0, ajudantes: 0, outros: 0, dias: new Set() });
    g.total++;
    if (w.funcao === 'Oficial') g.oficiais++; else if (w.funcao === 'Ajudante') g.ajudantes++; else g.outros++;
    g.dias.add(d);
  }));
  const periodoEmpresas = Object.keys(periodoGrupos).sort((a, b) => periodoGrupos[b].total - periodoGrupos[a].total);
  const periodoAdmTotal = periodoGrupos['ADM (própria)']?.total || 0;

  const fmtBR = (s) => new Date(s + 'T12:00').toLocaleDateString('pt-BR');

  function abrirPDF(titulo, sub, body) {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}body{padding:24px;color:#1B1B1B;font-size:10pt;line-height:1.4;max-width:900px;margin:0 auto}@media print{body{padding:0}}table{width:100%;border-collapse:collapse;margin-top:6px}th,td{border:1px solid #ddd;padding:6px 8px;font-size:9pt}th{background:#0F6E56;color:#fff;text-align:left;font-size:8pt;text-transform:uppercase;letter-spacing:.04em}.c{text-align:center}.b{font-weight:700}h2{font-size:12pt;margin:18px 0 2px;color:#0F6E56}.kpis{display:flex;gap:8px;margin-top:10px}.kpi{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px;text-align:center}.kpi b{font-size:15pt;display:block;color:#0F6E56}.kpi span{font-size:7.5pt;color:#666}</style>
</head><body>
<div style="border-bottom:2px solid #0F6E56;padding-bottom:10px">
  <div style="font-size:18px;font-weight:900;color:#0F6E56">Efetivo no canteiro</div>
  <div style="font-size:11px;font-weight:700">${sub}</div>
  <div style="font-size:9px;color:#888">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
</div>
${body}
</body></html>`;
    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups para exportar o PDF.'); return; }
    win.document.write(html);
    win.document.close();
    // imprime quando a janela terminar de carregar, com fallback e guarda anti-duplo-print
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); };
    win.onload = doPrint;
    setTimeout(doPrint, 900);
  }

  function exportarPDF() {
    if (tab === 'periodo') {
      if (!periodoData || periodoEmpresas.length === 0) { alert('Busque um período com dados primeiro.'); return; }
      const linhasEmp = periodoEmpresas.map(emp => {
        const g = periodoGrupos[emp];
        const m = g.dias.size > 0 ? Math.ceil(g.total / g.dias.size) : 0;
        return `<tr><td>${emp}</td><td class="c">${g.oficiais}</td><td class="c">${g.ajudantes}</td><td class="c">${g.outros}</td><td class="c b">${g.total}</td><td class="c">${g.dias.size}</td><td class="c">${m}</td></tr>`;
      }).join('');
      const linhasDia = periodoDates.map(d => `<tr><td>${fmtBR(d)}</td><td class="c b">${(periodoData[d] || []).length}</td></tr>`).join('');
      const body = `<div class="kpis"><div class="kpi"><b>${periodoGrandTotal}</b><span>TRABALHADOR-DIAS</span></div><div class="kpi"><b>${periodoMediaTotal}</b><span>MÉDIA/DIA</span></div><div class="kpi"><b>${periodoOficiais}</b><span>OFICIAIS</span></div><div class="kpi"><b>${periodoAjudantes}</b><span>AJUDANTES</span></div><div class="kpi"><b>${periodoAdmTotal}</b><span>ADM</span></div></div>
<h2>Por empresa</h2><table><thead><tr><th>Empresa / grupo</th><th>Oficiais</th><th>Ajudantes</th><th>Outros</th><th>Total</th><th>Dias</th><th>Média/dia</th></tr></thead><tbody>${linhasEmp}</tbody></table>
<h2>Por dia</h2><table><thead><tr><th>Data</th><th>Pessoas</th></tr></thead><tbody>${linhasDia}</tbody></table>`;
      abrirPDF('Efetivo — Período', `Período: ${fmtBR(periodoStart)} a ${fmtBR(periodoEnd)} · ${periodoDiasComDados} dias com registro`, body);
    } else if (tab === 'hoje') {
      if (!dayRows.length) { alert('Sem efetivo neste dia.'); return; }
      const linhas = dayRows.flatMap(r => r.listaFrentes.map((f, i) => {
        const nomes = f.pessoas.map(p => `${p.nome}${/ajud/i.test(p.funcao) ? ' (aj.)' : ''}`).join(', ');
        const empCel = i === 0
          ? `<td rowspan="${r.listaFrentes.length}" class="b">${r.empresa}<br><span style="font-weight:400;font-size:8pt;color:#666">${r.n} pessoa${r.n !== 1 ? 's' : ''}</span></td>`
          : '';
        return `<tr>${empCel}<td>${f.frente || 'Sem frente definida'}${f.ambiente ? ` <span style="color:#888">· ${f.ambiente}</span>` : ''}</td><td class="c b">${f.pessoas.length}</td><td>${nomes}</td></tr>`;
      })).join('');
      const body = `<div class="kpis"><div class="kpi"><b>${dayTotal}</b><span>PESSOAS</span></div><div class="kpi"><b>${dayOficiais}</b><span>OFICIAIS</span></div><div class="kpi"><b>${dayAjudantes}</b><span>AJUDANTES</span></div><div class="kpi"><b>${dayFrentes}</b><span>FRENTES</span></div><div class="kpi"><b>${dayRows.length}</b><span>EMPRESAS</span></div></div>
<h2>Por empresa e frente de serviço</h2><table><thead><tr><th>Empresa</th><th>Frente de serviço</th><th>Pessoas</th><th>Quem</th></tr></thead><tbody>${linhas}</tbody></table>`;
      abrirPDF('Efetivo — Dia', `Dia ${fmtBR(selectedDate)}`, body);
    } else {
      const dias = semanaWeekDates;
      if (!semEmpresas.length) { alert('Sem efetivo nesta semana.'); return; }
      const head = `<th>Empresa</th>${dias.map(d => `<th class="c">${new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short' })}</th>`).join('')}<th class="c">Total</th>`;
      const linhas = semEmpresas.map(emp => {
        const cels = dias.map(d => (semanaData[d]?.[emp] || []).length);
        const tot = cels.reduce((a, b) => a + b, 0);
        return `<tr><td>${emp}</td>${cels.map(n => `<td class="c">${n || '—'}</td>`).join('')}<td class="c b">${tot}</td></tr>`;
      }).join('');
      const totaisRow = `<tr><td class="b">Total/dia</td>${semDayTotals.map(n => `<td class="c b">${n || '—'}</td>`).join('')}<td class="c b">${semDayTotals.reduce((a, b) => a + b, 0)}</td></tr>`;
      const body = `<h2>Por empresa e dia</h2><table><thead><tr>${head}</tr></thead><tbody>${linhas}${totaisRow}</tbody></table>`;
      abrirPDF('Efetivo — Semana', `Semana ${dias[0] ? fmtBR(dias[0]) : ''} a ${dias[dias.length - 1] ? fmtBR(dias[dias.length - 1]) : ''}`, body);
    }
  }

  const isToday   = selectedDate === todayStr;
  const isFuture  = selectedDate > todayStr;
  const dateLabel = isToday ? 'Hoje' : fmtDate(selectedDate);

  return (
    <div className="page">
      <PageHeader eyebrow="EFETIVO" title="Canteiro de obras"
        right={
          <div style={{ display: 'inline-flex', gap: 6 }}>
            {goto && (
              <button onClick={() => goto('rdo-historico')} className="btn btn-secondary btn-sm"
                title="Ver e editar RDOs antigos — inclusive registrar ocorrência retroativa"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 15, height: 15 }}>{Icon.calendar}</span> Histórico de RDOs
              </button>
            )}
            <button onClick={exportarPDF} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 15, height: 15 }}>{Icon.pdf || Icon.download}</span> PDF
            </button>
          </div>
        } />

      {/* Mesma faixa de pílulas do resto do app — o seletor em bloco cinza era
          a única peça com outra linguagem e ainda comia uma faixa inteira. */}
      <div style={{ padding: '0 var(--pad-4) 10px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[{ k: 'hoje', l: 'Por dia' }, { k: 'semana', l: 'Semana' }, { k: 'periodo', l: 'Período' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            height: 30, padding: '0 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12, fontWeight: 700,
            border: tab === t.k ? 'none' : '1px solid var(--border)',
            background: tab === t.k ? 'var(--primary)' : 'var(--surface)',
            color: tab === t.k ? '#fff' : 'var(--text-2)',
          }}>{t.l}</button>
        ))}
      </div>

      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Carregando…
        </div>
      )}

      {!loading && tab === 'hoje' && (
        <div className="page-pad stack stack-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => navigateDay(-1)} style={{
              width: 36, height: 36, borderRadius: 999, border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.back}</span>
            </button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: isToday ? 'var(--primary)' : 'var(--text)' }}>
                {dateLabel}
              </div>
              {!isToday && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 1 }}>
                  {new Date(selectedDate + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              )}
            </div>
            <button onClick={() => navigateDay(1)} disabled={isFuture} style={{
              width: 36, height: 36, borderRadius: 999, border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: isFuture ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              opacity: isFuture ? 0.3 : 1,
            }}>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
            </button>
            {!isToday && (
              <button onClick={() => setSelectedDate(todayStr)} style={{
                padding: '0 12px', height: 36, borderRadius: 999,
                border: '1px solid var(--primary)', background: 'var(--primary-tint)',
                color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}>Hoje</button>
            )}
          </div>

          {!diaLoading && dayTotal > 0 && (
            <div className="card" style={{ padding: '16px 14px', background: 'var(--primary-tint)', border: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 46, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{dayTotal}</div>
                <div className="t-caption" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                  {dayTotal === 1 ? 'colaborador no canteiro' : 'colaboradores no canteiro'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { n: dayOficiais,   l: 'OFICIAIS' },
                  { n: dayAjudantes,  l: 'AJUDANTES' },
                  { n: dayAdm,        l: 'ADM' },
                  { n: dayFrentes,    l: dayFrentes === 1 ? 'FRENTE' : 'FRENTES' },
                  { n: dayRows.length, l: dayRows.length === 1 ? 'EMPRESA' : 'EMPRESAS' },
                ].map(k => (
                  <div key={k.l} style={{ flex: 1, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: '8px 2px', textAlign: 'center' }}>
                    <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--primary)' }}>{k.n}</div>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--primary)', opacity: 0.8, letterSpacing: 0.2 }}>{k.l}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diaLoading && (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>
          )}

          {!diaLoading && dayRows.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 28 }}>
              <div style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', color: 'var(--text-3)' }}>
                <span style={{ width: 22, height: 22 }}>{Icon.users}</span>
              </div>
              <div className="t-strong">{isFuture ? 'Dia futuro' : 'Nenhum efetivo registrado'}</div>
              <div className="t-caption" style={{ marginTop: 4 }}>
                {isFuture ? 'Selecione uma data passada.' : 'O mestre não enviou o diário neste dia.'}
              </div>
            </div>
          )}

          {/* Ocorrências do dia */}
          {!diaLoading && dayOcorrencias.length > 0 && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>⚠️</span>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger,#DC2626)' }}>
                  {dayOcorrencias.length} Ocorrência{dayOcorrencias.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dayOcorrencias.map(oc => (
                  <div key={oc.id} className="card" style={{
                    padding: '12px 14px',
                    borderLeft: '4px solid var(--danger,#DC2626)',
                    background: 'var(--danger-tint,#FEE2E2)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{oc.categoria}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(oc.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    {oc.descricao && oc.descricao !== oc.categoria && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.4 }}>{oc.descricao}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!diaLoading && dayRows.map(e => {
            const oficiais  = e.funcoes['Oficial'] || 0;
            const ajudantes = e.funcoes['Ajudante'] || 0;
            const semFuncao = e.n - oficiais - ajudantes;
            return (
              <div key={e.empresa} className="card" style={{ padding: '12px 14px' }}>
                <div className="row-between" style={{ marginBottom: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="t-strong" style={{ fontSize: 15 }}>{e.empresa}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                      {oficiais > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--info-tint, #E3EEFB)', color: 'var(--info, #1E6FCF)' }}>
                          {oficiais} {oficiais === 1 ? 'oficial' : 'oficiais'}
                        </span>
                      )}
                      {ajudantes > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--warn-tint)', color: 'var(--warn)' }}>
                          {ajudantes} {ajudantes === 1 ? 'ajudante' : 'ajudantes'}
                        </span>
                      )}
                      {semFuncao > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                          {semFuncao} sem função
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    minWidth: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: 'var(--primary)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 800,
                  }}>{e.n}</div>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{
                    height: '100%', borderRadius: 999, background: 'var(--primary)',
                    width: dayTotal > 0 ? `${(e.n / dayTotal) * 100}%` : '0%',
                    transition: 'width 0.4s ease',
                  }} />
                </div>

                {/* Quem fez o quê. É a informação que fazia falta: o número por
                    empresa não dizia em que frente as pessoas estavam. */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {e.listaFrentes.map((f, i) => (
                    <div key={i} style={{
                      borderLeft: `3px solid ${f.frente ? 'var(--primary)' : 'var(--border)'}`,
                      paddingLeft: 9,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: f.frente ? 'var(--text-1)' : 'var(--text-3)' }}>
                          {f.frente || 'Sem frente definida'}
                        </span>
                        {f.ambiente && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>· {f.ambiente}</span>
                        )}
                        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>
                          {f.pessoas.length}
                        </span>
                      </div>
                      <div className="t-caption" style={{ lineHeight: 1.55, fontSize: 11.5, marginTop: 1 }}>
                        {f.pessoas.map(p => p.nome + (/ajud/i.test(p.funcao) ? ' (aj.)' : '')).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {!diaLoading && dayTotal > 0 && daySemFrente > 0 && (
            <div className="card" style={{ padding: '10px 13px', background: 'var(--warn-tint)', color: 'var(--warn)', fontSize: 12, fontWeight: 700 }}>
              {daySemFrente} {daySemFrente === 1 ? 'pessoa está' : 'pessoas estão'} sem frente de serviço neste dia.
            </div>
          )}

          {!diaLoading && dayTotal > 0 && goto && (
            <button onClick={() => goto('rdo-historico', { data: selectedDate })}
              className="btn btn-secondary" style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}>
              <span style={{ width: 15, height: 15 }}>{Icon.calendar}</span>
              Abrir o RDO deste dia
            </button>
          )}
        </div>
      )}

      {tab === 'semana' && (
        <div className="page-pad">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <button onClick={() => setSemanaOffset(o => o - 1)} style={{
              width: 36, height: 36, borderRadius: 999, border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.back}</span>
            </button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: semanaOffset === 0 ? 'var(--primary)' : 'var(--text)', lineHeight: 1.3 }}>
                {weekLabel(semanaWeekDates, semanaOffset)}
              </div>
            </div>
            <button onClick={() => setSemanaOffset(o => o + 1)} disabled={semanaOffset >= 0} style={{
              width: 36, height: 36, borderRadius: 999, border: '1px solid var(--border)',
              background: 'var(--surface)', cursor: semanaOffset >= 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              opacity: semanaOffset >= 0 ? 0.3 : 1,
            }}>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
            </button>
            {semanaOffset < 0 && (
              <button onClick={() => setSemanaOffset(0)} style={{
                padding: '0 12px', height: 36, borderRadius: 999,
                border: '1px solid var(--primary)', background: 'var(--primary-tint)',
                color: 'var(--primary)', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
              }}>Atual</button>
            )}
          </div>

          {semanaLoading && (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>
          )}

          {!semanaLoading && semEmpresas.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: 28 }}>
              <div className="t-strong">Sem dados esta semana</div>
              <div className="t-caption" style={{ marginTop: 4 }}>Os diários ainda não foram enviados.</div>
            </div>
          )}

          {!semanaLoading && semEmpresas.length > 0 && (
            <>
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, paddingLeft: 4 }}>
                {semanaWeekDates.map((d, i) => (
                  <div key={d} style={{ flex: 1, textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 0.4,
                    color: i === semTodayIdx ? 'var(--primary)' : 'var(--text-3)',
                    padding: '4px 0',
                    background: i === semTodayIdx ? 'var(--primary-tint)' : 'transparent',
                    borderRadius: 6,
                  }}>
                    {DIAS_FULL[i]}<br />
                    <span style={{ fontSize: 9, fontWeight: 600, opacity: 0.7 }}>
                      {new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'numeric' })}
                    </span>
                  </div>
                ))}
                <div style={{ width: 46, textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: 'var(--success)', padding: '4px 0' }}>
                  Med.
                </div>
              </div>

              <div className="stack stack-2">
                <div className="card" style={{ padding: '10px 12px', background: 'var(--primary-tint)', border: '1.5px solid var(--primary)', marginBottom: 4 }}>
                  <div className="t-strong" style={{ fontSize: 12, marginBottom: 8, letterSpacing: 0.3, color: 'var(--primary)' }}>
                    TOTAL DA OBRA
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {semDayTotals.map((n, i) => (
                      <div key={i} style={{
                        flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 8,
                        background: i === semTodayIdx
                          ? (n > 0 ? 'var(--primary)' : 'rgba(14,108,184,0.2)')
                          : (n > 0 ? 'rgba(14,108,184,0.15)' : 'transparent'),
                        color: i === semTodayIdx
                          ? (n > 0 ? '#fff' : 'var(--primary)')
                          : (n > 0 ? 'var(--primary)' : 'var(--text-3)'),
                        fontSize: 15, fontWeight: n > 0 ? 800 : 400,
                      }}>
                        {n > 0 ? n : '-'}
                      </div>
                    ))}
                    <div style={{ width: 46, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--success)' }}>
                      {avg(semDayTotals) ?? '-'}
                    </div>
                  </div>
                </div>

                {semEmpresas.map(emp => {
                  const values = semanaWeekDates.map(d => (semanaData[d]?.[emp] || []).length);
                  const media  = avg(values);
                  return (
                    <div key={emp} className="card" style={{ padding: '10px 12px' }}>
                      <div className="t-strong" style={{ fontSize: 12, marginBottom: 8, color: 'var(--text-2)', letterSpacing: 0.3 }}>
                        {emp.toUpperCase()}
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        {values.map((n, i) => (
                          <div key={i} style={{
                            flex: 1, textAlign: 'center', padding: '7px 4px', borderRadius: 8,
                            background: i === semTodayIdx
                              ? (n > 0 ? 'var(--primary)' : 'var(--primary-tint)')
                              : (n > 0 ? 'var(--surface-2)' : 'transparent'),
                            color: i === semTodayIdx
                              ? (n > 0 ? '#fff' : 'var(--primary)')
                              : (n > 0 ? 'var(--text)' : 'var(--text-3)'),
                            fontSize: 15, fontWeight: n > 0 ? 800 : 400,
                          }}>
                            {n > 0 ? n : '-'}
                          </div>
                        ))}
                        <div style={{ width: 46, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--success)' }}>
                          {media ?? '-'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'periodo' && (
        <div className="page-pad stack stack-3">
          <div className="card" style={{ padding: '16px 14px' }}>
            <div className="t-strong" style={{ fontSize: 13, marginBottom: 12 }}>Selecione o intervalo</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <div className="t-micro" style={{ marginBottom: 4 }}>DE</div>
                <input type="date" className="input" value={periodoStart} max={todayStr}
                  onChange={e => setPeriodoStart(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div className="t-micro" style={{ marginBottom: 4 }}>ATÉ</div>
                <input type="date" className="input" value={periodoEnd} min={periodoStart} max={todayStr}
                  onChange={e => setPeriodoEnd(e.target.value)} />
              </div>
            </div>
            <button onClick={loadPeriodo}
              disabled={!periodoStart || !periodoEnd || periodoStart > periodoEnd || periodoLoading}
              className="btn btn-primary"
              style={{ width: '100%', height: 42, fontSize: 14, fontWeight: 700 }}>
              {periodoLoading ? 'Carregando…' : 'Buscar'}
            </button>
          </div>

          {periodoAviso && !periodoLoading && (
            <div className="card" style={{ padding: '10px 14px', marginBottom: 10, background: 'var(--warn-tint)', color: 'var(--warn,#CA8A04)', fontSize: 12.5, fontWeight: 700 }}>
              ⚠️ {periodoAviso}
            </div>
          )}

          {periodoData !== null && !periodoLoading && (
            <>
              {periodoEmpresas.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: 28 }}>
                  <div className="t-strong">Sem dados neste período</div>
                  <div className="t-caption" style={{ marginTop: 4 }}>Nenhum diário enviado neste intervalo.</div>
                </div>
              ) : (
                <>
                  <button onClick={exportarPDF} className="btn btn-secondary" style={{ width: '100%' }}>
                    <span style={{ width: 16, height: 16 }}>{Icon.pdf || Icon.download}</span> Exportar PDF
                  </button>

                  <div className="card" style={{ padding: '16px 14px', background: 'var(--primary-tint)', border: '1.5px solid var(--primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div className="t-strong" style={{ color: 'var(--primary)', fontSize: 13 }}>TOTAL DO PERÍODO</div>
                        <div style={{ fontSize: 11, color: 'var(--primary)', opacity: 0.7, marginTop: 2, fontWeight: 600 }}>
                          {periodoDiasComDados} dias com registro
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{periodoGrandTotal}</div>
                        <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, marginTop: 2 }}>trabalhador-dias</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{periodoMediaTotal}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)', opacity: 0.8 }}>MÉDIA/DIA</div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{periodoOficiais}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)', opacity: 0.8 }}>OFICIAIS</div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{periodoAjudantes}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)', opacity: 0.8 }}>AJUDANTES</div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: '8px 4px', textAlign: 'center' }}>
                        <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{periodoAdmTotal}</div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--primary)', opacity: 0.8 }}>ADM</div>
                      </div>
                    </div>
                  </div>

                  {/* Calendário: quantos por dia */}
                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div className="t-micro" style={{ marginBottom: 10 }}>POR DIA</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(52px, 1fr))', gap: 6 }}>
                      {periodoDates.map(d => {
                        const n = (periodoData[d] || []).length;
                        const dt = new Date(d + 'T12:00');
                        return (
                          <div key={d} style={{ textAlign: 'center', borderRadius: 10, padding: '6px 2px', background: n > 0 ? 'var(--primary-tint)' : 'var(--surface-2)' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', textTransform: 'capitalize' }}>{dt.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                            <div style={{ fontSize: 16, fontWeight: 900, lineHeight: 1.1, color: n > 0 ? 'var(--primary)' : 'var(--text-3)' }}>{n || '—'}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600 }}>{dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {periodoEmpresas.map(emp => {
                    const g = periodoGrupos[emp];
                    const media = g.dias.size > 0 ? Math.ceil(g.total / g.dias.size) : 0;
                    return (
                      <div key={emp} className="card" style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div className="t-strong" style={{ fontSize: 14 }}>{emp}</div>
                          <div style={{
                            minWidth: 38, height: 38, borderRadius: 12,
                            background: 'var(--primary)', color: '#fff',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, fontWeight: 800,
                          }}>{g.total}</div>
                        </div>
                        <div style={{ height: 5, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden', marginBottom: 10 }}>
                          <div style={{
                            height: '100%', borderRadius: 999, background: 'var(--primary)',
                            width: periodoGrandTotal > 0 ? `${(g.total / periodoGrandTotal) * 100}%` : '0%',
                          }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--info-tint, #E3EEFB)', color: 'var(--info, #1E6FCF)' }}>{g.oficiais} oficiais</span>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--warn-tint)', color: 'var(--warn)' }}>{g.ajudantes} ajudantes</span>
                          {g.outros > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-3)' }}>{g.outros} outros</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                          <span>Dias: <strong style={{ color: 'var(--text-1)' }}>{g.dias.size}</strong></span>
                          <span>·</span>
                          <span>Média: <strong style={{ color: 'var(--success)' }}>{media}/dia</strong></span>
                          <span>·</span>
                          <span>Total: <strong style={{ color: 'var(--text-1)' }}>{g.total}</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
