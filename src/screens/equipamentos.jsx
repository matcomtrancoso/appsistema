import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, PageHeader, StatChips } from '../components/index';
import { hojeLocal, toISODate, addMonthsISO } from '../lib/date';
import { avisarErro } from '../lib/msg-amigavel';

// ── Helpers de data ──────────────────────────────────────────────────────────
function parseDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function formatDateBR(str) {
  if (!str) return '—';
  const [, m, d] = str.split('-');
  return `${d} de ${['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'][parseInt(m,10)-1]}`;
}
function diasRestantes(fim) {
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const d = parseDateLocal(fim);
  if (!d) return null;
  return Math.ceil((d - hoje) / 86400000);
}
// Preserva o fim do mês: 31/01 + 1 mês = 28/02. Com `setMonth` puro, o
// JavaScript normalizava "31 de fevereiro" para 03/03 e a renovação mensal
// de todo equipamento vencendo em 29/30/31 pulava alguns dias.
function addMonth(dateStr) {
  return addMonthsISO(dateStr, 1);
}
function addDias(dateStr, n) {
  const d = parseDateLocal(dateStr);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}
function todayStr() {
  return hojeLocal();
}

// Retorna nova data_fim_previsto de acordo com tipo_locacao
function novaDataRenovacao(eq) {
  switch (eq.tipo_locacao) {
    case 'diaria':    return addDias(eq.data_fim_previsto, 1);
    case 'semanal':   return addDias(eq.data_fim_previsto, 7);
    case 'quinzenal': return addDias(eq.data_fim_previsto, 15);
    case 'mensal':
    default:          return addMonth(eq.data_fim_previsto);
  }
}

const TIPO_LOCACAO_LABELS = {
  diaria:    'Diária',
  semanal:   'Semanal',
  quinzenal: 'Quinzenal',
  mensal:    'Mensal',
  outro:     'Outro',
};

// Devolução agendada = ativo e com data prevista de devolução marcada
function isAgendada(eq) {
  return !!eq && eq.status === 'ativo' && !!eq.data_devolucao_agendada;
}

// Alerta = ativo e faltam ≤ 5 dias (ou já vencido). Se já tem devolução
// agendada, deixa de ser alerta vermelho e passa a ser "agendada" (amarelo).
function isAlerta(eq) {
  if (!eq || eq.status !== 'ativo') return false;
  if (eq.data_devolucao_agendada) return false;
  const dias = diasRestantes(eq.data_fim_previsto);
  return dias !== null && dias <= 5;
}

// ── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ eq }) {
  const alerta = isAlerta(eq);
  if (eq.status === 'devolvido') {
    return (
      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
        background: 'var(--surface-2)', color: 'var(--text-3)' }}>
        DEVOLV.
      </span>
    );
  }
  if (isAgendada(eq)) {
    return (
      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
        background: 'rgba(198,139,0,0.14)', color: 'var(--warn,#CA8A04)' }}>
        📅 AGENDADA
      </span>
    );
  }
  if (alerta) {
    return (
      <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
        background: 'rgba(176,36,42,0.12)', color: 'var(--danger,#DC2626)' }}>
        ⚠ ALERTA
      </span>
    );
  }
  // Ativo normal → amarelo
  return (
    <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
      background: 'rgba(198,139,0,0.14)', color: 'var(--warn,#CA8A04)' }}>
      ATIVO
    </span>
  );
}

// ── Card de equipamento ──────────────────────────────────────────────────────
function EquipamentoCard({ eq, onRenovar, onDevolver, onEdit }) {
  const dias = diasRestantes(eq.data_fim_previsto);
  const alerta = isAlerta(eq);
  const agendada = isAgendada(eq);
  const devolvido = eq.status === 'devolvido';

  let diasLabel = null;
  if (!devolvido && dias !== null) {
    if (dias < 0) diasLabel = { text: `Vencido há ${Math.abs(dias)}d`, danger: true };
    else if (dias === 0) diasLabel = { text: 'Vence hoje', danger: true };
    else diasLabel = { text: `${dias}d restantes`, danger: alerta };
  }

  // Cor da faixa esquerda por status
  const faixaCor = devolvido
    ? 'var(--text-3)'
    : agendada
    ? 'var(--warn,#CA8A04)'
    : alerta
    ? 'var(--danger,#DC2626)'
    : 'var(--primary)';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Faixa colorida esquerda */}
        <div style={{ width: 4, background: faixaCor, flexShrink: 0, borderRadius: '12px 0 0 12px' }} />

        {/* Conteúdo */}
        <div style={{ flex: 1, padding: '11px 12px 10px', minWidth: 0 }}>
          {/* Linha 1: nome + botões */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
            <div className="t-strong" style={{ fontSize: 14, lineHeight: 1.3, flex: 1 }}>{eq.nome}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <button onClick={() => onEdit(eq)}
                style={{ width: 28, height: 28, borderRadius: 7, border: 'none',
                  background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 15, height: 15, color: 'var(--text-3)' }}>{Icon.edit}</span>
              </button>
            </div>
          </div>

          {/* Linha 2: fornecedor */}
          {(eq.fornecedor || eq.tipo_locacao) && (
            <div className="t-caption" style={{ fontSize: 11, marginBottom: 6 }}>
              🏢 {[eq.fornecedor, TIPO_LOCACAO_LABELS[eq.tipo_locacao]].filter(Boolean).join(' · ')}
            </div>
          )}

          {/* Linha 3: datas em chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {eq.data_recebimento && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                Entrada {formatDateBR(eq.data_recebimento)}
              </span>
            )}
            {eq.data_fim_previsto && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: alerta ? 'var(--danger-tint,#FEE2E2)' : 'var(--surface-2)',
                color: alerta ? 'var(--danger,#DC2626)' : 'var(--text-2)' }}>
                Até {formatDateBR(eq.data_fim_previsto)}
              </span>
            )}
            {agendada && eq.data_devolucao_agendada && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: 'rgba(198,139,0,0.14)', color: 'var(--warn,#CA8A04)' }}>
                📅 Devolução {formatDateBR(eq.data_devolucao_agendada)}
              </span>
            )}
            {devolvido && eq.data_devolucao && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                Devolvido {formatDateBR(eq.data_devolucao)}
              </span>
            )}
          </div>

          {/* Linha 4: status + dias restantes + renovações */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {diasLabel && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999,
                background: diasLabel.danger ? 'var(--danger-tint,#FEE2E2)' : 'rgba(31,107,58,0.1)',
                color: diasLabel.danger ? 'var(--danger,#DC2626)' : 'var(--success,#16a34a)' }}>
                {diasLabel.text}
              </span>
            )}
            {eq.renovacoes > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
                background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                🔄 {eq.renovacoes}x renovado
              </span>
            )}
            <div style={{ flex: 1 }} />
            <StatusPill eq={eq} />
          </div>

          {/* Observações */}
          {eq.observacoes && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-3)',
              padding: '5px 8px', background: 'var(--surface-2)', borderRadius: 8 }}>
              {eq.observacoes}
            </div>
          )}

          {/* Botões de ação */}
          {!devolvido && (
            <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
              <button onClick={() => onRenovar(eq)}
                style={{ flex: 1, height: 36, borderRadius: 10, border: 'none',
                  background: 'var(--primary)', color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                🔄 Renovar
              </button>
              <button onClick={() => onDevolver(eq)}
                style={{ flex: 1, height: 36, borderRadius: 10, border: '0.5px solid var(--border)',
                  background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                📦 Devolver
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Wizard popup passo a passo ───────────────────────────────────────────────
const STEPS = ['nome', 'fornecedor', 'tipo', 'recebimento', 'fim', 'obs'];

function calcFimAuto(receb, tipo) {
  if (!receb) return '';
  switch (tipo) {
    case 'diaria':    return addDias(receb, 1);
    case 'semanal':   return addDias(receb, 7);
    case 'quinzenal': return addDias(receb, 15);
    case 'mensal':
    default:          return addMonth(receb);
  }
}

function EquipamentoWizard({ initial, onSave, onCancel }) {
  const isEdit = !!initial?.id;

  const [step,       setStep]       = useState(0);
  const [nome,       setNome]       = useState(initial?.nome               || '');
  const [fornecedor, setFornecedor] = useState(initial?.fornecedor         || '');
  const [tipo,       setTipo]       = useState(initial?.tipo_locacao       || 'mensal');
  const [receb,      setReceb]      = useState(initial?.data_recebimento   || todayStr());
  const [fim,        setFim]        = useState(initial?.data_fim_previsto  || '');
  const [obs,        setObs]        = useState(initial?.observacoes        || '');
  const [saving,     setSaving]     = useState(false);

  const totalSteps = STEPS.length;
  const cur = STEPS[step];

  // Auto-calcular fim quando muda tipo ou recebimento
  useEffect(() => {
    if (isEdit) return;
    setFim(calcFimAuto(receb, tipo));
  }, [tipo, receb]);

  function canNext() {
    if (cur === 'nome') return nome.trim().length > 0;
    if (cur === 'fim')  return fim.length > 0;
    return true;
  }

  function next() { if (step < totalSteps - 1) setStep(s => s + 1); }
  function back() { if (step > 0) setStep(s => s - 1); }

  async function handleSave() {
    if (!nome.trim() || !fim) return;
    setSaving(true);
    const payload = {
      nome:               nome.trim(),
      fornecedor:         fornecedor.trim() || null,
      tipo_locacao:       tipo,
      data_recebimento:   receb,
      data_fim_previsto:  fim,
      observacoes:        obs.trim() || null,
    };
    try {
      if (isEdit) {
        const { data, error } = await supabase.from('equipamentos').update(payload).eq('id', initial.id).select().single();
        if (error) throw error;
        onSave(data);
      } else {
        const { data, error } = await supabase.from('equipamentos').insert({ ...payload, status: 'ativo', renovacoes: 0 }).select().single();
        if (error) throw error;
        onSave(data);
      }
    } catch (e) { console.error('Erro ao salvar equipamento:', e.message || e); }
    finally { setSaving(false); }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', height: 56, borderRadius: 14,
    border: '1.5px solid var(--primary)', background: 'var(--surface)',
    padding: '0 16px', fontSize: 17, color: 'var(--text-1)', outline: 'none',
  };

  const isLast = step === totalSteps - 1;

  return (
    /* Overlay */
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 20px',
    }}>
      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 380, background: 'var(--surface)',
        borderRadius: 24, padding: '28px 24px 24px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)', position: 'relative',
      }} onClick={e => e.stopPropagation()}>

        <button onClick={onCancel} aria-label="Fechar" style={{
          position: 'absolute', top: 12, right: 12, width: 32, height: 32,
          borderRadius: 999, border: '0.5px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>✕</button>

        {/* Bolinhas de progresso */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 28 }}>
          {STEPS.map((_, i) => (
            <div key={i} style={{
              width: i === step ? 22 : 7, height: 7, borderRadius: 999,
              background: i <= step ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.25s',
            }} />
          ))}
        </div>

        {/* Pergunta */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.08em', marginBottom: 8 }}>
          {isEdit ? 'EDITAR EQUIPAMENTO' : `PASSO ${step + 1} DE ${totalSteps}`}
        </div>

        {cur === 'nome' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 20, lineHeight: 1.3 }}>
              Qual é o equipamento?
            </div>
            <input autoFocus style={inputStyle} value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Ex: Martelete 10kg"
              onKeyDown={e => e.key === 'Enter' && canNext() && next()} />
          </>
        )}

        {cur === 'fornecedor' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, lineHeight: 1.3 }}>
              De qual fornecedor?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
              Locadora ou empresa que alugou o equipamento.
            </div>
            <input autoFocus style={inputStyle} value={fornecedor} onChange={e => setFornecedor(e.target.value)}
              placeholder="Ex: Big Center"
              onKeyDown={e => e.key === 'Enter' && next()} />
          </>
        )}

        {cur === 'tipo' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 20, lineHeight: 1.3 }}>
              Tipo de locação?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(TIPO_LOCACAO_LABELS).map(([key, label]) => (
                <button key={key}
                  onClick={() => { setTipo(key); setTimeout(next, 200); }}
                  style={{
                    width: '100%', padding: '14px 18px', borderRadius: 14, textAlign: 'left',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    background: tipo === key ? 'var(--primary)' : 'var(--surface-2)',
                    color: tipo === key ? '#fff' : 'var(--text-1)',
                    border: tipo === key ? 'none' : '0.5px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                  {label}
                  {tipo === key && <span style={{ fontSize: 16 }}>✓</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {cur === 'recebimento' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, lineHeight: 1.3 }}>
              Quando foi recebido?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
              Data de entrada do equipamento na obra.
            </div>
            <input autoFocus type="date" style={inputStyle} value={receb}
              onChange={e => setReceb(e.target.value)} />
          </>
        )}

        {cur === 'fim' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, lineHeight: 1.3 }}>
              Até quando é o aluguel?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
              Calculado automaticamente — ajuste se necessário.
            </div>
            <input autoFocus type="date" style={inputStyle} value={fim}
              onChange={e => setFim(e.target.value)} />
          </>
        )}

        {cur === 'obs' && (
          <>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, lineHeight: 1.3 }}>
              Alguma observação?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
              Localização, condições, número de série... (opcional)
            </div>
            <textarea autoFocus
              style={{ ...inputStyle, height: 'auto', minHeight: 100, padding: '14px 16px', resize: 'none' }}
              value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Ex: Guardado no almoxarifado, série 12345..." />
          </>
        )}

        {/* Botões de navegação */}
        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          {step > 0 && (
            <button onClick={back}
              style={{ width: 48, height: 48, borderRadius: 12, border: '0.5px solid var(--border)',
                background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.back}</span>
            </button>
          )}

          {/* Pular (só nos opcionais) */}
          {(cur === 'fornecedor' || cur === 'obs') && !isLast && (
            <button onClick={next}
              style={{ flex: 1, height: 48, borderRadius: 12, border: '0.5px solid var(--border)',
                background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-3)', cursor: 'pointer' }}>
              Pular
            </button>
          )}

          {/* Próximo / Salvar */}
          {cur !== 'tipo' && (
            <button
              onClick={isLast ? handleSave : next}
              disabled={!canNext() || saving}
              style={{
                flex: 1, height: 48, borderRadius: 12, border: 'none', cursor: canNext() ? 'pointer' : 'default',
                background: canNext() && !saving ? 'var(--primary)' : 'var(--border)',
                color: '#fff', fontSize: 15, fontWeight: 800,
              }}>
              {saving ? 'Salvando…' : isLast ? (isEdit ? 'Salvar' : 'Cadastrar') : 'Próximo →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tela principal ───────────────────────────────────────────────────────────
function EquipamentosScreen() {
  const [items,       setItems]      = useState([]);
  const [loading,     setLoading]    = useState(true);
  const [filtro,      setFiltro]     = useState('ativos'); // todos | ativos | alertas | devolvidos
  const [showForm,    setShowForm]   = useState(false);
  const [editItem,    setEditItem]   = useState(null);
  const [confirmDev,  setConfirmDev] = useState(null);   // eq sendo devolvido
  const [dataDev,     setDataDev]    = useState('');      // data real de devolução
  const [confirmRen,  setConfirmRen] = useState(null);   // eq sendo renovado
  const [novaDataRen, setNovaDataRen] = useState('');    // nova data após renovação

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('equipamentos').select('*').order('created_at', { ascending: false });
    setItems((data || []).filter(Boolean));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Ações ──────────────────────────────────────────────────────────────────
  function openRenovar(eq) {
    setConfirmRen(eq);
    setNovaDataRen(novaDataRenovacao(eq));
  }

  // Falha de banco aqui precisa gritar e ressincronizar: a tela atualiza
  // otimista, e um erro engolido deixava o equipamento "devolvido" só até a
  // próxima recarga — parecia que o delete não funcionava.
  function falhou(error, oQue) {
    if (!error) return false;
    avisarErro(error, oQue);
    load();
    return true;
  }

  async function handleRenovar() {
    const eq = confirmRen;
    if (!eq) return;
    const updated = { data_fim_previsto: novaDataRen, renovacoes: (eq.renovacoes || 0) + 1 };
    setItems(prev => prev.map(e => e.id === eq.id ? { ...e, ...updated } : e));
    const { error } = await supabase.from('equipamentos').update(updated).eq('id', eq.id);
    falhou(error, 'renovar o equipamento');
    setConfirmRen(null);
  }

  function openDevolver(eq) {
    setConfirmDev(eq);
    // Sugere hoje para confirmar; se já houver agendamento, mostra a data agendada.
    setDataDev(eq.data_devolucao_agendada || todayStr());
  }

  // Agenda a devolução: mantém o equipamento 'ativo', só marca a data prevista.
  async function handleAgendar() {
    const eq = confirmDev;
    if (!eq) return;
    const updated = { data_devolucao_agendada: dataDev || todayStr() };
    setItems(prev => prev.map(e => e.id === eq.id ? { ...e, ...updated } : e));
    const { error } = await supabase.from('equipamentos').update(updated).eq('id', eq.id);
    falhou(error, 'agendar a devolução');
    setConfirmDev(null);
  }

  // Remove o agendamento (volta a ser ativo normal / alerta).
  async function handleRemoverAgendamento() {
    const eq = confirmDev;
    if (!eq) return;
    const updated = { data_devolucao_agendada: null };
    setItems(prev => prev.map(e => e.id === eq.id ? { ...e, ...updated } : e));
    const { error } = await supabase.from('equipamentos').update(updated).eq('id', eq.id);
    falhou(error, 'remover o agendamento');
    setConfirmDev(null);
  }

  async function handleDevolver() {
    const eq = confirmDev;
    if (!eq) return;
    // Ao confirmar a devolução de verdade, limpa o agendamento.
    const updated = { status: 'devolvido', data_devolucao: dataDev || todayStr(), data_devolucao_agendada: null };
    setItems(prev => prev.map(e => e.id === eq.id ? { ...e, ...updated } : e));
    const { error: devErr } = await supabase.from('equipamentos').update(updated).eq('id', eq.id);
    falhou(devErr, 'devolver o equipamento');
    setConfirmDev(null);
  }

  function handleSaved(saved) {
    if (!saved) return;
    setItems(prev => {
      const idx = prev.findIndex(e => e.id === saved.id);
      if (idx >= 0) return prev.map(e => e.id === saved.id ? saved : e);
      return [saved, ...prev];
    });
    setShowForm(false);
    setEditItem(null);
  }

  // ── Contagens ──────────────────────────────────────────────────────────────
  const ativos     = items.filter(e => e.status === 'ativo');
  const alertas    = items.filter(isAlerta);
  const devolvidos = items.filter(e => e.status === 'devolvido');

  const sortByDias = (list) => [...list].sort((a, b) => {
    const da = diasRestantes(a.data_fim_previsto) ?? Infinity;
    const db = diasRestantes(b.data_fim_previsto) ?? Infinity;
    // devolvidos vão pro final
    if (a.status === 'devolvido' && b.status !== 'devolvido') return 1;
    if (b.status === 'devolvido' && a.status !== 'devolvido') return -1;
    return da - db;
  });

  const filtrados = sortByDias(
    filtro === 'ativos'     ? ativos
    : filtro === 'alertas'  ? alertas
    : filtro === 'devolvidos' ? devolvidos
    : items
  );

  // ── Modo lista (wizard flutua em overlay) ─────────────────────────────────
  return (
    <div style={{ minHeight: '100%', background: 'var(--bg,var(--surface-2))' }}>

      <PageHeader
        eyebrow={alertas.length ? `⚠ ${alertas.length} em alerta` : `${ativos.length} ativos`}
        title="Equipamentos"
        right={
          <button className="btn btn-primary btn-sm" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Novo
          </button>
        }
      />

      <StatChips valor={filtro} onChange={setFiltro} itens={[
        { chave: 'ativos',     label: 'Ativos',     n: ativos.length },
        { chave: 'alertas',    label: 'Alertas',    n: alertas.length, cor: 'var(--warn,#CA8A04)' },
        { chave: 'devolvidos', label: 'Devolvidos', n: devolvidos.length, cor: 'var(--text-3)' },
        { chave: 'todos',      label: 'Todos',      n: items.length },
      ]} />

      {/* Lista */}
      <div style={{ padding: '16px 16px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-3)', fontSize: 14 }}>
            Carregando…
          </div>
        ) : filtrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }}>
              {filtro === 'todos' ? 'Nenhum equipamento cadastrado' : 'Nenhum item neste filtro'}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>
              {filtro === 'todos'
                ? 'Registre os equipamentos alugados para a obra.'
                : 'Mude o filtro acima para ver outros itens.'}
            </div>
            {filtro === 'todos' && (
              <button onClick={() => setShowForm(true)}
                style={{ padding: '12px 24px', borderRadius: 12, border: 'none',
                  background: 'var(--primary)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                Cadastrar equipamento
              </button>
            )}
          </div>
        ) : (
          filtrados.map(eq => (
            <EquipamentoCard
              key={eq.id}
              eq={eq}
              onRenovar={openRenovar}
              onDevolver={openDevolver}
              onEdit={(e) => { setEditItem(e); setShowForm(true); }}
            />
          ))
        )}
      </div>

      {/* Wizard de novo/editar equipamento (overlay) */}
      {showForm && (
        <EquipamentoWizard
          initial={editItem}
          onSave={handleSaved}
          onCancel={() => { setShowForm(false); setEditItem(null); }}
        />
      )}

      {/* Modal de confirmação de RENOVAÇÃO */}
      {confirmRen && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 20px',
        }}>
          <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface)',
            borderRadius: 24, padding: '28px 24px 24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>🔄</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, textAlign: 'center' }}>
              Renovar locação
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20, textAlign: 'center' }}>
              <strong>{confirmRen.nome}</strong><br />
              Ajuste a nova data de vencimento se necessário.
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.08em', marginBottom: 8 }}>
                NOVA DATA DE FIM
              </div>
              <input type="date"
                style={{ width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 12,
                  border: '1.5px solid var(--primary)', background: 'var(--surface)',
                  padding: '0 14px', fontSize: 16, color: 'var(--text-1)', outline: 'none' }}
                value={novaDataRen} onChange={e => setNovaDataRen(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmRen(null)}
                style={{ flex: 1, height: 48, borderRadius: 12, border: '0.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={handleRenovar}
                style={{ flex: 2, height: 48, borderRadius: 12, border: 'none',
                  background: 'var(--primary)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                🔄 Confirmar renovação
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de DEVOLUÇÃO */}
      {confirmDev && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 20px',
        }}>
          <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface)',
            borderRadius: 24, padding: '28px 24px 24px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 12 }}>📦</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, textAlign: 'center' }}>
              Devolução do equipamento
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20, textAlign: 'center' }}>
              <strong>{confirmDev.nome}</strong><br />
              {isAgendada(confirmDev)
                ? `Devolução agendada para ${formatDateBR(confirmDev.data_devolucao_agendada)}. Confirme quando devolver ou reagende.`
                : 'Agende a retirada para depois ou confirme a devolução agora.'}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.08em', marginBottom: 8 }}>
                DATA
              </div>
              <input type="date"
                style={{ width: '100%', boxSizing: 'border-box', height: 52, borderRadius: 12,
                  border: '1.5px solid var(--border)', background: 'var(--surface)',
                  padding: '0 14px', fontSize: 16, color: 'var(--text-1)', outline: 'none' }}
                value={dataDev} onChange={e => setDataDev(e.target.value)} />
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>
                Hoje para confirmar a devolução, ou a data prevista para agendar.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <button onClick={handleAgendar}
                style={{ width: '100%', height: 48, borderRadius: 12, border: 'none',
                  background: 'var(--warn,#CA8A04)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                📅 {isAgendada(confirmDev) ? 'Reagendar devolução' : 'Agendar devolução'}
              </button>
              <button onClick={handleDevolver}
                style={{ width: '100%', height: 48, borderRadius: 12, border: 'none',
                  background: 'var(--danger,#DC2626)', color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                📦 Confirmar devolução
              </button>
              {isAgendada(confirmDev) && (
                <button onClick={handleRemoverAgendamento}
                  style={{ width: '100%', height: 44, borderRadius: 12, border: '0.5px solid var(--border)',
                    background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
                  Remover agendamento
                </button>
              )}
              <button onClick={() => setConfirmDev(null)}
                style={{ width: '100%', height: 44, borderRadius: 12, border: 'none',
                  background: 'transparent', fontSize: 14, fontWeight: 700, color: 'var(--text-3)', cursor: 'pointer' }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Aliases para os dois apps
export function EngEquipamentos()    { return <EquipamentosScreen />; }
export function MestreEquipamentos() { return <EquipamentosScreen />; }
