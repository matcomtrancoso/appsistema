import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { contem } from '../lib/busca';
import { Icon, PageHeader, StatChips } from '../components/index';
import { hojeLocal, addDaysISO, diasRestantes as diasAteOPrazo } from '../lib/date';
import { fmtV, parseV, fmtCur } from '../lib/moeda.js';
import { avisarErro, motivoAmigavel } from '../lib/msg-amigavel';

// ── Cores por status ──────────────────────────────────────────────────────────
const ST = {
  em_aberto: { label: 'Em aberto', color: '#1565C0', bg: '#1565C0', bgChip: '#1976D2', border: 'rgba(21,101,192,0.18)', footerBg: 'rgba(21,101,192,0.06)' },
  enviado:   { label: 'Enviado',   color: '#92400E', bg: '#D97706', bgChip: '#F59E0B', border: 'rgba(217,119,6,0.20)',   footerBg: 'rgba(245,158,11,0.08)' },
  aprovado:  { label: 'Aprovado',  color: '#14532D', bg: '#16A34A', bgChip: '#22C55E', border: 'rgba(22,163,74,0.20)',   footerBg: 'rgba(22,163,74,0.08)'  },
};
const STATUS_ORDER = ['em_aberto', 'enviado', 'aprovado'];

const TIPO_LABEL = { projeto: 'Projeto', mao_de_obra: 'Mão de obra', material: 'Material', equipamento: 'Equipamento' };

const CORES_FORN = [
  '#7C5CFF','#0EA5E9','#F59E0B','#8B7355','#64748B',
  '#1F6B3A','#E11D48','#0891B2','#7C3AED','#EA580C',
];
function randomCor() { return CORES_FORN[Math.floor(Math.random() * CORES_FORN.length)]; }

const SEM_RESP = '__sem__';

function todayISO() { return hojeLocal(); }
function addDays(base, n) { return addDaysISO(base, n); }
function fmtDate(str) {
  if (!str) return '—';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}
// Compara DIA a DIA. A versão antiga media do meio-dia do prazo até o instante
// atual: de manhã, um prazo vencido ontem aparecia como "vence hoje".
function diasRestantes(prazo) { return diasAteOPrazo(prazo); }

// Prazo relevante de cada card (para ordenação por vencimento)
function prazoDeVencimento(c) {
  if (c.status === 'em_aberto') return c.prazo_envio || null;
  if (c.status === 'enviado')   return c.prazo_aprovacao || null;
  return c.data_aprovacao || null;
}

// Ordena por vencimento mais próximo → mais distante (aprovadas: mais recente primeiro).
function ordenarPorVencimento(list) {
  return [...list].sort((a, b) => {
    const pa = prazoDeVencimento(a);
    const pb = prazoDeVencimento(b);
    if (a.status === 'aprovado') {
      // Sem prazo real: mais recentemente aprovadas primeiro
      if (!pa && !pb) return 0;
      if (!pa) return 1;
      if (!pb) return -1;
      return pa < pb ? 1 : pa > pb ? -1 : 0;
    }
    if (!pa && !pb) return 0;
    if (!pa) return 1;   // sem prazo vai para o fim
    if (!pb) return -1;
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
}

// ── Hook: detecta desktop ────────────────────────────────────────────────────
function useIsDesktop(bp = 900) {
  const [is, setIs] = useState(() => typeof window !== 'undefined' && window.innerWidth >= bp);
  useEffect(() => {
    const onResize = () => setIs(window.innerWidth >= bp);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bp]);
  return is;
}

// ── Comentários: helpers de banco ────────────────────────────────────────────
async function resolverComentariosAbertos(contratacaoId) {
  await supabase.from('contratacoes_comentarios')
    .update({ resolvido: true, updated_at: new Date().toISOString() })
    .eq('contratacao_id', contratacaoId)
    .eq('resolvido', false);
}

// Ícone de comentário (inline)
const ChatIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '100%', height: '100%' }}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

// ── Meta (igual ao de Pendências) ────────────────────────────────────────────
function Meta({ icon, label, value }) {
  return (
    <div>
      <div className="t-micro" style={{ fontSize: 9, marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div className="row-flex" style={{ gap: 5 }}>
        <span style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }}>{icon}</span>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{value || '—'}</div>
      </div>
    </div>
  );
}


// Data em que a observação foi lançada — evita ter que digitar no texto.
const dataNota = (c) => {
  const iso = c?.data || c?.created_at;
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
};

// ── Bloco de comentários dentro do card ──────────────────────────────────────
// Desktop: mostra observações ativas em destaque + resolvidas riscadas.
// Mobile: mostra apenas um ícone com contador (leitura/edição vai no popup).
function CardComments({ comentarios, isDesktop }) {
  const ativos     = comentarios.filter(x => !x.resolvido);
  const resolvidos = comentarios.filter(x => x.resolvido);
  if (comentarios.length === 0) return null;

  if (!isDesktop) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontWeight: 700,
        color: ativos.length ? 'var(--primary)' : 'var(--text-3)',
      }}>
        <span style={{ width: 13, height: 13 }}>{ChatIcon}</span>
        {ativos.length > 0 ? ativos.length : resolvidos.length}
      </span>
    );
  }

  return (
    <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {ativos.map(cm => (
        <div key={cm.id} style={{
          fontSize: 12, lineHeight: 1.35, color: 'var(--text-1)',
          background: 'rgba(245,158,11,0.10)', border: '0.5px solid rgba(217,119,6,0.25)',
          borderRadius: 8, padding: '6px 9px', display: 'flex', gap: 6, alignItems: 'flex-start',
        }}>
          <span style={{ width: 12, height: 12, color: '#B45309', flexShrink: 0, marginTop: 1 }}>{ChatIcon}</span>
          <span style={{ flex: 1 }}>{cm.texto}</span>
          {dataNota(cm) && <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, color: '#B45309', opacity: 0.85 }}>{dataNota(cm)}</span>}
        </div>
      ))}
      {resolvidos.map(cm => (
        <div key={cm.id} style={{
          fontSize: 11, lineHeight: 1.3, color: 'var(--text-3)',
          textDecoration: 'line-through', paddingLeft: 4,
          display: 'flex', gap: 6, alignItems: 'flex-start', opacity: 0.75,
        }}>
          <span style={{ fontSize: 10, marginTop: 1 }}>✓</span>
          <span style={{ flex: 1 }}>{cm.texto}</span>
          {dataNota(cm) && <span style={{ flexShrink: 0, fontSize: 10 }}>{dataNota(cm)}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Card (estrutura idêntica ao PendCard) ────────────────────────────────────
function ContratacaoCard({ c, comentarios = [], isDesktop, onClick }) {
  const st = ST[c.status] || ST.em_aberto;
  const prazo = c.status === 'em_aberto' ? c.prazo_envio : c.status === 'enviado' ? c.prazo_aprovacao : null;
  const dias = diasRestantes(prazo);
  const overdue = dias !== null && dias < 0;
  const dueLabel = dias === null ? '' : overdue ? `${Math.abs(dias)}d atrasado` : dias === 0 ? 'vence hoje' : `vence em ${dias}d`;
  const dataCriacao = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';

  return (
    <div className="card tap" onClick={onClick} style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${st.bg}` }}>
      {/* Linha topo: data · número | badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 6px' }}>
        <div className="t-micro">
          {dataCriacao}{c.numero_contratacao ? ` · ${c.numero_contratacao}` : ''}
        </div>
        {/* Chip sólido com cor vibrante */}
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.5, padding: '4px 10px', borderRadius: 999, background: st.bgChip, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}>
          {st.label.toUpperCase()}
        </div>
      </div>

      {/* Título */}
      <div style={{ padding: '0 14px 10px' }}>
        <div className="t-strong" style={{ fontSize: 15, lineHeight: 1.3 }}>{c.descricao}</div>
      </div>

      {/* Grid 2 colunas */}
      <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Meta icon={Icon.clipboard} label="Tipo" value={TIPO_LABEL[c.tipo] || c.tipo} />
        <Meta icon={Icon.users} label={c.status === 'aprovado' ? 'Fornecedor' : 'Responsável'} value={c.status === 'aprovado' ? c.fornecedor_nome : c.responsavel_nome} />
      </div>

      {/* Observações (desktop mostra o texto; mobile mostra só o ícone no rodapé) */}
      {isDesktop && <CardComments comentarios={comentarios} isDesktop />}

      {/* Rodapé colorido por status */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px',
        background: overdue ? 'rgba(176,36,42,0.08)' : st.footerBg,
        borderTop: `1px solid ${st.border}`,
      }}>
        <div className="row-flex" style={{ gap: 6 }}>
          <span style={{ width: 14, height: 14, color: overdue ? 'var(--danger)' : st.bg }}>{Icon.calendar}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? 'var(--danger)' : st.color }}>
            {prazo ? `${fmtDate(prazo)} · ${dueLabel}` : c.status === 'aprovado' ? `Aprovado ${fmtDate(c.data_aprovacao)}` : '—'}
          </span>
        </div>
        <div className="row-flex" style={{ gap: 10 }}>
          {!isDesktop && <CardComments comentarios={comentarios} isDesktop={false} />}
          {c.data_envio && (
            <span style={{ fontSize: 11, color: st.color, fontWeight: 600, opacity: 0.7 }}>
              Enviado {fmtDate(c.data_envio)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-modal: adicionar nome rápido ─────────────────────────────────────────
function SubModal({ title, placeholder, onSave, onClose }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 340, zIndex: 201, boxShadow: '0 8px 40px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', marginBottom: 16 }}>{title}</div>
        <input autoFocus value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && val.trim() && onSave(val.trim())}
          placeholder={placeholder}
          style={{ width: '100%', height: 44, border: '1.5px solid var(--border)', borderRadius: 10, padding: '0 14px', fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' }} />
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={onClose} style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Cancelar</button>
          <button onClick={() => val.trim() && onSave(val.trim())} style={{ flex: 1, height: 44, borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard base ───────────────────────────────────────────────────────────────
function WizardModal({ title, steps, step, children, onBack, onClose, onNext, nextLabel = 'Continuar', nextDisabled, loading }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 440, zIndex: 101, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          {step > 0 && onBack ? (
            <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
            </button>
          ) : <div style={{ width: 32 }} />}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>{title}</div>
            {steps > 1 && (
              <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 8 }}>
                {Array.from({ length: steps }).map((_, i) => (
                  <div key={i} style={{ height: 3, borderRadius: 999, transition: 'all 0.2s', width: i === step ? 20 : 8, background: i <= step ? 'var(--primary)' : 'var(--border)' }} />
                ))}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <div style={{ padding: '20px' }}>{children}</div>
        <div style={{ padding: '0 20px 20px' }}>
          <button onClick={onNext} disabled={nextDisabled || loading}
            style={{ width: '100%', height: 48, borderRadius: 12, border: 'none', cursor: nextDisabled || loading ? 'not-allowed' : 'pointer', background: nextDisabled || loading ? 'var(--surface-2)' : 'var(--primary)', color: nextDisabled || loading ? 'var(--text-3)' : '#fff', fontSize: 15, fontWeight: 800 }}>
            {loading ? 'Salvando…' : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Wizard: Nova Contratação (4 passos) ───────────────────────────────────────
function NovaContratacaoWizard({ responsaveis, onRefreshResp, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [descricao, setDescricao] = useState('');
  const [tipo, setTipo] = useState('');
  const [prazoEnvio, setPrazoEnvio] = useState('');
  const [respId, setRespId] = useState('');
  const [respNome, setRespNome] = useState('');
  const [observacao, setObservacao] = useState('');
  const [showSubModal, setShowSubModal] = useState(false);
  const [saving, setSaving] = useState(false);

  async function addResponsavel(nome) {
    const { data } = await supabase.from('contratacoes_responsaveis').insert({ nome }).select().single();
    if (data) { onRefreshResp(); setRespId(data.id); setRespNome(data.nome); }
    setShowSubModal(false);
  }

  async function salvar() {
    setSaving(true);
    const { data, error } = await supabase.from('contratacoes').insert({
      descricao, tipo, prazo_envio: prazoEnvio || null,
      responsavel_id: respId || null, responsavel_nome: respNome || null,
      status: 'em_aberto',
    }).select().single();
    if (!error && data && observacao.trim()) {
      await supabase.from('contratacoes_comentarios').insert({
        contratacao_id: data.id, etapa: 'em_aberto', texto: observacao.trim(),
      });
    }
    setSaving(false);
    if (error) { avisarErro(error, 'criar a contratação'); return; }
    onSaved();
  }

  const canNext = [descricao.trim().length > 0, tipo !== '', true, true, true];

  const fieldStyle = { width: '100%', height: 48, border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 14px', fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' };

  const steps = [
    <div key="0">
      <div className="t-micro" style={{ marginBottom: 8 }}>DESCRIÇÃO</div>
      <textarea autoFocus value={descricao} onChange={e => setDescricao(e.target.value)}
        placeholder="Ex.: Projeto estrutural, Mão de obra alvenaria…"
        style={{ ...fieldStyle, height: 90, padding: '12px 14px', resize: 'none', fontFamily: 'inherit' }} />
    </div>,
    <div key="1">
      <div className="t-micro" style={{ marginBottom: 12 }}>TIPO</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {[['projeto','📐 Projeto'],['mao_de_obra','🧱 Mão de obra'],['material','📦 Material'],['equipamento','🛠️ Equipamento']].map(([k, l]) => (
          <button key={k} onClick={() => setTipo(k)} style={{
            height: 72, borderRadius: 14, border: tipo === k ? '2px solid var(--primary)' : '1.5px solid var(--border)',
            background: tipo === k ? 'rgba(14,108,184,0.08)' : 'var(--surface-2)',
            cursor: 'pointer', fontSize: 15, fontWeight: 800,
            color: tipo === k ? 'var(--primary)' : 'var(--text-2)',
          }}>{l}</button>
        ))}
      </div>
    </div>,
    <div key="2">
      <div className="t-micro" style={{ marginBottom: 8 }}>PRAZO PARA ENVIO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
      <input type="date" value={prazoEnvio} onChange={e => setPrazoEnvio(e.target.value)} style={fieldStyle} />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Quando precisa ter enviado para cotação?</div>
    </div>,
    <div key="3">
      <div className="t-micro" style={{ marginBottom: 8 }}>RESPONSÁVEL <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
      <select value={respId} onChange={e => { const r = responsaveis.find(x => x.id === e.target.value); setRespId(e.target.value); setRespNome(r?.nome || ''); }}
        style={{ ...fieldStyle, color: respId ? 'var(--text-1)' : 'var(--text-3)' }}>
        <option value="">Sem responsável</option>
        {responsaveis.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
      </select>
      <button onClick={() => setShowSubModal(true)} style={{ marginTop: 10, width: '100%', height: 40, borderRadius: 10, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
        + Novo responsável
      </button>
    </div>,
    <div key="4">
      <div className="t-micro" style={{ marginBottom: 8 }}>OBSERVAÇÃO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
      <textarea value={observacao} onChange={e => setObservacao(e.target.value)}
        placeholder="Ex.: Falta enviar planta atualizada, cobrar retorno do fornecedor…"
        style={{ ...fieldStyle, height: 90, padding: '12px 14px', resize: 'none', fontFamily: 'inherit' }} />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Fica visível enquanto estiver em aberto. Ao avançar, é marcada como resolvida.</div>
    </div>,
  ];

  return (
    <>
      <WizardModal title="Nova Contratação" steps={5} step={step}
        onBack={step > 0 ? () => setStep(s => s - 1) : null} onClose={onClose}
        onNext={step < 4 ? () => setStep(s => s + 1) : salvar}
        nextLabel={step < 4 ? 'Continuar' : 'Criar contratação'}
        nextDisabled={!canNext[step]} loading={saving}>
        {steps[step]}
      </WizardModal>
      {showSubModal && <SubModal title="Novo responsável" placeholder="Nome" onSave={addResponsavel} onClose={() => setShowSubModal(false)} />}
    </>
  );
}

// ── Wizard: Marcar como Enviado (3 passos) ────────────────────────────────────
function EnviarWizard({ contratacao, nextNum, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [dataEnvio, setDataEnvio] = useState(todayISO());
  const [editandoData, setEditandoData] = useState(false);
  const [numero, setNumero] = useState(nextNum);
  const [prazoMode, setPrazoMode] = useState(null);
  const [prazoAprov, setPrazoAprov] = useState('');
  const [saving, setSaving] = useState(false);

  function setPrazo(dias) { setPrazoMode('+' + dias); setPrazoAprov(addDays(dataEnvio, dias)); }

  async function salvar() {
    setSaving(true);
    const { error } = await supabase.from('contratacoes').update({
      status: 'enviado', data_envio: dataEnvio,
      numero_contratacao: numero.trim() || null,
      prazo_aprovacao: prazoAprov || null,
    }).eq('id', contratacao.id);
    if (!error) await resolverComentariosAbertos(contratacao.id);
    setSaving(false);
    if (error) { avisarErro(error, 'marcar como enviado'); return; }
    onSaved();
  }

  const fieldStyle = { width: '100%', height: 48, border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 14px', fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' };

  const steps = [
    <div key="0">
      <div className="t-micro" style={{ marginBottom: 12 }}>DATA DO ENVIO</div>
      {!editandoData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => setEditandoData(false)} style={{ height: 56, borderRadius: 12, border: '2px solid var(--primary)', background: 'rgba(14,108,184,0.08)', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>✓ Hoje ({fmtDate(todayISO())})</button>
          <button onClick={() => setEditandoData(true)} style={{ height: 56, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Editar data</button>
        </div>
      ) : <input type="date" value={dataEnvio} onChange={e => setDataEnvio(e.target.value)} style={fieldStyle} />}
    </div>,
    <div key="1">
      <div className="t-micro" style={{ marginBottom: 8 }}>Nº DA CONTRATAÇÃO</div>
      <input value={numero} onChange={e => setNumero(e.target.value)} style={fieldStyle} />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Sugestão automática — edite se necessário.</div>
    </div>,
    <div key="2">
      <div className="t-micro" style={{ marginBottom: 12 }}>PRAZO PARA APROVAÇÃO</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
        {[3,5,7,10].map(n => (
          <button key={n} onClick={() => setPrazo(n)} style={{ height: 48, borderRadius: 12, border: prazoMode === '+'+n ? '2px solid var(--primary)' : '1.5px solid var(--border)', background: prazoMode === '+'+n ? 'rgba(14,108,184,0.08)' : 'var(--surface-2)', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: prazoMode === '+'+n ? 'var(--primary)' : 'var(--text-2)' }}>+{n} dias</button>
        ))}
      </div>
      <button onClick={() => setPrazoMode('custom')} style={{ width: '100%', height: 40, borderRadius: 10, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--text-2)', marginBottom: prazoMode === 'custom' ? 8 : 0 }}>Outra data</button>
      {prazoMode === 'custom' && <input type="date" value={prazoAprov} onChange={e => setPrazoAprov(e.target.value)} style={fieldStyle} />}
      {prazoAprov && <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 700, marginTop: 8 }}>Prazo: {fmtDate(prazoAprov)}</div>}
    </div>,
  ];

  return (
    <WizardModal title="Marcar como Enviado" steps={3} step={step}
      onBack={step > 0 ? () => setStep(s => s - 1) : null} onClose={onClose}
      onNext={step < 2 ? () => setStep(s => s + 1) : salvar}
      nextLabel={step < 2 ? 'Continuar' : 'Confirmar envio'} loading={saving}>
      {steps[step]}
    </WizardModal>
  );
}

// ── Wizard: Marcar como Aprovado (2 passos) ───────────────────────────────────
function AprovarWizard({ contratacao, onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [dataAprov, setDataAprov] = useState(todayISO());
  const [editandoData, setEditandoData] = useState(false);
  const [fornNome, setFornNome] = useState('');
  const [valor, setValor] = useState('');
  const [cadastrarForn, setCadastrarForn] = useState(false);
  const [corForn] = useState(randomCor);
  const [saving, setSaving] = useState(false);

  async function salvar() {
    setSaving(true);
    const nome = fornNome.trim() || null;
    const { error } = await supabase.from('contratacoes').update({
      status: 'aprovado', data_aprovacao: dataAprov, fornecedor_nome: nome,
      valor_contrato: parseV(valor),
    }).eq('id', contratacao.id);
    if (error) { setSaving(false); avisarErro(error, 'marcar como aprovado'); return; }
    await resolverComentariosAbertos(contratacao.id);
    if (cadastrarForn && nome) {
      const { error: e2 } = await supabase.from('empreiteiros').insert({ nome, cor: corForn });
      if (e2) alert('A contratação foi aprovada, mas o fornecedor não entrou nos cadastros. ' + motivoAmigavel(e2));
    }
    setSaving(false); onSaved();
  }

  const fieldStyle = { width: '100%', height: 48, border: '1.5px solid var(--border)', borderRadius: 12, padding: '0 14px', fontSize: 15, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' };

  const steps = [
    <div key="0">
      <div className="t-micro" style={{ marginBottom: 12 }}>DATA DA APROVAÇÃO</div>
      {!editandoData ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={() => setEditandoData(false)} style={{ height: 56, borderRadius: 12, border: '2px solid var(--primary)', background: 'rgba(14,108,184,0.08)', cursor: 'pointer', fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>✓ Hoje ({fmtDate(todayISO())})</button>
          <button onClick={() => setEditandoData(true)} style={{ height: 56, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Editar data</button>
        </div>
      ) : <input type="date" value={dataAprov} onChange={e => setDataAprov(e.target.value)} style={fieldStyle} />}
    </div>,
    <div key="1">
      <div className="t-micro" style={{ marginBottom: 8 }}>FORNECEDOR APROVADO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
      <input value={fornNome}
        onChange={e => { setFornNome(e.target.value); if (!e.target.value.trim()) setCadastrarForn(false); }}
        placeholder="Nome do fornecedor…" style={fieldStyle} />
      {fornNome.trim() && (
        <div onClick={() => setCadastrarForn(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: '10px 14px', borderRadius: 12, border: `1.5px solid ${cadastrarForn ? corForn : 'var(--border)'}`, background: cadastrarForn ? `${corForn}14` : 'var(--surface-2)', cursor: 'pointer', transition: 'all 0.15s' }}>
          {/* Checkbox visual */}
          <div style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${cadastrarForn ? corForn : 'var(--border)'}`, background: cadastrarForn ? corForn : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            {cadastrarForn && (
              <svg viewBox="0 0 12 12" fill="none" style={{ width: 12, height: 12 }}>
                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: cadastrarForn ? corForn : 'var(--text-2)' }}>Cadastrar no base de fornecedores</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Será adicionado em Cadastros → Fornecedores</div>
          </div>
          {/* Bolinha de cor sorteada */}
          <div style={{ width: 24, height: 24, borderRadius: 999, background: corForn, flexShrink: 0, boxShadow: cadastrarForn ? `0 0 0 3px ${corForn}40` : 'none', transition: 'box-shadow 0.15s' }} />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="t-micro" style={{ marginBottom: 8 }}>VALOR DO CONTRATO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
        <input type="text" inputMode="numeric" value={valor}
          onChange={e => setValor(fmtV(e.target.value))}
          placeholder="R$ 0,00" style={fieldStyle} />
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Só para registro — não entra em nenhum cálculo nem no relatório.</div>
      </div>
    </div>,
  ];

  return (
    <WizardModal title="Marcar como Aprovado" steps={2} step={step}
      onBack={step > 0 ? () => setStep(s => s - 1) : null} onClose={onClose}
      onNext={step < 1 ? () => setStep(s => s + 1) : salvar}
      nextLabel={step < 1 ? 'Continuar' : 'Confirmar aprovação'} loading={saving}>
      {steps[step]}
    </WizardModal>
  );
}

// ── Seção de comentários dentro do popup ─────────────────────────────────────
function ComentariosSheet({ c, comentarios, onChanged }) {
  const [novo, setNovo] = useState('');
  const [editId, setEditId] = useState(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);

  const ativos     = comentarios.filter(x => !x.resolvido);
  const resolvidos = comentarios.filter(x => x.resolvido);
  const podeAdicionar = c.status !== 'aprovado';
  const etapaLabel = c.status === 'em_aberto' ? 'Em aberto' : c.status === 'enviado' ? 'Enviado' : 'Aprovado';

  async function addComentario() {
    if (!novo.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('contratacoes_comentarios').insert({
      contratacao_id: c.id, etapa: c.status, texto: novo.trim(),
    });
    setBusy(false);
    if (error) { avisarErro(error, 'salvar a observação'); return; }
    setNovo('');
    onChanged();
  }

  async function salvarEdicao(id) {
    if (!editText.trim()) { setEditId(null); return; }
    setBusy(true);
    const { error } = await supabase.from('contratacoes_comentarios')
      .update({ texto: editText.trim(), updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(false);
    setEditId(null);
    if (error) { avisarErro(error, 'salvar a edição'); return; }
    onChanged();
  }

  async function excluir(id) {
    setBusy(true);
    await supabase.from('contratacoes_comentarios').delete().eq('id', id);
    setBusy(false);
    onChanged();
  }

  // Dar baixa numa observação sozinha, sem precisar avançar a etapa. O avanço
  // continua resolvendo tudo o que ficou em aberto (resolverComentariosAbertos).
  async function marcar(id, resolvido) {
    setBusy(true);
    await supabase.from('contratacoes_comentarios')
      .update({ resolvido, updated_at: new Date().toISOString() }).eq('id', id);
    setBusy(false);
    onChanged();
  }

  const inputStyle = { width: '100%', minHeight: 40, border: '1.5px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 13, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit', resize: 'vertical' };

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="t-micro" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 12, height: 12 }}>{ChatIcon}</span> OBSERVAÇÕES
      </div>

      {/* Ativos (etapa atual) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ativos.map(cm => (
          <div key={cm.id} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,158,11,0.10)', border: '0.5px solid rgba(217,119,6,0.25)' }}>
            {editId === cm.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <textarea autoFocus value={editText} onChange={e => setEditText(e.target.value)} style={inputStyle} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setEditId(null)} style={{ flex: 1, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>Cancelar</button>
                  <button onClick={() => salvarEdicao(cm.id)} disabled={busy} style={{ flex: 1, height: 34, borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>Salvar</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4, color: 'var(--text-1)' }}>{cm.texto}</div>
                  {dataNota(cm) && <div style={{ fontSize: 10.5, fontWeight: 700, color: '#B45309', marginTop: 3 }}>🗓 {dataNota(cm)}{cm.autor_nome ? ' · ' + cm.autor_nome : ''}</div>}
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <button onClick={() => marcar(cm.id, true)} disabled={busy} title="Marcar como resolvida" style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface)', color: '#16A34A', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 900 }}>✓</button>
                  <button onClick={() => { setEditId(cm.id); setEditText(cm.texto); }} title="Editar" style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 13, height: 13 }}>{Icon.edit}</span>
                  </button>
                  <button onClick={() => excluir(cm.id)} title="Excluir" style={{ width: 28, height: 28, borderRadius: 6, border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 13, height: 13 }}>{Icon.x}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Campo para novo comentário */}
      {podeAdicionar && (
        <div style={{ marginTop: ativos.length ? 8 : 0, display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea value={novo} onChange={e => setNovo(e.target.value)} placeholder={`Nova observação (${etapaLabel.toLowerCase()})…`} style={inputStyle} />
          <button onClick={addComentario} disabled={busy || !novo.trim()} style={{ height: 40, padding: '0 14px', borderRadius: 10, border: 'none', background: novo.trim() ? 'var(--primary)' : 'var(--surface-2)', color: novo.trim() ? '#fff' : 'var(--text-3)', cursor: novo.trim() ? 'pointer' : 'default', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>Add</button>
        </div>
      )}

      {/* Resolvidos (etapas anteriores) — riscados/cinza */}
      {resolvidos.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="t-micro" style={{ marginBottom: 6, fontSize: 9, opacity: 0.8 }}>RESOLVIDAS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {resolvidos.map(cm => (
              <div key={cm.id} style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--text-3)', opacity: 0.8, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 11, marginTop: 1 }}>✓</span>
                <span style={{ flex: 1, textDecoration: 'line-through' }}>{cm.texto}</span>
                {dataNota(cm) && <span style={{ flexShrink: 0, fontSize: 10.5 }}>{dataNota(cm)}</span>}
                <button onClick={() => marcar(cm.id, false)} disabled={busy} title="Reabrir observação" style={{ border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>↺</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Popup centralizado do card ────────────────────────────────────────────────
function CardSheet({ c, comentarios, onClose, onAction, onDelete, onRefresh }) {
  const [confirmaDelete, setConfirmaDelete] = useState(false);
  const [deleting, setDeleting]             = useState(false);
  const [confirmaUndo, setConfirmaUndo]     = useState(false);
  const [undoing, setUndoing]               = useState(false);
  const [editMode, setEditMode]             = useState(false);
  const [saving, setSaving]                 = useState(false);

  // campos editáveis
  const [descricao, setDescricao]           = useState(c.descricao || '');
  const [tipo, setTipo]                     = useState(c.tipo || '');
  const [prazoEnvio, setPrazoEnvio]         = useState(c.prazo_envio || '');
  const [respNome, setRespNome]             = useState(c.responsavel_nome || '');
  const [fornNome, setFornNome]             = useState(c.fornecedor_nome || '');
  const [valor, setValor]                   = useState(fmtCur(c.valor_contrato));
  const [cadastrarForn, setCadastrarForn]   = useState(false);
  const [corForn]                           = useState(randomCor);

  const st = ST[c.status] || ST.em_aberto;
  const fieldStyle = { width: '100%', height: 44, border: '1.5px solid var(--border)', borderRadius: 10, padding: '0 12px', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text-1)', boxSizing: 'border-box', outline: 'none' };

  async function excluir() {
    setDeleting(true);
    const { error } = await supabase.from('contratacoes').delete().eq('id', c.id);
    setDeleting(false);
    if (error) { avisarErro(error, 'excluir'); return; }
    onDelete();
  }

  // Desfaz o último avanço do kanban:
  // enviado → em_aberto (limpa dados do envio) · aprovado → enviado (limpa dados da aprovação)
  async function desfazer() {
    setUndoing(true);
    const patch = c.status === 'enviado'
      ? { status: 'em_aberto', data_envio: null, numero_contratacao: null, prazo_aprovacao: null }
      : { status: 'enviado', data_aprovacao: null, fornecedor_nome: null, valor_contrato: null };
    const { error } = await supabase.from('contratacoes').update(patch).eq('id', c.id);
    setUndoing(false);
    if (error) { avisarErro(error, 'desfazer'); return; }
    onDelete();
  }

  async function salvarEdicao() {
    setSaving(true);
    const novoFornNome = fornNome.trim() || null;
    const { error } = await supabase.from('contratacoes').update({
      descricao: descricao.trim() || c.descricao,
      tipo,
      prazo_envio: prazoEnvio || null,
      responsavel_nome: respNome.trim() || null,
      fornecedor_nome: novoFornNome,
      valor_contrato: parseV(valor),
    }).eq('id', c.id);
    if (error) { setSaving(false); avisarErro(error, 'salvar'); return; }
    // Cadastra no base de fornecedores se checkbox marcado
    if (cadastrarForn && novoFornNome) {
      await supabase.from('empreiteiros').insert({ nome: novoFornNome, cor: corForn });
    }
    setSaving(false);
    setEditMode(false);
    onRefresh();
  }

  // Ícone lápis inline SVG
  const PencilIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', borderRadius: 20, width: '100%', maxWidth: 460, zIndex: 101, boxShadow: '0 12px 60px rgba(0,0,0,0.3)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 18px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, borderBottom: '0.5px solid var(--divider)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.3 }}>
              {editMode ? 'Editar contratação' : c.descricao}
            </div>
            {!editMode && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
                {TIPO_LABEL[c.tipo]}{c.numero_contratacao ? ` · ${c.numero_contratacao}` : ''}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
            {!editMode && (
              <button onClick={() => setEditMode(true)} title="Editar" style={{ width: 34, height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
                {PencilIcon}
              </button>
            )}
            <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: st.bgChip, color: '#fff', letterSpacing: 0.4 }}>{st.label.toUpperCase()}</span>
            <button onClick={onClose} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Corpo */}
        <div style={{ padding: '16px 18px', overflowY: 'auto', flex: 1 }}>
          {editMode ? (
            /* Formulário de edição */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <div className="t-micro" style={{ marginBottom: 6 }}>DESCRIÇÃO</div>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)}
                  style={{ ...fieldStyle, height: 72, padding: '10px 12px', resize: 'none', fontFamily: 'inherit' }} />
              </div>
              <div>
                <div className="t-micro" style={{ marginBottom: 8 }}>TIPO</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[['projeto','📐 Projeto'],['mao_de_obra','🧱 Mão de obra'],['material','📦 Material'],['equipamento','🛠️ Equipamento']].map(([k, l]) => (
                    <button key={k} onClick={() => setTipo(k)} style={{
                      height: 52, borderRadius: 12, border: tipo === k ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                      background: tipo === k ? 'rgba(14,108,184,0.08)' : 'var(--surface-2)',
                      cursor: 'pointer', fontSize: 13, fontWeight: 800,
                      color: tipo === k ? 'var(--primary)' : 'var(--text-2)',
                    }}>{l}</button>
                  ))}
                </div>
              </div>
              {c.status === 'em_aberto' && (
                <div>
                  <div className="t-micro" style={{ marginBottom: 6 }}>PRAZO PARA ENVIO</div>
                  <input type="date" value={prazoEnvio} onChange={e => setPrazoEnvio(e.target.value)} style={fieldStyle} />
                </div>
              )}
              <div>
                <div className="t-micro" style={{ marginBottom: 6 }}>RESPONSÁVEL</div>
                <input value={respNome} onChange={e => setRespNome(e.target.value)} placeholder="Nome do responsável…" style={fieldStyle} />
              </div>
              {c.status === 'aprovado' && (
                <div>
                  <div className="t-micro" style={{ marginBottom: 6 }}>FORNECEDOR</div>
                  <input value={fornNome} onChange={e => { setFornNome(e.target.value); if (!e.target.value.trim()) setCadastrarForn(false); }}
                    placeholder="Nome do fornecedor…" style={fieldStyle} />
                  {fornNome.trim() && (
                    <label onClick={() => setCadastrarForn(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, padding: '10px 12px', borderRadius: 10, border: `1.5px solid ${cadastrarForn ? corForn : 'var(--border)'}`, background: cadastrarForn ? `${corForn}14` : 'var(--surface-2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      <div style={{ width: 20, height: 20, borderRadius: 6, border: `2px solid ${cadastrarForn ? corForn : 'var(--border)'}`, background: cadastrarForn ? corForn : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                        {cadastrarForn && <svg viewBox="0 0 12 12" fill="none" style={{ width: 11, height: 11 }}><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: cadastrarForn ? corForn : 'var(--text-2)' }}>Cadastrar no base de fornecedores</div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Será adicionado em Cadastros → Fornecedores</div>
                      </div>
                      <div style={{ width: 22, height: 22, borderRadius: 999, background: corForn, flexShrink: 0, boxShadow: cadastrarForn ? `0 0 0 3px ${corForn}40` : 'none', transition: 'all 0.15s' }} title={`Cor: ${corForn}`} />
                    </label>
                  )}
                </div>
              )}
              {c.status === 'aprovado' && (
                <div>
                  <div className="t-micro" style={{ marginBottom: 6 }}>VALOR DO CONTRATO <span style={{ fontWeight: 500, opacity: 0.6 }}>(opcional)</span></div>
                  <input type="text" inputMode="numeric" value={valor}
                    onChange={e => setValor(fmtV(e.target.value))}
                    placeholder="R$ 0,00" style={fieldStyle} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button onClick={() => setEditMode(false)} style={{ flex: 1, height: 44, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--text-2)' }}>Cancelar</button>
                <button onClick={salvarEdicao} disabled={saving} style={{ flex: 2, height: 44, borderRadius: 10, border: 'none', background: 'var(--primary)', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 800 }}>
                  {saving ? 'Salvando…' : 'Salvar alterações'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18, padding: '12px 14px', borderRadius: 12, background: 'var(--surface-2)', border: '0.5px solid var(--border)' }}>
                {c.responsavel_nome && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>👤 <b>Responsável:</b> {c.responsavel_nome}</div>}
                {c.prazo_envio      && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>📅 <b>Prazo envio:</b> {fmtDate(c.prazo_envio)}</div>}
                {c.data_envio       && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>📤 <b>Enviado em:</b> {fmtDate(c.data_envio)}</div>}
                {c.prazo_aprovacao  && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>⏳ <b>Prazo aprov.:</b> {fmtDate(c.prazo_aprovacao)}</div>}
                {c.data_aprovacao   && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>✅ <b>Aprovado em:</b> {fmtDate(c.data_aprovacao)}</div>}
                {c.fornecedor_nome  && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>🏢 <b>Fornecedor:</b> {c.fornecedor_nome}</div>}
                {c.valor_contrato != null && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>💰 <b>Valor do contrato:</b> {fmtCur(c.valor_contrato)}</div>}
              </div>

              <ComentariosSheet c={c} comentarios={comentarios} onChanged={onRefresh} />

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {c.status === 'em_aberto' && (
                  <button onClick={() => onAction('enviar')} style={{ height: 48, borderRadius: 12, border: 'none', background: ST.enviado.bgChip, color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800, boxShadow: `0 2px 8px ${ST.enviado.bg}60` }}>
                    📤 Marcar como Enviado
                  </button>
                )}
                {c.status === 'enviado' && (
                  <button onClick={() => onAction('aprovar')} style={{ height: 48, borderRadius: 12, border: 'none', background: ST.aprovado.bgChip, color: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 800, boxShadow: `0 2px 8px ${ST.aprovado.bg}60` }}>
                    ✅ Marcar como Aprovado
                  </button>
                )}
                {(c.status === 'enviado' || c.status === 'aprovado') && (
                  !confirmaUndo ? (
                    <button onClick={() => setConfirmaUndo(true)} style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>
                      ↩ {c.status === 'enviado' ? 'Desfazer envio' : 'Desfazer aprovação'}
                    </button>
                  ) : (
                    <button onClick={desfazer} disabled={undoing} style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--warn, #D97706)', background: 'rgba(217,119,6,0.10)', color: 'var(--warn, #D97706)', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                      {undoing ? 'Desfazendo…' : c.status === 'enviado'
                        ? 'Confirmar: voltar para Em aberto (limpa nº e datas do envio)'
                        : 'Confirmar: voltar para Enviado (limpa aprovação e fornecedor)'}
                    </button>
                  )
                )}
                {!confirmaDelete ? (
                  <button onClick={() => setConfirmaDelete(true)} style={{ height: 40, border: 'none', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}>Excluir contratação</button>
                ) : (
                  <>
                    {/* orcamento_itens tem ON DELETE CASCADE na contratação: apaga
                        junto, sem exclusão suave. A pessoa precisa saber disso
                        antes de confirmar, não descobrir depois. */}
                    <div className="t-caption" style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6, textAlign: 'right' }}>
                      Apaga também o orçamento desta contratação, sem volta.
                    </div>
                    <button onClick={excluir} disabled={deleting} style={{ height: 40, borderRadius: 10, border: 'none', background: 'rgba(176,36,42,0.12)', color: 'var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 800 }}>
                      {deleting ? 'Excluindo…' : 'Confirmar exclusão'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Chips de filtro por responsável ──────────────────────────────────────────
function RespFilter({ options, value, onChange, temSem }) {
  const chip = (key, label) => (
    <button key={key} onClick={() => onChange(key)} style={{
      height: 34, padding: '0 14px', borderRadius: 999, cursor: 'pointer',
      border: value === key ? '1.5px solid var(--primary)' : '1px solid var(--border)',
      background: value === key ? 'rgba(14,108,184,0.10)' : 'var(--surface)',
      color: value === key ? 'var(--primary)' : 'var(--text-2)',
      fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>
      {key !== '__todos' && <span style={{ width: 13, height: 13 }}>{Icon.users}</span>}
      {label}
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
      {chip('__todos', 'Todos')}
      {options.map(name => chip(name, name))}
      {temSem && chip(SEM_RESP, 'Sem responsável')}
    </div>
  );
}

// ── View desktop: quadro completo (status × responsável) ─────────────────────
function BoardView({ byStatus, respGroups, comentariosByC, onCardClick }) {
  return (
    <div style={{ padding: '0 var(--pad-4) 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, alignItems: 'start' }}>
      {STATUS_ORDER.map(sk => {
        const st = ST[sk];
        const cards = byStatus[sk] || [];
        return (
          <div key={sk} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 10, background: st.bg + '12', borderBottom: `2.5px solid ${st.bg}` }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: st.bg, flexShrink: 0 }} />
              <div className="t-strong" style={{ fontSize: 13, flex: 1 }}>{st.label}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: st.bg, background: st.bg + '22', padding: '2px 8px', borderRadius: 999 }}>{cards.length}</div>
            </div>

            {respGroups.map(rg => {
              const sub = cards.filter(rg.match);
              if (sub.length === 0) return null;
              return (
                <div key={rg.key} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 4px 8px' }}>
                    <span style={{ width: 13, height: 13, color: 'var(--text-3)' }}>{Icon.users}</span>
                    <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)', flex: 1 }}>{rg.label}</div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)' }}>{sub.length}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sub.map(c => (
                      <ContratacaoCard key={c.id} c={c} comentarios={comentariosByC[c.id] || []} isDesktop onClick={() => onCardClick(c)} />
                    ))}
                  </div>
                </div>
              );
            })}
            {cards.length === 0 && (
              <div style={{ padding: '18px 12px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12, background: 'var(--surface-2)', borderRadius: 12 }}>Nada aqui</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────
// Sem `goto`: a volta agora é pela barra de baixo, pela lateral do desktop ou
// arrastando da borda — o botão "Voltar" no topo saiu junto com o espaço extra.
export function ContratacoesScreen() {
  const [all, setAll]               = useState([]);
  const [responsaveis, setResp]     = useState([]);
  const [comentarios, setComent]    = useState([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState('em_aberto');
  const [q, setQ]                   = useState('');
  const [respFilter, setRespFilter] = useState('__todos');
  const [viewMode, setViewMode]     = useState('quadro');
  const [wizard, setWizard]         = useState(null);
  const [selected, setSelected]     = useState(null);
  const [loadError, setLoadError]   = useState(null);

  const isDesktop = useIsDesktop(900);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c, error: e1 }, { data: r, error: e2 }, { data: cm }] = await Promise.all([
      supabase.from('contratacoes').select('*').order('created_at', { ascending: false }),
      supabase.from('contratacoes_responsaveis').select('*').order('nome'),
      supabase.from('contratacoes_comentarios').select('*').order('created_at', { ascending: true }),
    ]);
    if (e1 || e2) {
      console.error('Erro ao carregar contratações:', e1 || e2);
      setLoadError(motivoAmigavel(e1 || e2));
    } else {
      setLoadError(null);
    }
    setAll(c || []); setResp(r || []); setComent(cm || []); setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const comentariosByC = useMemo(() => {
    const m = {};
    for (const cm of comentarios) { (m[cm.contratacao_id] ||= []).push(cm); }
    return m;
  }, [comentarios]);

  const respOptions = useMemo(
    () => [...new Set(all.map(c => c.responsavel_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [all]
  );
  const temSemResp = useMemo(() => all.some(c => !c.responsavel_nome), [all]);

  const matchesResp = useCallback((c) => {
    if (respFilter === '__todos') return true;
    if (respFilter === SEM_RESP) return !c.responsavel_nome;
    return c.responsavel_nome === respFilter;
  }, [respFilter]);

  const matchesBusca = useCallback((c) => {
    if (!q.trim()) return true;
    return contem(c.descricao, q)
      || contem(c.responsavel_nome, q)
      || contem(c.fornecedor_nome, q);
  }, [q]);

  const byStatus = useMemo(() => {
    const out = { em_aberto: [], enviado: [], aprovado: [] };
    for (const c of all) {
      if (!matchesResp(c) || !matchesBusca(c)) continue;
      if (out[c.status]) out[c.status].push(c);
    }
    for (const k of STATUS_ORDER) out[k] = ordenarPorVencimento(out[k]);
    return out;
  }, [all, matchesResp, matchesBusca]);

  const totais = useMemo(() => ({
    em_aberto: all.filter(c => c.status === 'em_aberto').length,
    enviado:   all.filter(c => c.status === 'enviado').length,
    aprovado:  all.filter(c => c.status === 'aprovado').length,
  }), [all]);

  const respGroups = useMemo(() => {
    const base = respOptions.map(name => ({ key: name, label: name, match: (c) => c.responsavel_nome === name }));
    if (temSemResp) base.push({ key: SEM_RESP, label: 'Sem responsável', match: (c) => !c.responsavel_nome });
    if (respFilter === '__todos') return base;
    return base.filter(g => g.key === respFilter);
  }, [respOptions, temSemResp, respFilter]);

  const nextNum = (() => {
    const max = all.reduce((m, c) => {
      const n = parseInt(String(c.numero_contratacao || '').replace(/\D/g, ''), 10);
      return Number.isFinite(n) && n > m ? n : m;
    }, 0);
    return `QC ${String(max + 1).padStart(2, '0')}`;
  })();

  function onCardClick(c) { setSelected(c); setWizard(null); }
  function handleAction(action) {
    const c = selected; setSelected(c);
    setWizard(action === 'enviar' ? 'enviar' : 'aprovar');
  }
  function onSaved() { setWizard(null); setSelected(null); load(); }
  function onDelete() { setSelected(null); load(); }

  const selectedLive = selected ? (all.find(c => c.id === selected.id) || selected) : null;

  const listForTab = byStatus[tab] || [];
  const showQuadro = isDesktop && viewMode === 'quadro';

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${totais.em_aberto} em aberto · ${totais.enviado} enviadas`}
        title="Contratações"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {isDesktop && (
              <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3 }}>
                {[['quadro', Icon.kanban, 'Quadro'], ['lista', Icon.clipboardList, 'Lista']].map(([k, ic, lbl]) => (
                  <button key={k} onClick={() => setViewMode(k)} title={lbl} style={{
                    height: 32, padding: '0 12px', border: 'none', borderRadius: 8, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                    background: viewMode === k ? 'var(--surface)' : 'transparent',
                    color: viewMode === k ? 'var(--text-1)' : 'var(--text-3)',
                    boxShadow: viewMode === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}>
                    <span style={{ width: 15, height: 15 }}>{ic}</span>{lbl}
                  </button>
                ))}
              </div>
            )}
            <button className="btn btn-primary btn-sm" onClick={() => { setSelected(null); setWizard('nova'); }}>
              <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Nova
            </button>
          </div>
        }
      />

      {!showQuadro && (
        <StatChips valor={tab} onChange={setTab} itens={[
          { chave: 'em_aberto', label: 'Em aberto', n: totais.em_aberto, cor: ST.em_aberto.bg },
          { chave: 'enviado',   label: 'Enviadas',  n: totais.enviado,   cor: ST.enviado.bg },
          { chave: 'aprovado',  label: 'Aprovadas', n: totais.aprovado,  cor: ST.aprovado.bg },
        ]} />
      )}

      <div style={{ padding: '0 var(--pad-4) 8px' }}>
        <div className="search">
          <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.search}</span>
          <input placeholder="Buscar por descrição, responsável…" value={q} onChange={e => setQ(e.target.value)}
            style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 15 }} />
        </div>
      </div>

      {(respOptions.length > 0 || temSemResp) && (
        <div style={{ padding: '0 var(--pad-4) 12px' }}>
          <RespFilter options={respOptions} value={respFilter} onChange={setRespFilter} temSem={temSemResp} />
        </div>
      )}

      {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Carregando…</div>}
      {!loading && loadError && (
        <div className="page-pad">
          <div className="card" style={{ padding: '14px 16px', borderLeft: '4px solid var(--danger)' }}>
            <div className="t-strong" style={{ color: 'var(--danger)' }}>Erro ao carregar contratações</div>
            <div className="t-caption" style={{ marginTop: 4 }}>{loadError}</div>
            <button onClick={load} className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}>Tentar novamente</button>
          </div>
        </div>
      )}

      {!loading && !loadError && showQuadro && (
        <BoardView byStatus={byStatus} respGroups={respGroups} comentariosByC={comentariosByC} onCardClick={onCardClick} />
      )}

      {!loading && !loadError && !showQuadro && (
        <div className="page-pad stack stack-2" style={{ paddingTop: 0 }}>
          {listForTab.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '24px 12px' }}>
              <div className="t-strong">Nenhuma contratação aqui</div>
              <div className="t-caption" style={{ marginTop: 4 }}>
                {respFilter !== '__todos'
                  ? 'Nenhuma para este responsável nesta aba.'
                  : tab === 'em_aberto' ? 'Crie uma nova contratação com o botão acima.' : 'Avance os cards da aba anterior.'}
              </div>
            </div>
          )}
          {listForTab.map(c => (
            <ContratacaoCard key={c.id} c={c} comentarios={comentariosByC[c.id] || []} isDesktop={isDesktop} onClick={() => onCardClick(c)} />
          ))}
        </div>
      )}

      {selectedLive && !wizard && (
        <CardSheet c={selectedLive} nextNum={nextNum} responsaveis={responsaveis}
          comentarios={comentariosByC[selectedLive.id] || []}
          onClose={() => setSelected(null)} onAction={handleAction}
          onDelete={onDelete} onRefresh={() => { load(); }} />
      )}

      {wizard === 'nova' && (
        <NovaContratacaoWizard responsaveis={responsaveis}
          onRefreshResp={() => supabase.from('contratacoes_responsaveis').select('*').order('nome').then(({ data }) => setResp(data || []))}
          onClose={() => setWizard(null)} onSaved={onSaved} />
      )}
      {wizard === 'enviar' && selected && (
        <EnviarWizard contratacao={selected} nextNum={nextNum} onClose={() => { setWizard(null); setSelected(null); }} onSaved={onSaved} />
      )}
      {wizard === 'aprovar' && selected && (
        <AprovarWizard contratacao={selected} onClose={() => { setWizard(null); setSelected(null); }} onSaved={onSaved} />
      )}
    </div>
  );
}
