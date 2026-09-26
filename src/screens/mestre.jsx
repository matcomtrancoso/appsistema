import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, Avatar, PageHeader, StatusPickerChip, ReplanejaDiasChip } from '../components/index';
import { MOTIVOS_NAO_EXEC } from '../data/index';
import { useObra } from '../lib/ObraContext';
import { getDerivedStatus } from './mestre-rdo-v2';
import { hojeLocal } from '../lib/date';
import { chaveDoDia, DIA_ORDEM } from '../lib/atividades-do-dia';
import { msgAmigavel } from '../lib/msg-amigavel';

// ── Atividades de hoje (agrupadas por empreiteiro) ───────────────────────
const DIAS_SHORT  = { dom:'Dom', seg:'Seg', ter:'Ter', qua:'Qua', qui:'Qui', sex:'Sex', sab:'Sáb' };
const todayDiaKey = chaveDoDia(hojeLocal());

function DiasChips({ diasSemana }) {
  const dias = DIA_ORDEM;
  if (!diasSemana || diasSemana.length === 0) return null;
  return (
    <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
      {dias.map(d => {
        const active  = diasSemana.includes(d);
        const isToday = d === todayDiaKey;
        return (
          <span key={d} style={{
            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999,
            background: isToday && active
              ? 'var(--primary)'
              : active
                ? 'var(--surface-3, #E5E7EB)'
                : 'transparent',
            color: isToday && active
              ? '#fff'
              : active
                ? 'var(--text-2)'
                : 'var(--text-3)',
            opacity: active ? 1 : 0.35,
            border: isToday ? (active ? 'none' : '1px solid var(--border)') : 'none',
          }}>
            {DIAS_SHORT[d]}
          </span>
        );
      })}
    </div>
  );
}

function AtividadesHoje({ atividades, efetivo }) {
  const { empreiteiros } = useObra();
  const empColor = (nome) => empreiteiros.find(e => e.nome === nome)?.cor || '#888888';

  // Agrupa por empreiteiro
  const grouped = {};
  atividades.forEach(a => {
    const key = a.empreiteiro || '__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(a);
  });

  return (
    <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 16 }}>
      <div className="t-micro" style={{ marginBottom: 10 }}>ATIVIDADES DE HOJE</div>
      <div className="stack stack-3">
        {Object.entries(grouped).map(([empNome, list]) => {
          const cor = empColor(empNome === '__' ? null : empNome);
          const label = empNome === '__' ? 'Sem fornecedor' : empNome;
          return (
            <div key={empNome}>
              {/* Cabeçalho do fornecedor */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 2px 6px', borderBottom: `2px solid ${cor}33`, marginBottom: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: cor, flexShrink: 0 }} />
                <div style={{ fontSize: 11, fontWeight: 800, color: cor, letterSpacing: '0.04em' }}>{label.toUpperCase()}</div>
                <div className="t-caption" style={{ opacity: 0.7 }}>· {list.length}</div>
              </div>
              <div className="card" style={{ padding: 0 }}>
                {list.map((a, i) => {
                  const status = getDerivedStatus(a.id, efetivo);
                  const workerCount = efetivo.filter(w =>
                    w.atividade_id === a.id || (w.extras || []).some(e => e.atividade_id === a.id)
                  ).length;
                  // Atividade sem dia fixo ou que inclui hoje = normal; fora do dia = apagada
                  const hasDias  = a.dias_semana && a.dias_semana.length > 0;
                  const isOffDay = hasDias && !a.dias_semana.includes(todayDiaKey);
                  const isDone   = a.status === 'feita';
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'stretch', borderTop: i === 0 ? 'none' : '0.5px solid var(--divider)', opacity: (isOffDay && !isDone) ? 0.45 : 1 }}>
                      <div style={{ width: 3, background: cor, flexShrink: 0, borderRadius: i === 0 ? '12px 0 0 0' : 0 }} />
                      <div style={{ flex: 1, padding: '11px 12px 10px', minWidth: 0 }}>
                        <div className="t-strong" style={{ fontSize: 13, lineHeight: 1.3 }}>{a.descricao}</div>
                        {a.ambiente && <div className="t-caption" style={{ fontSize: 11, marginTop: 2 }}>📍 {a.ambiente}</div>}
                        {hasDias && <div style={{ marginTop: 6 }}><DiasChips diasSemana={a.dias_semana} /></div>}
                        {isDone && isOffDay && (
                          <div style={{ marginTop: 6 }}>
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.4, padding: '3px 8px', borderRadius: 999, background: '#DCFCE7', color: '#16A34A' }}>
                              ✓ CONCLUÍDA
                            </span>
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                          {workerCount > 0 && (
                            <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.3, padding: '2px 7px', borderRadius: 999, background: 'rgba(31,107,58,0.12)', color: 'var(--success)' }}>
                              {workerCount} EM CAMPO
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          {/* Sem o dia, tocar aqui numa atividade da semana gravava o
                              status no `status` liso — e a semana inteira mudava junto. */}
                          <StatusPickerChip status={status || a.status || 'pendente'} activityId={a.id}
                            dayKey={hasDias ? todayDiaKey : undefined}
                            statusPorDia={a.status_por_dia} diasSemana={a.dias_semana} />
                        </div>
                        {!isDone && hasDias && (
                          <div style={{ marginTop: 6 }}>
                            <ReplanejaDiasChip activityId={a.id} diasSemana={a.dias_semana || []} />
                          </div>
                        )}
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

// ── M01: Início (Hoje) ───────────────────────────────────────────────────
export function MestreHome({ goto, dailyState, atividades = [], efetivo = [], submitDaily }) {
  const { empresas, profile } = useObra();
  const submitted = dailyState.submitted;
  const [submitting, setSubmitting] = useState(false);
  const handleSubmit = async () => { if (!submitDaily) return; setSubmitting(true); await submitDaily(); setSubmitting(false); };
  const total      = atividades.length;

  const empresaCounts = {};
  efetivo.forEach(w => {
    const eid = w.empresa_id || 'sem';
    empresaCounts[eid] = (empresaCounts[eid] || 0) + 1;
  });
  const empresasComEfetivo = Object.entries(empresaCounts).map(([eid, n]) => {
    const e = empresas.find(x => x.id === eid);
    return { id: eid, nome: e ? e.nome : 'Outros', cor: e ? e.cor : '#888', n };
  });
  const adm = efetivo.filter(w => w.is_adm).length;
  const empreitados = efetivo.length - adm;

  const rawNome = profile?.nome || profile?.email || '';
  const _nomeRaw = rawNome.includes('@')
    ? rawNome.split('@')[0].split('.')[0]
    : rawNome.split(' ')[0] || 'Mestre';
  const nomeDisplay = _nomeRaw.charAt(0).toUpperCase() + _nomeRaw.slice(1).toLowerCase();
  const ini = rawNome.includes('@')
    ? (rawNome.split('@')[0][0] || 'M').toUpperCase()
    : (rawNome.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'M');

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 4px' }}>
        <div className="row-between">
          <div>
            <div className="t-micro" style={{ color: 'var(--primary)' }}>{hoje}</div>
            <div className="t-display" style={{ fontSize: 30, marginTop: 2 }}>Bom dia,<br/>{nomeDisplay}.</div>
          </div>
          <Avatar ini={ini} size={44} />
        </div>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        <div className="card" style={{ background: submitted ? 'var(--success-tint)' : 'var(--primary-tint-strong)', border: 0 }}>
          <div className="row-between">
            <div className="t-micro" style={{ color: submitted ? 'var(--success)' : 'var(--primary)' }}>RDO DE HOJE</div>
            {submitted
              ? <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 9px', borderRadius: 999, background: 'var(--success)', color: '#fff' }}>✓ Concluído</span>
              : <span className="chip">Em aberto</span>}
          </div>
          {submitted && (
            <div className="t-2" style={{ fontSize: 13, marginTop: 8 }}>
              {efetivo.length} colaborador{efetivo.length !== 1 ? 'es' : ''} registrado{efetivo.length !== 1 ? 's' : ''}
            </div>
          )}
          {!submitted && submitDaily && (
            <button
              onClick={handleSubmit}
              disabled={submitting || efetivo.length === 0}
              className="btn btn-block"
              style={{ marginTop: 10, background: efetivo.length === 0 ? 'var(--surface-3)' : 'var(--success)', color: efetivo.length === 0 ? 'var(--text-3)' : '#fff', border: 'none' }}>
              {submitting ? '…' : '✓ Concluir RDO de hoje'}
            </button>
          )}
          <button className="btn btn-primary btn-block" style={{ marginTop: 8, background: submitted ? 'var(--success)' : undefined, opacity: submitted ? 0.85 : 1 }} onClick={() => goto('rdo')}>
            {submitted ? 'Editar diário' : 'Continuar diário'}
            <span style={{ width: 16, height: 16 }}>{Icon.arrowR}</span>
          </button>
        </div>
      </div>

      {/* Efetivo do dia */}
      <div className="page-pad" style={{ marginTop: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="row-between">
            <div className="t-micro">EFETIVO NO CANTEIRO</div>
          </div>
          <div className="row-flex" style={{ gap: 14, marginTop: 10, alignItems: 'baseline' }}>
            <div className="t-display" style={{ fontSize: 38, lineHeight: 1, fontWeight: 800 }}>{efetivo.length}</div>
            <div className="t-caption" style={{ fontSize: 12, lineHeight: 1.3 }}>
              {efetivo.length === 1 ? 'pessoa registrada' : 'pessoas registradas'}<br/>
              <span style={{ color: 'var(--text-3)' }}>{empreitados} empreitada · {adm} ADM</span>
            </div>
          </div>
          {empresasComEfetivo.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {empresasComEfetivo.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, background: e.cor + '15', border: '0.5px solid ' + e.cor + '40' }}>
                  <div style={{ width: 6, height: 6, borderRadius: 999, background: e.cor }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>{e.nome}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: e.cor }}>{e.n}</span>
                </div>
              ))}
            </div>
          )}
          {efetivo.length === 0 && (
            <div className="t-caption" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.4 }}>
              Ninguém registrado ainda. Registre colaboradores na aba RDO.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => goto('rdo')}>
              <span style={{ width: 16, height: 16 }}>{Icon.users}</span>
              {efetivo.length === 0 ? 'Registrar' : 'Ajustar'}
            </button>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => goto('efetivo-resumo')}>
              <span style={{ width: 16, height: 16 }}>{Icon.barChart}</span>
              Resumo
            </button>
          </div>
        </div>
      </div>

      {/* Galeria de fotos */}
      <div className="page-pad" style={{ paddingTop: 8 }}>
        <div className="row tap" onClick={() => goto('galeria')} style={{ background: 'var(--surface)', boxShadow: 'inset 0 0 0 0.5px var(--border)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📷</div>
          <div style={{ flex: 1 }}>
            <div className="t-strong" style={{ fontSize: 15 }}>Galeria de fotos</div>
            <div className="t-caption">Fotos do RDO por dia, pavimento e ambiente</div>
          </div>
          <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
        </div>
      </div>

      {total > 0 && <AtividadesHoje atividades={atividades} efetivo={efetivo} goto={goto} />}
    </div>
  );
}

// ── M03: RDO activity detail ─────────────────────────────────────────────
export function MestreRDOActivity({ params, goto, atividades = [], setAtividadeStatus }) {
  const a = atividades.find(x => x.id === params.activityId);
  const [status, setStatus] = useState(a?.status || params.initial || 'feita');
  const [motivo, setMotivo] = useState(a?.motivo_nao_exec || null);
  const [saving, setSaving] = useState(false);

  if (!a) {
    return (
      <div className="page page-pad">
        <div className="card" style={{ textAlign: 'center', padding: 20 }}>
          <div className="t-strong">Atividade não encontrada</div>
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => goto('rdo')}>Voltar</button>
        </div>
      </div>
    );
  }

  const save = async () => {
    setSaving(true);
    await setAtividadeStatus(a.id, status, motivo);
    setSaving(false);
    goto('rdo');
  };

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('rdo')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <PageHeader eyebrow={(a.ambiente || 'ATIVIDADE').toUpperCase()} title={a.descricao} sub={a.empreiteiro || ''} />
      <div className="page-pad stack stack-3">
        <div className="action-grid">
          {[['feita','Feita',Icon.check,'var(--success)'],['parcial','Parcial',Icon.partial,'var(--warn)'],['nao_feita','Não feita',Icon.x,'var(--danger)']].map(([key,label,icon,color]) => (
            <button key={key} className={'action-btn ' + key + (status === key ? ' is-on' : '')} onClick={() => setStatus(key)}>
              <span style={{ color }}>{icon}</span>{label}
            </button>
          ))}
        </div>
        {status !== 'feita' && (
          <div>
            <div className="t-micro" style={{ marginBottom: 8, padding: '0 4px' }}>MOTIVO</div>
            <div className="stack stack-1">
              {MOTIVOS_NAO_EXEC.map(m => (
                <button key={m.id} className="row tap"
                  style={{ background: motivo === m.id ? 'var(--primary-tint)' : 'var(--surface)', borderColor: motivo === m.id ? 'var(--primary)' : 'var(--border)', cursor: 'pointer', border: motivo === m.id ? '1.5px solid var(--primary)' : '0.5px solid var(--border)' }}
                  onClick={() => setMotivo(m.id)}>
                  <div style={{ flex: 1, color: motivo === m.id ? 'var(--primary)' : 'var(--text)', fontWeight: 600 }}>{m.nome}</div>
                  {motivo === m.id && <span style={{ width: 18, height: 18, color: 'var(--primary)' }}>{Icon.check}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <button className="btn btn-primary btn-block" style={{ marginTop: 8 }} disabled={saving} onClick={save}>
          {saving ? 'Salvando…' : 'Confirmar e voltar'}
        </button>
      </div>
    </div>
  );
}

// ── M04: RDO summary ─────────────────────────────────────────────────────
export function MestreRDOSummary({ goto, atividades = [], efetivo = [], submitDaily }) {
  // Deriva status ao vivo a partir do efetivo (mesma lógica do MestreRDOv2)
  const counts = { feita: 0, em_andamento: 0, nao_feita: 0, pendente: 0 };
  for (const a of atividades) {
    const s = getDerivedStatus(a.id, efetivo) || a.status || 'pendente';
    if (s === 'feita') counts.feita++;
    else if (s === 'em_andamento' || s === 'parcial') counts.em_andamento++;
    else if (s === 'nao_feita' || s === 'naofeita' || s === 'nao_executada') counts.nao_feita++;
    else counts.pendente++;
  }
  const [hasOcc, setHasOcc] = useState(null);
  const [hasExtra, setHasExtra] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const allAnswered = hasOcc !== null && hasExtra !== null;

  const handleSubmit = async () => {
    setSubmitting(true);
    const ok = await submitDaily();
    setSubmitting(false);
    // Falhou = fica na revisão para tentar de novo; voltar pra home escondia
    // que o diário não tinha sido enviado.
    if (ok !== false) goto('home');
  };

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('rdo')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <PageHeader eyebrow="RESUMO DO DIA" title="Quase lá!" sub="Confira os números antes de enviar." />
      <div className="page-pad stack stack-3">
        <div className="card">
          <div className="t-micro" style={{ marginBottom: 12 }}>ATIVIDADES DE HOJE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <div style={{ textAlign: 'center', padding: '12px 4px', background: 'var(--success-tint)', borderRadius: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--success)' }}>{counts.feita}</div>
              <div className="t-caption" style={{ color: 'var(--success)', fontWeight: 700 }}>Feitas</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 4px', background: 'var(--warn-tint)', borderRadius: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--warn)' }}>{counts.em_andamento}</div>
              <div className="t-caption" style={{ color: 'var(--warn)', fontWeight: 700 }}>Em andamento</div>
            </div>
            <div style={{ textAlign: 'center', padding: '12px 4px', background: 'var(--danger-tint)', borderRadius: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--danger)' }}>{counts.nao_feita}</div>
              <div className="t-caption" style={{ color: 'var(--danger)', fontWeight: 700 }}>Não feitas</div>
            </div>
          </div>
          <div className="divider" />
          <div className="row-between">
            <div className="t-2">Colaboradores registrados</div>
            <div className="t-strong">{efetivo.length}</div>
          </div>
        </div>
        <div className="card">
          <div className="t-title">Houve alguma ocorrência hoje?</div>
          <div className="row-flex" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1, borderColor: hasOcc === false ? 'var(--primary)' : 'var(--border-strong)', color: hasOcc === false ? 'var(--primary)' : 'var(--text)' }} onClick={() => setHasOcc(false)}>Não</button>
            <button className="btn btn-secondary" style={{ flex: 1, borderColor: hasOcc === true ? 'var(--warn)' : 'var(--border-strong)', color: hasOcc === true ? 'var(--warn)' : 'var(--text)' }} onClick={() => { setHasOcc(true); goto('rdo-occurrence'); }}>Sim, registrar</button>
          </div>
        </div>
        <div className="card">
          <div className="t-title">Atividade não-planejada que foi feita?</div>
          <div className="row-flex" style={{ marginTop: 12, gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1, borderColor: hasExtra === 'nao' ? 'var(--primary)' : 'var(--border-strong)', color: hasExtra === 'nao' ? 'var(--primary)' : 'var(--text)' }} onClick={() => setHasExtra('nao')}>Não</button>
            <button className="btn btn-secondary" style={{ flex: 1, borderColor: hasExtra === 'andamento' ? 'var(--warn)' : 'var(--border-strong)', color: hasExtra === 'andamento' ? 'var(--warn)' : 'var(--text)' }} onClick={() => setHasExtra('andamento')}>Em andamento</button>
            <button className="btn btn-secondary" style={{ flex: 1, borderColor: hasExtra === 'sim' ? 'var(--primary)' : 'var(--border-strong)', color: hasExtra === 'sim' ? 'var(--primary)' : 'var(--text)' }} onClick={() => setHasExtra('sim')}>Sim</button>
          </div>
        </div>
        <button className="btn btn-primary btn-block" style={{ height: 60, fontSize: 16 }}
          disabled={!allAnswered || submitting} onClick={handleSubmit}>
          {submitting ? 'Enviando…' : <>Enviar diário <span style={{ width: 18, height: 18 }}>{Icon.check}</span></>}
        </button>
      </div>
    </div>
  );
}

// ── M05: Ocorrência ───────────────────────────────────────────────────────
export const TIPOS_OCORRENCIA = [
  { id: 'chuva',         emoji: '🌧️', label: 'Choveu',                 cor: '#0EA5E9' },
  { id: 'mat',           emoji: '📦', label: 'Faltou material',         cor: '#F59E0B' },
  { id: 'mdo',           emoji: '👷', label: 'Faltou mão de obra',      cor: '#8B7355' },
  { id: 'sem_projeto',   emoji: '📋', label: 'Sem projeto',             cor: '#6366F1' },
  { id: 'proj_old',      emoji: '🔄', label: 'Projeto desatualizado',   cor: '#A855F7' },
  { id: 'energia',       emoji: '⚡', label: 'Faltou energia',          cor: '#EAB308' },
  { id: 'equipamento',   emoji: '🔧', label: 'Faltou equipamento',      cor: '#64748B' },
  { id: 'outros',        emoji: '📝', label: 'Outros',                  cor: '#94A3B8' },
];

export function MestreOccurrence({ goto, rdoId, profile }) {
  const [step, setStep] = useState('ask'); // 'ask' | 'form'
  const [selected, setSelected] = useState([]); // ids selecionados
  const [descricao, setDescricao] = useState('');
  const [turno, setTurno] = useState('dia');
  const [saving, setSaving] = useState(false);

  const toggleTipo = (id) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const voltar = () => goto('rdo');

  const [saveError, setSaveError] = useState(null);

  const salvar = async () => {
    if (!selected.length) return;
    setSaving(true);
    setSaveError(null);
    // Garante um RDO do dia: sem rdo_id a ocorrência nunca aparece na tela do RDO
    let rid = rdoId;
    if (!rid) {
      const hoje = hojeLocal();
      const { data: rdoHoje } = await supabase.from('rdos').select('id').eq('data', hoje).maybeSingle();
      if (rdoHoje) rid = rdoHoje.id;
      else {
        const { data: novoRdo } = await supabase.from('rdos').insert({ data: hoje }).select().single();
        if (novoRdo) rid = novoRdo.id;
      }
    }
    const labels = selected.map(id => TIPOS_OCORRENCIA.find(t => t.id === id)?.label || id).join(', ');
    const { error } = await supabase.from('ocorrencias').insert({
      rdo_id: rid || null,
      categoria: labels,
      descricao: descricao.trim() || labels,
      turno,
      registrado_por: profile?.nome || null,
    });
    setSaving(false);
    if (error) {
      console.error('Erro ao salvar ocorrência:', error);
      setSaveError(msgAmigavel(error, 'salvar'));
      return;
    }
    goto('rdo');
  };

  const inputStyle = {
    width: '100%', padding: '12px 14px', borderRadius: 12,
    border: '1px solid var(--border)', background: 'var(--surface)',
    fontSize: 14, color: 'var(--text)', outline: 'none',
    resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  };

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={voltar}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> RDO
        </button>
      </div>

      {step === 'ask' && (
        <div className="page-pad" style={{ marginTop: 24 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🌤️</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 8 }}>
              Houve alguma ocorrência hoje?
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.5 }}>
              Registre imprevistos, faltas ou problemas que afetaram o andamento da obra.
            </div>
          </div>
          <div className="stack stack-2">
            <button
              onClick={() => setStep('form')}
              style={{ width: '100%', padding: '20px 16px', borderRadius: 16, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--danger-tint,#FEE2E2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>⚠️</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>Sim, quero registrar</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Selecionar o tipo de ocorrência</div>
              </div>
            </button>
            <button
              onClick={voltar}
              style={{ width: '100%', padding: '20px 16px', borderRadius: 16, border: '1.5px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left' }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--success-tint,#DCFCE7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>✅</div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>Não, dia tranquilo</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Voltar ao RDO sem registrar</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {step === 'form' && (
        <div className="page-pad stack stack-3" style={{ marginTop: 8, paddingBottom: 32 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)', marginBottom: 4 }}>O que aconteceu?</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>Selecione um ou mais tipos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {TIPOS_OCORRENCIA.map(t => {
                const active = selected.includes(t.id);
                return (
                  <button key={t.id} onClick={() => toggleTipo(t.id)} style={{
                    padding: '13px 12px', borderRadius: 14, border: `1.5px solid ${active ? t.cor : 'var(--border)'}`,
                    background: active ? t.cor + '18' : 'var(--surface)',
                    cursor: 'pointer', textAlign: 'left', transition: 'all .12s',
                  }}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{t.emoji}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: active ? t.cor : 'var(--text-2)', lineHeight: 1.3 }}>{t.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>DESCRIÇÃO (opcional)</div>
            <textarea
              style={{ ...inputStyle, minHeight: 90 }}
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex.: chuva forte das 10h às 12h, paralisação geral…"
            />
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>TURNO</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['manha','Manhã'],['tarde','Tarde'],['dia','Dia todo']].map(([k,l]) => (
                <button key={k} onClick={() => setTurno(k)} style={{
                  flex: 1, height: 40, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  background: turno === k ? 'var(--primary)' : 'var(--surface-2)',
                  color: turno === k ? '#fff' : 'var(--text-2)',
                }}>{l}</button>
              ))}
            </div>
          </div>

          {saveError && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger,#DC2626)', fontSize: 13, fontWeight: 600 }}>
              {saveError}
            </div>
          )}
          <button
            onClick={salvar}
            disabled={!selected.length || saving}
            style={{ height: 52, borderRadius: 14, border: 'none', cursor: selected.length ? 'pointer' : 'not-allowed',
              background: selected.length ? 'var(--primary)' : 'var(--border)',
              color: '#fff', fontSize: 15, fontWeight: 800 }}>
            {saving ? 'Salvando…' : selected.length ? 'Registrar ocorrência' : 'Selecione ao menos um tipo'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── M06: Pedidos lista ────────────────────────────────────────────────────
// ── M07: Pedido detalhe ───────────────────────────────────────────────────
// ── M08: Equipamentos ─────────────────────────────────────────────────────

// ── M09: Mais ─────────────────────────────────────────────────────────────
export function MestreMais({ goto, profile }) {
  return (
    <div className="page">
      <PageHeader eyebrow="MENU" title="Mais" />
      <div className="page-pad stack stack-2">
        <MaisRow icon={Icon.alert} label="Pendências" sub="Checklists e pendências da obra" onClick={() => goto('checklist')} />
        <MaisRow icon={'📷'} label="Galeria de fotos" sub="Fotos do RDO por dia, pavimento e ambiente" onClick={() => goto('galeria')} />
        <MaisRow icon={Icon.users} label="Efetivo histórico" sub="Histórico de colaboradores no canteiro" onClick={() => goto('efetivo')} />
        <MaisRow icon={'📏'} label="Medições" sub="Registrar o avanço físico medido no canteiro" onClick={() => goto('medicoes')} />
        <MaisRow icon={'💸'} label="Contas a pagar" sub="Pagamento da equipe por quinzena e despesas" onClick={() => goto('pagar')} />
        <MaisRow icon={'🏦'} label="Contas a receber" sub="Valor fechado, medido e recebido mês a mês" onClick={() => goto('receber')} />
        <MaisRow icon={Icon.cog} label="Configurações" sub="Obra atual e trocar de obra" onClick={() => goto('configuracoes')} />
        {profile?.is_admin && (
          <MaisRow icon={'🏗️'} label="Gerenciar obras" sub="Criar, editar e liberar acesso por obra" onClick={() => goto('obras')} />
        )}
      </div>
    </div>
  );
}

function MaisRow({ icon, label, sub, onClick }) {
  return (
    <div className="row tap" onClick={onClick}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 20, height: 20 }}>{icon}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div className="t-strong" style={{ fontSize: 15 }}>{label}</div>
        {sub && <div className="t-caption">{sub}</div>}
      </div>
      <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
    </div>
  );
}

// ── Efetivo histórico ──────────────────────────────────────────────────────
export function MestreEfetivo({ goto }) {
  const { empreiteiros } = useObra();
  const [efetivo, setEfetivo] = useState([]);
  const [loading, setLoading] = useState(true);


  async function loadEfetivo() {
    setLoading(true);
    const today = hojeLocal();
    const { data: rdo } = await supabase
      .from('rdos').select('id').eq('data', today).maybeSingle();

    if (!rdo) { setLoading(false); return; }

    const { data } = await supabase
      .from('efetivo_rdo')
      .select('*')
      .eq('rdo_id', rdo.id)
      .order('colaborador_nome');

    setEfetivo(data || []);
    setLoading(false);
  }
  useEffect(() => { loadEfetivo(); }, []);

  const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).toUpperCase();

  // Group by empreiteiro
  const grupos = {};
  efetivo.forEach(w => {
    const key = w.empreiteiro || '__adm';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(w);
  });

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('mais')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <PageHeader eyebrow={`EFETIVO · ${hoje}`} title="Efetivo no canteiro"
        sub={loading ? 'Carregando…' : `${efetivo.length} colaboradores registrados`} />

      {loading && (
        <div className="page-pad">
          <div className="t-caption" style={{ textAlign: 'center', padding: 20 }}>Carregando…</div>
        </div>
      )}

      {!loading && efetivo.length === 0 && (
        <div className="page-pad">
          <div className="card" style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div className="t-strong">Nenhum efetivo registrado hoje</div>
            <div className="t-caption" style={{ marginTop: 6 }}>
              O efetivo é registrado no RDO do dia.
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 14 }} onClick={() => goto('rdo')}>
              Ir para o RDO
            </button>
          </div>
        </div>
      )}

      {!loading && efetivo.length > 0 && (
        <div className="page-pad stack stack-3">
          <div className="card" style={{ padding: 14 }}>
            <div className="t-micro" style={{ marginBottom: 8 }}>RESUMO DO DIA</div>
            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1 }}>{efetivo.length}</div>
            <div className="t-caption" style={{ marginTop: 4 }}>
              {efetivo.length === 1 ? 'colaborador presente' : 'colaboradores presentes'}
            </div>
          </div>

          {Object.entries(grupos).map(([key, list]) => {
            const emp = empreiteiros.find(e => e.nome === key) || { nome: key === '__adm' ? 'ADM (própria)' : key, cor: '#1F6B3A' };
            return (
              <div key={key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', background: emp.cor + '12', borderBottom: '0.5px solid var(--divider)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 999, background: emp.cor }} />
                  <div className="t-strong" style={{ fontSize: 13, color: emp.cor }}>{emp.nome}</div>
                  <div className="t-caption">· {list.length} pessoa{list.length !== 1 ? 's' : ''}</div>
                </div>
                {list.map((w, i) => (
                  <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i === 0 ? 'none' : '0.5px solid var(--divider)' }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: emp.cor + '20', color: emp.cor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)' }}>{w.colaborador_nome || '—'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>{emp.nome}</div>
                      </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

