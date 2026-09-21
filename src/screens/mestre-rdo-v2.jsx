import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { contem } from '../lib/busca';
import { Icon, Avatar } from '../components/index';
import { useObra } from '../lib/ObraContext';
import { proximoStatus, ACOES_CONCLUIDA } from '../lib/status-atividade';
import { hojeLocal } from '../lib/date';
import { DIA_ROTULO } from '../lib/atividades-do-dia';

function groupBy(list, key) {
  const out = {};
  for (const item of list) {
    const k = item[key] || '__';
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

/**
 * Opções de status de um worker em uma atividade.
 * Usadas no seletor do WorkerCard e nas badges.
 */
// Today's weekday abbreviation (matches DIAS_LIST_M)

export const WORKER_STATUS_OPTIONS = [
  { key: 'em_andamento', label: 'Em andamento', short: 'Andamento',  color: 'var(--warn)',    bg: 'var(--warn-tint,#FEF9C3)' },
  { key: 'concluida',    label: 'Concluída',     short: 'Concluída', color: 'var(--success)', bg: 'var(--success-tint,#DCFCE7)' },
  { key: 'nao_iniciou',  label: 'Não iniciou',   short: 'Não iniciou',color:'var(--text-3)', bg: 'var(--surface-2)' },
  { key: 'ocorrencia',   label: 'Ocorrência',    short: 'Ocorrência',color: 'var(--danger)',  bg: 'var(--danger-tint,#FEE2E2)' },
];

// Chip de status que AVANÇA por toque, no lugar de escolher de uma lista.
//   Em andamento → Concluída (toque). No Concluída, o toque abre um popup em
// vez de desmarcar: "voltar para andamento" ou "reiniciar o serviço".
// A regra de qual status vem a seguir vive em lib/status-atividade (proximoStatus),
// que é pura e testada — aqui é só a casca visual.
function StatusChipCiclo({ currentStatus, onSetStatus }) {
  const [confirmar, setConfirmar] = useState(false);
  const cur = currentStatus || 'em_andamento';
  const opt = WORKER_STATUS_OPTIONS.find(o => o.key === cur) || WORKER_STATUS_OPTIONS[0];

  const onTap = () => {
    const r = proximoStatus(cur);
    if (r.pedirConfirmacao) setConfirmar(true);
    else onSetStatus(r.status);
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={onTap} style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        border: 0, borderRadius: 999, padding: '6px 12px',
        background: opt.bg, color: opt.color, fontSize: 11, fontWeight: 800, fontFamily: 'inherit',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: opt.color, flexShrink: 0 }} />
        {opt.label}
        <span style={{ opacity: 0.55, fontSize: 13, marginLeft: 1 }}>›</span>
      </button>

      {confirmar && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 22px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxWidth: 360, background: 'var(--surface)', borderRadius: 18,
            padding: '20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.28)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>Serviço concluído</div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.45 }}>
              Este serviço já está marcado como concluído. O que você quer fazer?
            </div>
            <button onClick={() => { onSetStatus(ACOES_CONCLUIDA.voltar); setConfirmar(false); }} style={{
              width: '100%', marginTop: 16, height: 46, borderRadius: 12, border: 0, cursor: 'pointer',
              background: 'var(--warn, #D97706)', color: '#fff', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
            }}>↩ Voltar para “Em andamento”</button>
            <button onClick={() => { onSetStatus(ACOES_CONCLUIDA.reiniciar); setConfirmar(false); }} style={{
              width: '100%', marginTop: 10, height: 46, borderRadius: 12, cursor: 'pointer',
              border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
              fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
            }}>⟲ Reiniciar o serviço <span style={{ fontWeight: 600, opacity: 0.75 }}>(zera as datas)</span></button>
            <button onClick={() => setConfirmar(false)} style={{
              width: '100%', marginTop: 10, height: 42, borderRadius: 12, cursor: 'pointer',
              border: 0, background: 'transparent', color: 'var(--text-3)', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
            }}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Deriva o status de uma atividade a partir dos workers do efetivo.
 * Fonte ÚNICA usada por mestre, engenheiro e relatório/PDF.
 *   opts.descricao  → também casa workers por atividade_livre (nome)
 *   opts.whenEmpty  → retorno quando não há workers (padrão 'pendente')
 * Regras: todos 'concluida' → 'feita'; todos 'nao_iniciou' → 'nao_feita'; resto → 'em_andamento'.
 */
export function getDerivedStatus(atividadeId, efetivo, opts = {}) {
  const { descricao = null, whenEmpty = 'pendente' } = opts;
  const nameKey = descricao ? descricao.trim().toLowerCase() : null;
  const matches = (id, livre) =>
    (id && id === atividadeId) ||
    (!id && nameKey && livre && livre.trim().toLowerCase() === nameKey);
  const statuses = [];
  for (const w of (efetivo || [])) {
    if (matches(w.atividade_id, w.atividade_livre)) statuses.push(w.atividade_status || 'em_andamento');
    for (const ex of (w.extras || [])) {
      if (matches(ex.atividade_id, ex.atividade_livre)) statuses.push(ex.status || 'em_andamento');
    }
  }
  if (statuses.length === 0) return whenEmpty;
  if (statuses.every(s => s === 'concluida')) return 'feita';
  if (statuses.every(s => s === 'nao_iniciou')) return 'nao_feita';
  return 'em_andamento';
}

// ── M02 v2: Efetivo de hoje (workforce-first RDO) ────────────────────────

function fmtDataBR(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  const semana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dt.getDay()];
  return `${semana}, ${d}/${m}/${y}`;
}

// Linha do tempo horizontal: os últimos 21 dias como fita rolável, para pular
// direto no dia que interessa. Substituiu o botão "ver histórico", que obrigava
// a sair da tela para trocar de dia. A bolinha marca o dia que já tem diário
// enviado, então dá para ver de relance qual dia ficou sem preencher.
function LinhaDoTempoRDO({ ativo, hoje, onEscolher, onHistorico }) {
  const DIAS = 21;
  const [enviados, setEnviados] = useState(() => new Set());
  const fitaRef = useRef(null);

  const dias = useMemo(() => {
    const base = hoje || hojeLocal();
    const fim = new Date(base + 'T12:00:00');
    return Array.from({ length: DIAS }, (_, i) => {
      const d = new Date(fim);
      d.setDate(d.getDate() - (DIAS - 1 - i));
      const iso = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      return { iso, dia: d.getDate(), semana: DIA_ROTULO[d.getDay()], fds: d.getDay() === 0 || d.getDay() === 6 };
    });
  }, [hoje]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from('rdos').select('data,submetido')
        .gte('data', dias[0].iso).lte('data', dias[dias.length - 1].iso);
      if (error) { console.error('Linha do tempo:', error); return; }
      if (vivo) setEnviados(new Set((data || []).filter(r => r.submetido).map(r => r.data)));
    })();
    return () => { vivo = false; };
  }, [dias]);

  // Abre já mostrando o fim da fita (hoje), não o começo.
  useEffect(() => { const f = fitaRef.current; if (f) f.scrollLeft = f.scrollWidth; }, [dias]);

  if (!onEscolher) return null;
  return (
    <div style={{ padding: '0 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 var(--pad-4) 6px' }}>
        <span className="t-micro">ESCOLHA O DIA</span>
        <button onClick={onHistorico} style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 11.5, fontWeight: 800, color: 'var(--text-3)' }}>histórico completo ›</button>
      </div>
      <div ref={fitaRef} style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '2px var(--pad-4) 4px', scrollbarWidth: 'none' }}>
        {dias.map(d => {
          const sel = d.iso === ativo;
          const ehHoje = d.iso === hoje;
          return (
            <button key={d.iso} onClick={() => onEscolher(d.iso)} title={d.iso}
              style={{ flexShrink: 0, width: 46, padding: '6px 0 5px', borderRadius: 11, cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'center',
                background: sel ? 'var(--primary)' : 'var(--surface)',
                color: sel ? '#fff' : d.fds ? 'var(--text-3)' : 'var(--text-2)',
                border: sel ? 'none' : ehHoje ? '1.5px solid var(--primary)' : '0.5px solid var(--border)' }}>
              <div style={{ fontSize: 9.5, fontWeight: 800, textTransform: 'uppercase', opacity: 0.75 }}>{d.semana}</div>
              <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.1 }}>{d.dia}</div>
              <div style={{ height: 5, marginTop: 2, display: 'flex', justifyContent: 'center' }}>
                <span style={{ width: 5, height: 5, borderRadius: 999,
                  background: enviados.has(d.iso) ? (sel ? '#fff' : 'var(--success, #16A34A)') : 'transparent' }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MestreRDOv2({ goto, rdoId, dailyState, atividades = [], efetivo, setEfetivo, openSheet, onSetStatus, onSetExtraStatus, submitDaily, activeDate, today, isRetroativo = false, onPickDate, onVoltarHoje }) {
  const { empresas } = useObra();
  const empresaById = (id) => empresas.find(e => e.id === id) || { nome: 'Sem empresa', cor: '#888' };

  // Grupos colapsáveis por empresa
  const [collapsed, setCollapsed] = useState({});
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 900);
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Ocorrências do dia
  const [ocorrencias, setOcorrencias] = useState([]);
  useEffect(() => {
    if (!rdoId) return;
    supabase.from('ocorrencias').select('*').eq('rdo_id', rdoId).order('created_at').then(({ data, error }) => {
      if (error) { console.error('Erro ao carregar ocorrências:', error); return; }
      setOcorrencias(data || []);
    });
    // Realtime: atualiza quando nova ocorrência é inserida
    const ch = supabase.channel('rdo-ocorrencias-' + rdoId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ocorrencias', filter: `rdo_id=eq.${rdoId}` }, (payload) => {
        setOcorrencias(prev => [...prev, payload.new]);
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [rdoId]);
  const toggleCollapse = (empId) => setCollapsed(prev => ({ ...prev, [empId]: !prev[empId] }));

  const startedIds = new Set([
    ...efetivo.filter(w => w.atividade_id).map(w => w.atividade_id),
    ...efetivo.flatMap(w => (w.extras || []).filter(e => e.atividade_id).map(e => e.atividade_id)),
  ]);
  const totalWorkers = efetivo.length;
  const admCount = efetivo.filter(w => w.is_adm).length;

  const submitted = dailyState?.submitted || false;
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!submitDaily) return;
    setSubmitting(true);
    await submitDaily();
    setSubmitting(false);
  };

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div className="t-micro" style={{ color: isRetroativo ? 'var(--warn, #D97706)' : 'var(--primary)', marginBottom: 4 }}>
            DIÁRIO DE OBRA · {isRetroativo ? 'RETROATIVO' : 'HOJE'}
          </div>
          <div className="t-h1" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1 }}>
            {isRetroativo ? 'Efetivo do dia' : 'Efetivo de hoje'}
          </div>
          <div className="t-2" style={{ fontSize: 13, marginTop: 4, color: 'var(--text-2)' }}>Registre quem está no canteiro e o que cada um está fazendo.</div>
        </div>
        {submitDaily && (
          submitted
            ? <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 999, background: 'var(--success)', color: '#fff', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>
                ✓ Concluído
              </div>
            : <button
                onClick={handleSubmit}
                disabled={submitting || efetivo.length === 0}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: 999, background: efetivo.length === 0 ? 'var(--surface-2)' : 'var(--primary)', color: efetivo.length === 0 ? 'var(--text-3)' : '#fff', fontSize: 12, fontWeight: 800, border: 'none', cursor: efetivo.length === 0 ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
                {submitting ? '…' : '✓ Concluir'}
              </button>
        )}
      </div>

      {/* Seletor de data — permite RDO retroativo */}
      {onPickDate && (
        <div style={{ padding: '10px var(--pad-4) 4px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12,
            background: isRetroativo ? 'rgba(217,119,6,0.10)' : 'var(--surface-2)',
            border: isRetroativo ? '1px solid rgba(217,119,6,0.35)' : '0.5px solid var(--border)',
          }}>
            <span style={{ width: 18, height: 18, color: isRetroativo ? 'var(--warn, #D97706)' : 'var(--text-3)', flexShrink: 0 }}>{Icon.calendar}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, color: 'var(--text-3)' }}>DATA DO RDO</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>
                {fmtDataBR(activeDate)}{isRetroativo ? '' : ' · hoje'}
              </div>
            </div>
            <label style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 10,
                background: 'var(--surface)', border: '0.5px solid var(--border)', color: 'var(--primary)',
                fontSize: 12, fontWeight: 800,
              }}>
                <span style={{ width: 14, height: 14 }}>{Icon.edit}</span> Trocar dia
              </span>
              <input type="date" value={activeDate} max={today}
                onChange={e => { if (e.target.value) onPickDate(e.target.value); }}
                style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }} />
            </label>
            {isRetroativo && onVoltarHoje && (
              <button onClick={onVoltarHoje} style={{
                flexShrink: 0, padding: '7px 12px', borderRadius: 10, border: 'none',
                background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>Hoje</button>
            )}
          </div>
        </div>
      )}

      <div style={{ padding: '0 var(--pad-4) 12px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 8 }}>
          <StatTile2 n={totalWorkers} label="No canteiro" tone="var(--primary)" />
          <StatTile2 n={admCount} label="ADM própria" tone="var(--info)" />
          <StatTile2 n={startedIds.size} label="Atividades" tone="var(--success)" subN={`/${atividades.length}`} />
        </div>
      </div>

      <div style={{ padding: '0 var(--pad-4) 8px', display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
        <button className="btn btn-primary btn-block" style={{ height: 52 }} onClick={openSheet}>
          <span style={{ width: 20, height: 20 }}>{Icon.plus}</span>
          Fazer efetivo
        </button>
        <button
          style={{ height: 52, padding: '0 14px', borderRadius: 14, border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
          onClick={() => goto('rdo-occurrence')}>
          <span style={{ fontSize: 16 }}>🌤️</span>
          Ocorrência
        </button>
      </div>
      <LinhaDoTempoRDO ativo={activeDate} hoje={today} onEscolher={onPickDate}
        onHistorico={() => goto('rdo-historico')} />

      {efetivo.length === 0 && (
        <div className="page-pad">
          <div className="card" style={{ textAlign: 'center', padding: '28px 16px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, margin: '0 auto 12px', background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 28, height: 28 }}>{Icon.users}</span>
            </div>
            <div className="t-strong" style={{ fontSize: 16 }}>Ninguém registrado ainda</div>
            <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.4 }}>
              À medida que os colaboradores chegam,<br />adicione cada um e atribua a atividade.
            </div>
          </div>
        </div>
      )}

      {/* ── Ocorrências — sempre visível antes dos fornecedores ── */}
      <div className="page-pad" style={{ paddingBottom: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>⚠️</span>
          <div className="t-micro" style={{ color: ocorrencias.length > 0 ? 'var(--danger)' : 'var(--text-3)', letterSpacing: 0.4 }}>
            OCORRÊNCIAS DO DIA
          </div>
        </div>
        {ocorrencias.length === 0 ? (
          <div style={{
            padding: '12px 14px', borderRadius: 12,
            background: 'var(--surface-2)',
            fontSize: 13, color: 'var(--text-3)', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <span style={{ fontSize: 15 }}>✓</span> Sem ocorrências
          </div>
        ) : (
          <div className="stack stack-2">
            {ocorrencias.map(oc => (
              <div key={oc.id} className="card" style={{ padding: '12px 14px', borderLeft: '3px solid var(--danger)', background: 'var(--danger-tint, #FEE2E2)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1.3 }}>{oc.categoria}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>
                    {oc.turno === 'manha' ? 'Manhã' : oc.turno === 'tarde' ? 'Tarde' : oc.turno === 'dia' ? 'Dia todo' : oc.turno || ''}
                  </div>
                </div>
                <div className="t-caption" style={{ marginTop: 4, lineHeight: 1.4, color: 'var(--text-2)' }}>
                  {oc.descricao && oc.descricao !== oc.categoria ? oc.descricao : 'Sem descrição adicional.'}
                </div>
                {(oc.registrado_por || oc.criada_por_nome) && (
                  <div className="t-caption" style={{ marginTop: 6, fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>
                    Registrado por {oc.registrado_por || oc.criada_por_nome}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {efetivo.length > 0 && (() => {
        const empresaGroups = Object.entries(groupBy(efetivo, 'empresa_id'));
        const workerCardProps = (w) => ({
          onAssign: () => goto('rdo-assign', { workerId: w.id }),
          onToggleAdm: () => setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, is_adm: !x.is_adm } : x)),
          onRemove: () => setEfetivo(prev => prev.filter(x => x.id !== w.id)),
          onUnassign: () => setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, atividade_id: null, atividade_livre: null, atividade_status: null } : x)),
          onUnassignExtra: (extraId) => setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, extras: (x.extras || []).filter(ex => ex.id !== extraId) } : x)),
          onEditLivre: (newText) => setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, atividade_livre: newText || null } : x)),
          onEditExtraLivre: (extraId, newText) => setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, extras: (x.extras || []).map(ex => ex.id === extraId ? { ...ex, atividade_livre: newText || null } : ex) } : x)),
          onSetStatus: (newStatus) => onSetStatus ? onSetStatus(w, newStatus) : setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, atividade_status: newStatus } : x)),
          onAssignExtra: () => goto('rdo-assign', { workerId: w.id, extraMode: true }),
          onSetExtraStatus: (extraId, newStatus) => onSetExtraStatus ? onSetExtraStatus(w, extraId, newStatus) : setEfetivo(prev => prev.map(x => x.id === w.id ? { ...x, extras: (x.extras || []).map(ex => ex.id === extraId ? { ...ex, status: newStatus } : ex) } : x)),
        });

        if (isDesktop) {
          const numCols = Math.min(empresaGroups.length, 4);
          return (
            <div style={{ padding: '0 var(--pad-4) 16px', display: 'grid', gridTemplateColumns: `repeat(${numCols}, 1fr)`, gap: 14, alignItems: 'start' }}>
              {empresaGroups.map(([empId, list]) => {
                const e = empresaById(empId);
                return (
                  <div key={empId} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {/* Column header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: e.cor + '14', borderBottom: `2.5px solid ${e.cor}` }}>
                      <div style={{ width: 8, height: 8, borderRadius: 999, background: e.cor, flexShrink: 0 }} />
                      <div className="t-strong" style={{ fontSize: 13, flex: 1 }}>{e.nome}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: e.cor, background: e.cor + '22', padding: '2px 8px', borderRadius: 999 }}>
                        {list.length} {list.length === 1 ? 'pessoa' : 'pessoas'}
                      </div>
                    </div>
                    {/* Worker cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {list.map(w => (
                        <WorkerCard key={w.id} w={w} empresa={e} atividades={atividades} {...workerCardProps(w)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        }

        return (
          <div className="page-pad stack stack-3" style={{ paddingBottom: 8 }}>
            {empresaGroups.map(([empId, list]) => {
              const e = empresaById(empId);
              const isCollapsed = !!collapsed[empId];
              return (
                <div key={empId}>
                  <button onClick={() => toggleCollapse(empId)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 4px 8px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 999, background: e.cor, flexShrink: 0 }} />
                      <div className="t-strong" style={{ fontSize: 13 }}>{e.nome}</div>
                      <div className="t-caption">{list.length} {list.length === 1 ? 'pessoa' : 'pessoas'}</div>
                    </div>
                    <span style={{ width: 16, height: 16, color: 'var(--text-3)', transform: isCollapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s', display: 'flex', alignItems: 'center' }}>
                      {Icon.chevR}
                    </span>
                  </button>
                  {!isCollapsed && <div className="stack stack-2">
                    {list.map(w => (
                      <WorkerCard key={w.id} w={w} empresa={e} atividades={atividades} {...workerCardProps(w)} />
                    ))}
                  </div>}
                </div>
              );
            })}
          </div>
        );
      })()}



    </div>
  );
}

function StatTile2({ n, label, tone, subN }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface)', boxShadow: 'inset 0 0 0 0.5px var(--border)', borderLeft: `3px solid ${tone}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: tone, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{n}</div>
        {subN && <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>{subN}</div>}
      </div>
      <div className="t-caption" style={{ fontSize: 11, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function WorkerCard({ w, empresa, atividades = [], onAssign, onToggleAdm, onRemove, onUnassign, onUnassignExtra, onEditLivre, onEditExtraLivre, onSetStatus, onAssignExtra, onSetExtraStatus }) {
  const planned = atividades.find(a => a.id === w.atividade_id);
  const taskLabel = planned ? planned.descricao : w.atividade_livre;
  const taskAmb = planned ? planned.ambiente : null;
  const hasTask = !!taskLabel;
  const isFree = !w.atividade_id && !!w.atividade_livre;
  const extras = w.extras || [];

  // Inline edit para atividade livre principal
  const [editingLivre, setEditingLivre] = useState(false);
  const [livreText, setLivreText] = useState(w.atividade_livre || '');
  // Inline edit para extra livre
  const [editingExtraId, setEditingExtraId] = useState(null);
  const [extraText, setExtraText] = useState('');

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Avatar ini={w.iniciais} color={empresa.cor} size={42} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row-between">
            <div className="t-strong" style={{ fontSize: 15 }}>{w.nome}</div>
            <button onClick={onRemove} style={{ width: 26, height: 26, border: 0, borderRadius: 6, background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 14, height: 14 }}>{Icon.x}</span>
            </button>
          </div>
          <div className="t-caption" style={{ marginTop: 1 }}>{w.funcao || 'Colaborador'}</div>
          <button onClick={onToggleAdm} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 10px 6px 6px', border: 0, cursor: 'pointer', borderRadius: 999, background: w.is_adm ? 'var(--info-tint, #DBEAFE)' : 'var(--surface-2)', boxShadow: 'inset 0 0 0 0.5px var(--border)' }}>
            <div style={{ width: 32, height: 18, borderRadius: 999, background: w.is_adm ? 'var(--info)' : '#C8CDD3', position: 'relative', flexShrink: 0, transition: 'background .15s' }}>
              <div style={{ position: 'absolute', top: 2, left: w.is_adm ? 16 : 2, width: 14, height: 14, borderRadius: 999, background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left .15s' }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.3, color: w.is_adm ? 'var(--info)' : 'var(--text-3)' }}>
              {w.is_adm ? 'É ADM PRÓPRIA' : 'Marcar como ADM'}
            </div>
          </button>
        </div>
      </div>

      {/* ── Atividade principal ── */}
      <div style={{ marginTop: 10 }}>
        {/* Sem atividade: botão para atribuir */}
        {!hasTask && (
          <button onClick={onAssign} style={{ width: '100%', padding: '10px 12px', border: 0, cursor: 'pointer', background: 'var(--surface-2)', borderRadius: 10, textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center', boxShadow: 'inset 0 0 0 1.5px var(--border)' }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'transparent', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 1.5px var(--border-strong)' }}>
              <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-3)' }}>Atribuir atividade</div>
          </button>
        )}

        {/* Atividade planejada: clica para trocar + botão desatribuir */}
        {hasTask && !isFree && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
            <button onClick={onAssign} style={{ flex: 1, padding: '10px 12px', border: 0, cursor: 'pointer', background: 'var(--primary-tint)', borderRadius: 10, textAlign: 'left', display: 'flex', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', lineHeight: 1.3 }}>{taskLabel}</div>
                {taskAmb && <div className="t-caption" style={{ fontSize: 11, marginTop: 1 }}>{taskAmb}</div>}
              </div>
              <span style={{ width: 13, height: 13, color: 'var(--primary)', flexShrink: 0 }}>{Icon.chevR}</span>
            </button>
            <button
              onClick={onUnassign}
              title="Desatribuir"
              style={{ width: 38, borderRadius: 10, border: 0, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: 'inset 0 0 0 0.5px var(--border)' }}
            >
              <span style={{ width: 14, height: 14 }}>{Icon.x}</span>
            </button>
          </div>
        )}

        {/* Atividade livre (digitada): edição inline + deletar */}
        {hasTask && isFree && (
          editingLivre ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                className="ipt"
                style={{ flex: 1, fontSize: 13 }}
                value={livreText}
                autoFocus
                onChange={e => setLivreText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && livreText.trim()) {
                    onEditLivre?.(livreText.trim());
                    setEditingLivre(false);
                  }
                  if (e.key === 'Escape') setEditingLivre(false);
                }}
              />
              <button
                onClick={() => { if (livreText.trim()) { onEditLivre?.(livreText.trim()); } setEditingLivre(false); }}
                style={{ width: 38, borderRadius: 10, border: 0, background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <span style={{ width: 14, height: 14 }}>{Icon.check}</span>
              </button>
              <button
                onClick={() => setEditingLivre(false)}
                style={{ width: 38, borderRadius: 10, border: 0, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <span style={{ width: 14, height: 14 }}>{Icon.x}</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
              <div style={{ flex: 1, padding: '10px 12px', background: 'var(--warn-tint, #FEF9C3)', borderRadius: 10, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>{taskLabel}</div>
                <div className="t-caption" style={{ fontSize: 10, marginTop: 2, color: 'var(--warn)', fontWeight: 700 }}>NÃO PLANEJADA</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <button
                  onClick={() => { setLivreText(w.atividade_livre || ''); setEditingLivre(true); }}
                  title="Editar"
                  style={{ flex: 1, width: 36, borderRadius: 8, border: 0, background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 0.5px var(--border)' }}
                >
                  <span style={{ width: 13, height: 13 }}>{Icon.edit}</span>
                </button>
                <button
                  onClick={onUnassign}
                  title="Remover"
                  style={{ flex: 1, width: 36, borderRadius: 8, border: 0, background: 'var(--surface-2)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 0.5px var(--border)' }}
                >
                  <span style={{ width: 13, height: 13 }}>{Icon.x}</span>
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* ── Seletor de status (atividade principal) ── */}
      {hasTask && !editingLivre && (
        <StatusChipCiclo currentStatus={w.atividade_status} onSetStatus={onSetStatus} />
      )}

      {/* ── Atividades extras ── */}
      {extras.map(ex => {
        const exPlanned = atividades.find(a => a.id === ex.atividade_id);
        const exLabel = exPlanned ? exPlanned.descricao : ex.atividade_livre;
        const exIsFree = !ex.atividade_id && !!ex.atividade_livre;
        const isEditingThisExtra = editingExtraId === ex.id;
        return (
          <div key={ex.id} style={{ marginTop: 8, padding: '9px 12px', background: 'var(--surface-2)', borderRadius: 10, boxShadow: 'inset 0 0 0 0.5px var(--border)' }}>
            {isEditingThisExtra ? (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <input
                  className="ipt"
                  style={{ flex: 1, fontSize: 12 }}
                  value={extraText}
                  autoFocus
                  onChange={e => setExtraText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && extraText.trim()) {
                      onEditExtraLivre?.(ex.id, extraText.trim());
                      setEditingExtraId(null);
                    }
                    if (e.key === 'Escape') setEditingExtraId(null);
                  }}
                />
                <button
                  onClick={() => { if (extraText.trim()) onEditExtraLivre?.(ex.id, extraText.trim()); setEditingExtraId(null); }}
                  style={{ width: 34, borderRadius: 8, border: 0, background: 'var(--primary)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <span style={{ width: 13, height: 13 }}>{Icon.check}</span>
                </button>
                <button
                  onClick={() => setEditingExtraId(null)}
                  style={{ width: 34, borderRadius: 8, border: 0, background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <span style={{ width: 13, height: 13 }}>{Icon.x}</span>
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>{exLabel}</div>
                  {exIsFree && <div className="t-caption" style={{ fontSize: 10, color: 'var(--warn)', fontWeight: 700, marginTop: 1 }}>NÃO PLANEJADA</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {exIsFree && (
                    <button
                      onClick={() => { setExtraText(ex.atividade_livre || ''); setEditingExtraId(ex.id); }}
                      title="Editar"
                      style={{ width: 28, height: 28, borderRadius: 6, border: 0, background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 0.5px var(--border)' }}
                    >
                      <span style={{ width: 12, height: 12 }}>{Icon.edit}</span>
                    </button>
                  )}
                  <button
                    onClick={() => onUnassignExtra?.(ex.id)}
                    title="Remover"
                    style={{ width: 28, height: 28, borderRadius: 6, border: 0, background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'inset 0 0 0 0.5px var(--border)' }}
                  >
                    <span style={{ width: 12, height: 12 }}>{Icon.x}</span>
                  </button>
                </div>
              </div>
            )}
            {!isEditingThisExtra && (
              <StatusChipCiclo currentStatus={ex.status} onSetStatus={(newStatus) => onSetExtraStatus?.(ex.id, newStatus)} />
            )}
          </div>
        );
      })}

      {/* ── Adicionar outro serviço ── */}
      {hasTask && (
        <button onClick={onAssignExtra} style={{ width: '100%', marginTop: 8, padding: '8px 12px', border: 0, cursor: 'pointer', background: 'transparent', borderRadius: 10, display: 'flex', gap: 8, alignItems: 'center', boxShadow: 'inset 0 0 0 1px var(--border)', opacity: 0.7 }}>
          <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.plus}</span>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>Adicionar outro serviço</div>
        </button>
      )}
    </div>
  );
}

// ── M02b: Add worker sheet ────────────────────────────────────────────────
export function MestreRDOAddSheet({ onClose, efetivo, setEfetivo }) {
  const { empresas, colaboradores, reload, profile } = useObra();
  const [tab, setTab] = useState('cadastro');
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const [q, setQ] = useState('');
  const [pickedEmpresa, setPickedEmpresa] = useState(null);
  // Congela, na abertura da folha, quem ja estava no efetivo. Precisa ser lido
  // durante o render, entao e useState (com inicializador preguicoso), nao useRef.
  const [idsIniciais] = useState(() => new Set(efetivo.map(w => w.colab_id).filter(Boolean)));
  const addedThisSession = efetivo.filter(w => !idsIniciais.has(w.colab_id));

  const [nNome, setNNome] = useState('');
  const [nFuncao, setNFuncao] = useState('Oficial');
  const [nEmpresa, setNEmpresa] = useState(null);

  const ativosIds = new Set(efetivo.map(w => w.colab_id).filter(Boolean));

  // Helper: find empresa for a colaborador (null empreiteiro_id → ADM)
  const empForColab = (c) => empresas.find(e => c.empreiteiro_id ? e.id === c.empreiteiro_id : e.id === 'adm');

  const availableByEmpresa = empresas.map(e => {
    const colabs = colaboradores.filter(c => {
      const match = e.id === 'adm' ? !c.empreiteiro_id : c.empreiteiro_id === e.id;
      return match && !ativosIds.has(c.id) && c.ativo !== false;
    });
    return { e, colabs };
  });

  const Q = q.trim().toLowerCase();
  const searching = Q.length > 0;
  const searchResults = searching
    ? colaboradores.filter(c => {
        if (ativosIds.has(c.id)) return false;
        if (c.ativo === false) return false;
        const e = empForColab(c);
        return contem(c.nome, Q) || (e && contem(e.nome, Q));
      })
    : [];
  const colabsOfPicked = pickedEmpresa
    ? colaboradores.filter(c => {
        const match = pickedEmpresa === 'adm' ? !c.empreiteiro_id : c.empreiteiro_id === pickedEmpresa;
        return match && !ativosIds.has(c.id);
      })
    : [];

  const addFromCadastro = (c) => {
    const e = empForColab(c);
    setEfetivo(prev => [...prev, {
      id: 'w' + Date.now() + '_' + c.id,
      colab_id: c.id,
      nome: c.nome,
      iniciais: c.iniciais,
      funcao: c.funcao,
      empresa_id: c.empreiteiro_id || 'adm',
      empresa_nome: e?.nome || '',
      is_adm: !c.empreiteiro_id,
      atividade_id: null,
      atividade_livre: null,
    }]);
  };

  // Quem o mestre lança na hora já entra no cadastro, marcado para a
  // engenharia conferir a documentação de segurança. Se o cadastro falhar, a
  // pessoa ainda entra no efetivo do dia — o mestre não pode ficar travado.
  const addNovo = async () => {
    if (!nNome.trim() || salvandoNovo) return;
    setSalvandoNovo(true);
    const nome = nNome.trim();
    const ini = nome.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    const empId = nEmpresa || 'adm';
    const e = empresas.find(x => x.id === empId);

    const { data: novo, error } = await supabase.from('colaboradores').insert({
      nome, funcao: nFuncao, empreiteiro_id: empId === 'adm' ? null : empId,
      iniciais: ini, ativo: true,
      pendente_revisao: true,
      cadastrado_por: profile?.nome || 'Mestre',
    }).select('id').single();

    if (error) console.error('Erro ao cadastrar colaborador novo:', error);
    else await reload();

    setEfetivo(prev => [...prev, {
      id: 'w-novo-' + Date.now(),
      colab_id: novo?.id || null,
      nome,
      iniciais: ini,
      funcao: nFuncao,
      empresa_id: empId,
      empresa_nome: e?.nome || 'ADM',
      is_adm: empId === 'adm',
      atividade_id: null,
      atividade_livre: null,
    }]);
    setNNome('');
    setNFuncao('Oficial');
    setSalvandoNovo(false);
  };

  const availableCount = colaboradores.filter(c => !ativosIds.has(c.id)).length;

  return (
    <div style={{ paddingBottom: 16 }}>
      <div className="t-h2" style={{ fontSize: 22, marginBottom: 8 }}>Adicionar colaborador</div>
      <div className="t-caption" style={{ marginBottom: 14 }}>Selecione do cadastro ou registre alguém novo.</div>

      <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-2)', borderRadius: 10, marginBottom: 14 }}>
        {[{ k: 'cadastro', l: `Do cadastro (${availableCount})` }, { k: 'novo', l: 'Adicionar avulso' }].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, height: 36, border: 0, cursor: 'pointer', borderRadius: 8, fontSize: 13, fontWeight: 700, background: tab === t.k ? 'var(--surface)' : 'transparent', color: tab === t.k ? 'var(--text-1)' : 'var(--text-2)', boxShadow: tab === t.k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{t.l}</button>
        ))}
      </div>

      {tab === 'cadastro' && (
        <>
          {colaboradores.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '28px 12px' }}>
              <div className="t-strong">Nenhum colaborador cadastrado</div>
              <div className="t-caption" style={{ marginTop: 4 }}>Adicione colaboradores em Mais → Cadastros base.</div>
            </div>
          )}

          {colaboradores.length > 0 && (
            <>
              <div className="search" style={{ margin: '0 0 12px' }}>
                <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.search}</span>
                <input placeholder="Buscar por nome ou empresa…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 15 }} />
              </div>

              {!searching && pickedEmpresa && (
                <button onClick={() => setPickedEmpresa(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, padding: '6px 10px', border: 0, cursor: 'pointer', background: 'var(--surface-2)', borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                  <span style={{ width: 14, height: 14 }}>{Icon.back}</span>Trocar empresa
                </button>
              )}

              {searching && (
                <div style={{ maxHeight: 360, overflowY: 'auto' }} className="stack stack-1">
                  {searchResults.length === 0 && <div className="t-caption" style={{ textAlign: 'center', padding: 20 }}>Nenhum colaborador encontrado.</div>}
                  {searchResults.map(c => {
                    const e = empForColab(c) || { nome: '—', cor: '#888' };
                    return (
                      <button key={c.id} onClick={() => addFromCadastro(c)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: 0, cursor: 'pointer', background: 'var(--surface)', borderRadius: 12, boxShadow: 'inset 0 0 0 0.5px var(--border)', textAlign: 'left', width: '100%' }}>
                        <Avatar ini={c.iniciais} color={e.cor} />
                        <div style={{ flex: 1 }}><div className="t-strong" style={{ fontSize: 14 }}>{c.nome}</div><div className="t-caption" style={{ fontSize: 11 }}>{c.funcao} · {e.nome}</div></div>
                        <div style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 16, height: 16 }}>{Icon.plus}</span></div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!searching && !pickedEmpresa && (
                <div style={{ maxHeight: 360, overflowY: 'auto' }} className="stack stack-1">
                  <div className="t-micro" style={{ fontSize: 10, marginBottom: 4 }}>SELECIONE A EMPRESA</div>
                  {availableByEmpresa.map(({ e, colabs }) => (
                    <button key={e.id} onClick={() => colabs.length > 0 && setPickedEmpresa(e.id)} disabled={colabs.length === 0}
                      style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', border: 0, cursor: colabs.length === 0 ? 'not-allowed' : 'pointer', background: 'var(--surface)', borderRadius: 12, boxShadow: 'inset 0 0 0 0.5px var(--border)', textAlign: 'left', width: '100%', opacity: colabs.length === 0 ? 0.5 : 1 }}>
                      <div style={{ width: 42, height: 42, borderRadius: 12, background: e.cor + '22', color: e.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>
                        {e.tipo === 'adm' ? 'A' : e.nome.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="t-strong" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 6, height: 6, borderRadius: 999, background: e.cor }} />{e.nome}</div>
                        <div className="t-caption" style={{ fontSize: 11, marginTop: 2 }}>{colabs.length === 0 ? 'Todos já no canteiro hoje' : `${colabs.length} ${colabs.length === 1 ? 'pessoa disponível' : 'pessoas disponíveis'}`}</div>
                      </div>
                      {colabs.length > 0 && <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>}
                    </button>
                            ))}
                </div>
              )}

              {!searching && pickedEmpresa && (
                <>
                  {(() => {
                    const e = empresas.find(x => x.id === pickedEmpresa) || { nome: '-', cor: '#888' };
                    return <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, padding: '8px 12px', background: e.cor + '14', borderRadius: 10 }}><div style={{ width: 8, height: 8, borderRadius: 999, background: e.cor }} /><div className="t-strong" style={{ fontSize: 13 }}>{e.nome}</div></div>;
                  })()}
                  <div style={{ maxHeight: 320, overflowY: 'auto' }} className="stack stack-1">
                    {colabsOfPicked.length === 0 && <div className="t-caption" style={{ textAlign: 'center', padding: 20 }}>Nenhum colaborador disponivel desta empresa.</div>}
                    {colabsOfPicked.map(c => {
                      const e = empForColab(c) || { nome: '-', cor: '#888' };
                      return (
                        <button key={c.id} onClick={() => addFromCadastro(c)} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 12px', border: 0, cursor: 'pointer', background: 'var(--surface)', borderRadius: 12, boxShadow: 'inset 0 0 0 0.5px var(--border)', textAlign: 'left', width: '100%' }}>
                          <Avatar ini={c.iniciais} color={e.cor} />
                          <div style={{ flex: 1 }}><div className="t-strong" style={{ fontSize: 14 }}>{c.nome}</div><div className="t-caption" style={{ fontSize: 11 }}>{c.funcao}</div></div>
                          <div style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ width: 16, height: 16 }}>{Icon.plus}</span></div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {tab === 'novo' && (
        <div className="stack stack-3">
          <div>
            <div className="t-micro" style={{ fontSize: 10, marginBottom: 6 }}>NOME COMPLETO</div>
            <input className="ipt" value={nNome} onChange={e => setNNome(e.target.value)} placeholder="Ex.: Joao Silva" />
          </div>
          <div>
            <div className="t-micro" style={{ fontSize: 10, marginBottom: 6 }}>EMPRESA</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {empresas.map(e => (
                <button key={e.id} onClick={() => setNEmpresa(e.id === 'adm' ? null : e.id)}
                  style={{ height: 36, padding: '0 12px', border: 0, cursor: 'pointer', borderRadius: 999, fontSize: 12, fontWeight: 700, background: (nEmpresa === e.id || (!nEmpresa && e.id === 'adm')) ? 'var(--primary)' : 'var(--surface-2)', color: (nEmpresa === e.id || (!nEmpresa && e.id === 'adm')) ? '#fff' : 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: e.cor }} />{e.nome}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="t-micro" style={{ fontSize: 10, marginBottom: 6 }}>FUNÇÃO</div>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-2)', borderRadius: 10 }}>
              {['Oficial', 'Ajudante', 'Outro'].map(f => (
                <button key={f} onClick={() => setNFuncao(f)} style={{ flex: 1, height: 36, border: 0, cursor: 'pointer', borderRadius: 8, fontSize: 12, fontWeight: 700, background: nFuncao === f ? 'var(--surface)' : 'transparent', color: nFuncao === f ? 'var(--text-1)' : 'var(--text-2)', boxShadow: nFuncao === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{f}</button>
              ))}
            </div>
          </div>
          <div className="t-caption" style={{ color: 'var(--text-3)', fontSize: 11 }}>
            Entra no efetivo de hoje e já vai para o cadastro. A engenharia é avisada
            para conferir a documentação de segurança do trabalho.
          </div>
          <button className="btn btn-primary btn-block" disabled={!nNome.trim() || salvandoNovo} onClick={addNovo}>
            <span style={{ width: 16, height: 16 }}>{Icon.plus}</span>
            {salvandoNovo ? 'Salvando…' : 'Adicionar ao efetivo'}
          </button>
        </div>
      )}

      <div style={{ position: 'sticky', bottom: -18, marginTop: 18, marginLeft: -16, marginRight: -16, marginBottom: -18, padding: '12px 16px calc(14px + env(safe-area-inset-bottom))', background: 'var(--surface)', borderTop: '0.5px solid var(--divider)', boxShadow: '0 -8px 18px rgba(0,0,0,0.05)' }}>
        <button className="btn btn-primary btn-block" style={{ height: 48 }} onClick={onClose}>
          {addedThisSession.length === 0 ? 'Fechar' : <><span style={{ width: 16, height: 16 }}>{Icon.check}</span>{'Concluir e atribuir atividades - ' + addedThisSession.length}</>}
        </button>
        {addedThisSession.length > 0 && <div className="t-caption" style={{ textAlign: 'center', marginTop: 6, fontSize: 11 }}>Você pode adicionar mais antes de continuar.</div>}
      </div>
    </div>
  );
}

// ── PlannedRow: activity selection button in MestreRDOAssign ─────────────
function PlannedRow({ a, on, onClick, muted }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', gap: 12, alignItems: 'center',
      padding: '10px 14px', border: 0, cursor: 'pointer',
      background: on ? 'var(--primary)' : 'var(--surface)',
      borderRadius: 12,
      boxShadow: on ? 'none' : 'inset 0 0 0 0.5px var(--border)',
      textAlign: 'left', width: '100%',
      opacity: muted ? 0.7 : 1,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
        background: on ? 'rgba(255,255,255,0.2)' : 'var(--primary-tint,rgba(14,108,184,0.1))',
        color: on ? '#fff' : 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ width: 14, height: 14 }}>{Icon.clipboard}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          color: on ? '#fff' : 'var(--text-1)',
          lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {a.descricao}
        </div>
        {a.ambiente && (
          <div style={{ fontSize: 11, color: on ? 'rgba(255,255,255,0.75)' : 'var(--text-3)', marginTop: 2 }}>
            {a.ambiente}
          </div>
        )}
      </div>
      {on && <span style={{ width: 16, height: 16, color: '#fff', flexShrink: 0 }}>{Icon.check}</span>}
    </button>
  );
}

export function MestreRDOAssign({ goto, params, efetivo, setEfetivo, atividades = [] }) {
  const { empresas } = useObra();
  const extraMode = params.extraMode || false;
  const w = efetivo.find(x => x.id === params.workerId);
  const [livre, setLivre] = useState('');
  const [picked, setPicked] = useState(extraMode ? null : (w?.atividade_id || null));

  if (!w) {
    return (
      <div className="page page-pad">
        <div className="card" style={{ textAlign: 'center', padding: 20 }}>
          <div className="t-strong">Colaborador não encontrado</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => goto('rdo')}>Voltar</button>
        </div>
      </div>
    );
  }

  const e = empresas.find(x => x.id === w.empresa_id) || { nome: w.empresa_nome || 'Sem empresa', cor: '#888' };
  const empresaNome = e.nome;

  const sugeridas = atividades.filter(a => a.empreiteiro === empresaNome || a.empreiteiro === w.empresa_nome);
  const outras = atividades.filter(a => !sugeridas.includes(a));

  const onPickAtividade = (atividadeId) => {
    setPicked(atividadeId);
    setLivre('');
  };

  const save = () => {
    if (extraMode) {
      setEfetivo(prev => prev.map(x => x.id === w.id ? {
        ...x,
        extras: [...(x.extras || []), {
          id: 'extra-' + Date.now(),
          atividade_id: picked,
          atividade_livre: !picked && livre.trim() ? livre.trim() : null,
          status: 'em_andamento',
        }],
      } : x));
    } else {
      setEfetivo(prev => prev.map(x => x.id === w.id ? {
        ...x,
        atividade_id: picked,
        atividade_livre: !picked && livre.trim() ? livre.trim() : null,
        atividade_status: null,
      } : x));
    }
    goto('rdo');
  };

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('rdo')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <div style={{ padding: '6px var(--pad-4) 4px' }}>
        <div className="row-flex" style={{ gap: 12 }}>
          <Avatar ini={w.iniciais} color={e?.cor || '#888'} size={48} />
          <div style={{ flex: 1 }}>
            <div className="t-h2" style={{ fontSize: 20, lineHeight: 1.2 }}>{w.nome}</div>
            <div className="t-caption">{w.funcao} - {e?.nome}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: '6px var(--pad-4) 4px' }}>
        <div className="t-2" style={{ fontSize: 14 }}>{extraMode ? 'Qual o outro serviço?' : 'O que ele(a) está fazendo agora?'}</div>
      </div>
      <div className="page-pad stack stack-3" style={{ paddingBottom: 100 }}>
        {atividades.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div className="t-strong">Nenhuma atividade planejada hoje</div>
            <div className="t-caption" style={{ marginTop: 4 }}>Use o campo abaixo para registrar a atividade livre.</div>
          </div>
        )}
        {sugeridas.length > 0 && (
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>SUGERIDAS - {e?.nome}</div>
            <div className="stack stack-1">
              {sugeridas.map(a => (
                <PlannedRow key={a.id} a={a} on={picked === a.id} onClick={() => onPickAtividade(a.id)} />
              ))}
            </div>
          </div>
        )}
        {outras.length > 0 && (
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>OUTRAS ATIVIDADES DE HOJE</div>
            <div className="stack stack-1">
              {outras.map(a => (
                <PlannedRow key={a.id} a={a} on={picked === a.id} onClick={() => onPickAtividade(a.id)} muted />
              ))}
            </div>
          </div>
        )}
        <div>
          <div className="t-micro" style={{ marginBottom: 8 }}>ATIVIDADE LIVRE</div>
          <input className="ipt" placeholder="Ex.: Limpeza pesada do hall" value={livre}
            onChange={e => { setLivre(e.target.value); if (e.target.value) setPicked(null); }} />
          {livre && <div className="t-caption" style={{ marginTop: 6, fontSize: 11, color: 'var(--warn)' }}>Atividade fora do planejamento — será registrada como livre.</div>}
        </div>

        <button
          className="btn btn-primary"
          style={{ width: '100%', height: 50, fontSize: 15, fontWeight: 800 }}
          onClick={save}
          disabled={!picked && !livre.trim()}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
