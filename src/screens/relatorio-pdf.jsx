import { MARCA } from '../marca.js';
import { useState, useEffect } from 'react';
import { Icon } from '../components/index';
import { supabase } from '../lib/supabase';
import { getDerivedStatus } from './mestre-rdo-v2';
import { hojeLocal, toISODate, parseISODate } from '../lib/date';
import { chaveDoDia, DIA_ORDEM, DIA_CURTO } from '../lib/atividades-do-dia';
import { statusDaSemana, contratacoesDaSemana, indicadores, N } from '../lib/fechamento-semana';
import { MOTIVOS_NAO_EXEC } from '../data/index';

const OBRA_NOME = MARCA.obra;
const COR = '#1B6B3A';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}
function fmtDate(s) {
  return new Date(s + 'T12:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
function fmtDateLong(s) {
  return new Date(s + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
}
function calcDias(fim) {
  if (!fim) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const [y,m,d] = fim.split('-').map(Number);
  return Math.ceil((new Date(y,m-1,d) - hoje) / 86400000);
}
function getWeekDays() {
  const { monday } = getWeekRange();
  return [0,1,2,3,4].map(i => {
    const d = new Date(monday); d.setDate(monday.getDate() + i);
    return toISODate(d);
  });
}

/** Retorna { from, to, label, weekDays, num } para o período selecionado */
function getPeriodRange(tipo, offset) {
  const now = new Date();
  if (tipo === 'semana') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
    const from = toISODate(monday);
    const to   = toISODate(sunday);
    const label = `${fmtDate(from)} – ${fmtDate(to)}`;
    const weekDays = [0,1,2,3,4].map(i => {
      const d = new Date(monday); d.setDate(monday.getDate() + i);
      return toISODate(d);
    });
    // Numeração da semana da obra. A versão antiga misturava `new Date('...')`
    // (meia-noite UTC) com uma segunda-feira em horário local, e usava ceil:
    // a própria semana-base dava 2 e todas as outras ficavam deslocadas.
    const base = MARCA.inicioObra ? parseISODate(MARCA.inicioObra) : null;
    const refSeg = new Date(monday); refSeg.setHours(12, 0, 0, 0);
    // Sem data da obra em marca.js, num fica null e o cabeçalho sai sem "Semana N".
    const num = base ? Math.max(1, Math.floor((refSeg - base) / (7 * 86400000)) + 1) : null;
    return { from, to, label, weekDays, num };
  } else {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const from = toISODate(d);
    const to   = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const mesNome = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const label = mesNome.charAt(0).toUpperCase() + mesNome.slice(1);
    // A grade do RDO é Seg–Sex. Antes pegava os dias 1 a 5 do mês — que podem
    // cair em sábado/domingo — e os rotulava como Seg–Sex. Agora usa a semana
    // útil de referência: a semana de hoje se for o mês corrente, senão a
    // última semana do mês selecionado.
    const ultimoDia = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const ref = (now.getFullYear() === d.getFullYear() && now.getMonth() === d.getMonth()) ? now : ultimoDia;
    const segunda = new Date(ref);
    segunda.setDate(ref.getDate() - (ref.getDay() === 0 ? 6 : ref.getDay() - 1));
    const weekDays = [0,1,2,3,4].map(i => {
      const dd = new Date(segunda); dd.setDate(segunda.getDate() + i);
      return toISODate(dd);
    });
    return { from, to, label, weekDays, num: null };
  }
}

const TODAY = hojeLocal();
const DAY_NAMES_SHORT = ['Seg','Ter','Qua','Qui','Sex'];

// ── Componentes de estilo ─────────────────────────────────────────────────────
const H = (props) => <div style={{ fontWeight: 800, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: COR, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }} {...props} />;
const Rule = () => <div style={{ height: 1, background: '#E5E5E5', margin: '8px 0' }} />;
const Label = ({ style, ...props }) => <div style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: '#888', marginBottom: 2, ...style }} {...props} />;
const Empty = ({ msg }) => <div style={{ padding: '16px 0', textAlign: 'center', color: '#999', fontSize: 10, fontStyle: 'italic' }}>{msg}</div>;


// DayCol: cabeçalho de coluna de dia (reutilizado em RDO e Efetivo)
function DayCol({ ds, idx, isToday, children, countBadge }) {
  return (
    <div style={{ border: `1px solid ${isToday ? COR : '#E5E5E5'}`, borderRadius: 5, overflow: 'hidden', minWidth: 0 }}>
      <div style={{ background: isToday ? COR : '#F8F8F8', padding: '4px 6px' }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: isToday ? '#fff' : '#555' }}>{DAY_NAMES_SHORT[idx]}</div>
        <div style={{ fontSize: 7.5, color: isToday ? 'rgba(255,255,255,0.8)' : '#888' }}>{fmtDate(ds)}</div>
        {countBadge !== undefined && (
          <div style={{ fontSize: 13, fontWeight: 900, color: isToday ? '#fff' : '#1B1B1B', marginTop: 1, lineHeight: 1 }}>{countBadge}</div>
        )}
      </div>
      <div style={{ padding: '4px 5px' }}>{children}</div>
    </div>
  );
}

// ─── Design system (DM Sans / Space Grotesk — segue a referência) ─────────────
const PALETTE = { primary: '#00B8A4', primaryDeep: '#1B6B3A', primaryInk: '#0E3A2B', soft: '#EAF5F0', softer: '#F3FBF8' };

// Largura mínima da folha na prévia. Abaixo disso os três quadros de indicador
// viram colunas de uma palavra por linha. No computador o cartão tem ~1000px e
// nada muda; no celular a folha passa a rolar de lado em vez de espremer.
const LARGURA_MIN_FOLHA = 640;
const T = {
  ink: '#0B1011', ink2: '#2C3438', ink3: '#6B7479', ink4: '#A8AFB3',
  rule: '#E6E8E9', bg: '#FFFFFF', bg2: '#F8F9F8', bg3: '#F0F2F1',
  tint: PALETTE.softer, tintMid: PALETTE.soft,
  accent: PALETTE.primary, accentDeep: PALETTE.primaryDeep, accentInk: PALETTE.primaryInk,
  font: '"Space Grotesk","DM Sans",system-ui,sans-serif',
  fontMono: '"JetBrains Mono",ui-monospace,monospace',
};

function useReportFonts() {
  useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('rep-fonts')) return;
    const link = document.createElement('link');
    link.id = 'rep-fonts';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap';
    document.head.appendChild(link);
  }, []);
}

function CRMark({ size = 18, color = T.accent }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect width="24" height="24" rx="3" fill={color}/>
      <path d="M5 18 L12 6 L19 18 Z" fill="white"/>
    </svg>
  );
}

function PageWrap({ pageNum = 1, totalPages = 1, moduleNum, moduleTitle, kicker, periodLabel, submetidoPor, headerExtra, children }) {
  return (
    <div style={{
      fontFamily: T.font, color: T.ink, background: T.bg,
      position: 'relative', minHeight: '100%', display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ height: 44, background: T.ink, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <CRMark size={18} color={T.accent}/>
          <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: -0.2 }}>{MARCA.nome}</span>
          <span style={{ width: 1, height: 14, background: 'rgba(255,255,255,.15)', margin: '0 8px' }}/>
          <span style={{ fontSize: 11, color: '#B8C2C4', fontWeight: 500 }}>Relatório · {periodLabel}</span>
        </div>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#B8C2C4' }}>{OBRA_NOME}</span>
          <span style={{ fontFamily: T.fontMono, fontSize: 11, color: 'white', background: 'rgba(255,255,255,.10)', padding: '3px 8px', borderRadius: 4 }}>
            {String(pageNum).padStart(2, '0')} / {String(totalPages).padStart(2, '0')}
          </span>
        </div>
      </div>
      <div style={{ padding: '20px 24px 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: T.fontMono, fontSize: 11, color: T.accent, fontWeight: 600, letterSpacing: 0.4 }}>MÓD. {String(moduleNum).padStart(2, '0')}</span>
            <span style={{ width: 24, height: 1, background: T.accent }}/>
            <span style={{ fontSize: 10.5, color: T.ink3, letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 600 }}>{periodLabel}</span>
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 600, color: T.ink, letterSpacing: -0.6, lineHeight: 1.05 }}>{moduleTitle}</h1>
          {kicker && <div style={{ marginTop: 3, fontSize: 12, color: T.ink3, lineHeight: 1.35, maxWidth: 720 }}>{kicker}</div>}
        </div>
        {headerExtra}
      </div>
      <div style={{ flex: 1, padding: '18px 24px 24px' }}>
        {children}
      </div>
      <div style={{ height: 26, background: T.bg2, borderTop: `1px solid ${T.rule}`, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: T.ink3, fontWeight: 500 }}>{OBRA_NOME}</span>
        <span style={{ fontSize: 10, color: T.ink3, fontWeight: 500, fontFamily: T.fontMono }}>
          {submetidoPor ? `Enviado por ${submetidoPor} · ` : ''}{new Date().toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  );
}

function KPICard({ label, value, unit, hint }) {
  return (
    <div style={{ background: T.bg2, border: `1px solid ${T.rule}`, borderRadius: 8, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 10.5, color: T.ink3, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
        <span style={{ fontSize: 32, fontWeight: 600, color: T.ink, lineHeight: 1, letterSpacing: -0.8, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 12, color: T.ink3, fontWeight: 500 }}>{unit}</span>}
      </div>
      {hint && <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

const PILL_MAP = {
  aberta:       { bg: '#FCEFE1', fg: '#A23F1A', dot: '#E07A2E', label: 'Aberta' },
  em_andamento: { bg: '#E1ECF7', fg: '#1B4F88', dot: '#1B4F88', label: 'Em andamento' },
  atrasada:     { bg: '#FCDFD7', fg: '#9A1A0E', dot: '#C0272D', label: 'Atrasada' },
  resolvida:    { bg: PALETTE.soft, fg: PALETTE.primaryDeep, dot: PALETTE.primary, label: 'Resolvida' },
  pendente:     { bg: '#FBF1D6', fg: '#7A5800', dot: '#D69C00', label: 'Em trânsito' },
  aprovado:     { bg: '#FBF1D6', fg: '#7A5800', dot: '#D69C00', label: 'Em trânsito' },
  parcial:      { bg: '#E1ECF7', fg: '#1B4F88', dot: '#1B4F88', label: 'Parcial' },
  recebido:     { bg: PALETTE.soft, fg: PALETTE.primaryDeep, dot: PALETTE.primary, label: 'Recebido' },
  feita:        { bg: PALETTE.soft, fg: PALETTE.primaryDeep, dot: PALETTE.primary, label: 'Feita' },
  nao_feita:    { bg: '#FCEFE1', fg: '#A23F1A', dot: '#E07A2E', label: 'Não feita' },
  em_aberto:    { bg: '#E1ECF7', fg: '#1B4F88', dot: '#1B4F88', label: 'Em aberto' },
  enviado:      { bg: '#FBF1D6', fg: '#7A5800', dot: '#D69C00', label: 'Enviado' },
  ativo:        { bg: PALETTE.soft, fg: PALETTE.primaryDeep, dot: PALETTE.primary, label: 'Vigente' },
  devolvido:    { bg: '#EFEAE0', fg: '#5C5448', dot: '#A89C84', label: 'Devolvido' },
};
function Pill({ status }) {
  const c = PILL_MAP[status] || { bg: '#eee', fg: '#000', dot: '#999', label: status || '—' };
  return (
    <span style={{ background: c.bg, color: c.fg, fontSize: 10, fontWeight: 600, padding: '3px 8px 3px 6px', borderRadius: 4, display: 'inline-flex', alignItems: 'center', gap: 5, letterSpacing: 0.1 }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: c.dot, display: 'inline-block' }}/>
      {c.label}
    </span>
  );
}

// ── Página RDO — visão geral (KPIs + atividades em destaque) ───────────────
// Linha de dias de um serviço no PDF: chip por dia planejado, na cor do status
// DAQUELE dia (status_por_dia): ver os dias, não só a lista.
// Dia não planejado sai apagado, pra régua da semana ficar visível no papel.
function DiasDoServico({ dias = [], statusPorDia = {}, statusGeral }) {
  if (!dias.length) return null;
  const ORDEM = DIA_ORDEM;
  const LBL = DIA_CURTO;
  const COR = {
    feita:        { bg: '#DCEFE3', fg: '#1F6B3A' },
    concluida:    { bg: '#DCEFE3', fg: '#1F6B3A' },
    em_andamento: { bg: '#FBF1D6', fg: '#7A5800' },
    nao_feita:    { bg: '#FCDFD7', fg: '#9A1A0E' },
  };
  const mostrar = ORDEM.filter(d => dias.includes(d) || (d !== 'sab' && d !== 'dom'));
  return (
    <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
      {mostrar.map(d => {
        const planejado = dias.includes(d);
        // um serviço de dia único não tem mapa: usa o status geral no seu dia
        const st = planejado ? (statusPorDia?.[d] || (dias.length === 1 ? statusGeral : null)) : null;
        const c = st && COR[st];
        return (
          <span key={d} style={{
            fontSize: 8.5, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
            fontVariantNumeric: 'tabular-nums', letterSpacing: 0.2,
            background: planejado ? (c ? c.bg : 'transparent') : 'transparent',
            color: planejado ? (c ? c.fg : T.ink2) : T.rule,
            border: `1px solid ${planejado ? (c ? c.fg + '44' : T.ink3) : T.rule}`,
          }}>{LBL[d]}</span>
        );
      })}
    </div>
  );
}

function PageRDO({ dados, weekDays, periodLabel, pageNum = 1, totalPages = 1 }) {
  const rdoByDate = {};
  (dados.rdos || []).forEach(r => { rdoByDate[r.data] = r; });
  const dayTotals = (weekDays || []).map(ds => (rdoByDate[ds]?.efetivo_draft || []).length);
  const activeDays = dayTotals.filter(v => v > 0).length;
  const efetivoMedio = activeDays > 0 ? Math.round(dayTotals.reduce((a, b) => a + b, 0) / activeDays) : 0;

  // Percorre os RDOs do mais RECENTE para o mais antigo e fica com o último
  // status conhecido. Antes parava no primeiro (a lista vem em ordem crescente),
  // então uma atividade "não iniciada" na segunda e concluída na sexta aparecia
  // como não feita a semana inteira — e o PPC saía errado.
  // Dia da semana de cada RDO: atividade de um dia só mostra o SEU dia.
  const diaDoRdo = {};
  (dados.rdos || []).forEach(r => {
    if (r.data) diaDoRdo[r.id] = chaveDoDia(r.data);
  });

  const acts = (dados.atividades || []).map(a => {
    let derived = null;
    const rdosDesc = [...(dados.rdos || [])].sort((x, y) => (y.data || '').localeCompare(x.data || ''));
    for (const r of rdosDesc) {
      const d = r.efetivo_draft || [];
      const s = getDerivedStatus(a.id, d, { descricao: a.descricao, whenEmpty: null });
      if (s) { derived = s; break; }
    }
    const planejados = (a.dias_semana || []).length
      ? a.dias_semana
      : (diaDoRdo[a.rdo_id] ? [diaDoRdo[a.rdo_id]] : []);
    return { ...a, _status: derived || a.status || 'pendente', _dias: planejados };
  });
  const em = acts.filter(a => a._status === 'em_andamento').length;
  const feitas = acts.filter(a => a._status === 'feita').length;
  const naoFeitas = acts.filter(a => a._status === 'nao_feita').length;
  const total = acts.length;
  const ppc = total > 0 ? Math.round((feitas / total) * 100) : 0;

  const pendAbertas = (dados.pendencias || []).length;

  const lastSub = ((dados.rdos || []).slice().reverse()).find(r => r.submetido && r.submetido_por_nome);
  const submetidoPor = lastSub?.submetido_por_nome || null;

  return (
    <PageWrap pageNum={pageNum} totalPages={totalPages} moduleNum={1}
      moduleTitle="Visão geral da semana"
      kicker="Resumo consolidado de atividades, efetivo e indicadores do período."
      periodLabel={periodLabel} submetidoPor={submetidoPor}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        <KPICard label="Efetivo médio" value={efetivoMedio} unit="/ dia" hint={`${activeDays} dia${activeDays !== 1 ? 's' : ''} com registro`}/>
        <KPICard label="Atividades em andamento" value={em} hint={`${feitas} concluída${feitas !== 1 ? 's' : ''} · ${naoFeitas} não feita${naoFeitas !== 1 ? 's' : ''}`}/>
        <KPICard label="Pendências abertas" value={pendAbertas} hint={pendAbertas > 0 ? 'a resolver no canteiro' : 'tudo certo'}/>
      </div>

      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 8, background: T.tint, border: `1px solid ${T.rule}`, marginBottom: 18 }}>
          <span style={{ fontSize: 24, fontWeight: 600, color: T.accentDeep, fontVariantNumeric: 'tabular-nums' }}>{ppc}%</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>PPC — Percentual de planos concluídos</div>
            <div style={{ fontSize: 10.5, color: T.ink3 }}>{feitas} de {total} atividade{total !== 1 ? 's' : ''} concluída{feitas !== 1 ? 's' : ''} no período</div>
          </div>
          <div style={{ width: 140, height: 6, background: T.bg3, borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ width: `${ppc}%`, height: '100%', background: T.accent }}/>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.ink, letterSpacing: -0.2 }}>Atividades em destaque</div>
        <span style={{ fontSize: 10.5, color: T.ink3, fontFamily: T.fontMono }}>{total} no período</span>
      </div>

      {total === 0 ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: T.ink3, fontSize: 12, fontStyle: 'italic' }}>Nenhuma atividade registrada no período.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {acts.slice(0, 14).map(a => (
            <div key={a.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, padding: '8px 12px', background: T.bg2, border: `1px solid ${T.rule}`, borderRadius: 6 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.descricao}</div>
                <div style={{ fontSize: 10.5, color: T.ink3, marginTop: 1 }}>
                  {a.empreiteiro || 'Sem empresa'}{a.ambiente ? ` · ${a.ambiente}` : ''}
                </div>
                <DiasDoServico dias={a._dias} statusPorDia={a.status_por_dia} statusGeral={a._status} />
              </div>
              <Pill status={a._status}/>
            </div>
          ))}
          {acts.length > 14 && (
            <div style={{ fontSize: 10.5, color: T.ink3, textAlign: 'center', padding: '6px 0' }}>+ {acts.length - 14} atividades</div>
          )}
        </div>
      )}

      {(dados.ocorrencias || []).length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '18px 0 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>Ocorrências do período</div>
            <span style={{ fontSize: 10.5, color: '#A23F1A', fontFamily: T.fontMono, fontWeight: 600 }}>{dados.ocorrencias.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {dados.ocorrencias.map((o, i) => (
              <div key={o.id || i} style={{ padding: '8px 12px', borderRadius: 6, borderLeft: '3px solid #E07A2E', background: '#FCEFE1' }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: '#A23F1A' }}>{o.categoria || 'Ocorrência'}</div>
                {o.descricao && o.descricao !== o.categoria && <div style={{ fontSize: 10.5, color: '#7A2D14' }}>{o.descricao}</div>}
              </div>
            ))}
          </div>
        </>
      )}
    </PageWrap>
  );
}

// ── Página Efetivo — por dia + médias por empresa ─────────────────────────────
function PageEfetivo({ rdos, rdosMes = [], ocorrencias = [], weekDays: weekDaysProp }) {
  const [viewMode, setViewMode] = useState('semana'); // 'semana' | 'mes'

  const weekDays = weekDaysProp || getWeekDays();
  const rdoByDate = {};
  rdos.forEach(r => { rdoByDate[r.data] = r; });

  // Mapa rdo_id → data para cruzar ocorrências
  const rdoIdToDate = {};
  rdos.forEach(r => { rdoIdToDate[r.id] = r.data; });
  const ocByDate = {};
  ocorrencias.forEach(oc => {
    const d = rdoIdToDate[oc.rdo_id];
    if (!d) return;
    if (!ocByDate[d]) ocByDate[d] = [];
    ocByDate[d].push(oc);
  });

  // ── Dados semanais ──────────────────────────────────────────────────────────
  const companyDay = {}; // { co: { ds: [worker,...] } }
  const allCos = new Set();
  weekDays.forEach(ds => {
    const draft = rdoByDate[ds]?.efetivo_draft || [];
    draft.forEach(w => {
      const co = w.empresa_nome || 'ADM';
      allCos.add(co);
      if (!companyDay[co]) companyDay[co] = {};
      if (!companyDay[co][ds]) companyDay[co][ds] = [];
      companyDay[co][ds].push(w);
    });
  });

  const dayTotals = weekDays.map(ds => (rdoByDate[ds]?.efetivo_draft || []).length);
  const activeDays = dayTotals.filter(v => v > 0).length;
  const mediaSem = activeDays > 0 ? Math.ceil(dayTotals.reduce((a,b) => a+b, 0) / activeDays) : '—';
  const pico = Math.max(0, ...dayTotals);
  const numCos = allCos.size;
  const cosLabel = [...allCos].join(', ') || '—';

  // ── Dados mensais ───────────────────────────────────────────────────────────
  const rdosMesValidos = rdosMes.filter(r => (r.efetivo_draft || []).length > 0);
  const mesTotal = rdosMes.reduce((s, r) => s + (r.efetivo_draft || []).length, 0);
  const mesActiveDays = rdosMesValidos.length;
  const mesMedia = mesActiveDays > 0 ? Math.ceil(mesTotal / mesActiveDays) : '—';
  const mesPico = Math.max(0, ...rdosMes.map(r => (r.efetivo_draft || []).length));
  // Dia com mais fornecedores (distinct empresa_nome)
  let mesPicoFornDia = '—';
  let mesPicoFornCnt = 0;
  rdosMes.forEach(r => {
    const forn = new Set((r.efetivo_draft || []).map(w => w.empresa_nome || 'ADM'));
    if (forn.size > mesPicoFornCnt) {
      mesPicoFornCnt = forn.size;
      mesPicoFornDia = r.data ? fmtDateLong(r.data) : '—';
    }
  });
  // Empresas do mês
  const mesCos = new Set();
  rdosMes.forEach(r => { (r.efetivo_draft || []).forEach(w => mesCos.add(w.empresa_nome || 'ADM')); });
  // Per-day list for monthly view
  const hoje = new Date();
  const nomeMes = hoje.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <H style={{ marginBottom: 0 }}>👷 Efetivo no Canteiro</H>
        <div style={{ display: 'flex', gap: 4 }}>
          {['semana', 'mes'].map(m => (
            <button key={m} onClick={() => setViewMode(m)} style={{
              height: 24, padding: '0 10px', fontSize: 10, fontWeight: 700, borderRadius: 999, border: 0, cursor: 'pointer',
              background: viewMode === m ? COR : '#F0F0F0',
              color: viewMode === m ? '#fff' : '#666',
            }}>
              {m === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>
      </div>

      {viewMode === 'semana' ? (
        <>
          {/* Resumo semanal */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
            {[
              { l: 'Média semanal', v: mediaSem },
              { l: 'Pico', v: pico },
              { l: 'Empresas', v: numCos },
              { l: 'Quais', v: cosLabel, small: true },
            ].map(k => (
              <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '6px 8px' }}>
                <Label>{k.l}</Label>
                <div style={{ fontSize: k.small ? 8 : 20, fontWeight: 800, color: '#1B1B1B', lineHeight: 1, marginTop: k.small ? 4 : 0, wordBreak: 'break-word' }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Colunas por dia */}
          <Label style={{ marginBottom: 5 }}>Efetivo por dia</Label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginBottom: 12 }}>
            {weekDays.map((ds, idx) => {
              const draft = rdoByDate[ds]?.efetivo_draft || [];
              const byEmp = {};
              draft.forEach(w => {
                const co = w.empresa_nome || 'ADM';
                if (!byEmp[co]) byEmp[co] = [];
                byEmp[co].push(w);
              });
              return (
                <DayCol key={ds} ds={ds} idx={idx} isToday={ds === TODAY} countBadge={draft.length}>
                  {draft.length === 0 ? (
                    <div style={{ fontSize: 7.5, color: '#BBB', fontStyle: 'italic' }}>Sem registro</div>
                  ) : Object.entries(byEmp).map(([co, workers]) => (
                    <div key={co} style={{ marginBottom: 5 }}>
                      <div style={{ fontSize: 7.5, fontWeight: 800, color: '#444', marginBottom: 1 }}>{co} <span style={{ color: '#888', fontWeight: 600 }}>({workers.length})</span></div>
                      {workers.slice(0, 6).map((w, wi) => (
                        <div key={wi} style={{ fontSize: 7, color: '#666', paddingLeft: 4, lineHeight: 1.5 }}>· {(w.nome || '').split(' ')[0]}</div>
                      ))}
                      {workers.length > 6 && <div style={{ fontSize: 6.5, color: '#AAA', paddingLeft: 4 }}>+{workers.length - 6}</div>}
                    </div>
                  ))}
                  {/* Ocorrências do dia */}
                  {(ocByDate[ds] || []).map((oc, oi) => (
                    <div key={oi} style={{ marginTop: 4, borderTop: '1px solid #FECACA', paddingTop: 4, borderLeft: '2px solid #DC2626', paddingLeft: 4, background: '#FFF5F5', borderRadius: 2 }}>
                      <div style={{ fontSize: 7, fontWeight: 800, color: '#DC2626' }}>⚠ {oc.categoria}</div>
                      {oc.descricao && oc.descricao !== oc.categoria && (
                        <div style={{ fontSize: 6.5, color: '#B91C1C', lineHeight: 1.3 }}>{oc.descricao}</div>
                      )}
                    </div>
                  ))}
                </DayCol>
              );
            })}
          </div>

          {/* Médias por empresa */}
          {numCos > 0 && (
            <>
              <Rule />
              <Label style={{ marginBottom: 6 }}>Média por empresa — Seg a Sex</Label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {[...allCos].map(co => {
                  const totDays = weekDays.filter(ds => (companyDay[co]?.[ds]?.length || 0) > 0).length;
                  const totWorkers = weekDays.reduce((s, ds) => s + (companyDay[co]?.[ds]?.length || 0), 0);
                  const avg = totDays > 0 ? Math.ceil(totWorkers / totDays) : '—';
                  const allNames = [...new Set(
                    weekDays.flatMap(ds => (companyDay[co]?.[ds] || []).map(w => (w.nome || '').split(' ')[0])).filter(Boolean)
                  )];
                  return (
                    <div key={co} style={{ border: '1px solid #E5E5E5', borderRadius: 5, padding: '7px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                        <div style={{ fontSize: 9.5, fontWeight: 800, color: '#1B1B1B' }}>{co}</div>
                        <div style={{ fontSize: 9, color: '#888' }}>média <strong style={{ color: COR }}>{avg}</strong>/dia</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 3, marginBottom: 5 }}>
                        {weekDays.map((ds, i) => {
                          const cnt = companyDay[co]?.[ds]?.length || 0;
                          return (
                            <div key={ds} style={{ textAlign: 'center', background: cnt > 0 ? '#F0FDF4' : '#F8F8F8', borderRadius: 3, padding: '3px 2px' }}>
                              <div style={{ fontSize: 12, fontWeight: 900, color: cnt > 0 ? COR : '#CCC', lineHeight: 1 }}>{cnt || '—'}</div>
                              <div style={{ fontSize: 6.5, color: '#AAA' }}>{DAY_NAMES_SHORT[i]}</div>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 7.5, color: '#666', lineHeight: 1.5 }}>
                        {allNames.slice(0, 10).join(' · ')}{allNames.length > 10 ? ` +${allNames.length - 10}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {numCos === 0 && <Empty msg="Nenhum efetivo registrado nesta semana." />}
        </>
      ) : (
        <>
          {/* Resumo mensal */}
          <div style={{ fontSize: 8, color: '#888', marginBottom: 6, fontStyle: 'italic', textTransform: 'capitalize' }}>{nomeMes}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
            {[
              { l: 'Efetivo médio', v: mesMedia },
              { l: 'Pico do mês', v: mesPico },
              { l: 'Fornecedores', v: mesCos.size },
              { l: 'Pico de fornec.', v: mesPicoFornDia, small: true },
            ].map(k => (
              <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '6px 8px' }}>
                <Label>{k.l}</Label>
                <div style={{ fontSize: k.small ? 7.5 : 20, fontWeight: 800, color: '#1B1B1B', lineHeight: 1, marginTop: k.small ? 3 : 0, wordBreak: 'break-word' }}>{k.v}</div>
              </div>
            ))}
          </div>

          <Rule />
          <Label style={{ marginBottom: 6 }}>Efetivo por dia — {nomeMes}</Label>

          {rdosMes.length === 0 ? (
            <Empty msg="Nenhum RDO registrado neste mês." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {rdosMes.map((r, i) => {
                const draft = r.efetivo_draft || [];
                const total = draft.length;
                const forn = [...new Set(draft.map(w => w.empresa_nome || 'ADM'))];
                const isHoje = r.data === TODAY;
                const pct = mesPico > 0 ? Math.round(total / mesPico * 100) : 0;
                return (
                  <div key={r.id || i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '0.5px solid #F0F0F0' }}>
                    <div style={{ width: 60, flexShrink: 0 }}>
                      <div style={{ fontSize: 8, fontWeight: isHoje ? 800 : 600, color: isHoje ? COR : '#444' }}>{fmtDateLong(r.data)}</div>
                    </div>
                    <div style={{ flex: 1, background: '#F5F5F5', borderRadius: 3, height: 12, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: isHoje ? COR : '#4ADE80', borderRadius: 3, transition: 'width 0.3s' }} />
                    </div>
                    <div style={{ width: 20, textAlign: 'right', fontSize: 10, fontWeight: 800, color: total > 0 ? '#1B1B1B' : '#CCC', flexShrink: 0 }}>{total || '—'}</div>
                    <div style={{ width: 70, fontSize: 7, color: '#888', flexShrink: 0, lineHeight: 1.3 }}>{forn.slice(0,3).join(', ')}{forn.length > 3 ? ` +${forn.length-3}` : ''}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PagePendencias({ pendencias }) {
  const abertas    = pendencias.filter(p => p.status === 'aberta').length;
  const andamento  = pendencias.filter(p => p.status === 'em_andamento').length;
  // Conta pelo prazo vencido, e não só pelo status gravado: uma pendência com
  // prazo vencido mas status "aberta" era exibida com "⚠ atrasada" na linha
  // enquanto o card ao lado dizia "Atrasadas: 0".
  const venceu = (p) => !!p.prazo && p.prazo < hojeLocal();
  const atrasadas  = pendencias.filter(p => p.status === 'atrasada' || venceu(p)).length;
  const STATUS_P = {
    aberta:      { cor: '#CA8A04', label: 'Aberta' },
    em_andamento:{ cor: '#2563EB', label: 'Em andamento' },
    atrasada:    { cor: '#DC2626', label: 'Atrasada' },
    resolvida:   { cor: '#16A34A', label: 'Resolvida' },
  };
  return (
    <div>
      <H>✅ Pendências da Obra</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 8 }}>
        {[
          { l: 'Abertas', v: abertas, cor: '#CA8A04' },
          { l: 'Em andamento', v: andamento, cor: '#2563EB' },
          { l: 'Atrasadas', v: atrasadas, cor: atrasadas > 0 ? '#DC2626' : undefined },
        ].map(k => (
          <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '6px 8px' }}>
            <Label>{k.l}</Label>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor || '#1B1B1B', lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>
      {pendencias.length === 0 && <Empty msg="Nenhuma pendência em aberto. 🎉" />}
      {pendencias.map((p, i) => {
        const s = STATUS_P[p.status] || STATUS_P.aberta;
        const atrasada = venceu(p);
        return (
          <div key={p.id} style={{ borderBottom: i < pendencias.length - 1 ? '0.5px solid #F0F0F0' : 'none', padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: s.cor, flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.3 }}>{p.descricao}</div>
              <div style={{ fontSize: 8, color: '#888', marginTop: 1 }}>
                {p.ambiente && `📍 ${p.pavimento ? p.pavimento + ' — ' : ''}${p.ambiente}`}
                {p.empresa && ` · 🏢 ${p.empresa}`}
                {p.prazo && ` · Prazo: ${fmtDate(p.prazo)}`}
                {atrasada && <span style={{ color: '#DC2626', fontWeight: 700 }}> ⚠ atrasada</span>}
              </div>
              {(p.criado_por || p.resolvida_por) && (
                <div style={{ fontSize: 7.5, color: '#AAA', marginTop: 2 }}>
                  {p.criado_por && `Criado por ${p.criado_por}`}
                  {p.criado_por && p.resolvida_por && ' · '}
                  {p.resolvida_por && `Resolvido por ${p.resolvida_por}`}
                </div>
              )}
            </div>
            <div style={{ fontSize: 8, fontWeight: 700, color: s.cor, flexShrink: 0 }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

function PageEquipamentos({ equipamentos }) {
  const alertas = equipamentos.filter(e => { const d = calcDias(e.data_fim_previsto); return d !== null && d <= 7; });
  const ok = equipamentos.filter(e => { const d = calcDias(e.data_fim_previsto); return d === null || d > 7; });

  const EqRow = ({ eq }) => {
    const dias = calcDias(eq.data_fim_previsto);
    const cor = dias !== null && dias <= 0 ? '#DC2626' : dias !== null && dias <= 7 ? '#CA8A04' : '#16A34A';
    return (
      <div style={{ borderBottom: '0.5px solid #F0F0F0', padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: 999, background: cor, flexShrink: 0, marginTop: 3 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 600 }}>{eq.nome}</div>
          <div style={{ fontSize: 8, color: '#888' }}>
            {eq.fornecedor && `${eq.fornecedor} · `}{eq.tipo && `${eq.tipo}`}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {eq.data_fim_previsto && (
            <div style={{ fontSize: 8, fontWeight: 700, color: cor }}>
              {dias !== null && dias <= 0 ? `Vencido ${Math.abs(dias)}d` : dias !== null ? `${dias}d restantes` : ''}
            </div>
          )}
          {eq.data_fim_previsto && <div style={{ fontSize: 7.5, color: '#AAA' }}>{fmtDate(eq.data_fim_previsto)}</div>}
        </div>
      </div>
    );
  };

  return (
    <div>
      <H>🔧 Equipamentos Ativos</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 5, marginBottom: 8 }}>
        {[
          { l: 'Total ativos', v: equipamentos.length },
          { l: 'Alertas (≤7d)', v: alertas.length, cor: alertas.length > 0 ? '#CA8A04' : undefined },
          { l: 'OK', v: ok.length, cor: '#16A34A' },
        ].map(k => (
          <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '6px 8px' }}>
            <Label>{k.l}</Label>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor || '#1B1B1B', lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>
      {equipamentos.length === 0 && <Empty msg="Nenhum equipamento ativo cadastrado." />}
      {alertas.length > 0 && (
        <>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#CA8A04', marginBottom: 3 }}>⚠ ATENÇÃO — VENCENDO EM BREVE</div>
          {alertas.map(eq => <EqRow key={eq.id} eq={eq} />)}
          <Rule />
        </>
      )}
      {ok.map(eq => <EqRow key={eq.id} eq={eq} />)}
    </div>
  );
}

function PageVisitas({ visitas }) {
  return (
    <div>
      <H>🤝 Visitas e Reuniões</H>
      <div style={{ marginBottom: 6, fontSize: 9, color: '#888' }}>No período · {visitas.length} registro{visitas.length !== 1 ? 's' : ''}</div>
      {visitas.length === 0 && <Empty msg="Nenhuma visita ou reunião no período." />}
      {visitas.map((v, i) => {
        const empresas = Array.isArray(v.empresas) ? v.empresas : [];
        const itens = Array.isArray(v.itens) ? v.itens : [];
        return (
          <div key={v.id} style={{ marginBottom: 10, borderBottom: i < visitas.length - 1 ? '1px solid #E5E5E5' : 'none', paddingBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 800 }}>{fmtDateLong(v.data)}</span>
                {(v._tipos || []).includes('visita') && (
                  <span style={{ fontSize: 7.5, fontWeight: 800, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.4, background: '#F0F9F4', color: '#1B6B3A' }}>VISITA</span>
                )}
                {(v._tipos || []).includes('reuniao') && (
                  <span style={{ fontSize: 7.5, fontWeight: 800, padding: '1px 6px', borderRadius: 3, letterSpacing: 0.4, background: '#E1ECF7', color: '#1B4F88' }}>REUNIÃO</span>
                )}
              </div>
            </div>
            {v.assunto && <div style={{ fontSize: 9.5, color: '#444', marginBottom: 3, fontStyle: 'italic' }}>"{v.assunto}"</div>}
            {empresas.length > 0 && (
              <div style={{ marginBottom: 3 }}>
                {empresas.map((emp, ei) => (
                  <span key={ei} style={{ display: 'inline-block', background: '#F1F5F9', borderRadius: 3, padding: '1px 6px', fontSize: 8, fontWeight: 700, marginRight: 4, marginBottom: 2 }}>
                    {emp.nome}{emp.pessoas?.length > 0 && ` (${emp.pessoas.map(p => p.nome).join(', ')})`}
                  </span>
                ))}
              </div>
            )}
            {itens.length > 0 && (
              <div>
                {itens.slice(0, 4).map((it, ii) => (
                  <div key={ii} style={{ fontSize: 8.5, color: '#555', lineHeight: 1.5 }}>· {it.texto}</div>
                ))}
                {itens.length > 4 && <div style={{ fontSize: 8, color: '#AAA' }}>+ {itens.length - 4} itens</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}



function PageContratacoes({ contratacoes }) {
  const ST_LABEL = { em_aberto: 'Em aberto', enviado: 'Enviado', aprovado: 'Aprovado' };
  const ST_COR   = { em_aberto: '#1976D2',   enviado: '#D97706', aprovado: '#16A34A'  };

  function diasEntre(d1, d2) {
    if (!d1 || !d2) return null;
    return Math.round((new Date(d2 + 'T12:00') - new Date(d1 + 'T12:00')) / 86400000);
  }

  const aprovadas   = contratacoes.filter(c => c.status === 'aprovado');
  const enviadas    = contratacoes.filter(c => c.status === 'enviado');
  const abertas     = contratacoes.filter(c => c.status === 'em_aberto');
  const comCiclo    = aprovadas.filter(c => c.data_envio && c.data_aprovacao);
  const mediaCiclo  = comCiclo.length > 0
    ? Math.round(comCiclo.reduce((s, c) => s + diasEntre(c.data_envio, c.data_aprovacao), 0) / comCiclo.length)
    : null;

  return (
    <div>
      <H>📄 Contratações</H>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
        {[
          { l: 'Total',       v: contratacoes.length },
          { l: 'Em aberto',  v: abertas.length,   cor: '#1976D2' },
          { l: 'Enviadas',   v: enviadas.length,  cor: '#D97706' },
          { l: 'Aprovadas',  v: aprovadas.length, cor: '#16A34A' },
        ].map(k => (
          <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '5px 7px' }}>
            <Label>{k.l}</Label>
            <div style={{ fontSize: 18, fontWeight: 800, color: k.cor || '#1B1B1B', lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>

      {mediaCiclo !== null && (
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 4, padding: '6px 10px', marginBottom: 8, fontSize: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 900, color: '#16A34A' }}>{mediaCiclo}d</span>
          <span style={{ color: '#555' }}>Média de dias entre envio e aprovação ({comCiclo.length} contrataç{comCiclo.length !== 1 ? 'ões' : 'ão'})</span>
        </div>
      )}

      <Rule />

      {contratacoes.length === 0 && <Empty msg="Nenhuma contratação registrada." />}

      {/* Lista */}
      {contratacoes.map((c, i) => {
        const dias = diasEntre(c.data_envio, c.data_aprovacao);
        return (
          <div key={c.id || i} style={{ borderBottom: '0.5px solid #F0F0F0', padding: '5px 0', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <div style={{ width: 6, height: 6, borderRadius: 999, background: ST_COR[c.status] || '#999', flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, lineHeight: 1.3 }}>{c.descricao}</div>
              <div style={{ fontSize: 8, color: '#666', marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, color: ST_COR[c.status] }}>{ST_LABEL[c.status]}</span>
                {c.tipo && <span>· {c.tipo === 'mao_de_obra' ? 'Mão de obra' : 'Projeto'}</span>}
                {c.numero_contratacao && <span>· {c.numero_contratacao}</span>}
                {c.responsavel_nome && <span>· Resp: {c.responsavel_nome}</span>}
                {c.fornecedor_nome  && <span>· Forn: {c.fornecedor_nome}</span>}
              </div>
              {(c.data_envio || c.data_aprovacao) && (
                <div style={{ fontSize: 7.5, color: '#AAA', marginTop: 1, display: 'flex', gap: 8 }}>
                  {c.data_envio     && <span>📤 Enviado {fmtDate(c.data_envio)}</span>}
                  {c.data_aprovacao && <span>✅ Aprovado {fmtDate(c.data_aprovacao)}</span>}
                  {dias !== null    && <span style={{ fontWeight: 800, color: '#16A34A' }}>⏱ {dias} dia{dias !== 1 ? 's' : ''}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Página Planejamento Semanal — previsto × realizado ────────────────────────
const NOME_MOTIVO = Object.fromEntries(MOTIVOS_NAO_EXEC.map(m => [m.id, m.nome]));
const PLAN_ST = {
  C: { cor: '#16A34A', label: 'Concluído' },
  I: { cor: '#CA8A04', label: 'Iniciado' },
  N: { cor: '#DC2626', label: 'Não executado' },
};

// Chips de dia por serviço (mesma linguagem do ReplanejaDiasChip): dia
// planejado ganha a cor do status daquele dia; sem status ainda (semana
// futura, por exemplo) fica só o contorno; dia não planejado fica apagado.
const DIAS_SEQ = DIA_ORDEM;
const DIAS_LBL = DIA_CURTO;
const DIA_CHIP = {
  feita:        { bg: '#16A34A', fg: '#FFFFFF', bd: '#16A34A' },
  em_andamento: { bg: '#CA8A04', fg: '#FFFFFF', bd: '#CA8A04' },
  parcial:      { bg: '#CA8A04', fg: '#FFFFFF', bd: '#CA8A04' },
  nao_feita:    { bg: '#DC2626', fg: '#FFFFFF', bd: '#DC2626' },
};
const CHIP_NEUTRO  = { bg: '#FFFFFF', fg: '#666666', bd: '#BBBBBB' };
const CHIP_APAGADO = { bg: 'transparent', fg: '#D8D8D8', bd: '#F0F0F0' };
const PLAN_FUTURO  = { cor: '#64748B', label: 'Planejado' };
function chipDe(planejado, status) {
  if (!planejado) return CHIP_APAGADO;
  return DIA_CHIP[status] || CHIP_NEUTRO;
}
// Seg–Sex sempre; Sáb/Dom só quando planejados.
function diasVisiveis(dias) {
  return DIAS_SEQ.filter(d => (d !== 'sab' && d !== 'dom') || (dias || []).includes(d));
}

// Mesmo recorte da tela "Fechamento da semana": uma linha por atividade do
// período com o status consolidado C/I/N. Só atividades dos RDOs do período —
// as extras buscadas para o RDO (multi-semana) não eram planejadas aqui.
function calcPlanejamento(dados, from, to) {
  const rdoIds = new Set((dados.rdos || []).map(r => r.id));
  // Atividade sem dias_semana é de um dia só: o chip mostra o dia do RDO dela.
  const diaDoRdo = {};
  (dados.rdos || []).forEach(r => {
    if (r.data) diaDoRdo[r.id] = chaveDoDia(r.data);
  });
  const ativs = (dados.atividades || [])
    .filter(a => rdoIds.has(a.rdo_id))
    .map(a => {
      const st = statusDaSemana(a);
      const porDia = a.status_por_dia || {};
      const dias = (a.dias_semana || []).length
        ? a.dias_semana
        : (diaDoRdo[a.rdo_id] ? [diaDoRdo[a.rdo_id]] : []);
      // Cor do chip: o status gravado NO dia. Atividade antiga de um dia só,
      // sem status_por_dia, herda o status liso; multi-dia sem registro por
      // dia fica neutra — dizer "feita" em cada dia seria inventar dado.
      const diasStatus = {};
      dias.forEach(d => {
        diasStatus[d] = porDia[d] || (dias.length === 1 && !Object.keys(porDia).length ? a.status : null);
      });
      return {
        id: a.id,
        descricao: a.descricao || '',
        responsavel: a.empreiteiro || '',
        status: st,
        observacao: st === N && a.motivo_nao_exec ? (NOME_MOTIVO[a.motivo_nao_exec] || a.motivo_nao_exec) : '',
        dias,
        diasStatus,
      };
    });
  // Semana que ainda não começou: o C/I/N consolidado daria "Não executado"
  // em tudo — mas é um plano, não um resultado. Vira "Planejado" neutro.
  const futuro = from > hojeLocal();
  let contrat = contratacoesDaSemana(dados.contratacoesPlan || [], from, to);
  if (futuro) contrat = contrat.map(l => l.status === N ? { ...l, observacao: 'Envio para cotação previsto nesta semana' } : l);
  return { ativs, contrat, ind: indicadores([...ativs, ...contrat]), futuro };
}

function PagePlanejamento({ dados, from, to }) {
  const { ativs, contrat, ind, futuro } = calcPlanejamento(dados, from, to);

  const Linha = ({ l, ultimo }) => {
    const s = futuro ? PLAN_FUTURO : PLAN_ST[l.status];
    return (
      <div style={{ borderBottom: ultimo ? 'none' : '0.5px solid #F0F0F0', padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ width: 7, height: 7, borderRadius: 999, background: s.cor, flexShrink: 0, marginTop: 3 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.3 }}>{l.descricao}</div>
          {(l.responsavel || l.observacao) && (
            <div style={{ fontSize: 8, color: '#888', marginTop: 1 }}>
              {[l.responsavel, l.observacao].filter(Boolean).join(' · ')}
            </div>
          )}
          {l.dias && (
            <div style={{ display: 'flex', gap: 3, marginTop: 3 }}>
              {diasVisiveis(l.dias).map(d => {
                const c = chipDe(l.dias.includes(d), l.diasStatus?.[d]);
                return (
                  <span key={d} style={{ fontSize: 6.5, fontWeight: 800, padding: '2px 5px', borderRadius: 4, background: c.bg, color: c.fg, border: `1px solid ${c.bd}`, letterSpacing: 0.3, lineHeight: 1 }}>
                    {DIAS_LBL[d]}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ fontSize: 8, fontWeight: 700, color: s.cor, flexShrink: 0 }}>{s.label}</div>
      </div>
    );
  };

  return (
    <div>
      <H>📊 Planejamento Semanal</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
        {[
          { l: 'Total', v: ind.total },
          { l: 'Concluído', v: futuro ? '—' : `${ind.pctC}%`, cor: '#16A34A' },
          { l: 'Iniciado', v: futuro ? '—' : `${ind.pctI}%`, cor: '#CA8A04' },
          { l: 'Não executado', v: futuro ? '—' : `${ind.pctN}%`, cor: !futuro && ind.N > 0 ? '#DC2626' : undefined },
        ].map(k => (
          <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '6px 8px' }}>
            <Label>{k.l}</Label>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor || '#1B1B1B', lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>

      <Label style={{ marginBottom: 4 }}>Canteiro de obra · {ativs.length}</Label>
      {ativs.length === 0 && <Empty msg="Nenhuma atividade planejada no período." />}
      {ativs.map((l, i) => <Linha key={l.id} l={l} ultimo={i === ativs.length - 1} />)}

      <Rule />
      <Label style={{ marginBottom: 4 }}>Contratações / compra de materiais · {contrat.length}</Label>
      {contrat.length === 0 && <Empty msg="Nada enviado, aprovado ou vencendo no período." />}
      {contrat.map((l, i) => <Linha key={l.id} l={l} ultimo={i === contrat.length - 1} />)}
    </div>
  );
}

// ── Página Controle de Projetos — recebimento previsto × realizado ────────────
const PROJ_ST = {
  recebido:     { cor: '#16A34A', label: 'Recebido' },
  previsto:     { cor: '#2563EB', label: 'A receber' },
  nao_recebido: { cor: '#DC2626', label: 'Não recebido' },
};

// Entra no recorte quem tinha entrega prevista OU foi recebido dentro do
// período. Recebimento depois do fim do período conta como "não recebido":
// imprimir uma semana passada mostra o que era verdade naquela semana.
function calcProjetos(projetos, from, to) {
  const hoje = hojeLocal();
  const noPeriodo = (d) => !!d && d >= from && d <= to;
  const rows = (projetos || [])
    .filter(p => !p.oculto && (noPeriodo(p.data_prevista) || noPeriodo(p.data_recebida)))
    .map(p => {
      const recebido = !!p.data_recebida && p.data_recebida <= to;
      const situ = recebido ? 'recebido'
        : (!p.data_prevista || p.data_prevista >= hoje) ? 'previsto' : 'nao_recebido';
      const desvio = recebido && p.data_prevista
        ? Math.round((new Date(p.data_recebida + 'T12:00') - new Date(p.data_prevista + 'T12:00')) / 86400000)
        : null;
      return { ...p, _situ: situ, _desvio: desvio };
    })
    .sort((a, b) => (a.data_prevista || a.data_recebida || '').localeCompare(b.data_prevista || b.data_recebida || ''));
  return {
    rows,
    previstos: rows.filter(p => noPeriodo(p.data_prevista)).length,
    recebidos: rows.filter(p => noPeriodo(p.data_recebida)).length,
    noPrazo: rows.filter(p => p._desvio !== null && p._desvio <= 0).length,
    naoRecebidos: rows.filter(p => p._situ === 'nao_recebido').length,
  };
}

function desvioLabel(d) {
  if (d === null) return '';
  if (d > 0) return `${d}d atrasado`;
  if (d < 0) return `${Math.abs(d)}d adiantado`;
  return 'no prazo';
}

function PageProjetos({ projetos, from, to }) {
  const { rows, previstos, recebidos, noPrazo, naoRecebidos } = calcProjetos(projetos, from, to);
  return (
    <div>
      <H>📐 Controle de Projetos</H>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 5, marginBottom: 8 }}>
        {[
          { l: 'Previstos', v: previstos },
          { l: 'Recebidos', v: recebidos, cor: '#16A34A' },
          { l: 'No prazo', v: noPrazo, cor: '#16A34A' },
          { l: 'Não recebidos', v: naoRecebidos, cor: naoRecebidos > 0 ? '#DC2626' : undefined },
        ].map(k => (
          <div key={k.l} style={{ border: '1px solid #E5E5E5', borderRadius: 4, padding: '6px 8px' }}>
            <Label>{k.l}</Label>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.cor || '#1B1B1B', lineHeight: 1 }}>{k.v}</div>
          </div>
        ))}
      </div>
      {rows.length === 0 && <Empty msg="Nenhum projeto previsto ou recebido no período." />}
      {rows.map((p, i) => {
        const s = PROJ_ST[p._situ];
        return (
          <div key={p.id} style={{ borderBottom: i < rows.length - 1 ? '0.5px solid #F0F0F0' : 'none', padding: '5px 0', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: 999, background: s.cor, flexShrink: 0, marginTop: 3 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9.5, fontWeight: 600, lineHeight: 1.3 }}>{p.nome}</div>
              <div style={{ fontSize: 8, color: '#888', marginTop: 1 }}>
                {p.disciplina || 'Projeto'}
                {p.responsavel_nome && ` · ${p.responsavel_nome}`}
                {p.data_prevista && ` · Prev: ${fmtDate(p.data_prevista)}`}
                {p.data_recebida && p.data_recebida <= to && ` · Rec: ${fmtDate(p.data_recebida)}`}
                {p._desvio !== null && (
                  <span style={{ fontWeight: 700, color: p._desvio > 0 ? '#DC2626' : '#16A34A' }}> · {desvioLabel(p._desvio)}</span>
                )}
              </div>
            </div>
            <div style={{ fontSize: 8, fontWeight: 700, color: s.cor, flexShrink: 0 }}>{s.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────
export function EngRelatorioPDF({ goto }) {
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dados, setDados] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  // Só para decidir se mostra a dica "arraste para o lado": a folha da prévia
  // é mais larga que a tela do telefone.
  const [telaEstreita, setTelaEstreita] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < LARGURA_MIN_FOLHA + 40);
  useEffect(() => {
    const mede = () => setTelaEstreita(window.innerWidth < LARGURA_MIN_FOLHA + 40);
    window.addEventListener('resize', mede);
    return () => window.removeEventListener('resize', mede);
  }, []);
  const [exportSel, setExportSel] = useState({
    rdo: true, efetivo: true,
    pendencias: true, equipamentos: true, visitas: true,
    contratacoes: true,
    planejamento: true, projetos: true,
  });
  const [exporting, setExporting] = useState(false);

  useReportFonts();

  // ── Período ──────────────────────────────────────────────────────────────
  const [periodoTipo,   setPeriodoTipo]   = useState('semana'); // 'semana' | 'mes'
  const [periodoOffset, setPeriodoOffset] = useState(0);        // 0 = atual, -1 = anterior…

  function toggleExport(key) {
    setExportSel(s => ({ ...s, [key]: !s[key] }));
  }

  async function doExport() {
    if (!dados) return;
    setExporting(true);
    const pages = PAGES.filter(p => exportSel[p.key]);
    if (pages.length === 0) { setExporting(false); return; }

    // Build a printable HTML in a new window
    const sections = pages.map(p => {
      if (p.key === 'rdo') {
        const weekDays = periodoWeekDays;
        const rdoByDate = {};
        dados.rdos.forEach(r => { rdoByDate[r.data] = r; });
        const actByRdo = {};
        dados.atividades.forEach(a => {
          if (!actByRdo[a.rdo_id]) actByRdo[a.rdo_id] = [];
          actByRdo[a.rdo_id].push(a);
        });
        // Build actById map for cross-rdo activities
        const actById = {};
        dados.atividades.forEach(a => { actById[a.id] = a; });
        const rdoIdToDate = {};
        dados.rdos.forEach(r => { rdoIdToDate[r.id] = r.data; });
        const ocByDate = {};
        dados.ocorrencias.forEach(oc => {
          const d = rdoIdToDate[oc.rdo_id];
          if (!d) return;
          if (!ocByDate[d]) ocByDate[d] = [];
          ocByDate[d].push(oc);
        });
        function deriveStatusExp(atividadeId, draft) {
          return getDerivedStatus(atividadeId, draft, { whenEmpty: 'em_andamento' });
        }
        function getActsForDayExport(ds) {
          const rdo = rdoByDate[ds];
          if (!rdo) return [];
          const draft = rdo.efetivo_draft || [];
          const seen = new Set();
          const acts = [];
          (actByRdo[rdo.id] || []).forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); acts.push({...a}); } });
          draft.forEach(w => {
            if (w.atividade_id && !seen.has(w.atividade_id)) {
              seen.add(w.atividade_id);
              const act = actById[w.atividade_id];
              if (act) acts.push({ ...act, status: deriveStatusExp(w.atividade_id, draft) || act.status });
            }
            (w.extras||[]).forEach(ex => {
              if (ex.atividade_id && !seen.has(ex.atividade_id)) {
                seen.add(ex.atividade_id);
                const act = actById[ex.atividade_id];
                if (act) acts.push({ ...act, status: deriveStatusExp(ex.atividade_id, draft) || act.status });
              }
            });
            if (w.atividade_livre && !seen.has('livre:'+w.atividade_livre)) {
              seen.add('livre:'+w.atividade_livre);
              acts.push({ id:'livre:'+w.atividade_livre, descricao: w.atividade_livre, status: w.atividade_status||'em_andamento' });
            }
          });
          return acts;
        }
        // Deduplica por atividade, ficando com o status do último dia em que ela
        // apareceu. Sem isso, uma atividade de 3 dias era contada 3 vezes e o PPC
        // do PDF nunca batia com o da tela.
        const mapaExp = new Map();
        for (const ds of weekDays) for (const a of getActsForDayExport(ds)) mapaExp.set(a.id, a);
        const allActsExp = [...mapaExp.values()];
        const totalExp = allActsExp.length;
        const feitasExp = allActsExp.filter(a => ['concluido','feita','concluida'].includes(a.status)).length;
        const ppcExp = totalExp > 0 ? Math.round(feitasExp/totalExp*100) + '%' : '—';
        const dayHTML = weekDays.map((ds, idx) => {
          const rdo = rdoByDate[ds];
          const acts = getActsForDayExport(ds);
          const dayOcsExp = ocByDate[ds] || [];
          const STATUS_COLORS = { concluido:'#16A34A', feita:'#16A34A', concluida:'#16A34A', em_andamento:'#CA8A04', parcial:'#CA8A04', nao_realizado:'#DC2626', nao_feita:'#DC2626', pendente:'#94A3B8' };
          return `<div style="border:1px solid #e5e5e5;border-radius:5px;overflow:hidden;min-width:0">
            <div style="background:#f8f8f8;padding:4px 6px">
              <div style="font-size:9px;font-weight:800;color:#555">${['Seg','Ter','Qua','Qui','Sex'][idx]}</div>
              <div style="font-size:7.5px;color:#888">${fmtDate(ds)}</div>
              ${rdo ? `<div style="font-size:6.5px;color:#aaa;margin-top:1px">${rdo.submetido ? '✓ enviado' : 'rascunho'} · ${acts.length} ativ.</div>` : ''}
            </div>
            <div style="padding:4px 5px">
              ${dayOcsExp.map(oc => `<div style="margin-bottom:3px;border-left:2px solid #DC2626;padding:2px 4px;background:#FFF5F5;border-radius:2px"><div style="font-size:7px;font-weight:800;color:#DC2626">⚠ ${oc.categoria||''}</div>${oc.descricao&&oc.descricao!==oc.categoria?`<div style="font-size:6.5px;color:#B91C1C">${oc.descricao}</div>`:''}</div>`).join('')}
              ${acts.length === 0 ? '<div style="font-size:8px;color:#bbb;font-style:italic">Sem atividades</div>' :
                acts.map(a => {
                  const cor = STATUS_COLORS[a.status] || '#94A3B8';
                  return `<div style="border-bottom:0.5px solid #f5f5f5;padding:3px 0;display:flex;gap:4px;align-items:flex-start">
                    <div style="width:5px;height:5px;border-radius:999px;background:${cor};flex-shrink:0;margin-top:3px"></div>
                    <div style="flex:1;min-width:0">
                      <div style="font-size:8px;font-weight:600;line-height:1.3;word-break:break-word">${a.descricao || ''}</div>
                      ${a.ambiente ? `<div style="font-size:7px;color:#999">📍 ${a.ambiente}</div>` : ''}
                      ${a.empreiteiro ? `<div style="font-size:7px;color:#777;font-weight:700">🏢 ${a.empreiteiro}</div>` : ''}
                    </div>
                  </div>`;
                }).join('')
              }
            </div>
          </div>`;
        }).join('');
        const ocResumExp = dados.ocorrencias.length > 0 ? `
          <div style="margin-top:12px;border-top:1px solid #e5e5e5;padding-top:10px">
            <div style="font-weight:800;font-size:10px;color:#DC2626;margin-bottom:6px;text-transform:uppercase">⚠️ Ocorrências da Semana</div>
            ${dados.ocorrencias.map(o => `<div style="border-left:3px solid #DC2626;padding:4px 8px;background:#FFF5F5;border-radius:3px;margin-bottom:4px"><div style="font-size:9px;font-weight:700;color:#DC2626">${o.categoria||''}</div>${o.descricao&&o.descricao!==o.categoria?`<div style="font-size:8.5px;color:#666">${o.descricao}</div>`:''}</div>`).join('')}
          </div>` : '<div style="margin-top:8px;font-size:9px;color:#aaa;font-style:italic">✓ Sem ocorrências nesta semana.</div>';
        return `<div style="margin-bottom:20px">
          <div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">📋 Relatório Diário de Obras</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:8px">
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">Total atividades</div><div style="font-size:20px;font-weight:800">${totalExp}</div></div>
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">Concluídas</div><div style="font-size:20px;font-weight:800;color:#16A34A">${feitasExp}</div></div>
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">PPC</div><div style="font-size:20px;font-weight:800">${ppcExp}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px">${dayHTML}</div>
          ${ocResumExp}
        </div>`;
      }
      if (p.key === 'efetivo') {
        const weekDays = periodoWeekDays;
        const rdoByDate = {};
        dados.rdos.forEach(r => { rdoByDate[r.data] = r; });
        const companyDay = {};
        const allCos = new Set();
        weekDays.forEach(ds => {
          const draft = rdoByDate[ds]?.efetivo_draft || [];
          draft.forEach(w => {
            const co = w.empresa_nome || 'ADM';
            allCos.add(co);
            if (!companyDay[co]) companyDay[co] = {};
            if (!companyDay[co][ds]) companyDay[co][ds] = [];
            companyDay[co][ds].push(w);
          });
        });
        const dayTotals = weekDays.map(ds => (rdoByDate[ds]?.efetivo_draft || []).length);
        const activeDays = dayTotals.filter(v => v > 0).length;
        const mediaSem = activeDays > 0 ? Math.ceil(dayTotals.reduce((a,b)=>a+b,0)/activeDays) : '—';
        const pico = Math.max(0, ...dayTotals);
        const dayColsHTML = weekDays.map((ds, idx) => {
          const draft = rdoByDate[ds]?.efetivo_draft || [];
          const byEmp = {};
          draft.forEach(w => { const co = w.empresa_nome || 'ADM'; if (!byEmp[co]) byEmp[co] = []; byEmp[co].push(w); });
          return `<div style="border:1px solid #e5e5e5;border-radius:5px;overflow:hidden">
            <div style="background:#f8f8f8;padding:4px 6px">
              <div style="font-size:9px;font-weight:800;color:#555">${['Seg','Ter','Qua','Qui','Sex'][idx]}</div>
              <div style="font-size:7.5px;color:#888">${fmtDate(ds)}</div>
              <div style="font-size:13px;font-weight:900;color:#1B1B1B;margin-top:1px;line-height:1">${draft.length}</div>
            </div>
            <div style="padding:4px 5px">
              ${draft.length === 0 ? '<div style="font-size:7.5px;color:#bbb;font-style:italic">Sem registro</div>' :
                Object.entries(byEmp).map(([co, ws]) =>
                  `<div style="margin-bottom:4px"><div style="font-size:7.5px;font-weight:800;color:#444">${co} (${ws.length})</div>${ws.slice(0,5).map(w=>`<div style="font-size:7px;color:#666;padding-left:4px">· ${(w.nome||'').split(' ')[0]}</div>`).join('')}</div>`
                ).join('')
              }
            </div>
          </div>`;
        }).join('');
        const coAvgHTML = [...allCos].map(co => {
          const totDays = weekDays.filter(ds => (companyDay[co]?.[ds]?.length||0) > 0).length;
          const totW = weekDays.reduce((s,ds)=>s+(companyDay[co]?.[ds]?.length||0),0);
          const avg = totDays > 0 ? Math.ceil(totW/totDays) : '—';
          const allNames = [...new Set(weekDays.flatMap(ds=>(companyDay[co]?.[ds]||[]).map(w=>(w.nome||'').split(' ')[0])).filter(Boolean))];
          const daysGrid = weekDays.map((ds,i) => {
            const cnt = companyDay[co]?.[ds]?.length || 0;
            return `<div style="text-align:center;background:${cnt>0?'#F0FDF4':'#F8F8F8'};border-radius:3px;padding:3px 2px"><div style="font-size:12px;font-weight:900;color:${cnt>0?'#1B6B3A':'#CCC'};line-height:1">${cnt||'—'}</div><div style="font-size:6.5px;color:#AAA">${['Seg','Ter','Qua','Qui','Sex'][i]}</div></div>`;
          }).join('');
          return `<div style="border:1px solid #e5e5e5;border-radius:5px;padding:7px 8px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px">
              <div style="font-size:9.5px;font-weight:800">${co}</div>
              <div style="font-size:9px;color:#888">média <strong style="color:#1B6B3A">${avg}</strong>/dia</div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;margin-bottom:5px">${daysGrid}</div>
            <div style="font-size:7.5px;color:#666">${allNames.slice(0,10).join(' · ')}${allNames.length>10?` +${allNames.length-10}`:''}</div>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:20px">
          <div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">👷 Efetivo no Canteiro</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px">
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">Média semanal</div><div style="font-size:20px;font-weight:800">${mediaSem}</div></div>
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">Pico</div><div style="font-size:20px;font-weight:800">${pico}</div></div>
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">Empresas</div><div style="font-size:20px;font-weight:800">${allCos.size}</div></div>
            <div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">Quais</div><div style="font-size:8px;font-weight:800;margin-top:4px">${[...allCos].join(', ')||'—'}</div></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:12px">${dayColsHTML}</div>
          <div style="height:1px;background:#e5e5e5;margin:8px 0"></div>
          <div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:6px">Média por empresa</div>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${coAvgHTML}</div>
        </div>`;
      }
      if (p.key === 'pendencias') {
        const STATUS_COR = { aberta:'#CA8A04', em_andamento:'#2563EB', atrasada:'#DC2626', resolvida:'#16A34A' };
        const STATUS_LBL = { aberta:'Aberta', em_andamento:'Em andamento', atrasada:'Atrasada', resolvida:'Resolvida' };
        const rows = dados.pendencias.map((p2,i) => {
          const cor = STATUS_COR[p2.status] || '#888';
          return `<div style="border-bottom:${i<dados.pendencias.length-1?'0.5px solid #f0f0f0':'none'};padding:5px 0;display:flex;align-items:flex-start;gap:6px">
            <div style="width:7px;height:7px;border-radius:999px;background:${cor};flex-shrink:0;margin-top:3px"></div>
            <div style="flex:1"><div style="font-size:9.5px;font-weight:600">${p2.descricao||''}</div></div>
            <div style="font-size:8px;font-weight:700;color:${cor};flex-shrink:0">${STATUS_LBL[p2.status]||p2.status}</div>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:20px"><div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">✅ Pendências da Obra</div>${rows||'<div style="color:#999;font-style:italic;padding:8px 0">Nenhuma pendência em aberto.</div>'}</div>`;
      }
      if (p.key === 'equipamentos') {
        const rows = dados.equipamentos.map(eq => {
          const dias = calcDias(eq.data_fim_previsto);
          const cor = dias!==null&&dias<=0?'#DC2626':dias!==null&&dias<=7?'#CA8A04':'#16A34A';
          return `<div style="border-bottom:0.5px solid #f0f0f0;padding:5px 0;display:flex;gap:6px">
            <div style="width:7px;height:7px;border-radius:999px;background:${cor};flex-shrink:0;margin-top:3px"></div>
            <div style="flex:1"><div style="font-size:9.5px;font-weight:600">${eq.nome||''}</div><div style="font-size:8px;color:#888">${eq.tipo||''}</div></div>
            <div style="font-size:8px;font-weight:700;color:${cor};flex-shrink:0">${dias!==null?(dias<=0?`Vencido ${Math.abs(dias)}d`:`${dias}d`):'—'}</div>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:20px"><div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">🔧 Equipamentos Ativos</div>${rows||'<div style="color:#999;font-style:italic;padding:8px 0">Nenhum equipamento ativo.</div>'}</div>`;
      }
      if (p.key === 'visitas') {
        const rows = dados.visitas.map((v,i) => {
          const emps = Array.isArray(v.empresas)?v.empresas:[];
          const tps  = v._tipos || [];
          const badges = [];
          if (tps.includes('visita'))  badges.push(`<span style="font-size:7.5px;font-weight:800;padding:1px 6px;border-radius:3px;letter-spacing:0.4px;background:#F0F9F4;color:#1B6B3A">VISITA</span>`);
          if (tps.includes('reuniao')) badges.push(`<span style="font-size:7.5px;font-weight:800;padding:1px 6px;border-radius:3px;letter-spacing:0.4px;background:#E1ECF7;color:#1B4F88">REUNIÃO</span>`);
          return `<div style="margin-bottom:8px;border-bottom:${i<dados.visitas.length-1?'1px solid #e5e5e5':'none'};padding-bottom:6px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap"><span style="font-size:10px;font-weight:800">${fmtDateLong(v.data)}</span>${badges.join('')}</div>
            ${v.assunto?`<div style="font-size:9px;color:#444;font-style:italic">"${v.assunto}"</div>`:''}
            ${emps.map(e=>`<span style="display:inline-block;background:#f1f5f9;border-radius:3px;padding:1px 6px;font-size:8px;font-weight:700;margin-right:4px">${e.nome}</span>`).join('')}
          </div>`;
        }).join('');
        return `<div style="margin-bottom:20px"><div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">🤝 Visitas e Reuniões</div>${rows||'<div style="color:#999;font-style:italic;padding:8px 0">Nenhuma visita ou reunião.</div>'}</div>`;
      }
      if (p.key === 'contratacoes') {
        const ST_LBL = { em_aberto: 'Em aberto', enviado: 'Enviado', aprovado: 'Aprovado' };
        const ST_C   = { em_aberto: '#1976D2', enviado: '#D97706', aprovado: '#16A34A' };
        const list = dados.contratacoes || [];
        const rows = list.map(c => {
          const cor = ST_C[c.status] || '#888';
          const extra = [
            c.tipo ? (c.tipo === 'mao_de_obra' ? 'Mão de obra' : 'Projeto') : '',
            c.numero_contratacao || '',
            c.responsavel_nome ? ('Resp: ' + c.responsavel_nome) : '',
            c.fornecedor_nome ? ('Forn: ' + c.fornecedor_nome) : '',
          ].filter(Boolean).join(' · ');
          return `<div style="border-bottom:0.5px solid #f0f0f0;padding:5px 0;display:flex;gap:6px;align-items:flex-start">
            <div style="width:7px;height:7px;border-radius:999px;background:${cor};flex-shrink:0;margin-top:3px"></div>
            <div style="flex:1"><div style="font-size:9.5px;font-weight:700">${c.descricao || ''}</div>${extra ? `<div style="font-size:8px;color:#666;margin-top:1px">${extra}</div>` : ''}</div>
            <div style="font-size:8px;font-weight:700;color:${cor};flex-shrink:0">${ST_LBL[c.status] || c.status || ''}</div>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:20px"><div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">📄 Contratações</div>${rows || '<div style="color:#999;font-style:italic;padding:8px 0">Nenhuma contratação registrada.</div>'}</div>`;
      }
      if (p.key === 'planejamento') {
        const { ativs, contrat, ind, futuro } = calcPlanejamento(dados, mondayStr, sundayStr);
        const linha = (l, i, arr) => {
          const s = futuro ? PLAN_FUTURO : PLAN_ST[l.status];
          const sub = [l.responsavel, l.observacao].filter(Boolean).join(' · ');
          const chips = l.dias ? `<div style="display:flex;gap:3px;margin-top:3px">${diasVisiveis(l.dias).map(d => {
            const c = chipDe(l.dias.includes(d), l.diasStatus?.[d]);
            return `<span style="font-size:6.5px;font-weight:800;padding:2px 5px;border-radius:4px;background:${c.bg};color:${c.fg};border:1px solid ${c.bd};letter-spacing:0.3px;line-height:1">${DIAS_LBL[d]}</span>`;
          }).join('')}</div>` : '';
          return `<div style="border-bottom:${i < arr.length - 1 ? '0.5px solid #f0f0f0' : 'none'};padding:5px 0;display:flex;align-items:flex-start;gap:6px">
            <div style="width:7px;height:7px;border-radius:999px;background:${s.cor};flex-shrink:0;margin-top:3px"></div>
            <div style="flex:1"><div style="font-size:9.5px;font-weight:600">${l.descricao}</div>${sub ? `<div style="font-size:8px;color:#888">${sub}</div>` : ''}${chips}</div>
            <div style="font-size:8px;font-weight:700;color:${s.cor};flex-shrink:0">${s.label}</div>
          </div>`;
        };
        const secao = (t, arr, vazio) =>
          `<div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin:8px 0 3px">${t} · ${arr.length}</div>` +
          (arr.length ? arr.map(linha).join('') : `<div style="color:#999;font-style:italic;padding:4px 0;font-size:9px">${vazio}</div>`);
        return `<div style="margin-bottom:20px">
          <div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">📊 Planejamento Semanal</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px">
            ${[['Total', ind.total, '#1B1B1B'], ['Concluído', futuro ? '—' : ind.pctC + '%', '#16A34A'], ['Iniciado', futuro ? '—' : ind.pctI + '%', '#CA8A04'], ['Não executado', futuro ? '—' : ind.pctN + '%', !futuro && ind.N > 0 ? '#DC2626' : '#1B1B1B']]
              .map(([l, v, c]) => `<div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">${l}</div><div style="font-size:20px;font-weight:800;color:${c}">${v}</div></div>`).join('')}
          </div>
          ${secao('Canteiro de obra', ativs, 'Nenhuma atividade planejada no período.')}
          <div style="height:1px;background:#e5e5e5;margin:8px 0"></div>
          ${secao('Contratações / compra de materiais', contrat, 'Nada enviado, aprovado ou vencendo no período.')}
        </div>`;
      }
      if (p.key === 'projetos') {
        const { rows, previstos, recebidos, noPrazo, naoRecebidos } = calcProjetos(dados.projetos || [], mondayStr, sundayStr);
        const linhas = rows.map((pr, i) => {
          const s = PROJ_ST[pr._situ];
          const sub = [
            pr.disciplina || 'Projeto',
            pr.responsavel_nome || '',
            pr.data_prevista ? 'Prev: ' + fmtDate(pr.data_prevista) : '',
            (pr.data_recebida && pr.data_recebida <= sundayStr) ? 'Rec: ' + fmtDate(pr.data_recebida) : '',
          ].filter(Boolean).join(' · ');
          const desv = pr._desvio !== null ? `<span style="font-weight:700;color:${pr._desvio > 0 ? '#DC2626' : '#16A34A'}"> · ${desvioLabel(pr._desvio)}</span>` : '';
          return `<div style="border-bottom:${i < rows.length - 1 ? '0.5px solid #f0f0f0' : 'none'};padding:5px 0;display:flex;align-items:flex-start;gap:6px">
            <div style="width:7px;height:7px;border-radius:999px;background:${s.cor};flex-shrink:0;margin-top:3px"></div>
            <div style="flex:1"><div style="font-size:9.5px;font-weight:600">${pr.nome || ''}</div><div style="font-size:8px;color:#888">${sub}${desv}</div></div>
            <div style="font-size:8px;font-weight:700;color:${s.cor};flex-shrink:0">${s.label}</div>
          </div>`;
        }).join('');
        return `<div style="margin-bottom:20px">
          <div style="font-weight:800;font-size:11px;color:#1B6B3A;margin-bottom:6px;text-transform:uppercase">📐 Controle de Projetos</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-bottom:8px">
            ${[['Previstos', previstos, '#1B1B1B'], ['Recebidos', recebidos, '#16A34A'], ['No prazo', noPrazo, '#16A34A'], ['Não recebidos', naoRecebidos, naoRecebidos > 0 ? '#DC2626' : '#1B1B1B']]
              .map(([l, v, c]) => `<div style="border:1px solid #e5e5e5;border-radius:4px;padding:6px 8px"><div style="font-size:7.5px;font-weight:700;color:#888;text-transform:uppercase;margin-bottom:2px">${l}</div><div style="font-size:20px;font-weight:800;color:${c}">${v}</div></div>`).join('')}
          </div>
          ${linhas || '<div style="color:#999;font-style:italic;padding:8px 0">Nenhum projeto previsto ou recebido no período.</div>'}
        </div>`;
      }
      return '';
    }).join('<div style="height:1px;background:#e5e5e5;margin:18px 0"></div>');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${MARCA.nome} — ${weekLabel}</title>
<style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}body{padding:24px;color:#1B1B1B;font-size:9.5pt;line-height:1.45;max-width:900px;margin:0 auto}@media print{body{padding:0}}</style>
</head><body>
<div style="margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #1B6B3A;display:flex;align-items:center;justify-content:space-between">
  <div>
    <div style="font-size:18px;font-weight:900;color:#087B8B">${MARCA.nome}</div>
    <div style="font-size:11px;font-weight:700">${OBRA_NOME} · ${periodoTipo === 'semana' ? ('Relatório Semanal' + (weekNum ? ' · Semana ' + weekNum : '')) : 'Relatório Mensal'} · ${weekLabel}</div>
    <div style="font-size:9px;color:#888">Gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div>
  </div>
</div>
${sections}
</body></html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Permita pop-ups no navegador para gerar o PDF.'); setExporting(false); return; }
    win.document.write(html);
    win.document.close();
    // imprime quando a janela terminar de carregar, com fallback e guarda anti-duplo-print
    let printed = false;
    const doPrint = () => { if (printed) return; printed = true; win.focus(); win.print(); };
    win.onload = doPrint;
    setTimeout(doPrint, 900);
    setExporting(false);
    setExportOpen(false);
  }

  const periodo = getPeriodRange(periodoTipo, periodoOffset);
  const { from: mondayStr, to: sundayStr, label: weekLabel, weekDays: periodoWeekDays, num: weekNum } = periodo;


  async function loadAll(fromStr, toStr) {
    setLoading(true);

    // RDOs do período com efetivo_draft
    const { data: rdos } = await supabase
      .from('rdos')
      .select('id,data,submetido,efetivo_draft')
      .gte('data', fromStr)
      .lte('data', toStr)
      .order('data');
    const rdoIds = (rdos || []).map(r => r.id);

    // Atividades da semana
    let atividades = [];
    if (rdoIds.length > 0) {
      const { data: a } = await supabase
        .from('atividades_rdo')
        .select('*')
        .in('rdo_id', rdoIds);
      atividades = a || [];
    }

    // Also fetch activities referenced in efetivo_draft that may belong to other RDOs
    // (multi-day activities created in a previous week's RDO but still active)
    const atividadeIdsFromDraft = new Set();
    (rdos || []).forEach(rdo => {
      (rdo.efetivo_draft || []).forEach(w => {
        if (w.atividade_id) atividadeIdsFromDraft.add(w.atividade_id);
        (w.extras || []).forEach(ex => { if (ex.atividade_id) atividadeIdsFromDraft.add(ex.atividade_id); });
      });
    });
    const fetchedAtivIds = new Set(atividades.map(a => a.id));
    const missingAtivIds = [...atividadeIdsFromDraft].filter(id => !fetchedAtivIds.has(id));
    if (missingAtivIds.length > 0) {
      const { data: extraAtivs } = await supabase.from('atividades_rdo').select('*').in('id', missingAtivIds);
      if (extraAtivs) atividades = [...atividades, ...extraAtivs];
    }

    // Pendências abertas. Sem filtro por data de criação: uma pendência aberta
    // há três semanas e ainda não resolvida é justamente o que precisa constar
    // no relatório desta semana — antes ela simplesmente não aparecia.
    const { data: pendencias } = await supabase
      .from('pendencias')
      .select('*')
      .in('status', ['aberta','em_andamento','atrasada'])
      .order('created_at', { ascending: false });

    // Equipamentos ativos
    const { data: equipamentos } = await supabase
      .from('equipamentos')
      .select('*')
      .eq('status', 'ativo')
      .order('nome');

    // Visitas + Reuniões do período (agrupadas por grupo_id, _tipos: array)
    const [{ data: visitasRaw }, { data: reunioesRaw }] = await Promise.all([
      supabase.from('visitas').select('*').gte('data', fromStr).lte('data', toStr).order('data', { ascending: false }),
      supabase.from('reunioes').select('*').gte('data', fromStr).lte('data', toStr).order('data', { ascending: false }),
    ]);
    const byGrupo = new Map();
    const addRow = (row, tipo) => {
      if (!row.grupo_id) return;
      if (!byGrupo.has(row.grupo_id)) byGrupo.set(row.grupo_id, { ...row, _tipos: [] });
      byGrupo.get(row.grupo_id)._tipos.push(tipo);
    };
    (visitasRaw  || []).forEach(row => addRow(row, 'visita'));
    (reunioesRaw || []).forEach(row => addRow(row, 'reuniao'));
    const visitas = [...byGrupo.values()]
      .map(g => ({ ...g, _tipos: g._tipos.slice().sort() }))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''));

    // Ocorrências do período, pelo RDO a que pertencem (antes era por created_at:
    // uma ocorrência lançada na segunda para o RDO da sexta anterior ficava fora,
    // e o horário UTC ainda cortava as lançadas depois das 21h do último dia).
    let ocorrencias = [];
    if (rdoIds.length > 0) {
      const { data: oc } = await supabase
        .from('ocorrencias')
        .select('*')
        .in('rdo_id', rdoIds)
        .order('created_at');
      ocorrencias = oc || [];
    }

    // Contratações em aberto ao fim do período escolhido. Usava TODAY (constante
    // de módulo), então imprimir uma semana passada trazia o estado de hoje.
    const { data: contratacoes } = await supabase
      .from('contratacoes')
      .select('*')
      .or(`data_aprovacao.is.null,data_aprovacao.gte.${toStr}`)
      .order('created_at', { ascending: false });

    // Contratações completas para o Planejamento Semanal: a query acima corta
    // as aprovadas antes do fim do período, e o previsto × realizado precisa
    // exatamente delas (aprovada na semana = C).
    const { data: contratacoesPlan } = await supabase
      .from('contratacoes')
      .select('id, descricao, responsavel_nome, fornecedor_nome, prazo_envio, data_envio, data_aprovacao');

    // Projetos para o previsto × realizado de recebimento. O filtro de período
    // é no cliente: a linha entra se a previsão OU o recebimento cair no período.
    const { data: projetos } = await supabase
      .from('projetos')
      .select('*');

    // RDOs do mês DO PERÍODO escolhido (usava sempre o mês corrente, então a aba
    // "Mês" do efetivo mostrava o mês atual mesmo com "mês anterior" selecionado).
    const refMes = parseISODate(toStr) || new Date();
    const mesInicio = toISODate(new Date(refMes.getFullYear(), refMes.getMonth(), 1));
    const mesFim    = toISODate(new Date(refMes.getFullYear(), refMes.getMonth() + 1, 0));
    const { data: rdosMes } = await supabase
      .from('rdos')
      .select('id,data,efetivo_draft')
      .gte('data', mesInicio)
      .lte('data', mesFim)
      .order('data');

    setDados({
      rdos: rdos || [],
      rdosMes: rdosMes || [],
      atividades,
      pendencias: pendencias || [],
      equipamentos: equipamentos || [],
      visitas: visitas || [],
      ocorrencias: ocorrencias || [],
      contratacoes: contratacoes || [],
      contratacoesPlan: contratacoesPlan || [],
      projetos: projetos || [],
    });
    setLoading(false);
  }
  useEffect(() => { loadAll(mondayStr, sundayStr); }, [periodoTipo, periodoOffset]);

  const PAGES = [
    { key: 'rdo',           label: 'RDO',           emoji: '📋' },
    { key: 'efetivo',       label: 'Efetivo',        emoji: '👷' },
    { key: 'pendencias',    label: 'Pendências',     emoji: '✅' },
    { key: 'equipamentos',  label: 'Equipamentos',   emoji: '🔧' },
    { key: 'visitas',       label: 'Visitas',        emoji: '🤝' },
    { key: 'contratacoes',  label: 'Contratações',   emoji: '📄' },
    { key: 'planejamento',  label: 'Planejamento',   emoji: '📊' },
    { key: 'projetos',      label: 'Projetos',       emoji: '📐' },
  ];
  const total = PAGES.length;

  return (
    <div className="page" style={{ background: 'var(--bg)' }}>
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('relatorios')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Relatórios
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => setExportOpen(true)}>
          <span style={{ width: 14, height: 14 }}>{Icon.share}</span>
          Exportar
        </button>
      </div>
      <div style={{ padding: '6px var(--pad-4) 4px' }}>
        <div className="t-micro" style={{ color: 'var(--primary)' }}>
          {periodoTipo === 'semana' ? `RELATÓRIO SEMANAL${weekNum ? ` · SEMANA ${weekNum}` : ''}` : 'RELATÓRIO MENSAL'}
        </div>
        <div className="t-h2" style={{ marginTop: 2 }}>{OBRA_NOME}</div>

        {/* Seletor de período */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {/* Toggle Semana / Mês */}
          <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
            {['semana', 'mes'].map(t => (
              <button key={t} onClick={() => { setPeriodoTipo(t); setPeriodoOffset(0); setPage(0); }}
                style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer',
                  background: periodoTipo === t ? 'var(--primary)' : 'var(--surface-2)',
                  color: periodoTipo === t ? '#fff' : 'var(--text-2)' }}>
                {t === 'semana' ? 'Semana' : 'Mês'}
              </button>
            ))}
          </div>

          {/* Navegação ← → */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
            <button onClick={() => { setPeriodoOffset(o => o - 1); setPage(0); }}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, color: 'var(--text-2)' }}>{Icon.back}</span>
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', textAlign: 'center', flex: 1, minWidth: 0 }}>
              {weekLabel}
            </span>
            {/* Futuro liberado até +8 semanas, a mesma folga do Planejar: quem planeja
                imprime o planejamento da semana que vem antes de ela começar. */}
            <button onClick={() => { setPeriodoOffset(o => Math.min(8, o + 1)); setPage(0); }}
              disabled={periodoOffset >= 8}
              style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)',
                background: 'var(--surface)', cursor: periodoOffset >= 8 ? 'default' : 'pointer',
                opacity: periodoOffset >= 8 ? 0.35 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 14, height: 14, color: 'var(--text-2)' }}>{Icon.arrowR}</span>
            </button>
          </div>
        </div>
      </div>

      <div style={{ padding: '6px var(--pad-4) 4px' }}>
        <div style={{ display: 'flex', overflowX: 'auto', gap: 6, paddingBottom: 2 }}>
          {PAGES.map((p, i) => (
            <button key={p.key} onClick={() => setPage(i)} style={{
              flexShrink: 0, height: 30, padding: '0 12px',
              fontSize: 11, fontWeight: 700, borderRadius: 999,
              border: 0, cursor: 'pointer',
              background: page === i ? 'var(--primary)' : 'var(--surface)',
              color: page === i ? 'white' : 'var(--text-2)',
              boxShadow: page === i ? 'none' : 'inset 0 0 0 0.5px var(--border)',
            }}>
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '8px var(--pad-4) 24px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 14 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
            Carregando dados da obra…
          </div>
        ) : (
          // A folha é desenhada para a largura de uma página (no computador o
          // cartão tem ~1000px). No celular ela NÃO encolhe: mantém uma largura
          // mínima em que os quadros e as colunas continuam legíveis, e o dedo
          // arrasta para o lado — como se olha uma planilha no telefone.
          // Encolher em escala não serve: o viewport do app bloqueia a pinça de
          // zoom, e a 40% o texto vira formiga.
          <div style={{
            background: '#FFFFFF', borderRadius: 6,
            boxShadow: '0 4px 18px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)',
            fontFamily: '"Inter","Helvetica Neue",system-ui,sans-serif',
            color: '#1B1B1B', fontSize: 9.5, lineHeight: 1.45,
            minHeight: 400, position: 'relative',
            overflowX: 'auto', WebkitOverflowScrolling: 'touch',
          }}>
            <div style={{ minWidth: LARGURA_MIN_FOLHA, padding: '18px 16px', position: 'relative' }}>
            <div style={{ position: 'absolute', top: 10, right: 12, fontSize: 7.5, color: '#BBB', fontWeight: 600 }}>
              {page + 1}/{total} · {MARCA.nome}
            </div>
            {PAGES[page].key === 'rdo'          && <PageRDO dados={dados} weekDays={periodoWeekDays} periodLabel={weekLabel} pageNum={page+1} totalPages={total} />}
            {PAGES[page].key === 'efetivo'      && <PageEfetivo rdos={dados.rdos} rdosMes={dados.rdosMes || []} ocorrencias={dados.ocorrencias} weekDays={periodoWeekDays} />}
            {PAGES[page].key === 'pendencias'   && <PagePendencias pendencias={dados.pendencias} />}
            {PAGES[page].key === 'equipamentos' && <PageEquipamentos equipamentos={dados.equipamentos} />}
            {PAGES[page].key === 'visitas'      && <PageVisitas visitas={dados.visitas} />}
            {PAGES[page].key === 'contratacoes' && <PageContratacoes contratacoes={dados.contratacoes || []} />}
            {PAGES[page].key === 'planejamento' && <PagePlanejamento dados={dados} from={mondayStr} to={sundayStr} />}
            {PAGES[page].key === 'projetos'     && <PageProjetos projetos={dados.projetos || []} from={mondayStr} to={sundayStr} />}
            </div>
          </div>
        )}

        {!loading && telaEstreita && (
          <div className="t-caption" style={{ marginTop: 8, textAlign: 'center' }}>
            ↔ Arraste a folha para o lado para ver a página inteira. O PDF sai em A4, inteiro.
          </div>
        )}

        {!loading && (
          <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
              disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>
              <span style={{ width: 14, height: 14 }}>{Icon.back}</span> Anterior
            </button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }}
              disabled={page === total - 1} onClick={() => setPage(p => Math.min(total - 1, p + 1))}>
              Próxima <span style={{ width: 14, height: 14 }}>{Icon.arrowR}</span>
            </button>
          </div>
        )}
      </div>

      {/* Modal de export */}
      {exportOpen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 480, background: 'var(--surface)',
            borderRadius: '20px 20px 0 0', padding: '24px 20px 32px',
            boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 4 }}>📤 Exportar Relatório</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
              Selecione as seções. Abre uma aba pronta para imprimir ou salvar como PDF · {weekLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18, maxHeight: '40vh', overflowY: 'auto' }}>
              {PAGES.map(p => (
                <button key={p.key} onClick={() => toggleExport(p.key)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                    borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    border: exportSel[p.key] ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                    background: exportSel[p.key] ? 'var(--primary-tint)' : 'var(--surface-2)',
                    color: 'var(--text-1)', fontSize: 14, fontWeight: 700 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
                    background: exportSel[p.key] ? 'var(--primary)' : 'transparent', color: '#fff',
                    border: exportSel[p.key] ? 'none' : '1.5px solid var(--border)' }}>
                    {exportSel[p.key] ? '✓' : ''}
                  </span>
                  <span style={{ flex: 1 }}>{p.emoji} {p.label}</span>
                </button>
              ))}
            </div>
            <button onClick={doExport} disabled={exporting}
              style={{ width: '100%', height: 50, borderRadius: 14, border: 'none',
                background: 'var(--primary)', color: '#fff', fontSize: 15, fontWeight: 800,
                cursor: 'pointer', marginBottom: 10, opacity: exporting ? 0.6 : 1 }}>
              {exporting ? 'Gerando…' : '🖨️ Gerar PDF'}
            </button>
            <button onClick={() => setExportOpen(false)}
              style={{ width: '100%', height: 44, borderRadius: 12,
                border: '0.5px solid var(--border)', background: 'var(--surface)',
                fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
