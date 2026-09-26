import { MARCA } from '../marca.js';
import { useState, useEffect, useId, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, Avatar, PageHeader, StatusPickerChip, ReplanejaDiasChip, Sheet, BotaoDitar } from '../components/index';
import { juntarDitado } from '../lib/texto-ditado';
import { salvarStatusAtividade } from '../lib/atividades';
import { MOTIVOS_NAO_EXEC } from '../data/index';
import { parsePlanilhaSemanal, paraPlanilhaSemanal, normalizar } from '../lib/planilha-semanal';
import { FechamentoSemanaPopup } from './fechamento-semana';
import { statusDaSemana, C, I, N } from '../lib/fechamento-semana';
import { useObra } from '../lib/ObraContext';
import { getDerivedStatus } from './mestre-rdo-v2';
import { hojeLocal, toISODate, parseISODate, diasRestantes } from '../lib/date';
import { semanaDe, atividadesDoDia, mesclarStatusDerivado, DIA_KEY, DIA_ORDEM, DIA_CURTO, chaveDoDia } from '../lib/atividades-do-dia';
import { sugestoesDaSemana } from '../lib/sugestoes-semana';
import { ocorrenciaDeNaoExecucao } from '../lib/ocorrencias';
import { ordemDeFornecedores, ordenarPorFornecedor, abrirPdfPlanejamento, compartilharQuadroSemanal, rotuloColuna } from '../lib/planejamento-pdf';
import { SeletorCronograma, listarItensVinculaveis, sugerirItem } from './cronograma';
import { OcorrenciasPopup } from './ocorrencias-planejamento';
import { RealocarSemanaPopup } from './realocar-semana';
import { PlanejamentoHojeCard, CronogramaResumoCard, ProjetosVencendoCard } from './home-cards';
import { avisarErro } from '../lib/msg-amigavel';

const DIAS_LIST = DIA_ORDEM;
const DIAS_LABELS_MAP = DIA_CURTO;
const PAV_ORDEM = ['Térreo', '1º Pavimento', 'Subsolo', 'Obra'];

// ── Pavimento → ambiente ──────────────────────────────────────────────────
// Escolher o pavimento primeiro encurta a lista de ambientes, que sozinha fica
// longa demais para achar qualquer coisa. Usado no planejador da semana e no
// cadastro/edição de atividade (inclusive retroativo).
function SeletorAmbiente({ ambientes, valor, onChange, estilo, compacto }) {
  const pavDe = (nome) => ambientes.find(a => a.nome === nome)?.pavimento || '';
  const [pav, setPav] = useState(() => pavDe(valor));

  const pavimentos = [
    ...PAV_ORDEM.filter(p => ambientes.some(a => (a.pavimento || '') === p)),
    ...(ambientes.some(a => !a.pavimento || !PAV_ORDEM.includes(a.pavimento)) ? ['Outros'] : []),
  ];

  const doPav = pav === 'Outros'
    ? ambientes.filter(a => !a.pavimento || !PAV_ORDEM.includes(a.pavimento))
    : pav ? ambientes.filter(a => (a.pavimento || '') === pav)
    : ambientes;

  function mudarPav(novo) {
    setPav(novo);
    // se o ambiente escolhido não pertence ao novo pavimento, limpa
    if (valor && novo && pavDe(valor) !== novo) onChange('');
  }

  return (
    <>
      <select value={pav} onChange={e => mudarPav(e.target.value)} style={estilo}>
        <option value="">{compacto ? 'Pavimento…' : 'Todos os pavimentos'}</option>
        {pavimentos.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={valor || ''} onChange={e => onChange(e.target.value)} style={estilo}>
        <option value="">Sem ambiente específico</option>
        {[...doPav].sort((a, b) => a.nome.localeCompare(b.nome))
          .map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)}
      </select>
    </>
  );
}
const PAV_COL   = { 'Térreo': '#0EA5E9', '1º Pavimento': '#7C5CFF', 'Subsolo': '#64748B', 'Obra': '#F59E0B' };

// ── Constantes da Obra ────────────────────────────────────────────────────
const OBRA_NOME   = MARCA.obra;
const OBRA_INICIO = MARCA.inicioObra ? new Date(MARCA.inicioObra + 'T12:00:00') : null;
// Sem a data da obra em marca.js, devolve null e o "SEMANA N" some da tela:
// número contado a partir de outra obra é pior do que número nenhum.
function getObraWeek() {
  if (!OBRA_INICIO) return null;
  return Math.max(1, Math.ceil((Date.now() - OBRA_INICIO.getTime()) / (7 * 86400000)));
}

// Helper: extrai primeiro nome do login (email ou nome real)
function loginFirstName(profile) {
  const raw = profile?.nome || profile?.email || '';
  const base = raw.includes('@') ? raw.split('@')[0] : raw.split(' ')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

// Helper: id único estável para keys de listas
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : Math.random().toString(36).slice(2) + Date.now().toString(36);


// ── E01: Início ────────────────────────────────────────────────────────────
// Status de pedidos / contratações (rótulo + cor) para os mini-gráficos da home

// Mini gráfico de rosca (donut) sem dependências externas
function MiniDonut({ data = [], size = 60, stroke = 11 }) {
  const gid = useId();
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#22C55E" />
          <stop offset="100%" stopColor="#0EA5E9" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
      {total > 0 && data.filter(d => d.value > 0).map((d, i) => {
        const dash = (d.value / total) * c;
        const el = (
          <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color === 'grad' ? `url(#${gid})` : d.color} strokeWidth={stroke}
            strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-acc}
            strokeLinecap={data.filter(x => x.value > 0).length > 1 ? 'butt' : 'round'}
            transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        );
        acc += dash;
        return el;
      })}
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fill="var(--text)" style={{ fontSize: size * 0.3, fontWeight: 900 }}>{total}</text>
    </svg>
  );
}

// Os dois blocos abaixo moram dentro do card de efetivo — na home do desktop
// tudo cabe numa tela, então efetivo é uma caixa só que rola por dentro.
const SEPARADOR = { marginTop: 12, paddingTop: 12, borderTop: '0.5px solid var(--border)' };

function EfetivoCanteiro({ efetivoLive, empresas, hoje }) {
  const byEmp = {};
  efetivoLive.forEach(w => {
    const key = w.empresa_nome || (w.is_adm ? 'ADM' : '__');
    if (!byEmp[key]) byEmp[key] = { nome: w.empresa_nome || 'ADM', id: w.empresa_id, workers: [] };
    byEmp[key].workers.push(w);
  });
  const empColor = (id) => empresas.find(e => e.id === id)?.cor || '#888';
  return (
    <div style={SEPARADOR}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="t-micro">NO CANTEIRO — {efetivoLive.length} PESSOAS</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>{hoje.toLowerCase()}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.values(byEmp).map(({ nome, id, workers }) => {
          const cor = empColor(id);
          return (
            <div key={nome}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 800, color: cor, letterSpacing: '0.05em' }}>{nome.toUpperCase()}</span>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{workers.length}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 14 }}>
                {workers.map((w, i) => (
                  <span key={i} style={{ fontSize: 12, color: 'var(--text-2)', background: 'var(--surface-2)', padding: '3px 8px', borderRadius: 6, fontWeight: 600 }}>
                    {w.nome?.split(' ')[0] || w.nome}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EfetivoSemana({ weekEfetivoDash, empresas }) {
  const DAY_LABELS = ['Seg','Ter','Qua','Qui','Sex'];
  const empColor = (id) => empresas.find(e => e.id === id)?.cor || '#888';
  const firstEntry = weekEfetivoDash[0];
  const dayTotals = firstEntry ? firstEntry.weekDays.map((_, i) =>
    weekEfetivoDash.reduce((sum, { dayCounts }) => sum + (dayCounts[i] || 0), 0)
  ) : [];
  const todayStr = hojeLocal();
  return (
    <div style={SEPARADOR}>
      <div className="t-micro" style={{ marginBottom: 10 }}>RESUMO SEMANAL POR EMPRESA</div>

      {/* Totais por dia (soma de todas as empresas) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, marginBottom: 14, paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
        {dayTotals.map((tot, i) => {
          const isToday = firstEntry?.weekDays[i] === todayStr;
          const hasData = tot > 0;
          return (
            <div key={i} style={{
              textAlign: 'center', borderRadius: 8, padding: '6px 2px',
              background: isToday ? 'var(--primary)' : hasData ? 'var(--primary-tint)' : 'var(--surface-2)',
            }}>
              <div style={{ fontSize: 17, fontWeight: 900, lineHeight: 1, color: isToday ? '#fff' : hasData ? 'var(--primary)' : 'var(--text-3)' }}>
                {tot || '—'}
              </div>
              <div style={{ fontSize: 9, marginTop: 2, fontWeight: isToday ? 800 : 600, color: isToday ? 'rgba(255,255,255,0.85)' : hasData ? 'var(--primary)' : 'var(--text-3)' }}>
                {DAY_LABELS[i]}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {weekEfetivoDash.map(({ nome, empresa_id, weekDays, dayCounts, avg }) => {
          const cor = empColor(empresa_id);
          return (
            <div key={nome}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, fontWeight: 800, color: cor, letterSpacing: '0.04em' }}>{nome.toUpperCase()}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>média {avg}/dia</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
                {dayCounts.map((cnt, i) => {
                  const isToday = weekDays[i] === todayStr;
                  return (
                    <div key={i} style={{
                      textAlign: 'center', borderRadius: 7, padding: '4px 2px',
                      background: cnt > 0 ? cor + '18' : 'var(--surface-2)',
                      border: isToday ? '1.5px solid ' + cor : '1.5px solid transparent',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: cnt > 0 ? cor : 'var(--text-3)', lineHeight: 1 }}>
                        {cnt || '—'}
                      </div>
                      <div style={{ fontSize: 9, color: isToday ? cor : 'var(--text-3)', marginTop: 2, fontWeight: isToday ? 800 : 500 }}>
                        {DAY_LABELS[i]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EngHome({ goto, dailyState, onStartRDO, openUserMenu }) {
  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 900;
  const { profile, empresas } = useObra();
  const submitted = dailyState.submitted;
  const nomeDisplay = loginFirstName(profile);
  const ini = nomeDisplay.charAt(0).toUpperCase();
  const obraWeek = getObraWeek();
  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

  const [eqAlertaCount, setEqAlertaCount] = useState(0);
  const [rdoSummary, setRdoSummary] = useState(null);
  const [efetivoLive, setEfetivoLive] = useState([]);
  const [todayRdoIdEng, setTodayRdoIdEng] = useState(null);
  const [pendDash, setPendDash] = useState({ aberta: 0, em_andamento: 0, atrasada: 0, resolvida: 0 });
  const [eqDash, setEqDash] = useState([]);
  const [weekEfetivoDash, setWeekEfetivoDash] = useState([]); // [{ empresa_nome, cor, days: {ds: count}, avg }]
  const [efetivoMedia, setEfetivoMedia] = useState({ atual: null, passada: null });
  const [contratacoesDash, setContratacoesDash] = useState(null);

  useEffect(() => {
    // Equipamentos: todos exceto devolvidos
    supabase.from('equipamentos').select('nome, tipo_locacao, status, data_fim_previsto')
      .eq('status', 'ativo')
      .then(({ data, error }) => {
        if (error) { console.error('Erro ao carregar equipamentos (home):', error); return; }
        const rows = data || [];
        let count = 0;
        rows.forEach(e => { const d = diasRestantes(e.data_fim_previsto); if (d !== null && d <= 5) count++; });
        setEqAlertaCount(count);
        setEqDash(rows);
      });
    supabase.from('pendencias').select('status')
      .then(({ data, error }) => {
        if (error) { console.error('Erro ao carregar pendências (home):', error); return; }
        const counts = { aberta: 0, em_andamento: 0, atrasada: 0, resolvida: 0 };
        (data || []).forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
        setPendDash(counts);
      });
    // Resumo semanal de efetivo por empresa (merge efetivo_rdo + efetivo_draft)
    (async () => {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      monday.setHours(0,0,0,0);
      const weekDays = [0,1,2,3,4].map(i => {
        const d = new Date(monday); d.setDate(monday.getDate() + i);
        return toISODate(d);
      });
      const todayStr = toISODate(now);

      // 1. Busca RDOs da semana com draft
      const { data: weekRdos } = await supabase
        .from('rdos').select('id, data, efetivo_draft')
        .gte('data', weekDays[0]).lte('data', todayStr);
      const rdoMap = {}; // data -> rdo
      (weekRdos || []).forEach(r => { rdoMap[r.data] = r; });
      const rdoIds = (weekRdos || []).map(r => r.id);

      // 2. Busca efetivo_rdo submetido (fonte primária)
      const coMap = {}; // { empresa_nome: { empresa_id, days: { ds: count } } }
      const daysWithSubmitted = new Set();
      if (rdoIds.length > 0) {
        const { data: efRows } = await supabase
          .from('efetivo_rdo').select('rdo_id, colaborador_nome, empreiteiro')
          .in('rdo_id', rdoIds);
        (efRows || []).forEach(e => {
          const rdo = (weekRdos || []).find(r => r.id === e.rdo_id);
          if (!rdo) return;
          const ds = rdo.data;
          const co = e.empreiteiro || 'ADM';
          daysWithSubmitted.add(ds);
          if (!coMap[co]) coMap[co] = { empresa_id: null, days: {} };
          coMap[co].days[ds] = (coMap[co].days[ds] || 0) + 1;
        });
      }

      // 3. Fallback: para dias sem efetivo_rdo, usa efetivo_draft
      weekDays.forEach(ds => {
        if (daysWithSubmitted.has(ds)) return; // já tem dados submetidos
        const rdo = rdoMap[ds];
        if (!rdo) return;
        (rdo.efetivo_draft || []).forEach(w => {
          const co = w.empresa_nome || 'ADM';
          if (!coMap[co]) coMap[co] = { empresa_id: w.empresa_id, days: {} };
          coMap[co].days[ds] = (coMap[co].days[ds] || 0) + 1;
        });
      });

      const result = Object.entries(coMap).map(([nome, val]) => {
        const dayCounts = weekDays.map(ds => val.days[ds] || 0);
        const active = dayCounts.filter(v => v > 0).length;
        const avg = active > 0 ? (dayCounts.reduce((a,b) => a+b,0) / active).toFixed(1) : 0;
        return { nome, empresa_id: val.empresa_id, weekDays, dayCounts, avg };
      });
      setWeekEfetivoDash(result);
    })();
  }, []);

  // Médias de efetivo por empresa (semana atual x passada) + status de pedidos/contratações (desktop)
  useEffect(() => {
    (async () => {
      const mediaSemana = async (segunda) => {
        const dias = [0, 1, 2, 3, 4].map(i => { const d = new Date(segunda); d.setDate(segunda.getDate() + i); return toISODate(d); });
        const { data: rdos } = await supabase.from('rdos').select('id, data, efetivo_draft').gte('data', dias[0]).lte('data', dias[4]);
        const rdoIds = (rdos || []).map(r => r.id);
        const coDay = {}; // nome -> { ds -> count }
        const submittedDays = new Set();
        if (rdoIds.length) {
          const { data: ef } = await supabase.from('efetivo_rdo').select('rdo_id, empreiteiro').in('rdo_id', rdoIds);
          const byId = {}; (rdos || []).forEach(r => { byId[r.id] = r; });
          (ef || []).forEach(e => { const r = byId[e.rdo_id]; if (!r) return; submittedDays.add(r.data); const co = e.empreiteiro || 'ADM'; (coDay[co] = coDay[co] || {})[r.data] = (coDay[co][r.data] || 0) + 1; });
        }
        (rdos || []).forEach(r => { if (submittedDays.has(r.data)) return; (r.efetivo_draft || []).forEach(w => { const co = w.empresa_nome || 'ADM'; (coDay[co] = coDay[co] || {})[r.data] = (coDay[co][r.data] || 0) + 1; }); });
        const allDays = new Set();
        Object.values(coDay).forEach(d => Object.keys(d).forEach(ds => allDays.add(ds)));
        const nDias = allDays.size;
        const porEmpresa = {};
        let totalSum = 0;
        Object.entries(coDay).forEach(([co, d]) => { const sum = Object.values(d).reduce((a, b) => a + b, 0); totalSum += sum; porEmpresa[co] = nDias ? Math.round(sum / nDias) : 0; });
        return { media: nDias ? Math.round(totalSum / nDias) : 0, porEmpresa };
      };
      const now = new Date();
      const dow = now.getDay();
      const monThis = new Date(now); monThis.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); monThis.setHours(0, 0, 0, 0);
      const monLast = new Date(monThis); monLast.setDate(monThis.getDate() - 7);
      const [tw, lw] = await Promise.all([mediaSemana(monThis), mediaSemana(monLast)]);
      const nomes = [...new Set([...Object.keys(tw.porEmpresa), ...Object.keys(lw.porEmpresa)])];
      const empresasArr = nomes
        .map(nome => ({ nome, atual: tw.porEmpresa[nome] || 0, passada: lw.porEmpresa[nome] || 0 }))
        .sort((a, b) => b.atual - a.atual || b.passada - a.passada);
      setEfetivoMedia({ atual: tw.media, passada: lw.media, empresas: empresasArr });

      const { data: conts } = await supabase.from('contratacoes').select('status');
      if (conts) { const by = {}; conts.forEach(c => { const s = c.status || 'sem'; by[s] = (by[s] || 0) + 1; }); setContratacoesDash({ total: conts.length, byStatus: by }); }
    })();
  }, []);

  useEffect(() => {
    const todayStr = hojeLocal();
    (async () => {
      const { data: rdo } = await supabase.from('rdos').select('id, efetivo_draft').eq('data', todayStr).maybeSingle();
      if (!rdo) return;
      setTodayRdoIdEng(rdo.id);
      setEfetivoLive(rdo.efetivo_draft || []);
    })();
  }, []);

  useEffect(() => {
    if (!todayRdoIdEng) return;
    const ch = supabase.channel('eng-home-efetivo-' + todayRdoIdEng)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rdos', filter: `id=eq.${todayRdoIdEng}` }, (payload) => {
        const draft = payload.new?.efetivo_draft;
        if (Array.isArray(draft)) setEfetivoLive(draft);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [todayRdoIdEng]);

  useEffect(() => {
    if (!submitted) return;
    const todayStr = hojeLocal();
    (async () => {
      const { data: rdo } = await supabase.from('rdos').select('id, efetivo_draft, submetido_por_nome').eq('data', todayStr).maybeSingle();
      if (!rdo) return;
      // Worker count: prefer efetivo_draft (source of truth), fallback to efetivo_rdo table
      const draftCount = (rdo.efetivo_draft || []).length;
      let workerCount = draftCount;
      if (workerCount === 0) {
        const { data: ef } = await supabase.from('efetivo_rdo').select('id').eq('rdo_id', rdo.id);
        workerCount = ef?.length || 0;
      }
      // Serviços do dia: mesma regra da tela do RDO (src/lib/atividades-do-dia.js).
      // O card contava a semana inteira, então mostrava um número que a tela
      // do diário não confirmava.
      const { segunda, domingo } = semanaDe(todayStr);
      const { data: rdosSemana } = await supabase
        .from('rdos').select('id, data').gte('data', segunda).lte('data', domingo);
      const idsSemana = (rdosSemana || []).map(r => r.id);
      const { data: candidatas } = idsSemana.length
        ? await supabase.from('atividades_rdo').select('id, rdo_id, dias_semana').in('rdo_id', idsSemana)
        : { data: [] };
      const dataPorRdo = new Map((rdosSemana || []).map(r => [r.id, r.data]));
      const doDia = atividadesDoDia(candidatas || [], todayStr, id => dataPorRdo.get(id));
      setRdoSummary({ efetivo: workerCount, atividades: doDia.length, submetidoPor: rdo.submetido_por_nome });
    })();
  }, [submitted]);

  // ── Cards reutilizáveis ────────────────────────────────────────────────
  const rdoCard = (
    <div className="card" style={{ background: submitted ? 'var(--success-tint)' : 'var(--warn-tint)', border: 0 }}>
      <div className="row-between">
        <div className="t-micro" style={{ color: submitted ? 'var(--success)' : 'var(--warn)' }}>RDO DE HOJE</div>
        <span className="chip" style={{ background: 'transparent' }}>
          <span className="dot" style={{ background: submitted ? 'var(--success)' : 'var(--warn)' }} /> Mestre
        </span>
      </div>
      <div className="t-h2" style={{ marginTop: 6 }}>{submitted ? 'Diário recebido ✓' : 'Aguardando envio'}</div>
      <div className="t-2" style={{ fontSize: 13, marginTop: 2 }}>
        {submitted
          ? rdoSummary
            ? `${rdoSummary.efetivo} colaborador${rdoSummary.efetivo !== 1 ? 'es' : ''} · ${rdoSummary.atividades} atividade${rdoSummary.atividades !== 1 ? 's' : ''}${rdoSummary.submetidoPor ? ` · ${rdoSummary.submetidoPor}` : ''}`
            : 'Carregando resumo…'
          : 'O mestre ainda não enviou o diário de hoje.'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {submitted && onStartRDO && (
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={onStartRDO}>
              Revisar <span style={{ width: 14, height: 14 }}>{Icon.arrowR}</span>
            </button>
          )}
          {!submitted && onStartRDO && (
            <button className="btn btn-action btn-sm" style={{ flex: 1 }} onClick={onStartRDO}>
              <span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span>
              Fazer RDO
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Celular: um cartão só para o dia. Antes eram dois — "RDO de hoje" e "Efetivo
  // no canteiro" — dizendo a mesma coisa por dois caminhos e comendo 214 px da
  // primeira tela. Aqui o status virou selo e o efetivo virou o número ao lado.
  const diaCard = (() => {
    const total = efetivoLive.length;
    const byEmp = {};
    efetivoLive.forEach(w => {
      const key = w.empresa_nome || w.empresa_id || '__';
      if (!byEmp[key]) byEmp[key] = { nome: w.empresa_nome || 'ADM', id: w.empresa_id, count: 0 };
      byEmp[key].count++;
    });
    const empColor = (id) => empresas.find(e => e.id === id)?.cor || '#888';
    const cor = submitted ? 'var(--success)' : 'var(--warn)';
    const fundo = submitted ? 'var(--success-tint)' : 'var(--warn-tint)';
    return (
      <div className="card">
        <div className="row-between" style={{ marginBottom: 9 }}>
          <div className="t-micro">O DIA · {hoje}</div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px',
            borderRadius: 999, background: fundo, color: cor, fontSize: 11, fontWeight: 800,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: cor }} />
            {submitted ? 'Diário recebido' : 'Aguardando envio'}
          </span>
        </div>

        {total > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'center', flexShrink: 0 }}>
              <div style={{ fontSize: 32, fontWeight: 900, lineHeight: 1, color: 'var(--text-1)' }}>{total}</div>
              <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', marginTop: 2 }}>NO CANTEIRO</div>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: 'var(--border)' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {Object.values(byEmp).map(({ nome, id, count }) => {
                  const c = empColor(id);
                  return (
                    <span key={nome} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                      borderRadius: 999, background: c + '18', border: `1px solid ${c}55`,
                      fontSize: 11, fontWeight: 800, color: c,
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: c, flexShrink: 0 }} />
                      {nome} {count}
                    </span>
                  );
                })}
              </div>
              {rdoSummary && (
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                  {rdoSummary.atividades} atividade{rdoSummary.atividades !== 1 ? 's' : ''}
                  {rdoSummary.submetidoPor ? ` · enviado por ${rdoSummary.submetidoPor}` : ''}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            O mestre ainda não lançou o efetivo de hoje.
          </div>
        )}

        {onStartRDO && (
          <button className={submitted ? 'btn btn-secondary btn-sm' : 'btn btn-action btn-sm'}
            style={{ width: '100%', marginTop: 11 }} onClick={onStartRDO}>
            {submitted ? <>Revisar o RDO <span style={{ width: 14, height: 14 }}>{Icon.arrowR}</span></>
                       : <><span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span> Fazer RDO</>}
          </button>
        )}
      </div>
    );
  })();

  const pendAbertas = pendDash.aberta + pendDash.em_andamento + pendDash.atrasada;
  // Grade de atalhos do celular. Substitui as nove linhas largas, cujo subtítulo
  // ninguém lia e que custavam 66 px cada. Aqui cabem os atalhos de verdade.
  // Orçamento, medição e contas: sem o visitante (o banco também recusa).
  const financeiro = profile?.role !== 'visitante';
  const atalhos = [
    ...(financeiro ? [{ k: 'orcamento-obra', l: 'Orçamento da obra', ic: '🧮' }] : []),
    { k: 'efetivo-resumo',     l: 'Efetivo',        ic: Icon.barChart },
    { k: 'cronograma',         l: 'Cronograma',     ic: Icon.calendarWeek },
    ...(financeiro ? [{ k: 'medicoes', l: 'Medições', ic: '📏' }] : []),
    { k: 'checklist',          l: 'Pendências',     ic: Icon.clipboardList, badge: pendAbertas },
    { k: 'equipamentos',       l: 'Equipamentos',   ic: Icon.wrench, badge: eqAlertaCount },
    { k: 'contratacoes',       l: 'Contratações',   ic: Icon.clipboard },
    { k: 'projetos',           l: 'Projetos',       ic: Icon.ruler },
    { k: 'gestao-visual',      l: 'Gestão visual',  ic: '🎨' },
    { k: 'atas',               l: 'Visitas',        ic: Icon.users },
    { k: 'galeria',            l: 'Fotos',          ic: '📷' },
    ...(financeiro ? [
      { k: 'pagar',   l: 'Contas a pagar',   ic: '💸' },
      { k: 'receber', l: 'Contas a receber', ic: '🏦' },
    ] : []),
    { k: 'relatorios',         l: 'Relatórios',     ic: Icon.pdf },
    { k: 'cadastros',          l: 'Cadastros',      ic: Icon.cog, destaque: true },
  ];

  return (
    <div className="page">
      {/* Greeting */}
      <div style={{ padding: '14px var(--pad-4) 4px' }}>
        <div className="row-between" style={{ alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {obraWeek && <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, height: 24, padding: '0 11px',
                borderRadius: 999, background: 'var(--primary)', backgroundImage: 'var(--primary-grad)',
                color: '#fff', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em',
                boxShadow: '0 3px 10px -5px rgba(6,40,42,0.45)',
              }}>SEMANA {obraWeek}</span>}
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'capitalize' }}>{hoje}</span>
            </div>
            <div className="t-display" style={{ fontSize: 28, lineHeight: 1.15 }}>Olá, {nomeDisplay}.</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 7,
              fontSize: 11, fontWeight: 800, color: 'var(--text-2)', letterSpacing: '0.05em',
              padding: '3px 10px', borderRadius: 999, background: 'var(--surface-2)', border: '0.5px solid var(--border)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--primary-bright)' }} />
              {OBRA_NOME}
            </div>
          </div>
          <Avatar ini={ini} size={44} onClick={openUserMenu} />
        </div>
      </div>

      <div className="page-pad" style={isDesktop
        ? { marginTop: 16, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }
        : { marginTop: 16 }}>

        {isDesktop ? (
          <div className="home-grid">
            {/* Col 1: RDO + Efetivo + Pedidos */}
            <div className="home-col">
              {rdoCard}

              {/* Efetivo: média, canteiro e semana — uma caixa só, rolando por dentro */}
              <div className="card">
                <div className="t-micro" style={{ marginBottom: 10 }}>EFETIVO MÉDIO POR DIA</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)' }}>Semana passada</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-2)', lineHeight: 1.1, marginTop: 2 }}>{efetivoMedia.passada ?? '—'}</div>
                  </div>
                  <div style={{ background: 'var(--primary-tint)', borderRadius: 12, padding: '10px 14px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>Esta semana</div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--primary)', lineHeight: 1.1, marginTop: 2 }}>{efetivoMedia.atual ?? '—'}</div>
                  </div>
                </div>
                {(efetivoMedia.empresas || []).length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
                    {efetivoMedia.empresas.map(em => {
                      const cor = empresas.find(e => e.nome === em.nome || (em.nome === 'ADM' && e.tipo === 'adm'))?.cor || '#888888';
                      return (
                        <div key={em.nome} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 999, background: cor, flexShrink: 0 }} />
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{em.nome}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{em.passada}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>→</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: cor }}>{em.atual}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {efetivoLive.length > 0 && <EfetivoCanteiro efetivoLive={efetivoLive} empresas={empresas} hoje={hoje} />}
                {weekEfetivoDash.length > 0 && <EfetivoSemana weekEfetivoDash={weekEfetivoDash} empresas={empresas} />}
              </div>

              {/* Pedidos e contratações — donut por status, cores distintas, aguardando em destaque */}
              <div className="card">
                <div className="t-micro" style={{ marginBottom: 12 }}>CONTRATAÇÕES</div>
                {/* Empilha sozinho quando a coluna aperta — com 3 colunas os
                    dois donuts lado a lado não cabem em tela menor. */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
                  {(() => {
                    const d = contratacoesDash; const by = d?.byStatus || {};
                    const concl = (by.aprovado || 0) + (by.contratado || 0);
                    const pend = Math.max(0, (d?.total || 0) - concl);
                    const C_OK = 'grad', C_OK_DOT = 'linear-gradient(135deg, #22C55E, #0EA5E9)', C_PEND = 'var(--warn)';
                    const segs = [{ value: concl, color: C_OK }, { value: pend, color: C_PEND }];
                    return (
                      <button onClick={() => goto('contratacoes')} className="tap" style={{ textAlign: 'left', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 'var(--radius-card)', padding: '14px', cursor: 'pointer', boxShadow: 'var(--shadow-card)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <span style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(124,92,255,0.12)', color: '#6D5BD0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span>
                          </span>
                          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-2)', letterSpacing: '0.05em' }}>CONTRATAÇÕES</span>
                          <span style={{ marginLeft: 'auto', width: 14, height: 14, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                          <MiniDonut data={segs} size={58} stroke={9} />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 999, background: C_OK_DOT, flexShrink: 0 }} />
                              <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--text)' }}>{d ? concl : '—'}</span>
                              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>aprovadas</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 999, background: pend > 0 ? C_PEND : 'var(--border-strong)', flexShrink: 0 }} />
                              <span style={{ fontSize: 15, fontWeight: 900, color: pend > 0 ? '#C2410C' : 'var(--text-3)' }}>{d ? pend : '—'}</span>
                              <span style={{ fontSize: 12, fontWeight: pend > 0 ? 700 : 400, color: pend > 0 ? '#C2410C' : 'var(--text-3)' }}>em aberto</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })()}
                </div>
              </div>
            </div>
            {/* Col 2: o dia e o andamento da obra */}
            <div className="home-col">
              <PlanejamentoHojeCard goto={goto} />
              <CronogramaResumoCard goto={goto} />
              <ProjetosVencendoCard goto={goto} />
            </div>
            {/* Col 3: Pendencias + Equipamentos + Medicoes */}
            <div className="home-col">
              {/* Dashboard de Pendencias */}
              <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('checklist')}>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <div className="t-micro">PENDÊNCIAS</div>
                  <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[
                    { label: 'Em aberto', val: pendDash.aberta, color: 'var(--info)' },
                    { label: 'Em andamento', val: pendDash.em_andamento, color: 'var(--warn)' },
                    { label: 'Atrasadas', val: pendDash.atrasada, color: 'var(--danger)' },
                    { label: 'Resolvidas', val: pendDash.resolvida, color: 'var(--success)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{val}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600, marginTop: 3 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Dashboard de Equipamentos */}
              <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('equipamentos')}>
                <div className="row-between" style={{ marginBottom: 10 }}>
                  <div className="t-micro">EQUIPAMENTOS ATIVOS</div>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {eqAlertaCount > 0 && <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--warn)', background: 'var(--warn-tint)', padding: '2px 7px', borderRadius: 999 }}>{eqAlertaCount} alerta{eqAlertaCount !== 1 ? 's' : ''}</span>}
                    <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                  </span>
                </div>
                {eqDash.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>Nenhum equipamento ativo</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {eqDash.slice(0, 4).map((eq, i) => {
                      const dias = diasRestantes(eq.data_fim_previsto);
                      const alerta = dias !== null && dias <= 5;
                      return (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: alerta ? 'var(--warn-tint)' : 'var(--surface-2)', borderRadius: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eq.nome}</div>
                            {eq.tipo_locacao && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ eq.tipo_locacao}</div>}
                          </div>
                          {dias !== null && (
                            <span style={{ fontSize: 11, fontWeight: 800, color: alerta ? 'var(--warn)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                              {dias === 0 ? 'Hoje' : dias < 0 ? `${Math.abs(dias)}d atraso` : `${dias}d`}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {eqDash.length > 4 && <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '4px 0' }}>+{eqDash.length - 4} mais</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
                ) : (
          <div className="stack stack-3">
            {diaCard}
            <div>
              <div className="t-micro" style={{ marginBottom: 8 }}>ATALHOS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                {atalhos.map(a => (
                  <TileAction key={a.k} icon={a.ic} label={a.l} badge={a.badge}
                    primary={a.destaque} onClick={() => goto(a.k)} />
                ))}
              </div>
            </div>
            {/* Box de Medições — mobile (sem gerenciar) */}
          </div>
        )}
      </div>
    </div>
  );
}


// Atalho compacto da grade do celular. Mesma linguagem do RowAction, sem o
// subtítulo e com metade da largura — é o que faz caber doze em vez de nove.
function TileAction({ icon, label, onClick, primary, badge }) {
  return (
    <button onClick={onClick} className="tap" style={{
      position: 'relative', display: 'flex', alignItems: 'center', gap: 9,
      padding: '11px 11px', borderRadius: 14, cursor: 'pointer', minHeight: 58,
      fontFamily: 'inherit', textAlign: 'left',
      border: primary ? 0 : '0.5px solid var(--border)',
      background: primary ? 'var(--primary-grad)' : 'var(--surface)',
      color: primary ? '#fff' : 'var(--text)',
      boxShadow: primary ? '0 8px 20px -12px rgba(6,40,42,0.5)' : 'none',
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 11, flexShrink: 0,
        background: primary ? 'rgba(255,255,255,0.22)' : 'var(--primary-tint)',
        color: primary ? '#fff' : 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ width: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
      </span>
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 800, letterSpacing: '-0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</span>
      {badge > 0 && (
        <span style={{
          position: 'absolute', top: 6, right: 7,
          minWidth: 17, height: 17, borderRadius: 999, padding: '0 5px',
          background: primary ? 'rgba(0,0,0,0.28)' : 'var(--danger)', color: '#fff',
          fontSize: 10, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{badge > 99 ? '99+' : badge}</span>
      )}
    </button>
  );
}


// ── E02: Planejamento Semanal ─────────────────────────────────────────────
// ── Calendário do mês (visão geral por cima da semana) ────────────────────
// Mostra o mês inteiro com a semana exibida em destaque. Cada dia traz a
// quantidade de atividades, para dar noção de carga sem precisar abrir.
const MES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function MesCalendario({ mesRef, onMudarMes, weekMonday, todayStr, contagens, onEscolherDia }) {
  const ano = mesRef.getFullYear(), mes = mesRef.getMonth();
  const primeiro = new Date(ano, mes, 1);
  // começa na segunda-feira da semana do dia 1
  const dowPrim = primeiro.getDay() === 0 ? 6 : primeiro.getDay() - 1;
  const inicioGrade = new Date(ano, mes, 1 - dowPrim);

  const semanaExibida = toISODate(weekMonday);
  const celulas = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(inicioGrade);
    d.setDate(d.getDate() + i);
    return d;
  });
  // corta as linhas que ficaram totalmente fora do mês
  const linhas = [];
  for (let i = 0; i < 42; i += 7) {
    const semana = celulas.slice(i, i + 7);
    if (semana.some(d => d.getMonth() === mes)) linhas.push(semana);
  }

  return (
    <div style={{ background: 'var(--surface)', borderRadius: 14, border: '0.5px solid var(--border)', padding: '10px 10px 8px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button onClick={() => onMudarMes(-1)} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
          <span style={{ width: 14, height: 14 }}>{Icon.back}</span>
        </button>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{MES_NOMES[mes]} {ano}</div>
        <button onClick={() => onMudarMes(1)} style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-2)' }}>
          <span style={{ width: 14, height: 14 }}>{Icon.chevR}</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 3 }}>
        {['S','T','Q','Q','S','S','D'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, fontWeight: 800, color: 'var(--text-3)' }}>{d}</div>
        ))}
      </div>

      {linhas.map((semana, li) => {
        const daSemanaExibida = toISODate(semana[0]) === semanaExibida;
        return (
          <div key={li} style={{
            display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 2,
            borderRadius: 8, padding: '1px',
            background: daSemanaExibida ? 'var(--primary-tint)' : 'transparent',
            boxShadow: daSemanaExibida ? 'inset 0 0 0 1.5px var(--primary)' : 'none',
          }}>
            {semana.map((d, di) => {
              const ds = toISODate(d);
              const doMes = d.getMonth() === mes;
              const hoje = ds === todayStr;
              const n = contagens[ds] || 0;
              return (
                <button key={di} onClick={() => onEscolherDia(d)} style={{
                  border: 'none', background: hoje ? 'var(--primary)' : 'transparent',
                  borderRadius: 7, padding: '4px 0 3px', cursor: 'pointer', fontFamily: 'inherit',
                  opacity: doMes ? 1 : 0.3,
                }}>
                  <div style={{ fontSize: 12, fontWeight: hoje ? 900 : 600, color: hoje ? '#fff' : 'var(--text-1)', lineHeight: 1.1 }}>
                    {d.getDate()}
                  </div>
                  <div style={{ height: 11, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {n > 0 && (
                      <span style={{
                        fontSize: 8.5, fontWeight: 800, lineHeight: 1,
                        padding: '1px 4px', borderRadius: 999,
                        background: hoje ? 'rgba(255,255,255,0.28)' : 'var(--surface-2)',
                        color: hoje ? '#fff' : 'var(--text-2)',
                      }}>{n}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

export function EngPlanejar({ openSheet, planKey = 0, isDesktop = false }) {
  const { empreiteiros, ambientes, profile } = useObra();
  const ambLabel = (nome) => {
    if (!nome) return null;
    const found = ambientes.find(x => x.nome === nome);
    return found?.pavimento ? `${found.pavimento} · ${nome}` : nome;
  };
  const [weekActivities, setWeekActivities] = useState([]);
  const [weekRdos, setWeekRdos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editSheet, setEditSheet] = useState(false);
  const [editingAtiv, setEditingAtiv] = useState(null);
  const [delPopup, setDelPopup] = useState(null);   // { a, dayKey } — exclusão (dia x todos)
  const [planOpen, setPlanOpen] = useState(false);  // popup de planejamento em massa
  const [efetivoDia, setEfetivoDia] = useState([]);  // workers do dia selecionado
  const [weekStats, setWeekStats] = useState(null);  // PPC da semana (só passadas)
  const [todayEfetivo, setTodayEfetivo] = useState([]); // efetivo_draft do RDO de hoje (live)
  const [todayRdoId, setTodayRdoId] = useState(null);
  const [copiadoSemana, setCopiadoSemana] = useState(false);
  const [ocorrOpen, setOcorrOpen] = useState(false);   // análise de ocorrências (desktop)
  const [realocarOpen, setRealocarOpen] = useState(false);   // mover atividades de semana
  const [fechaOpen, setFechaOpen] = useState(false);   // fechamento da semana (desktop)

  const diasSemana = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const MONTH_NAMES     = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  const MONTH_NAMES_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const [weekOffset, setWeekOffset] = useState(0);
  const todayDow = new Date().getDay();
  const todayIdx = todayDow === 0 ? 6 : todayDow - 1;
  const todayStr = hojeLocal();
  const [selectedDay, setSelectedDay] = useState(todayIdx);
  const [showWeekView, setShowWeekView] = useState(() => isDesktop);
  const [agruparPor, setAgruparPor] = useState('empreiteiro'); // ou 'pavimento'
  const [recolhidos, setRecolhidos] = useState({});            // chave do grupo -> recolhido
  // Visão do mês: fica aberta no desktop e sob demanda no celular, onde o
  // espaço vertical é curto.
  // Sempre fechado ao entrar: o calendário do mês é consulta, não o padrão.
  const [mostrarMes, setMostrarMes] = useState(false);
  const [mesRef, setMesRef] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [contagensMes, setContagensMes] = useState({});

  // Compute the Monday of the displayed week
  const currentMonday = new Date();
  currentMonday.setDate(currentMonday.getDate() - todayIdx);
  currentMonday.setHours(0, 0, 0, 0);
  const weekMonday = new Date(currentMonday);
  weekMonday.setDate(weekMonday.getDate() + weekOffset * 7);
  // Copiar a semana inteira já planejada para colar na planilha. É diferente do
  // botão de dentro do popup, que exporta só o que está sendo digitado ali.
  async function copiarSemana() {
    const tsv = paraPlanilhaSemanal(weekActivities);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiadoSemana(true);
      setTimeout(() => setCopiadoSemana(false), 2200);
    } catch {
      window.alert('Não consegui usar a área de transferência. Copie daqui:\n\n' + tsv);
    }
  }

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekMonday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const selectedDate    = weekDates[selectedDay];
  const selectedDateStr = toISODate(selectedDate);
  const isSelectedFuture = selectedDateStr > todayStr;
  const isSelectedToday  = selectedDateStr === todayStr;

  // Dois popups de cadastro — um por atividade, outro pela semana — confundiam
  // mais do que ajudavam. No desktop tudo cai no planejador da semana, que faz
  // uma linha ou dez. No celular ele não cabe, então lá segue a folha do dia.
  const abrirCadastro = (ds) => isDesktop ? setPlanOpen(true) : openSheet(ds);

  // Month label for navigation header
  const m0 = weekDates[0].getMonth(), m6 = weekDates[6].getMonth();
  const yr = weekDates[6].getFullYear();
  const monthLabel = m0 === m6
    ? `${MONTH_NAMES_FULL[m0]} ${yr}`
    : `${MONTH_NAMES[m0]} / ${MONTH_NAMES_FULL[m6]} ${yr}`;

  function deriveAtivStatus(atividadeId, descricao, efetivoDraft) {
    return getDerivedStatus(atividadeId, efetivoDraft, { descricao, whenEmpty: null });
  }

  async function loadAtividades() {
    setLoading(true);
    setWeekActivities([]);
    setWeekRdos([]);
    // Carrega todos os RDOs da semana com efetivo_draft
    const weekDateStrs = weekDates.map(d => toISODate(d));
    const { data: rdos } = await supabase.from('rdos').select('id,data,efetivo_draft').in('data', weekDateStrs);
    const rdoList = rdos || [];
    setWeekRdos(rdoList.map(r => ({ id: r.id, data: r.data }))); // mantém forma sem efetivo
    if (!rdoList.length) { setLoading(false); return; }
    // Carrega todas as atividades da semana
    const { data: activs } = await supabase
      .from('atividades_rdo').select('*')
      .in('rdo_id', rdoList.map(r => r.id))
      .order('created_at');
    // Status derivado do efetivo: quem está apontado numa frente diz em que pé
    // ela está. Mas isso vale para UM dia — o dia do RDO de onde o efetivo veio.
    //
    // Antes o derivado era gravado no `status` liso da atividade. Numa atividade
    // planejada para a semana toda, o `status` liso é o que o chip mostra em
    // TODO dia sem valor próprio em status_por_dia: marcar "em andamento" na
    // terça pintava quarta, quinta e sexta de "em andamento" também, num
    // serviço que ainda nem começou nesses dias. Agora o derivado entra em
    // status_por_dia, no dia a que pertence — e só preenche buraco: o que a
    // pessoa gravou à mão continua mandando.
    const rdoEfetivoMap = {};
    for (const r of rdoList) rdoEfetivoMap[r.id] = r.efetivo_draft || [];

    const todayDateStr2 = hojeLocal();
    const todayRdoForDerive = rdoList.find(r => r.data === todayDateStr2);
    const todayDraftForDerive = todayRdoForDerive?.efetivo_draft || [];
    const todayDayKeyD = chaveDoDia(todayDateStr2);

    const activsWithStatus = (activs || []).map(a => {
      const multiDia = Array.isArray(a.dias_semana) && a.dias_semana.length > 0;
      const dataDoRdo = rdoList.find(r => r.id === a.rdo_id)?.data || null;

      // Do efetivo do RDO onde a atividade mora…
      const doProprioDia = deriveAtivStatus(a.id, a.descricao, rdoEfetivoMap[a.rdo_id] || []);
      // …e do efetivo de hoje, quando ela também acontece hoje (multi-dia
      // planejada na segunda tem gente apontada no RDO de hoje, não no dela).
      const apareceHoje = multiDia ? a.dias_semana.includes(todayDayKeyD) : dataDoRdo === todayDateStr2;
      const deHoje = (todayDraftForDerive.length > 0 && apareceHoje)
        ? deriveAtivStatus(a.id, a.descricao, todayDraftForDerive) : null;

      return mesclarStatusDerivado(a, {
        doProprioDia, deHoje, diaDoRdo: chaveDoDia(dataDoRdo), diaDeHoje: todayDayKeyD,
      });
    });
    setWeekActivities(activsWithStatus);
    // Efetivo de hoje para mostrar nomes dos workers
    const todayRdo = rdoList.find(r => r.data === todayStr);
    if (todayRdo) {
      setTodayRdoId(todayRdo.id);
      setTodayEfetivo(todayRdo.efetivo_draft || []);
    }
    setLoading(false);
  }

  // Recarrega atividades da semana inteira quando muda de semana
  useEffect(() => {
    loadAtividades();
  }, [planKey, weekOffset]);

  // Contagem de atividades por dia do mês exibido (alimenta o calendário).
  // Uma atividade conta no dia se ela é recorrente naquele dia da semana ou se
  // pertence ao RDO daquela data — a mesma regra usada na grade da semana.
  useEffect(() => {
    if (!mostrarMes || !isDesktop) return;
    let cancelado = false;
    (async () => {
      const ini = toISODate(new Date(mesRef.getFullYear(), mesRef.getMonth(), 1 - 7));
      const fim = toISODate(new Date(mesRef.getFullYear(), mesRef.getMonth() + 1, 7));
      const { data: rdos, error } = await supabase
        .from('rdos').select('id, data').gte('data', ini).lte('data', fim);
      if (error) { console.error('Erro ao carregar RDOs do mês:', error); return; }
      if (!rdos?.length) { if (!cancelado) setContagensMes({}); return; }

      const { data: ativs, error: eA } = await supabase
        .from('atividades_rdo').select('rdo_id, dias_semana').in('rdo_id', rdos.map(r => r.id));
      if (eA) { console.error('Erro ao carregar atividades do mês:', eA); return; }
      if (cancelado) return;

      const dataPorRdo = Object.fromEntries(rdos.map(r => [r.id, r.data]));
      const cont = {};
      for (const a of (ativs || [])) {
        const dataRdo = dataPorRdo[a.rdo_id];
        if (!dataRdo) continue;
        if (Array.isArray(a.dias_semana) && a.dias_semana.length > 0) {
          // recorrente: conta em cada dia do intervalo que bate o dia da semana
          const d = parseISODate(ini), lim = parseISODate(fim);
          while (d <= lim) {
            const ds = toISODate(d);
            if (ds >= dataRdo && a.dias_semana.includes(chaveDoDia(ds))) cont[ds] = (cont[ds] || 0) + 1;
            d.setDate(d.getDate() + 1);
          }
        } else {
          cont[dataRdo] = (cont[dataRdo] || 0) + 1;
        }
      }
      setContagensMes(cont);
    })();
    return () => { cancelado = true; };
  }, [mesRef, mostrarMes, isDesktop, planKey, weekOffset]);

  // Ao navegar entre semanas, o calendário acompanha o mês da semana exibida —
  // senão a semana em destaque sairia da tela sem o usuário entender por quê.
  // Devolve o mesmo objeto quando o mês não muda, para não re-renderizar à toa.
  useEffect(() => {
    if (!mostrarMes || !isDesktop) return;
    setMesRef(prev =>
      (prev.getFullYear() === weekMonday.getFullYear() && prev.getMonth() === weekMonday.getMonth())
        ? prev
        : new Date(weekMonday.getFullYear(), weekMonday.getMonth(), 1)
    );
  }, [weekOffset, mostrarMes]);

  // Leva a semana/dia para uma data escolhida no calendário do mês.
  function irParaData(d) {
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const segunda = new Date(d);
    segunda.setDate(d.getDate() - dow);
    segunda.setHours(0, 0, 0, 0);
    const offset = Math.round((segunda - currentMonday) / (7 * 86400000));
    setWeekOffset(offset);
    setSelectedDay(dow);
  }

  // Swipe lateral no celular para trocar de semana.
  const toqueX = useRef(null);
  const aoTocar = (e) => { toqueX.current = e.changedTouches[0].clientX; };
  const aoSoltar = (e) => {
    if (toqueX.current === null) return;
    const dx = e.changedTouches[0].clientX - toqueX.current;
    toqueX.current = null;
    if (Math.abs(dx) < 55) return;
    if (dx < 0 && weekOffset < 8) { setWeekOffset(w => w + 1); setSelectedDay(0); }
    if (dx > 0) { const nw = weekOffset - 1; setWeekOffset(nw); setSelectedDay(nw === 0 ? todayIdx : 0); }
  };

  // Recarrega efetivo quando muda o dia selecionado
  useEffect(() => {
    if (weekRdos.length === 0) { setEfetivoDia([]); return; }
    const dayRdo = weekRdos.find(r => r.data === selectedDateStr);
    if (!dayRdo) { setEfetivoDia([]); return; }
    supabase.from('efetivo_rdo').select('empreiteiro').eq('rdo_id', dayRdo.id)
      .then(({ data, error }) => {
        if (error) { console.error('Erro ao carregar efetivo do dia:', error); return; }
        setEfetivoDia(data || []);
      });
  }, [selectedDateStr, weekRdos]);

  // PPC da semana: carrega quando muda para semana passada
  useEffect(() => {
    if (weekOffset >= 0) { setWeekStats(null); return; }
    const dateStrs = weekDates.map(d => toISODate(d));
    (async () => {
      const { data: rdos } = await supabase.from('rdos').select('id').in('data', dateStrs);
      if (!rdos?.length) { setWeekStats({ total: 0, feitas: 0, parciais: 0, naoFeitas: 0 }); return; }
      const { data: ativs } = await supabase
        .from('atividades_rdo').select('status, status_por_dia').in('rdo_id', rdos.map(r => r.id));
      const all = ativs || [];
      // O status pode morar no mapa por dia (o chip de cada card grava lá) e
      // não no status geral. Lendo só o geral, o PPC dava 0% com a semana
      // inteira marcada como feita. Mesma regra do Fechamento, para os dois
      // números nunca discordarem.
      const st = all.map(statusDaSemana);
      setWeekStats({
        total:     all.length,
        feitas:    st.filter(s => s === C).length,
        parciais:  st.filter(s => s === I).length,
        naoFeitas: st.filter(s => s === N).length,
      });
    })();
  }, [weekOffset]);

  // Realtime: atualiza efetivo_draft quando mestre muda efetivo
  useEffect(() => {
    if (!todayRdoId) return;
    const ch = supabase.channel('eng-efetivo-draft-' + todayRdoId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rdos', filter: `id=eq.${todayRdoId}` }, (payload) => {
        const draft = payload.new?.efetivo_draft;
        if (Array.isArray(draft)) setTodayEfetivo(draft);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [todayRdoId]);

  // Realtime: atualiza status assim que o mestre mudar
  useEffect(() => {
    const channel = supabase
      .channel('eng-atividades-status')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'atividades_rdo',
      }, (payload) => {
        setWeekActivities(prev =>
          prev.map(a => a.id === payload.new.id ? { ...a, ...payload.new } : a)
        );
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Deriva status de uma atividade a partir dos workers do efetivo_draft
  // Delega para a fonte única (casa por id ou nome; sem workers → null p/ usar status do DB)


  const removeAtividadeRow = async (id) => {
    const { error } = await supabase.from('atividades_rdo').delete().eq('id', id);
    if (error) {
      console.error('Erro ao remover atividade:', error);
      window.alert('Não foi possível remover a atividade. Tente novamente.');
      return false;
    }
    setWeekActivities(prev => prev.filter(a => a.id !== id));
    return true;
  };

  // "Não foi feita": marca o status e guarda o motivo, que é o que alimenta o
  // PPC e a leitura de por que a semana não fechou.
  const marcarNaoFeita = async (motivoId, obs) => {
    if (!delPopup) return;
    const { a, dayKey: dk, data: dataDia } = delPopup;
    // Mesmo dayKey que o chip da atividade usa, senão o status gravado aqui
    // não seria o mesmo que o card mostra.
    const { newMap, error } = await salvarStatusAtividade(a.id, 'nao_feita', {
      dayKey: dk, statusPorDia: a.status_por_dia, motivo: motivoId,
    });
    if (error) { window.alert('Não foi possível salvar. Tente novamente.'); return; }
    setWeekActivities(prev => prev.map(x => x.id === a.id
      ? { ...x, motivo_nao_exec: motivoId, ...(newMap ? { status_por_dia: newMap } : { status: 'nao_feita' }) }
      : x));
    setDelPopup(null);

    // A mesma marcação vira ocorrência do RDO do dia — é dali que o item 5 do
    // Relatório Semanal (app irmão) puxa as observações, com o motivo e o
    // detalhe opcional, sem ninguém redigitar. Falhar aqui não desfaz o
    // status: o motivo já está salvo, e o aviso diz o que faltou.
    try {
      const dia = dataDia || todayStr;
      let { data: rdo } = await supabase.from('rdos').select('id').eq('data', dia).maybeSingle();
      if (!rdo) {
        const { data: novo } = await supabase.from('rdos')
          .upsert({ data: dia }, { onConflict: 'obra_id,data' }).select().single();
        rdo = novo;
      }
      if (!rdo?.id) return;
      const marca = 'nf:' + a.id;
      // Trocar o motivo (ou remarcar) substitui a ocorrência em vez de somar
      // uma segunda. A marca fica em criada_por_nome, que a tela só mostra
      // quando registrado_por está vazio — e aqui nunca está.
      await supabase.from('ocorrencias').delete().eq('rdo_id', rdo.id).eq('criada_por_nome', marca);
      const motivoNome = MOTIVOS_NAO_EXEC.find(m => m.id === motivoId)?.nome || '';
      const oc = ocorrenciaDeNaoExecucao(a, motivoNome, obs);
      const { error: eOc } = await supabase.from('ocorrencias').insert({
        rdo_id: rdo.id, data: dia, ...oc,
        registrado_por: profile?.nome || null, criada_por_nome: marca,
      });
      if (eOc) throw eOc;
    } catch (e) {
      console.error('Ocorrência do não-realizado:', e);
      window.alert('O motivo foi salvo, mas não consegui registrar a ocorrência para o relatório semanal.');
    }
  };

  // Exclusão com escopo: 'dia' (remove só o dia atual) ou 'todos' (apaga a atividade)
  const handleDeleteScope = async (scope) => {
    if (!delPopup) return;
    const { a, dayKey } = delPopup;
    const dias = Array.isArray(a.dias_semana) ? a.dias_semana : [];
    if (scope === 'todos' || dias.length <= 1) {
      await removeAtividadeRow(a.id);
    } else {
      const newDias = dias.filter(d => d !== dayKey);
      if (newDias.length === 0) {
        await removeAtividadeRow(a.id);            // sem dias restantes → apaga
      } else {
        const { error } = await supabase.from('atividades_rdo').update({ dias_semana: newDias }).eq('id', a.id);
        if (error) {
          console.error('Erro ao atualizar dias da atividade:', error);
          window.alert('Não foi possível atualizar a atividade. Tente novamente.');
        } else {
          setWeekActivities(prev => prev.map(x => x.id === a.id ? { ...x, dias_semana: newDias } : x));
        }
      }
    }
    setDelPopup(null);
  };

  const openEdit = (a) => { setEditingAtiv(a); setEditSheet(true); };
  const empColor = (nome) => empreiteiros.find(x => x.nome === nome)?.cor || '#888888';

  // A MESMA ordem de fornecedores para a semana inteira. Sem ela, cada coluna
  // listava na ordem de cadastro e o mesmo fornecedor pulava de posição de um
  // dia para o outro — o olho tinha que caçar a empresa em cada dia.
  const ordemForn = useMemo(() => ordemDeFornecedores(weekActivities), [weekActivities]);

  function dadosDoQuadro() {
    const dias = weekDates.map(d => { const iso = toISODate(d); return { iso, rotulo: rotuloColuna(iso) }; });
    const porDia = {};
    for (const d of dias) porDia[d.iso] = atividadesDoDia(weekActivities, d.iso, dataDoRdoDaSemana);
    const dm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    return {
      obra: MARCA.obra,
      rotulo: `semana de ${dm(weekDates[0])} a ${dm(weekDates[6])}`,
      dias, porDia,
      corDe: (nome) => empColor(nome),
    };
  }
  const gerarPdfSemana = () => abrirPdfPlanejamento(dadosDoQuadro());
  async function enviarQuadroSemana() {
    const r = await compartilharQuadroSemanal(dadosDoQuadro());
    // No desktop não existe a folha de compartilhar: o quadro baixa como
    // imagem e a pessoa anexa onde quiser — avisar evita o "cliquei e nada".
    if (r === 'baixado') window.alert('Seu navegador não tem a folha de compartilhar — a imagem do quadro foi baixada; é só anexar no WhatsApp ou no e-mail.');
  }

  // O recorte do dia é o mesmo do app do mestre — mora em lib/atividades-do-dia
  // e estava reescrito três vezes só dentro desta tela.
  const dataDoRdoDaSemana = (rdoId) => weekRdos.find(r => r.id === rdoId)?.data || null;
  const dayKey = chaveDoDia(selectedDateStr);
  const atividades = ordenarPorFornecedor(atividadesDoDia(weekActivities, selectedDateStr, dataDoRdoDaSemana), ordemForn);

  // Agrupar por empreiteiro
  // Agrupamento da lista do dia. Começa por empreiteiro, que é como a obra
  // conversa ("o pessoal da alvenaria"), com opção de ver por pavimento.
  const pavDoAmbiente = (nome) => ambientes.find(x => x.nome === nome)?.pavimento || '';
  const grouped = {};
  atividades.forEach(a => {
    const key = agruparPor === 'pavimento'
      ? (pavDoAmbiente(a.ambiente) || '__')
      : (a.empreiteiro || '__');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });
  const totalGrupos = Object.keys(grouped).length;
  const tudoRecolhido = totalGrupos > 0 && Object.keys(grouped).every(k => recolhidos[k]);

  return (
    <div className="page">
      <PageHeader eyebrow={OBRA_NOME + (getObraWeek() ? ` · SEMANA ${getObraWeek()}` : '')}
        title="Planejamento"
        sub={loading ? 'Carregando…' : showWeekView ? `${weekActivities.length} atividade${weekActivities.length !== 1 ? 's' : ''} esta semana` : `${atividades.length} atividade${atividades.length !== 1 ? 's' : ''}`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {/* Planejar a semana toda é trabalho de escritório: no celular
                sobram só o alternador de visão e o "+" do dia. O wrap existe
                porque sem ele o 4o botão ficava fora da tela de 375px —
                cortado e sem como alcançar. */}
            {isDesktop && (
              <button
                onClick={() => setPlanOpen(true)}
                style={{ height: 32, padding: '0 10px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 13, height: 13 }}>{Icon.plus}</span>
                Planejar semana
              </button>
            )}
            {/* Fechamento e análise: só desktop, são telas de escritório */}
            {isDesktop && (
              <button
                onClick={() => setFechaOpen(true)}
                title="Fechamento da semana — para colar na planilha"
                style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 13, height: 13 }}>{Icon.clipboard}</span>
                Fechamento
              </button>
            )}
            {/* O histograma de causas funciona bem no celular — não havia motivo
                para escondê-lo fora do desktop. */}
            {(
              <button
                onClick={() => setOcorrOpen(true)}
                title="Gráfico das atividades não realizadas e os motivos que mais se repetem"
                style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 13, height: 13 }}>{Icon.alert}</span>
                Não realizadas
              </button>
            )}
            {/* Conserto para o planejamento que foi parar na semana errada. */}
            <button
              onClick={() => setRealocarOpen(true)}
              title="Mover atividades planejadas de uma semana para outra"
              style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 13, height: 13 }}>{Icon.calendar || Icon.clipboard}</span>
              Realocar
            </button>
            <button
              onClick={() => setShowWeekView(v => !v)}
              style={{ height: 32, padding: '0 10px', borderRadius: 8, border: '1px solid var(--border)', background: showWeekView ? 'var(--primary)' : 'var(--surface)', color: showWeekView ? '#fff' : 'var(--text-2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 13, height: 13 }}>{Icon.calendar || Icon.clipboard}</span>
              {showWeekView ? 'Por dia' : 'Semana'}
            </button>
            {/* No desktop este "+" repetia o Planejar semana ao lado. */}
            {!showWeekView && !isDesktop && (
              <button className="btn btn-primary btn-sm"
                onClick={() => openSheet(selectedDateStr)}
                title={isSelectedFuture ? 'Planejar atividade' : 'Nova atividade'}
                style={{ padding: '0 12px' }}>
                <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>
              </button>
            )}
          </div>
        }
      />

      {/* Semana: mês + navegação + calendário */}
      <div style={{ padding: '0 var(--pad-4) var(--pad-2)' }}>
        {/* Linha de navegação com mês */}
        {/* Idem: "Copiar semana" e o botao seguinte sumiam 108px para fora
            da tela no celular. Descem de linha em vez de sumir. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <button
            onClick={() => { const nw = weekOffset - 1; setWeekOffset(nw); setSelectedDay(nw === 0 ? todayIdx : 0); }}
            style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
          </button>
          {/* No celular o calendário do mês não aparece: a tela é estreita e o
              que importa ali é o dia. O botão só existe no desktop. */}
          {isDesktop ? (
            <button
              onClick={() => { setMostrarMes(v => !v); if (!mostrarMes) setMesRef(() => { const d = new Date(weekMonday); d.setDate(1); return d; }); }}
              title={mostrarMes ? 'Ocultar o mês' : 'Ver o mês todo'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px',
                borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700,
                border: mostrarMes ? 'none' : '1px solid var(--border)',
                background: mostrarMes ? 'var(--primary)' : 'var(--surface)',
                color: mostrarMes ? '#fff' : 'var(--text-2)',
              }}>
              <span style={{ width: 14, height: 14 }}>{Icon.calendar}</span>
              {monthLabel}
            </button>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>{monthLabel}</div>
          )}
          <button
            onClick={gerarPdfSemana}
            disabled={weekActivities.length === 0}
            title="Imprimir o quadro desta semana (uma linha por fornecedor)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px',
              borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, flexShrink: 0,
              cursor: weekActivities.length ? 'pointer' : 'not-allowed',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: weekActivities.length ? 'var(--text-2)' : 'var(--text-3)',
              opacity: weekActivities.length ? 1 : 0.5,
            }}>
            <span style={{ width: 14, height: 14 }}>{Icon.pdf}</span>
            PDF
          </button>
          <button
            onClick={enviarQuadroSemana}
            disabled={weekActivities.length === 0}
            title="Enviar o quadro da semana como imagem (WhatsApp, e-mail…)"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px',
              borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, flexShrink: 0,
              cursor: weekActivities.length ? 'pointer' : 'not-allowed',
              border: '1px solid var(--border)', background: 'var(--surface)',
              color: weekActivities.length ? 'var(--text-2)' : 'var(--text-3)',
              opacity: weekActivities.length ? 1 : 0.5,
            }}>
            <span style={{ width: 14, height: 14 }}>{Icon.share}</span>
            Enviar
          </button>
          <button
            onClick={copiarSemana}
            disabled={weekActivities.length === 0}
            title="Copiar as atividades desta semana para colar na planilha"
            style={{
              display: 'flex', alignItems: 'center', gap: 6, height: 32, padding: '0 12px',
              borderRadius: 999, fontFamily: 'inherit', fontSize: 13, fontWeight: 700, flexShrink: 0,
              cursor: weekActivities.length ? 'pointer' : 'not-allowed',
              border: copiadoSemana ? 'none' : '1px solid var(--border)',
              background: copiadoSemana ? 'var(--success, #16A34A)' : 'var(--surface)',
              color: copiadoSemana ? '#fff' : weekActivities.length ? 'var(--text-2)' : 'var(--text-3)',
              opacity: weekActivities.length ? 1 : 0.5,
            }}>
            <span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span>
            {copiadoSemana ? 'copiado' : `Copiar semana${weekActivities.length ? ' (' + weekActivities.length + ')' : ''}`}
          </button>
          <button
            onClick={() => { setWeekOffset(w => w + 1); setSelectedDay(0); }}
            disabled={weekOffset >= 8}
            style={{ width: 32, height: 32, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: weekOffset >= 8 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, opacity: weekOffset >= 8 ? 0.35 : 1 }}>
            <span style={{ width: 16, height: 16 }}>{Icon.chevR}</span>
          </button>
        </div>

        {/* Mês inteiro, com a semana exibida em destaque */}
        {isDesktop && mostrarMes && (
          <MesCalendario
            mesRef={mesRef}
            onMudarMes={(n) => setMesRef(d => new Date(d.getFullYear(), d.getMonth() + n, 1))}
            weekMonday={weekMonday}
            todayStr={todayStr}
            contagens={contagensMes}
            onEscolherDia={irParaData}
          />
        )}

        {/* Grade semanal — arrastar para o lado troca de semana no celular */}
        <div
          onTouchStart={aoTocar}
          onTouchEnd={aoSoltar}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, touchAction: 'pan-y' }}>
          {weekDates.map((date, i) => {
            const isSelected = i === selectedDay;
            const dateStr    = toISODate(date);
            const isToday    = dateStr === todayStr;
            const isFuture   = dateStr > todayStr;
            return (
              <div
                key={i}
                onClick={() => setSelectedDay(i)}
                style={{
                  padding: '8px 0', borderRadius: 10, textAlign: 'center',
                  background: isSelected ? 'var(--primary)' : isToday ? 'var(--primary-tint)' : 'var(--surface)',
                  color: isSelected ? 'white' : isFuture ? 'var(--text-3)' : 'var(--text)',
                  border: '0.5px solid ' + (isSelected ? 'transparent' : isToday ? 'var(--primary)' : 'var(--border)'),
                  cursor: 'pointer',
                  opacity: isFuture && !isSelected ? 0.7 : 1,
                }}>
                <div style={{ fontSize: 10, opacity: 0.7, fontWeight: 600 }}>{diasSemana[i]}</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2 }}>{date.getDate()}</div>
                {isToday && !isSelected && (
                  <div style={{ width: 4, height: 4, borderRadius: 999, background: 'var(--primary)', margin: '3px auto 0' }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* PPC da semana — só para semanas passadas */}
      {weekStats && weekOffset < 0 && weekStats.total > 0 && (() => {
        const ppc = Math.round((weekStats.feitas / weekStats.total) * 100);
        const ppcColor = ppc >= 80 ? 'var(--success)' : ppc >= 50 ? 'var(--warn)' : 'var(--danger)';
        return (
          <div style={{ padding: '0 var(--pad-4) 10px' }}>
            <div style={{ background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
              border: '0.5px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>PPC DA SEMANA</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: ppcColor }}>{ppc}%</div>
              </div>
              {/* Barra de progresso */}
              <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${ppc}%`, background: ppcColor, borderRadius: 999, transition: 'width 0.4s' }} />
              </div>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>✓ {weekStats.feitas} feitas</span>
                {weekStats.parciais > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--warn)' }}>~ {weekStats.parciais} em andamento</span>}
                {weekStats.naoFeitas > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>✗ {weekStats.naoFeitas} não feitas</span>}
                <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto' }}>{weekStats.total} total</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Label do dia selecionado + efetivo */}
      <div style={{ padding: '4px var(--pad-4) 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isSelectedToday ? 'var(--primary)' : isSelectedFuture ? '#3dd5b0' : 'var(--text-3)', textTransform: 'capitalize' }}>
          {isSelectedToday ? '● Hoje' : isSelectedFuture ? '◆ Planejamento futuro' : '○ Retroativo'} · {selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        {efetivoDia.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 999, background: 'var(--surface)',
            border: '0.5px solid var(--border)', flexShrink: 0 }}>
            <span style={{ fontSize: 13 }}>👷</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>{efetivoDia.length}</span>
          </div>
        )}
      </div>

      {!showWeekView && atividades.length === 0 && !loading && (
        <div className="page-pad">
          <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div className="t-strong">
              {isSelectedFuture ? 'Nenhuma atividade planejada' : 'Nenhuma atividade neste dia'}
            </div>
            <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.4 }}>
              {isSelectedFuture
                ? 'Planeje atividades para que o mestre veja o que deve ser feito neste dia.'
                : 'Toque em + Atividade para adicionar' + (isSelectedToday ? '.' : ' retroativamente.')}
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => abrirCadastro(selectedDateStr)}>
              <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>
              {isDesktop ? 'Planejar semana' : isSelectedFuture ? 'Planejar atividade' : isSelectedToday ? 'Nova atividade' : 'Lançar retroativo'}
            </button>
          </div>
        </div>
      )}

      {/* Como agrupar a lista do dia + recolher tudo */}
      {!showWeekView && atividades.length > 0 && (
        <div style={{ padding: '0 var(--pad-4) 8px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {[['empreiteiro', 'Por empreiteiro'], ['pavimento', 'Por pavimento']].map(([k, lb]) => (
            <button key={k} onClick={() => { setAgruparPor(k); setRecolhidos({}); }} style={{
              height: 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 700,
              border: agruparPor === k ? 'none' : '1px solid var(--border)',
              background: agruparPor === k ? 'var(--primary)' : 'var(--surface)',
              color: agruparPor === k ? '#fff' : 'var(--text-2)',
            }}>{lb}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button
            onClick={() => setRecolhidos(tudoRecolhido ? {} : Object.fromEntries(Object.keys(grouped).map(k => [k, true])))}
            style={{
              height: 30, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, fontWeight: 700, border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text-2)',
            }}>{tudoRecolhido ? 'Expandir tudo' : 'Recolher tudo'}</button>
        </div>
      )}

      {!showWeekView && atividades.length > 0 && (
        <div className="page-pad stack stack-3" style={{ paddingTop: 4 }}>
          {Object.entries(grouped).map(([empNome, list]) => {
            const porPav = agruparPor === 'pavimento';
            const cor = porPav ? 'var(--primary)' : empColor(empNome === '__' ? null : empNome);
            const label = empNome === '__' ? (porPav ? 'Sem pavimento' : 'Sem fornecedor') : empNome;
            const recolhido = !!recolhidos[empNome];
            return (
              <div key={empNome}>
                {/* Cabeçalho do grupo — toque para recolher */}
                <button
                  onClick={() => setRecolhidos(r => ({ ...r, [empNome]: !r[empNome] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 2px 7px', marginBottom: 8,
                    width: '100%', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit',
                    borderBottom: `2px solid ${cor}33` }}>
                  <div style={{ width: 9, height: 9, borderRadius: 999, background: cor, flexShrink: 0 }} />
                  <div style={{ fontSize: 12, fontWeight: 800, color: cor, letterSpacing: '0.04em' }}>{label.toUpperCase()}</div>
                  <div className="t-caption" style={{ opacity: 0.7 }}>· {list.length}</div>
                  <span style={{ flex: 1 }} />
                  <span style={{ width: 14, height: 14, color: cor, display: 'flex', transform: recolhido ? 'none' : 'rotate(90deg)', transition: 'transform .15s' }}>
                    {Icon.chevR}
                  </span>
                </button>

                <div className="stack stack-2" style={{ display: recolhido ? 'none' : undefined }}>
                  {list.map(a => (
                    <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                      <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                        {/* Barra lateral colorida */}
                        <div style={{ width: 4, background: cor, flexShrink: 0 }} />
                        <div style={{ flex: 1, padding: '11px 12px 10px', minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div className="t-strong" style={{ fontSize: 14, lineHeight: 1.3 }}>{a.descricao}</div>
                              {a.ambiente && <div className="t-caption" style={{ marginTop: 3, fontSize: 11 }}>📍 {ambLabel(a.ambiente)}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => openEdit(a)} style={{ width: 30, height: 30, border: 0, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ width: 14, height: 14 }}>{Icon.edit || Icon.more}</span>
                              </button>
                              <button title="Não foi feita / excluir" onClick={() => setDelPopup({ a, dayKey, data: selectedDateStr, modo: 'nao_feita' })} style={{ width: 30, height: 30, border: 0, borderRadius: 8, background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span style={{ width: 14, height: 14 }}>{Icon.x}</span>
                              </button>
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                            <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 4, minWidth: 0 }}>
                              {(a.dias_semana || []).length > 0
                                ? DIAS_LIST.map(d => (a.dias_semana || []).includes(d) ? (
                                    <span key={d} style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 800, background: cor + '22', color: cor }}>
                                      {DIAS_LABELS_MAP[d]}
                                    </span>
                                  ) : null)
                                : <span style={{ fontSize: 10, color: 'var(--text-3)', opacity: 0.4 }}>Sem dia fixo</span>
                              }
                            </div>
                            <StatusPickerChip status={a.status || 'pendente'} activityId={a.id}
                              dayKey={dayKey} statusPorDia={a.status_por_dia} diasSemana={a.dias_semana}
                              onUpdated={(id, s, map, dias) => setWeekActivities(prev => prev.map(x => x.id === id ? { ...x, ...(map ? { status_por_dia: map } : { status: s }), ...(dias ? { dias_semana: dias } : {}) } : x))} />
                          </div>
                          {a.status !== 'feita' && (a.dias_semana || []).length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <ReplanejaDiasChip activityId={a.id} diasSemana={a.dias_semana || []}
                                onUpdated={(id, newDias) => setWeekActivities(prev => prev.map(x => x.id === id ? {...x, dias_semana: newDias} : x))} />
                            </div>
                          )}
                          {/* Nomes dos colaboradores em campo (só quando é hoje e tem efetivo) */}
                          {isSelectedToday && (() => {
                            const nomes = todayEfetivo
                              .filter(w => w.atividade_id === a.id || (w.extras || []).some(ex => ex.atividade_id === a.id))
                              .map(w => w.nome);
                            if (nomes.length === 0) return null;
                            return (
                              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                {nomes.map((nome, i) => (
                                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: cor + '18', border: `1px solid ${cor}44`, fontSize: 11, fontWeight: 700, color: cor }}>
                                    👷 {nome.split(' ')[0]}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Vista semanal: todos os dias */}
      {showWeekView && (() => {
        const diasLabel = ['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'];

        // ── Desktop: grade de 7 colunas ──────────────────────────────────
        if (isDesktop) {
          return (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 2fr 2fr 2fr 2fr 1fr 1fr',
              gap: 10,
              padding: '12px 24px 28px',
              overflowX: 'auto',
              alignItems: 'start',
            }}>
              {weekDates.map((date, i) => {
                const dk = DIA_KEY[date.getDay()];
                const ds = toISODate(date);
                const isToday = ds === todayStr;
                const isFuture = ds > todayStr;
                const dayActivities = ordenarPorFornecedor(atividadesDoDia(weekActivities, ds, dataDoRdoDaSemana), ordemForn);
                return (
                  <div key={i} style={{
                    display: 'flex', flexDirection: 'column',
                    borderRadius: 14,
                    background: isToday ? 'var(--primary-tint)' : 'var(--surface)',
                    border: '0.5px solid ' + (isToday ? 'var(--primary)' : 'var(--border)'),
                    overflow: 'hidden',
                    minHeight: 160,
                  }}>
                    {/* Cabeçalho da coluna */}
                    <div style={{
                      padding: '10px 10px 8px',
                      borderBottom: '0.5px solid ' + (isToday ? 'rgba(255,255,255,0.25)' : 'var(--border)'),
                      background: isToday ? 'var(--primary)' : isFuture ? 'var(--surface-2)' : 'var(--surface)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', color: isToday ? 'rgba(255,255,255,0.75)' : 'var(--text-3)', textTransform: 'uppercase' }}>
                          {diasSemana[i]}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: isToday ? '#fff' : isFuture ? 'var(--text-3)' : 'var(--text-1)' }}>
                          {date.getDate()}
                        </div>
                        {dayActivities.length > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 600, color: isToday ? 'rgba(255,255,255,0.65)' : 'var(--text-3)', marginTop: 1 }}>
                            {dayActivities.length} ativ.
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => abrirCadastro(ds)}
                        style={{
                          width: 26, height: 26, borderRadius: 7,
                          border: isToday ? '1px solid rgba(255,255,255,0.4)' : '1px solid var(--border)',
                          background: isToday ? 'rgba(255,255,255,0.15)' : 'var(--bg)',
                          color: isToday ? '#fff' : 'var(--primary)',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                        <span style={{ width: 12, height: 12 }}>{Icon.plus}</span>
                      </button>
                    </div>

                    {/* Atividades da coluna */}
                    <div style={{ flex: 1, padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {dayActivities.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 60 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-3)', opacity: 0.4 }}>—</div>
                        </div>
                      ) : dayActivities.map(a => {
                        const cor = empColor(a.empreiteiro || null);
                        const workers = isToday ? todayEfetivo
                          .filter(w => w.atividade_id === a.id || (w.extras||[]).some(ex => ex.atividade_id === a.id))
                          .map(w => w.nome) : [];
                        return (
                          <div key={a.id} style={{
                            borderRadius: 9, overflow: 'hidden',
                            background: 'var(--bg)',
                            border: '0.5px solid var(--border)',
                            display: 'flex',
                          }}>
                            {/* Vertical company label */}
                            <div style={{
                              width: 16, flexShrink: 0,
                              background: cor + '20',
                              borderRight: `2.5px solid ${cor}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '6px 0',
                            }}>
                              <span style={{
                                writingMode: 'vertical-rl',
                                transform: 'rotate(180deg)',
                                fontSize: 8, fontWeight: 800, color: cor,
                                whiteSpace: 'nowrap', overflow: 'hidden',
                                textOverflow: 'ellipsis', maxHeight: 72,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                userSelect: 'none',
                              }}>
                                {a.empreiteiro || 'Obra'}
                              </span>
                            </div>
                            {/* Content */}
                            <div style={{ padding: '7px 8px', flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.35 }}>{a.descricao}</div>
                              {a.ambiente && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>📍 {ambLabel(a.ambiente)}</div>}
                              <div style={{ marginTop: 5 }}>
                                <StatusPickerChip status={a.status || 'pendente'} activityId={a.id}
                                  dayKey={dk} statusPorDia={a.status_por_dia} diasSemana={a.dias_semana}
                                  onUpdated={(id, s, map, dias) => setWeekActivities(prev => prev.map(x => x.id === id ? { ...x, ...(map ? { status_por_dia: map } : { status: s }), ...(dias ? { dias_semana: dias } : {}) } : x))} />
                              </div>
                              {workers.length > 0 && (
                                <div style={{ marginTop: 5, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                                  {workers.map((nome, ni) => (
                                    <span key={ni} style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: cor + '18', color: cor }}>
                                      👷 {nome.split(' ')[0]}
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div style={{ marginTop: 5, display: 'flex', gap: 3 }}>
                                <button onClick={() => openEdit(a)} style={{ width: 24, height: 24, border: 0, borderRadius: 6, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ width: 11, height: 11 }}>{Icon.edit || Icon.more}</span>
                                </button>
                                <button title="Não foi feita / excluir" onClick={() => setDelPopup({ a, dayKey: dk, data: ds, modo: 'nao_feita' })} style={{ width: 24, height: 24, border: 0, borderRadius: 6, background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ width: 11, height: 11 }}>{Icon.x}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        // ── Mobile: lista vertical ─────────────────────────────────────────
        return (
          <div className="page-pad stack stack-3" style={{ paddingTop: 4 }}>
            {weekDates.map((date, i) => {
              const dk = DIA_KEY[date.getDay()];
              const ds = toISODate(date);
              const isToday = ds === todayStr;
              const isFuture = ds > todayStr;
              const dayActivities = ordenarPorFornecedor(atividadesDoDia(weekActivities, ds, dataDoRdoDaSemana), ordemForn);
              // A lista já vem na ordem fixa da semana; o objeto preserva a
              // ordem de inserção, então os grupos saem na mesma ordem em
              // todos os dias.
              const dayGrouped = {};
              dayActivities.forEach(a => {
                const key = a.empreiteiro || '__';
                if (!dayGrouped[key]) dayGrouped[key] = [];
                dayGrouped[key].push(a);
              });
              return (
                <div key={i}>
                  {/* Cabeçalho do dia */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                      background: isToday ? 'var(--primary)' : isFuture ? 'var(--surface-2)' : 'var(--surface)',
                      border: '0.5px solid ' + (isToday ? 'transparent' : 'var(--border)'),
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      color: isToday ? '#fff' : isFuture ? 'var(--text-3)' : 'var(--text)',
                    }}>
                      <div style={{ fontSize: 8, fontWeight: 700, opacity: 0.7 }}>{diasSemana[i]}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, lineHeight: 1 }}>{date.getDate()}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: isToday ? 'var(--primary)' : isFuture ? 'var(--text-3)' : 'var(--text-2)' }}>
                        {diasLabel[i]}{isToday ? ' · Hoje' : ''}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                        {dayActivities.length === 0 ? 'Nenhuma atividade' : `${dayActivities.length} atividade${dayActivities.length !== 1 ? 's' : ''}`}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (isDesktop) { setPlanOpen(true); return; }
                        setShowWeekView(false); setSelectedDay(i); setTimeout(() => openSheet(ds), 50);
                      }}
                      style={{ marginLeft: 'auto', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 13, height: 13 }}>{Icon.plus}</span>
                    </button>
                  </div>

                  {dayActivities.length === 0 ? (
                    <div style={{ paddingLeft: 40, paddingBottom: 8 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        {isFuture ? 'Sem atividades planejadas' : isToday ? 'Nenhuma atividade hoje' : 'Nenhuma atividade'}
                      </div>
                    </div>
                  ) : (
                    <div style={{ paddingLeft: 0 }} className="stack stack-2">
                      {Object.entries(dayGrouped).map(([empNome, list]) => {
                        const cor = empColor(empNome === '__' ? null : empNome);
                        return (
                          <div key={empNome}>
                            {Object.keys(dayGrouped).length > 1 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 5 }}>
                                <div style={{ width: 7, height: 7, borderRadius: 999, background: cor }} />
                                <div style={{ fontSize: 10, fontWeight: 800, color: cor }}>{empNome === '__' ? 'SEM FORNECEDOR' : empNome.toUpperCase()}</div>
                              </div>
                            )}
                            <div className="stack stack-1">
                              {list.map(a => (
                                <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                                  <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                                    <div style={{ width: 4, background: cor, flexShrink: 0 }} />
                                    <div style={{ flex: 1, padding: '9px 11px', minWidth: 0 }}>
                                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <div className="t-strong" style={{ fontSize: 13 }}>{a.descricao}</div>
                                          {a.ambiente && <div className="t-caption" style={{ marginTop: 2, fontSize: 10 }}>📍 {ambLabel(a.ambiente)}</div>}
                                        </div>
                                        <div style={{ display: 'flex', gap: 3, flexShrink: 0, alignItems: 'center' }}>
                                          <StatusPickerChip status={a.status || 'pendente'} activityId={a.id}
                                            dayKey={dk} statusPorDia={a.status_por_dia} diasSemana={a.dias_semana}
                                            onUpdated={(id, s, map, dias) => setWeekActivities(prev => prev.map(x => x.id === id ? { ...x, ...(map ? { status_por_dia: map } : { status: s }), ...(dias ? { dias_semana: dias } : {}) } : x))} />
                                          <button onClick={() => openEdit(a)} style={{ width: 26, height: 26, border: 0, borderRadius: 7, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ width: 12, height: 12 }}>{Icon.edit || Icon.more}</span>
                                          </button>
                                          <button title="Não foi feita / excluir" onClick={() => setDelPopup({ a, dayKey: dk, data: ds, modo: 'nao_feita' })} style={{ width: 26, height: 26, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ width: 12, height: 12 }}>{Icon.x}</span>
                                          </button>
                                        </div>
                                      </div>
                                      {ds === todayStr && (() => {
                                        const nomes = todayEfetivo
                                          .filter(w => w.atividade_id === a.id || (w.extras || []).some(ex => ex.atividade_id === a.id))
                                          .map(w => w.nome);
                                        if (nomes.length === 0) return null;
                                        return (
                                          <div style={{ marginTop: 7, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {nomes.map((nome, ni) => (
                                              <span key={ni} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 999, background: cor + '18', border: `1px solid ${cor}44`, fontSize: 11, fontWeight: 700, color: cor }}>
                                                👷 {nome.split(' ')[0]}
                                              </span>
                                            ))}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {i < 6 && <div style={{ height: 1, background: 'var(--border)', margin: '10px 0 4px' }} />}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ✕ do card: primeiro "não foi feita" com motivo; a lixeirinha leva à exclusão */}
      {delPopup && (() => {
        const dias = Array.isArray(delPopup.a.dias_semana) ? delPopup.a.dias_semana : [];
        const multi = dias.length > 1;
        const excluir = delPopup.modo === 'excluir';
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 24 }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 22, width: '100%', maxWidth: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>

              {excluir ? (
                <>
                  <div className="t-strong" style={{ fontSize: 17, marginBottom: 8 }}>Excluir atividade</div>
                  <div className="t-caption" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
                    {multi
                      ? <>“{delPopup.a.descricao}” está em vários dias. Deseja deletar a atividade apenas deste dia ou de todos os dias em que ela está cadastrada?</>
                      : <>Deseja excluir a atividade “{delPopup.a.descricao}”?</>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {multi && (
                      <button className="btn btn-primary" onClick={() => handleDeleteScope('dia')}>Apenas este dia</button>
                    )}
                    <button className="btn" style={{ background: 'var(--danger)', color: '#fff', border: 'none' }} onClick={() => handleDeleteScope('todos')}>
                      {multi ? 'Todos os dias' : 'Excluir'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => setDelPopup(null)}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-strong" style={{ fontSize: 17 }}>Não foi feita?</div>
                      <div className="t-caption" style={{ fontSize: 12.5, marginTop: 2 }}>{delPopup.a.descricao}</div>
                    </div>
                    <button title="Excluir atividade" onClick={() => setDelPopup(p => ({ ...p, modo: 'excluir' }))}
                      style={{ width: 34, height: 34, flexShrink: 0, border: 0, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ width: 16, height: 16 }}>{Icon.trash}</span>
                    </button>
                  </div>
                  <div className="t-micro" style={{ margin: '14px 0 8px' }}>MOTIVO</div>
                  {/* O toque no motivo SELECIONA (não salva mais na hora): abriu
                      espaço para o detalhe opcional, que segue junto com o
                      motivo para o item 5 do Relatório Semanal. */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {MOTIVOS_NAO_EXEC.map(m => {
                      const sel = delPopup.motivoSel === m.id;
                      return (
                        <button key={m.id} onClick={() => setDelPopup(p => ({ ...p, motivoSel: sel ? null : m.id }))}
                          style={{ padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                            border: sel ? 'none' : '1px solid var(--border)',
                            background: sel ? 'var(--danger)' : 'var(--surface-2)',
                            color: sel ? '#fff' : 'var(--text-1)', fontSize: 12.5, fontWeight: 700 }}>
                          {m.nome}
                        </button>
                      );
                    })}
                  </div>
                  <div className="t-micro" style={{ margin: '14px 0 6px' }}>DETALHE (OPCIONAL — VAI PARA O RELATÓRIO SEMANAL)</div>
                  <textarea value={delPopup.obs || ''} rows={2}
                    onChange={e => setDelPopup(p => ({ ...p, obs: e.target.value }))}
                    placeholder="Ex: aço só chega quinta; bomba da Supermix quebrou…"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--surface-2)', fontSize: 13,
                      color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none', resize: 'vertical', lineHeight: 1.4 }} />
                  <div style={{ marginTop: 6 }}>
                    <BotaoDitar titulo="Ditar o detalhe" style={{ fontSize: 11, padding: '3px 9px' }}
                      onTexto={t => setDelPopup(p => ({ ...p, obs: juntarDitado(p?.obs, t) }))} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setDelPopup(null)}>Cancelar</button>
                    <button className="btn" disabled={!delPopup.motivoSel}
                      onClick={() => marcarNaoFeita(delPopup.motivoSel, delPopup.obs)}
                      style={{ flex: 1, background: delPopup.motivoSel ? 'var(--danger)' : 'var(--border)', color: '#fff', border: 'none',
                        cursor: delPopup.motivoSel ? 'pointer' : 'default' }}>
                      Confirmar
                    </button>
                  </div>
                </>
              )}

            </div>
          </div>
        );
      })()}

      {ocorrOpen && <OcorrenciasPopup onClose={() => setOcorrOpen(false)} />}

      {realocarOpen && (
        <RealocarSemanaPopup
          baseMonday={currentMonday}
          offsetInicial={weekOffset}
          onClose={(destinoOffset) => {
            setRealocarOpen(false);
            if (destinoOffset === null || destinoOffset === undefined) return;
            // Vai para a semana de destino, para ver o resultado.
            if (destinoOffset === weekOffset) loadAtividades();
            else { setSelectedDay(0); setWeekOffset(destinoOffset); }
          }}
        />
      )}
      {fechaOpen && <FechamentoSemanaPopup onClose={() => setFechaOpen(false)} />}

      {/* Popup de planejamento em massa da semana */}
      {planOpen && (
        <PlanejadorSemana
          empreiteiros={empreiteiros}
          ambientes={ambientes}
          baseMonday={currentMonday}
          offsetInicial={weekOffset}
          onClose={(savedOffset) => {
            setPlanOpen(false);
            if (savedOffset === null || savedOffset === undefined) return;
            if (savedOffset === weekOffset) loadAtividades();
            else { setSelectedDay(0); setWeekOffset(savedOffset); }
          }}
        />
      )}

            {/* Sheet de edição inline */}
      <Sheet open={editSheet} onClose={() => setEditSheet(false)}>
        <NovaAtividadeSheet
          initialData={editingAtiv}
          onClose={(reload) => { setEditSheet(false); if (reload) loadAtividades(); /* recarrega semana */ }}
        />
      </Sheet>
    </div>
  );
}

// ── Planejador em massa da semana (cadastro rápido de várias atividades) ────
function PlanejadorSemana({ empreiteiros, ambientes, baseMonday, offsetInicial = 0, onClose }) {
  const DAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
  const DAY_LABEL = { seg: 'S', ter: 'T', qua: 'Q', qui: 'Q', sex: 'S', sab: 'S' };
  const UTEIS = ['seg', 'ter', 'qua', 'qui', 'sex'];
  // Começa na semana que está sendo vista na tela de trás, não na atual: abrir
  // o planejador olhando a semana que vem e ele cair na semana corrente foi a
  // origem do "planejei e salvou na semana errada".
  const [weekOff, setWeekOff] = useState(offsetInicial);
  const [saving, setSaving] = useState(false);

  const monday = new Date(baseMonday);
  monday.setDate(monday.getDate() + weekOff * 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  // Linha nova herda empresa e ambiente da anterior: ao planejar uma sequência
  // na mesma frente de serviço, isso corta dois cliques por atividade.
  const newRow = (base) => ({ key: uid(), desc: '', dias: base?.dias ?? [], empId: base?.empId ?? '', ambNome: base?.ambNome ?? '', cronId: null });
  const [rows, setRows] = useState(() => [newRow()]);
  const [itensCron, setItensCron] = useState([]);
  useEffect(() => { listarItensVinculaveis().then(setItensCron); }, []);

  // O que ficou em aberto na semana ANTERIOR à que está sendo planejada.
  // Antes vinha pronto da tela de trás, preso à semana exibida lá, e não
  // acompanhava o ‹ › daqui: planejar a semana seguinte não trazia nada.
  const mondayISO = toISODate(monday);
  const [sugestoes, setSugestoes] = useState([]);
  useEffect(() => {
    let vivo = true;
    (async () => {
      const ini = new Date(mondayISO + 'T12:00:00');
      ini.setDate(ini.getDate() - 7);
      const datas = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(ini); d.setDate(d.getDate() + i); return toISODate(d);
      });
      const { data: rdos, error: eR } = await supabase.from('rdos').select('id').in('data', datas);
      if (eR) { console.error('Sugestões (rdos):', eR); return; }
      if (!rdos?.length) { if (vivo) setSugestoes([]); return; }
      const { data: acts, error: eA } = await supabase.from('atividades_rdo')
        .select('id,descricao,empreiteiro,ambiente,status,status_por_dia,dias_semana')
        .in('rdo_id', rdos.map(r => r.id)).order('created_at');
      if (eA) { console.error('Sugestões (atividades):', eA); return; }
      if (!vivo) return;
      setSugestoes(sugestoesDaSemana(acts));
    })();
    return () => { vivo = false; };
  }, [mondayISO]);

  const update = (key, patch) => setRows(rs => {
    const novas = rs.map(r => r.key === key ? { ...r, ...patch } : r);
    // digitou na última linha? já abre a próxima, sem precisar clicar em "adicionar"
    const ultima = novas[novas.length - 1];
    return ultima.desc.trim() ? [...novas, newRow(ultima)] : novas;
  });
  // Mesma descrição, mesmo ambiente, mesmos dias — troca só a empresa. É o
  // caso mais comum ao dividir uma frente entre dois empreiteiros.
  const duplicar = (key) => setRows(rs => {
    const i = rs.findIndex(r => r.key === key);
    if (i < 0) return rs;
    return [...rs.slice(0, i + 1), { ...rs[i], key: uid() }, ...rs.slice(i + 1)];
  });
  const toggleDia = (key, d) => setRows(rs => rs.map(r => r.key === key
    ? { ...r, dias: r.dias.includes(d) ? r.dias.filter(x => x !== d) : [...r.dias, d] } : r));
  const toggleUteis = (key) => setRows(rs => rs.map(r => r.key === key
    ? { ...r, dias: UTEIS.every(d => r.dias.includes(d)) ? [] : [...UTEIS] } : r));
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : [newRow()]);

  // ── Colar da planilha do Excel ──────────────────────────────────────────
  // A planilha planeja por semana e não tem coluna de dia, então tudo entra
  // marcado de segunda a sexta e o ajuste fino fica com quem planeja.
  const [colarAberto, setColarAberto] = useState(false);
  const [textoColado, setTextoColado] = useState('');
  const [resumoImport, setResumoImport] = useState('');

  const acharPorNome = (lista, nome) => nome
    ? lista.find(x => normalizar(x.nome) === normalizar(nome))
    : undefined;

  const importarPlanilha = () => {
    const itens = parsePlanilhaSemanal(textoColado);
    if (itens.length === 0) {
      setResumoImport('Não achei atividades. Selecione também a linha de títulos (FORNECEDOR / ATIVIDADE / AMBIENTE).');
      return;
    }
    const novas = itens.map(it => ({
      key: uid(),
      desc: it.atividade,
      dias: [...UTEIS],
      empId: String(acharPorNome(empreiteiros, it.fornecedor)?.id ?? ''),
      ambNome: acharPorNome(ambientes, it.ambiente)?.nome || '',
    }));
    const semEmpresa  = itens.filter(it => it.fornecedor && !acharPorNome(empreiteiros, it.fornecedor)).length;
    const semAmbiente = itens.filter(it => it.ambiente   && !acharPorNome(ambientes, it.ambiente)).length;
    const pendencias = [
      semEmpresa  ? `${semEmpresa} sem empresa no cadastro`   : '',
      semAmbiente ? `${semAmbiente} sem ambiente no cadastro` : '',
    ].filter(Boolean).join(' · ');

    setRows(rs => [...rs.filter(r => r.desc.trim()), ...novas, newRow(novas[novas.length - 1])]);
    setResumoImport(`${novas.length} atividade${novas.length !== 1 ? 's' : ''} de seg a sex${pendencias ? ' — ' + pendencias : ''}`);
    setTextoColado('');
    setColarAberto(false);
  };

  const resolveEmpId = (nome) => { const e = empreiteiros.find(x => x.nome === nome); return e ? String(e.id) : ''; };
  const isSugChecked = (s) => rows.some(r => r.sugKey === s.key);
  const toggleSug = (s) => setRows(rs => {
    if (rs.some(r => r.sugKey === s.key)) return rs.filter(r => r.sugKey !== s.key);
    const vazias = rs.filter(r => !r.desc.trim());
    const cheias = rs.filter(r => r.desc.trim());
    const nova = { key: uid(), sugKey: s.key, desc: s.desc || '', dias: [], empId: resolveEmpId(s.empreiteiro), ambNome: s.ambiente || '', cronId: null };
    return [...cheias, nova, ...(vazias.length ? [vazias[vazias.length - 1]] : [newRow()])];
  });

  const validRows = rows.filter(r => r.desc.trim() && r.dias.length > 0);
  const semDia = rows.filter(r => r.desc.trim() && r.dias.length === 0).length;

  // Exporta no mesmo vocabulário que o importador lê, para o ciclo fechar:
  // colo da planilha aqui, ajusto, e devolvo para lá sem redigitar.
  const [copiado, setCopiado] = useState(false);
  const copiarParaPlanilha = async () => {
    if (validRows.length === 0) return;
    // Mesma função do botão "Copiar semana" da tela: um formato só, senão os
    // dois divergem e o que cola bonito num lugar sai torto no outro.
    const tsv = paraPlanilhaSemanal(validRows.map(r => ({
      descricao:   r.desc,
      empreiteiro: empreiteiros.find(e => String(e.id) === String(r.empId))?.nome || '',
      ambiente:    r.ambNome || '',
      dias_semana: r.dias,
    })));
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      window.alert('Não consegui usar a área de transferência. Copie manualmente:\n\n' + tsv);
    }
  };

  const salvar = async () => {
    if (validRows.length === 0) return;
    setSaving(true);
    try {
      const mondayStr = toISODate(weekDates[0]);
      let { data: rdo, error: eSel } = await supabase.from('rdos').select('id').eq('data', mondayStr).maybeSingle();
      if (eSel) throw eSel;
      if (!rdo) {
        const { data, error: eIns } = await supabase.from('rdos')
          .upsert({ data: mondayStr }, { onConflict: 'obra_id,data' }).select().single();
        if (eIns) throw eIns;
        rdo = data;
      }
      const payload = validRows.map(r => ({
        rdo_id: rdo.id,
        descricao: r.desc.trim(),
        ambiente: r.ambNome || null,
        empreiteiro: empreiteiros.find(e => String(e.id) === String(r.empId))?.nome || null,
        dias_semana: r.dias,
        cronograma_item_id: r.cronId || null,
      }));
      const { error } = await supabase.from('atividades_rdo').insert(payload);
      if (error) throw error;
      onClose(weekOff);
    } catch (e) {
      console.error('Erro ao planejar semana:', e?.message || e);
      avisarErro(e, 'salvar');
      setSaving(false);
    }
  };

  // Campo afundado no fundo, não uma caixa branca sobre fundo branco: o painel
  // inteiro era claro e não dava para ver onde começava o lugar de escrever.
  const IPT = {
    height: 38, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)',
    padding: '0 10px', fontSize: 13, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.07)',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      {/* 1080 e não 720: com cinco colunas de dias mais fornecedor e ambiente,
          720px espremia tudo — no desktop há tela de sobra. */}
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 1080, maxHeight: '94dvh', background: 'var(--surface)',
        borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Cabeçalho */}
        <div style={{ padding: '16px 18px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)' }}>Planejar a semana</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>
                Descreva, marque os dias e pronto — a próxima linha abre sozinha.
              </div>
            </div>
            <button onClick={() => setWeekOff(w => w - 1)} style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14 }}>{Icon.back}</span>
            </button>
            <div style={{ textAlign: 'center', minWidth: 108, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
              <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                {weekOff === 0 ? 'Esta semana' : weekOff === 1 ? 'Próxima' : weekOff > 0 ? `Em ${weekOff} semanas` : `${-weekOff} atrás`}
              </div>
            </div>
            <button onClick={() => setWeekOff(w => w + 1)} style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14 }}>{Icon.chevR}</span>
            </button>
          </div>

          {/* Colar direto do Excel: seleciona na planilha, Ctrl+C, cola aqui */}
          <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setColarAberto(v => !v)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit',
              height: 30, padding: '0 11px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              background: colarAberto ? 'var(--primary)' : 'var(--surface-2)',
              color: colarAberto ? '#fff' : 'var(--text-2)',
              border: colarAberto ? 'none' : '1px solid var(--border)',
            }}>
              <span style={{ width: 13, height: 13 }}>{Icon.clipboard}</span>
              {colarAberto ? 'Fechar' : 'Colar da planilha'}
            </button>

            {/* O caminho de volta: o que está montado aqui vai para o Excel no
                formato das colunas da planilha (FORNECEDOR / ATIVIDADE / AMBIENTE),
                separado por tabulação — cola direto na célula. */}
            <button onClick={copiarParaPlanilha} disabled={validRows.length === 0} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
              height: 30, padding: '0 11px', borderRadius: 999, fontSize: 12, fontWeight: 700,
              cursor: validRows.length ? 'pointer' : 'default',
              background: copiado ? 'var(--success, #16A34A)' : 'var(--surface-2)',
              color: copiado ? '#fff' : validRows.length ? 'var(--text-2)' : 'var(--text-3)',
              border: copiado ? 'none' : '1px solid var(--border)',
            }}>
              <span style={{ width: 13, height: 13 }}>{Icon.clipboard}</span>
              {copiado ? '✓ copiado' : 'Copiar para a planilha'}
            </button>

            {resumoImport && (
              <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 600 }}>{resumoImport}</span>
            )}
          </div>

          {colarAberto && (
            <div style={{ marginTop: 8 }}>
              <textarea
                value={textoColado}
                onChange={e => setTextoColado(e.target.value)}
                placeholder={'Na planilha, selecione as linhas COM a linha de títulos (FORNECEDOR / ATIVIDADE / AMBIENTE), Ctrl+C, e cole aqui.'}
                style={{ ...IPT, width: '100%', height: 90, padding: '8px 10px', lineHeight: 1.4, resize: 'vertical' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <button className="btn btn-primary btn-sm" disabled={!textoColado.trim()} onClick={importarPlanilha}>
                  Importar
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  Entram de segunda a sexta — depois é só ajustar os dias de cada uma.
                </span>
              </div>
            </div>
          )}

          {/* Trazer o que não foi concluído — o caminho mais rápido de todos */}
          {sugestoes.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.07em', marginBottom: 6 }}>
                TRAZER DA SEMANA ANTERIOR
              </div>
              {/* Sem altura máxima de propósito: com scroll interno, metade das
                  sugestões ficava escondida e parecia que a semana anterior
                  tinha menos pendência do que tinha. O popup tem espaço. */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {sugestoes.map(s => {
                  const checked = isSugChecked(s);
                  return (
                    <button key={s.key} onClick={() => toggleSug(s)} title={[s.empreiteiro, s.ambiente].filter(Boolean).join(' · ')} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontFamily: 'inherit',
                      padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, maxWidth: 240,
                      background: checked ? 'var(--primary)' : 'var(--surface-2)',
                      color: checked ? '#fff' : 'var(--text-2)',
                      border: checked ? 'none' : '1px solid var(--border)',
                    }}>
                      <span style={{ fontSize: 13, lineHeight: 1 }}>{checked ? '✓' : '+'}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc || 'Atividade'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Linhas */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {rows.map((r, idx) => {
            const cor = empreiteiros.find(e => String(e.id) === String(r.empId))?.cor || 'var(--primary)';
            const preenchida = !!r.desc.trim();
            const todosUteis = UTEIS.every(d => r.dias.includes(d));
            return (
              <div key={r.key} style={{
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                margin: '6px 12px', padding: '9px 10px', borderRadius: 12,
                border: '1px solid var(--border)',
                // A linha preenchida sobe do fundo; a vazia fica rente, para a
                // próxima a digitar não competir com as que já estão prontas.
                background: preenchida && r.dias.length === 0 ? 'var(--warn-tint)'
                          : preenchida ? 'var(--surface)' : 'var(--surface-2)',
                boxShadow: preenchida ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
                <input
                  value={r.desc}
                  onChange={e => update(r.key, { desc: e.target.value })}
                  placeholder={idx === 0 ? 'Descrição da atividade…' : 'Mais uma…'}
                  style={{ ...IPT, flex: 1, minWidth: 150 }}
                />

                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  {DAYS.map((d, di) => {
                    const sel = r.dias.includes(d);
                    return (
                      <button key={d} onClick={() => toggleDia(r.key, d)} title={d} style={{
                        width: 26, height: 30, borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 11, fontWeight: 800, padding: 0,
                        background: sel ? cor : 'var(--surface-2)',
                        color: sel ? '#fff' : 'var(--text-3)',
                        border: sel ? 'none' : '1px solid var(--border)',
                        opacity: di === 5 ? 0.85 : 1,
                      }}>{DAY_LABEL[d]}</button>
                    );
                  })}
                  <button onClick={() => toggleUteis(r.key)} title="Segunda a sexta" style={{
                    height: 30, padding: '0 8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 10.5, fontWeight: 800, marginLeft: 2,
                    background: todosUteis ? cor : 'var(--surface-2)',
                    color: todosUteis ? '#fff' : 'var(--text-3)',
                    border: todosUteis ? 'none' : '1px solid var(--border)',
                  }}>úteis</button>
                </div>

                <select value={r.empId} onChange={e => update(r.key, { empId: e.target.value })}
                  style={{ ...IPT, width: 112, flexShrink: 0 }}>
                  <option value="">Empresa…</option>
                  {empreiteiros.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>

                <SeletorAmbiente
                  ambientes={ambientes}
                  valor={r.ambNome}
                  onChange={(v) => update(r.key, { ambNome: v })}
                  estilo={{ ...IPT, width: 106, flexShrink: 0 }}
                  compacto
                />

                {/* Apropriação no cronograma: é aqui que a tarefa da semana vira
                    avanço do item da obra. Só aparece com a descrição digitada,
                    para a linha vazia não virar um paredão de campos. */}
                {preenchida && itensCron.length > 0 && (() => {
                  const sug = r.cronId ? null : sugerirItem(r.desc, itensCron);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                      <select value={r.cronId || ''} onChange={e => update(r.key, { cronId: e.target.value || null })}
                        title="Vincular a um item do cronograma"
                        style={{ ...IPT, width: 150, borderColor: r.cronId ? 'var(--primary)' : 'var(--border)',
                                 color: r.cronId ? 'var(--primary)' : 'var(--text-3)', fontWeight: r.cronId ? 700 : 400 }}>
                        <option value="">Cronograma…</option>
                        {itensCron.map(i => (
                          <option key={i.id} value={i.id}>{i.wbs_id} · {i.nome}{i.concluido ? ' (concluído)' : ''}</option>
                        ))}
                      </select>
                      {sug && (
                        <button onClick={() => update(r.key, { cronId: sug.id })}
                          title={'Vincular a: ' + sug.nome}
                          style={{ height: 30, padding: '0 8px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                                   fontSize: 11, fontWeight: 800, border: '1.5px dashed var(--primary)',
                                   background: 'var(--primary-tint)', color: 'var(--primary)', flexShrink: 0 }}>
                          💡 {sug.nome.length > 18 ? sug.nome.slice(0, 18) + '…' : sug.nome}
                        </button>
                      )}
                    </div>
                  );
                })()}

                {preenchida && (
                  <button onClick={() => duplicar(r.key)} title="Duplicar esta linha (para trocar só a empresa)"
                    style={{ width: 28, height: 30, flexShrink: 0, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>⧉</button>
                )}
                <button onClick={() => removeRow(r.key)} title="Remover"
                  style={{ width: 28, height: 30, flexShrink: 0, border: 0, borderRadius: 7, background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: semDia > 0 ? 'var(--warn,#CA8A04)' : 'var(--text-3)' }}>
            {semDia > 0
              ? `${semDia} sem dia marcado — não ${semDia === 1 ? 'será salva' : 'serão salvas'}`
              : validRows.length === 0 ? 'Nada preenchido ainda'
              : `${validRows.length} atividade${validRows.length !== 1 ? 's' : ''} pronta${validRows.length !== 1 ? 's' : ''}`}
          </span>
          <button onClick={() => onClose(null)} style={{
            height: 44, padding: '0 16px', borderRadius: 11, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button onClick={salvar} disabled={validRows.length === 0 || saving} style={{
            height: 44, padding: '0 20px', borderRadius: 11, border: 'none',
            background: validRows.length && !saving ? 'var(--primary)' : 'var(--border)',
            color: '#fff', fontSize: 14, fontWeight: 800, cursor: validRows.length ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>{saving ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

export function NovaAtividadeSheet({ onClose, initialData, targetDate }) {
  const { ambientes, empreiteiros } = useObra();
  const isEditing = !!(initialData?.id);

  // Create wizard state
  const [step, setStep]       = useState(1);
  const [openPavs, setOpenPavs] = useState({});

  // Shared form fields
  const [ambNome, setAmbNome] = useState(isEditing ? (initialData?.ambiente || '') : '');
  const [empId, setEmpId]     = useState(() =>
    isEditing ? (empreiteiros.find(e => e.nome === initialData?.empreiteiro)?.id ?? null) : null
  );
  const [desc, setDesc]       = useState(isEditing ? (initialData?.descricao || '') : '');
  const [dias, setDias]       = useState(isEditing ? (initialData?.dias_semana || []) : []);
  const [saving, setSaving]   = useState(false);

  // Vínculo com o cronograma
  const [itensCron, setItensCron] = useState([]);
  const [cronId, setCronId]       = useState(isEditing ? (initialData?.cronograma_item_id || null) : null);
  useEffect(() => { listarItensVinculaveis().then(setItensCron); }, []);
  const sugestao = useMemo(
    () => (cronId ? null : sugerirItem(desc, itensCron)),
    [desc, itensCron, cronId]
  );

  const toggleDia = (d) => setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  const togglePav = (pav) => setOpenPavs(prev => ({ ...prev, [pav]: !prev[pav] }));
  const empColor  = (id) => empreiteiros.find(e => e.id === id)?.cor || '#888888';
  const empLabel  = (id) => empreiteiros.find(e => e.id === id)?.nome || '';

  // Grouped ambientes for accordion
  const grupos = PAV_ORDEM.map(pav => ({
    pav,
    items: ambientes.filter(a => (a.pavimento || '') === pav).sort((a, b) => a.nome.localeCompare(b.nome)),
  })).filter(g => g.items.length > 0);
  const semPav = ambientes
    .filter(a => !a.pavimento || !PAV_ORDEM.includes(a.pavimento))
    .sort((a, b) => a.nome.localeCompare(b.nome));

  const save = async () => {
    if (!desc.trim()) return;
    setSaving(true);
    let ok = true;
    try {
      const payload = {
        descricao:   desc.trim(),
        ambiente:    ambNome || null,
        empreiteiro: empLabel(empId) || null,
        dias_semana: dias,
        cronograma_item_id: cronId || null,
      };
      if (isEditing) {
        const { error } = await supabase.from('atividades_rdo').update(payload).eq('id', initialData.id);
        if (error) throw error;
      } else {
        const dateToUse = targetDate || hojeLocal();
        let { data: rdo, error: eSel } = await supabase.from('rdos').select('id').eq('data', dateToUse).maybeSingle();
        if (eSel) throw eSel;
        if (!rdo) {
          const { data, error: eIns } = await supabase.from('rdos').insert({ data: dateToUse }).select().single();
          if (eIns) throw eIns;
          rdo = data;
        }
        if (rdo) {
          const { error: eAt } = await supabase.from('atividades_rdo').insert({ rdo_id: rdo.id, ...payload });
          if (eAt) throw eAt;
        }
      }
    } catch (e) {
      ok = false;
      console.error('Erro ao salvar atividade:', e?.message || e);
      avisarErro(e, 'salvar a atividade');
    }
    setSaving(false);
    onClose(ok);
  };

  if (isEditing) {
    const cor = empColor(empId);
    return (
      <>
        <div className="t-h2" style={{ textAlign: 'center' }}>Editar atividade</div>
        <div className="stack stack-3" style={{ marginTop: 8 }}>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>DESCRIÇÃO</div>
            <input className="ipt" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Ex: 2a demao de pintura" style={{ fontSize: 15, height: 52 }} />
          </div>
          <SeletorCronograma itens={itensCron} valor={cronId} onChange={setCronId} sugestao={sugestao} />
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>PAVIMENTO E AMBIENTE</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <SeletorAmbiente
                ambientes={ambientes}
                valor={ambNome}
                onChange={setAmbNome}
                estilo={{ flex: 1, minWidth: 0, height: 52, borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface-2)', padding: '0 10px', fontSize: 14, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' }}
              />
            </div>
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>EMPREITEIRO / FORNECEDOR</div>
            <div className="stack stack-1">
              {empreiteiros.map(e => {
                const sel = empId === e.id;
                return (
                  <button key={e.id} className="row tap"
                    onClick={() => setEmpId(sel ? null : e.id)}
                    style={{ background: sel ? e.cor + '18' : 'var(--surface)', border: sel ? `1.5px solid ${e.cor}` : '0.5px solid var(--border)', cursor: 'pointer' }}>
                    <div className="dot" style={{ background: e.cor }} />
                    <div style={{ flex: 1 }} className="t-strong">{e.nome}</div>
                    {sel && <span style={{ width: 16, height: 16, color: e.cor }}>{Icon.check}</span>}
                  </button>
                );
              })}
              <button className="row tap" onClick={() => setEmpId(null)}
                style={{ background: empId === null ? 'var(--surface-2)' : 'var(--surface)', opacity: 0.65, cursor: 'pointer' }}>
                <div className="dot" style={{ background: '#888' }} />
                <div style={{ flex: 1 }} className="t-strong">Sem fornecedor</div>
                {empId === null && <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.check}</span>}
              </button>
            </div>
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>DIAS DA SEMANA</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {DIAS_LIST.map(d => {
                const sel = dias.includes(d);
                return (
                  <button key={d} onClick={() => toggleDia(d)} style={{
                    padding: '7px 13px', borderRadius: 999, fontSize: 13, fontWeight: 700,
                    background: sel ? cor : 'var(--surface)',
                    color: sel ? 'white' : 'var(--text-3)',
                    border: sel ? 'none' : '0.5px solid var(--border)',
                    cursor: 'pointer',
                  }}>{DIAS_LABELS_MAP[d]}</button>
                );
              })}
            </div>
            {dias.length === 0 && (
              <div className="t-caption" style={{ marginTop: 6, color: 'var(--text-3)' }}>Sem dia fixo (atividade avulsa)</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => onClose(false)}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!desc.trim() || saving} onClick={save}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="t-h2" style={{ textAlign: 'center' }}>Nova atividade</div>
      <div className="t-caption" style={{ textAlign: 'center', marginBottom: 8 }}>Etapa {step} de 4</div>
      {step === 1 && (
        <>
          <div className="t-micro" style={{ marginBottom: 8 }}>AMBIENTE</div>
          {ambientes.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '20px 12px' }}>
              <div className="t-strong">Nenhum ambiente cadastrado</div>
              <div className="t-caption" style={{ marginTop: 4 }}>Cadastre em Mais - Cadastros base.</div>
            </div>
          ) : (
            <div className="stack stack-2">
              {grupos.map(({ pav, items }) => {
                const isOpen = !!openPavs[pav];
                const col = PAV_COL[pav] || '#888';
                return (
                  <div key={pav}>
                    <button onClick={() => togglePav(pav)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 12px', borderRadius: isOpen ? '10px 10px 0 0' : 10,
                      border: 'none', cursor: 'pointer',
                      background: isOpen ? col + '18' : 'var(--surface)',
                      borderBottom: isOpen ? `2px solid ${col}` : '0.5px solid var(--border)',
                    }}>
                      <div style={{ width: 9, height: 9, borderRadius: 999, background: col, flexShrink: 0 }} />
                      <div style={{ flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 800, color: col, letterSpacing: '0.05em' }}>
                        {pav.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 11, color: col, opacity: 0.75, fontWeight: 600 }}>{items.length}</div>
                      <span style={{ width: 14, height: 14, color: col, transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'flex', alignItems: 'center' }}>{Icon.chevR}</span>
                    </button>
                    {isOpen && (
                      <div className="stack stack-1" style={{ paddingLeft: 4, background: col + '08', borderRadius: '0 0 10px 10px', padding: '6px 4px 4px' }}>
                        {items.map(a => (
                          <button key={a.id} className="row tap"
                            onClick={() => { setAmbNome(a.nome); setStep(2); }}
                            style={{ background: 'var(--surface)', cursor: 'pointer' }}>
                            <span style={{ width: 16, height: 16, color: col, opacity: 0.7 }}>{Icon.pin}</span>
                            <div style={{ flex: 1 }} className="t-strong">{a.nome}</div>
                            <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {semPav.length > 0 && (
                <div className="stack stack-1">
                  {semPav.map(a => (
                    <button key={a.id} className="row tap"
                      onClick={() => { setAmbNome(a.nome); setStep(2); }}
                      style={{ background: 'var(--surface)', cursor: 'pointer' }}>
                      <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.pin}</span>
                      <div style={{ flex: 1 }} className="t-strong">{a.nome}</div>
                      <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                    </button>
                  ))}
                </div>
              )}
              <button className="row tap" onClick={() => { setAmbNome(''); setStep(2); }}
                style={{ background: 'var(--surface)', cursor: 'pointer', opacity: 0.55 }}>
                <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.pin}</span>
                <div style={{ flex: 1 }} className="t-strong">Sem ambiente especifico</div>
                <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
              </button>
            </div>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <div className="t-micro" style={{ marginBottom: 8 }}>EMPREITEIRO / RESPONSÁVEL</div>
          <div className="stack stack-1">
            {empreiteiros.map(e => (
              <button key={e.id} className="row tap" onClick={() => { setEmpId(e.id); setStep(3); }}
                style={{ background: 'var(--surface)', cursor: 'pointer' }}>
                <div className="dot" style={{ background: e.cor }} />
                <div style={{ flex: 1 }} className="t-strong">{e.nome}</div>
                <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
              </button>
            ))}
            <button className="row tap" onClick={() => { setEmpId(null); setStep(3); }}
              style={{ background: 'var(--surface)', cursor: 'pointer', opacity: 0.6 }}>
              <div className="dot" style={{ background: '#888' }} />
              <div style={{ flex: 1 }} className="t-strong">Sem empreiteiro especifico</div>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
            </button>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, paddingLeft: 0 }} onClick={() => setStep(1)}>
            <span style={{ width: 14, height: 14 }}>{Icon.back}</span> Voltar
          </button>
        </>
      )}
      {step === 3 && (
        <>
          <div className="t-micro" style={{ marginBottom: 6 }}>DESCRIÇÃO DA TAREFA</div>
          <input className="ipt" placeholder="Ex: 2a demao de pintura" value={desc}
            onChange={e => setDesc(e.target.value)} autoFocus style={{ fontSize: 16, height: 52 }} />
          <div className="t-caption" style={{ marginTop: 8, color: 'var(--text-3)' }}>
            {ambNome && ('📍 ' + ambNome)}{ambNome && empLabel(empId) && ' · '}{empLabel(empId)}
          </div>
          <div style={{ marginTop: 14 }}>
            <SeletorCronograma itens={itensCron} valor={cronId} onChange={setCronId} sugestao={sugestao} />
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(2)}>Voltar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={!desc.trim()} onClick={() => setStep(4)}>
              Próximo
            </button>
          </div>
        </>
      )}
      {step === 4 && (
        <>
          <div className="t-micro" style={{ marginBottom: 6 }}>DIAS DA SEMANA</div>
          <div className="t-caption" style={{ marginBottom: 12, color: 'var(--text-3)' }}>
            Selecione os dias em que esta atividade ocorre (pode deixar em branco).
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {DIAS_LIST.map(d => {
              const sel = dias.includes(d);
              const col = empColor(empId);
              return (
                <button key={d} onClick={() => toggleDia(d)} style={{
                  padding: '9px 15px', borderRadius: 999, fontSize: 14, fontWeight: 700,
                  background: sel ? col : 'var(--surface)',
                  color: sel ? 'white' : 'var(--text-3)',
                  border: sel ? 'none' : '0.5px solid var(--border)',
                  cursor: 'pointer',
                }}>{DIAS_LABELS_MAP[d]}</button>
              );
            })}
          </div>
          {/* Sempre presente: se só aparecesse depois do 1º dia marcado, o modal
              cresceria e os botões fugiriam do dedo. */}
          <div className="t-caption" style={{ marginTop: 8, color: 'var(--text-3)' }}>
            {dias.length > 0 ? dias.map(d => DIAS_LABELS_MAP[d]).join(', ') : 'Sem dia fixo (atividade avulsa)'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setStep(3)}>Voltar</button>
            <button className="btn btn-primary" style={{ flex: 1 }} disabled={saving} onClick={save}>
              {saving ? 'Salvando...' : 'Adicionar'}
            </button>
          </div>
          {!saving && (
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 6, width: '100%', color: 'var(--text-3)' }} onClick={save}>
              Pular e adicionar sem dias
            </button>
          )}
        </>
      )}
    </>
  );
}


export function EngRelatorios({ goto }) {
  // O botão "Excel" que ficava aqui era teatro: mostrava "Excel gerado ✓"
  // sem gerar arquivo nenhum. Saiu até existir exportação de verdade
  // (o padrão real está em projetos.jsx, com planilhaHTML de exportar-excel).
  return (
    <div className="page">
      <PageHeader eyebrow="EXPORTAR" title="Relatórios" />
      <div className="page-pad stack stack-3">
        <div className="card-tint" style={{ background: 'var(--primary-tint-strong)', padding: 16 }}>
          <div className="t-h2">Relatório da obra</div>
          <div className="t-caption" style={{ marginTop: 5, lineHeight: 1.55 }}>
            Aqui você monta o relatório com os módulos que quiser — RDO, efetivo,
            pendências, equipamentos, visitas e contratações — escolhe o
            período e imprime ou salva em PDF na próxima tela.
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }}
            onClick={() => goto('relatorio-pdf')}>
            <span style={{ width: 18, height: 18 }}>{Icon.pdf}</span>Montar relatório
          </button>
        </div>
      </div>
    </div>
  );
}

export function EngTodos({ goto }) {
  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('mais')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <PageHeader eyebrow="PESSOAL" title="Meus to-dos" />
      <div className="page-pad">
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 999, margin: '0 auto 14px', background: 'var(--surface-2)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 28, height: 28 }}>{Icon.clipboard}</span>
          </div>
          <div className="t-strong" style={{ fontSize: 16 }}>Em breve</div>
          <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.5 }}>O modulo de to-dos pessoais esta em desenvolvimento.</div>
        </div>
      </div>
    </div>
  );
}

export function EngRDOReview({ goto }) {
  const [rdo, setRdo] = useState(null);
  const [atividades, setAtividades] = useState([]);
  const [workers, setWorkers] = useState([]); // efetivo_draft (rico) ou efetivo_rdo (fallback)
  const [loading, setLoading] = useState(true);


  async function loadRDO() {
    const { data: rdoData } = await supabase
      .from('rdos').select('*').eq('submetido', true)
      .order('data', { ascending: false }).limit(1).maybeSingle();
    if (!rdoData) { setLoading(false); return; }
    setRdo(rdoData);

    const { data: at } = await supabase.from('atividades_rdo').select('*').eq('rdo_id', rdoData.id);
    setAtividades(at || []);

    // Prefere efetivo_draft (mantido após submit) — fallback para efetivo_rdo
    const draft = rdoData.efetivo_draft;
    if (draft && draft.length > 0) {
      setWorkers(draft);
    } else {
      const { data: ef } = await supabase.from('efetivo_rdo').select('*').eq('rdo_id', rdoData.id);
      // Normaliza efetivo_rdo para formato parecido com draft
      setWorkers((ef || []).map(r => ({
        id: r.id, nome: r.colaborador_nome,
        empresa_nome: r.empreiteiro,
        atividade_livre: r.atividade_descricao,
        extras: [],
      })));
    }
    setLoading(false);
  }
  useEffect(() => { loadRDO(); }, []);

  // Conta status das atividades usando as chaves corretas
  const counts = { feita: 0, em_andamento: 0, nao_feita: 0 };
  atividades.forEach(a => {
    const s = a.status || '';
    if (s === 'feita') counts.feita++;
    else if (s === 'em_andamento' || s === 'parcial') counts.em_andamento++;
    else if (s === 'nao_feita' || s === 'naofeita' || s === 'nao_executada') counts.nao_feita++;
  });

  // Agrupa workers por empresa
  const byEmp = {};
  workers.forEach(w => {
    const key = w.empresa_nome || 'ADM própria';
    if (!byEmp[key]) byEmp[key] = [];
    byEmp[key].push(w);
  });

  // Helper: pega todas as atividades de um worker (principal + extras)
  function workerActivities(w) {
    const main = w.atividade_livre || atividades.find(a => a.id === w.atividade_id)?.descricao;
    const extras = (w.extras || []).map(e => e.atividade_livre || atividades.find(a => a.id === e.atividade_id)?.descricao).filter(Boolean);
    return [main, ...extras].filter(Boolean);
  }

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('home')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => goto('rdo-historico')}>
          Histórico
        </button>
      </div>
      <PageHeader eyebrow="DIÁRIO RECEBIDO"
        title={rdo ? new Date(rdo.data + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' }) : 'Carregando...'}
        sub={rdo ? `Enviado por ${rdo.submetido_por_nome || 'mestre'} · ${atividades.length} atividades · ${workers.length} colaboradores` : ''} />
      {loading && <div className="page-pad"><div className="t-caption" style={{ textAlign: 'center', padding: 20 }}>Carregando...</div></div>}
      {!loading && !rdo && (
        <div className="page-pad">
          <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div className="t-strong">Nenhum diário enviado ainda</div>
            <div className="t-caption" style={{ marginTop: 6 }}>O mestre ainda não enviou nenhum RDO.</div>
          </div>
        </div>
      )}
      {!loading && rdo && (
        <div className="page-pad stack stack-3">

          {/* Resumo de atividades */}
          <div className="card">
            <div className="t-micro" style={{ marginBottom: 10 }}>ATIVIDADES</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {[
                ['feita',       'Feitas',      'var(--success)'],
                ['em_andamento','Em andamento','var(--warn)'],
                ['nao_feita',   'Não feitas',  'var(--danger)'],
              ].map(([k,l,c]) => (
                <div key={k} style={{ textAlign: 'center', background: c + '14', borderRadius: 10, padding: '10px 4px' }}>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c }}>{counts[k]}</div>
                  <div className="t-caption" style={{ color: c, fontWeight: 700 }}>{l}</div>
                </div>
              ))}
            </div>
            <div className="divider" />
            <div className="row-between">
              <div className="t-2">Colaboradores no canteiro</div>
              <div className="t-strong">{workers.length}</div>
            </div>
          </div>

          {/* Lista de colaboradores agrupados por empresa */}
          {Object.keys(byEmp).length > 0 && (
            <div>
              <div className="t-micro" style={{ marginBottom: 8 }}>EFETIVO DO DIA</div>
              <div className="card" style={{ padding: 0 }}>
                {Object.entries(byEmp).map(([emp, list], gi) => (
                  <div key={emp}>
                    {/* Cabeçalho empresa */}
                    <div style={{
                      padding: '8px 14px', borderTop: gi === 0 ? 'none' : '0.5px solid var(--divider)',
                      background: 'var(--surface-2)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                        {emp.toUpperCase()}
                      </div>
                      <div className="t-caption" style={{ opacity: 0.6 }}>· {list.length}</div>
                    </div>
                    {list.map((w, i) => {
                      const acts = workerActivities(w);
                      return (
                        <div key={w.id || i} style={{
                          padding: '10px 14px',
                          borderTop: '0.5px solid var(--divider)',
                          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8,
                        }}>
                          <div style={{ minWidth: 0 }}>
                            <div className="t-strong" style={{ fontSize: 13 }}>{w.nome}</div>
                            {acts.length > 0
                              ? acts.map((act, ai) => (
                                  <div key={ai} className="t-caption" style={{ fontSize: 11, marginTop: 2 }}>
                                    📋 {act}
                                  </div>
                                ))
                              : <div className="t-caption" style={{ fontSize: 11, marginTop: 2, color: 'var(--text-3)' }}>Sem atividade atribuída</div>
                            }
                          </div>
                          {w.is_adm && (
                            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-3)', flexShrink: 0 }}>ADM</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lista de atividades */}
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>ATIVIDADES</div>
            <div className="stack stack-2">
              {atividades.map(a => (
                <div key={a.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'stretch' }}>
                    <div style={{ width: 4, flexShrink: 0, borderRadius: '12px 0 0 12px',
                      background: a.status === 'feita' ? 'var(--success)' : a.status === 'em_andamento' || a.status === 'parcial' ? 'var(--warn)' : a.status === 'nao_feita' ? 'var(--danger)' : 'var(--border)' }} />
                    <div style={{ flex: 1, padding: '10px 12px' }}>
                      <div className="row-between">
                        <div className="t-caption" style={{ fontSize: 11 }}>{a.ambiente || '—'}</div>
                        {/* O RDO é de UM dia: numa atividade da semana o status vai
                            para status_por_dia daquele dia — sem o dayKey, revisar o
                            RDO de segunda carimbava a semana inteira. */}
                        <StatusPickerChip status={a.status || 'pendente'} activityId={a.id}
                          dayKey={(a.dias_semana || []).length > 0 && rdo?.data
                            ? chaveDoDia(rdo.data)
                            : undefined}
                          statusPorDia={a.status_por_dia} diasSemana={a.dias_semana}
                          onUpdated={(id, s, map, dias) => setAtividades(prev => prev.map(x => x.id === id
                            ? { ...x, ...(map ? { status_por_dia: map } : { status: s }), ...(dias ? { dias_semana: dias } : {}) } : x))} />
                      </div>
                      <div className="t-strong" style={{ fontSize: 14, marginTop: 2 }}>{a.descricao}</div>
                      {a.empreiteiro && (
                        <div className="t-caption" style={{ fontSize: 11, marginTop: 3 }}>{a.empreiteiro}</div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {atividades.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                  <div className="t-caption">Nenhuma atividade registrada.</div>
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

// ── EngEfetivo: wrapper para tela de efetivo do engenheiro ───────────────────
export function EngEfetivo({ goto }) {
  const [workers, setWorkers] = useState([]);
  const [loading, setLoading] = useState(true);
  const todayStr = hojeLocal();

  useEffect(() => {
    (async () => {
      const { data: rdo } = await supabase.from('rdos').select('id, efetivo_draft').eq('data', todayStr).maybeSingle();
      if (!rdo) { setLoading(false); return; }
      const draft = rdo.efetivo_draft || [];
      if (draft.length > 0) { setWorkers(draft); setLoading(false); return; }
      const { data: ef } = await supabase.from('efetivo_rdo').select('*').eq('rdo_id', rdo.id);
      setWorkers((ef || []).map(r => ({ id: r.id, nome: r.colaborador_nome, empresa_nome: r.empreiteiro, atividade_livre: r.atividade_descricao, extras: [] })));
      setLoading(false);
    })();
  }, []);

  const total = workers.length;
  const byEmp = {};
  workers.forEach(w => {
    const key = w.empresa_nome || 'ADM Própria';
    if (!byEmp[key]) byEmp[key] = [];
    byEmp[key].push(w);
  });

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('home')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <PageHeader eyebrow="HOJE" title="Efetivo no canteiro" sub={loading ? 'Carregando…' : `${total} colaborador${total !== 1 ? 'es' : ''}`} />
      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}
      {!loading && total === 0 && (
        <div className="page-pad">
          <div className="card" style={{ textAlign: "center", padding: 28 }}>
            <div className="t-strong">Nenhum efetivo registrado</div>
            <div className="t-caption" style={{ marginTop: 4 }}>O mestre ainda não lançou o diário hoje.</div>
          </div>
        </div>
      )}
      {!loading && total > 0 && (
        <div className="page-pad stack stack-2">
          {Object.entries(byEmp).map(([emp, list]) => (
            <div key={emp} className="card" style={{ padding: '12px 14px' }}>
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div className="t-strong" style={{ fontSize: 14 }}>{emp}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>{list.length} pessoa{list.length !== 1 ? 's' : ''}</div>
              </div>
              {list.map(w => (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '0.5px solid var(--divider)' }}>
                  <Avatar name={w.nome} size={30} />
                  <div style={{ flex: 1 }}>
                    <div className="t-strong" style={{ fontSize: 13 }}>{w.nome}</div>
                    <div className="t-caption" style={{ fontSize: 11 }}>{w.funcao || ''}</div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
