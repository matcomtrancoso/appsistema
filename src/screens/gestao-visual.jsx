// Gestão visual de plantas: sobe a planta (PDF ou imagem) e pinta o avanço em
// cima — pincel, retângulo ou seta, cada marcação numa ETAPA com cor e com a
// DATA do dia. É o registro de fim de expediente: mesmo com o RDO fechado,
// pintar as sapatas escavadas de hoje grava produção datada (etapa + dia),
// que a legenda já devolve como número.
//
// A marcação é vetor (jsonb) desenhado num SVG por cima da imagem — nunca
// "queimada" na planta: dá pra apagar, filtrar por etapa e contar.
import { MARCA } from '../marca.js';
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icon, Empty } from '../components/index';
import { normalizarLote, chaveDoLote, rotuloDoLote, lotesDoDia, coresDeLote, resumoDeLotes, resumoDeLotesPeriodo, CORES_LOTE } from '../lib/lotes-planta';
import { abrirImpressaoPlanta } from '../lib/planta-impressao';
import { hojeLocal } from '../lib/date';
import { useObra } from '../lib/ObraContext';
import { avisarErro } from '../lib/msg-amigavel';

const ETAPAS_BASE = [
  { nome: 'Escavado',   cor: '#EAB308', ativa: true, meta: null, unidade: 'un', ordem: 0 },
  { nome: 'Forma',      cor: '#2563EB', ativa: true, meta: null, unidade: 'un', ordem: 1 },
  { nome: 'Armado',     cor: '#7C3AED', ativa: true, meta: null, unidade: 'un', ordem: 2 },
  { nome: 'Concretado', cor: '#16A34A', ativa: true, meta: null, unidade: 'un', ordem: 3 },
];
const PALETA = ['#EAB308', '#2563EB', '#7C3AED', '#16A34A', '#DC2626', '#0891B2', '#EA580C', '#DB2777',
  '#0F766E', '#9333EA', '#B45309', '#475569'];
const UNIDADES_ETAPA = ['un', 'm²', 'm', 'm³', 'kg', 't'];

// Quanto vale uma marcação: 1 por padrão (unidade), ou a quantidade lançada
// quando a etapa é medida em m², m, m³…
const qtdDe = (m) => (m.quantidade == null ? 1 : Number(m.quantidade) || 0);
const fmtQtd = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.', ','));

const FERRAMENTAS = [
  { k: 'mover',  label: '✋ Mover',      dica: 'arrasta, dá zoom e seleciona um desenho (Enter, Espaço ou Esc)' },
  { k: 'pincel', label: '🖌️ Pincel',    dica: 'pinta área livre (tecla P)' },
  { k: 'ret',    label: '▭ Retângulo',  dica: 'marca uma região (tecla R)' },
  { k: 'seta',   label: '↗ Seta',       dica: 'aponta um elemento (tecla S)' },
  { k: 'varinha', label: '🪄 Detectar', dica: 'toca DENTRO de uma sapata/viga: o contorno fechado vira retângulo sozinho (tecla D)' },
  { k: 'etapa',  label: '🔁 Etapa',     dica: 'toca num desenho: ele avança para a etapa ativa sem perder o histórico (tecla E)' },
  { k: 'apagar', label: '🧽 Apagar',    dica: 'toca numa marcação para remover (tecla X)' },
];
const TECLA_FERRAMENTA = { p: 'pincel', r: 'ret', s: 'seta', e: 'etapa', x: 'apagar', d: 'varinha', v: 'mover', m: 'mover' };

const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '');

// Nome de peça em planta: P12, SAP-3, V10, B1A. Serve para escolher, entre os
// textos que caem dentro da marcação, qual é o identificador (e não a cota).
const PADRAO_PECA = /^[A-Z]{1,4}[-.\s]?\d{1,3}[A-Z]?$/;

// Endireita o traço do pincel: joga fora os pontos que o dedo tremeu e mantém
// só os cantos que definem a forma (Douglas-Peucker). O resultado é um
// contorno com lados retos, no lugar do rabisco.
function simplificar(pts, tol) {
  if (!pts || pts.length < 3) return pts || [];
  const dist = (p, a, b) => {
    const [px, py] = p, [ax, ay] = a, [bx, by] = b;
    const dx = bx - ax, dy = by - ay;
    if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };
  const passo = (ini, fim) => {
    let pior = 0, idx = 0;
    for (let i = ini + 1; i < fim; i++) {
      const d = dist(pts[i], pts[ini], pts[fim]);
      if (d > pior) { pior = d; idx = i; }
    }
    if (pior <= tol) return [pts[ini]];
    return [...passo(ini, idx), ...passo(idx, fim)];
  };
  return [...passo(0, pts.length - 1), pts[pts.length - 1]];
}

// Caixa que envolve a marcação, em pixels da imagem.
function bboxDe(tipo, pontos) {
  if (tipo === 'ret') return { x: pontos.x, y: pontos.y, w: pontos.w, h: pontos.h };
  if (tipo === 'seta') {
    const x = Math.min(pontos.x1, pontos.x2), y = Math.min(pontos.y1, pontos.y2);
    return { x, y, w: Math.abs(pontos.x2 - pontos.x1), h: Math.abs(pontos.y2 - pontos.y1) };
  }
  const pts = pontos.pts || [];
  if (!pts.length) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// Sugere o nome da peça: entre os textos do PDF que caem dentro da marcação,
// prefere os que parecem identificador e, no empate, o mais central.
function rotuloSugerido(textos, bbox) {
  if (!textos?.length || !bbox.w || !bbox.h) return '';
  const dentro = textos.filter(t => t.x >= bbox.x && t.x <= bbox.x + bbox.w && t.y >= bbox.y && t.y <= bbox.y + bbox.h);
  if (!dentro.length) return '';
  const cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2;
  const nota = (t) => (PADRAO_PECA.test(t.s) ? 0 : 1e6) + Math.hypot(t.x - cx, t.y - cy);
  return [...dentro].sort((a, b) => nota(a) - nota(b))[0].s.slice(0, 40);
}

function addDiasISO(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Popup 🕘: a vida da peça, etapa por etapa ─────────────────────────────
// A cadeia vem do campo `substitui`: cada avanço de etapa cria um registro
// novo apontando o anterior. Subimos até a origem e descemos até o mais
// recente, então dá para tocar em qualquer elo e ver a história inteira.
function HistoricoPopup({ marca, marcas, etapas, onFechar }) {
  // A peça é a mesma por três caminhos, porque nem todo mundo usa o 🔁:
  //   1. a cadeia de substituições (quem avançou etapa pelo botão);
  //   2. o mesmo nome de peça (P12 continua sendo P12);
  //   3. desenhos sobrepostos — marcar por cima da mesma sapata é o jeito
  //      natural de registrar a etapa seguinte.
  const centro = (m) => { const b = bboxDe(m.tipo, m.pontos); return [b.x + b.w / 2, b.y + b.h / 2]; };
  const dentro = (m, alvo) => {
    const b = bboxDe(alvo.tipo, alvo.pontos);
    const [cx, cy] = centro(m);
    return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
  };
  const mesmaPeca = (a, b) => {
    if (a.id === b.id) return true;
    if (a.substitui === b.id || b.substitui === a.id) return true;
    if (a.rotulo && b.rotulo && a.rotulo.trim().toLowerCase() === b.rotulo.trim().toLowerCase()) return true;
    return dentro(a, b) && dentro(b, a);   // um sobre o outro, nos dois sentidos
  };

  // Junta tudo que se liga à peça clicada, em cadeia (A liga B, B liga C).
  const grupo = new Map([[marca.id, marca]]);
  let cresceu = true;
  while (cresceu) {
    cresceu = false;
    for (const m of marcas) {
      if (grupo.has(m.id)) continue;
      for (const g of grupo.values()) {
        if (mesmaPeca(m, g)) { grupo.set(m.id, m); cresceu = true; break; }
      }
    }
  }
  const linha = [...grupo.values()].sort((a, b) =>
    String(a.data || '').localeCompare(String(b.data || '')) ||
    String(a.created_at || '').localeCompare(String(b.created_at || '')));

  const corDe = (nome) => etapas.find(e => e.nome === nome)?.cor || 'var(--text-2)';
  const unDe = (nome) => etapas.find(e => e.nome === nome)?.unidade || 'un';
  const nome = linha.find(m => m.rotulo)?.rotulo;

  const dias = (a, b) => {
    if (!a?.data || !b?.data) return null;
    const d = Math.round((new Date(b.data + 'T12:00:00') - new Date(a.data + 'T12:00:00')) / 86400000);
    return d > 0 ? d : null;
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 650, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 20, padding: '20px 20px 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>🕘 {nome || 'Histórico da peça'}</div>
            <div className="t-caption" style={{ fontSize: 12, marginTop: 2 }}>
              {linha.length} etapa{linha.length !== 1 ? 's' : ''} registrada{linha.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button onClick={onFechar} style={{ width: 30, height: 30, border: 0, borderRadius: 9, background: 'var(--surface-2)',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {linha.map((m, i) => {
            const cor = corDe(m.etapa);
            const gap = dias(linha[i - 1], m);
            const atualEste = m.id === marca.id;
            return (
              <div key={m.id}>
                {i > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 6, height: 26 }}>
                    <span style={{ width: 2, height: '100%', background: 'var(--border)', marginLeft: 5 }} />
                    {gap != null && (
                      <span className="t-caption" style={{ fontSize: 11 }}>{gap} dia{gap !== 1 ? 's' : ''} depois</span>
                    )}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderRadius: 12,
                  background: atualEste ? cor + '14' : 'var(--surface-2)',
                  border: atualEste ? `1.5px solid ${cor}` : '1px solid transparent' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 999, background: cor, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: cor }}>
                      {m.etapa}
                      {m.quantidade != null && (
                        <span style={{ color: 'var(--text-3)', fontWeight: 700 }}> · {fmtQtd(qtdDe(m))} {unDe(m.etapa)}</span>
                      )}
                    </div>
                    <div className="t-caption" style={{ fontSize: 11.5, marginTop: 1 }}>
                      {dataBR(m.data)}{m.criado_por_nome ? ` · ${m.criado_por_nome}` : ''}
                    </div>
                    {/* De qual viagem veio ESTA etapa da peça: a concretagem
                        teve caminhão, a escavação não — por isso é por linha. */}
                    {rotuloDoLote(m.lote, m.nota) && (
                      <div style={{ fontSize: 11.5, fontWeight: 800, marginTop: 1, color: 'var(--text-2)' }}>
                        🚛 {rotuloDoLote(m.lote, m.nota)}
                      </div>
                    )}
                  </div>
                  {atualEste && (
                    <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                      background: cor, color: '#fff' }}>SELECIONADA</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {linha.length === 1 && (
          <div className="t-caption" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
            Só uma etapa registrada nesta peça. As próximas entram aqui sozinhas quando você
            avançar com o 🔁, marcar por cima do mesmo lugar, ou usar o mesmo nome de peça.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Popup ⚙️: configurar as etapas da obra ────────────────────────────────
// Aqui a etapa deixa de ser rótulo e vira parâmetro: cor, unidade, meta de
// produtividade e se continua no painel (a fundação acaba e "Escavado" sai
// da barra sem apagar nada do que já foi pintado).
function EtapasPopup({ etapas, marcas, onRecarregar, onFechar }) {
  const [salvando, setSalvando] = useState('');
  const usos = useMemo(() => {
    const m = {};
    marcas.forEach(x => { m[x.etapa] = (m[x.etapa] || 0) + 1; });
    return m;
  }, [marcas]);

  async function patch(etapa, campos) {
    if (!etapa.id) { alert('Esta etapa veio de marcações antigas. Crie-a no + etapa para poder configurar.'); return; }
    setSalvando(etapa.nome);
    const { error } = await supabase.from('planta_etapas').update(campos).eq('id', etapa.id);
    setSalvando('');
    if (error) { console.error('Erro ao salvar etapa:', error); avisarErro(error, 'salvar'); return; }
    onRecarregar();
  }

  async function apagar(etapa) {
    if (usos[etapa.nome]) { alert(`"${etapa.nome}" tem ${usos[etapa.nome]} marcação(ões). Arquive em vez de apagar — o histórico continua valendo.`); return; }
    if (!confirm(`Apagar a etapa "${etapa.nome}"?`)) return;
    const { error } = await supabase.from('planta_etapas').delete().eq('id', etapa.id);
    if (error) { console.error(error); avisarErro(error, 'apagar'); return; }
    onRecarregar();
  }

  const inp = { fontFamily: 'inherit', fontSize: 13, padding: '6px 9px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 20, padding: '20px 20px 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>⚙️ Etapas da obra</div>
            <div className="t-caption" style={{ fontSize: 12, marginTop: 2 }}>Cor, unidade, meta por dia e quais aparecem no painel.</div>
          </div>
          <button onClick={onFechar} style={{ width: 30, height: 30, border: 0, borderRadius: 9, background: 'var(--surface-2)',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {etapas.map(e => (
            <div key={e.nome} style={{ border: '0.5px solid var(--border)', borderRadius: 14, padding: '12px 13px',
              opacity: e.ativa === false ? 0.62 : 1, background: e.ativa === false ? 'var(--surface-2)' : 'var(--surface)' }}>

              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, background: e.cor, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.nome}
                  {usos[e.nome] ? <span className="t-caption" style={{ fontWeight: 600, marginLeft: 6 }}>{usos[e.nome]} marcaç{usos[e.nome] === 1 ? 'ão' : 'ões'}</span> : null}
                </span>
                {salvando === e.nome && <span className="t-caption" style={{ fontSize: 11 }}>salvando…</span>}
                <button onClick={() => patch(e, { ativa: e.ativa === false })}
                  title={e.ativa === false ? 'voltar para o painel' : 'arquivar (some do painel, marcações continuam)'}
                  style={{ height: 28, padding: '0 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 800,
                    border: '1px solid var(--border)', background: e.ativa === false ? 'var(--surface)' : 'var(--primary-tint)',
                    color: e.ativa === false ? 'var(--text-3)' : 'var(--primary)' }}>
                  {e.ativa === false ? '📦 arquivada' : '✓ no painel'}
                </button>
                {!usos[e.nome] && e.id && (
                  <button onClick={() => apagar(e)} title="apagar etapa"
                    style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 9 }}>
                {PALETA.map(c => (
                  <button key={c} onClick={() => patch(e, { cor: c })} title="usar esta cor"
                    style={{ width: 22, height: 22, borderRadius: 999, cursor: 'pointer', background: c,
                      border: e.cor === c ? '2.5px solid var(--text)' : '1px solid var(--border)' }} />
                ))}
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="t-caption" style={{ fontSize: 11.5 }}>Meta/dia</span>
                <input type="number" min="0" step="any" defaultValue={e.meta ?? ''} placeholder="opcional"
                  onBlur={ev => { const v = ev.target.value.trim(); const n = v === '' ? null : Number(v);
                    if (String(e.meta ?? '') !== String(n ?? '')) patch(e, { meta: n }); }}
                  style={{ ...inp, width: 92, textAlign: 'right' }} />
                <select defaultValue={e.unidade || 'un'} onChange={ev => patch(e, { unidade: ev.target.value })} style={{ ...inp, width: 78 }}>
                  {UNIDADES_ETAPA.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="t-caption" style={{ fontSize: 11, flex: 1, minWidth: 120 }}>
                  {e.meta ? 'o alerta do dia compara com esta meta' : 'sem meta: compara com a média dos dias'}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="t-caption" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
          Arquivar não apaga nada: as marcações continuam na planta e no resumo, a etapa só sai da barra de trabalho.
          Unidade diferente de <b>un</b> faz aparecer o campo "cada marca =" na barra de ferramentas.
        </div>
      </div>
    </div>
  );
}

// ── Popup ✏️: corrigir etapa e data de UMA marcação ────────────────────────
function MarcaEditPopup({ marca, etapas, onSalvar, onFechar }) {
  const [etapa, setEtapa] = useState(marca.etapa);
  const [data, setData] = useState(marca.data);
  const [rotulo, setRotulo] = useState(marca.rotulo || '');
  const [quantidade, setQuantidade] = useState(marca.quantidade ?? '');
  const [lote, setLote] = useState(marca.lote || '');
  const [nota, setNota] = useState(marca.nota || '');
  const unidade = etapas.find(e => e.nome === etapa)?.unidade || 'un';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface)', borderRadius: 20,
        padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>✏️ Editar marcação</div>
          <button onClick={onFechar} style={{ width: 30, height: 30, border: 0, borderRadius: 9,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>ETAPA</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {etapas.map(e => (
            <button key={e.nome} onClick={() => setEtapa(e.nome)}
              style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '7px 12px', borderRadius: 20,
                border: etapa === e.nome ? 'none' : '1px solid var(--border)',
                background: etapa === e.nome ? e.cor : 'var(--surface)',
                color: etapa === e.nome ? '#fff' : 'var(--text-2)' }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999,
                background: etapa === e.nome ? 'rgba(255,255,255,0.8)' : e.cor, marginRight: 5 }} />
              {e.nome}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>DIA DO SERVIÇO</div>
        <input type="date" value={data} max={hojeLocal()} onChange={e => setData(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
            background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', marginBottom: 14 }} />

        {unidade !== 'un' && (
          <>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>QUANTIDADE ({unidade})</div>
            <input type="number" min="0" step="any" value={quantidade} onChange={e => setQuantidade(e.target.value)} placeholder="0"
              style={{ width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
                background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', marginBottom: 14 }} />
          </>
        )}

        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>PEÇA (OPCIONAL)</div>
        <input value={rotulo} onChange={e => setRotulo(e.target.value)} placeholder="Ex: P12, SAP-3, V10"
          style={{ width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
            background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', marginBottom: 14 }} />

        {/* Placa ou nota erradas no campo se corrigem aqui — sem apagar a peça.
            A NF é o que separa duas viagens da MESMA placa, então mudar ela
            pode mover a peça para outro lote (e outra cor), que é o esperado. */}
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>CAMINHÃO / REMESSA (OPCIONAL)</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <input value={lote} onChange={e => setLote(e.target.value)} placeholder="BT1111"
            style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
              background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase' }} />
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="NF 4521"
            style={{ width: 120, flexShrink: 0, boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
              background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', textTransform: 'uppercase' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onFechar} style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => onSalvar({ etapa, cor: (etapas.find(e => e.nome === etapa)?.cor) || marca.cor, data,
            rotulo: rotulo.trim() || null, lote: normalizarLote(lote), nota: normalizarLote(nota),
            quantidade: unidade === 'un' ? null : (Number(quantidade) || null) })}
            style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', background: 'var(--primary)', color: '#fff',
              fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}

// ── Popup 📊: produção por período navegável, com média diária ────────────
function ResumoPopup({ planta, marcas, etapas, onFechar }) {
  const [periodo, setPeriodo] = useState('semana');  // semana | mes | tudo
  const [offset, setOffset] = useState(0);           // 0 = atual; -1 passada; +1 à frente
  const hoje = hojeLocal();

  const corDe = (nome) => etapas.find(e => e.nome === nome)?.cor || 'var(--text-2)';
  const unDe = (nome) => etapas.find(e => e.nome === nome)?.unidade || 'un';
  const metaDe = (nome) => { const v = etapas.find(e => e.nome === nome)?.meta; return v != null && Number(v) > 0 ? Number(v) : null; };
  const pad2 = (n) => String(n).padStart(2, '0');

  // Janela navegável: ‹ › anda semanas ou meses, pra trás e pra frente.
  let de = null, ate = null, rotulo = 'Desde o início';
  if (periodo === 'semana') {
    const dow = new Date(hoje + 'T12:00:00').getDay();
    de = addDiasISO(addDiasISO(hoje, dow === 0 ? -6 : 1 - dow), offset * 7);
    ate = addDiasISO(de, 6);
    rotulo = `${dataBR(de)} – ${dataBR(ate)}`;
  } else if (periodo === 'mes') {
    const d = new Date(hoje + 'T12:00:00');
    const x = new Date(d.getFullYear(), d.getMonth() + offset, 1);
    de = `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-01`;
    const u = new Date(x.getFullYear(), x.getMonth() + 1, 0);
    ate = `${u.getFullYear()}-${pad2(u.getMonth() + 1)}-${pad2(u.getDate())}`;
    const nome = x.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    rotulo = nome.charAt(0).toUpperCase() + nome.slice(1);
  }

  const noPeriodo = marcas.filter(m => m.data && (!de || (m.data >= de && m.data <= ate)));
  const viagens = resumoDeLotesPeriodo(marcas, de, ate);

  // Por etapa: quanto saiu na janela, em quantos dias trabalhados, e a média
  // diária real (produção ÷ dias em que aquela etapa andou).
  const linhas = [];
  const porEtapa = {};
  const totalGeral = {};
  marcas.forEach(m => { totalGeral[m.etapa] = (totalGeral[m.etapa] || 0) + qtdDe(m); });
  noPeriodo.forEach(m => {
    if (!porEtapa[m.etapa]) { porEtapa[m.etapa] = { n: 0, dias: new Set() }; linhas.push(m.etapa); }
    porEtapa[m.etapa].n += qtdDe(m);
    porEtapa[m.etapa].dias.add(m.data);
  });

  // Quais peças andaram na janela: o número diz o ritmo, o nome diz onde.
  const pecasPorEtapa = {};
  noPeriodo.forEach(m => {
    if (!pecasPorEtapa[m.etapa]) pecasPorEtapa[m.etapa] = { nomes: new Set(), semNome: 0 };
    const r = (m.rotulo || '').trim();
    if (r) pecasPorEtapa[m.etapa].nomes.add(r);
    else pecasPorEtapa[m.etapa].semNome += 1;
  });
  // P2 antes de P10: ordem de obra, não de dicionário.
  const ordemNatural = (a, b) => a.localeCompare(b, 'pt-BR', { numeric: true });

  const porDia = {};
  noPeriodo.forEach(m => {
    if (!porDia[m.data]) porDia[m.data] = {};
    porDia[m.data][m.etapa] = (porDia[m.data][m.etapa] || 0) + qtdDe(m);
  });
  const dias = Object.keys(porDia).sort().reverse();
  const diasTrabalhados = dias.length;

  const num1 = (v) => v.toFixed(1).replace('.', ',').replace(',0', '');
  const media = (nome) => {
    const c = porEtapa[nome];
    return c.dias.size ? num1(c.n / c.dias.size) : '—';
  };

  const chipP = (on) => ({ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 12px',
    borderRadius: 20, border: on ? 'none' : '1px solid var(--border)',
    background: on ? 'var(--text)' : 'var(--surface)', color: on ? 'var(--surface)' : 'var(--text-2)' });
  const th = { fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em', textAlign: 'center', padding: '6px 6px' };
  const td = { fontSize: 14, fontWeight: 800, textAlign: 'center', padding: '7px 6px' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 500, maxHeight: '86vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 20, padding: '20px 20px 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900 }}>📊 Produção da planta</div>
            <div className="t-caption" style={{ fontSize: 12, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{planta.nome}</div>
          </div>
          <button onClick={onFechar} style={{ width: 30, height: 30, border: 0, borderRadius: 9, background: 'var(--surface-2)',
            color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Período + navegação semana a semana / mês a mês */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          {[['semana', 'Semana'], ['mes', 'Mês'], ['tudo', 'Tudo']].map(([k, l]) => (
            <button key={k} onClick={() => { setPeriodo(k); setOffset(0); }} style={chipP(periodo === k)}>{l}</button>
          ))}
        </div>
        {periodo !== 'tudo' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <button onClick={() => setOffset(o => o - 1)} style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14 }}>‹</button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{rotulo}</div>
              <div className="t-caption" style={{ fontSize: 11 }}>
                {offset === 0 ? (periodo === 'semana' ? 'esta semana' : 'este mês') : offset < 0 ? 'passado' : 'à frente'}
                {offset !== 0 && (
                  <button onClick={() => setOffset(0)} style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, fontWeight: 800, color: 'var(--primary)', marginLeft: 6 }}>voltar pra hoje</button>
                )}
              </div>
            </div>
            <button onClick={() => setOffset(o => o + 1)} style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14 }}>›</button>
          </div>
        )}

        {noPeriodo.length === 0 ? (
          <div className="t-caption" style={{ padding: '18px 0', textAlign: 'center' }}>
            Nada pintado {periodo === 'tudo' ? 'ainda' : `em ${rotulo}`}.
          </div>
        ) : (
          <>
            <div style={{ border: '0.5px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-2)' }}>
                    <th style={{ ...th, textAlign: 'left' }}>ETAPA</th>
                    <th style={th}>NO PERÍODO</th>
                    <th style={th}>MÉDIA/DIA</th>
                    <th style={th}>TOTAL GERAL</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map(nome => {
                    const cor = corDe(nome);
                    return (
                      <tr key={nome} style={{ borderTop: '0.5px solid var(--border)' }}>
                        <td style={{ ...td, textAlign: 'left', fontSize: 13 }}>
                          <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 999, background: cor, marginRight: 7 }} />
                          {nome}
                        </td>
                        <td style={{ ...td, color: cor }}>{fmtQtd(porEtapa[nome].n)}<span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 3 }}>{unDe(nome)}</span></td>
                        <td style={{ ...td, color: metaDe(nome) && porEtapa[nome].dias.size
                          ? (porEtapa[nome].n / porEtapa[nome].dias.size >= metaDe(nome) ? 'var(--success,#16A34A)' : 'var(--warn,#B0700B)')
                          : 'var(--text-2)' }}>
                          {media(nome)}{metaDe(nome) ? <span style={{ fontSize: 10, color: 'var(--text-3)' }}> /{num1(metaDe(nome))}</span> : null}
                        </td>
                        <td style={{ ...td, color: 'var(--text-3)' }}>{fmtQtd(totalGeral[nome])}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ borderTop: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                    <td style={{ ...td, textAlign: 'left', fontSize: 12, color: 'var(--text-2)' }}>Total</td>
                    <td style={td}>{noPeriodo.length}</td>
                    <td style={{ ...td, fontSize: 12, color: 'var(--text-2)' }}>
                      {diasTrabalhados ? num1(noPeriodo.length / diasTrabalhados) : '—'}
                    </td>
                    <td style={td}>{marcas.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="t-caption" style={{ fontSize: 11, marginBottom: 14 }}>
              Média por dia trabalhado: produção ÷ dias com marcação ({diasTrabalhados} dia{diasTrabalhados !== 1 ? 's' : ''} no período).
            </div>

            {/* Nome das peças por etapa: saber que foram 6 sapatas é ritmo;
                saber que foram a P3 e a P4 é o que responde na reunião. */}
            <div className="t-micro" style={{ marginBottom: 8 }}>PEÇAS NO PERÍODO</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {linhas.map(nome => {
                const cor = corDe(nome);
                const pe = pecasPorEtapa[nome] || { nomes: new Set(), semNome: 0 };
                const lista = [...pe.nomes].sort(ordemNatural);
                return (
                  <div key={nome} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: lista.length ? 6 : 0 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 999, background: cor }} />
                      <span style={{ fontSize: 12, fontWeight: 800, color: cor }}>{nome}</span>
                      <span className="t-caption" style={{ fontSize: 11 }}>
                        {lista.length} peça{lista.length !== 1 ? 's' : ''} com nome
                        {pe.semNome ? ' · ' + pe.semNome + ' sem nome' : ''}
                      </span>
                    </div>
                    {lista.length > 0 ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {lista.map(r => (
                          <span key={r} style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                            background: cor + '22', color: cor }}>{r}</span>
                        ))}
                      </div>
                    ) : (
                      <div className="t-caption" style={{ fontSize: 11 }}>
                        Nenhuma peça nomeada aqui — clique num desenho no modo ✋ e dê o nome dela.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cada viagem, em ordem de chegada, com o que descarregou. É o
                que responde "o BT1111 da NF 4521 concretou o quê?" — e por que
                a NF existe: a mesma placa volta, e são duas linhas. */}
            {viagens.length > 0 && (
              <>
                <div className="t-micro" style={{ marginBottom: 8 }}>CAMINHÕES NO PERÍODO</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                  {viagens.map((v, i) => (
                    <div key={v.data + v.chave + i} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: v.nomes.length ? 6 : 0 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 999, background: v.corManual || CORES_LOTE[i % CORES_LOTE.length], flexShrink: 0 }} />
                        <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11.5, fontWeight: 800, color: 'var(--text-3)' }}>{dataBR(v.data)}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{v.rotulo}</span>
                        <span className="t-caption" style={{ fontSize: 11 }}>
                          {v.pecas} {v.pecas === 1 ? 'peça' : 'peças'}
                          {v.quantidade > 0 ? ` · ${fmtQtd(v.quantidade)}` : ''}
                          {v.etapas.length ? ` · ${v.etapas.join(', ')}` : ''}
                        </span>
                      </div>
                      {v.nomes.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {[...v.nomes].sort(ordemNatural).map(n => (
                            <span key={n} style={{ fontSize: 11.5, fontWeight: 800, padding: '3px 9px', borderRadius: 999,
                              background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' }}>{n}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="t-micro" style={{ marginBottom: 8 }}>DIA A DIA</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
              {dias.map(d => (
                <div key={d} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                  padding: '7px 10px', borderRadius: 10, background: 'var(--surface-2)' }}>
                  <span style={{ fontFamily: 'var(--mono, monospace)', fontSize: 12, fontWeight: 800,
                    color: d === hoje ? 'var(--primary)' : 'var(--text-2)', minWidth: 42 }}>{dataBR(d)}</span>
                  {Object.entries(porDia[d]).map(([nome, n]) => (
                    <span key={nome} style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 999,
                      background: corDe(nome) + '22', color: corDe(nome) }}>{nome} {fmtQtd(n)} {unDe(nome) !== 'un' ? unDe(nome) : ''}</span>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Tela principal: lista de plantas ou editor ────────────────────────────
const PAVIMENTOS_SUGERIDOS = ['Subsolo', 'Térreo', '1º Pavimento', '2º Pavimento', '3º Pavimento', 'Cobertura'];

export function GestaoVisual() {
  const [plantas, setPlantas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aberta, setAberta] = useState(null);      // planta em edição
  const [subindo, setSubindo] = useState(false);
  const [pendente, setPendente] = useState(null);  // arquivo aguardando nome/pavimento
  const [editando, setEditando] = useState(null);  // planta com nome/pavimento em edição
  const fileRef = useRef(null);

  const load = useCallback(() => {
    supabase.from('plantas_visuais').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('Erro ao carregar plantas:', error);
        setPlantas(data || []);
        setLoading(false);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  // O arquivo escolhido espera nome e pavimento no popup antes de subir.
  function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPendente({ file, nome: file.name.replace(/\.[^.]+$/, '') });
  }

  // PDF vira PNG aqui no navegador (pdfjs só carrega quando precisa): guardar
  // imagem pronta deixa a visualização leve e o overlay simples.
  async function processarPendente(nome, pavimento) {
    const file = pendente?.file;
    setPendente(null);
    if (!file) return;
    setSubindo(true);
    try {
      let blob, largura, altura, textos = null;
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        const pdfjs = await import('pdfjs-dist');
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
        const page = await pdf.getPage(1);
        const base = page.getViewport({ scale: 1 });
        // Resolução alta o bastante para dar zoom na sapata sem virar borrão.
        const scale = Math.min(4, 4000 / Math.max(base.width, base.height));
        const vp = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        largura = canvas.width; altura = canvas.height;
        // Camada de texto do PDF (nomes de pilar, sapata, viga) já convertida
        // para pixels da imagem: é o que permite sugerir o rótulo depois.
        try {
          const tc = await page.getTextContent();
          textos = tc.items
            .filter(i => i.str && i.str.trim())
            .map(i => {
              const t = pdfjs.Util.transform(vp.transform, i.transform);
              return { s: i.str.trim().slice(0, 40), x: Math.round(t[4]), y: Math.round(t[5]) };
            });
        } catch (e) { console.warn('Sem camada de texto no PDF:', e); }
      } else if (file.type.startsWith('image/')) {
        const dims = await new Promise((res, rej) => {
          const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = rej;
          img.src = URL.createObjectURL(file);
        });
        blob = file; largura = dims.w; altura = dims.h;
      } else {
        alert('Formato não suportado — envie um PDF ou uma imagem.');
        setSubindo(false); return;
      }
      const path = `plantas/${Date.now()}_${Math.random().toString(36).slice(2)}.png`;
      const { error: upErr } = await supabase.storage.from('fotos').upload(path, blob, { upsert: false, contentType: 'image/png' });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('fotos').getPublicUrl(path);
      const { data: nova, error: insErr } = await supabase.from('plantas_visuais')
        .insert({ nome, imagem_url: pub.publicUrl, largura, altura, pavimento: pavimento || null, textos }).select().single();
      if (insErr) throw insErr;
      setPlantas(ps => [nova, ...ps]);
      setAberta(nova);
    } catch (err) {
      console.error('Erro ao subir a planta:', err);
      avisarErro(err, 'preparar a planta');
    }
    setSubindo(false);
  }

  async function apagarPlanta(p) {
    if (!confirm(`Apagar a planta "${p.nome}" e todas as marcações?`)) return;
    const { error } = await supabase.from('plantas_visuais').delete().eq('id', p.id);
    if (error) { console.error(error); avisarErro(error, 'apagar'); return; }
    setPlantas(ps => ps.filter(x => x.id !== p.id));
  }

  async function salvarEdicao(nome, pavimento) {
    const p = editando;
    setEditando(null);
    if (!p) return;
    const { data, error } = await supabase.from('plantas_visuais')
      .update({ nome, pavimento: pavimento || null }).eq('id', p.id).select().single();
    if (error) { console.error(error); avisarErro(error, 'salvar'); return; }
    setPlantas(ps => ps.map(x => (x.id === p.id ? data : x)));
  }

  // Agrupa por pavimento na ordem natural do prédio; o resto vai por nome.
  const grupos = useMemo(() => {
    const m = new Map();
    plantas.forEach(p => {
      const k = p.pavimento || 'Sem pavimento';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    });
    const pos = (k) => { const i = PAVIMENTOS_SUGERIDOS.indexOf(k); return i < 0 ? 99 : i; };
    return [...m.entries()].sort((a, b) => (pos(a[0]) - pos(b[0])) || a[0].localeCompare(b[0], 'pt-BR'));
  }, [plantas]);

  if (aberta) return <PlantaEditor planta={aberta} onVoltar={() => { setAberta(null); load(); }} />;

  return (
    <div className="page">
      <div style={{ padding: '16px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <div className="t-micro">ACOMPANHAMENTO NA PLANTA</div>
          <div className="t-h1">Gestão visual</div>
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,image/*" onChange={handleFile} style={{ display: 'none' }} />
        <button onClick={() => fileRef.current?.click()} disabled={subindo} className="btn btn-primary btn-sm">
          {subindo ? 'Preparando…' : '+ Planta'}
        </button>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}
        {!loading && plantas.length === 0 && (
          <Empty title="Nenhuma planta ainda" sub="Suba o PDF da planta (fundação, formas…) e pinte o que já foi executado." />
        )}
        {grupos.map(([pav, lista]) => (
          <div key={pav} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '0 2px 8px' }}>
              <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 800 }}>🏢 {pav}</span>
              <span className="t-caption" style={{ fontSize: 11.5 }}>{lista.length}</span>
              <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
              {lista.map(p => (
                <div key={p.id} className="card tap" onClick={() => setAberta(p)} style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
                  <div style={{ height: 130, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <img src={p.imagem_url} alt={p.nome} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-strong" style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                      <div className="t-caption" style={{ fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setEditando(p); }} title="renomear / mudar pavimento"
                      style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>✏️</button>
                    <button onClick={(e) => { e.stopPropagation(); apagarPlanta(p); }} title="apagar planta"
                      style={{ border: 0, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 15 }}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {pendente && (
        <PlantaFormPopup titulo="Nova planta" nomeInicial={pendente.nome} pavimentoInicial=""
          onSalvar={processarPendente} onFechar={() => setPendente(null)} />
      )}
      {editando && (
        <PlantaFormPopup titulo="Editar planta" nomeInicial={editando.nome} pavimentoInicial={editando.pavimento || ''}
          onSalvar={salvarEdicao} onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}

// ── Popup de nome + pavimento (novo upload e edição) ──────────────────────
function PlantaFormPopup({ titulo, nomeInicial, pavimentoInicial, onSalvar, onFechar }) {
  const [nome, setNome] = useState(nomeInicial);
  const [pavimento, setPavimento] = useState(pavimentoInicial);
  const pronto = nome.trim().length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'var(--surface)', borderRadius: 20,
        padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>🗺️ {titulo}</div>
          <button onClick={onFechar} style={{ width: 30, height: 30, border: 0, borderRadius: 9,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>NOME DA PLANTA *</div>
        <input autoFocus value={nome} onChange={e => setNome(e.target.value)}
          placeholder="Ex: Fundação — sapatas"
          style={{ width: '100%', boxSizing: 'border-box', height: 48, borderRadius: 12, border: '1.5px solid var(--border)',
            background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', marginBottom: 14 }} />

        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>PAVIMENTO</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {PAVIMENTOS_SUGERIDOS.map(pv => (
            <button key={pv} onClick={() => setPavimento(pavimento === pv ? '' : pv)}
              style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 11px', borderRadius: 20,
                border: pavimento === pv ? 'none' : '1px solid var(--border)',
                background: pavimento === pv ? 'var(--primary)' : 'var(--surface)',
                color: pavimento === pv ? '#fff' : 'var(--text-2)' }}>{pv}</button>
          ))}
        </div>
        <input value={pavimento} onChange={e => setPavimento(e.target.value)}
          placeholder="Ou digite outro (ex: Mezanino)"
          style={{ width: '100%', boxSizing: 'border-box', height: 42, borderRadius: 12, border: '1.5px solid var(--border)',
            background: 'var(--surface-2)', padding: '0 14px', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit', marginBottom: 18 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onFechar} style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={() => pronto && onSalvar(nome.trim(), pavimento.trim())} disabled={!pronto}
            style={{ flex: 2, height: 46, borderRadius: 12, border: 'none',
              background: pronto ? 'var(--primary)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Editor: imagem + overlay SVG de marcações ─────────────────────────────
function PlantaEditor({ planta, onVoltar }) {
  const { profile } = useObra();
  const [marcas, setMarcas] = useState([]);
  const [etapas, setEtapas] = useState(ETAPAS_BASE);
  const [etapaAtiva, setEtapaAtiva] = useState(ETAPAS_BASE[0].nome);
  const [ferramenta, setFerramenta] = useState('mover');
  const [dataMarca, setDataMarca] = useState(hojeLocal());
  const [ocultas, setOcultas] = useState(() => new Set());
  const [zoom, setZoom] = useState(1);
  const [rascunho, setRascunho] = useState(null);   // desenho em andamento
  const [novaEtapa, setNovaEtapa] = useState(false);
  const [showResumo, setShowResumo] = useState(false);
  const [selecionada, setSelecionada] = useState(null);   // marcação clicada no modo mover
  const [editMarca, setEditMarca] = useState(null);       // marcação em edição (etapa/data)
  const [showEtapas, setShowEtapas] = useState(false);    // painel de configuração das etapas
  const [qtdPadrao, setQtdPadrao] = useState('');         // quanto vale cada marcação (m², m…)
  const [espessura, setEspessura] = useState(1);          // 0.5 fino · 1 normal · 2 grosso
  const [historico, setHistorico] = useState(null);       // peça cujo histórico está aberto
  const [verRotulos, setVerRotulos] = useState(true);     // nomes das peças por cima do desenho
  const [loteAtivo, setLoteAtivo] = useState('');         // placa (BT) das próximas marcações
  const [notaAtiva, setNotaAtiva] = useState('');         // NF da viagem — é ela que separa duas idas da MESMA placa
  const [corLote, setCorLote] = useState(null);           // lote cuja cor está sendo trocada
  const [porLote, setPorLote] = useState(false);          // planta colorida por caminhão, não por etapa
  const svgRef = useRef(null);
  const contRef = useRef(null);
  const desenhando = useRef(false);
  const pan = useRef(null);        // arrasto da mãozinha (mouse)
  const panMoveu = useRef(false);  // arrastou? então o soltar não é clique
  const panGesto = useRef(false);  // gesto do mouse na mãozinha em andamento
  const alvoDown = useRef(null);   // marcação sob o cursor quando o gesto começou
  const toques = useRef(new Map());// dedos na tela (pinça)
  const pinca = useRef(null);      // zoom de dois dedos em andamento
  const zoomRef = useRef(1);
  const grade = useRef(null);      // imagem binarizada p/ varinha (lazy)
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // Atalhos: Enter/Espaço/Esc voltam pra mãozinha; P/R/S/E/X trocam ferramenta.
  useEffect(() => {
    const fn = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        setFerramenta('mover');
        if (e.key === 'Escape') setSelecionada(null);
        return;
      }
      if (e.key.toLowerCase() === 'n') { setVerRotulos(v => !v); return; }
      const f = TECLA_FERRAMENTA[e.key.toLowerCase()];
      if (f) setFerramenta(f);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  // Zoom no scroll do mouse, ancorado no cursor (estilo CAD). Listener nativo
  // porque o React registra wheel como passivo e o preventDefault não pega.
  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = cont.getBoundingClientRect();
      const mx = e.clientX - rect.left + cont.scrollLeft;
      const my = e.clientY - rect.top + cont.scrollTop;
      setZoom(z => {
        const nz = Math.min(6, Math.max(0.35, +(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(3)));
        if (nz === z) return z;
        const f = nz / z;
        requestAnimationFrame(() => {
          cont.scrollLeft = mx * f - (e.clientX - rect.left);
          cont.scrollTop  = my * f - (e.clientY - rect.top);
        });
        return nz;
      });
    };
    cont.addEventListener('wheel', onWheel, { passive: false });
    return () => cont.removeEventListener('wheel', onWheel);
  }, []);

  // Etapas vêm da configuração da obra; as que só existem em marcações antigas
  // entram como legado (arquivadas) para nada sumir da planta.
  const carregarEtapas = useCallback((marcasAtuais) => {
    supabase.from('planta_etapas').select('*').order('ordem').then(({ data, error }) => {
      if (error) { console.error('Erro ao carregar etapas:', error); return; }
      const cfg = data || [];
      const vistas = new Map(cfg.map(e => [e.nome, e]));
      (marcasAtuais || []).forEach(m => {
        if (!vistas.has(m.etapa)) vistas.set(m.etapa, { nome: m.etapa, cor: m.cor, ativa: false, meta: null, unidade: 'un', ordem: 99 });
      });
      const lista = [...vistas.values()];
      setEtapas(lista);
      setEtapaAtiva(atual => (lista.some(e => e.nome === atual && e.ativa !== false) ? atual
        : (lista.find(e => e.ativa !== false)?.nome || atual)));
    });
  }, []);

  useEffect(() => {
    supabase.from('planta_marcacoes').select('*').eq('planta_id', planta.id).order('created_at')
      .then(({ data, error }) => {
        if (error) { console.error('Erro ao carregar marcações:', error); return; }
        const lista = data || [];
        setMarcas(lista);
        carregarEtapas(lista);
      });
  }, [planta.id, carregarEtapas]);

  const cfgAtiva = etapas.find(e => e.nome === etapaAtiva);
  const corAtiva = cfgAtiva?.cor || PALETA[0];
  const unidadeAtiva = cfgAtiva?.unidade || 'un';
  const metaAtiva = cfgAtiva?.meta != null && Number(cfgAtiva.meta) > 0 ? Number(cfgAtiva.meta) : null;
  const desenhavel = ['pincel', 'ret', 'seta'].includes(ferramenta);
  const traco = Math.max(3, Math.round(planta.largura * 0.004));

  // ── Pinça (dois dedos) no celular: zoom ancorado no meio dos dedos ──────
  function contPointerDown(ev) {
    if (ev.pointerType !== 'touch') return;
    toques.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (toques.current.size === 2) {
      desenhando.current = false; setRascunho(null);   // segundo dedo cancela o traço
      const [a, b] = [...toques.current.values()];
      const cont = contRef.current, rect = cont.getBoundingClientRect();
      pinca.current = {
        dist0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        z0: zoomRef.current,
        midX: (a.x + b.x) / 2 - rect.left, midY: (a.y + b.y) / 2 - rect.top,
        sl: cont.scrollLeft, st: cont.scrollTop,
      };
    }
  }
  function contPointerMove(ev) {
    if (ev.pointerType !== 'touch' || !toques.current.has(ev.pointerId)) return;
    toques.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinca.current && toques.current.size >= 2) {
      const [a, b] = [...toques.current.values()];
      const p = pinca.current;
      const nz = Math.min(6, Math.max(0.35, +(p.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / p.dist0)).toFixed(3)));
      const f = nz / p.z0;
      setZoom(nz);
      const cont = contRef.current;
      requestAnimationFrame(() => {
        cont.scrollLeft = (p.midX + p.sl) * f - p.midX;
        cont.scrollTop  = (p.midY + p.st) * f - p.midY;
      });
    }
  }
  function contPointerUp(ev) {
    toques.current.delete(ev.pointerId);
    if (toques.current.size < 2) pinca.current = null;
  }

  // ── Varinha: acha o contorno fechado em volta do toque e sugere o bloco ──
  // Binariza a planta uma vez (reduzida) e faz flood fill da área clara onde
  // você tocou; as linhas escuras são a fronteira. O bbox vira retângulo.
  async function prepararGrade() {
    if (grade.current) return grade.current;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = planta.imagem_url; });
    const fator = Math.min(1, 1400 / Math.max(planta.largura, planta.altura));
    const w = Math.round(planta.largura * fator), h = Math.round(planta.altura * fator);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data;
    const bin = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      bin[i] = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) < 170 ? 1 : 0;
    }
    grade.current = { w, h, bin, fator };
    return grade.current;
  }

  async function varinha(x, y) {
    try {
      const g = await prepararGrade();
      const sx = Math.round(x * g.fator), sy = Math.round(y * g.fator);
      if (sx < 0 || sy < 0 || sx >= g.w || sy >= g.h) return;
      if (g.bin[sy * g.w + sx]) { alert('Toque DENTRO da peça (na área clara cercada pelas linhas).'); return; }
      const maxPix = Math.round(g.w * g.h * 0.12);
      const visit = new Uint8Array(g.w * g.h);
      const fila = [sy * g.w + sx]; visit[fila[0]] = 1;
      let minX = sx, maxX = sx, minY = sy, maxY = sy, n = 0;
      while (fila.length) {
        const p = fila.pop(); n++;
        if (n > maxPix) { alert('Não achei um contorno fechado aqui — a região é aberta demais. Desenhe com o ▭ mesmo.'); return; }
        const px = p % g.w, py = (p / g.w) | 0;
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (py < minY) minY = py; if (py > maxY) maxY = py;
        for (const q of [p - 1, p + 1, p - g.w, p + g.w]) {
          if (q < 0 || q >= g.w * g.h) continue;
          if (Math.abs((q % g.w) - px) > 1) continue;   // não atravessa a borda lateral
          if (!visit[q] && !g.bin[q]) { visit[q] = 1; fila.push(q); }
        }
      }
      const f = 1 / g.fator;
      const rx = Math.max(0, Math.round((minX - 1) * f)), ry = Math.max(0, Math.round((minY - 1) * f));
      const rw = Math.round((maxX - minX + 3) * f), rh = Math.round((maxY - minY + 3) * f);
      if (rw < 8 || rh < 8) { alert('Região muito pequena — dá zoom e tente de novo, ou desenhe com o ▭.'); return; }
      const nova = { planta_id: planta.id, etapa: etapaAtiva, cor: corAtiva, tipo: 'ret',
        pontos: { x: rx, y: ry, w: rw, h: rh }, data: dataMarca, criado_por_nome: profile?.nome || null,
        rotulo: rotuloSugerido(planta.textos, { x: rx, y: ry, w: rw, h: rh }) || null,
        quantidade: unidadeAtiva === 'un' ? null : (Number(qtdPadrao) || null),
        lote: normalizarLote(loteAtivo), nota: normalizarLote(notaAtiva), espessura };
      const { data, error } = await supabase.from('planta_marcacoes').insert(nova).select().single();
      if (error) { console.error('Erro ao salvar marcação:', error); avisarErro(error, 'salvar'); return; }
      setMarcas(ms => [...ms, data]);
    } catch (e) {
      console.error('Erro na detecção:', e);
      alert('Não consegui analisar a planta neste ponto.');
    }
  }

  // Ponto do toque em coordenadas da IMAGEM (independe de zoom e scroll).
  function ponto(ev) {
    const r = svgRef.current.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * planta.largura;
    const y = ((ev.clientY - r.top) / r.height) * planta.altura;
    return [Math.round(x), Math.round(y)];
  }

  function pointerDown(ev) {
    // Segundo dedo = pinça, nunca desenho.
    if (ev.pointerType === 'touch' && toques.current.size >= 1) return;
    // Mãozinha com mouse: clicar e arrastar move a planta (o scroll agora é
    // zoom). No toque, o navegador continua rolando sozinho.
    if (ferramenta === 'mover' && ev.pointerType === 'mouse') {
      ev.preventDefault();
      // Guardamos AQUI quem estava sob o cursor: com o pointer capture ligado
      // o navegador entrega o clique seguinte ao <svg>, não à forma — era por
      // isso que clicar num bloco não selecionava nada.
      // closest: na seta o alvo é a linha dentro do <g> que leva o data-mid.
      alvoDown.current = ev.target?.closest?.('[data-mid]')?.getAttribute('data-mid') || null;
      panGesto.current = true;
      svgRef.current.setPointerCapture?.(ev.pointerId);
      pan.current = { x: ev.clientX, y: ev.clientY, sl: contRef.current.scrollLeft, st: contRef.current.scrollTop };
      panMoveu.current = false;
      return;
    }
    if (ferramenta === 'varinha') {
      const [x, y] = ponto(ev);
      varinha(x, y);
      return;
    }
    if (!desenhavel) return;
    ev.preventDefault();
    svgRef.current.setPointerCapture?.(ev.pointerId);
    desenhando.current = true;
    const [x, y] = ponto(ev);
    if (ferramenta === 'pincel') setRascunho({ tipo: 'pincel', pts: [[x, y]] });
    if (ferramenta === 'ret')    setRascunho({ tipo: 'ret', x1: x, y1: y, x2: x, y2: y });
    if (ferramenta === 'seta')   setRascunho({ tipo: 'seta', x1: x, y1: y, x2: x, y2: y });
  }
  function pointerMove(ev) {
    if (pan.current) {
      const dx = ev.clientX - pan.current.x, dy = ev.clientY - pan.current.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) panMoveu.current = true;
      contRef.current.scrollLeft = pan.current.sl - dx;
      contRef.current.scrollTop  = pan.current.st - dy;
      return;
    }
    if (!desenhando.current || !rascunho) return;
    const [x, y] = ponto(ev);
    if (rascunho.tipo === 'pincel') setRascunho(r => ({ ...r, pts: [...r.pts, [x, y]] }));
    else setRascunho(r => ({ ...r, x2: x, y2: y }));
  }
  async function pointerUp() {
    if (pan.current) {
      pan.current = null;
      // Sem arrasto, soltar É clique: seleciona a forma que estava sob o cursor
      // quando o gesto começou (ou limpa a seleção, se era o vazio).
      if (!panMoveu.current) {
        const id = alvoDown.current;
        setSelecionada(id ? (marcas.find(m => m.id === id) || null) : null);
      }
      alvoDown.current = null;
      // O clique dispara depois do soltar: só então liberamos as travas.
      setTimeout(() => { panMoveu.current = false; panGesto.current = false; }, 0);
      return;
    }
    if (!desenhando.current || !rascunho) { desenhando.current = false; return; }
    desenhando.current = false;
    const r = rascunho;
    setRascunho(null);
    let tipo, pontos;
    if (r.tipo === 'pincel') {
      if (r.pts.length < 2) return;
      // Tolerância proporcional à planta: some o tremido, mantém o contorno.
      const limpos = simplificar(r.pts, Math.max(2, planta.largura * 0.0035));
      if (limpos.length < 3) return;
      tipo = 'pincel'; pontos = { pts: limpos };
    } else if (r.tipo === 'ret') {
      const x = Math.min(r.x1, r.x2), y = Math.min(r.y1, r.y2);
      const w = Math.abs(r.x2 - r.x1), h = Math.abs(r.y2 - r.y1);
      if (w < 4 || h < 4) return;
      tipo = 'ret'; pontos = { x, y, w, h };
    } else {
      if (Math.hypot(r.x2 - r.x1, r.y2 - r.y1) < 8) return;
      tipo = 'seta'; pontos = { x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2 };
    }
    const nova = { planta_id: planta.id, etapa: etapaAtiva, cor: corAtiva, tipo, pontos, data: dataMarca,
      criado_por_nome: profile?.nome || null,
      // Rótulo é opcional: só entra se a planta trouxe texto e ele caiu dentro.
      rotulo: rotuloSugerido(planta.textos, bboxDe(tipo, pontos)) || null,
      quantidade: unidadeAtiva === 'un' ? null : (Number(qtdPadrao) || null),
      lote: normalizarLote(loteAtivo), nota: normalizarLote(notaAtiva), espessura };
    const { data, error } = await supabase.from('planta_marcacoes').insert(nova).select().single();
    if (error) { console.error('Erro ao salvar marcação:', error); avisarErro(error, 'salvar a marcação'); return; }
    setMarcas(ms => [...ms, data]);
  }

  async function apagarMarca(id) {
    setMarcas(ms => ms.filter(m => m.id !== id));
    const { error } = await supabase.from('planta_marcacoes').delete().eq('id', id);
    if (error) { console.error(error); avisarErro(error, 'apagar'); }
  }

  // Gira a peça sem sair do cartão: 5° por toque cobre sapata torta.
  async function girar(m, graus) {
    const nova = ((Number(m.rotacao) || 0) + graus) % 360;
    setMarcas(ms => ms.map(x => (x.id === m.id ? { ...x, rotacao: nova } : x)));
    setSelecionada(sel => (sel && sel.id === m.id ? { ...sel, rotacao: nova } : sel));
    const { error } = await supabase.from('planta_marcacoes').update({ rotacao: nova }).eq('id', m.id);
    if (error) { console.error('Erro ao girar:', error); avisarErro(error, 'girar'); }
  }

  async function renomear(m, texto) {
    const novo = texto.trim() || null;
    if (novo === (m.rotulo || null)) return;
    setMarcas(ms => ms.map(x => (x.id === m.id ? { ...x, rotulo: novo } : x)));
    setSelecionada(sel => (sel && sel.id === m.id ? { ...sel, rotulo: novo } : sel));
    const { error } = await supabase.from('planta_marcacoes').update({ rotulo: novo }).eq('id', m.id);
    if (error) { console.error('Erro ao nomear:', error); avisarErro(error, 'salvar o nome'); }
  }

  // Corrigir um registro (etapa/data errada) — diferente do 🔁, que avança
  // mantendo a história: aqui o próprio registro muda.
  async function salvarEdicaoMarca(id, campos) {
    const { data, error } = await supabase.from('planta_marcacoes').update(campos).eq('id', id).select().single();
    if (error) { console.error('Erro ao editar a marcação:', error); avisarErro(error, 'salvar'); return; }
    setMarcas(ms => ms.map(m => (m.id === id ? data : m)));
    setEditMarca(null);
  }

  // Avança a forma para a etapa ativa SEM apagar a história: nasce um registro
  // novo (mesma geometria, etapa/cor novas, no dia selecionado) apontando o
  // antigo — que segue contando na produção do dia dele.
  // A cor do lote vive nas marcações dele (lote não é entidade: é rótulo do
  // dia). Trocar a cor grava a mesma em todas as peças daquele lote no dia —
  // por isso o update é em lote, não uma ida ao banco por peça.
  async function salvarCorDoLote(chave, cor) {
    const alvo = marcas.filter(m => m.data === dataMarca && chaveDoLote(m) === chave);
    if (!alvo.length) return;
    const ids = alvo.map(m => m.id);
    const { error } = await supabase.from('planta_marcacoes').update({ lote_cor: cor }).in('id', ids);
    if (error) { console.error('Erro ao salvar a cor do lote:', error); avisarErro(error, 'salvar a cor'); return; }
    const set = new Set(ids);
    setMarcas(ms => ms.map(m => (set.has(m.id) ? { ...m, lote_cor: cor } : m)));
  }

  async function promover(m) {
    if (m.etapa === etapaAtiva) return;
    const nova = { planta_id: planta.id, etapa: etapaAtiva, cor: corAtiva, tipo: m.tipo,
      pontos: m.pontos, data: dataMarca, criado_por_nome: profile?.nome || null, substitui: m.id,
      rotulo: m.rotulo || null,     // a peça é a mesma: o nome, o giro e o traço vão junto
      rotacao: m.rotacao || 0, espessura: m.espessura || 1,
      quantidade: unidadeAtiva === 'un' ? null : (Number(qtdPadrao) || m.quantidade || null),
      lote: normalizarLote(loteAtivo), nota: normalizarLote(notaAtiva) };
    const { data, error } = await supabase.from('planta_marcacoes').insert(nova).select().single();
    if (error) { console.error('Erro ao avançar etapa:', error); avisarErro(error, 'avançar a etapa'); return; }
    setMarcas(ms => [...ms, data]);
  }
  async function desfazer() {
    const ultima = marcas[marcas.length - 1];
    if (ultima) apagarMarca(ultima.id);
  }

  async function criarEtapa(nome) {
    const n = nome.trim();
    setNovaEtapa(false);
    if (!n) return;
    if (!etapas.some(e => e.nome === n)) {
      const cor = PALETA[etapas.length % PALETA.length];
      const { error } = await supabase.from('planta_etapas')
        .insert({ nome: n, cor, ordem: etapas.length });
      if (error) { console.error('Erro ao criar etapa:', error); avisarErro(error, 'criar a etapa'); return; }
      carregarEtapas(marcas);
    }
    setEtapaAtiva(n);
  }

  // Números por etapa: total e o que foi marcado HOJE — a pintura virando dado.
  const contagem = useMemo(() => {
    const hoje = hojeLocal();
    const m = {};
    marcas.forEach(x => {
      if (!m[x.etapa]) m[x.etapa] = { total: 0, hoje: 0 };
      m[x.etapa].total += qtdDe(x);
      if (x.data === hoje) m[x.etapa].hoje += qtdDe(x);
    });
    return m;
  }, [marcas]);

  // Termômetro do dia: compara a produção do dia marcado com a META da etapa
  // quando existir; sem meta, com a média dos OUTROS dias trabalhados.
  // Sem useMemo de propósito: é uma passada pela lista e os vários retornos
  // impediam o compilador de preservar a memoização.
  const alerta = (() => {
    const un = unidadeAtiva;
    const meta = metaAtiva;
    const doDia = marcas.filter(m => m.data === dataMarca && m.etapa === etapaAtiva).reduce((s, m) => s + qtdDe(m), 0);
    if (meta) {
      if (doDia === 0) return { tipo: 'zero', base: meta, ref: 'meta', un };
      const dif = (doDia - meta) / meta;
      return { tipo: dif >= 0.05 ? 'acima' : dif <= -0.05 ? 'abaixo' : 'na', doDia, base: meta, ref: 'meta', un };
    }
    const outros = {};
    marcas.forEach(m => {
      if (m.etapa !== etapaAtiva || m.data === dataMarca) return;
      outros[m.data] = (outros[m.data] || 0) + qtdDe(m);
    });
    const dias = Object.values(outros);
    if (!dias.length) return doDia > 0 ? { tipo: 'primeiro', doDia, un } : null;
    const media = dias.reduce((a, b) => a + b, 0) / dias.length;
    if (doDia === 0) return { tipo: 'zero', base: media, ref: 'media', nDias: dias.length, un };
    const dif = (doDia - media) / media;
    return { tipo: dif >= 0.1 ? 'acima' : dif <= -0.1 ? 'abaixo' : 'na', doDia, base: media, ref: 'media', nDias: dias.length, un };
  })();

  const num1 = (v) => v.toFixed(1).replace('.', ',').replace(',0', '');

  const visiveis = marcas.filter(m => !ocultas.has(m.etapa));
  // Forma promovida some enquanto a versão mais nova está visível; escondendo
  // a camada nova no 👁, a antiga volta a aparecer.
  const cobertas = useMemo(() => new Set(visiveis.map(m => m.substitui).filter(Boolean)), [visiveis]);
  const desenhadas = visiveis.filter(m => !cobertas.has(m.id));

  // Modo "por caminhão": a cor deixa de significar etapa e passa a significar
  // lote, só no dia selecionado. Peça sem lote fica cinza — some do ruído sem
  // sumir da planta. Fora do modo, nada muda: a cor é a da etapa, como sempre.
  const lotesDoDiaAtual = useMemo(() => lotesDoDia(marcas, dataMarca), [marcas, dataMarca]);
  const coresLote = useMemo(() => coresDeLote(lotesDoDiaAtual), [lotesDoDiaAtual]);
  const corDaMarca = (m) => {
    if (!porLote) return m.cor;
    if (m.data !== dataMarca) return '#C7CDD3';
    return coresLote.get(chaveDoLote(m)) || '#C7CDD3';
  };

  // Imprime o que está na tela: pega o innerHTML do próprio svg, então
  // etapas ocultas no 👁 e o modo por caminhão já vêm resolvidos. A legenda
  // acompanha o modo — cores de caminhão quando é por caminhão, de etapa
  // quando é o normal.
  function imprimirPlanta() {
    const svg = svgRef.current;
    if (!svg) return;
    const legenda = porLote
      ? resumoDeLotes(marcas, dataMarca).map(r => ({
          cor: coresLote.get(r.chave),
          texto: `${r.rotulo} · ${r.pecas} ${r.pecas === 1 ? 'peça' : 'peças'}`,
        }))
      : etapas.filter(e => e.ativa !== false && !ocultas.has(e.nome))
          .map(e => ({ cor: e.cor, texto: `${e.nome}${contagem[e.nome] ? ' ' + contagem[e.nome].total : ''}` }));
    abrirImpressaoPlanta({
      titulo: planta.nome,
      subtitulo: [planta.pavimento, porLote ? `caminhões de ${dataBR(dataMarca)}` : null]
        .filter(Boolean).join(' · '),
      imagemUrl: planta.imagem_url,
      largura: planta.largura, altura: planta.altura,
      svgInterno: svg.innerHTML,
      legenda,
      rodape: `${MARCA.nome} · impresso em ${dataBR(hojeLocal())}`,
    });
  }


  const setaCabeca = (m) => {
    const { x1, y1, x2, y2 } = m.pontos;
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const L = traco * 3.2;
    const p1 = [x2 - L * Math.cos(ang - 0.45), y2 - L * Math.sin(ang - 0.45)];
    const p2 = [x2 - L * Math.cos(ang + 0.45), y2 - L * Math.sin(ang + 0.45)];
    return `${x2},${y2} ${p1[0]},${p1[1]} ${p2[0]},${p2[1]}`;
  };

  const renderMarca = (m, ghost) => {
    const cm = ghost ? m.cor : corDaMarca(m);
    const selo = !ghost && selecionada?.id === m.id;
    const comum = ghost ? { opacity: 0.55 } : selo ? { filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.6))' } : {};
    const clicavel = !ghost && ['apagar', 'etapa', 'mover'].includes(ferramenta);
    const clique = clicavel
      ? { onClick: (ev) => { ev.stopPropagation();
          if (panMoveu.current) return;   // soltou depois de arrastar: não é clique
          if (ferramenta === 'apagar') apagarMarca(m.id);
          else if (ferramenta === 'etapa') promover(m);
          else setSelecionada(m); },
          style: { cursor: 'pointer' }, 'data-mid': m.id }
      : {};
    const esp = Number(m.espessura) || 1;   // fino/normal/grosso por marcação
    if (m.tipo === 'pincel') {
      const lista = m.pontos.pts || [];
      const pts = lista.map(p => p.join(',')).join(' ');
      // Enquanto desenha ainda é linha aberta; ao soltar vira área preenchida,
      // no mesmo padrão do retângulo — o que está dentro fica claro.
      if (ghost) {
        return <polyline key="g" points={pts} fill="none" stroke={cm} strokeWidth={traco * 2 * esp}
          strokeLinecap="round" strokeLinejoin="round" opacity={0.55} />;
      }
      return <polygon key={m.id} points={pts} fill={cm} fillOpacity={0.28} stroke={cm}
        strokeWidth={traco * esp} strokeLinejoin="round" {...comum} {...clique} />;
    }
    if (m.tipo === 'ret') {
      const { x, y, w, h } = m.pontos;
      // Sapata fora de esquadro: gira em torno do próprio centro.
      const g = Number(m.rotacao) || 0;
      const giro = g ? { transform: `rotate(${g} ${x + w / 2} ${y + h / 2})` } : {};
      return <rect key={m.id || 'g'} x={x} y={y} width={w} height={h} fill={cm} fillOpacity={0.28}
        stroke={cm} strokeWidth={traco * esp} {...giro} {...comum} {...clique} />;
    }
    const { x1, y1, x2, y2 } = m.pontos;
    return (
      <g key={m.id || 'g'} {...comum} {...clique}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={cm} strokeWidth={traco * 1.4 * esp} strokeLinecap="round" />
        <polygon points={setaCabeca(m)} fill={cm} />
      </g>
    );
  };

  // Nome da peça desenhado por cima da marcação (quando existir).
  const renderRotulo = (m) => {
    if (!m.rotulo) return null;
    const b = bboxDe(m.tipo, m.pontos);
    const fs = Math.max(traco * 3.2, 12);
    const larg = m.rotulo.length * fs * 0.62 + fs * 0.7;
    const x = b.x + b.w / 2, y = b.y + b.h / 2;
    return (
      <g key={'r' + m.id} pointerEvents="none">
        <rect x={x - larg / 2} y={y - fs * 0.8} width={larg} height={fs * 1.6} rx={fs * 0.4}
          fill="#fff" fillOpacity={0.88} stroke={corDaMarca(m)} strokeWidth={traco * 0.5} />
        <text x={x} y={y + fs * 0.38} textAnchor="middle" fontSize={fs} fontWeight="800" fill={corDaMarca(m)}
          style={{ fontFamily: 'inherit' }}>{m.rotulo}</text>
      </g>
    );
  };

  const rascunhoMarca = rascunho && {
    id: null, cor: corAtiva,
    tipo: rascunho.tipo === 'ret' ? 'ret' : rascunho.tipo,
    pontos: rascunho.tipo === 'pincel' ? { pts: rascunho.pts }
      : rascunho.tipo === 'ret'
        ? { x: Math.min(rascunho.x1, rascunho.x2), y: Math.min(rascunho.y1, rascunho.y2), w: Math.abs(rascunho.x2 - rascunho.x1), h: Math.abs(rascunho.y2 - rascunho.y1) }
        : { x1: rascunho.x1, y1: rascunho.y1, x2: rascunho.x2, y2: rascunho.y2 },
  };

  const chip = (on, cor) => ({
    fontFamily: 'inherit', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: '6px 11px',
    borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
    border: on ? `1.5px solid ${cor || 'var(--primary)'}` : '1px solid var(--border)',
    background: on ? (cor ? cor + '1A' : 'var(--primary-tint)') : 'var(--surface)',
    color: on ? (cor || 'var(--primary)') : 'var(--text-2)',
  });

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={onVoltar}>
            <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Plantas
          </button>
          <div className="t-strong" style={{ flex: 1, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{planta.nome}</div>
          <button onClick={() => setShowResumo(true)} className="btn btn-secondary btn-sm">📊 Resumo</button>
          <button onClick={imprimirPlanta} className="btn btn-secondary btn-sm"
            title="imprimir a planta exatamente como está na tela, com as marcações">🖨️ Imprimir</button>
          <button onClick={() => setVerRotulos(v => !v)} className="btn btn-secondary btn-sm"
            title="o 👁 esconde a etapa inteira; este esconde só as plaquinhas com o nome da peça (tecla N)">
            {verRotulos ? '🏷️ Ocultar nomes' : '🏷️ Ver nomes'}
          </button>
          <button onClick={desfazer} disabled={marcas.length === 0} className="btn btn-secondary btn-sm">↩ Desfazer</button>
        </div>

        {/* O fluxo é: escolhe O DIA, depois pinta os blocos daquele dia.
            Fora de hoje, o controle fica âmbar — retroativo consciente. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10,
          padding: '8px 12px', borderRadius: 12,
          border: dataMarca === hojeLocal() ? '1px solid var(--border)' : '1.5px solid var(--warn,#CA8A04)',
          background: dataMarca === hojeLocal() ? 'var(--surface)' : 'var(--warn-tint,rgba(202,138,4,0.10))' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: dataMarca === hojeLocal() ? 'var(--text-2)' : 'var(--warn,#CA8A04)', whiteSpace: 'nowrap' }}>
            📅 Marcando o dia:
          </span>
          <input type="date" value={dataMarca} max={hojeLocal()} onChange={e => setDataMarca(e.target.value)}
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '4px 8px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', flexShrink: 0 }} />
          {dataMarca !== hojeLocal() && (
            <button onClick={() => setDataMarca(hojeLocal())}
              style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: 'var(--warn,#CA8A04)' }}>
              voltar pra hoje
            </button>
          )}
          <span style={{ flex: 1 }} />
          <span className="t-caption" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>tudo que pintar entra neste dia</span>
        </div>

        {/* Caminhão/remessa das próximas marcações. Fica preenchido enquanto o
            caminhão descarrega: pinta as peças dele, troca a placa, pinta as
            próximas. Vazio = marcação sem lote, como sempre foi. */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8,
          padding: '8px 12px', borderRadius: 12,
          border: (loteAtivo.trim() || notaAtiva.trim()) ? '1.5px solid var(--primary)' : '1px solid var(--border)',
          background: (loteAtivo.trim() || notaAtiva.trim()) ? 'var(--primary-tint)' : 'var(--surface)' }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: (loteAtivo.trim() || notaAtiva.trim()) ? 'var(--primary)' : 'var(--text-2)', whiteSpace: 'nowrap' }}>
            🚛 Caminhão:
          </span>
          <input value={loteAtivo} onChange={e => setLoteAtivo(e.target.value)} placeholder="BT1111"
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '5px 10px', borderRadius: 8, width: 110,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textTransform: 'uppercase' }} />
          {/* A NF é o que separa duas viagens da MESMA placa: o caminhão volta
              à usina, carrega e volta, e sem a nota as duas viravam um lote só. */}
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>NF</span>
          <input value={notaAtiva} onChange={e => setNotaAtiva(e.target.value)} placeholder="4521"
            style={{ fontFamily: 'inherit', fontSize: 13, fontWeight: 700, padding: '5px 10px', borderRadius: 8, width: 90,
              border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', textTransform: 'uppercase' }} />
          {(loteAtivo.trim() || notaAtiva.trim()) && (
            <button onClick={() => { setLoteAtivo(''); setNotaAtiva(''); }}
              style={{ border: 0, background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, color: 'var(--text-3)' }}>
              limpar
            </button>
          )}
          <span style={{ flex: 1 }} />
          {lotesDoDiaAtual.length > 0 && (
            <button onClick={() => setPorLote(v => !v)}
              title="colorir a planta por caminhão em vez de por etapa, só neste dia"
              style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: '5px 11px',
                borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
                border: porLote ? 'none' : '1px solid var(--border)',
                background: porLote ? 'var(--text)' : 'var(--surface)',
                color: porLote ? 'var(--surface)' : 'var(--text-2)' }}>
              {porLote ? '🎨 Ver por etapa' : '🚛 Ver por caminhão'}
            </button>
          )}
        </div>

        {/* Legenda do modo por caminhão: qual cor é qual placa, com o que cada
            um entregou no dia. É a leitura que o modo existe para dar. */}
        {porLote && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, padding: '8px 12px',
            borderRadius: 12, background: 'var(--surface-2)' }}>
            {resumoDeLotes(marcas, dataMarca).map(r => (
              <span key={r.chave} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                {/* A bolinha É o seletor: clicar abre a paleta do navegador e a
                    cor escolhida vale para todas as peças daquele lote. */}
                <button onClick={() => setCorLote({ chave: r.chave, rotulo: r.rotulo, cor: coresLote.get(r.chave) })}
                  title={`Mudar a cor de ${r.rotulo}`}
                  style={{ width: 14, height: 14, borderRadius: 999, flexShrink: 0, cursor: 'pointer', padding: 0,
                    background: coresLote.get(r.chave), border: '2px solid var(--surface)', boxShadow: '0 0 0 1px var(--border)' }} />
                {r.rotulo}
                <span className="t-caption" style={{ fontSize: 11 }}>
                  {r.pecas} {r.pecas === 1 ? 'peça' : 'peças'}{r.quantidade > 0 ? ` · ${r.quantidade}` : ''}
                </span>
              </span>
            ))}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: 'var(--text-3)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 999, background: '#C7CDD3', flexShrink: 0 }} />
              sem caminhão / outro dia
            </span>
          </div>
        )}

        {/* Etapas: escolhe a cor do que vai pintar; o 👁 esconde/mostra a camada */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 0 6px', scrollbarWidth: 'none' }}>
          {etapas.filter(e => e.ativa !== false).map(e => {
            const c = contagem[e.nome];
            const oculta = ocultas.has(e.nome);
            return (
              <span key={e.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {/* Só o total, na cor da etapa — "12 · 3 hoje" confundia. */}
                <button onClick={() => setEtapaAtiva(e.nome)} style={chip(etapaAtiva === e.nome, e.cor)}>
                  <span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 999, background: e.cor, marginRight: 5 }} />
                  {e.nome}{c ? <b style={{ color: e.cor, marginLeft: 5 }}>{c.total}</b> : null}
                </button>
                {c && (
                  <button onClick={() => setOcultas(s => { const n = new Set(s); if (n.has(e.nome)) n.delete(e.nome); else n.add(e.nome); return n; })}
                    title={oculta ? 'mostrar etapa' : 'esconder etapa'}
                    style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 13, opacity: oculta ? 0.35 : 0.9, padding: 0 }}>👁</button>
                )}
              </span>
            );
          })}
          {novaEtapa ? (
            <input autoFocus placeholder="nome da etapa" onBlur={e => criarEtapa(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') criarEtapa(e.target.value); if (e.key === 'Escape') setNovaEtapa(false); }}
              style={{ fontFamily: 'inherit', fontSize: 12, padding: '6px 10px', borderRadius: 20, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', width: 120, flexShrink: 0 }} />
          ) : (
            <button onClick={() => setNovaEtapa(true)} style={{ ...chip(false), borderStyle: 'dashed', color: 'var(--text-3)' }}>+ etapa</button>
          )}
          <button onClick={() => setShowEtapas(true)} title="cores, metas, unidades e quais etapas aparecem"
            style={{ ...chip(false), flexShrink: 0 }}>⚙️ Etapas</button>
        </div>

        {/* Ferramentas + data da marcação + zoom */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
          {FERRAMENTAS.map(f => (
            <button key={f.k} onClick={() => setFerramenta(f.k)} title={f.dica} style={chip(ferramenta === f.k)}>{f.label}</button>
          ))}
          {/* Etapa medida em m², m, m³: cada marcação vale a quantidade digitada
              aqui (fica valendo para as próximas, editável por marcação). */}
          {unidadeAtiva !== 'un' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0, padding: '0 4px' }}>
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>cada marca =</span>
              <input type="number" min="0" step="any" value={qtdPadrao} onChange={e => setQtdPadrao(e.target.value)}
                placeholder="0" style={{ width: 64, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700, padding: '5px 8px',
                  borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', textAlign: 'right' }} />
              <span style={{ fontSize: 11.5, fontWeight: 800, color: 'var(--text-2)' }}>{unidadeAtiva}</span>
            </span>
          )}
          {/* Espessura do traço: sapata pequena pede linha fina. */}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            {[[0.5, 'fino'], [1, 'médio'], [2, 'grosso']].map(([v, l]) => (
              <button key={l} onClick={() => setEspessura(v)} title={`traço ${l}`}
                style={{ ...chip(espessura === v), padding: '6px 9px' }}>
                <span style={{ display: 'inline-block', width: 16, height: Math.max(1, v * 2), borderRadius: 2,
                  background: espessura === v ? 'var(--primary)' : 'var(--text-3)', verticalAlign: 'middle' }} />
              </button>
            ))}
          </span>
          <span style={{ flex: 1 }} />
          <button onClick={() => setZoom(z => Math.max(0.35, +(z - 0.25).toFixed(2)))} style={chip(false)}>−</button>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-3)', flexShrink: 0 }}>{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(6, +(z + 0.25).toFixed(2)))} style={chip(false)}>+</button>
        </div>
      </div>

      {/* Planta com overlay. No modo mover o dedo rola; nas ferramentas o
          toque desenha (touchAction none segura o scroll). */}
      <div ref={contRef}
        onPointerDown={contPointerDown} onPointerMove={contPointerMove}
        onPointerUp={contPointerUp} onPointerCancel={contPointerUp}
        style={{ flex: 1, overflow: 'auto', background: 'var(--surface-2)', borderTop: '1px solid var(--border)',
          // pan-x pan-y: um dedo rola normal; a pinça de dois dedos fica
          // conosco (senão o navegador dava zoom na página inteira).
          touchAction: 'pan-x pan-y' }}>
        <div style={{ position: 'relative', width: `${zoom * 100}%`, margin: zoom < 1 ? '0 auto' : undefined }}>
          <img src={planta.imagem_url} alt={planta.nome} draggable={false}
            style={{ width: '100%', display: 'block', userSelect: 'none' }} />
          <svg ref={svgRef} viewBox={`0 0 ${planta.largura} ${planta.altura}`}
            onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}
            onClick={(ev) => { if (panGesto.current) return;   // mouse na mãozinha: já resolvido no soltar
              if (ev.target === svgRef.current && !panMoveu.current) setSelecionada(null); }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
              touchAction: desenhavel ? 'none' : 'pan-x pan-y',
              cursor: desenhavel || ferramenta === 'varinha' ? 'crosshair' : ['apagar', 'etapa'].includes(ferramenta) ? 'pointer' : 'grab' }}>
            {desenhadas.map(m => renderMarca(m, false))}
            {verRotulos && desenhadas.map(m => renderRotulo(m))}
            {rascunhoMarca && renderMarca(rascunhoMarca, true)}
          </svg>
        </div>
      </div>

      {/* Cartão da marcação selecionada (modo mover): deletar UM bloco direto,
          sem desfazer a fila inteira, ou avançar a etapa dele. */}
      {selecionada && (
        <div style={{ position: 'fixed', left: '50%', bottom: 76, transform: 'translateX(-50%)', zIndex: 500,
          background: 'var(--surface)', borderRadius: 14, boxShadow: '0 10px 36px rgba(0,0,0,0.28)',
          border: '0.5px solid var(--border)', padding: '10px 12px', display: 'flex', alignItems: 'center',
          gap: 8, maxWidth: 'calc(100vw - 24px)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ width: 12, height: 12, borderRadius: 999, background: selecionada.cor, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            {/* Nomear a peça aqui mesmo: digitou o P12, saiu do campo, salvou. */}
            <input key={selecionada.id} defaultValue={selecionada.rotulo || ''}
              placeholder="nome da peça (P12, SAP-3…)"
              onBlur={e => renomear(selecionada, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              style={{ width: 130, fontFamily: 'inherit', fontSize: 13, fontWeight: 800, color: selecionada.cor,
                background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 8px' }} />
            <div className="t-caption" style={{ fontSize: 11, whiteSpace: 'nowrap', marginTop: 3 }}>
              {selecionada.etapa} · {dataBR(selecionada.data)}{selecionada.criado_por_nome ? ` · ${selecionada.criado_por_nome}` : ''}
            </div>
            {/* De qual viagem esta peça veio. Só aparece quando existe — peça
                sem caminhão não ganha linha vazia. Corrige-se no ✏️ Editar. */}
            {rotuloDoLote(selecionada.lote, selecionada.nota) && (
              <div style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', marginTop: 2, color: 'var(--text-2)' }}>
                🚛 {rotuloDoLote(selecionada.lote, selecionada.nota)}
              </div>
            )}
          </div>

          {/* Girar só faz sentido no retângulo (a seta já aponta, o pincel é livre) */}
          {selecionada.tipo === 'ret' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
              <button onClick={() => girar(selecionada, -5)} title="girar 5° para a esquerda"
                style={{ width: 32, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text-1)', cursor: 'pointer', fontSize: 14 }}>↺</button>
              <span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--text-3)', minWidth: 30, textAlign: 'center' }}>
                {Math.round(Number(selecionada.rotacao) || 0)}°
              </span>
              <button onClick={() => girar(selecionada, 5)} title="girar 5° para a direita"
                style={{ width: 32, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)',
                  color: 'var(--text-1)', cursor: 'pointer', fontSize: 14 }}>↻</button>
            </span>
          )}

          <button onClick={() => setHistorico(selecionada)} title="linha do tempo desta peça"
            style={{ height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>🕘 Histórico</button>
          {selecionada.etapa !== etapaAtiva && (
            <button onClick={() => { promover(selecionada); setSelecionada(null); }}
              style={{ height: 34, padding: '0 12px', borderRadius: 9, border: 0, background: corAtiva, color: '#fff',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              🔁 {etapaAtiva}
            </button>
          )}
          <button onClick={() => { setEditMarca(selecionada); setSelecionada(null); }}
            style={{ height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>✏️ Editar</button>
          <button onClick={() => { apagarMarca(selecionada.id); setSelecionada(null); }}
            style={{ height: 34, padding: '0 12px', borderRadius: 9, border: 0, background: 'var(--danger)', color: '#fff',
              fontFamily: 'inherit', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>🧽 Excluir</button>
          <button onClick={() => setSelecionada(null)}
            style={{ width: 30, height: 30, borderRadius: 9, border: 0, background: 'var(--surface-2)', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 14 }}>✕</button>
        </div>
      )}

      {/* Trocar a cor de um lote. A paleta é a mesma do automático mais um
          seletor livre — quem quer "o azul da Supermix" consegue. */}
      {corLote && (
        <div onClick={() => setCorLote(null)} style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 340, background: 'var(--surface)',
            borderRadius: 20, padding: '20px 18px 16px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
            <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 2 }}>🎨 Cor de {corLote.rotulo}</div>
            <div className="t-caption" style={{ fontSize: 12, marginBottom: 14 }}>Vale para todas as peças deste caminhão neste dia.</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {CORES_LOTE.map(c => (
                <button key={c} onClick={() => { salvarCorDoLote(corLote.chave, c); setCorLote(null); }}
                  style={{ width: 34, height: 34, borderRadius: 999, cursor: 'pointer', background: c,
                    border: corLote.cor === c ? '3px solid var(--text)' : '2px solid var(--surface)',
                    boxShadow: '0 0 0 1px var(--border)' }} />
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <span className="t-caption" style={{ fontSize: 12 }}>Outra cor:</span>
              <input type="color" defaultValue={corLote.cor}
                onChange={e => setCorLote(p => ({ ...p, cor: e.target.value }))}
                style={{ width: 44, height: 34, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface-2)', cursor: 'pointer', padding: 2 }} />
              <button onClick={() => { salvarCorDoLote(corLote.chave, corLote.cor); setCorLote(null); }}
                style={{ height: 34, padding: '0 14px', borderRadius: 9, border: 0, background: 'var(--primary)', color: '#fff',
                  fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Usar</button>
            </div>
            <button onClick={() => { salvarCorDoLote(corLote.chave, null); setCorLote(null); }}
              style={{ width: '100%', height: 40, borderRadius: 10, border: '0.5px solid var(--border)', background: 'var(--surface)',
                fontSize: 13, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>
              Voltar para a cor automática
            </button>
          </div>
        </div>
      )}

      {historico && (
        <HistoricoPopup marca={historico} marcas={marcas} etapas={etapas} onFechar={() => setHistorico(null)} />
      )}
      {showEtapas && (
        <EtapasPopup etapas={etapas} marcas={marcas}
          onRecarregar={() => carregarEtapas(marcas)} onFechar={() => setShowEtapas(false)} />
      )}
      {showResumo && <ResumoPopup planta={planta} marcas={marcas} etapas={etapas} onFechar={() => setShowResumo(false)} />}
      {editMarca && (
        <MarcaEditPopup marca={editMarca} etapas={etapas}
          onSalvar={(campos) => salvarEdicaoMarca(editMarca.id, campos)}
          onFechar={() => setEditMarca(null)} />
      )}

      {/* Termômetro da produtividade do dia, comparado com a média da etapa */}
      {alerta && (
        <div style={{ padding: '8px var(--pad-4)', borderTop: '1px solid var(--border)',
          background: alerta.tipo === 'acima' ? 'var(--success-tint,rgba(22,163,74,0.10))'
            : alerta.tipo === 'abaixo' ? 'var(--warn-tint,rgba(202,138,4,0.12))' : 'var(--surface)',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700,
          color: alerta.tipo === 'acima' ? 'var(--success,#16A34A)'
            : alerta.tipo === 'abaixo' ? 'var(--warn,#B0700B)' : 'var(--text-2)' }}>
          <span style={{ fontSize: 15 }}>
            {alerta.tipo === 'acima' ? '📈' : alerta.tipo === 'abaixo' ? '📉' : alerta.tipo === 'zero' ? '⏳' : '📊'}
          </span>
          <span>
            {alerta.tipo === 'primeiro'
              ? `${etapaAtiva}: ${fmtQtd(alerta.doDia)} ${alerta.un} em ${dataBR(dataMarca)} — primeiro dia, ainda sem base para comparar.`
              : alerta.tipo === 'zero'
                ? `${etapaAtiva}: nada marcado em ${dataBR(dataMarca)}. ${alerta.ref === 'meta'
                    ? `A meta é ${num1(alerta.base)} ${alerta.un}/dia.`
                    : `A média é ${num1(alerta.base)} ${alerta.un}/dia em ${alerta.nDias} dia${alerta.nDias !== 1 ? 's' : ''}.`}`
                : `${etapaAtiva}: ${fmtQtd(alerta.doDia)} ${alerta.un} em ${dataBR(dataMarca)} — ${alerta.tipo === 'acima' ? 'acima' : alerta.tipo === 'abaixo' ? 'abaixo' : 'na'} ${alerta.ref === 'meta' ? 'da meta' : 'da média'} de ${num1(alerta.base)} ${alerta.un}/dia.`}
          </span>
        </div>
      )}

      {/* Produção por dia: a pintura virando número */}
      {marcas.length > 0 && (
        <div style={{ padding: '8px var(--pad-4)', borderTop: '1px solid var(--border)', display: 'flex', gap: 14, flexWrap: 'wrap', background: 'var(--surface)' }}>
          {Object.entries(contagem).map(([nome, c]) => {
            const cor = etapas.find(e => e.nome === nome)?.cor || 'var(--text-2)';
            return (
              <span key={nome} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: cor, marginRight: 5 }} />
                {nome}: <b style={{ color: cor }}>{fmtQtd(c.total)}</b>{c.hoje > 0 && <span style={{ color: 'var(--text-3)' }}> ({fmtQtd(c.hoje)} hoje)</span>}
              </span>
            );
          })}
          <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 'auto' }}>
            última: {dataBR(marcas[marcas.length - 1]?.data)}
          </span>
        </div>
      )}
    </div>
  );
}
