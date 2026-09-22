// Realocar atividades de uma semana para outra.
//
// Toda atividade da semana pendura no RDO datado na SEGUNDA-FEIRA daquela
// semana — é o rdo_id que decide em que semana ela aparece. Mover, portanto,
// é trocar o rdo_id para o RDO da segunda de destino (criando-o se ainda não
// existir). Nada mais muda: descrição, dias, empresa e ambiente vão junto.
//
// Existe porque planejamento salvo na semana errada não tinha conserto pela
// tela — só apagando e redigitando tudo.
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { toISODate } from '../lib/date';
import { DIA_ORDEM } from '../lib/atividades-do-dia';
import { msgAmigavel } from '../lib/msg-amigavel';

const DIA_LABEL = { seg: 'S', ter: 'T', qua: 'Q', qui: 'Q', sex: 'S', sab: 'S', dom: 'D' };
const ORDEM = DIA_ORDEM;

function segundaCom(baseMonday, offset) {
  const d = new Date(baseMonday);
  d.setDate(d.getDate() + offset * 7);
  d.setHours(0, 0, 0, 0);
  return d;
}
const datasDaSemana = (segunda) =>
  Array.from({ length: 7 }, (_, i) => { const d = new Date(segunda); d.setDate(d.getDate() + i); return toISODate(d); });

const fmt = (d) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const rotuloSemana = (segunda) => {
  const fim = new Date(segunda); fim.setDate(fim.getDate() + 6);
  return `${fmt(segunda)} – ${fmt(fim)}`;
};

export function RealocarSemanaPopup({ baseMonday, offsetInicial = 0, onClose }) {
  const [origem, setOrigem] = useState(offsetInicial);
  const [destino, setDestino] = useState(offsetInicial + 1);
  const [ativs, setAtivs] = useState([]);
  const [sel, setSel] = useState(() => new Set());
  const [carregando, setCarregando] = useState(true);
  const [movendo, setMovendo] = useState(false);
  const [erro, setErro] = useState('');

  const segOrigem = useMemo(() => segundaCom(baseMonday, origem), [baseMonday, origem]);
  const segDestino = useMemo(() => segundaCom(baseMonday, destino), [baseMonday, destino]);

  // Recarrega a lista sempre que a semana de origem muda.
  useEffect(() => {
    let vivo = true;
    (async () => {
      // Dentro do async, não no corpo do efeito: setState síncrono ali dispara
      // renderização em cascata (é o que o linter acusa).
      setCarregando(true); setErro(''); setSel(new Set());
      const datas = datasDaSemana(segundaCom(baseMonday, origem));
      const { data: rdos, error: eR } = await supabase.from('rdos').select('id').in('data', datas);
      if (eR) { if (vivo) { setErro(msgAmigavel(eR, 'ler a semana')); setCarregando(false); } return; }
      if (!rdos?.length) { if (vivo) { setAtivs([]); setCarregando(false); } return; }
      const { data, error: eA } = await supabase.from('atividades_rdo')
        .select('id,descricao,empreiteiro,ambiente,dias_semana,status')
        .in('rdo_id', rdos.map(r => r.id)).order('created_at');
      if (!vivo) return;
      if (eA) { setErro(msgAmigavel(eA, 'ler as atividades')); setCarregando(false); return; }
      setAtivs(data || []);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [baseMonday, origem]);

  const alternar = (id) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const todas = () => setSel(s => (s.size === ativs.length ? new Set() : new Set(ativs.map(a => a.id))));

  const mesmaSemana = origem === destino;
  const podeMover = sel.size > 0 && !mesmaSemana && !movendo;

  async function mover() {
    if (!podeMover) return;
    setMovendo(true); setErro('');
    try {
      const destinoISO = toISODate(segDestino);
      // O RDO da segunda de destino pode não existir ainda.
      let { data: rdo, error: eSel } = await supabase.from('rdos').select('id').eq('data', destinoISO).maybeSingle();
      if (eSel) throw eSel;
      if (!rdo) {
        const { data, error: eIns } = await supabase.from('rdos')
          .upsert({ data: destinoISO }, { onConflict: 'obra_id,data' }).select().single();
        if (eIns) throw eIns;
        rdo = data;
      }
      const ids = [...sel];
      const { error } = await supabase.from('atividades_rdo').update({ rdo_id: rdo.id }).in('id', ids);
      if (error) throw error;
      onClose(destino);
    } catch (e) {
      console.error('Erro ao realocar:', e);
      setErro(msgAmigavel(e, 'mover'));
      setMovendo(false);
    }
  }

  const navBtn = {
    width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)',
    background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14, fontFamily: 'inherit',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', background: 'var(--surface)',
        borderRadius: 20, display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 900 }}>Realocar atividades</div>
              <div className="t-caption" style={{ fontSize: 12, marginTop: 2 }}>
                Marque o que foi parar na semana errada e escolha para onde vai.
              </div>
            </div>
            <button onClick={() => onClose(null)} style={{ width: 30, height: 30, border: 0, borderRadius: 9,
              background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          {/* De / Para */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 14 }}>
            <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--surface-2)' }}>
              <div className="t-micro" style={{ marginBottom: 6 }}>DE (onde estão hoje)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setOrigem(o => o - 1)} style={navBtn}>‹</button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 800 }}>{rotuloSemana(segOrigem)}</div>
                <button onClick={() => setOrigem(o => o + 1)} style={navBtn}>›</button>
              </div>
            </div>
            <div style={{ padding: '10px 12px', borderRadius: 12,
              background: mesmaSemana ? 'var(--danger-tint, rgba(220,38,38,0.10))' : 'var(--primary-tint)',
              border: mesmaSemana ? '1px solid var(--danger)' : '1px solid transparent' }}>
              <div className="t-micro" style={{ marginBottom: 6 }}>PARA (destino)</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setDestino(d => d - 1)} style={navBtn}>‹</button>
                <div style={{ flex: 1, textAlign: 'center', fontSize: 13, fontWeight: 800,
                  color: mesmaSemana ? 'var(--danger)' : 'var(--primary)' }}>{rotuloSemana(segDestino)}</div>
                <button onClick={() => setDestino(d => d + 1)} style={navBtn}>›</button>
              </div>
            </div>
          </div>
          {mesmaSemana && (
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--danger)', marginTop: 8 }}>
              Origem e destino são a mesma semana — escolha outra para poder mover.
            </div>
          )}
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px', minHeight: 120 }}>
          {carregando ? (
            <div className="t-caption" style={{ padding: '24px 0', textAlign: 'center' }}>Carregando…</div>
          ) : ativs.length === 0 ? (
            <div className="t-caption" style={{ padding: '24px 0', textAlign: 'center' }}>
              Nenhuma atividade planejada nesta semana.
            </div>
          ) : (
            <>
              <button onClick={todas} style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 800, color: 'var(--primary)', padding: '2px 0 8px' }}>
                {sel.size === ativs.length ? 'Desmarcar todas' : `Marcar todas (${ativs.length})`}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ativs.map(a => {
                  const marcada = sel.has(a.id);
                  const dias = (Array.isArray(a.dias_semana) ? a.dias_semana : [])
                    .slice().sort((x, y) => ORDEM.indexOf(x) - ORDEM.indexOf(y));
                  return (
                    <button key={a.id} onClick={() => alternar(a.id)} style={{
                      display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                      padding: '9px 11px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit',
                      background: marcada ? 'var(--primary-tint)' : 'var(--surface-2)',
                      border: marcada ? '1.5px solid var(--primary)' : '1px solid transparent',
                    }}>
                      <span style={{ fontSize: 14, color: marcada ? 'var(--primary)' : 'var(--text-3)' }}>
                        {marcada ? '☑' : '☐'}
                      </span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {a.descricao || 'Atividade'}
                        </span>
                        <span className="t-caption" style={{ fontSize: 11 }}>
                          {[a.empreiteiro, a.ambiente].filter(Boolean).join(' · ') || 'sem empresa'}
                        </span>
                      </span>
                      <span style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        {dias.map((d, i) => (
                          <span key={d + i} style={{ fontSize: 9.5, fontWeight: 800, width: 16, height: 16,
                            borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--surface)', color: 'var(--text-3)' }}>{DIA_LABEL[d] || '?'}</span>
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          {erro && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, fontSize: 12.5, fontWeight: 700,
              background: 'var(--danger-tint, rgba(220,38,38,0.10))', color: 'var(--danger)' }}>{erro}</div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 18px' }}>
          <div className="t-caption" style={{ flex: 1, fontSize: 12 }}>
            {sel.size > 0 ? `${sel.size} marcada${sel.size !== 1 ? 's' : ''}` : 'nada marcado'}
          </div>
          <button onClick={() => onClose(null)} style={{ height: 44, padding: '0 18px', borderRadius: 12,
            border: '0.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={mover} disabled={!podeMover} style={{ height: 44, padding: '0 20px', borderRadius: 12,
            border: 0, background: podeMover ? 'var(--primary)' : 'var(--border)', color: '#fff',
            fontSize: 14, fontWeight: 800, cursor: podeMover ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            {movendo ? 'Movendo…' : `Mover para ${rotuloSemana(segDestino)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
