import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { baixarFoto } from '../lib/foto-rdo';
import { avisarErro } from '../lib/msg-amigavel';

// Galeria das fotos do RDO. Três modos: Por dia (feed), Por pavimento e
// Por ambiente (a evolução do ambiente no tempo). Toca numa foto pra ampliar,
// baixar. (A seleção "usar no relatório" entra numa próxima leva.)

function rotuloDia(iso) {
  const [a, m, d] = String(iso || '').slice(0, 10).split('-');
  if (!d) return '';
  const dt = new Date(Number(a), Number(m) - 1, Number(d));
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diff = Math.round((hoje - dt) / 86400000);
  if (diff === 0) return `Hoje · ${d}/${m}`;
  if (diff === 1) return `Ontem · ${d}/${m}`;
  const sem = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dt.getDay()];
  return `${sem} · ${d}/${m}`;
}

const ABAS = [{ k: 'dia', l: 'Por dia' }, { k: 'pavimento', l: 'Pavimento' }, { k: 'ambiente', l: 'Ambiente' }];

export function GaleriaFotos({ goto, voltarPara = 'home' }) {
  const [fotos, setFotos] = useState(null);
  const [aba, setAba] = useState('dia');
  const [pavSel, setPavSel] = useState('');
  const [ambSel, setAmbSel] = useState('');
  const [aberta, setAberta] = useState(null);
  const [selMode, setSelMode] = useState(false);
  const [selecionadas, setSelecionadas] = useState(() => new Set());
  const [baixando, setBaixando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const toggleSel = (id) => setSelecionadas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sairSelecao = () => { setSelMode(false); setSelecionadas(new Set()); };
  const baixarSelecionadas = async () => {
    if (baixando) return;
    const alvo = (fotos || []).filter(f => selecionadas.has(f.id));
    setBaixando(true);
    for (const f of alvo) {
      const nome = ((f.legenda || 'foto').replace(/[^\wÀ-ſ]+/g, '-')) + '.jpg';
      await baixarFoto(f.url, nome);
      await new Promise(r => setTimeout(r, 350));   // espaça pro navegador não bloquear
    }
    setBaixando(false);
    sairSelecao();
  };

  // Apaga do banco E do storage: só remover a linha deixaria o arquivo
  // ocupando o bucket para sempre, sem ninguém para apontar para ele.
  const apagarSelecionadas = async () => {
    if (apagando) return;
    const alvo = (fotos || []).filter(f => selecionadas.has(f.id));
    if (!alvo.length) return;
    if (!confirm(`Apagar ${alvo.length} foto${alvo.length !== 1 ? 's' : ''}? Não dá para desfazer.`)) return;
    setApagando(true);
    const ids = alvo.map(f => f.id);
    const { error } = await supabase.from('rdo_fotos').delete().in('id', ids);
    if (error) {
      avisarErro(error, 'apagar as fotos');
      setApagando(false);
      return;
    }
    const paths = alvo.map(f => f.storage_path).filter(Boolean);
    if (paths.length) {
      const { error: stErr } = await supabase.storage.from('fotos').remove(paths);
      if (stErr) console.error('Fotos apagadas do banco, mas o arquivo ficou no storage:', stErr);
    }
    setFotos(fs => (fs || []).filter(f => !selecionadas.has(f.id)));
    setApagando(false);
    sairSelecao();
  };

  const apagarUma = async (f) => {
    if (!confirm('Apagar esta foto? Não dá para desfazer.')) return;
    const { error } = await supabase.from('rdo_fotos').delete().eq('id', f.id);
    if (error) { avisarErro(error, 'apagar a foto'); return; }
    if (f.storage_path) {
      const { error: stErr } = await supabase.storage.from('fotos').remove([f.storage_path]);
      if (stErr) console.error('Foto apagada do banco, mas o arquivo ficou no storage:', stErr);
    }
    setFotos(fs => (fs || []).filter(x => x.id !== f.id));
    setAberta(null);
  };

  useEffect(() => {
    supabase.from('rdo_fotos').select('*')
      .order('data', { ascending: false }).order('created_at', { ascending: false })
      .then(({ data }) => setFotos(data || []));
  }, []);

  const pavimentos = useMemo(() => [...new Set((fotos || []).map(f => f.pavimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [fotos]);
  const ambientes = useMemo(() => [...new Set((fotos || []).map(f => f.ambiente).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [fotos]);

  // Agrupa por dia (para o feed)
  const porDia = useMemo(() => {
    const base = aba === 'pavimento' && pavSel ? (fotos || []).filter(f => f.pavimento === pavSel) : (fotos || []);
    const map = new Map();
    for (const f of base) {
      const dia = String(f.data || '').slice(0, 10);
      if (!map.has(dia)) map.set(dia, []);
      map.get(dia).push(f);
    }
    return [...map.entries()];
  }, [fotos, aba, pavSel]);

  const doAmbiente = useMemo(() => ambSel ? (fotos || []).filter(f => f.ambiente === ambSel) : [], [fotos, ambSel]);

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        {fotos && fotos.length > 0
          ? <button onClick={() => (selMode ? sairSelecao() : setSelMode(true))} style={{ minHeight: 40, padding: '0 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-tint)', border: 0, cursor: 'pointer' }}>{selMode ? 'Cancelar' : '☑️ Selecionar'}</button>
          : <div className="t-caption" style={{ fontSize: 11 }} />}
      </div>

      <div className="page-pad" style={{ paddingTop: 6, paddingBottom: selMode ? 84 : 0 }}>
        <div style={{ fontSize: 22, fontWeight: 900, marginBottom: 12 }}>Galeria de fotos</div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          {ABAS.map(a => (
            <button key={a.k} onClick={() => setAba(a.k)} style={{ minHeight: 40, fontSize: 12, fontWeight: 800, padding: '6px 14px', borderRadius: 999, border: 0, cursor: 'pointer', background: aba === a.k ? 'var(--primary)' : 'var(--surface-2)', color: aba === a.k ? '#fff' : 'var(--text-2)' }}>{a.l}</button>
          ))}
        </div>

        {fotos === null && <div className="t-caption" style={{ textAlign: 'center', padding: 24 }}>Carregando…</div>}
        {fotos && fotos.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '28px 16px' }}>
            <div style={{ fontSize: 30, marginBottom: 8 }}>📷</div>
            <div className="t-strong">Nenhuma foto ainda</div>
            <div className="t-caption" style={{ marginTop: 6, lineHeight: 1.5 }}>Tire fotos pela camerinha nos cards do RDO: elas aparecem aqui.</div>
          </div>
        )}

        {/* Por dia (e Por pavimento usa o mesmo feed, filtrado) */}
        {fotos && fotos.length > 0 && (aba === 'dia' || aba === 'pavimento') && (
          <>
            {aba === 'pavimento' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                <ChipF on={!pavSel} onClick={() => setPavSel('')}>Todos</ChipF>
                {pavimentos.map(p => <ChipF key={p} on={pavSel === p} onClick={() => setPavSel(p)}>{p}</ChipF>)}
              </div>
            )}
            {porDia.map(([dia, lista]) => (
              <div key={dia} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', margin: '2px 2px 8px' }}>
                  <span>{rotuloDia(dia)}</span><span>{lista.length} foto{lista.length !== 1 ? 's' : ''}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
                  {lista.map(f => <Miniatura key={f.id} f={f} selMode={selMode} selected={selecionadas.has(f.id)} onClick={() => selMode ? toggleSel(f.id) : setAberta(f)} />)}
                </div>
              </div>
            ))}
          </>
        )}

        {/* Por ambiente — evolução no tempo */}
        {fotos && fotos.length > 0 && aba === 'ambiente' && (
          <>
            {!ambSel ? (
              <div className="stack stack-1">
                <div className="t-micro" style={{ marginBottom: 4 }}>ESCOLHA O AMBIENTE</div>
                {ambientes.map(a => {
                  const qtd = fotos.filter(f => f.ambiente === a).length;
                  return (
                    <button key={a} onClick={() => setAmbSel(a)} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, cursor: 'pointer', background: 'var(--surface)', borderRadius: 12, boxShadow: 'inset 0 0 0 .5px var(--border)', padding: '11px 13px', textAlign: 'left' }}>
                      <div style={{ flex: 1 }}><div className="t-strong" style={{ fontSize: 14 }}>{a}</div></div>
                      <span className="t-caption" style={{ fontSize: 11 }}>{qtd} foto{qtd !== 1 ? 's' : ''}</span>
                      <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <>
                <button onClick={() => setAmbSel('')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, minHeight: 40, padding: '6px 12px', border: 0, cursor: 'pointer', background: 'var(--surface-2)', borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                  <span style={{ width: 14, height: 14 }}>{Icon.back}</span> {ambSel} · trocar
                </button>
                <div style={{ position: 'relative', paddingLeft: 16 }}>
                  {doAmbiente.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 11, marginBottom: 12, alignItems: 'center' }}>
                      <div style={{ position: 'relative', flexShrink: 0 }} onClick={() => selMode ? toggleSel(f.id) : setAberta(f)}>
                        <img src={f.url} alt="" loading="lazy" decoding="async" style={{ width: 66, height: 66, borderRadius: 10, objectFit: 'cover', cursor: 'pointer', background: 'var(--surface-2)', display: 'block', outline: selMode && selecionadas.has(f.id) ? '2.5px solid var(--primary)' : 'none', outlineOffset: '-2px' }} />
                        {selMode && <div style={{ position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 999, background: selecionadas.has(f.id) ? 'var(--primary)' : 'rgba(255,255,255,.85)', border: '1.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 900 }}>{selecionadas.has(f.id) ? '✓' : ''}</div>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 800 }}>{rotuloDia(f.data)}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>{f.servico || '—'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {selMode && (
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', padding: '10px 14px calc(12px + env(safe-area-inset-bottom))', display: 'flex', gap: 8, alignItems: 'center', zIndex: 700 }}>
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>{selecionadas.size} selecionada{selecionadas.size !== 1 ? 's' : ''}</div>
          <button onClick={apagarSelecionadas} disabled={selecionadas.size === 0 || apagando || baixando}
            style={{ height: 44, padding: '0 14px', borderRadius: 12, border: 0, cursor: selecionadas.size ? 'pointer' : 'default', background: selecionadas.size ? 'var(--danger)' : 'var(--surface-2)', color: selecionadas.size ? '#fff' : 'var(--text-3)', fontWeight: 800, fontSize: 13 }}>
            {apagando ? 'Apagando…' : '🗑 Apagar'}
          </button>
          <button onClick={baixarSelecionadas} disabled={selecionadas.size === 0 || baixando || apagando}
            style={{ height: 44, padding: '0 16px', borderRadius: 12, border: 0, cursor: selecionadas.size ? 'pointer' : 'default', background: selecionadas.size ? 'var(--primary)' : 'var(--surface-2)', color: selecionadas.size ? '#fff' : 'var(--text-3)', fontWeight: 800, fontSize: 13 }}>
            {baixando ? 'Baixando…' : `⬇ Baixar (${selecionadas.size})`}
          </button>
        </div>
      )}

      {aberta && <FotoAmpliada f={aberta} onClose={() => setAberta(null)} onApagar={apagarUma} />}
    </div>
  );
}

function Miniatura({ f, onClick, selMode, selected }) {
  return (
    <button onClick={onClick} style={{ position: 'relative', aspectRatio: '1', borderRadius: 9, overflow: 'hidden', border: 0, padding: 0, cursor: 'pointer', background: 'var(--surface-2)', display: 'flex', alignItems: 'flex-end', outline: selMode && selected ? '2.5px solid var(--primary)' : 'none', outlineOffset: '-2px' }}>
      <img src={f.url} alt="" loading="lazy" decoding="async" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {selMode && (
        <div style={{ position: 'absolute', top: 5, right: 5, width: 19, height: 19, borderRadius: 999, background: selected ? 'var(--primary)' : 'rgba(255,255,255,.8)', border: '1.5px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 900 }}>{selected ? '✓' : ''}</div>
      )}
      <div style={{ position: 'relative', width: '100%', fontSize: 8, fontWeight: 700, color: '#fff', background: 'linear-gradient(transparent,rgba(0,0,0,.65))', padding: '12px 5px 4px', lineHeight: 1.2, textAlign: 'left' }}>
        {[f.servico, f.ambiente].filter(Boolean).join(' · ')}
      </div>
    </button>
  );
}

function FotoAmpliada({ f, onClose, onApagar }) {
  const nome = ((f.legenda || 'foto').replace(/[^\wÀ-ſ]+/g, '-')) + '.jpg';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(0,0,0,0.82)', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}>
        <img src={f.url} alt="" style={{ width: '100%', maxHeight: '58vh', objectFit: 'contain', borderRadius: 12, background: '#000' }} />
        <div style={{ background: 'var(--surface)', borderRadius: 14, padding: 14, marginTop: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>{f.servico || 'Foto'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
            📍 {[f.pavimento, f.ambiente].filter(Boolean).join(' · ') || 'sem local'} · {String(f.data || '').slice(0, 10).split('-').reverse().join('/')}
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
            {f.autor_nome && <span style={{ fontSize: 10.5, fontWeight: 800, background: 'var(--surface-2)', borderRadius: 8, padding: '4px 9px' }}>👤 {f.autor_nome}</span>}
            {f.empresa && <span style={{ fontSize: 10.5, fontWeight: 800, background: 'var(--surface-2)', borderRadius: 8, padding: '4px 9px' }}>🏢 {f.empresa}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button onClick={() => baixarFoto(f.url, nome)} style={{ flex: 1, height: 46, borderRadius: 12, border: 0, cursor: 'pointer', background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 13, fontWeight: 800 }}>⬇ Baixar</button>
            <button onClick={() => onApagar?.(f)} style={{ height: 46, padding: '0 16px', borderRadius: 12, border: 0, cursor: 'pointer', background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 800 }}>🗑 Apagar</button>
            <button onClick={onClose} style={{ height: 46, padding: '0 18px', borderRadius: 12, border: 0, cursor: 'pointer', background: 'var(--primary)', color: '#fff', fontSize: 13, fontWeight: 800 }}>Fechar</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChipF({ on, onClick, children }) {
  return (
    <button onClick={onClick} style={{ minHeight: 40, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 999, border: 0, cursor: 'pointer', background: on ? 'var(--primary)' : 'var(--surface-2)', color: on ? '#fff' : 'var(--text-2)' }}>{children}</button>
  );
}
