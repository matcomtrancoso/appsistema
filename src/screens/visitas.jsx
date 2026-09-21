// ── Módulo de Visitas e Atas ───────────────────────────────────────────────
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { contem } from '../lib/busca';
import { enviarArquivo } from '../lib/enviar-arquivo';
import { Icon, Sheet, BotaoDitar } from '../components/index';
import { juntarDitado } from '../lib/texto-ditado';
import { baixarArquivo } from '../components/baixar-arquivo.js';
import { hojeLocal } from '../lib/date';
import { avisarErro, motivoAmigavel } from '../lib/msg-amigavel';
import { MARCA } from '../marca.js';

// ── helpers ───────────────────────────────────────────────────────────────
function fmtDateLong(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtDateShort(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  });
}
function todayStr() { return hojeLocal(); }
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

// ── timeline helpers ──────────────────────────────────────────────────────
const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function mesAno(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return MESES[d.getMonth()] + ' ' + d.getFullYear();
}

// Semana da obra (igual ao cabeçalho do Planejamento)
// Sem a data da obra em marca.js, não há número de semana: o agrupamento passa a
// usar a segunda-feira da semana, e o título mostra só o intervalo de datas.
const OBRA_INICIO = MARCA.inicioObra ? new Date(MARCA.inicioObra + 'T12:00:00') : null;

function obraWeekForDate(dateStr) {
  if (!OBRA_INICIO) return null;
  const d = new Date(dateStr + 'T12:00:00');
  return Math.max(1, Math.ceil((d - OBRA_INICIO) / (7 * 86400000)));
}

// Monday of the calendar week containing dateStr (for the date range display)
function weekMonday(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0 = Sunday
  const mon = new Date(d);
  mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return mon;
}

function semanaDoMes(dateStr) {
  return obraWeekForDate(dateStr);
}

function labelSemana(dateStr) {
  const sem    = obraWeekForDate(dateStr);
  const monday = weekMonday(dateStr);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const d = (dt) => dt.getDate();
  const m = (dt) => MESES[dt.getMonth()].slice(0, 3);

  const range = monday.getMonth() === sunday.getMonth()
    ? `${d(monday)}–${d(sunday)} ${m(sunday)}`
    : `${d(monday)} ${m(monday)} – ${d(sunday)} ${m(sunday)}`;

  return sem ? `Semana ${sem}  ·  ${range}` : range;
}

// Agrupa visitas (ordenadas desc) em estrutura { mesAno → { semana → [visitas] } }
function agruparVisitas(visitas) {
  const grupos = []; // [{ mesAno, semanas: [{ label, key, items }] }]
  const mesIdx  = {};
  const semIdx  = {};
  for (const v of visitas) {
    const ma  = mesAno(v.data);
    const sem = semanaDoMes(v.data);
    const semKey = ma + '|' + (sem ?? weekMonday(v.data).toISOString().slice(0, 10));
    if (mesIdx[ma] === undefined) {
      mesIdx[ma] = grupos.length;
      grupos.push({ mesAno: ma, semanas: [] });
    }
    const g = grupos[mesIdx[ma]];
    if (semIdx[semKey] === undefined) {
      semIdx[semKey] = g.semanas.length;
      g.semanas.push({ label: labelSemana(v.data), key: semKey, items: [] });
    }
    g.semanas[semIdx[semKey]].items.push(v);
  }
  return grupos;
}

// ── Lista ─────────────────────────────────────────────────────────────────
export function EngAtas() {
  const [visitas,   setVisitas]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing,   setEditing]   = useState(null);
  const [detail,    setDetail]    = useState(null);
  const [isDesktop,   setIsDesktop]   = useState(() => typeof window !== 'undefined' && window.innerWidth >= 900);
  const [calMonth,    setCalMonth]    = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [viewMode,    setViewMode]    = useState('calendar'); // 'calendar' | 'timeline' (desktop only)
  const [detailPopup, setDetailPopup] = useState(null);      // popup modal no desktop
  useEffect(() => {
    const fn = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [{ data: v }, { data: r }] = await Promise.all([
      supabase.from('visitas').select('*').order('data', { ascending: false }),
      supabase.from('reunioes').select('*').order('data', { ascending: false }),
    ]);
    const byGrupo = new Map();
    const addRow = (row, tipo) => {
      if (!row.grupo_id) return;
      if (!byGrupo.has(row.grupo_id)) {
        byGrupo.set(row.grupo_id, { ...row, _tipos: [], _visita_id: null, _reuniao_id: null });
      }
      const g = byGrupo.get(row.grupo_id);
      g._tipos.push(tipo);
      if (tipo === 'visita')  g._visita_id  = row.id;
      if (tipo === 'reuniao') g._reuniao_id = row.id;
    };
    (v || []).forEach(row => addRow(row, 'visita'));
    (r || []).forEach(row => addRow(row, 'reuniao'));
    const merged = [...byGrupo.values()]
      .map(g => ({ ...g, _tipos: g._tipos.slice().sort() }))
      .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    setVisitas(merged);
    setLoading(false);
  }

  function openNew()  { setEditing(null);  setSheetOpen(true); }
  function openEdit(v){ setEditing(v); setDetail(null); setSheetOpen(true); }

  // O .select() no fim não é enfeite: quando a regra do banco barra a exclusão,
  // o PostgREST não devolve erro nenhum — apaga zero linhas e responde ok. Sem
  // conferir o que voltou, a tela recarregava e o item reaparecia calado, que
  // era exatamente a cara de "não consigo excluir".
  async function deleteVisita(v) {
    if (!v?.grupo_id) { window.alert('Este registro está sem identificador de grupo — não consigo excluir com segurança.'); return; }
    const [rv, rr] = await Promise.all([
      supabase.from('visitas').delete().eq('grupo_id', v.grupo_id).select('id'),
      supabase.from('reunioes').delete().eq('grupo_id', v.grupo_id).select('id'),
    ]);
    const erro = rv.error || rr.error;
    const apagadas = (rv.data?.length || 0) + (rr.data?.length || 0);
    if (erro) {
      avisarErro(erro, 'excluir');
      return;
    }
    if (apagadas === 0) {
      window.alert('Nada foi excluído. Seu acesso não permite apagar visitas — só engenharia pode.');
      return;
    }
    setDetail(null); setDetailPopup(null); load();
  }

  if (detail) return (
    <>
      <VisitaDetail
        visita={detail}
        onBack={() => setDetail(null)}
        onEdit={() => openEdit(detail)}
        onCompletar={() => openEdit({ ...detail, prevista: false })}
        onDelete={() => deleteVisita(detail)}
      />
      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <VisitaWizard
          initial={editing}
          onClose={(reload) => { setSheetOpen(false); setEditing(null); if (reload) load(); }}
        />
      </Sheet>
    </>
  );

  return (
    <div className="page">
      <div style={{
        padding: '16px var(--pad-4) 0',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div className="t-micro">REGISTROS</div>
          <div className="t-h1">Visitas e Reuniões</div>
        </div>
        <button onClick={openNew} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 12, border: 'none',
          background: 'var(--primary)', color: '#fff',
          fontSize: 13, fontWeight: 800, cursor: 'pointer',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1, marginTop: -1 }}>+</span> Visita
        </button>
      </div>

      {/* Toggle Calendário / Timeline — só desktop */}
      {isDesktop && visitas.length > 0 && !loading && (
        <div style={{ padding: '0 var(--pad-4)', marginTop: 12, display: 'flex', gap: 6 }}>
          {['calendar', 'timeline'].map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 800,
              background: viewMode === mode ? 'var(--primary)' : 'var(--surface-2)',
              color: viewMode === mode ? '#fff' : 'var(--text-3)',
              transition: 'all 0.15s',
            }}>
              {mode === 'calendar' ? '📅 Calendário' : '📋 Timeline'}
            </button>
          ))}
        </div>
      )}

      <div style={{ padding: '0 var(--pad-4)', marginTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>
        ) : visitas.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, margin: '0 auto 14px', background: 'var(--surface-2)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 28, height: 28 }}>{Icon.users}</span>
            </div>
            <div className="t-strong" style={{ fontSize: 16 }}>Nenhuma visita ou reunião registrada</div>
            <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.5 }}>Registre empresas e pessoas presentes em cada visita à obra.</div>
            <button onClick={openNew} className="btn btn-primary" style={{ marginTop: 16 }}>+ Registrar primeira visita</button>
          </div>
        ) : isDesktop ? (
          viewMode === 'calendar'
            ? <VisitaCalendar visitas={visitas} calMonth={calMonth} setCalMonth={setCalMonth} onSelect={(v) => setDetailPopup(v)} />
            : <VisitaTimeline visitas={visitas} onSelect={(v) => setDetailPopup(v)} />
        ) : (
          <VisitaTimeline visitas={visitas} onSelect={(v) => setDetail(v)} />
        )}
      </div>

      {/* Popup de detalhe — desktop. O excluir daqui era uma cópia escrita à
          mão: a versão de celular passou a conferir o resultado e esta ficaria
          para trás. As duas chamam a mesma função. */}
      {detailPopup && (
        <VisitaDetailPopup
          visita={detailPopup}
          onClose={() => setDetailPopup(null)}
          onEdit={() => { setEditing(detailPopup); setDetailPopup(null); setSheetOpen(true); }}
          onCompletar={() => { setEditing({ ...detailPopup, prevista: false }); setDetailPopup(null); setSheetOpen(true); }}
          onDelete={() => deleteVisita(detailPopup)}
        />
      )}

      <Sheet open={sheetOpen} onClose={() => { setSheetOpen(false); setEditing(null); }}>
        <VisitaWizard
          initial={editing}
          onClose={(reload) => { setSheetOpen(false); setEditing(null); if (reload) load(); }}
        />
      </Sheet>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────
function VisitaTimeline({ visitas, onSelect }) {
  const grupos = agruparVisitas(visitas);
  return (
    <div style={{ paddingBottom: 16 }}>
      {grupos.map((g) => (
        <div key={g.mesAno} style={{ marginBottom: 24 }}>
          {/* Cabeçalho do mês */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 900, color: 'var(--primary)', letterSpacing: '-0.01em' }}>
              {g.mesAno}
            </div>
            <div style={{ flex: 1, height: 1, background: 'var(--primary)', opacity: 0.2 }} />
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
              {g.semanas.reduce((s, sem) => s + sem.items.length, 0)} VISITA{g.semanas.reduce((s, sem) => s + sem.items.length, 0) !== 1 ? 'S' : ''}
            </div>
          </div>

          {g.semanas.map((sem) => (
            <div key={sem.key} style={{ marginBottom: 16 }}>
              {/* Label da semana */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingLeft: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em',
                  background: 'var(--surface-2)', padding: '3px 9px', borderRadius: 999,
                  border: '0.5px solid var(--border)' }}>
                  {sem.label.toUpperCase()}
                </div>
              </div>

              {/* Linha do tempo + cards */}
              <div style={{ position: 'relative', paddingLeft: 26 }}>
                {/* Linha vertical */}
                <div style={{
                  position: 'absolute', left: 7, top: 8, bottom: 8,
                  width: 1.5, background: 'var(--border)',
                  borderRadius: 999,
                }} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {sem.items.map((v) => (
                    <div key={v.id} style={{ position: 'relative' }}>
                      {/* Ponto da timeline */}
                      <div style={{
                        position: 'absolute', left: -22, top: 14,
                        width: 10, height: 10, borderRadius: 999,
                        background: 'var(--primary)',
                        border: '2px solid var(--bg)',
                        boxShadow: '0 0 0 1.5px var(--primary)',
                        zIndex: 1,
                      }} />
                      <VisitaCard visita={v} onClick={() => onSelect(v)} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────
function VisitaCard({ visita, onClick }) {
  const empresas     = Array.isArray(visita.empresas) ? visita.empresas : [];
  const nomes        = empresas.map(e => e.nome).join(' · ');
  const totalPessoas = empresas.reduce((s, e) => s + (e.pessoas?.length || 0), 0);
  const totalItens   = Array.isArray(visita.itens) ? visita.itens.length : 0;
  return (
    <div className="card tap" onClick={onClick} style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
            <span className="t-micro">{fmtDateShort(visita.data)}</span>
            {(visita._tipos || []).includes('visita') && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, letterSpacing: 0.4, background: 'var(--primary-tint)', color: 'var(--primary)' }}>VISITA</span>
            )}
            {(visita._tipos || []).includes('reuniao') && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, letterSpacing: 0.4, background: '#E1ECF7', color: '#1B4F88' }}>REUNIÃO</span>
            )}
            {visita.prevista && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999, letterSpacing: 0.4, background: 'var(--warn-tint,rgba(202,138,4,0.12))', color: 'var(--warn,#CA8A04)' }}>📌 PREVISTA</span>
            )}
          </div>
          {visita.assunto && (
            <div className="t-strong" style={{ fontSize: 15, marginBottom: 5 }}>{visita.assunto}</div>
          )}
          {nomes ? <div className="t-caption" style={{ marginTop: 2 }}>🏢 {nomes}</div> : null}
          {totalPessoas > 0 && (
            <div className="t-caption" style={{ marginTop: 2 }}>
              👥 {totalPessoas} {totalPessoas === 1 ? 'pessoa' : 'pessoas'}
            </div>
          )}
          {totalItens > 0 && (
            <div className="t-caption" style={{ marginTop: 2 }}>
              📋 {totalItens} {totalItens === 1 ? 'item de pauta' : 'itens de pauta'}
            </div>
          )}
        </div>
        <span style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>
          {Icon.chevR}
        </span>
      </div>
    </div>
  );
}

// ── Detalhe ───────────────────────────────────────────────────────────────
// O `download` de um <a> é ignorado quando o arquivo está em outro domínio — o
// navegador só navega até ele. Buscar o blob e baixar a partir dele é o que
// realmente salva o PDF com o nome certo.
function VisitaDetail({ visita, onBack, onEdit, onDelete, onCompletar }) {
  const empresas = Array.isArray(visita.empresas) ? visita.empresas : [];
  const itens    = Array.isArray(visita.itens)    ? visita.itens    : [];
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 10 }} onClick={onBack}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Visitas
        </button>
        <div className="t-micro" style={{ marginBottom: 4 }}>{fmtDateLong(visita.data)}</div>
        <div className="t-display" style={{ fontSize: 24, lineHeight: 1.2 }}>
          {visita.assunto || (visita.prevista ? 'Visita prevista' : 'Visita à obra')}
        </div>
      </div>

      <div className="page-pad stack stack-3" style={{ marginTop: 18 }}>
        {visita.prevista && (
          <div style={{ background: 'var(--warn-tint,rgba(202,138,4,0.10))', border: '1px solid rgba(202,138,4,0.3)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--warn,#CA8A04)', marginBottom: 3 }}>📌 VISITA PREVISTA</div>
            <div className="t-caption" style={{ lineHeight: 1.5 }}>
              Cadastro aberto por antecipação. Quando a visita acontecer, complete com o assunto, quem veio de fato e a pauta.
            </div>
            <button onClick={onCompletar} className="btn btn-primary btn-block" style={{ marginTop: 10, height: 44 }}>
              ✓ Aconteceu — completar registro
            </button>
          </div>
        )}
        {empresas.map(emp => (
          <div key={emp.id}>
            <div className="t-micro" style={{ marginBottom: 6 }}>🏢 {emp.nome.toUpperCase()}</div>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              {(emp.pessoas || []).length === 0 ? (
                <div style={{ padding: '14px', color: 'var(--text-3)', fontSize: 13 }}>
                  Nenhuma pessoa registrada
                </div>
              ) : emp.pessoas.map((p, i) => (
                <div key={p.id} style={{
                  padding: '12px 14px',
                  borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 999,
                    background: 'var(--primary-tint)', color: 'var(--primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 800, flexShrink: 0,
                  }}>
                    {p.nome.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{p.nome}</div>
                    {p.cargo && <div className="t-caption">{p.cargo}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {visita.ata_url && (
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>ATA DA REUNIÃO</div>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '0.5px solid var(--border)', padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ width: 20, height: 20, color: 'var(--danger)', flexShrink: 0 }}>{Icon.pdf}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)',
                               overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {visita.ata_nome || 'Ata da reunião'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={visita.ata_url} target="_blank" rel="noreferrer"
                   style={{ flex: 1, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', gap: 7, textDecoration: 'none', fontSize: 13.5, fontWeight: 800,
                            background: 'var(--primary)', color: '#fff' }}>
                  <span style={{ width: 15, height: 15 }}>{Icon.eye}</span> Visualizar
                </a>
                <button onClick={() => baixarArquivo(visita.ata_url, visita.ata_nome, 'ata.pdf')}
                   style={{ flex: 1, height: 42, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                            fontSize: 13.5, fontWeight: 800, border: '1.5px solid var(--border)',
                            background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                  <span style={{ width: 15, height: 15 }}>{Icon.download}</span> Baixar
                </button>
              </div>
            </div>
          </div>
        )}

        {itens.length > 0 && (
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>PAUTAS / ITENS</div>
            <div style={{ background: 'var(--surface)', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
              {itens.map((it, i) => (
                <div key={it.id} style={{
                  padding: '12px 14px',
                  borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                  display: 'flex', gap: 10,
                }}>
                  <span style={{ color: 'var(--primary)', fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
                  <div style={{ fontSize: 14, color: 'var(--text-1)', lineHeight: 1.5 }}>{it.texto}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onEdit}>
            <span style={{ width: 15, height: 15 }}>{Icon.edit}</span> Editar
          </button>
          {!confirm ? (
            <button className="btn" style={{ flex: 1, background: 'var(--danger-tint)', color: 'var(--danger)', border: 0 }} onClick={() => setConfirm(true)}>
              Excluir
            </button>
          ) : (
            <button className="btn" style={{ flex: 1, background: 'var(--danger)', color: '#fff', border: 0 }} onClick={onDelete}>
              Confirmar exclusão
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WIZARD PASSO A PASSO
// ═══════════════════════════════════════════════════════════════════════════

function VisitaWizard({ initial, onClose }) {
  const isEdit = !!initial?.id;

  const [tipos,   setTipos]   = useState(initial?._tipos ? initial._tipos.slice() : []);
  const [step,    setStep]    = useState(0);
  const [data,    setData]    = useState(initial?.data    || todayStr());
  const [assunto,  setAssunto] = useState(initial?.assunto || '');
  const [empresas, setEmpresas] = useState(
    initial?.empresas?.map(e => ({ ...e, pessoas: e.pessoas || [] })) || []
  );
  const [itens,   setItens]  = useState(initial?.itens || []);
  const [ata,     setAta]    = useState(() =>
    initial?.ata_url ? { url: initial.ata_url, nome: initial.ata_nome || 'Ata' } : null);
  // Previsão: cadastro aberto antes da visita acontecer. Quem completa o
  // registro depois entra com prevista já desligada (botão "Aconteceu").
  const [prevista, setPrevista] = useState(!!initial?.prevista);
  const [saving,  setSaving] = useState(false);

  const [dirEmpresas, setDirEmpresas] = useState([]);
  const [dirPessoas,  setDirPessoas]  = useState([]);

  useEffect(() => {
    supabase.from('visitas_dir_empresas').select('nome').order('nome')
      .then(({ data }) => setDirEmpresas((data || []).map(r => r.nome)));
    supabase.from('visitas_dir_pessoas').select('empresa_nome,nome,cargo').order('nome')
      .then(({ data }) => setDirPessoas(data || []));
  }, []);

  // ── Mapeamento de passos ──
  // 0 = tipo | 1 = data | 2 = assunto | 3 = empresas | 4..3+n = pessoas[i] | 4+n = itens | 5+n = resumo
  const n = empresas.length;
  const totalSteps = 6 + n; // tipo + data + assunto + empresas + n*pessoas + itens + resumo

  function stepInfo() {
    if (step === 0) return { type: 'tipo' };
    if (step === 1) return { type: 'data' };
    if (step === 2) return { type: 'assunto' };
    if (step === 3) return { type: 'empresas' };
    if (step >= 4 && step < 4 + n) return { type: 'pessoas', emp: empresas[step - 4], empIdx: step - 4 };
    if (step === 4 + n) return { type: 'itens' };
    return { type: 'resumo' };
  }
  const current = stepInfo();

  function next() { setStep(s => s + 1); }
  function back() { step > 0 ? setStep(s => s - 1) : onClose(false); }

  function addPessoa(empId, nome, cargo) {
    setEmpresas(prev => prev.map(e =>
      e.id === empId ? { ...e, pessoas: [...e.pessoas, { id: uid(), nome, cargo }] } : e
    ));
  }
  function removePessoa(empId, pid) {
    setEmpresas(prev => prev.map(e =>
      e.id === empId ? { ...e, pessoas: e.pessoas.filter(p => p.id !== pid) } : e
    ));
  }

  async function salvar() {
    setSaving(true);
    const payload = {
      data, assunto: assunto.trim() || null,
      empresas, itens: itens.filter(it => it.texto.trim()),
      ata_url: ata?.url || null, ata_nome: ata?.nome || null,
      prevista,
    };
    if (isEdit) {
      const wasV = (initial._tipos || []).includes('visita');
      const wasR = (initial._tipos || []).includes('reuniao');
      const isV  = tipos.includes('visita');
      const isR  = tipos.includes('reuniao');
      const grupoId = initial.grupo_id;
      const ops = [];
      if (wasV && isV)        ops.push(supabase.from('visitas').update(payload).eq('id', initial._visita_id));
      else if (wasV && !isV)  ops.push(supabase.from('visitas').delete().eq('id', initial._visita_id));
      else if (!wasV && isV)  ops.push(supabase.from('visitas').insert({ ...payload, grupo_id: grupoId }));
      if (wasR && isR)        ops.push(supabase.from('reunioes').update(payload).eq('id', initial._reuniao_id));
      else if (wasR && !isR)  ops.push(supabase.from('reunioes').delete().eq('id', initial._reuniao_id));
      else if (!wasR && isR)  ops.push(supabase.from('reunioes').insert({ ...payload, grupo_id: grupoId }));
      await Promise.all(ops);
    } else {
      const grupoId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : uid();
      const ops = [];
      if (tipos.includes('visita'))  ops.push(supabase.from('visitas').insert({ ...payload, grupo_id: grupoId }));
      if (tipos.includes('reuniao')) ops.push(supabase.from('reunioes').insert({ ...payload, grupo_id: grupoId }));
      await Promise.all(ops);
    }
    for (const emp of empresas) {
      await supabase.from('visitas_dir_empresas')
        .upsert({ nome: emp.nome }, { onConflict: 'nome', ignoreDuplicates: true });
      for (const p of emp.pessoas) {
        await supabase.from('visitas_dir_pessoas')
          .upsert({ empresa_nome: emp.nome, nome: p.nome, cargo: p.cargo || null }, { onConflict: 'empresa_nome,nome' });
      }
    }
    setSaving(false);
    onClose(true);
  }

  const pct = Math.round((step / (totalSteps - 1)) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 0 12px' }}>

      {/* Cabeçalho do wizard */}
      <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <button
            onClick={back}
            style={{
              width: 32, height: 32, border: 0, borderRadius: 8, flexShrink: 0,
              background: 'var(--surface-2)', color: 'var(--text-3)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
          </button>

          {/* Barra de progresso */}
          <div style={{ flex: 1, height: 5, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: 'var(--primary)', borderRadius: 99,
              transition: 'width 0.35s ease',
            }} />
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', minWidth: 36, textAlign: 'right' }}>
            {step + 1}/{totalSteps}
          </div>
        </div>
      </div>

      {/* Conteúdo do passo */}
      <div style={{ flex: 1, padding: '4px 16px 0', overflowY: 'auto' }}>
        {current.type === 'tipo' && (
          <StepTipo tipos={tipos} onChange={setTipos} onNext={next} />
        )}
        {current.type === 'data' && (
          <StepData data={data} onChange={setData} onNext={next}
            prevista={prevista} setPrevista={setPrevista} />
        )}
        {current.type === 'assunto' && (
          <StepAssunto assunto={assunto} onChange={setAssunto} onNext={next} />
        )}
        {current.type === 'empresas' && (
          <StepEmpresas
            empresas={empresas}
            setEmpresas={setEmpresas}
            dirEmpresas={dirEmpresas}
            onNext={next}
          />
        )}
        {current.type === 'pessoas' && (
          <StepPessoas
            empresa={current.emp}
            dirPessoas={dirPessoas.filter(p => p.empresa_nome === current.emp.nome)}
            onAddPessoa={(nome, cargo) => addPessoa(current.emp.id, nome, cargo)}
            onRemovePessoa={(pid) => removePessoa(current.emp.id, pid)}
            isLast={current.empIdx === n - 1}
            empIdx={current.empIdx}
            totalEmps={n}
            onNext={next}
          />
        )}
        {current.type === 'itens' && (
          <StepItens itens={itens} setItens={setItens} ata={ata} setAta={setAta}
                     grupoId={isEdit ? initial.grupo_id : null} onNext={next} />
        )}
        {current.type === 'resumo' && (
          <StepResumo
            data={data} assunto={assunto}
            empresas={empresas} itens={itens} prevista={prevista}
            saving={saving} onSave={salvar} isEdit={isEdit}
          />
        )}
      </div>
    </div>
  );
}

// ── Passo 0 — Data ────────────────────────────────────────────────────────


// ── Step Tipo (Visita, Reunião ou ambos) ──────────────────────────────────
function StepTipo({ tipos, onChange, onNext }) {
  const options = [
    { key: 'visita',  label: 'Visita',  icon: '🚶', color: 'var(--primary)',
      desc: 'Visita ao canteiro de obra (cliente, fiscalização, projetistas).' },
    { key: 'reuniao', label: 'Reunião', icon: '👥', color: '#1B4F88',
      desc: 'Reunião formal (com pauta, cliente ou parceiros).' },
  ];
  const toggle = (key) => {
    if (tipos.includes(key)) onChange(tipos.filter(k => k !== key));
    else onChange([...tipos, key]);
  };
  return (
    <div>
      <div className="t-micro" style={{ marginBottom: 8 }}>TIPO DE REGISTRO</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, color: 'var(--text-1)' }}>É visita, reunião, ou os dois?</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>Toque pra marcar um ou os dois.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map(opt => {
          const selected = tipos.includes(opt.key);
          return (
            <button key={opt.key} onClick={() => toggle(opt.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 16px', borderRadius: 14,
                border: selected ? `2px solid ${opt.color}` : '1.5px solid var(--border)',
                background: selected ? opt.color + '14' : 'var(--surface)',
                cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
              }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6,
                border: selected ? 'none' : '1.5px solid var(--border)',
                background: selected ? opt.color : 'transparent',
                color: '#fff', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 14,
              }}>{selected ? '✓' : ''}</span>
              <span style={{ fontSize: 26, lineHeight: 1 }}>{opt.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: selected ? opt.color : 'var(--text-1)' }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{opt.desc}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ marginTop: 18 }}>
        <button onClick={onNext} disabled={tipos.length === 0}
          style={{
            width: '100%', height: 48, borderRadius: 12, border: 'none',
            background: tipos.length === 0 ? 'var(--surface-2)' : 'var(--primary)',
            color: tipos.length === 0 ? 'var(--text-3)' : '#fff',
            fontSize: 15, fontWeight: 800,
            cursor: tipos.length === 0 ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
          }}>
          Próximo →
        </button>
      </div>
    </div>
  );
}

function StepData({ data, onChange, onNext, prevista, setPrevista }) {
  return (
    <div className="stack stack-3">
      <div>
        <div style={{ fontSize: 20, marginBottom: 2 }}>📅</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
          Qual a data da visita?
        </div>
        <div className="t-caption">Pode ser retroativa, hoje — ou futura, para agendar uma previsão.</div>
      </div>
      <input
        type="date"
        className="input"
        style={{ fontSize: 17, height: 54 }}
        value={data}
        onChange={e => {
          onChange(e.target.value);
          // Data futura é previsão por definição; o toque abaixo desfaz se
          // for o caso raro de registro adiantado.
          if (e.target.value > todayStr()) setPrevista(true);
        }}
      />
      <button
        onClick={() => setPrevista(v => !v)}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 14px', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit',
          border: prevista ? '1.5px solid var(--warn,#CA8A04)' : '1.5px solid var(--border)',
          background: prevista ? 'var(--warn-tint,rgba(202,138,4,0.10))' : 'var(--surface-2)',
        }}>
        <span style={{ fontSize: 18 }}>📌</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 14, fontWeight: 800, color: prevista ? 'var(--warn,#CA8A04)' : 'var(--text-1)' }}>
            {prevista ? 'Visita prevista — ainda vai acontecer' : 'Marcar como previsão'}
          </span>
          <span className="t-caption" style={{ display: 'block', marginTop: 2 }}>
            Registre a empresa e quem vem; o resto você completa quando acontecer.
          </span>
        </span>
        <span style={{
          width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 13, fontWeight: 900,
          border: prevista ? 'none' : '2px solid var(--text-3)',
          background: prevista ? 'var(--warn,#CA8A04)' : 'transparent', color: '#fff',
        }}>{prevista ? '✓' : ''}</span>
      </button>
      <button
        className="btn btn-primary"
        style={{ width: '100%', height: 52, fontSize: 15 }}
        onClick={onNext}
      >
        Próximo →
      </button>
    </div>
  );
}

// ── Passo 1 — Assunto ─────────────────────────────────────────────────────
function StepAssunto({ assunto, onChange, onNext }) {
  const ref = useRef();
  useEffect(() => { setTimeout(() => ref.current?.focus(), 200); }, []);

  return (
    <div className="stack stack-3">
      <div>
        <div style={{ fontSize: 20, marginBottom: 2 }}>📝</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
          Qual o assunto da visita?
        </div>
        <div className="t-caption">Ex: Vistoria de estrutura, reunião de progresso…</div>
      </div>
      <input
        ref={ref}
        className="input"
        style={{ fontSize: 16, height: 54 }}
        placeholder="Descreva o assunto…"
        value={assunto}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onNext(); }}
      />
      <div>
        <BotaoDitar titulo="Ditar o assunto da visita"
          onTexto={t => onChange(juntarDitado(assunto, t))} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          className="btn btn-secondary"
          style={{ flex: 1, height: 50 }}
          onClick={onNext}
        >
          Pular
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 2, height: 50, fontSize: 15 }}
          onClick={onNext}
        >
          Próximo →
        </button>
      </div>
    </div>
  );
}

// ── Passo 2 — Empresas ────────────────────────────────────────────────────
function StepEmpresas({ empresas, setEmpresas, dirEmpresas, onNext }) {
  const [input,       setInput]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const inputRef = useRef();

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 200); }, []);

  function onInputChange(v) {
    setInput(v);
    setSuggestions(
      v.trim()
        ? dirEmpresas.filter(e =>
            contem(e, v) &&
            !empresas.find(x => x.nome.toLowerCase() === e.toLowerCase())
          )
        : []
    );
  }

  function add(nome) {
    const n = nome.trim();
    if (!n || empresas.find(e => e.nome.toLowerCase() === n.toLowerCase())) return;
    setEmpresas(prev => [...prev, { id: uid(), nome: n, pessoas: [] }]);
    setInput('');
    setSuggestions([]);
    inputRef.current?.focus();
  }

  function remove(id) {
    setEmpresas(prev => prev.filter(e => e.id !== id));
  }

  // Empresas do diretório ainda não adicionadas
  const disponiveis = dirEmpresas.filter(
    e => !empresas.find(x => x.nome.toLowerCase() === e.toLowerCase())
  );

  return (
    <div className="stack stack-3">
      <div>
        <div style={{ fontSize: 20, marginBottom: 2 }}>🏢</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
          Quais empresas estiveram presentes?
        </div>
        <div className="t-caption">Adicione uma ou mais empresas.</div>
      </div>

      {/* Chips de empresas já cadastradas */}
      {disponiveis.length > 0 && (
        <div>
          <div className="t-micro" style={{ marginBottom: 8 }}>CADASTRADAS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {disponiveis.map(nome => (
              <button
                key={nome}
                onClick={() => add(nome)}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                🏢 {nome}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Empresas adicionadas */}
      {empresas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {empresas.map((emp) => (
            <div key={emp.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 12,
              background: 'var(--primary-tint)',
              border: '1.5px solid var(--primary)',
            }}>
              <span style={{ fontSize: 16 }}>🏢</span>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
                {emp.nome}
              </div>
              <button
                onClick={() => remove(emp.id)}
                style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}
              >
                <span style={{ width: 16, height: 16, display: 'block' }}>{Icon.x}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input nova empresa */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={inputRef}
            className="input"
            style={{ flex: 1, fontSize: 15 }}
            placeholder="Nome da empresa…"
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { add(input); e.preventDefault(); } }}
          />
          <button
            onClick={() => add(input)}
            disabled={!input.trim()}
            style={{
              width: 50, height: 48, borderRadius: 12, border: 'none', flexShrink: 0,
              background: input.trim() ? 'var(--primary)' : 'var(--surface-2)',
              color: input.trim() ? '#fff' : 'var(--text-3)',
              fontSize: 24, cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >+</button>
        </div>

        {suggestions.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            marginTop: 4, background: 'var(--surface)',
            border: '0.5px solid var(--border)', borderRadius: 12, overflow: 'hidden',
            boxShadow: '0 8px 24px rgba(0,0,0,0.13)',
          }}>
            {suggestions.map(s => (
              <button
                key={s} onClick={() => add(s)}
                style={{
                  display: 'block', width: '100%', padding: '12px 14px', textAlign: 'left',
                  border: 'none', background: 'none', fontSize: 14, fontWeight: 600,
                  color: 'var(--text-1)', cursor: 'pointer',
                  borderBottom: '0.5px solid var(--border)',
                }}
              >
                🏢 {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        className="btn btn-primary"
        style={{ width: '100%', height: 52, fontSize: 15 }}
        disabled={empresas.length === 0}
        onClick={onNext}
      >
        {empresas.length === 0
          ? 'Adicione pelo menos uma empresa'
          : `Continuar com ${empresas.length} ${empresas.length === 1 ? 'empresa' : 'empresas'} →`}
      </button>
    </div>
  );
}

// ── Passo 3..N — Pessoas por empresa ─────────────────────────────────────
function StepPessoas({ empresa, dirPessoas, onAddPessoa, onRemovePessoa, isLast, empIdx, totalEmps, onNext }) {
  const [nomeInput,   setNomeInput]   = useState('');
  const [cargoInput,  setCargoInput]  = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const nomeRef = useRef();

  useEffect(() => {
    setNomeInput(''); setCargoInput(''); setSuggestions([]);
    setTimeout(() => nomeRef.current?.focus(), 200);
  }, [empresa.id]);

  // Pessoas desta empresa no diretório ainda não adicionadas
  const pessoasDaEmpresa = dirPessoas.filter(
    p => p.empresa_nome?.toLowerCase() === empresa.nome.toLowerCase() &&
         !empresa.pessoas.find(x => x.nome.toLowerCase() === p.nome.toLowerCase())
  );

  function onNomeChange(v) {
    setNomeInput(v);
    setSuggestions(
      v.trim()
        ? dirPessoas.filter(p =>
            contem(p.nome, v) &&
            !empresa.pessoas.find(x => x.nome.toLowerCase() === p.nome.toLowerCase())
          ).slice(0, 5)
        : []
    );
  }

  function selectSuggestion(p) {
    setNomeInput(p.nome);
    setCargoInput(p.cargo || '');
    setSuggestions([]);
    nomeRef.current?.focus();
  }

  function handleAdd() {
    const n = nomeInput.trim();
    if (!n) return;
    onAddPessoa(n, cargoInput.trim());
    setNomeInput('');
    setCargoInput('');
    setSuggestions([]);
    nomeRef.current?.focus();
  }

  function addFromDir(p) {
    onAddPessoa(p.nome, p.cargo || '');
  }

  return (
    <div className="stack stack-3">
      <div>
        <div style={{ fontSize: 20, marginBottom: 2 }}>👥</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
          Quem veio da <span style={{ color: 'var(--primary)' }}>{empresa.nome}</span>?
        </div>
        {totalEmps > 1 && (
          <div className="t-caption">
            Empresa {empIdx + 1} de {totalEmps}
          </div>
        )}
      </div>

      {/* Chips de pessoas cadastradas nesta empresa */}
      {pessoasDaEmpresa.length > 0 && (
        <div>
          <div className="t-micro" style={{ marginBottom: 8 }}>CADASTRADAS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {pessoasDaEmpresa.map(p => (
              <button
                key={p.nome}
                onClick={() => addFromDir(p)}
                style={{
                  padding: '8px 14px', borderRadius: 999,
                  border: '1.5px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: 13, fontWeight: 700, color: 'var(--text-1)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  textAlign: 'left',
                }}
              >
                <div style={{ width: 26, height: 26, borderRadius: 999, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {p.nome.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div>{p.nome}</div>
                  {p.cargo && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)' }}>{p.cargo}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Pessoas adicionadas */}
      {empresa.pessoas.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
          {empresa.pessoas.map((p, i) => (
            <div key={p.id} style={{
              padding: '10px 14px',
              borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 999,
                background: 'var(--primary-tint)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 800, flexShrink: 0,
              }}>
                {p.nome.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{p.nome}</div>
                {p.cargo && <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{p.cargo}</div>}
              </div>
              <button onClick={() => onRemovePessoa(p.id)} style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4 }}>
                <span style={{ width: 14, height: 14, display: 'block' }}>{Icon.x}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Inputs nova pessoa */}
      <div style={{ position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div style={{ position: 'relative' }}>
            <input
              ref={nomeRef}
              className="input"
              style={{ fontSize: 14 }}
              placeholder="Nome da pessoa"
              value={nomeInput}
              onChange={e => onNomeChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
            />
            {suggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
                marginTop: 2, background: 'var(--surface)',
                border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden',
                boxShadow: '0 6px 20px rgba(0,0,0,0.13)',
              }}>
                {suggestions.map(s => (
                  <button key={s.nome} onClick={() => selectSuggestion(s)}
                    style={{
                      display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left',
                      border: 'none', background: 'none', fontSize: 13, color: 'var(--text-1)', cursor: 'pointer',
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{s.nome}</span>
                    {s.cargo && <span style={{ color: 'var(--text-3)' }}> — {s.cargo}</span>}
       
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            className="input"
            style={{ fontSize: 14 }}
            placeholder="Cargo (opcional)"
            value={cargoInput}
            onChange={e => setCargoInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          />
        </div>
        <button
          onClick={handleAdd}
          disabled={!nomeInput.trim()}
          style={{
            width: '100%', height: 42, borderRadius: 10, border: 'none',
            background: nomeInput.trim() ? 'var(--primary-tint)' : 'var(--surface-2)',
            color: nomeInput.trim() ? 'var(--primary)' : 'var(--text-3)',
            fontSize: 13, fontWeight: 800,
            cursor: nomeInput.trim() ? 'pointer' : 'default',
          }}
        >
          + Adicionar pessoa
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-secondary" style={{ flex: 1, height: 50 }} onClick={onNext}>
          Pular
        </button>
        <button className="btn btn-primary" style={{ flex: 2, height: 50, fontSize: 14 }} onClick={onNext}>
          {isLast ? 'Continuar →' : `Próxima empresa →`}
        </button>
      </div>
    </div>
  );
}

// ── Passo N+1 — Itens de pauta ──────────────────────────────────────────────
function StepItens({ itens, setItens, ata, setAta, grupoId, onNext }) {
  const [input, setInput] = useState('');
  const [subindo, setSubindo] = useState(false);
  const inputRef = useRef();
  const fileRef = useRef();

  // A ata fica no bucket 'fotos', mesma pasta usada pelos anexos de pedido.
  async function anexarAta(file) {
    if (!file) return;
    setSubindo(true);
    let enviado;
    try {
      enviado = await enviarArquivo(file, 'atas');
    } catch (err) {
      setSubindo(false);
      avisarErro(err, 'anexar o arquivo');
      return;
    }
    setSubindo(false);
    const nova = { url: enviado.url, nome: enviado.nome };
    setAta(nova);
    // Num registro que já existe, grava na hora. O arquivo sobe instantaneamente e
    // isso passa a sensação de "pronto" — se o vínculo só fosse gravado ao fim do
    // assistente, quem fecha antes perde a ata sem perceber. Foi o que aconteceu.
    await persistir(nova);
  }

  // Grava (ou apaga) o vínculo direto nas duas tabelas do encontro.
  async function persistir(valor) {
    if (!grupoId) return;
    const patch = { ata_url: valor?.url || null, ata_nome: valor?.nome || null };
    const [rv, rr] = await Promise.all([
      supabase.from('visitas').update(patch).eq('grupo_id', grupoId),
      supabase.from('reunioes').update(patch).eq('grupo_id', grupoId),
    ]);
    const err = rv.error || rr.error;
    if (err) window.alert('O arquivo subiu, mas não ficou ligado a esta visita. ' + motivoAmigavel(err));
  }

  async function removerAta() {
    setAta(null);
    await persistir(null);
  }

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 200); }, []);

  function add() {
    const t = input.trim();
    if (!t) return;
    setItens(prev => [...prev, { id: uid(), texto: t }]);
    setInput('');
    inputRef.current?.focus();
  }

  function remove(id) {
    setItens(prev => prev.filter(it => it.id !== id));
  }

  return (
    <div className="stack stack-3">
      <div>
        <div style={{ fontSize: 20, marginBottom: 2 }}>📋</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
          Houve itens de pauta?
        </div>
        <div className="t-caption">Registre os assuntos discutidos. Opcional.</div>
      </div>

      {/* Ata em PDF anexada no próprio registro: fica salva junto da reunião,
          em vez de virar mais um arquivo solto no e-mail. */}
      <div>
        <div className="t-micro" style={{ marginBottom: 6 }}>ATA DA REUNIÃO (PDF)</div>
        {ata ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', borderRadius: 12,
                        background: 'var(--surface)', border: '0.5px solid var(--border)' }}>
            <span style={{ width: 20, height: 20, color: 'var(--danger)', flexShrink: 0 }}>{Icon.pdf}</span>
            <a href={ata.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
               style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--primary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ata.nome}</a>
            <button onClick={removerAta} title="Remover"
              style={{ width: 30, height: 30, border: 0, borderRadius: 8, background: 'transparent',
                       color: 'var(--danger)', cursor: 'pointer', fontSize: 16, flexShrink: 0 }}>✕</button>
          </div>
        ) : (
          <>
            <input ref={fileRef} type="file" accept="application/pdf,image/*" hidden
                   onChange={e => { anexarAta(e.target.files?.[0]); e.target.value = ''; }} />
            <button onClick={() => fileRef.current?.click()} disabled={subindo}
              style={{ width: '100%', height: 48, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                       border: '1.5px dashed var(--border)', background: 'var(--surface-2)',
                       color: 'var(--text-2)', fontSize: 14, fontWeight: 700 }}>
              {subindo ? 'Enviando…' : '📎 Anexar ata em PDF'}
            </button>
          </>
        )}
      </div>

      {itens.length > 0 && (
        <div style={{ background: 'var(--surface)', borderRadius: 14, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
          {itens.map((it, i) => (
            <div key={it.id} style={{
              padding: '12px 14px',
              borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
              display: 'flex', gap: 10, alignItems: 'flex-start',
            }}>
              <span style={{ color: 'var(--primary)', fontWeight: 800, minWidth: 20, marginTop: 1 }}>{i + 1}.</span>
              <div style={{ flex: 1, fontSize: 14, color: 'var(--text-1)' }}>{it.texto}</div>
              <button onClick={() => remove(it.id)} style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                <span style={{ width: 14, height: 14, display: 'block' }}>{Icon.x}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          ref={inputRef}
          className="input"
          style={{ flex: 1, fontSize: 14 }}
          placeholder="Descreva o item…"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { add(); e.preventDefault(); } }}
        />
        <BotaoDitar titulo="Ditar o tópico" style={{ height: 48, borderRadius: 12, flexShrink: 0 }}
          onTexto={t => setInput(v => juntarDitado(v, t))} />
        <button
          onClick={add}
          disabled={!input.trim()}
          style={{
            width: 50, height: 48, borderRadius: 12, border: 'none', flexShrink: 0,
            background: input.trim() ? 'var(--primary)' : 'var(--surface-2)',
            color: input.trim() ? '#fff' : 'var(--text-3)',
            fontSize: 24, cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >+</button>
      </div>

      <button className="btn btn-primary" style={{ width: '100%', height: 50, fontSize: 15 }} onClick={onNext}>
        {itens.length === 0 ? 'Registrar visita →' : `Continuar com ${itens.length} ${itens.length === 1 ? 'item' : 'itens'} →`}
      </button>
    </div>
  );
}

// ── Passo final — Resumo ──────────────────────────────────────────────
function StepResumo({ data, assunto, empresas, itens, prevista, saving, onSave, isEdit }) {
  const totalPessoas = empresas.reduce((s, e) => s + (e.pessoas?.length || 0), 0);

  return (
    <div className="stack stack-3">
      <div>
        <div style={{ fontSize: 20, marginBottom: 2 }}>{prevista ? '📌' : '✅'}</div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2, marginBottom: 4 }}>
          {prevista ? 'Previsão pronta!' : 'Tudo pronto!'}
        </div>
        <div className="t-caption">
          {prevista
            ? 'Quando a visita acontecer, abra o registro e toque em "Aconteceu" para completar.'
            : 'Confira o resumo antes de salvar.'}
        </div>
      </div>

      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '0.5px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '14px', borderBottom: '0.5px solid var(--border)', display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>📅</span>
          <div>
            <div className="t-micro" style={{ marginBottom: 2 }}>DATA</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{fmtDateLong(data)}</div>
          </div>
        </div>

        {assunto && (
          <div style={{ padding: '14px', borderBottom: '0.5px solid var(--border)', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📝</span>
            <div>
              <div className="t-micro" style={{ marginBottom: 2 }}>ASSUNTO</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{assunto}</div>
            </div>
          </div>
        )}

        <div style={{ padding: '14px', borderBottom: itens.length > 0 ? '0.5px solid var(--border)' : 'none', display: 'flex', gap: 12 }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>🏢</span>
          <div style={{ flex: 1 }}>
            <div className="t-micro" style={{ marginBottom: 6 }}>
              EMPRESAS · {totalPessoas} {totalPessoas === 1 ? 'PESSOA' : 'PESSOAS'}
            </div>
            {empresas.map(emp => (
              <div key={emp.id} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 3 }}>{emp.nome}</div>
                {emp.pessoas.map(p => (
                  <div key={p.id} style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, paddingLeft: 8 }}>
                    • {p.nome}{p.cargo ? ` — ${p.cargo}` : ''}
                  </div>
                ))}
                {emp.pessoas.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', paddingLeft: 8 }}>Sem pessoas registradas</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {itens.length > 0 && (
          <div style={{ padding: '14px', display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 20, flexShrink: 0 }}>📋</span>
            <div>
              <div className="t-micro" style={{ marginBottom: 6 }}>PAUTAS</div>
              {itens.map((it, i) => (
                <div key={it.id} style={{ fontSize: 13, color: 'var(--text-1)', marginBottom: 4 }}>
                    {i + 1}. {it.texto}
                  </div>
                ))}
              </div>
          </div>
        )}
      </div>

      <button
        className="btn btn-primary btn-block"
        style={{ height: 50, fontSize: 16, fontWeight: 800 }}
        onClick={onSave}
        disabled={saving}
      >
        {saving ? 'Salvando…' : prevista ? '📌 Salvar previsão' : isEdit ? 'Salvar alterações' : 'Registrar visita'}
      </button>
    </div>
  );
}

// ── Calendário de Visitas (Desktop) ───────────────────────────────────────
const DIAS_CAL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];


// ── Popup de detalhe (desktop) ────────────────────────────────────────────
function VisitaDetailPopup({ visita, onClose, onEdit, onDelete, onCompletar }) {
  const empresas = Array.isArray(visita.empresas) ? visita.empresas : [];
  const itens    = Array.isArray(visita.itens)    ? visita.itens    : [];
  const [confirm, setConfirm] = useState(false);

  // Fechar com ESC
  useEffect(() => {
    const fn = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const totalPessoas = empresas.reduce((s, e) => s + (e.pessoas?.length || 0), 0);

  return (
    <>
      {/* Overlay */}
      <div style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 200, backdropFilter: 'blur(2px)',
      }} />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        width: 'min(560px, 92vw)',
        maxHeight: '82vh',
        background: 'var(--surface)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.22)',
        zIndex: 201,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* Header do popup */}
        <div style={{
          padding: '18px 20px 14px',
          borderBottom: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
              letterSpacing: '0.06em', marginBottom: 4 }}>
              {fmtDateLong(visita.data).toUpperCase()}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.2 }}>
              {visita.assunto || 'Visita à obra'}
            </div>
            {totalPessoas > 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginTop: 4 }}>
                👥 {totalPessoas} {totalPessoas === 1 ? 'pessoa' : 'pessoas'}
                {empresas.length > 0 && <> · 🏢 {empresas.map(e => e.nome).join(', ')}</>}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8, border: 'none',
            background: 'var(--surface-2)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-3)', fontSize: 18, flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Conteúdo com scroll */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>

          {visita.prevista && (
            <div style={{ background: 'var(--warn-tint,rgba(202,138,4,0.10))', border: '1px solid rgba(202,138,4,0.3)', borderRadius: 12, padding: '12px 14px', marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--warn,#CA8A04)', marginBottom: 3 }}>📌 VISITA PREVISTA</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
                Cadastro aberto por antecipação. Quando acontecer, complete com o assunto, quem veio de fato e a pauta.
              </div>
              <button onClick={onCompletar} className="btn btn-primary btn-block" style={{ marginTop: 10, height: 42 }}>
                ✓ Aconteceu — completar registro
              </button>
            </div>
          )}

          {/* Empresas e pessoas */}
          {empresas.map(emp => (
            <div key={emp.id} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.06em', marginBottom: 8 }}>
                🏢 {emp.nome.toUpperCase()}
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 12,
                border: '0.5px solid var(--border)', overflow: 'hidden' }}>
                {(emp.pessoas || []).length === 0 ? (
                  <div style={{ padding: '12px 14px', color: 'var(--text-3)', fontSize: 13 }}>
                    Nenhuma pessoa registrada
                  </div>
                ) : emp.pessoas.map((p, i) => (
                  <div key={p.id} style={{
                    padding: '10px 14px',
                    borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                    display: 'flex', alignItems: 'center', gap: 10,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 999,
                      background: 'var(--primary-tint)', color: 'var(--primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 800, flexShrink: 0,
                    }}>
                      {p.nome.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{p.nome}</div>
                      {p.cargo && <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{p.cargo}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Ata anexada */}
          {visita.ata_url && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.06em', marginBottom: 8 }}>
                ATA DA REUNIÃO
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <span style={{ width: 20, height: 20, color: 'var(--danger)', flexShrink: 0 }}>{Icon.pdf}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-1)',
                                 overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {visita.ata_nome || 'Ata da reunião'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={visita.ata_url} target="_blank" rel="noreferrer"
                     style={{ flex: 1, height: 42, borderRadius: 11, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', gap: 7, textDecoration: 'none', fontSize: 13.5,
                              fontWeight: 800, background: 'var(--primary)', color: '#fff' }}>
                    <span style={{ width: 15, height: 15 }}>{Icon.eye}</span> Visualizar
                  </a>
                  <button onClick={() => baixarArquivo(visita.ata_url, visita.ata_nome, 'ata.pdf')}
                     style={{ flex: 1, height: 42, borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                              fontSize: 13.5, fontWeight: 800, border: '1.5px solid var(--border)',
                              background: 'var(--surface)', color: 'var(--text-2)' }}>
                    <span style={{ width: 15, height: 15 }}>{Icon.download}</span> Baixar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Itens de pauta */}
          {itens.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)',
                letterSpacing: '0.06em', marginBottom: 8 }}>
                PAUTAS / ITENS
              </div>
              <div style={{ background: 'var(--surface-2)', borderRadius: 12,
                border: '0.5px solid var(--border)', overflow: 'hidden' }}>
                {itens.map((it, i) => (
                  <div key={it.id} style={{
                    padding: '11px 14px',
                    borderTop: i > 0 ? '0.5px solid var(--border)' : 'none',
                    display: 'flex', gap: 10,
                  }}>
                    <span style={{ color: 'var(--primary)', fontWeight: 800, flexShrink: 0, fontSize: 13 }}>
                      {i + 1}.
                    </span>
                    <div style={{ fontSize: 13, color: 'var(--text-1)', lineHeight: 1.5 }}>{it.texto}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer com ações */}
        <div style={{
          padding: '12px 20px 16px',
          borderTop: '0.5px solid var(--border)',
          display: 'flex', gap: 8,
        }}>
          <button onClick={onEdit} style={{
            flex: 1, padding: '9px 0', borderRadius: 10, border: '0.5px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--text-1)',
            fontSize: 13, fontWeight: 800, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <span style={{ width: 14, height: 14 }}>{Icon.edit}</span> Editar
          </button>
          {!confirm ? (
            <button onClick={() => setConfirm(true)} style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
              background: 'var(--danger-tint)', color: 'var(--danger)',
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}>
              Excluir
            </button>
          ) : (
            <button onClick={onDelete} style={{
              flex: 1, padding: '9px 0', borderRadius: 10, border: 'none',
              background: 'var(--danger)', color: '#fff',
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}>
              Confirmar exclusão
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay(); // 0=Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

function toDateStr(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function VisitaCalendar({ visitas, calMonth, setCalMonth, onSelect }) {
  const { y, m } = calMonth;
  const cells = buildCalendarDays(y, m);

  // Index visitas by date string
  const byDate = {};
  visitas.forEach(v => {
    const d = v.data;
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(v);
  });

  function prevMonth() {
    setCalMonth(m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 });
  }
  function nextMonth() {
    setCalMonth(m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 });
  }

  const todayStr = hojeLocal();

  return (
    <div style={{ paddingBottom: 24 }}>
      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prevMonth} style={{ width: 36, height: 36, borderRadius: 10, border: '0.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15,18 9,12 15,6"/></svg>
        </button>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>
          {MESES[m]} {y}
        </div>
        <button onClick={nextMonth} style={{ width: 36, height: 36, borderRadius: 10, border: '0.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9,18 15,12 9,6"/></svg>
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
        {DIAS_CAL.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.04em', padding: '4px 0' }}>
            {d.toUpperCase()}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} />;
          }
          const ds = toDateStr(y, m, day);
          const visits = byDate[ds] || [];
          const isToday = ds === todayStr;
          return (
            <div key={ds} style={{
              height: 120,
              background: isToday ? 'var(--primary-tint)' : 'var(--surface)',
              border: isToday ? '1.5px solid var(--primary)' : '0.5px solid var(--border)',
              borderRadius: 10,
              padding: '6px 7px',
              display: 'flex', flexDirection: 'column', gap: 4,
              overflow: 'hidden',
            }}>
              <div style={{
                fontSize: 12, fontWeight: isToday ? 900 : 700,
                color: isToday ? 'var(--primary)' : 'var(--text-2)',
                marginBottom: visits.length > 0 ? 2 : 0,
                flexShrink: 0,
              }}>{day}</div>
              {visits.slice(0, 2).map(v => {
                const empresas = Array.isArray(v.empresas) ? v.empresas : [];
                const nomes = empresas.map(e => e.nome).join(', ');
                // Previsão fica amarela com etiqueta: no mar de vermelho do
                // calendário, o que ainda vai acontecer precisa saltar aos olhos.
                const prev = !!v.prevista;
                return (
                  <div key={v.id} onClick={() => onSelect(v)} style={{
                    background: prev ? '#CA8A04' : 'var(--primary)', borderRadius: 6, padding: '4px 7px',
                    cursor: 'pointer', transition: 'opacity 0.12s', flexShrink: 0,
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#fff', lineHeight: 1.3, marginBottom: nomes ? 1 : 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {prev && (
                        <span style={{ fontSize: 8.5, fontWeight: 900, background: 'rgba(255,255,255,0.92)', color: '#A16207', borderRadius: 4, padding: '1px 4px', marginRight: 4, letterSpacing: 0.3, verticalAlign: 'middle' }}>PREVISÃO</span>
                      )}
                      {v.assunto || (prev ? 'Visita prevista' : 'Visita')}
                    </div>
                    {nomes && (
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {nomes}
                      </div>
                    )}
                  </div>
                );
              })}
              {visits.length > 2 && (
                <div onClick={() => onSelect(visits[2])} style={{
                  fontSize: 10, fontWeight: 800, color: 'var(--primary)',
                  cursor: 'pointer', padding: '1px 2px', flexShrink: 0,
                }}>
                  +{visits.length - 2} mais
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
