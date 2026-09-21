// Pendências / Checklist — 100% Supabase
import { MARCA } from '../marca.js';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { contem } from '../lib/busca';
import { useObra } from '../lib/ObraContext';
import { Icon, PageHeader, StatChips, VisualizadorFoto, BotaoDitar } from '../components/index';
import { juntarDitado } from '../lib/texto-ditado';
import { hojeLocal, toISODate } from '../lib/date';
import {
  FILTRO_VAZIO, OPCOES_STATUS, ABERTAS, RESOLVIDAS,
  filtrarPendencias, descreverFiltro, ordenarPendencias,
} from '../lib/pendencias-filtro';
import { abrirRelatorioPendencias } from '../lib/relatorio-pendencias';
import { enviarArquivo } from '../lib/enviar-arquivo';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';

const OBRA_NOME = MARCA.obra;
const fmtDataBR = (iso) => { const d = String(iso).split('-'); return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso; };

const ST = {
  aberta:       { label: 'Aberta',       color: 'var(--info)',    bg: 'rgba(14,108,184,0.12)'  },
  em_andamento: { label: 'Em andamento', color: 'var(--warn)',    bg: 'rgba(198,139,0,0.14)'   },
  atrasada:     { label: 'Atrasada',     color: 'var(--danger)',  bg: 'rgba(176,36,42,0.12)'   },
  resolvida:    { label: 'Resolvida',    color: 'var(--success)', bg: 'rgba(31,107,58,0.12)'   },
  fechada:      { label: 'Fechada',      color: 'var(--text-3)',  bg: 'rgba(0,0,0,0.06)'       },
};

function calcDiasRestantes(prazo) {
  if (!prazo) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  const p = new Date(prazo + 'T00:00:00');
  return Math.round((p - hoje) / 86400000);
}

function fmtPrazo(prazo) {
  if (!prazo) return '—';
  const [, m, d] = prazo.split('-');
  return `${d}/${m}`;
}

// ── Lista ────────────────────────────────────────────────────────────────────
const SEL = {
  height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)',
  padding: '0 10px', fontSize: 12.5, fontWeight: 600, color: 'var(--text-1)',
  fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
};

export function ChecklistList({ goto, onContagem }) {
  const { ambientes, profile, somenteLeitura } = useObra();
  const [novaAberta, setNovaAberta] = useState(false);
  const ambienteMap = useMemo(() => Object.fromEntries((ambientes || []).map(a => [a.nome, a])), [ambientes]);

  // Um filtro só para tudo: a lista da tela e o relatório saem daqui, então o
  // que está na tela é exatamente o que sai impresso.
  const [filtro, setFiltro] = useState(FILTRO_VAZIO);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const [ordem, setOrdem] = useState([]);   // 'data' e/ou 'fornecedor'
  const [q, setQ] = useState('');
  const [pendencias, setPendencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 900);
  useEffect(() => {
    const fn = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('pendencias')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) console.error('Erro ao carregar pendências:', error);
    const lista = data || [];

    // Marca as vencidas como atrasadas UMA vez, aqui no carregamento. Antes isso
    // vivia num efeito com dependência em `pendencias` — que ele próprio altera:
    // reabrir uma pendência vencida disparava o efeito e ela voltava na hora
    // para "atrasada", parecendo que o app desfazia a ação do usuário.
    const vencidas = lista
      .filter(p => ['aberta', 'em_andamento'].includes(p.status))
      .filter(p => { const d = calcDiasRestantes(p.prazo); return d !== null && d < 0; })
      .map(p => p.id);
    if (vencidas.length) {
      const { error: eUp } = await supabase.from('pendencias').update({ status: 'atrasada' }).in('id', vencidas);
      if (eUp) console.error('Erro ao marcar pendências atrasadas:', eUp);
      else for (const p of lista) if (vencidas.includes(p.id)) p.status = 'atrasada';
    }

    setPendencias(lista);
    setLoading(false);
  }, []);

  const quickResolve = async (id, currentStatus) => {
    const novoStatus = ['resolvida','fechada'].includes(currentStatus) ? 'aberta' : 'resolvida';
    setPendencias(prev => prev.map(p => p.id === id ? { ...p, status: novoStatus } : p));
    const { error } = await supabase.from('pendencias').update({ status: novoStatus }).eq('id', id);
    if (error) {
      // reverte o estado otimista se o banco não persistiu
      setPendencias(prev => prev.map(p => p.id === id ? { ...p, status: currentStatus } : p));
      avisarErro(error, 'atualizar a pendência');
    }
  };

  useEffect(() => { load(); }, [load]);

  // A bolinha de Pendências da barra de baixo é do app, não desta tela. Quem
  // resolve ou reabre aqui avisa quantas ficaram em aberto, para ela acompanhar
  // na hora em vez de ficar com o número de quando o app abriu.
  useEffect(() => {
    if (!loading) onContagem?.(pendencias.filter(p => ABERTAS.includes(p.status)).length);
  }, [pendencias, loading, onContagem]);

  // Memoizado: era recalculado a cada render — inclusive a cada tecla digitada
  // na busca — criando um objeto e formatando uma data por pendência.
  const all = useMemo(() => pendencias.map(p => ({
    ...p,
    pavimento: ambienteMap[p.ambiente]?.pavimento || '',
    dias_restantes: calcDiasRestantes(p.prazo),
    criada_em: p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) : '',
  })), [pendencias, ambienteMap]);

  // Filtro único, usado tanto no mobile quanto no quadro do desktop. Havia duas
  // implementações divergentes: a do desktop não buscava por empresa, embora o
  // campo dissesse "Buscar por ambiente, empresa…".
  const buscar = useCallback((lista) => {
    if (!q.trim()) return lista;
    const bate = (s) => contem(s, q);
    return lista.filter(p => bate(p.titulo) || bate(p.ambiente) || bate(p.empresa) || bate(p.descricao) || bate(p.numero));
  }, [q]);

  // Fornecedor e pavimento saem do que existe de fato nas pendências — uma
  // lista fixa mostraria opções que não filtram nada.
  const empresasDisponiveis = useMemo(
    () => [...new Set(all.map(p => p.empresa).filter(Boolean))].sort(), [all]);
  const pavimentosDisponiveis = useMemo(
    () => [...new Set(all.map(p => p.pavimento).filter(Boolean))].sort(), [all]);

  // A busca fica fora do filtro salvo: ela é momentânea e não vai no relatório.
  const filtradas = useMemo(() => filtrarPendencias(all, filtro), [all, filtro]);
  const list = useMemo(() => ordenarPendencias(buscar(filtradas), ordem), [filtradas, buscar, ordem]);

  // Contagem dos chips: reflete fornecedor/pavimento/período já aplicados, mas
  // ignora o status — senão o chip não selecionado mostraria sempre zero.
  const semStatus = useMemo(
    () => filtrarPendencias(all, { ...filtro, status: 'todas' }), [all, filtro]);
  const counts = useMemo(() => ({
    atrasada:   semStatus.filter(p => p.status === 'atrasada').length,
    abertas:    semStatus.filter(p => ABERTAS.includes(p.status)).length,
    resolvidas: semStatus.filter(p => RESOLVIDAS.includes(p.status)).length,
    todas:      semStatus.length,
  }), [semStatus]);

  const filtrosExtras = [filtro.empresa, filtro.pavimento, filtro.de, filtro.ate].filter(Boolean).length;

  const gerarRelatorio = () => abrirRelatorioPendencias(list, {
    obra: OBRA_NOME,
    filtroTexto: descreverFiltro(filtro, fmtDataBR),
  });

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${list.length} ${list.length === 1 ? 'pendência' : 'pendências'} no filtro`}
        title="Pendências"
        right={
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={gerarRelatorio} title="Gerar relatório do que está filtrado">
              <span style={{ width: 14, height: 14 }}>{Icon.pdf || Icon.clipboard}</span>Relatório
            </button>
            {!somenteLeitura && (
              <button className="btn btn-primary btn-sm" onClick={() => setNovaAberta(true)}>
                <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Nova
              </button>
            )}
          </div>
        }
      />

      <StatChips valor={filtro.status} onChange={(v) => setFiltro(f => ({ ...f, status: v }))}
        itens={OPCOES_STATUS.map(o => ({
          chave: o.valor, label: o.label, n: counts[o.valor] ?? 0,
          cor: o.valor === 'atrasada' ? 'var(--danger)' : o.valor === 'resolvidas' ? 'var(--success)'
             : o.valor === 'todas' ? 'var(--text-3)' : 'var(--info)',
        }))} />

      {maisFiltros && (
        <div style={{ padding: '0 var(--pad-4) 10px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filtro.empresa} onChange={e => setFiltro(f => ({ ...f, empresa: e.target.value }))} style={SEL}>
            <option value="">Todos os fornecedores</option>
            {empresasDisponiveis.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <select value={filtro.pavimento} onChange={e => setFiltro(f => ({ ...f, pavimento: e.target.value }))} style={SEL}>
            <option value="">Todos os pavimentos</option>
            {pavimentosDisponiveis.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <input type="date" value={filtro.de} onChange={e => setFiltro(f => ({ ...f, de: e.target.value }))} style={SEL} title="Vistoriadas a partir de" />
          <input type="date" value={filtro.ate} onChange={e => setFiltro(f => ({ ...f, ate: e.target.value }))} style={SEL} title="Vistoriadas até" />

          {/* Ordenação: os dois podem ficar ligados ao mesmo tempo. */}
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 700, marginLeft: 4 }}>Ordenar:</span>
          {[['data', 'Data'], ['fornecedor', 'Fornecedor']].map(([k, l]) => {
            const on = ordem.includes(k);
            return (
              <button key={k}
                onClick={() => setOrdem(o => on ? o.filter(x => x !== k) : [...o, k])}
                title={k === 'data' ? 'Sempre da mais antiga para a mais nova' : 'Agrupa por empresa'}
                style={{
                  height: 34, padding: '0 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12.5, fontWeight: 700,
                  border: on ? 'none' : '1px solid var(--border)',
                  background: on ? 'var(--primary)' : 'var(--surface)',
                  color: on ? '#fff' : 'var(--text-2)',
                }}>
                {l}
              </button>
            );
          })}
          {filtrosExtras > 0 && (
            <button onClick={() => setFiltro(f => ({ ...FILTRO_VAZIO, status: f.status }))}
              style={{ height: 34, padding: '0 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 700 }}>
              Limpar
            </button>
          )}
        </div>
      )}

      {/* Busca e "Filtros" na mesma linha: como botão solto, o toggle comia
          mais uma faixa antes da primeira pendência aparecer. */}
      <div style={{ padding: '0 var(--pad-4) 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <div className="search" style={{ flex: 1, minWidth: 0 }}>
          <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.search}</span>
          <input placeholder="Buscar por ambiente, empresa…" value={q} onChange={e => setQ(e.target.value)}
            style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', fontSize: 15 }} />
        </div>
        <button onClick={() => setMaisFiltros(v => !v)}
          style={{
            height: 38, padding: '0 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 12.5, fontWeight: 700, flexShrink: 0,
            border: filtrosExtras ? 'none' : '1px solid var(--border)',
            background: filtrosExtras ? 'var(--primary)' : 'var(--surface)',
            color: filtrosExtras ? '#fff' : 'var(--text-2)',
          }}>
          Filtros{filtrosExtras ? ` · ${filtrosExtras}` : ''}
        </button>
      </div>

      {/* Uma lista só, nos dois tamanhos. O quadro de duas colunas do desktop
          separava aberto/resolvido — agora quem separa é o filtro de status,
          e manter os dois seria filtrar em dois lugares diferentes. */}
      <div className="page-pad" style={{ paddingTop: 0, paddingBottom: 24 }}>
        {loading && <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-3)' }}>Carregando…</div>}
        {!loading && list.length === 0 && (
          <div className="card" style={{ textAlign: 'center', padding: '24px 12px' }}>
            <div className="t-strong">Nenhuma pendência neste filtro</div>
            <div className="t-caption" style={{ marginTop: 4 }}>
              {filtrosExtras || q.trim() ? 'Tente afrouxar os filtros.' : 'Tudo certo no canteiro 🎯'}
            </div>
          </div>
        )}
        <div style={{
          display: 'grid', gap: 10,
          gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr',
          alignItems: 'start',
        }}>
          {list.map(p => (
            <PendCard key={p.id} p={p} onClick={() => goto('checklist-detail', { id: p.id })}
              onQuickResolve={somenteLeitura ? null : quickResolve} />
          ))}
        </div>
      </div>

      {/* Nova pendência em popup: abrir como página fazia perder a lista e o
          filtro, e voltar recarregava tudo do zero. */}
      {novaAberta && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 560, maxHeight: '90dvh', overflowY: 'auto', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
            <ChecklistNew
              profile={profile}
              goto={(destino) => { setNovaAberta(false); if (destino === 'checklist') load(); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function PendCard({ p, onClick, onQuickResolve }) {
  const st = ST[p.status] || ST.aberta;
  const resolved = ['resolvida', 'fechada'].includes(p.status);
  // Resolvida não acumula atraso: o que importa é o dia em que foi resolvida.
  // Antes o card seguia somando dias sobre o prazo e mostrava "74d atrasada"
  // numa pendência já concluída.
  const overdue = !resolved && p.dias_restantes < 0;
  const dueLabel = resolved
    ? (p.resolvida_em ? `resolvida em ${fmtPrazo(p.resolvida_em)}` : 'resolvida')
    : p.dias_restantes < 0
      ? `${Math.abs(p.dias_restantes)}d atrasada`
      : p.dias_restantes === 0 ? 'vence hoje'
      : `vence em ${p.dias_restantes}d`;

  return (
    <div className="card" onClick={onClick} style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px 6px', gap: 8 }}>
        <div className="row-flex" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          {p.prioridade === 'alta' && (
            <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--danger)', boxShadow: '0 0 0 3px rgba(176,36,42,0.16)', flexShrink: 0 }} />
          )}
          <div className="t-micro" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.numero} · {p.criada_em}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, padding: '3px 8px', borderRadius: 999, background: st.bg, color: st.color }}>
            {st.label.toUpperCase()}
          </div>
          {/* Botão check rápido. A área de toque tem 40 px (dedo de obra, com
              luva e sol); o círculo visível continua com 30. O visitante não
              recebe o botão: ele só olha. */}
          {onQuickResolve && (
          <button
            onClick={(e) => { e.stopPropagation(); onQuickResolve(p.id, p.status); }}
            title={resolved ? 'Reabrir pendência' : 'Marcar como resolvida'}
            aria-label={resolved ? 'Reabrir pendência' : 'Marcar como resolvida'}
            style={{
              width: 40, height: 40, margin: -5, padding: 0, flexShrink: 0,
              border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <span style={{
              width: 30, height: 30, borderRadius: 999, boxSizing: 'border-box',
              border: resolved ? 'none' : '2px solid var(--border)',
              background: resolved ? 'var(--success,#16A34A)' : 'transparent',
              color: resolved ? '#fff' : 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.18s, border 0.18s',
            }}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </button>
          )}
        </div>
      </div>
      <div style={{ padding: '0 14px 10px' }}>
        <div className="t-strong" style={{ fontSize: 15, lineHeight: 1.3 }}>{p.titulo}</div>
      </div>
      <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Meta icon={Icon.pin} label="Ambiente" value={
          <span>
            {p.ambiente || '—'}
            {p.pavimento && (
              <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 700, color: 'var(--text-3)',
                background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 999 }}>
                {p.pavimento}
              </span>
            )}
          </span>
        } />
        <Meta icon={Icon.users} label="Resolve" value={p.empresa || '—'} />
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px',
        background: overdue ? 'rgba(176,36,42,0.06)' : resolved ? 'rgba(31,107,58,0.06)' : 'var(--surface-2)',
        borderTop: '0.5px solid var(--divider)',
      }}>
        <div className="row-flex" style={{ gap: 6 }}>
          <span style={{ width: 14, height: 14, color: overdue ? 'var(--danger)' : resolved ? 'var(--success)' : 'var(--text-2)' }}>{Icon.calendar}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: overdue ? 'var(--danger)' : resolved ? 'var(--success)' : 'var(--text-1)' }}>
            {resolved ? dueLabel : <>{p.prazo ? fmtPrazo(p.prazo) : '—'}{p.prazo ? ` · ${dueLabel}` : ''}</>}
          </span>
        </div>
        <div className="row-flex" style={{ gap: 4, color: (p.foto_problema || p.foto_solucao || p.foto_url) ? 'var(--primary)' : 'var(--text-3)' }}>
          <span style={{ width: 14, height: 14 }}>{Icon.camera}</span>
          <span style={{ fontSize: 12, fontWeight: 600 }}>{[p.foto_problema, p.foto_solucao, p.foto_url].filter(Boolean).length}</span>
        </div>
      </div>
    </div>
  );
}

function Meta({ icon, label, value }) {
  return (
    <div>
      <div className="t-micro" style={{ fontSize: 9, marginBottom: 2 }}>{label.toUpperCase()}</div>
      <div className="row-flex" style={{ gap: 5 }}>
        <span style={{ width: 12, height: 12, color: 'var(--text-3)', flexShrink: 0 }}>{icon}</span>
        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{value}</div>
      </div>
    </div>
  );
}

// ── Detalhe ──────────────────────────────────────────────────────────────────
export function ChecklistDetail({ goto, params, persona }) {
  const { ambientes, empreiteiros, somenteLeitura } = useObra();
  const [p, setP] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  // Confirmação de status
  const [confirmStatus, setConfirmStatus] = useState(null); // { status, label, color }
  const [fotoSolucaoOpen, setFotoSolucaoOpen] = useState(false);
  // Modo edição
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editPav, setEditPav] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [fotoAberta, setFotoAberta] = useState(null);   // foto ampliada em tela cheia
  const [deleting, setDeleting] = useState(false);
  const [userName, setUserName] = useState('');

  // Carrega nome do usuário logado para o histórico
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      setUserName(u?.user_metadata?.nome || u?.email?.split('@')[0] || 'Usuário');
    });
  }, []);

  const todayFmt = () => new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const todayStr = () => hojeLocal();

  const fmtDatetime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${date} · ${time}`;
  };

  // Pavimentos únicos dos ambientes cadastrados
  const pavimentos = [...new Set(ambientes.map(a => a.pavimento).filter(Boolean))].sort();
  const ambientesFiltrados = editPav ? ambientes.filter(a => a.pavimento === editPav) : ambientes;

  useEffect(() => {
    supabase.from('pendencias').select('*').eq('id', params.id).single()
      .then(({ data }) => { setP(data); setLoading(false); });
  }, [params.id]);

  // Abre confirmação de mudança de status
  function pedirConfirmStatus(newStatus) {
    const labels = {
      em_andamento: { label: 'Marcar como em andamento', color: 'var(--warn)', icon: '⏳' },
      resolvida:    { label: 'Marcar como resolvida',    color: 'var(--success,#16A34A)', icon: '✅' },
      fechada:      { label: 'Fechar pendência',         color: 'var(--text-2)', icon: '🔒' },
    };
    setConfirmStatus({ status: newStatus, ...(labels[newStatus] || { label: newStatus, color: 'var(--primary)', icon: '📋' }) });
  }

  // Aplica mudança de status genérica (em_andamento, fechada, etc.)
  async function confirmarStatus() {
    if (!confirmStatus) return;
    const { status } = confirmStatus;
    setUpdating(true);
    const today = todayStr();
    const now   = new Date().toISOString();
    const histEntry = {
      status,
      label: ST[status]?.label || status,
      por:   userName || 'Usuário',
      em:    now,
    };
    const patch = {
      status,
      historico: [...(p.historico || []), histEntry],
    };
    if (status === 'em_andamento') patch.em_andamento_em = today;
    if (status === 'fechada')      patch.fechada_em      = today;
    const { error } = await supabase.from('pendencias').update(patch).eq('id', p.id);
    setUpdating(false);
    // Só muda na tela o que o banco aceitou. Antes a tela mostrava o status
    // novo mesmo quando o banco recusava, e quem abrisse de novo via o antigo.
    if (error) { avisarErro(error, 'mudar o status'); return; }
    setP(prev => ({ ...prev, ...patch }));
    setConfirmStatus(null);
  }

  // "Marcar resolvida" pula o confirm e vai direto para o popup de foto
  function iniciarResolucao() {
    setFotoSolucaoOpen(true);
  }

  // Chamado pelo popup de foto (foto pode ser null se pular)
  async function finalizarResolucao(foto) {
    setUpdating(true);
    const today = todayStr();
    const now   = new Date().toISOString();
    const histEntry = {
      status: 'resolvida',
      label: 'Resolvida',
      por: userName || 'Usuário',
      em:  now,
    };
    const patch = {
      status:       'resolvida',
      resolvida_em: today,
      resolvida_por: userName || 'Usuário',
      historico: [...(p.historico || []), histEntry],
    };
    if (foto) patch.foto_solucao = foto;
    const { error } = await supabase.from('pendencias').update(patch).eq('id', p.id);
    setUpdating(false);
    setFotoSolucaoOpen(false);
    // Não gravou: avisa e a tela continua com o status antigo (antes mostrava
    // "resolvida" mesmo com o banco recusando). O popup fecha para não prender
    // ninguém sem internet; é só tocar em "Marcar resolvida" de novo.
    if (error) { avisarErro(error, 'marcar como resolvida'); return; }
    setP(prev => ({ ...prev, ...patch }));
  }

  // Salvar edição
  async function salvarEdicao() {
    setSavingEdit(true);
    const histEntry = {
      status: p.status,
      label: 'Editada',
      por:   userName || 'Usuário',
      em:    new Date().toISOString(),
    };
    // Prazo é opcional e a coluna é do tipo data: campo vazio vai como null.
    // Mandar '' fazia o banco recusar a edição inteira ("invalid input syntax
    // for type date") e o popup fechava como se tivesse salvo. Vale também
    // para quem apaga o prazo de uma pendência que tinha.
    const patch = {
      ...editData,
      prazo: editData.prazo || null,
      historico: [...(p.historico || []), histEntry],
    };
    const { data, error } = await supabase.from('pendencias').update(patch).eq('id', p.id).select().single();
    setSavingEdit(false);
    // Com erro, o popup fica aberto com o que foi digitado: nada se perde e dá
    // para tentar de novo.
    if (error) { avisarErro(error, 'salvar as alterações'); return; }
    if (data) setP(data);
    setEditMode(false);
  }

  // Deletar pendência
  // O .select() é o que separa "não deu" de "não podia": quando a regra do
  // banco barra a exclusão, o PostgREST não devolve erro — apaga zero linhas e
  // responde ok. Sem conferir o que voltou, a tela dizia que apagou e o item
  // continuava lá.
  async function deletarPendencia() {
    setDeleting(true);
    const { data, error } = await supabase.from('pendencias').delete().eq('id', p.id).select('id');
    setDeleting(false);
    if (error) {
      avisarErro(error, 'excluir a pendência');
      return;
    }
    if (!data || data.length === 0) {
      window.alert('Nada foi excluído. Seu acesso não permite apagar pendências — só engenharia pode.');
      return;
    }
    setConfirmDelete(false);
    setEditMode(false);
    goto('checklist');
  }

  function abrirEdit() {
    const ambAtual = ambientes.find(a => a.nome === p.ambiente);
    setEditPav(ambAtual?.pavimento || '');
    setEditData({
      titulo:     p.titulo     || '',
      descricao:  p.descricao  || '',
      ambiente:   p.ambiente   || '',
      empresa:    p.empresa    || '',
      prazo:      p.prazo      || '',
      prioridade: ['baixa','media','alta'].includes(p.prioridade) ? p.prioridade : 'media',
    });
    setEditMode(true);
  }


  if (loading) return <div className="page page-pad" style={{ textAlign: 'center', paddingTop: 80, color: 'var(--text-3)' }}>Carregando…</div>;
  if (!p) return <div className="page page-pad"><div className="card" style={{ textAlign: 'center', padding: 20 }}><div className="t-strong">Pendência não encontrada</div><button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => goto('checklist')}>Voltar</button></div></div>;

  const st = ST[p.status] || ST.aberta;
  const dias = calcDiasRestantes(p.prazo);
  const overdue = dias !== null && dias < 0;

  const inputStyle = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
    border: '1.5px solid var(--border)', background: 'var(--surface)',
    fontSize: 14, color: 'var(--text-1)', outline: 'none',
  };

  return (
    <div className="page">
      {/* Popup confirmação de status */}
      {fotoSolucaoOpen && (
        <FotoSolucaoPopup
          onSkip={() => finalizarResolucao(null)}
          onSave={async (foto) => {
            await finalizarResolucao(foto);
          }}
        />
      )}
      {confirmStatus && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 20px',
        }}>
          <div style={{ width: '100%', maxWidth: 360, background: 'var(--surface)', borderRadius: 24,
            padding: '28px 22px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{confirmStatus.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>
                {confirmStatus.label}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 600 }}>
                {p.titulo}
              </div>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '12px 14px',
              textAlign: 'center', marginBottom: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 4 }}>
                DATA DA ALTERAÇÃO
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>
                {todayFmt()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmStatus(null)}
                style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={confirmarStatus} disabled={updating}
                style={{ flex: 2, height: 46, borderRadius: 12, border: 'none',
                  background: confirmStatus.color, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                {updating ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup de edição — centralizado */}
      {editMode && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        }}>
          <div style={{ width: '100%', maxWidth: 440, background: 'var(--surface)',
            borderRadius: 24, padding: '24px 20px 22px',
            boxShadow: '0 24px 64px rgba(0,0,0,0.28)', maxHeight: '88dvh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)' }}>✏️ Editar pendência</div>
              {persona !== 'mestre' && (
                <button onClick={() => { setEditMode(false); setConfirmDelete('edicao'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8,
                    border: 'none', background: 'var(--danger-tint)', color: 'var(--danger)', cursor: 'pointer', fontSize: 12, fontWeight: 800 }}>
                  <span style={{ width: 14, height: 14 }}>{Icon.trash}</span> Excluir
                </button>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {/* Título */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 5 }}>TÍTULO *</div>
                <input style={inputStyle} value={editData.titulo} onChange={e => setEditData(d => ({ ...d, titulo: e.target.value }))} placeholder="Título da pendência" />
              </div>

              {/* Descrição */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 5 }}>DESCRIÇÃO</div>
                <textarea style={{ ...inputStyle, minHeight: 72, resize: 'none' }}
                  value={editData.descricao} onChange={e => setEditData(d => ({ ...d, descricao: e.target.value }))}
                  placeholder="Detalhe o problema…" />
                <div style={{ marginTop: 6 }}>
                  <BotaoDitar titulo="Ditar a descrição do problema"
                    onTexto={t => setEditData(d => ({ ...d, descricao: juntarDitado(d.descricao, t) }))} />
                </div>
              </div>

              {/* Pavimento + Ambiente */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 5 }}>PAVIMENTO</div>
                  <select style={inputStyle} value={editPav}
                    onChange={e => { setEditPav(e.target.value); setEditData(d => ({ ...d, ambiente: '' })); }}>
                    <option value="">Todos</option>
                    {pavimentos.map(pav => <option key={pav} value={pav}>{pav}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 5 }}>AMBIENTE</div>
                  <select style={inputStyle} value={editData.ambiente} onChange={e => setEditData(d => ({ ...d, ambiente: e.target.value }))}>
                    <option value="">-</option>
                    {ambientesFiltrados.map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>RESPONSÁVEL</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={() => setEditData(d => ({ ...d, empresa: '' }))}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left',
                      background: !editData.empresa ? 'var(--surface-2)' : 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--text-2)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--border)', flexShrink: 0 }} />
                    Sem responsável
                    {!editData.empresa && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--primary)' }}>ok</span>}
                  </button>
                  {empreiteiros.map(e => (
                    <button key={e.id} onClick={() => setEditData(d => ({ ...d, empresa: e.nome }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: `1.5px solid ${editData.empresa === e.nome ? e.cor : 'transparent'}`, cursor: 'pointer', textAlign: 'left',
                        background: editData.empresa === e.nome ? (e.cor + '15') : 'var(--surface)', fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: 999, background: e.cor, flexShrink: 0 }} />
                      {e.nome}
                      {editData.empresa === e.nome && <span style={{ marginLeft: 'auto', fontSize: 11, color: e.cor }}>ok</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 5 }}>PRAZO</div>
                  <input type="date" style={inputStyle} value={editData.prazo} onChange={e => setEditData(d => ({ ...d, prazo: e.target.value }))} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 5 }}>PRIORIDADE</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {['baixa', 'media', 'alta'].map(prio => (
                      <button key={prio} onClick={() => setEditData(d => ({ ...d, prioridade: prio }))}
                        style={{ flex: 1, padding: '9px 4px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 11,
                          background: editData.prioridade === prio ? (prio === 'alta' ? 'var(--danger)' : prio === 'media' ? 'var(--warn)' : 'var(--primary)') : 'var(--surface-2)',
                          color: editData.prioridade === prio ? '#fff' : 'var(--text-2)' }}>
                        {{ baixa: 'Baixa', media: 'Média', alta: 'Alta' }[prio]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditMode(false)}
                style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={salvarEdicao} disabled={!editData.titulo?.trim() || savingEdit}
                style={{ flex: 2, height: 46, borderRadius: 12, border: 'none',
                  background: editData.titulo?.trim() ? 'var(--primary)' : 'var(--border)',
                  color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
                {savingEdit ? 'Salvando…' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ width: '100%', maxWidth: 340, background: 'var(--surface)', borderRadius: 22,
            padding: '28px 22px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <div style={{ textAlign: 'center', fontSize: 16, fontWeight: 900, marginBottom: 8 }}>Excluir pendência?</div>
            <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.4 }}>
              {'"'}<strong>{p?.titulo}</strong>{'" será excluída de vez. Não dá para desfazer.'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              {/* Cancelar volta para de onde veio: quem abriu pelo popup de
                  edição continua editando; quem abriu pelo detalhe fica nele.
                  Antes reabria a edição sempre — dava a impressão de que o
                  cancelar tinha feito outra coisa. */}
              <button onClick={() => { const daEdicao = confirmDelete === 'edicao'; setConfirmDelete(false); if (daEdicao) setEditMode(true); }}
                style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button onClick={deletarPendencia} disabled={deleting}
                style={{ flex: 1, height: 46, borderRadius: 12, border: 'none',
                  background: 'var(--danger)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                {deleting ? 'Excluindo…' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('checklist')}>
            <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Pendências
          </button>
          {!somenteLeitura && <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={abrirEdit}
              style={{ padding: '6px 14px', borderRadius: 999, border: '0.5px solid var(--border)',
                background: 'var(--surface)', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer' }}>
              Editar
            </button>
            {/* Excluir só existia dentro do popup de "Editar pendência", num
                canto do cabeçalho — quem procurava não achava. Aqui fica ao
                lado do Editar, que é onde se procura. O mestre continua sem
                ver: apagar pendência é da engenharia. */}
            {persona !== 'mestre' && (
              <button onClick={() => setConfirmDelete(true)} title="Excluir esta pendência"
                style={{ padding: '6px 14px', borderRadius: 999, border: '0.5px solid var(--border)',
                  background: 'var(--surface)', fontSize: 12, fontWeight: 700, color: 'var(--danger)', cursor: 'pointer' }}>
                Excluir
              </button>
            )}
          </div>}
        </div>
      </div>
      <div style={{ padding: '6px var(--pad-4) 4px' }}>
        <div className="row-between">
          <div className="t-micro">{p.numero}</div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.4, padding: '4px 9px', borderRadius: 999, background: st.bg, color: st.color }}>{st.label.toUpperCase()}</div>
        </div>
        <div className="t-h2" style={{ marginTop: 4, fontSize: 22, lineHeight: 1.2 }}>{p.titulo}</div>
        {p.prioridade === 'alta' && (
          <div className="row-flex" style={{ gap: 6, marginTop: 8 }}>
            <span style={{ width: 14, height: 14, color: 'var(--danger)' }}>{Icon.alert}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Prioridade alta</span>
          </div>
        )}
      </div>

      <div className="page-pad stack stack-3">
        <div className="card" style={{ padding: 0 }}>
          <DetailRow icon={Icon.pin} label="AMBIENTE" value={p.ambiente || '-'} />
          <div style={{ height: 0.5, background: 'var(--divider)' }} />
          <DetailRow icon={Icon.users} label="RESPONSÁVEL" value={p.empresa || '-'} />
          <div style={{ height: 0.5, background: 'var(--divider)' }} />
          <DetailRow icon={Icon.calendar} label="PRAZO" value={
            <div className="row-flex" style={{ gap: 8 }}>
              <span style={{ fontWeight: 700, color: overdue ? 'var(--danger)' : 'var(--text-1)' }}>
                {p.prazo ? fmtPrazo(p.prazo) : '-'}
              </span>
              {dias !== null && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: overdue ? 'rgba(176,36,42,0.12)' : 'var(--surface-2)', color: overdue ? 'var(--danger)' : 'var(--text-2)' }}>
                  {overdue ? (Math.abs(dias) + 'd atrasada') : dias === 0 ? 'vence hoje' : (dias + 'd restantes')}
                </span>
              )}
            </div>
          } />
        </div>

        {p.descricao && (
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>DESCRIÇÃO DO PROBLEMA</div>
            <div className="card" style={{ fontSize: 14, lineHeight: 1.5 }}>{p.descricao}</div>
          </div>
        )}

        {/* Antes e depois lado a lado quando a tela permite, empilhadas no
            celular — o auto-fit decide sozinho, sem media query. */}
        {(p.foto_problema || p.foto_url || p.foto_solucao) && (
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
            {[{ url: p.foto_problema || p.foto_url, rotulo: 'FOTO DO PROBLEMA' },
              { url: p.foto_solucao, rotulo: 'FOTO DA SOLUÇÃO' }]
              .filter(x => x.url).map(x => (
                <div key={x.rotulo}>
                  <div className="t-micro" style={{ marginBottom: 6 }}>{x.rotulo}</div>
                  <button onClick={() => setFotoAberta(x)} title="ampliar"
                    style={{ display: 'block', width: '100%', padding: 0, border: 0, cursor: 'zoom-in',
                      borderRadius: 14, overflow: 'hidden', background: 'var(--surface-2)' }}>
                    {/* contain: cover cortava a foto e escondia justamente o
                        que a pendência queria mostrar */}
                    <img src={x.url} alt={x.rotulo} loading="lazy" decoding="async"
                      style={{ width: '100%', height: 190, objectFit: 'contain', display: 'block' }} />
                  </button>
                </div>
              ))}
          </div>
        )}

        <div>
          <div className="t-micro" style={{ marginBottom: 6 }}>HISTÓRICO</div>
          <div className="card" style={{ padding: 0 }}>
            <Timeline dot="var(--info)" who={p.criado_por || p.criada_por_nome || 'Sistema'}
              when={p.created_at ? fmtDatetime(p.created_at) : ''}
              text="Pendência aberta."
              last={!p.historico?.length && p.status === 'aberta'} />
            {(p.historico && p.historico.length > 0)
              ? p.historico.map((h, i) => {
                  const isLast = i === p.historico.length - 1;
                  const dot =
                    h.status === 'fechada'   ? 'var(--text-3)'  :
                    h.status === 'resolvida' ? 'var(--success)' :
                    h.status === 'em_andamento' ? 'var(--warn)'  :
                    h.status === 'atrasada'  ? 'var(--danger)'  :
                    h.label  === 'Editada'   ? 'var(--primary)' : 'var(--info)';
                  return (
                    <Timeline key={i} dot={dot}
                      who={h.por || '-'}
                      when={h.em ? fmtDatetime(h.em) : ''}
                      text={
                        h.label === 'Editada'         ? 'Pendência editada.'          :
                        h.status === 'em_andamento'   ? 'Marcada em andamento.'       :
                        h.status === 'resolvida'      ? 'Marcada como resolvida.'     :
                        h.status === 'fechada'        ? 'Verificada e fechada.'       :
                        h.status === 'atrasada'       ? 'Prazo vencido sem resolução.' :
                        h.label || h.status
                      }
                      last={isLast} />
                  );
                })
              : <>
                  {(p.status !== 'aberta' || p.em_andamento_em) && (
                    <Timeline dot="var(--warn)" who={p.empresa || 'Responsável'}
                      when={p.em_andamento_em ? fmtDatetime(p.em_andamento_em) : ''}
                      text="Marcada em andamento." last={p.status === 'em_andamento'} />
                  )}
                  {(p.resolvida_em || ['resolvida','fechada'].includes(p.status)) && (
                    <Timeline dot="var(--success)" who={p.empresa || 'Responsável'}
                      when={p.resolvida_em ? fmtDatetime(p.resolvida_em) : ''}
                      text="Marcada como resolvida." last={p.status === 'resolvida'} />
                  )}
                  {(p.fechada_em || p.status === 'fechada') && (
                    <Timeline dot="var(--text-3)" who="Engenheiro"
                      when={p.fechada_em ? fmtDatetime(p.fechada_em) : ''}
                      text="Verificada e fechada." last />
                  )}
                  {p.status === 'atrasada' && (
                    <Timeline dot="var(--danger)" who="Sistema" when="" text="Prazo vencido sem resolução." last />
                  )}
                </>
            }
          </div>
        </div>
      </div>

      {p.status !== 'fechada' && !somenteLeitura && (
        <div style={{ position: 'sticky', bottom: 0, background: 'var(--bg)', padding: '12px var(--pad-4) calc(80px + env(safe-area-inset-bottom))', boxShadow: '0 -8px 24px rgba(0,0,0,0.06)', borderTop: '0.5px solid var(--divider)', marginTop: 8 }}>
          {persona === 'eng' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {p.status === 'resolvida' ? (
                <>
                  <button className="btn btn-secondary" disabled={updating} onClick={() => pedirConfirmStatus('em_andamento')}>Reabrir</button>
                  <button className="btn btn-primary" disabled={updating} onClick={() => pedirConfirmStatus('fechada')}>Fechar pendência</button>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" disabled={updating} onClick={() => pedirConfirmStatus('em_andamento')}>Em andamento</button>
                  <button className="btn btn-primary" disabled={updating} onClick={iniciarResolucao}>Marcar resolvida</button>
                </>
              )}
            </div>
          ) : (
            <button className="btn btn-primary btn-block" disabled={updating} onClick={iniciarResolucao}>
              <span style={{ width: 18, height: 18 }}>{Icon.check}</span>
              {updating ? 'Salvando…' : 'Marcar como resolvida'}
            </button>
          )}
        </div>
      )}

      {fotoAberta && (
        <VisualizadorFoto url={fotoAberta.url} titulo={`${p.numero || ''} · ${fotoAberta.rotulo.toLowerCase()}`}
          onFechar={() => setFotoAberta(null)} />
      )}
    </div>
  );
}

function DetailRow({ icon, label, value }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 14px', alignItems: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: 16, height: 16 }}>{icon}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-micro" style={{ fontSize: 9, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
      </div>
    </div>
  );
}

function cleanDisplayName(name) {
  if (!name) return '-';
  if (name.includes('@')) return name.split('@')[0];
  return name;
}

function Timeline({ dot, who, when, text, last }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: dot, marginTop: 2, flexShrink: 0 }} />
        {!last && <div style={{ flex: 1, width: 1.5, background: 'var(--border)', marginTop: 4, borderRadius: 999 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{text}</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{cleanDisplayName(who)} · {when}</div>
      </div>
    </div>
  );
}

// ── Foto da pendência ────────────────────────────────────────────────────────
// A foto vai para o bucket, como todo arquivo do app, e o que fica gravado na
// pendência é a URL. Antes ela virava data: URL e era guardada DENTRO da linha
// do banco: inflava a tabela (base64 cresce ~33%), pesava em toda listagem que
// trouxesse a coluna, e não abria em aba nova, porque o navegador bloqueia
// navegação para data:. Linhas antigas continuam com data: e seguem
// aparecendo normalmente — <img> aceita os dois.
function FotoInput({ label, value, onChange }) {
  // Dois inputs de propósito: com capture="environment" o celular abre a
  // câmera direto e não deixa escolher da galeria — foto tirada antes, ou
  // recebida no WhatsApp, ficava de fora. Sem capture, abre o seletor.
  const refCamera  = React.useRef();
  const refGaleria = React.useRef();
  const [enviando, setEnviando] = useState(false);

  const receber = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f || enviando) return;
    setEnviando(true);
    try {
      const { url } = await enviarArquivo(f, 'pendencias', { quality: 0.82 });
      onChange(url);
    } catch (err) {
      avisarErro(err, 'enviar esta foto');
    }
    setEnviando(false);
  };

  const botao = {
    flex: 1, height: 110, borderRadius: 14,
    border: '2px dashed var(--border)', background: 'var(--surface-2)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: 8, cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'inherit',
  };

  return (
    <div>
      <input ref={refCamera} type="file" accept="image/*" capture="environment"
        style={{ display: 'none' }} onChange={receber} />
      <input ref={refGaleria} type="file" accept="image/*"
        style={{ display: 'none' }} onChange={receber} />
      {value ? (
        <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: '2px solid var(--primary)' }}>
          <img src={value} alt="foto" style={{ width: '100%', height: 200, objectFit: 'contain', display: 'block', background: 'var(--surface-2)' }} />
          <button onClick={() => onChange(null)} style={{
            position: 'absolute', top: 8, right: 8, width: 30, height: 30,
            borderRadius: 999, background: 'rgba(0,0,0,0.55)', color: '#fff',
            border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
      ) : (
        <div>
          {label && <div className="t-caption" style={{ fontSize: 11.5, marginBottom: 6 }}>{label}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => refCamera.current?.click()} disabled={enviando}
              style={{ ...botao, opacity: enviando ? 0.55 : 1, cursor: enviando ? 'default' : 'pointer' }}>
              <span style={{ fontSize: 26 }}>{enviando ? '⏳' : '📷'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{enviando ? 'Enviando…' : 'Câmera'}</span>
            </button>
            <button onClick={() => refGaleria.current?.click()} disabled={enviando}
              style={{ ...botao, opacity: enviando ? 0.55 : 1, cursor: enviando ? 'default' : 'pointer' }}>
              <span style={{ fontSize: 26 }}>{enviando ? '⏳' : '🖼️'}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700 }}>{enviando ? 'Enviando…' : 'Galeria'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Popup de foto da solução (abre após marcar como resolvida) ────────────────
function FotoSolucaoPopup({ onSave, onSkip }) {
  const [foto, setFoto] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{ width: '100%', maxWidth: 380, background: 'var(--surface)', borderRadius: 22,
        padding: '28px 22px 22px', boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
          <div style={{ fontSize: 17, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6 }}>
            Pendência resolvida!
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.5 }}>
            Quer registrar uma foto da situação resolvida?
          </div>
        </div>
        <FotoInput label="Foto da solução" value={foto} onChange={setFoto} />
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onSkip} style={{
            flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer',
          }}>
            Pular
          </button>
          <button disabled={!foto || saving} onClick={async () => {
            setSaving(true);
            await onSave(foto);
            setSaving(false);
          }} style={{
            flex: 2, height: 46, borderRadius: 12, border: 'none',
            background: foto ? 'var(--success)' : 'var(--border)',
            color: '#fff', fontSize: 14, fontWeight: 800, cursor: foto ? 'pointer' : 'default',
          }}>
            {saving ? 'Salvando…' : '📷 Salvar foto'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Nova Pendência — Wizard passo a passo ─────────────────────────────────────
const STEPS = [
  { id: 'descricao',   title: 'Qual é o problema?',       sub: 'Descreva a pendência com clareza' },
  { id: 'local',       title: 'Onde está o problema?',    sub: 'Selecione o pavimento e ambiente' },
  { id: 'responsavel', title: 'Quem é o responsável?',    sub: 'Empresa ou equipe responsável' },
  { id: 'prazo',       title: 'Quando deve ser resolvido?', sub: 'Defina um prazo (opcional)' },
  { id: 'foto',        title: 'Foto do problema',         sub: 'Registre a situação atual (opcional)' },
];

function WizardDots({ total, current }) {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 28 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === current ? 20 : 7, height: 7, borderRadius: 999,
          background: i <= current ? 'var(--primary)' : 'var(--border)',
          transition: 'all 0.2s',
        }} />
      ))}
    </div>
  );
}

export function ChecklistNew({ goto, profile }) {
  const { ambientes, empreiteiros } = useObra();
  const [step, setStep] = React.useState(0);
  const [descricao,  setDescricao]  = React.useState('');
  const [pavimento,  setPavimento]  = React.useState('');
  const [ambiente,   setAmbiente]   = React.useState('');
  const [empresa,    setEmpresa]    = React.useState('');
  const [prazo,      setPrazo]      = React.useState('');
  const [prioridade, setPrioridade] = React.useState('media');
  const [foto,       setFoto]       = React.useState(null);
  const [saving,     setSaving]     = React.useState(false);
  const [saveError,  setSaveError]  = React.useState('');

  const pavimentos = [...new Set(ambientes.map(a => a.pavimento).filter(Boolean))].sort();
  const ambsFiltrados = pavimento ? ambientes.filter(a => a.pavimento === pavimento) : ambientes;

  function prev() { if (step > 0) setStep(s => s - 1); }

  async function salvar() {
    if (!descricao.trim()) return;
    setSaving(true);
    setSaveError('');
    const rawNome = profile?.nome || profile?.email || 'Usuário';
    const criadorNome = rawNome.includes('@') ? rawNome.split('@')[0] : rawNome;
    const histEntry = {
      status: 'aberta', label: 'Criada', por: criadorNome,
      em: new Date().toISOString(),
    };
    // Payload base (colunas garantidas no banco — sem prioridade para evitar check constraint)
    const basePayload = {
      titulo:     descricao.trim(),
      descricao:  descricao.trim(),
      ambiente:   ambiente  || null,
      empresa:    empresa   || null,
      prazo:      prazo     || null,
      status:     'aberta',
    };
    // Tenta inserir com colunas extras (historico, criado_por, foto_problema, pavimento)
    const fullPayload = {
      ...basePayload,
      prioridade,   // 'baixa' | 'media' | 'alta' — valores válidos da constraint
      historico:     [histEntry],
      criado_por:    criadorNome,
      foto_problema: foto || null,
      pavimento:     (pavimento && pavimento !== '__sem') ? pavimento : null,
    };
    const { error } = await supabase.from('pendencias').insert(fullPayload);
    if (error) {
      console.warn('Insert completo falhou:', error.message, '| payload:', JSON.stringify(fullPayload));
      // Fallback: só colunas base (sem historico, criado_por, foto, pavimento, prioridade)
      const { error: err2 } = await supabase.from('pendencias').insert(basePayload);
      if (err2) {
        console.error('Insert base também falhou:', err2.message, '| payload:', JSON.stringify(basePayload));
        setSaveError(msgAmigavel(err2, 'criar a pendência'));
        setSaving(false);
        return;
      }
      // O fallback grava só as colunas básicas: foto, prioridade e histórico
      // ficam de fora. Antes isso passava como sucesso total e o usuário só
      // descobria depois que a foto tinha sumido.
      alert('A pendência foi criada, mas a foto e a prioridade não puderam ser salvas.\nAbra a pendência e anexe a foto novamente.');
    }
    setSaving(false);
    goto('checklist');
  }

  const step0 = STEPS[step];
  const cardStyle = { background: 'var(--surface-2)', borderRadius: 12, border: '0.5px solid var(--border)', padding: '12px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text-1)', transition: 'all 0.12s' };
  const cardSelStyle = { ...cardStyle, background: 'var(--primary-tint)', border: '2px solid var(--primary)', color: 'var(--primary)', fontWeight: 800 };

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Cabeçalho */}
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }}
          onClick={() => step === 0 ? goto('checklist') : prev()}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
          {step === 0 ? 'Pendências' : 'Voltar'}
        </button>
      </div>

      <div style={{ flex: 1, padding: '24px var(--pad-4) 24px', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <WizardDots total={STEPS.length} current={step} />

        <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)', marginBottom: 6, lineHeight: 1.2 }}>
          {step0.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 24 }}>
          {step0.sub}
        </div>

        {/* Step 0: Descrição */}
        {step === 0 && (
          <div style={{ flex: 1 }}>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Infiltração na parede do banheiro do térreo..."
              autoFocus
              rows={5}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '14px',
                borderRadius: 12, border: '2px solid var(--border)',
                background: 'var(--surface-2)', fontSize: 15, color: 'var(--text-1)',
                fontFamily: 'inherit', outline: 'none', resize: 'none', lineHeight: 1.5,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <BotaoDitar titulo="Ditar a descrição do problema"
                onTexto={t => setDescricao(v => juntarDitado(v, t))} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {['baixa','media','alta'].map(p => (
                <button key={p} onClick={() => setPrioridade(p)}
                  style={{ flex: 1, height: 38, borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 800,
                    background: prioridade === p ? (p === 'alta' ? 'var(--danger)' : p === 'media' ? 'var(--warn)' : 'var(--primary)') : 'var(--surface-2)',
                    color: prioridade === p ? '#fff' : 'var(--text-3)',
                  }}>
                  {{ baixa: 'Baixa', media: 'Média', alta: 'Alta' }[p]}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Localização — Pavimento → Ambiente */}
        {step === 1 && (
          <div style={{ flex: 1 }}>
            {!pavimento ? (
              <>
                <div className="t-micro" style={{ marginBottom: 10 }}>PAVIMENTO</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {pavimentos.map(pav => (
                    <button key={pav} onClick={() => setPavimento(pav)}
                      style={pav === pavimento ? cardSelStyle : cardStyle}>
                      🏗️ {pav}
                    </button>
                  ))}
                  <button onClick={() => { setPavimento('__sem'); setAmbiente(''); }}
                    style={{ ...cardStyle, color: 'var(--text-3)' }}>
                    Sem localização específica
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <button onClick={() => { setPavimento(''); setAmbiente(''); }}
                    style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-tint)', border: 'none', borderRadius: 8, padding: '4px 10px', cursor: 'pointer' }}>
                    ← {pavimento === '__sem' ? 'Geral' : pavimento}
                  </button>
                  {ambiente && (
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-2)' }}>· {ambiente}</span>
                  )}
                </div>
                {pavimento !== '__sem' && (
                  <>
                    <div className="t-micro" style={{ marginBottom: 10 }}>AMBIENTE</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {ambsFiltrados.map(a => (
                        <button key={a.id} onClick={() => setAmbiente(a.nome)}
                          style={ambiente === a.nome ? cardSelStyle : cardStyle}>
                          {a.nome}
                        </button>
                      ))}
                      {ambsFiltrados.length === 0 && (
                        <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>
                          Nenhum ambiente neste pavimento
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 2: Responsável */}
        {step === 2 && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setEmpresa('')}
              style={!empresa ? cardSelStyle : cardStyle}>
              Sem responsável definido
            </button>
            {empreiteiros.map(e => (
              <button key={e.id} onClick={() => setEmpresa(e.nome)}
                style={{
                  ...(empresa === e.nome ? cardSelStyle : cardStyle),
                  display: 'flex', alignItems: 'center', gap: 12,
                  borderColor: empresa === e.nome ? e.cor : 'transparent',
                  background: empresa === e.nome ? e.cor + '20' : 'var(--surface-2)',
                  color: empresa === e.nome ? e.cor : 'var(--text-1)',
                }}>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: e.cor, flexShrink: 0 }} />
                {e.nome}
                {empresa === e.nome && <span style={{ marginLeft: 'auto', fontSize: 16 }}>✓</span>}
              </button>
            ))}
          </div>
        )}

        {/* Step 3: Prazo */}
        {step === 3 && (
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button onClick={() => setPrazo('')}
                style={{ ...(!prazo ? cardSelStyle : cardStyle), textAlign: 'left' }}>
                📅 Sem prazo definido
              </button>
              {[
                { label: '3 dias', days: 3 },
                { label: '1 semana', days: 7 },
                { label: '2 semanas', days: 14 },
                { label: '1 mês', days: 30 },
              ].map(({ label, days }) => {
                const d = new Date(); d.setDate(d.getDate() + days);
                const ds = toISODate(d);
                return (
                  <button key={label} onClick={() => setPrazo(ds)}
                    style={{ ...(prazo === ds ? cardSelStyle : cardStyle), textAlign: 'left' }}>
                    ⏱ {label} — {d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                    {prazo === ds && <span style={{ float: 'right' }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ marginTop: 4 }}>
                <div className="t-micro" style={{ marginBottom: 8 }}>OU ESCOLHA UMA DATA</div>
                <input type="date" value={prazo}
                  onChange={e => setPrazo(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', fontSize: 15, color: 'var(--text-1)', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Foto */}
        {step === 4 && (
          <div style={{ flex: 1 }}>
            <FotoInput label="Foto do problema" value={foto} onChange={setFoto} />
            {foto && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--success-tint)', borderRadius: 10, fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>
                ✓ Foto adicionada
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rodapé de navegação */}
      <div style={{ padding: '12px 20px 20px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: 10, flexShrink: 0 }}>
        {step > 1 && (
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(s => s - 1)}>
            Voltar
          </button>
        )}
        {step < 4 ? (
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={step === 0 && !descricao.trim()}
            onClick={() => setStep(s => s + 1)}>
            Próximo
          </button>
        ) : (
          <button className="btn btn-primary" style={{ flex: 2 }}
            disabled={saving || !descricao.trim()}
            onClick={salvar}>
            {saving ? 'Salvando…' : 'Criar pendência'}
          </button>
        )}
      </div>
      {/* O erro era guardado no estado e nunca mostrado: a tela ficava parada
          sem explicar por que a pendência não foi criada. */}
      {saveError && (
        <div style={{ margin: '0 var(--pad-4) 12px', padding: '10px 14px', borderRadius: 12,
          background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
          ⚠️ {saveError}
        </div>
      )}
    </div>
  );
}
