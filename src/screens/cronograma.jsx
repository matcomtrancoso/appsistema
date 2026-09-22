// ── Cronograma da obra ────────────────────────────────────────────────────
// Importa o cronograma exportado do MS Project e acompanha o avanço de cada
// item. Regras combinadas: início real é automático (primeiro RDO com efetivo
// numa atividade vinculada), término e % são do usuário.
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { contem, normalizar } from '../lib/busca';
import { Icon, PageHeader, Search, StatChips } from '../components/index';
import {
  parseCronograma, situacaoItem, percentualGrupo, percentualSugerido, diasDeAtraso, SIT,
  curvaS, rotuloMes, terminoPorDuracao, indicadoresObra,
} from '../lib/cronograma';
import { hojeLocal, addDaysISO as addDiasISO } from '../lib/date';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';

const fmtBR = (iso) => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a.slice(2)}`;
};

const IS = {
  width: '100%', boxSizing: 'border-box', height: 44, borderRadius: 10,
  border: '1.5px solid var(--border)', background: 'var(--surface-2)',
  padding: '0 12px', fontSize: 14, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit',
};

// ── Barra de avanço ───────────────────────────────────────────────────────
function Barra({ pct, cor, alta }) {
  return (
    <div style={{ height: alta ? 8 : 5, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden', flex: 1, minWidth: 40 }}>
      <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, pct))}%`, background: cor, borderRadius: 99, transition: 'width .2s' }} />
    </div>
  );
}

function Chip({ sit }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      background: sit.cor + '1A', color: sit.cor,
    }}>{sit.label.toUpperCase()}</span>
  );
}

// ── Linha de tarefa ───────────────────────────────────────────────────────
function LinhaItem({ item, atividades, onClick }) {
  const sit = situacaoItem(item);
  const pct = item.concluido ? 100 : (item.percentual || 0);
  const atraso = diasDeAtraso(item);
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
      padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit',
      borderTop: '0.5px solid var(--border)', display: 'block',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', minWidth: 22 }}>{item.wbs_id}</span>
        <span style={{ flex: 1, minWidth: 120, fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)' }}>{item.nome}</span>
        <Chip sit={sit} />
        <span style={{ fontSize: 12, fontWeight: 800, color: sit.cor, minWidth: 34, textAlign: 'right' }}>{pct}%</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
        <Barra pct={pct} cor={sit.cor} />
        <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          {fmtBR(item.inicio_previsto)} – {fmtBR(item.termino_previsto)}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
        {item.inicio_real && (
          <span style={{ fontSize: 10.5, color: 'var(--success,#16A34A)', fontWeight: 700 }}>
            ▶ iniciou {fmtBR(item.inicio_real)}
          </span>
        )}
        {atraso && (
          <span style={{ fontSize: 10.5, color: 'var(--danger)', fontWeight: 700 }}>⚠ {atraso}d além do previsto</span>
        )}
        {atividades > 0 && (
          <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600 }}>
            🔗 {atividades} atividade{atividades !== 1 ? 's' : ''} no planejamento
          </span>
        )}
      </div>
    </button>
  );
}

// ── Indicadores do topo ───────────────────────────────────────────────────
function Tile({ label, valor, sub, cor, corSub, mini }) {
  return (
    <div style={{
      padding: mini ? '7px 10px' : '9px 11px', borderRadius: mini ? 10 : 12, background: 'var(--surface)',
      boxShadow: 'inset 0 0 0 0.5px var(--border)', borderLeft: `3px solid ${cor}`,
    }}>
      <div style={{ fontSize: mini ? 8.5 : 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.07em' }}>{label}</div>
      <div style={{ fontSize: mini ? 17 : 19, fontWeight: 900, color: cor, lineHeight: 1.15, marginTop: 2 }}>{valor}</div>
      {sub && <div style={{ fontSize: mini ? 9.5 : 10.5, color: corSub || 'var(--text-3)', fontWeight: corSub ? 800 : 600, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Indicadores({ ind, compacto }) {
  if (!ind) return null;
  const atrasado = ind.desvio < 0;
  const noPlano = Math.abs(ind.desvio) < 0.05;
  const corDesvio = noPlano ? 'var(--text-2)' : atrasado ? '#DC2626' : '#16A34A';
  const textoDesvio = `${ind.desvio > 0 ? '+' : ''}${ind.desvio} pp ${noPlano ? 'no plano' : atrasado ? 'atrás' : 'à frente'}`;

  // No celular fica só o essencial: onde deveria estar e onde está. O desvio
  // entra como subtítulo do "Está" em vez de ocupar um card só dele.
  if (compacto) {
    return (
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}>
        <Tile mini label="DEVERIA ESTAR" valor={`${ind.previsto}%`} sub={`semana ${ind.semana}`} cor="#94A3B8" />
        <Tile mini label="ESTÁ" valor={`${ind.realizado}%`} sub={textoDesvio} corSub={corDesvio} cor="var(--primary)" />
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))' }}>
      <Tile label="DEVERIA ESTAR" valor={`${ind.previsto}%`} sub="previsto para hoje" cor="#94A3B8" />
      <Tile label="ESTÁ" valor={`${ind.realizado}%`} sub="avanço lançado" cor="var(--primary)" />
      <Tile
        label="DESVIO"
        valor={`${ind.desvio > 0 ? '+' : ''}${ind.desvio} pp`}
        sub={noPlano ? 'no plano' : atrasado ? 'atrás do plano' : 'à frente'}
        cor={corDesvio}
      />
      <Tile
        label="DIAS DE OBRA"
        valor={`${ind.diasPassados}`}
        sub={`de ${ind.diasTotais} · faltam ${ind.diasRestantes}`}
        cor="var(--text-1)"
      />
      <Tile label="SEMANA" valor={ind.semana} sub={`${ind.pctTempo}% do prazo`} cor="#D97706" />
    </div>
  );
}

// ── Curva S: previsto × realizado ─────────────────────────────────────────
function CurvaS({ pontos, hoje }) {
  const [sel, setSel] = useState(null);
  if (!pontos.length) return null;

  const W = 760, H = 230, ML = 34, MR = 10, MT = 12, MB = 26;
  const larg = W - ML - MR, alt = H - MT - MB;
  const x = (i) => ML + (pontos.length === 1 ? larg / 2 : (i / (pontos.length - 1)) * larg);
  const y = (v) => MT + alt - (v / 100) * alt;

  const linha = (campo) => pontos
    .map((p, i) => (p[campo] === null ? null : `${x(i)},${y(p[campo])}`))
    .filter(Boolean).join(' ');

  const mesHoje = hoje.slice(0, 7);
  const iHoje = pontos.findIndex(p => p.mes === mesHoje);
  const atual = pontos[sel ?? (iHoje >= 0 ? iHoje : pontos.length - 1)];
  const desvio = atual && atual.realizado !== null
    ? Math.round((atual.realizado - atual.previsto) * 10) / 10 : null;

  // rótulos: no máximo ~12 para não embolar
  const passo = Math.max(1, Math.ceil(pontos.length / 12));

  return (
    <div className="card" style={{ padding: '14px 12px 10px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '0 4px 10px' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>CURVA S — PREVISTO × REALIZADO</span>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, fontWeight: 700 }}>
          <span style={{ color: 'var(--text-3)' }}><span style={{ display: 'inline-block', width: 16, height: 2, background: '#94A3B8', verticalAlign: 'middle', marginRight: 5 }} />Previsto</span>
          <span style={{ color: 'var(--primary)' }}><span style={{ display: 'inline-block', width: 16, height: 3, background: 'var(--primary)', verticalAlign: 'middle', marginRight: 5 }} />Realizado</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 520, display: 'block' }}>
          {[0, 25, 50, 75, 100].map(v => (
            <g key={v}>
              <line x1={ML} y1={y(v)} x2={W - MR} y2={y(v)} stroke="var(--border)" strokeWidth="1" strokeDasharray={v === 0 ? '' : '3 4'} />
              <text x={ML - 6} y={y(v) + 3.5} textAnchor="end" fontSize="9" fill="var(--text-3)">{v}%</text>
            </g>
          ))}

          {iHoje >= 0 && (
            <g>
              <line x1={x(iHoje)} y1={MT} x2={x(iHoje)} y2={MT + alt} stroke="var(--danger)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
              <text x={x(iHoje)} y={MT - 3} textAnchor="middle" fontSize="8.5" fontWeight="700" fill="var(--danger)">hoje</text>
            </g>
          )}

          <polyline points={linha('previsto')} fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinejoin="round" />
          <polyline points={linha('realizado')} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" />

          {pontos.map((p, i) => p.realizado !== null && (
            <circle key={p.mes} cx={x(i)} cy={y(p.realizado)} r="2.5" fill="var(--primary)" />
          ))}

          {atual && (
            <circle cx={x(pontos.indexOf(atual))} cy={y(atual.previsto)} r="4" fill="none" stroke="var(--text-2)" strokeWidth="1.5" />
          )}

          {pontos.map((p, i) => i % passo === 0 && (
            <text key={p.mes} x={x(i)} y={H - 8} textAnchor="middle" fontSize="8.5" fill="var(--text-3)">{rotuloMes(p.mes)}</text>
          ))}

          {/* áreas clicáveis para escolher o mês */}
          {pontos.map((p, i) => (
            <rect key={'h' + p.mes} x={x(i) - larg / (pontos.length * 2)} y={MT} width={larg / pontos.length} height={alt}
              fill="transparent" style={{ cursor: 'pointer' }} onClick={() => setSel(i)}>
              <title>{rotuloMes(p.mes)}: previsto {p.previsto}%{p.realizado !== null ? ` · realizado ${p.realizado}%` : ''}</title>
            </rect>
          ))}
        </svg>
      </div>

      {atual && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', borderTop: '0.5px solid var(--border)', paddingTop: 10, marginTop: 6 }}>
          <select value={atual.mes} onChange={e => setSel(pontos.findIndex(p => p.mes === e.target.value))}
            style={{ height: 34, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-1)', fontSize: 12.5, fontWeight: 700, padding: '0 8px', fontFamily: 'inherit' }}>
            {pontos.map(p => <option key={p.mes} value={p.mes}>{rotuloMes(p.mes)}</option>)}
          </select>
          <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 700 }}>
            deveria estar em <strong style={{ color: 'var(--text-1)' }}>{atual.previsto}%</strong>
          </span>
          {atual.realizado !== null ? (
            <>
              <span style={{ fontSize: 12.5, color: 'var(--text-2)', fontWeight: 700 }}>
                · está em <strong style={{ color: 'var(--primary)' }}>{atual.realizado}%</strong>
              </span>
              <span style={{
                fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999,
                background: desvio < 0 ? 'var(--danger-tint,#FEE2E2)' : 'var(--success-tint,#DCFCE7)',
                color: desvio < 0 ? 'var(--danger)' : 'var(--success,#16A34A)',
              }}>
                {desvio > 0 ? '+' : ''}{desvio} pp {desvio < 0 ? '(atrás do plano)' : desvio > 0 ? '(à frente)' : '(no plano)'}
              </span>
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>· mês futuro, ainda sem medição</span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Popup: lançar avanço ──────────────────────────────────────────────────
function AvancoPopup({ item, onSalvar, onCancel }) {
  const [pct, setPct] = useState(item.percentual || 0);
  const [concluido, setConcluido] = useState(!!item.concluido);
  const [obs, setObs] = useState(item.observacao || '');
  const [salvando, setSalvando] = useState(false);
  const [editandoDatas, setEditandoDatas] = useState(false);
  const [ini, setIni] = useState(item.inicio_previsto || '');
  const [fim, setFim] = useState(item.termino_previsto || '');
  // Datas REAIS: o início é preenchido sozinho pelo RDO, mas precisa ser
  // editável — se ninguém vinculou a atividade naquele dia, ele não vem.
  const [iniReal, setIniReal] = useState(item.inicio_real || '');
  const [fimReal, setFimReal] = useState(item.concluido_em || '');
  const sugestao = percentualSugerido(item);

  // Ao mudar o início, recalcula o término mantendo a duração em dias úteis.
  function mudarInicio(novo) {
    setIni(novo);
    const t = terminoPorDuracao(novo, item.duracao_dias);
    if (t) setFim(t);
  }

  const datasMudaram = ini !== (item.inicio_previsto || '') || fim !== (item.termino_previsto || '');

  async function salvar() {
    setSalvando(true);
    const patch = {
      percentual: concluido ? 100 : Number(pct) || 0,
      concluido,
      inicio_real: iniReal || null,
      concluido_em: concluido ? (fimReal || item.concluido_em || hojeLocal()) : null,
      observacao: obs.trim() || null,
    };
    if (datasMudaram && ini && fim) {
      patch.inicio_previsto = ini;
      patch.termino_previsto = fim;
      // marca para a reimportação de uma revisão não desfazer a correção
      patch.datas_ajustadas = true;
    }
    await onSalvar(patch);
    setSalvando(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 18px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 20,
        padding: '24px 20px 20px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', maxHeight: '92dvh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
          ITEM {item.wbs_id} DO CRONOGRAMA
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)', margin: '4px 0 6px' }}>{item.nome}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, marginBottom: 12 }}>
          Previsto: {fmtBR(ini)} a {fmtBR(fim)} · {item.duracao_dias} dias úteis
          {item.inicio_real && <> · <span style={{ color: 'var(--success,#16A34A)' }}>iniciou em {fmtBR(item.inicio_real)}</span></>}
          {item.datas_ajustadas && <> · <span style={{ color: 'var(--warn,#CA8A04)' }}>datas corrigidas na mão</span></>}
        </div>

        {/* Correção das datas do cronograma base */}
        {!editandoDatas ? (
          <button onClick={() => setEditandoDatas(true)} style={{
            border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', marginBottom: 16,
            color: 'var(--primary)', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
          }}>✏️ Corrigir as datas previstas</button>
        ) : (
          <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>
              DATAS PREVISTAS
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="date" value={ini} onChange={e => mudarInicio(e.target.value)} style={{ ...IS, flex: 1, minWidth: 130, height: 40 }} />
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>até</span>
              <input type="date" value={fim} min={ini} onChange={e => setFim(e.target.value)} style={{ ...IS, flex: 1, minWidth: 130, height: 40 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
              Ao mudar o início, o término é recalculado mantendo os {item.duracao_dias} dias úteis.
              Itens corrigidos aqui não são sobrescritos ao importar uma revisão nova.
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16, opacity: concluido ? 0.45 : 1, pointerEvents: concluido ? 'none' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em' }}>AVANÇO</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)' }}>{concluido ? 100 : pct}%</span>
          </div>
          <input type="range" min="0" max="100" step="5" value={pct}
            onChange={e => setPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--primary)' }} />
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {[0, 25, 50, 75, 100].map(v => (
              <button key={v} onClick={() => setPct(v)} style={{
                flex: 1, height: 34, borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 800,
                border: pct === v ? 'none' : '1px solid var(--border)',
                background: pct === v ? 'var(--primary)' : 'var(--surface-2)',
                color: pct === v ? '#fff' : 'var(--text-2)', fontFamily: 'inherit',
              }}>{v}%</button>
            ))}
          </div>
          {sugestao !== null && (
            <button onClick={() => setPct(sugestao)} style={{
              marginTop: 8, border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', padding: 0,
            }}>
              Pelo tempo decorrido daria <strong>{sugestao}%</strong> — toque para usar
            </button>
          )}
        </div>

        {/* Datas reais — o início vem do RDO, mas pode ser corrigido aqui */}
        <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>
            DATAS REAIS
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, marginBottom: 4 }}>Início</div>
              <input type="date" value={iniReal} onChange={e => setIniReal(e.target.value)} style={{ ...IS, height: 40 }} />
            </div>
            <div style={{ flex: 1, minWidth: 130 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700, marginBottom: 4 }}>Término</div>
              <input type="date" value={fimReal} min={iniReal || undefined}
                onChange={e => { setFimReal(e.target.value); if (e.target.value) setConcluido(true); }}
                style={{ ...IS, height: 40 }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
            O início é preenchido sozinho quando o RDO tem uma atividade ligada a este item.
            Preencher o término marca o serviço como concluído.
          </div>
        </div>

        <button onClick={() => setConcluido(c => !c)} style={{
          width: '100%', height: 46, borderRadius: 12, cursor: 'pointer', marginBottom: 14,
          border: concluido ? 'none' : '1.5px solid var(--border)',
          background: concluido ? 'var(--success,#16A34A)' : 'var(--surface-2)',
          color: concluido ? '#fff' : 'var(--text-2)', fontSize: 14, fontWeight: 800, fontFamily: 'inherit',
        }}>
          {concluido ? '✓ Concluído' : 'Marcar como concluído'}
        </button>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>OBSERVAÇÃO</div>
          <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
            placeholder="Ex.: parado aguardando liberação do projeto"
            style={{ ...IS, height: 'auto', padding: '10px 12px', resize: 'vertical' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{
            flex: 1, height: 48, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button onClick={salvar} disabled={salvando} style={{
            flex: 2, height: 48, borderRadius: 12, border: 'none',
            background: salvando ? 'var(--border)' : 'var(--primary)',
            color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit',
          }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Popup: atualizar vários serviços de uma vez ───────────────────────────
const FILTROS_LOTE = [
  { chave: 'foco',    label: 'Em andamento e atrasadas' },
  { chave: 'semanal', label: 'Previstas até 30 dias' },
  { chave: 'todas',   label: 'Todas' },
];

function LotePopup({ folhas, onSalvar, onCancel }) {
  const [aba, setAba]       = useState('foco');
  const [busca, setBusca]   = useState('');
  const [rasc, setRasc]     = useState({});   // id -> { percentual, concluido, inicio_real, concluido_em }
  const [datasAbertas, setDatasAbertas] = useState({});
  const [salvando, setSalvando] = useState(false);

  const hoje = hojeLocal();
  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return folhas.filter(f => {
      if (q) return contem(f.nome, q) || String(f.wbs_id) === q;
      if (aba === 'todas') return true;
      const s = situacaoItem(f);
      if (aba === 'foco') return s === SIT.andamento || s === SIT.atrasado;
      // previstas para começar/terminar nos próximos 30 dias, fora as concluídas
      if (aba === 'semanal') {
        if (f.concluido) return false;
        const lim = addDiasISO(hoje, 30);
        return f.inicio_previsto <= lim && f.termino_previsto >= addDiasISO(hoje, -30);
      }
      return true;
    });
  }, [folhas, aba, busca, hoje]);

  // Estado de cada linha: parte do que está gravado e sobrescreve com o rascunho.
  const linhaDe = (f) => ({
    percentual:  rasc[f.id]?.percentual  ?? (f.concluido ? 100 : (f.percentual || 0)),
    concluido:   rasc[f.id]?.concluido   ?? !!f.concluido,
    inicio_real: rasc[f.id]?.inicio_real ?? (f.inicio_real || ''),
    concluido_em:rasc[f.id]?.concluido_em?? (f.concluido_em || ''),
  });
  const mexer = (f, patch) => setRasc(p => ({ ...p, [f.id]: { ...linhaDe(f), ...patch } }));

  function setPct(f, v) {
    const n = Math.max(0, Math.min(100, Number(v) || 0));
    mexer(f, { percentual: n, concluido: n === 100 ? linhaDe(f).concluido : false });
  }
  function toggleFeito(f) {
    const l = linhaDe(f);
    const novo = !l.concluido;
    mexer(f, {
      percentual: novo ? 100 : l.percentual,
      concluido: novo,
      concluido_em: novo ? (l.concluido_em || hoje) : '',
    });
  }

  // Só grava o que realmente mudou.
  const alterados = useMemo(() => folhas.filter(f => {
    const r = rasc[f.id];
    if (!r) return false;
    return r.percentual !== (f.percentual || 0)
      || r.concluido !== !!f.concluido
      || (r.inicio_real || '') !== (f.inicio_real || '')
      || (r.concluido_em || '') !== (f.concluido_em || '');
  }), [rasc, folhas]);

  async function salvar() {
    if (!alterados.length) return;
    setSalvando(true);
    await onSalvar(alterados.map(f => ({ item: f, ...rasc[f.id] })));
    setSalvando(false);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 620, maxHeight: '90dvh', background: 'var(--surface)',
        borderRadius: 20, boxShadow: '0 24px 60px rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Cabeçalho */}
        <div style={{ padding: '18px 18px 12px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>Atualizar serviços</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2, marginBottom: 12 }}>
            Preencha o avanço de vários itens e salve tudo de uma vez.
          </div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            {FILTROS_LOTE.map(f => (
              <button key={f.chave} onClick={() => setAba(f.chave)} style={{
                padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12, fontWeight: 800, fontFamily: 'inherit',
                border: aba === f.chave ? 'none' : '1px solid var(--border)',
                background: aba === f.chave ? 'var(--primary)' : 'var(--surface-2)',
                color: aba === f.chave ? '#fff' : 'var(--text-2)',
              }}>{f.label}</button>
            ))}
          </div>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar serviço…"
            style={{ ...IS, height: 40 }} />
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 120 }}>
          {lista.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              Nenhum serviço nesse filtro.
            </div>
          ) : lista.map(f => {
            const sit = situacaoItem(f);
            const l = linhaDe(f);
            const mudou = alterados.some(a => a.id === f.id);
            const aberto = !!datasAbertas[f.id];
            const temData = l.inicio_real || l.concluido_em;
            return (
              <div key={f.id} style={{
                borderTop: '0.5px solid var(--border)',
                background: mudou ? 'var(--primary-tint)' : 'transparent',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
                      <span style={{ color: 'var(--text-3)', fontWeight: 800, marginRight: 6 }}>{f.wbs_id}</span>
                      {f.nome}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 800, color: sit.cor }}>{sit.label.toUpperCase()}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                        previsto {fmtBR(f.inicio_previsto)}–{fmtBR(f.termino_previsto)}
                      </span>
                      {temData && (
                        <span style={{ fontSize: 10.5, color: 'var(--success,#16A34A)', fontWeight: 700 }}>
                          real {fmtBR(l.inicio_real) }{l.concluido_em ? `–${fmtBR(l.concluido_em)}` : '–…'}
                        </span>
                      )}
                    </div>
                  </div>
                  <button onClick={() => setDatasAbertas(p => ({ ...p, [f.id]: !p[f.id] }))} title="Datas reais" style={{
                    width: 34, height: 38, borderRadius: 9, cursor: 'pointer', flexShrink: 0, fontSize: 14,
                    border: '1.5px solid var(--border)',
                    background: aberto || temData ? 'var(--surface-2)' : 'var(--surface)',
                    color: temData ? 'var(--success,#16A34A)' : 'var(--text-3)', fontFamily: 'inherit',
                  }}>📅</button>
                  <input type="number" min="0" max="100" step="5" value={l.percentual}
                    onChange={e => setPct(f, e.target.value)} disabled={l.concluido}
                    style={{
                      width: 62, height: 38, borderRadius: 9, textAlign: 'center', flexShrink: 0,
                      border: '1.5px solid var(--border)', background: l.concluido ? 'var(--surface-2)' : 'var(--surface)',
                      color: 'var(--text-1)', fontSize: 14, fontWeight: 800, outline: 'none', fontFamily: 'inherit',
                    }} />
                  <span style={{ fontSize: 12, color: 'var(--text-3)', flexShrink: 0, width: 10 }}>%</span>
                  <button onClick={() => toggleFeito(f)} title="Marcar como concluído" style={{
                    width: 38, height: 38, borderRadius: 9, cursor: 'pointer', flexShrink: 0, fontSize: 15,
                    border: l.concluido ? 'none' : '1.5px solid var(--border)',
                    background: l.concluido ? 'var(--success,#16A34A)' : 'var(--surface)',
                    color: l.concluido ? '#fff' : 'var(--text-3)', fontFamily: 'inherit',
                  }}>✓</button>
                </div>

                {aberto && (
                  <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontSize: 9.5, color: 'var(--text-3)', fontWeight: 800, marginBottom: 3, letterSpacing: '0.06em' }}>INÍCIO REAL</div>
                      <input type="date" value={l.inicio_real}
                        onChange={e => mexer(f, { inicio_real: e.target.value })}
                        style={{ ...IS, height: 36, fontSize: 13 }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <div style={{ fontSize: 9.5, color: 'var(--text-3)', fontWeight: 800, marginBottom: 3, letterSpacing: '0.06em' }}>TÉRMINO REAL</div>
                      <input type="date" value={l.concluido_em} min={l.inicio_real || undefined}
                        onChange={e => mexer(f, {
                          concluido_em: e.target.value,
                          ...(e.target.value ? { concluido: true, percentual: 100 } : {}),
                        })}
                        style={{ ...IS, height: 36, fontSize: 13 }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Rodapé */}
        <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--text-3)', fontWeight: 700 }}>
            {alterados.length === 0 ? 'Nada alterado ainda' : `${alterados.length} serviço${alterados.length !== 1 ? 's' : ''} alterado${alterados.length !== 1 ? 's' : ''}`}
          </span>
          <button onClick={onCancel} style={{
            height: 44, padding: '0 16px', borderRadius: 11, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
          }}>Cancelar</button>
          <button onClick={salvar} disabled={!alterados.length || salvando} style={{
            height: 44, padding: '0 20px', borderRadius: 11, border: 'none',
            background: alterados.length && !salvando ? 'var(--primary)' : 'var(--border)',
            color: '#fff', fontSize: 14, fontWeight: 800, cursor: alterados.length ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

// ── Popup: importar ───────────────────────────────────────────────────────
function ImportarPopup({ onImportado, onCancel }) {
  const [texto, setTexto] = useState('');
  const [revisao, setRevisao] = useState('');
  const [previa, setPrevia] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  function analisar() {
    setErroSalvar('');
    setPrevia(parseCronograma(texto));
  }

  async function confirmar() {
    if (!previa?.itens?.length) return;
    setSalvando(true);
    setErroSalvar('');

    // Itens cujas datas foram corrigidas na mão não são sobrescritos: só o nome
    // e a hierarquia são atualizados, para a correção não se perder calada.
    const { data: ajustados } = await supabase
      .from('cronograma_itens').select('wbs_id').eq('datas_ajustadas', true);
    const preservar = new Set((ajustados || []).map(a => a.wbs_id));
    // upsert por wbs_id: atualiza o planejado e PRESERVA o avanço já lançado
    // (percentual, inicio_real, concluido) — por isso esses campos não vão aqui.
    const linhas = previa.itens.map(i => {
      const base = {
        wbs_id: i.wbs_id,
        nome: i.nome,
        pai_wbs_id: i.pai_wbs_id,
        is_grupo: i.is_grupo,
        ordem: i.ordem,
        revisao: revisao.trim() || null,
      };
      if (preservar.has(i.wbs_id)) return base;
      return {
        ...base,
        duracao_dias: i.duracao_dias,
        inicio_previsto: i.inicio_previsto,
        termino_previsto: i.termino_previsto,
      };
    });
    const { error } = await supabase
      .from('cronograma_itens').upsert(linhas, { onConflict: 'obra_id,wbs_id' });
    setSalvando(false);
    if (error) {
      console.error('Erro ao importar cronograma:', error);
      setErroSalvar(error.message.includes('does not exist')
        ? 'A tabela do cronograma ainda não existe no banco. O arquivo banco.sql precisa ser aplicado de novo no Supabase.'
        : msgAmigavel(error, 'importar o cronograma'));
      return;
    }
    onImportado(linhas.length);
  }

  const grupos = previa?.itens?.filter(i => i.is_grupo).length || 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'var(--bg, var(--surface-2))', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '0.5px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <button onClick={onCancel} style={{ width: 34, height: 34, borderRadius: 8, border: 'none', background: 'var(--surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
        </button>
        <div style={{ flex: 1, fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>Importar cronograma</div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '16px', maxWidth: 820, margin: '0 auto' }}>
          <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--primary-tint)', border: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', marginBottom: 6 }}>Como fazer</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.6 }}>
              Abra o PDF do cronograma, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole abaixo.
              O app entende o formato do MS Project: Id, nome, duração em dias, início e término.
              Reimportar uma revisão nova <strong>atualiza as datas e mantém o avanço</strong> que você já lançou.
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>REVISÃO (OPCIONAL)</div>
            <input value={revisao} onChange={e => setRevisao(e.target.value)} placeholder="Ex.: R03" style={{ ...IS, maxWidth: 200 }} />
          </div>

          <textarea value={texto} onChange={e => { setTexto(e.target.value); setPrevia(null); }} rows={8}
            placeholder="Cole aqui o texto do cronograma…"
            style={{ ...IS, height: 'auto', padding: '12px', resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} />

          <button onClick={analisar} disabled={!texto.trim()} className="btn btn-secondary"
            style={{ marginTop: 10, width: '100%', height: 44 }}>
            Analisar texto
          </button>

          {previa && (
            <div style={{ marginTop: 16 }}>
              {previa.itens.length === 0 ? (
                <div className="card" style={{ padding: 14, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
                  {previa.erros.join(' ')}
                </div>
              ) : (
                <>
                  <div className="card" style={{ padding: '12px 14px', marginBottom: 10, display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
                    <div><div style={{ fontSize: 22, fontWeight: 900, color: 'var(--primary)' }}>{previa.itens.length}</div><div className="t-caption">linhas</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{grupos}</div><div className="t-caption">grupos</div></div>
                    <div><div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{previa.itens.length - grupos}</div><div className="t-caption">tarefas</div></div>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)' }}>
                        {fmtBR(previa.itens.reduce((min, i) => i.inicio_previsto < min ? i.inicio_previsto : min, previa.itens[0].inicio_previsto))}
                        {' a '}
                        {fmtBR(previa.itens.reduce((max, i) => i.termino_previsto > max ? i.termino_previsto : max, previa.itens[0].termino_previsto))}
                      </div>
                      <div className="t-caption">período da obra</div>
                    </div>
                  </div>

                  {previa.erros.length > 0 && (
                    <div className="card" style={{ padding: 12, marginBottom: 10, background: 'var(--warn-tint)', color: 'var(--warn,#CA8A04)', fontSize: 12.5, fontWeight: 700 }}>
                      {previa.erros.map((e, i) => <div key={i}>⚠️ {e}</div>)}
                    </div>
                  )}

                  <div className="card" style={{ padding: 0, maxHeight: 320, overflowY: 'auto' }}>
                    {previa.itens.map(i => (
                      <div key={i.wbs_id} style={{
                        display: 'flex', gap: 8, alignItems: 'center', padding: '6px 12px',
                        borderTop: '0.5px solid var(--border)',
                        background: i.is_grupo ? 'var(--surface-2)' : 'transparent',
                      }}>
                        <span style={{ fontSize: 10, color: 'var(--text-3)', minWidth: 24, fontWeight: 700 }}>{i.wbs_id}</span>
                        <span style={{
                          flex: 1, fontSize: 12.5, color: 'var(--text-1)',
                          fontWeight: i.is_grupo ? 800 : 500,
                          paddingLeft: (i.nivel || 0) * 12,
                        }}>{i.nome}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
                          {i.duracao_dias}d · {fmtBR(i.inicio_previsto)}–{fmtBR(i.termino_previsto)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {erroSalvar && (
                    <div className="card" style={{ padding: 12, marginTop: 10, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
                      ⚠️ {erroSalvar}
                    </div>
                  )}

                  <button onClick={confirmar} disabled={salvando} className="btn btn-primary"
                    style={{ marginTop: 12, width: '100%', height: 48, fontSize: 15 }}>
                    {salvando ? 'Importando…' : `Importar ${previa.itens.length} itens`}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────
export function CronogramaScreen({ isDesktop = false }) {
  const [itens, setItens]       = useState([]);
  const [vinculos, setVinculos] = useState({});   // cronograma_item_id -> nº de atividades
  const [historico, setHistorico] = useState([]); // medições para a curva S
  const [loading, setLoading]   = useState(true);
  const [erro, setErro]         = useState('');
  const [busca, setBusca]       = useState('');
  const [filtro, setFiltro]     = useState(null); // chave de SIT
  const [abertos, setAbertos]   = useState({});   // wbs_id -> bool
  const [editando, setEditando] = useState(null);
  const [importar, setImportar] = useState(false);
  const [lote, setLote]         = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErro('');
    const { data, error } = await supabase
      .from('cronograma_itens').select('*').order('ordem', { ascending: true });
    if (error) {
      console.error('Erro ao carregar cronograma:', error);
      setErro(error.message.includes('does not exist')
        ? 'A tabela do cronograma ainda não existe no banco. O arquivo banco.sql precisa ser aplicado de novo no Supabase.'
        : 'Não foi possível carregar o cronograma.');
      setItens([]); setLoading(false); return;
    }
    setItens(data || []);

    const { data: ativs } = await supabase
      .from('atividades_rdo').select('cronograma_item_id').not('cronograma_item_id', 'is', null);
    const cont = {};
    for (const a of (ativs || [])) cont[a.cronograma_item_id] = (cont[a.cronograma_item_id] || 0) + 1;
    setVinculos(cont);

    const { data: hist, error: eHist } = await supabase
      .from('cronograma_avanco').select('item_id, data_ref, percentual').order('data_ref');
    if (eHist) console.error('Erro ao carregar histórico de avanço:', eHist);
    setHistorico(hist || []);

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Abre, uma única vez por carga, os grupos que têm algo acontecendo agora.
  // O controle é por ref: usar `abertos` como dependência de um efeito que
  // chama setAbertos entraria em loop quando o cronograma não tem grupos
  // (objeto vazio novo a cada render dispara o efeito de novo).
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (jaAbriu.current || !itens.length) return;
    jaAbriu.current = true;
    const inicial = {};
    for (const i of itens) {
      if (!i.is_grupo) continue;
      const s = situacaoItem(i);
      inicial[i.wbs_id] = s === SIT.andamento || s === SIT.atrasado || s === SIT.a_iniciar;
    }
    setAbertos(inicial);
  }, [itens]);

  const filhosPorPai = useMemo(() => {
    const m = {};
    for (const i of itens) (m[i.pai_wbs_id ?? 'raiz'] ||= []).push(i);
    return m;
  }, [itens]);

  // Todos os descendentes folha de um grupo (para calcular o avanço agregado)
  const folhasDe = useCallback((wbsId) => {
    const out = [];
    const fila = [...(filhosPorPai[wbsId] || [])];
    while (fila.length) {
      const at = fila.shift();
      if (at.is_grupo) fila.push(...(filhosPorPai[at.wbs_id] || []));
      else out.push(at);
    }
    return out;
  }, [filhosPorPai]);

  const folhas = useMemo(() => itens.filter(i => !i.is_grupo), [itens]);

  // "Em andamento" inclui as atrasadas, e elas sobem para o topo: um serviço
  // atrasado é um serviço em andamento que precisa de atenção antes dos outros.
  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = folhas.filter(i => {
      if (q && !contem(i.nome, q) && String(i.wbs_id) !== q) return false;
      if (!filtro) return true;
      const chave = situacaoItem(i).chave;
      if (filtro === SIT.andamento.chave) return chave === SIT.andamento.chave || chave === SIT.atrasado.chave;
      return chave === filtro;
    });
    if (filtro !== SIT.andamento.chave) return lista;
    return [...lista].sort((a, b) =>
      (situacaoItem(b).chave === SIT.atrasado.chave) - (situacaoItem(a).chave === SIT.atrasado.chave));
  }, [folhas, busca, filtro]);

  const kpis = useMemo(() => {
    const c = { concluido: 0, andamento: 0, atrasado: 0, a_iniciar: 0, nao_iniciado: 0 };
    for (const i of folhas) c[situacaoItem(i).chave]++;
    return c;
  }, [folhas]);

  const avancoGeral = useMemo(() => percentualGrupo(folhas), [folhas]);
  const pontos = useMemo(() => curvaS(folhas, historico), [folhas, historico]);
  const ind = useMemo(() => indicadoresObra(folhas), [folhas]);

  // Salva várias medições de uma vez: um único upsert para o histórico e os
  // updates dos itens em paralelo (em vez de um round-trip por serviço).
  async function salvarLote(mudancas) {
    const hoje = hojeLocal();
    const res = await Promise.all(mudancas.map(({ item, percentual, concluido, inicio_real, concluido_em }) =>
      supabase.from('cronograma_itens').update({
        percentual: concluido ? 100 : percentual,
        concluido,
        inicio_real: inicio_real || null,
        concluido_em: concluido ? (concluido_em || item.concluido_em || hoje) : null,
      }).eq('id', item.id).select().single()
    ));
    const falha = res.find(r => r.error);
    if (falha) {
      console.error('Erro ao salvar em lote:', falha.error);
      avisarErro(falha.error, 'salvar tudo');
      return;
    }

    const linhas = mudancas.map(({ item, percentual, concluido }) => ({
      item_id: item.id, data_ref: hoje, percentual: concluido ? 100 : percentual,
    }));
    const { error: eHist } = await supabase.from('cronograma_avanco')
      .upsert(linhas, { onConflict: 'item_id,data_ref' });
    if (eHist) console.error('Erro ao gravar histórico em lote:', eHist);

    const atualizados = res.map(r => r.data);
    setItens(prev => prev.map(i => atualizados.find(a => a.id === i.id) || i));
    setHistorico(prev => [
      ...prev.filter(h => !(h.data_ref === hoje && linhas.some(l => l.item_id === h.item_id))),
      ...linhas,
    ]);
    setLote(false);
  }

  async function salvarAvanco(item, patch) {
    const { data, error } = await supabase
      .from('cronograma_itens').update(patch).eq('id', item.id).select().single();
    if (error) {
      console.error('Erro ao salvar avanço:', error);
      avisarErro(error, 'salvar');
      return;
    }

    // Guarda a medição do dia. É esse histórico que permite desenhar a curva
    // realizada: sem ele existiria só a foto de hoje, e não daria para dizer em
    // que pé a obra estava no fim de cada mês.
    const hoje = hojeLocal();
    const { error: eHist } = await supabase.from('cronograma_avanco')
      .upsert({ item_id: item.id, data_ref: hoje, percentual: patch.percentual },
              { onConflict: 'item_id,data_ref' });
    if (eHist) console.error('Erro ao gravar histórico de avanço:', eHist);
    else {
      setHistorico(prev => [
        ...prev.filter(h => !(h.item_id === item.id && h.data_ref === hoje)),
        { item_id: item.id, data_ref: hoje, percentual: patch.percentual },
      ]);
    }

    setItens(prev => prev.map(i => i.id === data.id ? data : i));
    setEditando(null);
  }

  const filtrando = !!(busca.trim() || filtro);

  // Grupos de primeiro nível (filhos da raiz ou do item 0)
  const topo = useMemo(() => {
    const raiz = filhosPorPai['raiz'] || [];
    // se só existe a linha do projeto, desce um nível
    if (raiz.length === 1 && raiz[0].is_grupo) return filhosPorPai[raiz[0].wbs_id] || [];
    return raiz;
  }, [filhosPorPai]);

  function renderGrupo(g, nivel = 0) {
    const fl = folhasDe(g.wbs_id);
    const pct = percentualGrupo(fl);
    const aberto = !!abertos[g.wbs_id];
    const filhos = filhosPorPai[g.wbs_id] || [];
    const atrasados = fl.filter(i => situacaoItem(i) === SIT.atrasado).length;
    return (
      <div key={g.wbs_id} className="card" style={{ padding: 0, overflow: 'hidden', marginLeft: nivel * 10 }}>
        <button onClick={() => setAbertos(p => ({ ...p, [g.wbs_id]: !p[g.wbs_id] }))} style={{
          width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
          padding: '11px 13px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, color: 'var(--text-3)', transform: aberto ? 'rotate(90deg)' : 'none', transition: 'transform .15s', flexShrink: 0 }}>
              {Icon.chevR}
            </span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 900, color: 'var(--text-1)' }}>{g.nome}</span>
            {atrasados > 0 && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)' }}>
                {atrasados} atrasada{atrasados !== 1 ? 's' : ''}
              </span>
            )}
            <span style={{ fontSize: 13, fontWeight: 900, color: 'var(--primary)', minWidth: 38, textAlign: 'right' }}>{pct}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
            <Barra pct={pct} cor="var(--primary)" alta />
            <span style={{ fontSize: 10.5, color: 'var(--text-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {fl.length} tarefa{fl.length !== 1 ? 's' : ''}
            </span>
          </div>
        </button>
        {aberto && (
          <div>
            {filhos.map(f => f.is_grupo
              ? <div key={f.wbs_id} style={{ padding: '6px 10px 10px' }}>{renderGrupo(f, nivel + 1)}</div>
              : <LinhaItem key={f.wbs_id} item={f} atividades={vinculos[f.id] || 0} onClick={() => setEditando(f)} />
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow={itens.length ? `${folhas.length} tarefas · ${avancoGeral}% da obra` : 'Nenhum cronograma importado'}
        title="Cronograma"
        right={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {itens.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => setLote(true)}>
                <span style={{ width: 14, height: 14 }}>{Icon.check}</span>Atualizar serviços
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={() => setImportar(true)}>
              <span style={{ width: 14, height: 14 }}>{Icon.download}</span>Importar
            </button>
          </div>
        }
      />

      {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

      {!loading && erro && (
        <div className="page-pad">
          <div className="card" style={{ padding: 16, background: 'var(--warn-tint)', color: 'var(--warn,#CA8A04)', fontSize: 13, fontWeight: 700, lineHeight: 1.6 }}>
            ⚠️ {erro}
          </div>
        </div>
      )}

      {!loading && !erro && itens.length === 0 && (
        <div className="page-pad">
          <div className="card" style={{ padding: '32px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📅</div>
            <div className="t-strong" style={{ fontSize: 15 }}>Nenhum cronograma importado</div>
            <div className="t-caption" style={{ marginTop: 6, marginBottom: 18, lineHeight: 1.6 }}>
              Cole o cronograma exportado do MS Project para acompanhar o avanço de cada item aqui.
            </div>
            <button className="btn btn-primary" onClick={() => setImportar(true)} style={{ height: 46, padding: '0 22px' }}>
              Importar cronograma
            </button>
          </div>
        </div>
      )}

      {!loading && !erro && itens.length > 0 && (
        <>
          {/* Indicadores */}
          <div style={{ padding: '0 var(--pad-4) 12px' }}>
            <Indicadores ind={ind} compacto={!isDesktop} />
          </div>

          {/* Curva S — só no desktop: no celular o gráfico fica ilegível e
              empurra a lista de serviços para fora da tela. */}
          {isDesktop && (
            <div style={{ padding: '0 var(--pad-4) 12px' }}>
              <CurvaS pontos={pontos} hoje={hojeLocal()} />
            </div>
          )}

          {/* Avanço geral — só desktop. No celular repete o "Está" dos
              indicadores logo acima. */}
          {isDesktop && (
            <div style={{ padding: '0 var(--pad-4) 12px' }}>
              <div className="card" style={{ padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>AVANÇO GERAL DA OBRA</span>
                  <span style={{ fontSize: 26, fontWeight: 900, color: 'var(--primary)' }}>{avancoGeral}%</span>
                </div>
                <Barra pct={avancoGeral} cor="var(--primary)" alta />
              </div>
            </div>
          )}

          {/* Filtros por situação. No celular são só três e cabem sem rolar de
              lado: as atrasadas entram dentro de "Em andamento". */}
          <StatChips valor={filtro} onChange={setFiltro} itens={
            (isDesktop
              ? [SIT.atrasado, SIT.andamento, SIT.a_iniciar, SIT.concluido, SIT.nao_iniciado]
              : [SIT.andamento, SIT.a_iniciar, SIT.nao_iniciado]
            ).map(s => ({
              chave: s.chave, label: s.label, cor: s.cor, limpavel: true,
              // A contagem tem que bater com a lista: "em andamento" mostra as
              // atrasadas junto, então conta as duas.
              n: s.chave === SIT.andamento.chave
                ? kpis[SIT.andamento.chave] + kpis[SIT.atrasado.chave]
                : kpis[s.chave],
            }))
          } />

          <div style={{ paddingBottom: 10 }}>
            <Search placeholder="Buscar tarefa do cronograma…" value={busca} onChange={setBusca} />
          </div>

          <div className="page-pad stack stack-2" style={{ paddingBottom: 28 }}>
            {filtrando ? (
              visiveis.length === 0 ? (
                <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  Nenhuma tarefa encontrada.
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  {visiveis.map(i => (
                    <LinhaItem key={i.wbs_id} item={i} atividades={vinculos[i.id] || 0} onClick={() => setEditando(i)} />
                  ))}
                </div>
              )
            ) : (
              topo.map(g => g.is_grupo
                ? renderGrupo(g)
                : (
                  <div key={g.wbs_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <LinhaItem item={g} atividades={vinculos[g.id] || 0} onClick={() => setEditando(g)} />
                  </div>
                )
              )
            )}
          </div>
        </>
      )}

      {editando && (
        <AvancoPopup item={editando}
          onSalvar={(patch) => salvarAvanco(editando, patch)}
          onCancel={() => setEditando(null)} />
      )}
      {lote && (
        <LotePopup folhas={folhas} onSalvar={salvarLote} onCancel={() => setLote(false)} />
      )}
      {importar && (
        <ImportarPopup
          onImportado={(n) => { setImportar(false); setAbertos({}); load(); alert(`${n} itens importados.`); }}
          onCancel={() => setImportar(false)} />
      )}
    </div>
  );
}

// Lista enxuta para o seletor de vínculo no planejamento semanal.
export async function listarItensVinculaveis() {
  const { data, error } = await supabase
    .from('cronograma_itens')
    .select('id, wbs_id, nome, is_grupo, inicio_previsto, termino_previsto, concluido')
    .eq('is_grupo', false)
    .order('ordem', { ascending: true });
  if (error) { console.error('Erro ao listar itens do cronograma:', error); return []; }
  return data || [];
}

// ── Seletor de vínculo (usado no planejamento semanal) ────────────────────
export function SeletorCronograma({ itens, valor, onChange, sugestao }) {
  if (!itens || itens.length === 0) return null;
  const sel = itens.find(i => i.id === valor);
  return (
    <div>
      <div className="t-micro" style={{ marginBottom: 6 }}>ITEM DO CRONOGRAMA (OPCIONAL)</div>
      <select className="ipt" value={valor || ''} onChange={e => onChange(e.target.value || null)} style={{ height: 52 }}>
        <option value="">Sem vínculo</option>
        {itens.map(i => (
          <option key={i.id} value={i.id}>
            {i.wbs_id} · {i.nome}{i.concluido ? ' (concluído)' : ''}
          </option>
        ))}
      </select>
      {sel && (
        <div className="t-caption" style={{ marginTop: 6, color: 'var(--text-3)' }}>
          Previsto {String(sel.inicio_previsto || '').slice(8, 10)}/{String(sel.inicio_previsto || '').slice(5, 7)}
          {' a '}{String(sel.termino_previsto || '').slice(8, 10)}/{String(sel.termino_previsto || '').slice(5, 7)}
        </div>
      )}
      {!valor && sugestao && (
        <button type="button" onClick={() => onChange(sugestao.id)} style={{
          marginTop: 8, width: '100%', padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
          border: '1.5px dashed var(--primary)', background: 'var(--primary-tint)',
          color: 'var(--primary)', fontSize: 12.5, fontWeight: 700, textAlign: 'left', fontFamily: 'inherit',
        }}>
          💡 Parece ser <strong>{sugestao.nome}</strong> — toque para vincular
        </button>
      )}
    </div>
  );
}

// Sugere o item do cronograma mais parecido com a descrição digitada.
export function sugerirItem(descricao, itens) {
  const d = normalizar(descricao);
  if (d.length < 3 || !itens?.length) return null;
  const palavras = d.split(/\s+/).filter(p => p.length > 2);
  if (!palavras.length) return null;
  let melhor = null, melhorNota = 0;
  for (const it of itens) {
    const nome = normalizar(it.nome);
    let nota = 0;
    for (const p of palavras) if (nome.includes(p)) nota += p.length;
    if (nome.includes(d)) nota += d.length * 2;
    if (nota > melhorNota) { melhorNota = nota; melhor = it; }
  }
  // exige uma semelhança mínima para não sugerir qualquer coisa
  return melhorNota >= 5 ? melhor : null;
}
