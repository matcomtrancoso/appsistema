import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TIPOS_OCORRENCIA } from './mestre';
import { Icon } from '../components/index';
import { hojeLocal, toISODate } from '../lib/date';
import { msgAmigavel } from '../lib/msg-amigavel';

// ── Helpers ──────────────────────────────────────────────────────────────────
const MESES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const DIAS_SEMANA = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function parseDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDataCompleta(str) {
  const d = parseDateLocal(str);
  if (!d) return str;
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatDataCurta(str) {
  const d = parseDateLocal(str);
  if (!d) return str;
  return `${DIAS_SEMANA[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
}

function todayStr() {
  return hojeLocal();
}

const STATUS_LABELS = {
  pendente:     { label: 'Pendente',      color: 'var(--text-3)' },
  em_andamento: { label: 'Andamento',     color: 'var(--primary)' },
  feita:        { label: 'Concluído',     color: 'var(--success,#16A34A)' },
  parcial:      { label: 'Parcial',       color: 'var(--warn,#CA8A04)' },
  nao_feita:    { label: 'Não realizado', color: 'var(--danger,#DC2626)' },
  // aliases legados (apenas exibição de dados antigos)
  concluido:    { label: 'Concluído',     color: 'var(--success,#16A34A)' },
  nao_iniciado: { label: 'Não inic.',     color: 'var(--text-3)' },
  nao_realizado:{ label: 'Não realizado', color: 'var(--danger,#DC2626)' },
};

const STATUS_OPTIONS = [
  { key: 'em_andamento',  label: 'Em andamento',   icon: '🔵', color: 'var(--primary)',         bg: 'rgba(59,130,246,0.08)' },
  { key: 'feita',         label: 'Concluído',      icon: '✅', color: 'var(--success,#16A34A)', bg: '#DCFCE7' },
  { key: 'nao_feita',     label: 'Não realizado',  icon: '❌', color: 'var(--danger,#DC2626)',  bg: '#FEE2E2' },
  { key: 'parcial',       label: 'Parcial',        icon: '🔸', color: 'var(--warn,#CA8A04)',    bg: 'var(--warn-tint,#FEF9C3)' },
  { key: 'pendente',      label: 'Pendente',        icon: '⏳', color: 'var(--text-3)',          bg: 'var(--surface-2)' },
];

const ICON_EDIT = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
  </svg>
);

// ── Detalhe de um dia ─────────────────────────────────────────────────────────
// ── Ocorrências do dia, com registro retroativo ───────────────────────────
// O caso de uso: "esqueci de colocar uma ocorrência, quero colocar
// depois para puxar no relatório semanal". A ocorrência grava no rdo_id
// DESTE dia — o relatório busca por rdo_id, então ela entra na semana certa.
function OcorrenciasDoDia({ rdoId, podeEditar }) {
  const [lista, setLista] = useState([]);
  const [abrindo, setAbrindo] = useState(false);
  const [sel, setSel] = useState([]);
  const [desc, setDesc] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    supabase.from('ocorrencias').select('*').eq('rdo_id', rdoId).order('created_at')
      .then(({ data }) => setLista(data || []));
  }, [rdoId]);

  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  async function salvar() {
    if (!sel.length || salvando) return;
    setSalvando(true); setErro('');
    const labels = sel.map(id => TIPOS_OCORRENCIA.find(t => t.id === id)?.label || id).join(', ');
    const { data, error } = await supabase.from('ocorrencias').insert({
      rdo_id: rdoId, categoria: labels, descricao: desc.trim() || labels,
    }).select().single();
    setSalvando(false);
    if (error) { setErro(msgAmigavel(error, 'salvar')); return; }
    setLista(prev => [...prev, data]);
    setSel([]); setDesc(''); setAbrindo(false);
  }

  async function apagar(id) {
    if (!confirm('Apagar esta ocorrência?')) return;
    const { error } = await supabase.from('ocorrencias').delete().eq('id', id);
    if (error) { setErro('Não consegui apagar.'); return; }
    setLista(prev => prev.filter(o => o.id !== id));
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>
        OCORRÊNCIAS DO DIA {lista.length > 0 && `· ${lista.length}`}
      </div>

      {lista.map(oc => (
        <div key={oc.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '9px 12px',
          borderRadius: 10, background: 'var(--danger-tint,#FEE2E2)', borderLeft: '3px solid var(--danger,#DC2626)', marginBottom: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{oc.categoria}</div>
            {oc.descricao && oc.descricao !== oc.categoria && (
              <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{oc.descricao}</div>
            )}
          </div>
          {podeEditar && (
            <button onClick={() => apagar(oc.id)} title="apagar"
              style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 15, padding: 0 }}>×</button>
          )}
        </div>
      ))}
      {lista.length === 0 && !abrindo && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 6 }}>Nenhuma ocorrência registrada neste dia.</div>
      )}

      {erro && <div style={{ fontSize: 12, color: 'var(--danger,#DC2626)', fontWeight: 700, marginBottom: 6 }}>{erro}</div>}

      {podeEditar && !abrindo && (
        <button onClick={() => setAbrindo(true)}
          style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 10, cursor: 'pointer',
            border: '1px dashed var(--border)', background: 'var(--surface)', color: 'var(--text-2)' }}>
          + Registrar ocorrência neste dia
        </button>
      )}

      {podeEditar && abrindo && (
        <div style={{ background: 'var(--surface)', border: '0.5px solid var(--border)', borderRadius: 12, padding: 12 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {TIPOS_OCORRENCIA.map(t => (
              <button key={t.id} onClick={() => toggle(t.id)}
                style={{ fontSize: 12, fontWeight: 700, padding: '6px 10px', borderRadius: 999, cursor: 'pointer',
                  border: sel.includes(t.id) ? `1.5px solid ${t.cor}` : '1px solid var(--border)',
                  background: sel.includes(t.id) ? t.cor + '22' : 'var(--surface-2)',
                  color: 'var(--text-1)' }}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} placeholder="detalhe o que aconteceu (opcional)"
            style={{ width: '100%', minHeight: 54, fontFamily: 'inherit', fontSize: 13, padding: '8px 10px',
              borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)',
              resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setAbrindo(false); setSel([]); setDesc(''); }}
              style={{ fontSize: 12.5, fontWeight: 700, padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)' }}>Cancelar</button>
            <button onClick={salvar} disabled={!sel.length || salvando}
              style={{ fontSize: 12.5, fontWeight: 800, padding: '8px 16px', borderRadius: 9,
                border: 0, background: 'var(--primary)', color: '#fff',
                cursor: sel.length ? 'pointer' : 'default', opacity: sel.length && !salvando ? 1 : 0.4 }}>
              {salvando ? 'Salvando…' : 'Salvar ocorrência'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RDODiaDetalhe({ rdo, onBack, onEdit }) {
  // actGroups: [{key, rdoAtividadeId, descricao, ambiente, empreiteiro, status, workers:[{nome,empresa}]}]
  const [actGroups,     setActGroups]     = useState([]);
  const [semAtividade,  setSemAtividade]  = useState([]);
  const [empresaGroups, setEmpresaGroups] = useState([]); // [{id, nome, cor, workers:[]}]
  const [totalEfetivo,  setTotalEfetivo]  = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [editingKey,    setEditingKey]    = useState(null);
  const [savingKey,     setSavingKey]     = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);

      // 1. Busca o efetivo_draft (fonte de verdade)
      const { data: rdoFull } = await supabase
        .from('rdos').select('efetivo_draft').eq('id', rdo.id).single();

      const draft = rdoFull?.efetivo_draft || [];

      // 2. Coleta todos os atividade_ids e empresa_ids do draft
      const atividadeIds = new Set();
      const empresaIds   = new Set();
      for (const w of draft) {
        if (w.atividade_id) atividadeIds.add(w.atividade_id);
        if (w.empresa_id)   empresaIds.add(w.empresa_id);
        for (const ex of (w.extras || [])) {
          if (ex.atividade_id) atividadeIds.add(ex.atividade_id);
        }
      }

      // 3. Busca atividades por ID (sem filtrar por rdo_id — busca multi-day)
      //    e cores das empresas em paralelo
      const atividadesMap = {};
      const empColorMap   = {};
      const empNomeMap    = {};
      await Promise.all([
        atividadeIds.size > 0
          ? supabase.from('atividades_rdo').select('*').in('id', [...atividadeIds])
              .then(({ data }) => (data || []).forEach(a => { atividadesMap[a.id] = a; }))
          : Promise.resolve(),
        supabase.from('empreiteiros').select('id, nome, cor')
          .then(({ data }) => (data || []).forEach(e => { empColorMap[e.id] = e; empNomeMap[(e.nome || '').toLowerCase()] = e; })),
      ]);
      // Resolve a cor da empresa por id, senão por nome, senão ADM (verde) / cinza
      const corDe = (id, nome) => (id && empColorMap[id]?.cor) || empNomeMap[(nome || '').toLowerCase()]?.cor || ((nome || '').toUpperCase().includes('ADM') ? '#1F6B3A' : '#888888');

      // 4. Agrupa efetivo por empresa (deduplica nomes).
      //    Quem foi marcado ADM no dia (is_adm) vai para o grupo "ADM (própria)".
      const ADM_NOME = 'ADM (própria)';
      const empMap = {};
      for (const w of draft) {
        const isAdm = w.is_adm || /adm/i.test(w.empresa_nome || '');
        const key = isAdm ? '__adm' : (w.empresa_id || w.empresa_nome || '__sem__');
        if (!empMap[key]) {
          const emp = (!isAdm && w.empresa_id) ? empColorMap[w.empresa_id] : null;
          empMap[key] = {
            id:      isAdm ? null : (w.empresa_id || null),
            nome:    isAdm ? ADM_NOME : (emp?.nome || w.empresa_nome || 'Sem empresa'),
            cor:     isAdm ? '#1F6B3A' : corDe(w.empresa_id, w.empresa_nome),
            workers: new Set(),
          };
        }
        empMap[key].workers.add(w.nome);
      }
      const empGroupsList = Object.values(empMap)
        .map(e => ({ ...e, workers: [...e.workers] }))
        .sort((a, b) => b.workers.length - a.workers.length);
      setEmpresaGroups(empGroupsList);

      // 5. Constrói grupos de atividades a partir do draft
      const actMap = {};
      const semAtiv = [];

      const addWorker = (key, rdoAtividadeId, descricao, ambiente, empreiteiro, status, workerNome, workerEmpresa) => {
        if (!actMap[key]) {
          actMap[key] = { key, rdoAtividadeId, descricao, ambiente, empreiteiro, status, workers: [] };
        }
        actMap[key].workers.push({ nome: workerNome, empresa: workerEmpresa, cor: corDe(null, workerEmpresa) });
      };

      for (const w of draft) {
        let hasActivity = false;

        const actKey = w.atividade_id || w.atividade_livre;
        if (actKey) {
          hasActivity = true;
          const atv = w.atividade_id ? atividadesMap[w.atividade_id] : null;
          addWorker(
            actKey,
            w.atividade_id || null,
            atv?.descricao || w.atividade_livre || '(sem descrição)',
            atv?.ambiente || null,
            atv?.empreiteiro || w.empresa_nome || null,
            atv?.status || w.atividade_status || 'em_andamento',
            w.nome,
            w.empresa_nome,
          );
        }

        for (const ex of (w.extras || [])) {
          const exKey = ex.atividade_id || ex.atividade_livre;
          if (exKey) {
            hasActivity = true;
            const atv = ex.atividade_id ? atividadesMap[ex.atividade_id] : null;
            addWorker(
              exKey,
              ex.atividade_id || null,
              atv?.descricao || ex.atividade_livre || '(sem descrição)',
              atv?.ambiente || null,
              atv?.empreiteiro || w.empresa_nome || null,
              atv?.status || ex.atividade_status || 'em_andamento',
              w.nome,
              w.empresa_nome,
            );
          }
        }

        if (!hasActivity) semAtiv.push(w);
      }

      setActGroups(Object.values(actMap));
      setSemAtividade(semAtiv);
      setTotalEfetivo(draft.length);
      setLoading(false);
    }
    load();
  }, [rdo.id]);

  async function changeStatus(group, newStatus) {
    setSavingKey(group.key);
    setEditingKey(null);
    if (group.rdoAtividadeId) {
      const { error } = await supabase.from('atividades_rdo').update({ status: newStatus }).eq('id', group.rdoAtividadeId);
      if (error) { console.error('Falha ao atualizar status:', error.message); setSavingKey(null); return; }
    }
    setActGroups(prev => prev.map(g => g.key === group.key ? { ...g, status: newStatus } : g));
    setSavingKey(null);
  }

  const editingGroup = actGroups.find(g => g.key === editingKey);

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg,var(--surface-2))' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        borderBottom: '0.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={onBack}
          style={{ width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'var(--surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
            {formatDataCompleta(rdo.data)}
          </div>
          <div style={{ fontSize: 11, color: rdo.submetido ? 'var(--success,#16A34A)' : 'var(--text-3)', fontWeight: 700 }}>
            {rdo.submetido ? `✓ Submetido${rdo.submetido_por_nome ? ' por ' + rdo.submetido_por_nome : ''}` : '⏳ Não submetido'}
          </div>
        </div>
        {/* Botão editar (lápis) */}
        {onEdit && (
          <button
            onClick={() => onEdit(rdo.data)}
            title="Editar RDO"
            style={{
              width: 36, height: 36, borderRadius: 10, border: '0.5px solid var(--border)',
              background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
            {ICON_EDIT}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 14 }}>
          Carregando…
        </div>
      ) : (
        <div style={{ padding: '16px 16px 40px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Resumo do dia */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
              border: '0.5px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{totalEfetivo}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>PESSOAS</div>
            </div>
            <div style={{ flex: 1, background: 'var(--surface)', borderRadius: 14, padding: '12px 14px',
              border: '0.5px solid var(--border)', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)' }}>{actGroups.length}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>ATIVIDADES</div>
            </div>
          </div>

          <OcorrenciasDoDia rdoId={rdo.id} podeEditar={true} />

          {/* Efetivo por empresa — aparece antes das atividades */}
          {empresaGroups.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.08em', marginBottom: 10 }}>
                EFETIVO POR EMPRESA
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {empresaGroups.map(emp => (
                  <div key={emp.id || emp.nome} style={{
                    background: emp.cor + '12',
                    borderRadius: 12,
                    border: `1.5px solid ${emp.cor}40`,
                    borderLeft: `4px solid ${emp.cor}`,
                    padding: '12px 14px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: 999, background: emp.cor, flexShrink: 0 }} />
                        <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                          {emp.nome}
                        </div>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px',
                        borderRadius: 999, background: emp.cor + '22', color: emp.cor }}>
                        👷 {emp.workers.length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {emp.workers.map((nome, wi) => (
                        <span key={wi} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)',
                          padding: '3px 10px', borderRadius: 999,
                          background: emp.cor + '18', border: `0.5px solid ${emp.cor}40` }}>
                          {nome}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Atividades */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)',
              letterSpacing: '0.08em', marginBottom: 10 }}>
              ATIVIDADES ({actGroups.length})
            </div>
            {actGroups.length === 0 ? (
              <div style={{ padding: '16px', borderRadius: 12, background: 'var(--surface)',
                textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
                Nenhuma atividade registrada.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {actGroups.map(a => {
                  const s = STATUS_LABELS[a.status] || { label: a.status || '—', color: 'var(--text-3)' };
                  const workers = a.workers;
                  const isSaving = savingKey === a.key;
                  return (
                    <div key={a.key} style={{
                      background: 'var(--surface)', borderRadius: 12,
                      padding: '12px 14px', border: '0.5px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.3 }}>
                            {a.descricao}
                          </div>
                          {(a.ambiente || a.empreiteiro) && (
                            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                              {[a.ambiente, a.empreiteiro].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </div>
                        {a.rdoAtividadeId && (
                          <button
                            onClick={() => setEditingKey(a.key)}
                            disabled={isSaving}
                            style={{
                              fontSize: 11, fontWeight: 800, color: isSaving ? 'var(--text-3)' : s.color,
                              padding: '3px 8px', borderRadius: 999, background: 'var(--surface-2)',
                              whiteSpace: 'nowrap', flexShrink: 0, border: '1px solid var(--border)',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                              opacity: isSaving ? 0.6 : 1,
                            }}>
                            {isSaving ? '…' : s.label}
                            {!isSaving && <span style={{ fontSize: 9, opacity: 0.6 }}>▼</span>}
                          </button>
                        )}
                      </div>

                      {workers.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--border)' }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                            letterSpacing: '0.06em', marginBottom: 6 }}>
                            👷 {workers.length} PESSOA{workers.length !== 1 ? 'S' : ''}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {workers.map((w, wi) => (
                              <span key={wi} style={{
                                fontSize: 12, fontWeight: 600, color: w.cor || 'var(--text-2)',
                                padding: '4px 10px', borderRadius: 999,
                                background: (w.cor || '#888888') + '18', border: `0.5px solid ${(w.cor || '#888888')}40`,
                              }}>
                                {w.nome}
                                {w.empresa ? <span style={{ opacity: 0.7, fontWeight: 500 }}> · {w.empresa}</span> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Efetivo sem atividade */}
          {semAtividade.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.08em', marginBottom: 10 }}>
                SEM ATIVIDADE VINCULADA ({semAtividade.length})
              </div>
              <div style={{ background: 'var(--surface)', borderRadius: 12,
                border: '0.5px solid var(--border)', overflow: 'hidden' }}>
                {semAtividade.map((w, i) => (
                  <div key={w.id || i} style={{
                    padding: '11px 14px',
                    borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>
                      {w.nome}
                    </div>
                    {w.empresa_nome && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, fontWeight: 600 }}>
                        {w.empresa_nome}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}


        </div>
      )}

      {/* Bottom sheet — picker de status */}
      {editingKey && editingGroup && (
        <>
          <div onClick={() => setEditingKey(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', left: 0, right: 0, bottom: 0,
            background: 'var(--surface)', borderRadius: '20px 20px 0 0',
            padding: '20px 16px 36px', zIndex: 51,
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
          }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)',
              margin: '-8px auto 16px' }} />
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-3)',
              letterSpacing: '0.06em', marginBottom: 6 }}>ALTERAR STATUS</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {editingGroup.descricao}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STATUS_OPTIONS.map(opt => {
                const isCurrent = (editingGroup.status || 'pendente') === opt.key;
                return (
                  <button key={opt.key} onClick={() => changeStatus(editingGroup, opt.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', borderRadius: 12, border: 'none',
                      background: isCurrent ? opt.bg : 'var(--surface-2)',
                      cursor: 'pointer', textAlign: 'left',
                      outline: isCurrent ? `2px solid ${opt.color}` : 'none', outlineOffset: -1,
                    }}>
                    <span style={{ fontSize: 20, lineHeight: 1 }}>{opt.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: isCurrent ? 800 : 600,
                      color: isCurrent ? opt.color : 'var(--text-1)', flex: 1 }}>
                      {opt.label}
                    </span>
                    {isCurrent && <span style={{ fontSize: 16, color: opt.color }}>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tela de histórico ─────────────────────────────────────────────────────────
export function RDOHistoricoScreen({ goto, onEditRDO, params }) {
  const [rdos,      setRdos]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [selected,  setSelected]  = useState(null);
  // Quando o Efetivo manda a data, já abre esse dia em vez de largar o
  // engenheiro na lista para procurar.
  const dataPedida = params?.data;

  const load = useCallback(async () => {
    setLoading(true);
    const limite = new Date();
    limite.setDate(limite.getDate() - 60);
    const limiteStr = toISODate(limite);

    const { data: rdoData } = await supabase
      .from('rdos')
      .select('id, data, submetido, submetido_em, submetido_por_nome, efetivo_draft')
      .gte('data', limiteStr)
      .order('data', { ascending: false });

    if (!rdoData || rdoData.length === 0) { setRdos([]); setLoading(false); return; }

    // Conta atividades e efetivo direto do efetivo_draft (mesma fonte que o detalhe usa)
    const contarAtividades = (draft) => {
      if (!Array.isArray(draft)) return 0;
      const keys = new Set();
      for (const w of draft) {
        if (w.atividade_id)       keys.add(String(w.atividade_id));
        else if (w.atividade_livre) keys.add('livre__' + w.atividade_livre);
        for (const ex of (w.extras || [])) {
          if (ex.atividade_id)       keys.add(String(ex.atividade_id));
          else if (ex.atividade_livre) keys.add('livre__' + ex.atividade_livre);
        }
      }
      return keys.size;
    };

    const lista = rdoData.map(r => ({
      ...r,
      countAtividades: contarAtividades(r.efetivo_draft),
      countEfetivo:    Array.isArray(r.efetivo_draft) ? r.efetivo_draft.length : 0,
    }));
    setRdos(lista);
    // Abre direto o dia que veio do Efetivo, se ele existir na janela carregada.
    if (dataPedida) {
      const alvo = lista.find(r => r.data === dataPedida);
      if (alvo) setSelected(alvo);
    }
    setLoading(false);
  }, [dataPedida]);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return (
      <RDODiaDetalhe
        rdo={selected}
        onBack={() => setSelected(null)}
        onEdit={onEditRDO}
      />
    );
  }

  const today = todayStr();

  return (
    <div style={{ minHeight: '100%', background: 'var(--bg,var(--surface-2))' }}>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
        borderBottom: '0.5px solid var(--border)', background: 'var(--surface)',
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button onClick={() => goto('home')}
          style={{ width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'var(--surface-2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)' }}>Histórico RDO</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>Últimos 60 dias</div>
        </div>
      </div>

      {/* Resumo */}
      <div style={{ margin: '12px 16px', background: 'var(--surface)', borderRadius: 16,
        padding: '14px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        display: 'flex', gap: 20, border: '0.5px solid var(--border)' }}>
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{rdos.length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>DIAS</div>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success,#16A34A)' }}>
            {rdos.filter(r => r.submetido).length}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>SUBMETIDOS</div>
        </div>
        <div style={{ width: 1, background: 'var(--border)' }} />
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>
            {rdos.reduce((s, r) => s + r.countAtividades, 0)}
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>ATIVIDADES</div>
        </div>
      </div>

      {/* Lista */}
      <div style={{ padding: '4px 16px 40px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 14 }}>
            Carregando…
          </div>
        ) : rdos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-2)', marginBottom: 6 }}>
              Nenhum RDO encontrado
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Os relatórios dos últimos 60 dias aparecerão aqui.
            </div>
          </div>
        ) : (
          rdos.map(rdo => {
            const isToday = rdo.data === today;
            const total  = rdo.countAtividades;
            return (
              <button key={rdo.id} onClick={() => setSelected(rdo)}
                style={{
                  width: '100%', textAlign: 'left', padding: '14px 14px',
                  borderRadius: 14, border: isToday ? '1.5px solid var(--primary)' : '0.5px solid var(--border)',
                  background: 'var(--surface)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>

                {/* Ícone data */}
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: isToday ? 'var(--primary)' : 'var(--surface-2)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                }}>
                  <div style={{ fontSize: 18, fontWeight: 900,
                    color: isToday ? '#fff' : 'var(--text-1)', lineHeight: 1 }}>
                    {parseDateLocal(rdo.data)?.getDate()}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 800,
                    color: isToday ? 'rgba(255,255,255,0.75)' : 'var(--text-3)',
                    letterSpacing: '0.04em' }}>
                    {(MESES[parseDateLocal(rdo.data)?.getMonth()] || '').toUpperCase()}
                  </div>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>
                    {formatDataCurta(rdo.data)}{isToday ? ' — hoje' : ''}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                      background: total > 0 ? 'rgba(14,108,184,0.1)' : 'var(--surface-2)',
                      color: total > 0 ? 'var(--primary)' : 'var(--text-3)',
                    }}>
                      📋 {total} atividade{total !== 1 ? 's' : ''}
                    </span>
                    {rdo.countEfetivo > 0 && (
                      <span style={{
                        padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                        background: 'var(--surface-2)', color: 'var(--text-3)',
                      }}>
                        👷 {rdo.countEfetivo} pessoas
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {rdo.submetido ? (
                    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                      background: 'var(--success-tint,#DCFCE7)', color: 'var(--success,#16A34A)' }}>
                      ✓ OK
                    </span>
                  ) : (
                    <span style={{ padding: '4px 10px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                      background: 'var(--surface-2)', color: 'var(--text-3)' }}>
                      Pendente
                    </span>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
