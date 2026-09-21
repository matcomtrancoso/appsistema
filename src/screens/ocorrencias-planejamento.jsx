// Popup de ocorrências do planejamento: por que as atividades não foram feitas.
// Só existe no desktop — é uma tela de análise, não de campo.
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { MOTIVOS_NAO_EXEC } from '../data/index';
import { hojeLocal, toISODate, parseISODate, addDaysISO, addMonthsISO } from '../lib/date';
import { contarMotivos, SEM_MOTIVO } from '../lib/ocorrencias';

const NOME_MOTIVO = Object.fromEntries(MOTIVOS_NAO_EXEC.map(m => [m.id, m.nome]));
const nomeDoMotivo = (id) => (id === SEM_MOTIVO ? 'Sem motivo informado' : NOME_MOTIVO[id] || id);

// Cor por posição no ranking: o topo é o que dói, o resto vai esmaecendo.
const CORES = ['var(--danger)', '#EA580C', '#F59E0B', '#84CC16', '#0EA5E9', '#8B5CF6'];
const corDaBarra = (i) => CORES[i] || 'var(--text-3)';

function segundaDaSemana(iso) {
  const d = parseISODate(iso);
  if (!d) return iso;
  const dow = d.getDay();                     // 0 = domingo
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function rotuloDoMes(iso) {
  const d = parseISODate(iso);
  const s = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Intervalo do período escolhido. offset 0 = semana/mês atual, -1 = anterior.
function intervalo(periodo, offset) {
  const hoje = hojeLocal();
  if (periodo === 'semana') {
    const de = addDaysISO(segundaDaSemana(hoje), offset * 7);
    const ate = addDaysISO(de, 6);
    return { de, ate, rotulo: `${ddmm(de)} – ${ddmm(ate)}` };
  }
  if (periodo === 'mes') {
    const primeiro = addMonthsISO(hoje.slice(0, 8) + '01', offset);
    const d = parseISODate(primeiro);
    const ate = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { de: primeiro, ate, rotulo: rotuloDoMes(primeiro) };
  }
  return { de: null, ate: null, rotulo: 'Toda a obra' };
}

export function OcorrenciasPopup({ onClose }) {
  const [periodo, setPeriodo] = useState('semana');
  const [offset, setOffset] = useState(0);
  const [atividades, setAtividades] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      // Só o que já foi marcado como não feita — o filtro no servidor evita
      // trazer a obra inteira. O limite explícito existe porque o PostgREST
      // corta em 1000 calado.
      // ponytail: uma consulta e o resto na memória; se um dia passar de 5000
      // não feitas, aí sim vale agregar no banco (uma view por mês).
      const { data, error } = await supabase
        .from('atividades_rdo')
        .select('id, descricao, ambiente, empreiteiro, motivo_nao_exec, status, status_por_dia, rdos(data)')
        .or('motivo_nao_exec.not.is.null,status.eq.nao_feita')
        .limit(5000);
      if (!vivo) return;
      if (error) {
        console.error('Erro ao carregar ocorrências:', error);
        setErro('Não foi possível carregar as ocorrências.');
      } else {
        setAtividades((data || []).map(a => ({ ...a, data: a.rdos?.data || null })));
      }
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const { de, ate, rotulo } = useMemo(() => intervalo(periodo, offset), [periodo, offset]);
  const { total, linhas } = useMemo(() => contarMotivos(atividades, de, ate), [atividades, de, ate]);
  const maior = linhas[0]?.n || 1;

  const trocarPeriodo = (p) => { setPeriodo(p); setOffset(0); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 640, maxHeight: '86vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-strong" style={{ fontSize: 18 }}>Ocorrências</div>
            <div className="t-caption" style={{ fontSize: 12.5, marginTop: 1 }}>Por que as atividades não foram feitas</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, border: 0, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 15, height: 15 }}>{Icon.x}</span>
          </button>
        </div>

        {/* Semana / Mês / Total */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px' }}>
          {[['semana', 'Semana'], ['mes', 'Mês'], ['total', 'Total']].map(([k, label]) => (
            <button key={k} onClick={() => trocarPeriodo(k)}
              style={{
                flex: 1, height: 34, borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 800,
                border: periodo === k ? 'none' : '1px solid var(--border)',
                background: periodo === k ? 'var(--primary)' : 'var(--surface)',
                color: periodo === k ? '#fff' : 'var(--text-2)',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* Navegação do período + total do período */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px 14px' }}>
          {periodo !== 'total' && (
            <button onClick={() => setOffset(o => o - 1)} title="Período anterior"
              style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 15, height: 15 }}>{Icon.back}</span>
            </button>
          )}
          <div style={{ flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{rotulo}</div>
            <div className="t-caption" style={{ fontSize: 12 }}>
              {carregando ? 'Carregando…' : `${total} ${total === 1 ? 'atividade não feita' : 'atividades não feitas'}`}
            </div>
          </div>
          {periodo !== 'total' && (
            <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset >= 0} title="Próximo período"
              style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: offset >= 0 ? 'not-allowed' : 'pointer', opacity: offset >= 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 15, height: 15 }}>{Icon.chevR}</span>
            </button>
          )}
        </div>

        {/* Histograma: uma barra por motivo, do mais recorrente para o menos */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {erro && <div style={{ padding: 16, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}

          {!erro && !carregando && total === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 6 }}>✅</div>
              <div className="t-strong" style={{ fontSize: 14 }}>Nenhuma ocorrência no período</div>
              <div className="t-caption" style={{ fontSize: 12.5, marginTop: 3 }}>Tudo que estava planejado foi executado.</div>
            </div>
          )}

          {!erro && linhas.map((l, i) => (
            <div key={l.id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{nomeDoMotivo(l.id)}</div>
                <div style={{ fontSize: 13.5, fontWeight: 900, color: corDaBarra(i) }}>{l.n}</div>
                <div className="t-caption" style={{ fontSize: 11.5, width: 34, textAlign: 'right' }}>{l.pct}%</div>
              </div>
              <div style={{ height: 12, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                <div style={{ width: `${Math.max(2, (l.n / maior) * 100)}%`, height: '100%', borderRadius: 999, background: corDaBarra(i) }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
