import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { contem } from '../lib/busca';
import { Icon, PageHeader, StatChips } from '../components/index';
import { hojeLocal, addDaysISO, toISODate, diasRestantes as diasAteOPrazo } from '../lib/date';
import { simularAtraso } from '../lib/projetos-simulacao.js';
import { filtrarPorPeriodo, rotuloPeriodo } from '../lib/periodo-projetos.js';
import { paginaPDF, definirObra, obraAtual, logoAtual } from '../lib/pdf-cabecalho.js';
import { planilhaHTML, tomClaro } from '../lib/exportar-excel.js';
import { avisarErro, motivoAmigavel } from '../lib/msg-amigavel';

// ── Cores por situação ────────────────────────────────────────────────────────
// "Atrasado" saiu da lista de status: era o único que ninguém marcava na mão e que
// ficava errado sozinho. Agora é alerta calculado da data prevista (ver estaAtrasado).
const ST = {
  nao_iniciado: { label: 'Não iniciado', color: '#475569', bg: '#64748B', bgChip: '#94A3B8', border: 'rgba(100,116,139,0.18)', footerBg: 'rgba(100,116,139,0.06)' },
  em_andamento: { label: 'Em andamento', color: '#1565C0', bg: '#1565C0', bgChip: '#1976D2', border: 'rgba(21,101,192,0.18)',  footerBg: 'rgba(21,101,192,0.06)'  },
  recebido:     { label: 'Recebido',     color: '#14532D', bg: '#16A34A', bgChip: '#22C55E', border: 'rgba(22,163,74,0.20)',   footerBg: 'rgba(22,163,74,0.08)'   },
};
const COR_ATRASO = { color: '#92140E', bg: '#DC2626', bgChip: '#EF4444' };
const STATUS_ORDER = ['nao_iniciado', 'em_andamento', 'recebido'];
const DISCIPLINAS = ['Arquitetura', 'Estrutural', 'Elétrico', 'Hidrossanitário', 'Ar condicionado', 'Incêndio', 'SPDA', 'Outro'];

// Que tipo de entregável é. Vem da coluna "Etapa / Entregável" da planilha de
// controle — é o que distingue um básico de um executivo do mesmo projetista.
const ETAPAS = [
  { key: 'anteprojeto',  label: 'Anteprojeto',       cor: '#7C3AED' },
  { key: 'estudo',       label: 'Estudo preliminar', cor: '#7C3AED' },
  { key: 'basico',       label: 'Projeto básico',    cor: '#0891B2' },
  { key: 'preexecutivo', label: 'Pré-executivo',     cor: '#0369A1' },
  { key: 'executivo',    label: 'Projeto executivo', cor: '#1D4ED8' },
  { key: 'detalhamento', label: 'Detalhamento',      cor: '#4338CA' },
  { key: 'revisao',      label: 'Revisão',           cor: '#B45309' },
  { key: 'definicao',    label: 'Definição',         cor: '#BE185D' },
  { key: 'liberado',     label: 'Liberado p/ obra',  cor: '#15803D' },
];
const etapaDe = (k) => ETAPAS.find(e => e.key === k) || null;

function todayISO() { return hojeLocal(); }
function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}
function addDays(base, n) { return addDaysISO(base, n); }
function diasEntre(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}
// Compara DIA a DIA. A versão antiga media do meio-dia do prazo até o instante
// atual: de manhã, um projeto vencido ontem dava 0 ("vence hoje") e ficava fora
// da coluna "Atrasado" até as 12h.
function diasRestantes(prazo) { return diasAteOPrazo(prazo); }
function isRecebido(p) { return !!(p.data_recebida || p.status === 'recebido'); }

function situacao(p) {
  if (isRecebido(p)) return 'recebido';
  return p.status === 'em_andamento' ? 'em_andamento' : 'nao_iniciado';
}
// Atraso é derivado da data prevista, nunca gravado: assim não existe o estado
// "marcado como atrasado mas já entregue" que o modelo antigo permitia.
function estaAtrasado(p) {
  if (isRecebido(p)) return false;
  const d = diasRestantes(p.data_prevista);
  return d !== null && d < 0;
}

function diffLabel(p) {
  const diff = diasEntre(p.data_prevista, p.data_recebida);
  if (diff === null) return null;
  if (diff > 0)  return { txt: `${diff}d atrasado`,   color: 'var(--danger)' };
  if (diff < 0)  return { txt: `${Math.abs(diff)}d adiantado`, color: 'var(--success, #16A34A)' };
  return { txt: 'no prazo', color: 'var(--success, #16A34A)' };
}

function fimPrevisto(p) {
  if (p.data_inicio && p.duracao_dias) return addDays(p.data_inicio, Number(p.duracao_dias));
  return null;
}

// Ordena por vencimento mais próximo → mais distante (recebidos: mais recente primeiro)
function ordenarVenc(list) {
  return [...list].sort((a, b) => {
    if (isRecebido(a) && isRecebido(b)) return (b.data_recebida || '').localeCompare(a.data_recebida || '');
    const pa = a.data_prevista, pb = b.data_prevista;
    if (!pa && !pb) return 0;
    if (!pa) return 1;
    if (!pb) return -1;
    return pa.localeCompare(pb);
  });
}

// ── Motor de alertas ──────────────────────────────────────────────────────────
function makeEmRisco(byId, predsDe) {
  const memo = {};
  function f(p) {
    if (!p) return false;
    if (memo[p.id] !== undefined) return memo[p.id];
    memo[p.id] = false;                       // trava o ciclo antes de descer
    if (isRecebido(p)) return (memo[p.id] = false);
    if (estaAtrasado(p)) return (memo[p.id] = true);
    const r = predsDe(p.id).some(pred => !isRecebido(pred) && f(pred));
    return (memo[p.id] = r);
  }
  return f;
}

function alertasDe(p, ctx) {
  const out = [];
  if (isRecebido(p)) return out;
  if (estaAtrasado(p)) out.push({ key: 'atrasado', label: 'Atrasado', color: '#DC2626' });
  // Sem data prevista não dá pra cobrar nem pra simular atraso: é o buraco mais
  // silencioso da planilha, então vira alerta em vez de célula vazia.
  if (!p.data_prevista) out.push({ key: 'sem_prazo', label: 'Sem prazo', color: '#7C3AED' });
  const pendentes = ctx.predsDe(p.id).filter(pred => !isRecebido(pred));
  if (pendentes.some(estaAtrasado)) out.push({ key: 'risco', label: 'Predecessora atrasada', color: '#D97706' });
  else if (pendentes.some(pred => ctx.emRisco(pred))) out.push({ key: 'cascata', label: 'Cadeia em atraso', color: '#D97706' });
  else if (pendentes.length) out.push({ key: 'aguardando', label: 'Aguardando ' + pendentes.length + ' entrega(s)', color: '#B0700B' });
  const fim = fimPrevisto(p);
  if (fim && p.data_prevista && fim > p.data_prevista) out.push({ key: 'estoura', label: 'Vai estourar a entrega', color: '#EA580C' });
  return out;
}

function corHex(p, ctx) {
  if (isRecebido(p)) return ST.recebido.bg;
  const al = alertasDe(p, ctx);
  if (al.some(a => a.key === 'atrasado')) return COR_ATRASO.bg;
  if (al.length) return '#D97706';
  return ST[situacao(p)].bg;
}

// Resolve notas abertas ao receber
async function resolverNotasProjeto(projetoId) {
  await supabase.from('projetos_comentarios')
    .update({ resolvido: true, updated_at: new Date().toISOString() })
    .eq('projeto_id', projetoId).eq('resolvido', false);
}

// ── Hook desktop ──────────────────────────────────────────────────────────────
function useIsDesktop(bp = 900) {
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.innerWidth >= bp);
  useEffect(() => {
    const onResize = () => setIs(window.innerWidth >= bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return is;
}

const ChainIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
);
const ChatIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

function AlertChips({ alertas, small }) {
  if (!alertas || alertas.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: small ? 4 : 8 }}>
      {alertas.map(a => (
        <span key={a.key} style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: small ? 9.5 : 10.5, fontWeight: 800, letterSpacing: 0.2,
          padding: small ? '2px 7px' : '3px 9px', borderRadius: 999,
          background: a.color + '18', color: a.color, border: `0.5px solid ${a.color}40`,
        }}>
          <span style={{ fontSize: small ? 9 : 10 }}>⚠</span>{a.label}
        </span>
      ))}
    </div>
  );
}

// ── Layout do Gantt (compartilhado entre a tela e o PDF) ─────────────────────
function ganttLayout(all, ctx, DAY_W, ROW_H) {
  const placed = all.filter(p => p.data_inicio || p.data_prevista || p.data_recebida);
  if (placed.length === 0) return null;
  let minD = null, maxD = null;
  const consider = (d) => { if (!d) return; if (!minD || d < minD) minD = d; if (!maxD || d > maxD) maxD = d; };
  for (const p of placed) { consider(p.data_inicio); consider(fimPrevisto(p)); consider(p.data_prevista); consider(p.data_recebida); }
  consider(todayISO());
  minD = addDays(minD, -3); maxD = addDays(maxD, 3);

  // Trava a janela em ±N anos de hoje. Uma data digitada errada (ex.: ano 2226)
  // gerava uma timeline de ~1,6 milhão de pixels e milhares de colunas de mês,
  // travando a aba. Datas fora da janela ficam presas na borda do gráfico.
  const LIM_INI = addDays(todayISO(), -365 * 3);
  const LIM_FIM = addDays(todayISO(), 365 * 5);
  if (minD < LIM_INI) minD = LIM_INI;
  if (maxD > LIM_FIM) maxD = LIM_FIM;
  if (maxD < minD) maxD = minD;

  const totalDays = diasEntre(minD, maxD) + 1;
  const timelineW = totalDays * DAY_W;
  // Prende cada data à janela visível para nenhuma barra escapar da timeline.
  const x = (d) => {
    const dia = d < minD ? minD : (d > maxD ? maxD : d);
    return diasEntre(minD, dia) * DAY_W;
  };

  const rows = ordenarVenc(placed);
  const rowIndex = Object.fromEntries(rows.map((p, i) => [p.id, i]));

  const meses = [];
  { const proximoMes = (iso) => {
      const d = new Date(iso + 'T12:00:00'); d.setDate(1); d.setMonth(d.getMonth() + 1);
      return toISODate(d);
    };
    let cur = minD.slice(0, 8) + '01';
    if (cur < minD) cur = proximoMes(cur);
    while (cur <= maxD) { meses.push(cur); cur = proximoMes(cur); }
  }

  const items = rows.map((p, i) => {
    const inicio = p.data_inicio, fim = fimPrevisto(p);
    const hasBar = inicio && fim;
    return {
      p, i, color: corHex(p, ctx), hasBar,
      barLeft: hasBar ? x(inicio) : null,
      barW: hasBar ? Math.max(DAY_W * 0.6, x(fim) - x(inicio)) : null,
      inicioX: inicio ? x(inicio) : null,
      previstaX: p.data_prevista ? x(p.data_prevista) : null,
      recebidaX: (isRecebido(p) && p.data_recebida) ? x(p.data_recebida) : null,
    };
  });

  const conns = [];
  for (const p of rows) {
    const risco = alertasDe(p, ctx).some(a => a.key === 'risco' || a.key === 'cascata');
    for (const pred of ctx.predsDe(p.id)) {
      if (rowIndex[pred.id] === undefined) continue;
      const predEnd = fimPrevisto(pred) || pred.data_prevista || pred.data_recebida || pred.data_inicio;
      const sucStart = p.data_inicio || p.data_prevista || p.data_recebida;
      if (!predEnd || !sucStart) continue;
      conns.push({ key: p.id + '>' + pred.id, x1: x(predEnd), y1: rowIndex[pred.id] * ROW_H + ROW_H / 2, x2: x(sucStart), y2: rowIndex[p.id] * ROW_H + ROW_H / 2, color: risco ? '#D97706' : '#9aa3af' });
    }
  }

  const MES_LBL = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const mesLabel = (m) => `${MES_LBL[parseInt(m.slice(5, 7), 10) - 1]}/${m.slice(2, 4)}`;
  return { rows, items, conns, meses, mesLabel, timelineW, x, minD, maxD, todayX: x(todayISO()), DAY_W, ROW_H };
}

// Selo da etapa (básico / executivo / definição…). Fica ao lado da disciplina:
// "Zamaro · Projeto básico" e "Zamaro · Projeto executivo" são itens diferentes.
function EtapaBadge({ etapa, size = 10 }) {
  const e = etapaDe(etapa);
  if (!e) return null;
  return (
    <span style={{
      fontSize: size, fontWeight: 800, letterSpacing: 0.3, padding: '3px 8px',
      borderRadius: 6, background: e.cor + '18', color: e.cor,
      border: `0.5px solid ${e.cor}40`, whiteSpace: 'nowrap',
    }}>{e.label}</span>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
function ProjetoCard({ p, preds = [], alertas, notas = [], isDesktop, onClick }) {
  const predecessor = preds[0];
  const sit = situacao(p);
  const st = ST[sit];
  const dias = sit === 'recebido' ? null : diasRestantes(p.data_prevista);
  const diff = sit === 'recebido' ? diffLabel(p) : null;
  const dueLabel = dias === null ? '' : dias < 0 ? `${Math.abs(dias)}d atrasado` : dias === 0 ? 'vence hoje' : `falta${dias > 1 ? 'm' : ''} ${dias}d`;
  const predPendente = predecessor && situacao(predecessor) !== 'recebido';
  const notasAtivas = notas.filter(n => !n.resolvido);

  return (
    <div className="card tap" onClick={onClick} style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${st.bg}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '10px 14px 6px' }}>
        <div className="row-flex" style={{ gap: 6, minWidth: 0 }}>
          <span className="t-micro">{p.disciplina || 'Projeto'}</span>
          <EtapaBadge etapa={p.etapa} />
        </div>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '4px 10px', borderRadius: 999, background: st.bgChip, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.15)', flexShrink: 0 }}>
          {st.label.toUpperCase()}
        </div>
      </div>

      <div style={{ padding: '0 14px 10px' }}>
        <div className="t-strong" style={{ fontSize: 15, lineHeight: 1.3 }}>{p.nome}</div>
        {predecessor && (
          <div className="row-flex" style={{ gap: 5, marginTop: 6 }}>
            <span style={{ width: 12, height: 12, color: predPendente ? 'var(--warn, #D97706)' : 'var(--text-3)', flexShrink: 0 }}>{ChainIcon}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: predPendente ? 'var(--warn, #D97706)' : 'var(--text-3)' }}>
              Depois de: {predecessor.nome}{preds.length > 1 ? ` +${preds.length - 1}` : ''} {predPendente ? '· pendente' : '· ✓'}
            </span>
          </div>
        )}
        <AlertChips alertas={alertas} small />
        {isDesktop && notasAtivas.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {notasAtivas.slice(0, 2).map(n => (
              <div key={n.id} style={{ fontSize: 12, lineHeight: 1.3, color: 'var(--text-1)', background: 'rgba(245,158,11,0.10)', border: '0.5px solid rgba(217,119,6,0.25)', borderRadius: 8, padding: '5px 8px', display: 'flex', gap: 6 }}>
                <span style={{ width: 11, height: 11, color: '#B45309', flexShrink: 0, marginTop: 1 }}>{ChatIcon}</span>
                <span style={{ flex: 1 }}>{n.texto}</span>
                {dataNota(n) && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: '#B45309', opacity: 0.85 }}>{dataNota(n)}</span>}
              </div>
            ))}
            {notasAtivas.length > 2 && <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>+{notasAtivas.length - 2} nota(s)</div>}
          </div>
        )}
      </div>

      <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div className="t-micro" style={{ fontSize: 9, marginBottom: 2 }}>ENTREGA PREVISTA</div>
          <div className="row-flex" style={{ gap: 5 }}>
            <span style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }}>{Icon.calendar}</span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate(p.data_prevista)}</div>
          </div>
        </div>
        <div>
          <div className="t-micro" style={{ fontSize: 9, marginBottom: 2 }}>{p.duracao_dias ? 'DURAÇÃO' : 'RECEBIDO'}</div>
          <div className="row-flex" style={{ gap: 5 }}>
            <span style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }}>{p.duracao_dias ? Icon.clipboard : Icon.check}</span>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.duracao_dias ? `${p.duracao_dias} dia${p.duracao_dias > 1 ? 's' : ''}` : fmtDate(p.data_recebida)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: st.footerBg, borderTop: `1px solid ${st.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: st.color }}>
          {sit === 'recebido' ? (diff ? `Recebido · ${diff.txt}` : 'Recebido') : p.data_prevista ? dueLabel : 'sem data prevista'}
        </span>
        {!isDesktop && notasAtivas.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: 'var(--warn,#D97706)' }}>
            <span style={{ width: 13, height: 13 }}>{ChatIcon}</span>{notasAtivas.length}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Notas do projeto (igual às observações de Contratações) ──────────────────
function ProjetoNotas({ p, notas, onChanged }) {
  const [novo, setNovo] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const ativos = notas.filter(n => !n.resolvido);
  const resolvidos = notas.filter(n => n.resolvido);
  const podeAdicionar = true;
  const inputStyle = { width: '100%', minHeight: 40, border: '1.5px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', resize: 'vertical' };

  async function add() {
    if (!novo.trim()) return; setBusy(true);
    const { error } = await supabase.from('projetos_comentarios').insert({ projeto_id: p.id, texto: novo.trim() });
    setBusy(false); if (error) { avisarErro(error, 'salvar a nota'); return; }
    setNovo(''); onChanged();
  }
  async function salvarEdit(id) {
    if (!editText.trim()) { setEditId(null); return; } setBusy(true);
    const { error } = await supabase.from('projetos_comentarios').update({ texto: editText.trim(), updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(false); setEditId(null); if (error) { avisarErro(error, 'salvar a edição'); return; } onChanged();
  }
  async function excluir(id) { setBusy(true); await supabase.from('projetos_comentarios').delete().eq('id', id); setBusy(false); onChanged(); }
  // Resolver uma nota sozinha, sem esperar a mudança de status. Antes só o avanço
  // de etapa dava baixa, e em bloco — dava pra ter uma nota já resolvida presa
  // junto com outra ainda em aberto.
  async function marcar(id, resolvido) {
    setBusy(true);
    await supabase.from('projetos_comentarios')
      .update({ resolvido, updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(false); onChanged();
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="t-micro" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12 }}>{ChatIcon}</span> OBSERVAÇÕES
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ativos.map(n => (
          <div key={n.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.10)', border: '0.5px solid rgba(217,119,6,0.25)' }}>
            {editId === n.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)} style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditId(null)} style={{ flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Cancelar</button>
                  <button onClick={() => salvarEdit(n.id)} disabled={busy} style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Salvar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--text-1)' }}>{n.texto}</div>
                  {dataNota(n) && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#B45309', marginTop: 3 }}>🗓 {dataNota(n)}{n.autor_nome ? ' · ' + n.autor_nome : ''}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => marcar(n.id, true)} disabled={busy} title="Marcar como resolvida" style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface)', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900 }}>✓</button>
                  <button onClick={() => { setEditId(n.id); setEditText(n.texto); }} title="Editar" style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 13, height: 13 }}>{Icon.edit}</span></button>
                  <button onClick={() => excluir(n.id)} title="Excluir" style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 13, height: 13 }}>{Icon.x}</span></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {podeAdicionar && (
        <div style={{ marginTop: ativos.length ? 8 : 0, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={novo} onChange={e => setNovo(e.target.value)} placeholder="Nova observação (em aberto)…" style={inputStyle} />
          <button onClick={add} disabled={busy || !novo.trim()} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: novo.trim() ? 'var(--primary)' : 'var(--surface-2)', color: novo.trim() ? '#fff' : 'var(--text-3)', cursor: novo.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>Add</button>
        </div>
      )}
      {resolvidos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="t-micro" style={{ marginBottom: 6, fontSize: 9, opacity: 0.8 }}>RESOLVIDAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resolvidos.map(n => (
              <div key={n.id} style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--text-3)', opacity: 0.8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, marginTop: 1 }}>✓</span>
                <span style={{ flex: 1, textDecoration: 'line-through' }}>{n.texto}</span>
                {dataNota(n) && <span style={{ flexShrink: 0, fontSize: 10.5 }}>{dataNota(n)}</span>}
                <button onClick={() => marcar(n.id, false)} disabled={busy} title="Reabrir nota" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>↺</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Modal: novo / editar projeto ─────────────────────────────────────────────

// Data em que a observação foi lançada — evita ter que digitar no texto.
const dataNota = (c) => {
  const iso = c?.data || c?.created_at;
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

function ProjetoForm({ projeto, todos, depsTodas = [], onClose, onSaved }) {
  const editando = !!projeto;
  const [nome, setNome]               = useState(projeto?.nome || '');
  const [disciplina, setDisciplina]   = useState(projeto?.disciplina || '');
  const [etapa, setEtapa]             = useState(projeto?.etapa || '');
  const [dataInicio, setDataInicio]   = useState(projeto?.data_inicio || '');
  const [duracao, setDuracao]         = useState(projeto?.duracao_dias != null ? String(projeto.duracao_dias) : '');
  const [dataPrevista, setDataPrev]   = useState(projeto?.data_prevista || '');
  const [respNome, setRespNome]       = useState(projeto?.responsavel_nome || '');
  const [revisao, setRevisao]         = useState(projeto?.revisao || '');
  const [depIds, setDepIds]           = useState(
    () => projeto ? depsTodas.filter(d => d.projeto_id === projeto.id).map(d => d.depende_de_id) : []);
  const [obs, setObs]                 = useState(projeto?.observacao || '');
  const [saving, setSaving]           = useState(false);

  const dependeDeste = useCallback((cand) => {
    if (!editando) return false;
    let cur = cand; const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      if (cur.id === projeto.id) return true;
      seen.add(cur.id);
      const paiId = (depsTodas.find(d => d.projeto_id === cur.id) || {}).depende_de_id;
      cur = todos.find(t => t.id === paiId);
    }
    return false;
  }, [editando, projeto, todos, depsTodas]);
  const candidatos = todos.filter(t => (!editando || t.id !== projeto.id) && !dependeDeste(t));
  const fimExec = (dataInicio && duracao) ? addDays(dataInicio, Number(duracao)) : null;
  const estoura = fimExec && dataPrevista && fimExec > dataPrevista;

  async function salvar() {
    setSaving(true);
    const payload = {
      nome: nome.trim(), disciplina: disciplina || null, etapa: etapa || null,
      data_inicio: dataInicio || null, duracao_dias: duracao ? Math.max(0, parseInt(duracao, 10)) : null,
      data_prevista: dataPrevista || null, responsavel_nome: respNome.trim() || null,
      revisao: revisao.trim() || null, observacao: obs.trim() || null,
    };
    const { data, error } = editando
      ? await supabase.from('projetos').update(payload).eq('id', projeto.id).select().single()
      : await supabase.from('projetos').insert({ ...payload, status: 'nao_iniciado' }).select().single();
    if (error) { setSaving(false); avisarErro(error, 'salvar o projeto'); return; }

    // Dependências: apaga e regrava. São poucas por item e assim o que ficou na
    // tela é exatamente o que fica no banco, sem diff para dar errado.
    const id = data?.id || projeto?.id;
    if (id) {
      await supabase.from('projetos_dependencias').delete().eq('projeto_id', id);
      if (depIds.length) {
        const { error: e2 } = await supabase.from('projetos_dependencias')
          .insert(depIds.map(d => ({ projeto_id: id, depende_de_id: d })));
        if (e2) { setSaving(false); alert('O projeto foi salvo, mas as dependências não. ' + motivoAmigavel(e2)); onSaved(); return; }
      }
    }
    setSaving(false);
    onSaved();
  }

  const fieldStyle = { width: '100%', height: 46, border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 14px', fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 440, zIndex: 101, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid var(--divider)' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{editando ? 'Editar projeto' : 'Novo projeto'}</div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18 }}>×</button>
        </div>
        <div style={{ padding: 20, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>NOME DO PROJETO</div>
            <input autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Projeto estrutural — Torre A" style={fieldStyle} />
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>DISCIPLINA <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DISCIPLINAS.map(d => (
                <button key={d} onClick={() => setDisciplina(disciplina === d ? '' : d)} style={{
                  height: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: disciplina === d ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                  background: disciplina === d ? 'rgba(14,108,184,0.08)' : 'var(--surface-2)',
                  color: disciplina === d ? 'var(--primary)' : 'var(--text-2)',
                }}>{d}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>ETAPA / ENTREGÁVEL <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {ETAPAS.map(e => (
                <button key={e.key} onClick={() => setEtapa(etapa === e.key ? '' : e.key)} style={{
                  height: 32, padding: '0 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  border: etapa === e.key ? `2px solid ${e.cor}` : '1.5px solid var(--border)',
                  background: etapa === e.key ? e.cor + '14' : 'var(--surface-2)',
                  color: etapa === e.key ? e.cor : 'var(--text-2)',
                }}>{e.label}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>INÍCIO DA EXECUÇÃO</div>
              <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} style={fieldStyle} />
            </div>
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>DURAÇÃO (DIAS)</div>
              <input type="number" min="0" inputMode="numeric" value={duracao} onChange={e => setDuracao(e.target.value)} placeholder="Ex.: 15" style={fieldStyle} />
            </div>
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>PREVISÃO DE ENTREGA</div>
            <input type="date" value={dataPrevista} onChange={e => setDataPrev(e.target.value)} style={fieldStyle} />
            {fimExec && (
              <div style={{ fontSize: 12, marginTop: 6, fontWeight: 700, color: estoura ? '#EA580C' : 'var(--text-3)' }}>
                Fim da execução previsto: {fmtDate(fimExec)}{estoura ? ' · ⚠ passa da entrega' : ' · dentro do prazo'}
              </div>
            )}
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>EMISSÃO / REVISÃO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
            <input value={revisao} onChange={e => setRevisao(e.target.value)} placeholder="R00, R01, 2ª emissão…" style={fieldStyle} />
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>DEPENDE DE <span style={{ fontWeight: 500, opacity: 0.6 }}>(pode marcar vários)</span></div>
            {depIds.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 8 }}>
                {depIds.map(id => {
                  const t = todos.find(x => x.id === id);
                  if (!t) return null;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 9, background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
                      <span style={{ fontSize: 12.5, flex: 1 }}>{t.nome}<small style={{ color: 'var(--text-3)' }}>{t.responsavel_nome ? ' · ' + t.responsavel_nome : ''}</small></span>
                      <button onClick={() => setDepIds(depIds.filter(x => x !== id))} title="Remover" style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 15 }}>×</button>
                    </div>
                  );
                })}
              </div>
            )}
            <select value="" onChange={e => { if (e.target.value) setDepIds([...depIds, e.target.value]); }}
                    style={{ ...fieldStyle, color: 'var(--text-3)' }}>
              <option value="">+ Adicionar dependência…</option>
              {candidatos.filter(t => !depIds.includes(t.id)).map(t => (
                <option key={t.id} value={t.id}>{t.responsavel_nome ? t.responsavel_nome + ' · ' : ''}{t.nome}{situacao(t) === 'recebido' ? ' (recebido)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>RESPONSÁVEL / PROJETISTA <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
            <input value={respNome} onChange={e => setRespNome(e.target.value)} placeholder="Nome…" style={fieldStyle} />
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>OBSERVAÇÃO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
            <textarea value={obs} onChange={e => setObs(e.target.value)} style={{ ...fieldStyle, height: 64, padding: '10px 14px', resize: 'none', fontFamily: 'inherit' }} />
          </div>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={salvar} disabled={!nome.trim() || saving}
            style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: !nome.trim() || saving ? 'not-allowed' : 'pointer', background: !nome.trim() || saving ? 'var(--surface-2)' : 'var(--primary)', color: !nome.trim() || saving ? 'var(--text-3)' : '#fff', fontSize: 15, fontWeight: 800 }}>
            {saving ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar projeto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal: marcar como recebido ───────────────────────────────────────────────
function ReceberModal({ projeto, onClose, onSaved }) {
  const [data, setData]           = useState(todayISO());
  const [editandoData, setEdData] = useState(false);
  const [saving, setSaving]       = useState(false);
  const diff = diasEntre(projeto.data_prevista, data);

  async function salvar() {
    setSaving(true);
    const { error } = await supabase.from('projetos').update({ status: 'recebido', data_recebida: data }).eq('id', projeto.id);
    if (!error) await resolverNotasProjeto(projeto.id);
    setSaving(false);
    if (error) { avisarErro(error, 'registrar o recebimento'); return; }
    onSaved();
  }

  const fieldStyle = { width: '100%', height: 48, border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 14px', fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 420, zIndex: 111, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', padding: 20 }}>
        {/* Sem o clique-fora, o ✕ é a única saída sem confirmar — este modal
            não tinha nenhuma e prendia o usuário. */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', marginBottom: 4 }}>Marcar como recebido</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>{projeto.nome}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, flexShrink: 0 }}>×</button>
        </div>
        <div className="t-micro" style={{ marginBottom: 12 }}>DATA DO RECEBIMENTO</div>
        {!editandoData ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button onClick={() => setEdData(false)} style={{ height: 56, borderRadius: 12, border: '2px solid var(--primary)', background: 'rgba(14,108,184,0.08)', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>✓ Hoje ({fmtDate(todayISO())})</button>
            <button onClick={() => setEdData(true)} style={{ height: 56, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Editar data</button>
          </div>
        ) : <input type="date" value={data} onChange={e => setData(e.target.value)} style={fieldStyle} />}
        {projeto.data_prevista && diff !== null && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: 'var(--surface-2)', fontSize: 13, fontWeight: 700, color: diff > 0 ? 'var(--danger)' : 'var(--success, #16A34A)' }}>
            Previsto: {fmtDate(projeto.data_prevista)} → {diff > 0 ? `${diff} dia${diff > 1 ? 's' : ''} de atraso` : diff < 0 ? `${Math.abs(diff)} dia${Math.abs(diff) > 1 ? 's' : ''} adiantado` : 'no prazo'}
          </div>
        )}
        <button onClick={salvar} disabled={saving} style={{ marginTop: 16, width: '100%', height: 48, borderRadius: 12, border: 'none', background: ST.recebido.bgChip, color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800 }}>
          {saving ? 'Salvando…' : 'Confirmar recebimento'}
        </button>
      </div>
    </div>
  );
}

// ── Simulação: "se este atrasar, quem escorrega junto?" ──────────────────────
function SimulacaoSheet({ p, todos, deps, onClose }) {
  const [dias, setDias] = useState(15);
  const r = useMemo(() => simularAtraso(todos, deps, p.id, dias), [todos, deps, p.id, dias]);
  const semPrazo = r.afetados.filter(a => a.semPrazo).length;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 520, zIndex: 111, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 14px', borderBottom: '0.5px solid var(--divider)' }}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="t-micro">SIMULAÇÃO DE ATRASO</div>
              <div style={{ fontSize: 15, fontWeight: 900, marginTop: 3, lineHeight: 1.3 }}>{p.nome}</div>
              <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.responsavel_nome || 'sem responsável'}</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, flexShrink: 0 }}>×</button>
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="t-micro" style={{ marginBottom: 6 }}>ATRASAR EM</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {[7, 15, 30, 45, 60].map(d => (
                <button key={d} onClick={() => setDias(d)} style={{
                  height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  border: dias === d ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                  background: dias === d ? 'rgba(14,108,184,0.08)' : 'var(--surface-2)',
                  color: dias === d ? 'var(--primary)' : 'var(--text-2)',
                }}>{d} dias</button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '0.5px solid var(--border)', fontSize: 13 }}>
            {r.raiz.semPrazo
              ? <span style={{ color: '#7C3AED', fontWeight: 700 }}>Este item não tem data prevista — defina um prazo para poder simular.</span>
              : <>Entrega vai de <b>{fmtDate(r.raiz.de)}</b> para <b style={{ color: 'var(--danger)' }}>{fmtDate(r.raiz.para)}</b></>}
          </div>
        </div>

        <div style={{ padding: '14px 18px', overflowY: 'auto', flex: 1 }}>
          {r.afetados.length === 0 ? (
            <div className="t-caption">Nenhum outro projeto depende deste. O atraso não se propaga.</div>
          ) : (<>
            <div className="t-micro" style={{ marginBottom: 8 }}>
              {r.afetados.length} PROJETO(S) AFETADO(S){semPrazo ? ` · ${semPrazo} SEM PRAZO` : ''}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {r.afetados.map(a => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                  background: 'var(--surface-2)', border: '0.5px solid var(--border)',
                  borderLeft: `3px solid ${a.nivel === 1 ? 'var(--danger)' : '#D97706'}`,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-3)', width: 16, flexShrink: 0 }}>{a.nivel}º</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{a.nome}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.responsavel_nome}</div>
                  </div>
                  <div style={{ fontSize: 12, textAlign: 'right', flexShrink: 0 }}>
                    {a.semPrazo
                      ? <span style={{ color: '#7C3AED', fontWeight: 800 }}>sem prazo</span>
                      : <><span style={{ color: 'var(--text-3)' }}>{fmtDate(a.de)}</span>
                         <div style={{ fontWeight: 800, color: 'var(--danger)' }}>{fmtDate(a.para)}</div></>}
                  </div>
                </div>
              ))}
            </div>
            <div className="t-caption" style={{ marginTop: 12, lineHeight: 1.5 }}>
              O atraso é repassado inteiro: a malha guarda a data de cada entregável, não a folga
              entre eles. Quem já foi recebido não entra. <b>{semPrazo > 0 && 'Os itens sem prazo não dá para calcular — é mais um motivo para exigir data.'}</b>
            </div>
          </>)}
        </div>
      </div>
    </div>
  );
}

// ── Popup do card ─────────────────────────────────────────────────────────────
function ProjetoSheet({ p, ctx, alertas, notas, onClose, onChanged, onRefresh, onEdit, onReceber, onSimular }) {
  const [confirmaDelete, setConfirmaDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const sit = situacao(p);
  const st = ST[sit];
  const predecessores = ctx.predsDe(p.id);
  const sucessores    = ctx.sucsDe(p.id);
  const diff = diffLabel(p);
  const fim = fimPrevisto(p);

  async function excluir() {
    setBusy(true);
    const { error } = await supabase.from('projetos').delete().eq('id', p.id);
    setBusy(false); if (error) { avisarErro(error, 'excluir'); return; } onChanged();
  }
  async function desfazerRecebimento() {
    setBusy(true);
    const { error } = await supabase.from('projetos').update({ status: 'em_andamento', data_recebida: null }).eq('id', p.id);
    setBusy(false); if (error) { avisarErro(error, 'desfazer'); return; } onChanged();
  }
  // Não iniciado → em andamento. É o marco de "o projetista pôs a mão", que é o
  // que separa uma etapa futura de uma que já dá pra cobrar.
  async function mudarStatus(novo) {
    setBusy(true);
    const { error } = await supabase.from('projetos').update({ status: novo }).eq('id', p.id);
    setBusy(false); if (error) { avisarErro(error, 'mudar o status'); return; } onChanged();
  }
  async function toggleOculto() {
    setBusy(true);
    await supabase.from('projetos').update({ oculto: !p.oculto }).eq('id', p.id);
    setBusy(false); onChanged();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 520, zIndex: 101, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '90vh', minHeight: 420, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: '0.5px solid var(--divider)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.3 }}>{p.nome}</div>
            <div className="row-flex" style={{ gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.disciplina || 'Projeto'}{p.oculto ? ' · oculto' : ''}</span>
              <EtapaBadge etapa={p.etapa} size={9} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: st.bgChip, color: '#fff', letterSpacing: 0.4 }}>{st.label.toUpperCase()}</span>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18 }}>×</button>
          </div>
        </div>
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
          {alertas && alertas.length > 0 && (
            <div style={{ marginBottom: 14, padding: '10px 12px', borderRadius: 12, background: 'rgba(220,38,38,0.06)', border: '0.5px solid rgba(220,38,38,0.20)' }}>
              <div className="t-micro" style={{ marginBottom: 2, color: 'var(--danger)' }}>ATENÇÃO</div>
              <AlertChips alertas={alertas} />
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
            {p.data_inicio && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>▶️ <b>Início:</b> {fmtDate(p.data_inicio)}</div>}
            {p.duracao_dias != null && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>⏱️ <b>Duração:</b> {p.duracao_dias} dia{p.duracao_dias > 1 ? 's' : ''}{fim ? ` · fim previsto ${fmtDate(fim)}` : ''}</div>}
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>📅 <b>Entrega prevista:</b> {fmtDate(p.data_prevista)}</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>✅ <b>Recebido:</b> {fmtDate(p.data_recebida)}{diff && <span style={{ fontWeight: 800, color: diff.color }}> · {diff.txt}</span>}</div>
            {sit !== 'recebido' && p.data_prevista && (() => { const d = diasRestantes(p.data_prevista); return <div style={{ fontSize: 13, color: d < 0 ? 'var(--danger)' : 'var(--text-2)' }}>⏳ <b>Situação:</b> {d < 0 ? `${Math.abs(d)}d de atraso` : d === 0 ? 'vence hoje' : `faltam ${d}d`}</div>; })()}
            {p.responsavel_nome && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>👤 <b>Responsável:</b> {p.responsavel_nome}</div>}
            {p.observacao && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>📝 {p.observacao}</div>}
          </div>

          <ProjetoNotas p={p} notas={notas} onChanged={onRefresh} />

          {(predecessores.length > 0 || sucessores.length > 0) && (
            <div style={{ marginBottom: 16 }}>
              <div className="t-micro" style={{ marginBottom: 8 }}>CADEIA DE PROJETOS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {predecessores.map(pr => (
                  <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
                    <span style={{ width: 14, height: 14, color: 'var(--text-3)', flexShrink: 0 }}>{ChainIcon}</span>
                    <span style={{ fontSize: 12, flex: 1 }}><b>Depende de:</b> {pr.nome}<small style={{ color: 'var(--text-3)' }}>{pr.responsavel_nome ? ' · ' + pr.responsavel_nome : ''}</small></span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: ST[situacao(pr)].bgChip, color: '#fff' }}>{ST[situacao(pr)].label.toUpperCase()}</span>
                  </div>
                ))}
                {sucessores.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
                    <span style={{ width: 14, height: 14, color: 'var(--text-3)', flexShrink: 0, transform: 'scaleX(-1)' }}>{ChainIcon}</span>
                    <span style={{ fontSize: 12, flex: 1 }}><b>Libera:</b> {s.nome}<small style={{ color: 'var(--text-3)' }}>{s.responsavel_nome ? ' · ' + s.responsavel_nome : ''}</small></span>
                    <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 999, background: ST[situacao(s)].bgChip, color: '#fff' }}>{ST[situacao(s)].label.toUpperCase()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sucessores.length > 0 && (
              <button onClick={onSimular} style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--primary)', background: 'transparent', color: 'var(--primary)', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                🔮 Simular atraso deste projeto
              </button>
            )}
            {sit === 'nao_iniciado' && (
              <button onClick={() => mudarStatus('em_andamento')} disabled={busy} style={{ height: 46, borderRadius: 12, border: 'none', background: ST.em_andamento.bgChip, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>▶ Iniciar desenvolvimento</button>
            )}
            {sit === 'em_andamento' && (
              <button onClick={() => mudarStatus('nao_iniciado')} disabled={busy} style={{ height: 40, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>↩ Voltar para não iniciado</button>
            )}
            {sit !== 'recebido' && (
              <button onClick={onReceber} style={{ height: 48, borderRadius: 12, border: 'none', background: ST.recebido.bgChip, color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800, boxShadow: `0 2px 8px ${ST.recebido.bg}60` }}>✅ Marcar como recebido</button>
            )}
            {sit === 'recebido' && (
              <button onClick={desfazerRecebimento} disabled={busy} style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>↩ Desfazer recebimento</button>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onEdit} style={{ flex: 1, height: 44, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>✏️ Editar</button>
              <button onClick={toggleOculto} disabled={busy} style={{ flex: 1, height: 44, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>{p.oculto ? '👁️ Mostrar' : '🚫 Ocultar'}</button>
            </div>
            {!confirmaDelete ? (
              <button onClick={() => setConfirmaDelete(true)} style={{ height: 40, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Excluir projeto</button>
            ) : (
              <button onClick={excluir} disabled={busy} style={{ height: 40, borderRadius: 10, border: 'none', background: 'rgba(176,36,42,0.12)', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Quadro (kanban) ───────────────────────────────────────────────────────────
function BoardView({ byStatus, ctx, notasByP, onCardClick }) {
  return (
    <div style={{ padding: '0 var(--pad-4) 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignItems: 'start' }}>
      {STATUS_ORDER.map(sk => {
        const st = ST[sk]; const cards = byStatus[sk] || [];
        return (
          <div key={sk} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: st.bg + '12', borderBottom: `2.5px solid ${st.bg}` }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: st.bg, flexShrink: 0 }} />
              <div className="t-strong" style={{ fontSize: 13, flex: 1 }}>{st.label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: st.bg, background: st.bg + '22', padding: '2px 8px', borderRadius: 999 }}>{cards.length}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cards.map(p => <ProjetoCard key={p.id} p={p} preds={ctx.predsDe(p.id)} alertas={alertasDe(p, ctx)} notas={notasByP[p.id] || []} isDesktop onClick={() => onCardClick(p)} />)}
              {cards.length === 0 && <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--surface-2)', borderRadius: 12 }}>Nada aqui</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Por projetista ────────────────────────────────────────────────────────────
// O eixo de cobrança é a pessoa, não o status: você liga para o Rafael, não para
// "o luminotécnico executivo". Cada grupo abre com uma régua da composição dele —
// dá para ver de longe quem está verde e quem está vermelho.
function agruparPorProjetista(lista) {
  const m = new Map();
  for (const p of lista) {
    const k = p.responsavel_nome || 'Sem projetista definido';
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  // Quem tem mais atraso primeiro; empate, mais itens primeiro.
  return [...m.entries()]
    .map(([nome, itens]) => ({ nome, itens, atrasados: itens.filter(estaAtrasado).length }))
    .sort((a, b) => (b.atrasados - a.atrasados) || (b.itens.length - a.itens.length)
                 || a.nome.localeCompare(b.nome, 'pt-BR'));
}

function corDaRegua(p) {
  if (isRecebido(p)) return ST.recebido.bg;
  if (estaAtrasado(p)) return COR_ATRASO.bg;
  if (!p.data_prevista) return '#7C3AED';
  return ST[situacao(p)].bg;
}

function ProjetistaView({ lista, ctx, notasByP, isDesktop, onCardClick }) {
  const grupos = agruparPorProjetista(lista);
  if (grupos.length === 0) {
    return <div style={{ padding: '32px var(--pad-4)', textAlign: 'center', color: 'var(--text-3)' }}>Nenhum projeto no filtro atual.</div>;
  }
  return (
    <div style={{ padding: '0 var(--pad-4) 24px', display: 'flex', flexDirection: 'column', gap: 22 }}>
      {grupos.map(g => {
        const disc = g.itens.find(i => i.disciplina)?.disciplina;
        const semPrazo = g.itens.filter(i => !isRecebido(i) && !i.data_prevista).length;
        return (
          <div key={g.nome}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', paddingBottom: 7, borderBottom: '2px solid var(--text-1)' }}>
              <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase' }}>{g.nome}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                {disc ? disc + ' · ' : ''}{g.itens.length} entregáve{g.itens.length > 1 ? 'is' : 'l'}
              </span>
              {g.atrasados > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: 'rgba(220,38,38,0.12)', color: COR_ATRASO.color }}>
                  {g.atrasados} ATRASADO{g.atrasados > 1 ? 'S' : ''}
                </span>
              )}
              {semPrazo > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, background: 'rgba(124,58,237,0.12)', color: '#7C3AED' }}>
                  {semPrazo} SEM PRAZO
                </span>
              )}
              <span style={{ display: 'flex', gap: 2, marginLeft: 'auto' }}>
                {g.itens.map(p => (
                  <i key={p.id} title={p.nome} style={{ display: 'block', width: 14, height: 6, borderRadius: 2, background: corDaRegua(p) }} />
                ))}
              </span>
            </div>
            <div style={{
              marginTop: 10, display: 'grid', gap: 10,
              gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(300px, 1fr))' : '1fr',
              alignItems: 'start',
            }}>
              {ordenarVenc(g.itens).map(p => (
                <ProjetoCard key={p.id} p={p} preds={ctx.predsDe(p.id)} alertas={alertasDe(p, ctx)}
                             notas={notasByP[p.id] || []} isDesktop={isDesktop} onClick={() => onCardClick(p)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Gantt ─────────────────────────────────────────────────────────────────────
function GanttView({ all, ctx, dayW, onCardClick }) {
  const ROW_H = 44, LABEL_W = 190, HEADER_H = 40;
  const L = ganttLayout(all, ctx, dayW, ROW_H);
  if (!L) return <div style={{ padding: '32px var(--pad-4)', textAlign: 'center', color: 'var(--text-3)' }}>Cadastre projetos com <b>início/duração</b> ou <b>data de entrega</b> para ver o Gantt.</div>;

  return (
    <div style={{ padding: '0 var(--pad-4) 24px' }}>
      <div style={{ overflowX: 'auto', border: '0.5px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
        <div style={{ position: 'relative', width: LABEL_W + L.timelineW, minWidth: '100%' }}>
          <div style={{ position: 'relative', height: HEADER_H, borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ position: 'absolute', left: 0, top: 0, width: LABEL_W, height: '100%', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', borderRight: '0.5px solid var(--border)', background: 'var(--surface)', zIndex: 3 }}>PROJETO</div>
            {L.meses.map(m => (
              <div key={m} style={{ position: 'absolute', top: 0, left: LABEL_W + L.x(m), height: '100%', display: 'flex', alignItems: 'center', paddingLeft: 6, fontSize: 11, fontWeight: 800, color: 'var(--text-2)', borderLeft: '1px solid var(--border)' }}>{L.mesLabel(m)}</div>
            ))}
          </div>
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: LABEL_W + L.todayX, top: 0, bottom: 0, width: 2, background: 'rgba(220,38,38,0.55)', zIndex: 2 }} title="Hoje" />
            <svg width={L.timelineW} height={L.rows.length * ROW_H} style={{ position: 'absolute', left: LABEL_W, top: 0, pointerEvents: 'none', zIndex: 1, overflow: 'visible' }}>
              {L.conns.map(c => { const midx = Math.max(c.x1 + 8, c.x2 - 8); return (<g key={c.key}><path d={`M ${c.x1} ${c.y1} H ${midx} V ${c.y2} H ${c.x2}`} fill="none" stroke={c.color} strokeWidth="1.5" strokeDasharray="3 3" /><circle cx={c.x2} cy={c.y2} r="2.5" fill={c.color} /></g>); })}
            </svg>
            {L.items.map(({ p, i, color, hasBar, barLeft, barW, inicioX, previstaX, recebidaX }) => {
              const al = alertasDe(p, ctx);
              return (
                <div key={p.id} style={{ position: 'relative', height: ROW_H, borderBottom: '0.5px solid var(--border)', background: i % 2 ? 'var(--surface-2)' : 'transparent' }}>
                  <button onClick={() => onCardClick(p)} style={{ position: 'sticky', left: 0, zIndex: 3, width: LABEL_W, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', padding: '0 12px', border: 'none', borderRight: '0.5px solid var(--border)', background: i % 2 ? 'var(--surface-2)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left', float: 'left' }}>
                    <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: LABEL_W - 24 }}>{p.nome}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color }}>{isRecebido(p) ? 'recebido' : al.length ? '⚠ ' + al[0].label.toLowerCase() : (p.disciplina || 'projeto')}</span>
                  </button>
                  <div style={{ position: 'absolute', left: LABEL_W, top: 0, height: '100%', width: L.timelineW }}>
                    {hasBar && <div onClick={() => onCardClick(p)} title={`${fmtDate(p.data_inicio)} → ${fmtDate(fimPrevisto(p))}`} style={{ position: 'absolute', left: barLeft, top: (ROW_H - 18) / 2, height: 18, width: barW, background: color, borderRadius: 6, cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.15)', opacity: isRecebido(p) ? 0.55 : 1 }} />}
                    {!hasBar && inicioX != null && <div style={{ position: 'absolute', left: inicioX - 4, top: ROW_H / 2 - 4, width: 8, height: 8, borderRadius: 999, background: color }} />}
                    {previstaX != null && <div title={`Entrega prevista ${fmtDate(p.data_prevista)}`} style={{ position: 'absolute', left: previstaX - 6, top: ROW_H / 2 - 6, width: 12, height: 12, background: '#111827', transform: 'rotate(45deg)', borderRadius: 2, border: '1.5px solid #fff', zIndex: 2 }} />}
                    {recebidaX != null && <div title={`Recebido ${fmtDate(p.data_recebida)}`} style={{ position: 'absolute', left: recebidaX - 7, top: ROW_H / 2 - 7, width: 14, height: 14, borderRadius: 999, background: ST.recebido.bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, zIndex: 2 }}>✓</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>
        <span><span style={{ display: 'inline-block', width: 18, height: 8, borderRadius: 3, background: ST.em_andamento.bg, marginRight: 5, verticalAlign: 'middle' }} />Execução</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#111827', transform: 'rotate(45deg)', marginRight: 6, verticalAlign: 'middle' }} />Entrega prevista</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 999, background: ST.recebido.bg, marginRight: 5, verticalAlign: 'middle' }} />Recebido</span>
        <span><span style={{ display: 'inline-block', width: 2, height: 12, background: 'rgba(220,38,38,0.55)', marginRight: 6, verticalAlign: 'middle' }} />Hoje</span>
        <span style={{ color: '#D97706' }}>⚠ laranja/tracejado = em risco ou estoura</span>
      </div>
    </div>
  );
}

// ── Tabela editável (edição em massa) ─────────────────────────────────────────
function TabelaEditavel({ projetos, onClose, onSaved }) {
  const [rows, setRows] = useState(() => ordenarVenc(projetos).map(p => ({ ...p, _del: false })));
  const [saving, setSaving] = useState(false);

  const upd = (id, patch) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const move = (idx, dir) => setRows(rs => { const a = [...rs]; const j = idx + dir; if (j < 0 || j >= a.length) return rs; [a[idx], a[j]] = [a[j], a[idx]]; return a; });

  async function salvar() {
    setSaving(true);
    const orig = Object.fromEntries(projetos.map(p => [p.id, p]));
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r._del) { await supabase.from('projetos').delete().eq('id', r.id); continue; }
      const o = orig[r.id] || {};
      const patch = {
        nome: (r.nome || '').trim() || o.nome,
        disciplina: r.disciplina || null,
        data_inicio: r.data_inicio || null,
        duracao_dias: (r.duracao_dias === '' || r.duracao_dias == null) ? null : Math.max(0, parseInt(r.duracao_dias, 10)),
        data_prevista: r.data_prevista || null,
        oculto: !!r.oculto,
        ordem: i,
      };
      await supabase.from('projetos').update(patch).eq('id', r.id);
    }
    setSaving(false); onSaved();
  }

  const th = { fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textAlign: 'left', padding: '6px 8px', whiteSpace: 'nowrap' };
  const inp = { width: '100%', height: 32, border: '1px solid var(--border)', borderRadius: 8, padding: '0 8px', fontSize: 12, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'var(--bg, var(--surface-2))', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>Editar projetos</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Edite, reordene (↑↓), oculte 🚫 ou exclua 🗑 — depois salve tudo.</div>
        </div>
        <button onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>Cancelar</button>
        <button onClick={salvar} disabled={saving} className="btn btn-primary btn-sm">{saving ? 'Salvando…' : 'Salvar tudo'}</button>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 820 }}>
          <thead>
            <tr style={{ borderBottom: '1.5px solid var(--border)' }}>
              <th style={{ ...th, width: 54 }}>Ordem</th>
              <th style={{ ...th, minWidth: 200 }}>Nome</th>
              <th style={{ ...th, width: 150 }}>Disciplina</th>
              <th style={{ ...th, width: 140 }}>Início</th>
              <th style={{ ...th, width: 90 }}>Duração</th>
              <th style={{ ...th, width: 140 }}>Entrega</th>
              <th style={{ ...th, width: 60, textAlign: 'center' }}>Ocultar</th>
              <th style={{ ...th, width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} style={{ borderBottom: '0.5px solid var(--border)', opacity: r._del ? 0.4 : 1, background: r.oculto ? 'var(--surface-2)' : 'transparent' }}>
                <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  <button onClick={() => move(i, -1)} style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer', marginRight: 2 }}>↑</button>
                  <button onClick={() => move(i, 1)} style={{ width: 22, height: 22, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', cursor: 'pointer' }}>↓</button>
                </td>
                <td style={{ padding: '4px 8px' }}><input value={r.nome || ''} onChange={e => upd(r.id, { nome: e.target.value })} style={inp} /></td>
                <td style={{ padding: '4px 8px' }}>
                  <select value={r.disciplina || ''} onChange={e => upd(r.id, { disciplina: e.target.value })} style={inp}>
                    <option value="">—</option>
                    {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}><input type="date" value={r.data_inicio || ''} onChange={e => upd(r.id, { data_inicio: e.target.value })} style={inp} /></td>
                <td style={{ padding: '4px 8px' }}><input type="number" min="0" value={r.duracao_dias ?? ''} onChange={e => upd(r.id, { duracao_dias: e.target.value })} style={inp} /></td>
                <td style={{ padding: '4px 8px' }}><input type="date" value={r.data_prevista || ''} onChange={e => upd(r.id, { data_prevista: e.target.value })} style={inp} /></td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <input type="checkbox" checked={!!r.oculto} onChange={e => upd(r.id, { oculto: e.target.checked })} style={{ width: 18, height: 18, cursor: 'pointer' }} />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <button onClick={() => upd(r.id, { _del: !r._del })} title={r._del ? 'Desfazer' : 'Excluir'} style={{ width: 28, height: 28, border: '1px solid var(--border)', borderRadius: 6, background: r._del ? 'var(--danger)' : 'var(--surface)', color: r._del ? '#fff' : 'var(--danger)', cursor: 'pointer', fontSize: 13 }}>{r._del ? '↺' : '🗑'}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Impressão / PDF por visão ─────────────────────────────────────────────────
// A planilha sai com o mesmo cabeçalho e as mesmas cores do PDF (ver
// exportar-excel.js). O .xls é uma tabela HTML: o Excel avisa que a extensão
// não bate no primeiro clique, e em troca vem colorida em vez de texto cru.
function baixarExcel(nomeArquivo, html) {
  const blob = new Blob(['﻿' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const COLS_EXPORT = [
  { label: 'Entregável', largura: 300 }, { label: 'Disciplina', largura: 130 },
  { label: 'Etapa', largura: 120 }, { label: 'Emissão', largura: 70 },
  { label: 'Entrega prevista', largura: 100 }, { label: 'Recebido', largura: 90 },
  { label: 'Desvio (d)', largura: 70 }, { label: 'Situação', largura: 110 },
  { label: 'Alertas', largura: 200 }, { label: 'Depende de', largura: 260 },
  { label: 'Observação', largura: 300 }, { label: 'Anotações', largura: 380 },
];

// As notas do popup também vão para o relatório: era justamente o que ficava
// só na tela e não chegava em quem cobra o projetista.
function textoNotas(notas) {
  const abertas   = (notas || []).filter(n => !n.resolvido).map(n => '• ' + n.texto);
  const fechadas  = (notas || []).filter(n =>  n.resolvido).map(n => '✓ ' + n.texto);
  return [...abertas, ...fechadas].join('\n');
}

function linhasExcel(grupos, ctx, notasByP = {}) {
  const out = [];
  for (const g of grupos) {
    out.push({ tipo: 'grupo', label: g.nome + '  ·  ' + g.itens.length + ' entregável(is)', cor: '#0E6CB8' });
    for (const p of ordenarVenc(g.itens)) {
      const e = etapaDe(p.etapa);
      const st = ST[situacao(p)];
      const dv = (p.data_prevista && p.data_recebida) ? diasEntre(p.data_prevista, p.data_recebida) : null;
      const semPrazo = !isRecebido(p) && !p.data_prevista;
      out.push({ tipo: 'linha', celulas: [
        { v: p.nome || '', negrito: true },
        { v: p.disciplina || '' },
        { v: e ? e.label : '' },
        { v: p.revisao || '' },
        semPrazo ? { v: 'sem prazo', cor: tomClaro('#7C3AED'), corTexto: '#7C3AED', negrito: true }
                 : { v: p.data_prevista ? fmtDate(p.data_prevista) : '' },
        { v: p.data_recebida ? fmtDate(p.data_recebida) : '' },
        dv == null ? { v: '' }
                   : { v: String(dv), corTexto: dv > 0 ? '#C2352B' : '#2F7D46', negrito: true },
        { v: st.label, cor: tomClaro(st.bg), corTexto: st.color, negrito: true },
        { v: alertasDe(p, ctx).map(a => a.label).join(', '), corTexto: '#B45309' },
        { v: ctx.predsDe(p.id).map(x => (x.responsavel_nome ? x.responsavel_nome + ' · ' : '') + x.nome).join(' | ') },
        { v: (p.observacao || '').replace(/\s+/g, ' ') },
        (() => {
          const n = notasByP[p.id] || [];
          const abertas = n.filter(x => !x.resolvido).length;
          return abertas
            ? { v: textoNotas(n), cor: tomClaro('#B0700B'), corTexto: '#7A4E06' }
            : { v: textoNotas(n) };
        })(),
      ] });
    }
  }
  return out;
}

// ── Popup: escolher o que entra e em qual formato ─────────────────────────────
function ExportarSheet({ titulo, opcoes, onClose, onExportar }) {
  const [sel, setSel] = useState(() => opcoes.map(o => o.chave));
  const alterna = (k) => setSel(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);
  const todos = sel.length === opcoes.length;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 460, zIndex: 121, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 18px 12px', borderBottom: '0.5px solid var(--divider)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="t-micro">EXPORTAR</div>
            <div style={{ fontSize: 15, fontWeight: 900, marginTop: 3 }}>{titulo}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18 }}>×</button>
        </div>

        <div style={{ padding: '12px 18px', overflowY: 'auto', flex: 1 }}>
          <button onClick={() => setSel(todos ? [] : opcoes.map(o => o.chave))}
            className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
            {todos ? 'Desmarcar todos' : 'Marcar todos'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {opcoes.map(o => {
              const on = sel.includes(o.chave);
              return (
                <label key={o.chave} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                  cursor: 'pointer', background: on ? 'var(--primary-tint, rgba(14,108,184,0.07))' : 'var(--surface-2)',
                  border: '0.5px solid ' + (on ? 'rgba(14,108,184,0.35)' : 'var(--border)'),
                }}>
                  <input type="checkbox" checked={on} onChange={() => alterna(o.chave)} style={{ width: 17, height: 17, accentColor: 'var(--primary)', cursor: 'pointer' }} />
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: on ? 700 : 500 }}>{o.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)' }}>{o.n}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '12px 18px', borderTop: '0.5px solid var(--divider)', display: 'flex', gap: 8 }}>
          <button onClick={() => onExportar('pdf', sel)} disabled={sel.length === 0} style={{
            flex: 1, height: 46, borderRadius: 12, border: 'none', cursor: sel.length ? 'pointer' : 'default',
            background: sel.length ? 'var(--primary)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 800,
          }}>🖨️ PDF</button>
          <button onClick={() => onExportar('excel', sel)} disabled={sel.length === 0} style={{
            flex: 1, height: 46, borderRadius: 12, cursor: sel.length ? 'pointer' : 'default',
            border: '1.5px solid ' + (sel.length ? '#1D6F42' : 'var(--border)'),
            background: 'transparent', color: sel.length ? '#1D6F42' : 'var(--text-3)', fontSize: 14, fontWeight: 800,
          }}>📊 Excel</button>
        </div>
      </div>
    </div>
  );
}

function abrirPrint(html) {
  const w = window.open('', '_blank');
  if (!w) { alert('Habilite pop-ups para salvar o PDF.'); return; }
  w.document.write(html); w.document.close(); w.focus();
  setTimeout(() => w.print(), 350);
}
// Cabeçalho igual ao dos outros módulos; aqui fica só o que é do Gantt.
const CSS_PROJETOS = `
.cols{display:flex;gap:10px;align-items:flex-start}.col{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px}
.pcard{border:1px solid #e5e7eb;border-radius:6px;padding:6px 8px;margin-bottom:6px}
.pcard b{font-size:11px}.pcard .sub{font-size:10px;color:#666}
`;
const printBase = (titulo, body, paisagem = true) => paginaPDF({
  titulo, obra: obraAtual(), logoUrl: logoAtual(), data: todayISO(),
  corpo: body, css: CSS_PROJETOS, paisagem,
});

function linhaTabela(p, ctx) {
  const sit = situacao(p); const al = alertasDe(p, ctx).map(a => a.label).join(', ');
  return `<tr>
    <td>${p.nome || ''}</td><td>${p.disciplina || ''}</td>
    <td>${p.data_inicio ? fmtDate(p.data_inicio) : ''}</td>
    <td>${p.duracao_dias != null ? p.duracao_dias : ''}</td>
    <td>${p.data_prevista ? fmtDate(p.data_prevista) : ''}</td>
    <td>${p.data_recebida ? fmtDate(p.data_recebida) : ''}</td>
    <td><span class="tag" style="background:${ST[sit].bg}">${ST[sit].label}</span></td>
    <td style="color:#B45309">${al}</td></tr>`;
}
function printLista(byStatus, ctx, periodoLbl) {
  const secao = (sk) => (byStatus[sk] && byStatus[sk].length)
    ? `<h2>${ST[sk].label} (${byStatus[sk].length})</h2><table><thead><tr><th>Projeto</th><th>Disciplina</th><th>Início</th><th>Dur.</th><th>Entrega</th><th>Recebido</th><th>Situação</th><th>Alertas</th><th>Anotações</th></tr></thead><tbody>${byStatus[sk].map(p => linhaTabela(p, ctx)).join('')}</tbody></table>` : '';
  const body = `<div class="meta">${periodoLbl}</div>${STATUS_ORDER.map(secao).join('')}`;
  return printBase('Projetos — Lista', body);
}
// PDF da visão por projetista: uma tabela por escritório, na mesma ordem da tela
// (mais atrasos primeiro). É a folha que vai junto na cobrança.
function printProjetista(grupos, ctx, periodoLbl, notasByP = {}) {
  const secao = (g) => {
    const disc = g.itens.find(i => i.disciplina)?.disciplina;
    const semPrazo = g.itens.filter(i => !isRecebido(i) && !i.data_prevista).length;
    const selos = [
      g.atrasados ? `<span class="tag" style="background:${COR_ATRASO.bg}">${g.atrasados} atrasado(s)</span>` : '',
      semPrazo    ? `<span class="tag" style="background:#7C3AED">${semPrazo} sem prazo</span>` : '',
    ].join(' ');
    return `<h2>${g.nome} <span class="sub">${disc ? disc + ' · ' : ''}${g.itens.length} entregável(is)</span> ${selos}</h2>
      <table><thead><tr><th>Entregável</th><th>Etapa</th><th>Emissão</th><th>Entrega</th><th>Recebido</th><th>Situação</th><th>Alertas</th><th>Anotações</th></tr></thead>
      <tbody>${ordenarVenc(g.itens).map(p => {
        const sit = situacao(p);
        const al = alertasDe(p, ctx).map(a => a.label).join(', ');
        const e = etapaDe(p.etapa);
        return `<tr>
          <td>${p.nome || ''}</td><td>${e ? e.label : ''}</td><td>${p.revisao || ''}</td>
          <td>${p.data_prevista ? fmtDate(p.data_prevista) : '<b style="color:#7C3AED">sem prazo</b>'}</td>
          <td>${p.data_recebida ? fmtDate(p.data_recebida) : ''}</td>
          <td><span class="tag" style="background:${ST[sit].bg}">${ST[sit].label}</span></td>
          <td style="color:#B45309">${al}</td>
          <td style="white-space:pre-line">${(notasByP[p.id] || []).length ? textoNotas(notasByP[p.id]) : ''}</td></tr>`;
      }).join('')}</tbody></table>`;
  };
  const body = `<div class="meta">${periodoLbl}</div>${grupos.map(secao).join('')}`;
  return printBase('Projetos — Por projetista', body);
}
function printKanban(byStatus, ctx, chaves = STATUS_ORDER) {
  const col = (sk) => `<div class="col"><h2 style="border-color:${ST[sk].bg};color:${ST[sk].color}">${ST[sk].label} (${(byStatus[sk] || []).length})</h2>${(byStatus[sk] || []).map(p => {
    const al = alertasDe(p, ctx).map(a => a.label).join(', ');
    return `<div class="pcard"><b>${p.nome || ''}</b><div class="sub">${p.disciplina || 'Projeto'}</div><div class="sub">Entrega: ${p.data_prevista ? fmtDate(p.data_prevista) : '—'}${p.duracao_dias ? ' · ' + p.duracao_dias + 'd' : ''}</div>${al ? `<div style="color:#B45309;font-size:10px;font-weight:700">⚠ ${al}</div>` : ''}</div>`;
  }).join('') || '<div class="sub">Nada aqui</div>'}</div>`;
  const body = `<div class="cols">${chaves.map(col).join('')}</div>`;
  return printBase('Projetos — Quadro', body);
}
function printGantt(all, ctx, dayW) {
  const ROW_H = 26, LABEL_W = 200, HEADER_H = 26;
  const L = ganttLayout(all, ctx, Math.max(6, Math.min(dayW, 14)), ROW_H);
  if (!L) return printBase('Projetos — Gantt', '<p>Sem projetos com datas.</p>');
  const W = LABEL_W + L.timelineW, H = HEADER_H + L.rows.length * ROW_H;
  const diamond = (cx, cy, s) => `${cx},${cy - s} ${cx + s},${cy} ${cx},${cy + s} ${cx - s},${cy}`;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif">`;
  svg += `<line x1="${LABEL_W}" y1="0" x2="${LABEL_W}" y2="${H}" stroke="#ccc"/>`;
  L.meses.forEach(m => { const mx = LABEL_W + L.x(m); svg += `<line x1="${mx}" y1="0" x2="${mx}" y2="${H}" stroke="#eee"/><text x="${mx + 3}" y="${HEADER_H - 8}" font-size="10" fill="#444" font-weight="bold">${L.mesLabel(m)}</text>`; });
  svg += `<line x1="${LABEL_W + L.todayX}" y1="${HEADER_H}" x2="${LABEL_W + L.todayX}" y2="${H}" stroke="rgba(220,38,38,0.6)" stroke-width="1.5"/>`;
  L.conns.forEach(c => { const midx = Math.max(c.x1 + 8, c.x2 - 8); svg += `<path d="M ${LABEL_W + c.x1} ${HEADER_H + c.y1} H ${LABEL_W + midx} V ${HEADER_H + c.y2} H ${LABEL_W + c.x2}" fill="none" stroke="${c.color}" stroke-width="1" stroke-dasharray="3 3"/>`; });
  L.items.forEach(({ p, i, color, hasBar, barLeft, barW, inicioX, previstaX, recebidaX }) => {
    const yTop = HEADER_H + i * ROW_H, cy = yTop + ROW_H / 2;
    if (i % 2) svg += `<rect x="0" y="${yTop}" width="${W}" height="${ROW_H}" fill="#fafafa"/>`;
    const nome = (p.nome || '').replace(/[<&]/g, '');
    svg += `<text x="8" y="${cy + 3}" font-size="10" fill="#111">${nome.length > 32 ? nome.slice(0, 31) + '…' : nome}</text>`;
    if (hasBar) svg += `<rect x="${LABEL_W + barLeft}" y="${cy - 7}" width="${barW}" height="14" rx="3" fill="${color}" opacity="${isRecebido(p) ? 0.55 : 1}"/>`;
    else if (inicioX != null) svg += `<circle cx="${LABEL_W + inicioX}" cy="${cy}" r="4" fill="${color}"/>`;
    if (previstaX != null) svg += `<polygon points="${diamond(LABEL_W + previstaX, cy, 5)}" fill="#111827"/>`;
    if (recebidaX != null) svg += `<circle cx="${LABEL_W + recebidaX}" cy="${cy}" r="6" fill="${ST.recebido.bg}"/><text x="${LABEL_W + recebidaX}" y="${cy + 3}" font-size="8" fill="#fff" text-anchor="middle">✓</text>`;
  });
  svg += `</svg>`;
  const body = `<div class="meta">◆ entrega prevista · ● recebido · linha vermelha = hoje · tracejado = dependência</div><div style="overflow:auto">${svg}</div>`;
  return printBase('Projetos — Gantt', body);
}

// ── Tela principal ────────────────────────────────────────────────────────────
export function ProjetosScreen() {
  const [all, setAll]             = useState([]);
  const [notas, setNotas]         = useState([]);
  const [deps, setDeps]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tabelaFalta, setTabelaFalta] = useState(false);
  const [tab, setTab]             = useState('em_andamento');
  const [q, setQ]                 = useState('');
  const [viewMode, setViewMode]   = useState('quadro');
  const [sortMode, setSortMode]   = useState('venc'); // venc | manual
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const [editTable, setEditTable] = useState(false);
  const [dayW, setDayW]           = useState(22);
  // Abre no mês: é o recorte que responde "o que é para agora". Tudo e Semana
  // ficam a um clique.
  const [escopo, setEscopo]       = useState('mes');    // tudo | semana | mes
  const [tabProj, setTabProj]     = useState('todos');  // filtro de situação na visão Projetista
  const [offset, setOffset]       = useState(0);
  const [modal, setModal]         = useState(null);
  const [selected, setSelected]   = useState(null);

  const isDesktop = useIsDesktop(900);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { data: nt }, { data: dp }] = await Promise.all([
      supabase.from('projetos').select('*'),
      supabase.from('projetos_comentarios').select('*').order('created_at', { ascending: true }),
      supabase.from('projetos_dependencias').select('projeto_id, depende_de_id'),
    ]);
    supabase.from('relatorio_semanal_config').select('*').eq('id', 1).maybeSingle()
      .then(({ data: cfg }) => definirObra(cfg));
    if (error) {
      console.error('Erro ao carregar projetos:', error);
      if (error.code === '42P01' || /projetos/.test(error.message)) setTabelaFalta(true);
      else setLoadError(motivoAmigavel(error));
    } else { setTabelaFalta(false); setLoadError(null); }
    setAll(data || []); setNotas(nt || []); setDeps(dp || []); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const ctx = useMemo(() => {
    const byId = Object.fromEntries(all.map(p => [p.id, p]));
    const paisDe = {}, filhosDe = {};
    for (const d of deps) {
      (paisDe[d.projeto_id]    = paisDe[d.projeto_id]    || []).push(d.depende_de_id);
      (filhosDe[d.depende_de_id] = filhosDe[d.depende_de_id] || []).push(d.projeto_id);
    }
    const predsDe = (id) => (paisDe[id]   || []).map(x => byId[x]).filter(Boolean);
    const sucsDe  = (id) => (filhosDe[id] || []).map(x => byId[x]).filter(Boolean);
    return { byId, predsDe, sucsDe, emRisco: makeEmRisco(byId, predsDe) };
  }, [all, deps]);
  const notasByP = useMemo(() => { const m = {}; for (const n of notas) (m[n.projeto_id] ||= []).push(n); return m; }, [notas]);

  const matchesBusca = useCallback((p) => {
    if (!q.trim()) return true;
    return contem(p.nome, q) || contem(p.disciplina, q) || contem(p.responsavel_nome, q);
  }, [q]);

  const candidatosVis = useMemo(() => all.filter(p => (mostrarOcultos || !p.oculto) && matchesBusca(p)), [all, mostrarOcultos, matchesBusca]);
  // O recorte de período vem depois da busca: procurar por nome deve achar o
  // projeto mesmo que ele caia fora da semana escolhida.
  const recorte  = useMemo(() => filtrarPorPeriodo(candidatosVis, escopo, offset), [candidatosVis, escopo, offset]);
  const visiveis = recorte.dentro;
  const foraDoPeriodo = candidatosVis.length - visiveis.length;

  const ordenar = useCallback((list) => {
    if (sortMode === 'manual') return [...list].sort((a, b) => ((a.ordem ?? 9999) - (b.ordem ?? 9999)) || (a.nome || '').localeCompare(b.nome || ''));
    return ordenarVenc(list);
  }, [sortMode]);

  const byStatus = useMemo(() => {
    const out = { nao_iniciado: [], em_andamento: [], recebido: [] };
    for (const p of visiveis) out[situacao(p)]?.push(p);
    for (const k of STATUS_ORDER) out[k] = ordenar(out[k]);
    return out;
  }, [visiveis, ordenar]);

  const totais = useMemo(() => ({
    nao_iniciado: visiveis.filter(p => situacao(p) === 'nao_iniciado').length,
    em_andamento: visiveis.filter(p => situacao(p) === 'em_andamento').length,
    recebido:     visiveis.filter(p => situacao(p) === 'recebido').length,
    atrasados:    visiveis.filter(p => estaAtrasado(p)).length,
  }), [visiveis]);
  const totalAlertas = useMemo(() => visiveis.filter(p => alertasDe(p, ctx).length > 0).length, [visiveis, ctx]);

  function onChanged() { setSelected(null); setModal(null); load(); }
  const listForTab = byStatus[tab] || [];
  const showQuadro = isDesktop && viewMode === 'quadro';
  const showGantt  = isDesktop && viewMode === 'gantt';
  const showProjetista = isDesktop && viewMode === 'projetista';
  const selectedLive = selected ? (all.find(p => p.id === selected.id) || selected) : null;
  const periodoLbl = `${visiveis.length} projeto(s) · ${rotuloPeriodo(escopo, offset)} · gerado em ${fmtDate(todayISO())}`;

  // Projetista e Quadro passam pelo popup de seleção; Lista e Gantt saem direto,
  // porque neles não há o que escolher além do que já está na tela.
  function gerarRelatorio() {
    if (showProjetista || showQuadro) { setModal('exportar'); return; }
    if (showGantt) abrirPrint(printGantt(ordenar(visiveis), ctx, dayW));
    else abrirPrint(printLista(byStatus, ctx, periodoLbl));
  }

  const listaProjetista  = useMemo(
    () => ordenar(tabProj === 'todos' ? visiveis : visiveis.filter(p => situacao(p) === tabProj)),
    [visiveis, ordenar, tabProj]);
  const gruposProjetista = useMemo(() => agruparPorProjetista(listaProjetista), [listaProjetista]);
  const opcoesExport = showProjetista
    ? gruposProjetista.map(g => ({ chave: g.nome, label: g.nome, n: g.itens.length }))
    : STATUS_ORDER.map(k => ({ chave: k, label: ST[k].label, n: (byStatus[k] || []).length }));

  function exportar(formato, escolhidos) {
    setModal(null);
    const sel = new Set(escolhidos);
    if (showProjetista) {
      const grupos = gruposProjetista.filter(g => sel.has(g.nome));
      if (formato === 'pdf') abrirPrint(printProjetista(grupos, ctx, periodoLbl, notasByP));
      else baixarExcel(`projetos-por-projetista-${todayISO()}.xls`, planilhaHTML({
        titulo: 'Projetos por projetista', colunas: COLS_EXPORT,
        linhas: linhasExcel(grupos, ctx, notasByP), data: todayISO(),
      }));
      return;
    }
    const chaves = STATUS_ORDER.filter(k => sel.has(k));
    if (formato === 'pdf') abrirPrint(printKanban(byStatus, ctx, chaves));
    else {
      const grupos = chaves.map(k => ({ nome: ST[k].label, itens: byStatus[k] || [] }));
      baixarExcel(`projetos-quadro-${todayISO()}.xls`, planilhaHTML({
        titulo: 'Projetos por situação', colunas: COLS_EXPORT,
        linhas: linhasExcel(grupos, ctx, notasByP), data: todayISO(),
      }));
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={totalAlertas ? `${totais.atrasados} atrasados · ⚠ ${totalAlertas} em alerta` : `${totais.em_andamento} em andamento`}
        title="Projetos"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isDesktop && (
              <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
                {[['quadro', Icon.kanban, 'Quadro'], ['projetista', Icon.users, 'Projetista'], ['lista', Icon.clipboardList, 'Lista'], ['gantt', Icon.barChart, 'Gantt']].map(([k, ic, lbl]) => (
                  <button key={k} onClick={() => setViewMode(k)} title={lbl} style={{
                    height: 32, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                    background: viewMode === k ? 'var(--surface)' : 'transparent',
                    color: viewMode === k ? 'var(--text-1)' : 'var(--text-3)',
                    boxShadow: viewMode === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}><span style={{ width: 15, height: 15 }}>{ic}</span>{lbl}</button>
                ))}
              </div>
            )}
            <button onClick={gerarRelatorio} className="btn btn-secondary btn-sm" title="Gerar relatório em PDF ou Excel">📄 Relatório</button>
            <button className="btn btn-primary btn-sm" onClick={() => { setSelected(null); setModal('novo'); }}>
              <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Novo
            </button>
          </div>
        }
      />

      {showProjetista && (
        <StatChips valor={tabProj} onChange={setTabProj} itens={[
          { chave: 'todos',        label: 'Todos',         n: visiveis.length,      cor: 'var(--text-2)' },
          { chave: 'nao_iniciado', label: 'Não iniciados', n: totais.nao_iniciado, cor: ST.nao_iniciado.bg },
          { chave: 'em_andamento', label: 'Em andamento',  n: totais.em_andamento, cor: ST.em_andamento.bg },
          { chave: 'recebido',     label: 'Recebidos',     n: totais.recebido,     cor: ST.recebido.bg },
        ]} />
      )}

      {!showQuadro && !showGantt && !showProjetista && (
        <StatChips valor={tab} onChange={setTab} itens={[
          { chave: 'nao_iniciado', label: 'Não iniciados', n: totais.nao_iniciado, cor: ST.nao_iniciado.bg },
          { chave: 'em_andamento', label: 'Em andamento',  n: totais.em_andamento, cor: ST.em_andamento.bg },
          { chave: 'recebido',     label: 'Recebidos',     n: totais.recebido,     cor: ST.recebido.bg },
        ]} />
      )}

      {/* Recorte de período — o que é DESTA semana / DESTE mês */}
      <div style={{ padding: '0 var(--pad-4) 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
          {[['tudo', 'Tudo'], ['semana', 'Semana'], ['mes', 'Mês']].map(([k, lbl]) => (
            <button key={k} onClick={() => { setEscopo(k); setOffset(0); }} style={{
              height: 30, padding: '0 13px', border: 'none', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 700,
              background: escopo === k ? 'var(--surface)' : 'transparent',
              color: escopo === k ? 'var(--text-1)' : 'var(--text-3)',
              boxShadow: escopo === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>{lbl}</button>
          ))}
        </div>
        {escopo !== 'tudo' && (
          <div className="row-flex" style={{ gap: 4 }}>
            <button onClick={() => setOffset(o => o - 1)} className="btn btn-ghost btn-sm" style={{ width: 32 }} title="Anterior">‹</button>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', minWidth: 168, textAlign: 'center' }}>
              {rotuloPeriodo(escopo, offset)}
            </span>
            <button onClick={() => setOffset(o => o + 1)} className="btn btn-ghost btn-sm" style={{ width: 32 }} title="Próximo">›</button>
            {offset !== 0 && <button onClick={() => setOffset(0)} className="btn btn-ghost btn-sm" title="Voltar para o atual">hoje</button>}
          </div>
        )}
        {escopo !== 'tudo' && foraDoPeriodo > 0 && (
          <span className="t-caption" title="Não entram no recorte: fora do período ou sem data para julgar">
            {foraDoPeriodo} fora do período
            {recorte.semData.length > 0 && ` · ${recorte.semData.length} sem data`}
          </span>
        )}
      </div>

      {/* Controles */}
      {!showGantt && (
        <div style={{ padding: '0 var(--pad-4) 8px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="search" style={{ flex: 1, minWidth: 180 }}>
            <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.search}</span>
            <input placeholder="Buscar…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 15 }} />
          </div>
          <button onClick={() => setEditTable(true)} className="btn btn-secondary btn-sm" title="Editar vários"><span style={{ width: 14, height: 14 }}>{Icon.edit}</span>Editar</button>
          <button onClick={() => setSortMode(s => s === 'venc' ? 'manual' : 'venc')} className="btn btn-ghost btn-sm" title="Alternar ordenação">
            {sortMode === 'venc' ? '↕ Vencimento' : '↕ Manual'}
          </button>
          <button onClick={() => setMostrarOcultos(v => !v)} className="btn btn-ghost btn-sm" title="Mostrar ocultos">
            <span style={{ width: 14, height: 14 }}>{mostrarOcultos ? Icon.eye : Icon.eyeOff}</span>{mostrarOcultos ? 'Ocultos' : 'Ocultos'}
          </button>
        </div>
      )}

      {/* Zoom do Gantt */}
      {showGantt && (
        <div style={{ padding: '0 var(--pad-4) 10px', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="t-caption" style={{ fontWeight: 700 }}>Zoom da timeline:</span>
          <button onClick={() => setDayW(w => Math.max(10, w - 4))} className="btn btn-ghost btn-sm" style={{ width: 34 }}>−</button>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)', minWidth: 46, textAlign: 'center' }}>{dayW} px/dia</span>
          <button onClick={() => setDayW(w => Math.min(48, w + 4))} className="btn btn-ghost btn-sm" style={{ width: 34 }}>+</button>
          <button onClick={() => setMostrarOcultos(v => !v)} className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} title="Mostrar ocultos">
            <span style={{ width: 14, height: 14 }}>{mostrarOcultos ? Icon.eye : Icon.eyeOff}</span>Ocultos
          </button>
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Carregando…</div>}

      {!loading && tabelaFalta && (
        <div className="page-pad"><div className="card" style={{ padding: '16px', borderLeft: '4px solid var(--warn, #D97706)' }}>
          <div className="t-strong">Tabela ainda não criada</div>
          <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.5 }}>Rode o <b>supabase-projetos.sql</b> no Supabase e toque em "Tentar novamente".</div>
          <button onClick={load} className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}>Tentar novamente</button>
        </div></div>
      )}
      {!loading && loadError && !tabelaFalta && (
        <div className="page-pad"><div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid var(--danger)' }}>
          <div className="t-strong" style={{ color: 'var(--danger)' }}>Erro ao carregar projetos</div>
          <div className="t-caption" style={{ marginTop: 4 }}>{loadError}</div>
          <button onClick={load} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Tentar novamente</button>
        </div></div>
      )}

      {!loading && !tabelaFalta && !loadError && showGantt && (
        <GanttView all={visiveis} ctx={ctx} dayW={dayW} onCardClick={p => { setSelected(p); setModal(null); }} />
      )}
      {!loading && !tabelaFalta && !loadError && showQuadro && (
        <BoardView byStatus={byStatus} ctx={ctx} notasByP={notasByP} onCardClick={p => { setSelected(p); setModal(null); }} />
      )}
      {!loading && !tabelaFalta && !loadError && showProjetista && (
        <ProjetistaView lista={listaProjetista} ctx={ctx} notasByP={notasByP} isDesktop={isDesktop}
                        onCardClick={p => { setSelected(p); setModal(null); }} />
      )}
      {!loading && !tabelaFalta && !loadError && !showQuadro && !showGantt && !showProjetista && (
        <div className="page-pad stack stack-2" style={{ paddingTop: 0 }}>
          {listForTab.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div className="t-strong">Nenhum projeto aqui</div>
              <div className="t-caption" style={{ marginTop: 4 }}>{tab === 'nao_iniciado' ? 'Cadastre um novo projeto.' : tab === 'em_andamento' ? 'Nada em desenvolvimento agora.' : 'Marque projetos como recebidos.'}</div>
            </div>
          )}
          {listForTab.map(p => (
            <ProjetoCard key={p.id} p={p} preds={ctx.predsDe(p.id)} alertas={alertasDe(p, ctx)} notas={notasByP[p.id] || []} isDesktop={isDesktop} onClick={() => { setSelected(p); setModal(null); }} />
          ))}
        </div>
      )}

      {selectedLive && !modal && (
        <ProjetoSheet p={selectedLive} ctx={ctx} onSimular={() => setModal('simular')} alertas={alertasDe(selectedLive, ctx)} notas={notasByP[selectedLive.id] || []}
          onClose={() => setSelected(null)} onChanged={onChanged} onRefresh={load}
          onEdit={() => setModal('editar')} onReceber={() => setModal('receber')} />
      )}
      {modal === 'novo' && <ProjetoForm todos={all} depsTodas={deps} onClose={() => setModal(null)} onSaved={onChanged} />}
      {modal === 'editar' && selected && <ProjetoForm projeto={selected} todos={all} depsTodas={deps} onClose={() => setModal(null)} onSaved={onChanged} />}
      {modal === 'receber' && selected && <ReceberModal projeto={selected} onClose={() => setModal(null)} onSaved={onChanged} />}
      {modal === 'exportar' && (
        <ExportarSheet
          titulo={showProjetista ? 'Projetos por projetista' : 'Quadro por situação'}
          opcoes={opcoesExport}
          onClose={() => setModal(null)}
          onExportar={exportar}
        />
      )}
      {modal === 'simular' && selectedLive && <SimulacaoSheet p={selectedLive} todos={all} deps={deps} onClose={() => setModal(null)} />}
      {editTable && <TabelaEditavel projetos={all} onClose={() => setEditTable(false)} onSaved={() => { setEditTable(false); load(); }} />}
    </div>
  );
}
