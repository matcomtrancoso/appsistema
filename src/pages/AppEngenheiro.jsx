import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { BottomNav, Icon, Sheet } from '../components/index';
import { useSwipeBack } from '../lib/swipe-back';
import {
  EngHome, EngPlanejar, NovaAtividadeSheet,
  EngRelatorios, EngTodos, EngRDOReview, EngEfetivo,
} from '../screens/engenheiro';
import { EngAtas } from '../screens/visitas';
import { EngEquipamentos } from '../screens/equipamentos';
import { ChecklistList, ChecklistDetail, ChecklistNew } from '../screens/checklist';
import { ABERTAS } from '../lib/pendencias-filtro';
// As duas telas mais pesadas e menos frequentes ficam fora do chunk inicial:
// o app abre mais rápido e elas carregam só na primeira vez que alguém entra.
const EngRelatorioPDF = lazy(() => import('../screens/relatorio-pdf').then(m => ({ default: m.EngRelatorioPDF })));
import { EngCadastros } from '../screens/cadastros';
import { EfetivoResumo } from '../screens/efetivo-resumo';
import { ContratacoesScreen } from '../screens/contratacoes';
import { ProjetosScreen } from '../screens/projetos';
import { CronogramaScreen } from '../screens/cronograma';
import { registrarInicioRealDoRDO } from '../lib/cronograma';
import { RDOHistoricoScreen } from '../screens/rdo-historico';
import { RevisaoColaboradoresPopup } from '../screens/revisao-colaboradores';
import { ObrasScreen } from '../screens/obras';
import { ConfiguracoesScreen } from '../screens/configuracoes';
import { OrcamentosScreen } from '../screens/orcamentos';
import { MedicoesScreen } from '../screens/medicoes';
import { ContasPagarScreen } from '../screens/contas-pagar';
import { ContasReceberScreen } from '../screens/contas-receber';
import { useObraSelecionada } from '../lib/obra-selecionada';
import { MARCA } from '../marca.js';
import { hojeLocal } from '../lib/date';
import { semanaDe, atividadesDoDia, chaveDoDia } from '../lib/atividades-do-dia';
import {
  MestreRDOv2, MestreRDOAddSheet, MestreRDOAssign, getDerivedStatus, BarraDiaRDO,
} from '../screens/mestre-rdo-v2';
import { MestreRDOWizard } from '../screens/mestre-rdo-wizard';
import { GaleriaFotos } from '../screens/galeria-fotos';
const GestaoVisual = lazy(() => import('../screens/gestao-visual').then(m => ({ default: m.GestaoVisual })));
import { AdminUsuarios } from '../screens/admin-usuarios';
import { patchStatusDoDia } from '../lib/status-atividade';

import { MestreRDOActivity as RDOActivity, MestreRDOSummary as RDOSummary, MestreOccurrence as RDOOccurrence } from '../screens/mestre';

// Suspense local: enquanto a tela pesada baixa, a casca (sidebar, nav) fica
// em pé — sem isso o fallback do App.jsx apagaria a página inteira.
function TelaLazy({ children }) {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}>
      {children}
    </Suspense>
  );
}

function loginFirstName(profile) {
  const raw = profile?.nome || profile?.email || '';
  const base = raw.includes('@') ? raw.split('@')[0] : raw.split(' ')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}
function loginInitial(profile) {
  return loginFirstName(profile).charAt(0).toUpperCase();
}

// O rótulo do topo sai do tipo de acesso do perfil. Antes era fixo em
// "ENG. RESIDENTE", e o visitante via a casca da engenharia com esse título.
const ROTULO_PAPEL = { engenheiro: 'ENG. RESIDENTE', mestre: 'MESTRE DE OBRAS', visitante: 'VISITANTE' };
function rotuloPapel(profile) {
  return ROTULO_PAPEL[profile?.role] || 'SEM TIPO DE ACESSO';
}

// A barra lateral do desktop. Mora aqui fora de proposito: declarada dentro do
// AppEngenheiro, ela virava um componente novo a cada render e era remontada
// do zero toda vez.
function BarraLateral({ expandida, setExpandida, nav, ativo, goto, profile, abrirMenu, obraAtual, obras, trocarObra }) {
  const ini = loginInitial(profile);
  const [obraMenuOpen, setObraMenuOpen] = useState(false);
  const podeTrocar = obras.length > 1;
  return (
    <div style={{
      width: expandida ? 220 : 64,
      flexShrink: 0,
      background: 'var(--surface)',
      borderRight: '0.5px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      overflow: 'hidden',
      height: '100%',
      zIndex: 10,
    }}>
      {/* Marca / toggle */}
      <div style={{
        height: 58, display: 'flex', alignItems: 'center',
        padding: '0 12px', gap: 10,
        borderBottom: '0.5px solid var(--border)', flexShrink: 0,
      }}>
        {expandida && (
          <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
            <button
              onClick={() => podeTrocar && setObraMenuOpen(v => !v)}
              title={podeTrocar ? 'Trocar de obra' : undefined}
              style={{
                display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0,
                fontFamily: 'inherit', cursor: podeTrocar ? 'pointer' : 'default',
                fontSize: 13, fontWeight: 800, color: 'var(--text-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
              {obraAtual?.nome || MARCA.obra}{podeTrocar ? ' ▾' : ''}
            </button>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.05em' }}>{rotuloPapel(profile)}</div>
            {obraMenuOpen && podeTrocar && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 50,
                width: 220, background: 'var(--surface)', borderRadius: 12, border: '0.5px solid var(--border)',
                boxShadow: '0 12px 32px rgba(0,0,0,0.18)', padding: 6,
              }}>
                {obras.map(o => (
                  <button key={o.id} onClick={() => { trocarObra(o.id); setObraMenuOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5,
                      fontWeight: o.id === obraAtual?.id ? 800 : 600,
                      color: o.id === obraAtual?.id ? 'var(--primary)' : 'var(--text-1)',
                      background: o.id === obraAtual?.id ? 'var(--primary-tint)' : 'transparent',
                    }}>
                    {o.nome}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setExpandida(e => !e)}
          title={expandida ? 'Recolher' : 'Expandir'}
          style={{ width: 36, height: 36, borderRadius: 10, border: '0.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Itens de navegação */}
      {/* Sem rolagem: são 14 itens fixos e o menu inteiro tem de caber na tela.
          Por isso a linha é mais baixa do que o padrão do app. */}
      <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
        {nav.map(item => {
          const isActive = ativo === item.key;
          return (
            <button key={item.key} onClick={() => goto(item.key)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center',
                gap: expandida ? 12 : 0,
                justifyContent: expandida ? 'flex-start' : 'center',
                padding: expandida ? '6px 12px' : '7px 0',
                border: 'none', borderRadius: 9,
                background: isActive ? 'var(--primary)' : 'transparent',
                color: isActive ? '#fff' : 'var(--text-2)',
                cursor: 'pointer', fontWeight: isActive ? 700 : 500,
                position: 'relative', transition: 'background 0.15s, color 0.15s',
                fontFamily: 'inherit', fontSize: 13.5,
              }}>
              <span style={{ width: 18, height: 18, flexShrink: 0 }}>{item.icon}</span>
              {expandida && <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
              {item.badge > 0 && (
                <div style={{
                  position: expandida ? 'static' : 'absolute',
                  top: expandida ? undefined : 5, right: expandida ? undefined : 5,
                  marginLeft: expandida ? 'auto' : undefined,
                  minWidth: 18, height: 18, borderRadius: 999,
                  background: isActive ? 'rgba(255,255,255,0.3)' : '#EF4444',
                  color: '#fff', fontSize: 10, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                }}>
                  {item.badge > 99 ? '99+' : item.badge}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Usuário + sair. O botão "Links rápidos" saiu daqui: os mesmos atalhos
          já estão dentro deste popup, e a linha a mais empurrava o menu para o
          scroll. */}
      <div style={{ padding: '10px 8px', borderTop: '0.5px solid var(--border)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center',
          gap: expandida ? 10 : 0,
          justifyContent: expandida ? 'flex-start' : 'center',
          padding: expandida ? '6px 8px' : '6px 0',
        }}>
          <button onClick={() => abrirMenu()} title="Abrir perfil e atalhos"
            style={{
              width: 32, height: 32, borderRadius: 999, border: 'none',
              background: 'var(--primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 800, flexShrink: 0, cursor: 'pointer', fontFamily: 'inherit',
            }}>{ini}</button>
          {expandida && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <button onClick={() => abrirMenu()} title="Abrir perfil e atalhos"
                style={{ display: 'block', width: '100%', textAlign: 'left', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
                {loginFirstName(profile)}
              </button>
              {/* scope 'local': sai só deste aparelho. O padrão do Supabase derruba a
                  conta em todos (o celular do canteiro caía no meio do RDO). */}
              <button onClick={() => supabase.auth.signOut({ scope: 'local' })}
                style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                Sair da conta
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AppEngenheiro({ profile }) {
  const { obraAtual, obras, trocarObra } = useObraSelecionada();
  const [route, setRoute] = useState({ screen: 'home', params: {} });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDate, setSheetDate] = useState(null);
  const [planKey, setPlanKey] = useState(0);
  const [dailyState, setDailyState] = useState({ submitted: false });
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 900);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const ini = loginInitial(profile);

  const [rdoId, setRdoId]           = useState(null);
  const [rdoSubmetido, setRdoSubmetido] = useState(false);
  const [rdoAtividades, setRdoAtividades] = useState([]);
  const [rdoEfetivo, setRdoEfetivo]   = useState([]);
  const [rdoDate, setRdoDate]         = useState(hojeLocal());
  const [efetivoSheetOpen, setEfetivoSheetOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [palette, setPalette] = useState(() => { try { return localStorage.getItem('cr-palette') || 'green'; } catch { return 'green'; } });
  const aplicarPalette = (p) => { setPalette(p); try { localStorage.setItem('cr-palette', p); } catch { /* ignore */ } };
  const saveTimer = useRef(null);
  const rdoIdRef = useRef(null);
  const cargaRdoRef = useRef(0);   // número da última carga de RDO: descarta resposta velha
  const isRemoteUpdate = useRef(false);
  const atividadesRef = useRef([]);
  useEffect(() => { atividadesRef.current = rdoAtividades; }, [rdoAtividades]);
  const dayKeyEng = chaveDoDia(rdoDate);   // dia da semana do RDO aberto

  // ── Badges ─────────────────────────────────────────────────────────────────
  const [checklistBadge, setChecklistBadge] = useState(0);

  // Recarrega a cada troca de tela: pendência criada, resolvida ou apagada em
  // outra tela (detalhe, nova) muda o número, e antes ele só era lido ao abrir o app.
  useEffect(() => {
    let ativo = true;
    supabase.from('pendencias').select('id', { count: 'exact', head: true })
      .in('status', ABERTAS)
      .then(({ count, error }) => {
        if (error) { console.error('Erro badge pendências:', error); return; }
        if (ativo) setChecklistBadge(count || 0);
      });
    return () => { ativo = false; };
  }, [route.screen]);

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const today = hojeLocal();
  // Chave por data do RDO aberto (era sempre "hoje", então abrir um dia
  // passado no histórico carregava o efetivo de hoje por cima dele).
  const EFETIVO_KEY_ENG = `cre_efetivo_eng_${rdoDate || today}`;

  // ── Realtime: atualiza efetivo quando mestre altera efetivo_draft ──────────
  useEffect(() => {
    if (!rdoId) return;
    const ch = supabase.channel('eng-rdo-efetivo-' + rdoId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rdos', filter: `id=eq.${rdoId}` }, (payload) => {
        const draft = payload.new?.efetivo_draft;
        if (!Array.isArray(draft)) return;
        setRdoEfetivo(prev => {
          if (JSON.stringify(prev) === JSON.stringify(draft)) return prev;
          isRemoteUpdate.current = true;
          return draft;
        });
        // Só o RDO de HOJE mexe no "enviado hoje" do início: abrir um dia
        // antigo para editar não pode acender o aviso de hoje.
        if (payload.new?.submetido && payload.new?.data === hojeLocal()) setDailyState({ submitted: true });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [rdoId]);

  // ── Salva efetivo no localStorage e no Supabase (debounced) ───────────────
  useEffect(() => {
    try { localStorage.setItem(EFETIVO_KEY_ENG, JSON.stringify(rdoEfetivo)); } catch (_) { /* localStorage bloqueado (aba anonima, cota cheia): segue sem salvar */ }
    if (!rdoIdRef.current) return;
    if (isRemoteUpdate.current) { isRemoteUpdate.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from('rdos').update({ efetivo_draft: rdoEfetivo }).eq('id', rdoIdRef.current);
      // Sincroniza o status derivado de cada atividade com colaborador atribuido
      // (o wizard mexe no status pelo efetivo). Grava por DIA para atividades da
      // semana — mesmo criterio do mestre, senao o RDO de um dia carimbava a
      // semana toda no planejamento.
      const atividadeIds = new Set([
        ...rdoEfetivo.filter(w => w.atividade_id).map(w => w.atividade_id),
        ...rdoEfetivo.flatMap(w => (w.extras || []).filter(e => e.atividade_id).map(e => e.atividade_id)),
      ]);
      if (atividadeIds.size === 0) return;
      const derivadoPorId = {};
      for (const id of atividadeIds) derivadoPorId[id] = getDerivedStatus(id, rdoEfetivo);
      const patchPorId = {};
      for (const a of atividadesRef.current) {
        if (derivadoPorId[a.id] === undefined) continue;
        patchPorId[a.id] = patchStatusDoDia(a, derivadoPorId[a.id], dayKeyEng);
      }
      await Promise.all(Object.entries(patchPorId).map(([id, patch]) =>
        supabase.from('atividades_rdo').update(patch).eq('id', id)
      ));
      setRdoAtividades(prev => prev.map(a => patchPorId[a.id] ? { ...a, ...patchPorId[a.id] } : a));
    }, 800);
  }, [rdoEfetivo]);

  // Abre o RDO de qualquer dia até hoje — e cria na hora se o dia nunca foi
  // preenchido (era só hoje, e por isso não dava para registrar um dia
  // esquecido). Dia futuro não abre: RDO é registro do que já aconteceu.
  async function loadRDO_eng(date) {
    const todayStr = hojeLocal();
    if (!date || date > todayStr) date = todayStr;
    const minhaVez = ++cargaRdoRef.current;
    setRdoDate(date);

    // Zera o que era do dia anterior antes de carregar: sem isso, durante a
    // troca o auto-salvar do efetivo podia gravar o rascunho do dia velho no
    // RDO novo. (O mestre já faz assim.)
    rdoIdRef.current = null;
    setRdoId(null);
    setRdoAtividades([]);

    let { data: rdo } = await supabase.from('rdos').select('*').eq('data', date).maybeSingle();
    if (!rdo) {
      // upsert: se outro aparelho criar o mesmo dia ao mesmo tempo, devolve o que existe em vez de falhar.
      const { data, error } = await supabase.from('rdos').upsert({ data: date }, { onConflict: 'obra_id,data' }).select().single();
      if (error) console.error('Erro ao abrir o RDO de', date, error);
      rdo = data;
    }
    // Se a pessoa já escolheu outro dia enquanto este carregava, este resultado é velho.
    if (minhaVez !== cargaRdoRef.current) return;
    if (!rdo) {
      setRdoId(null); rdoIdRef.current = null;
      setRdoAtividades([]); setRdoEfetivo([]); setRdoSubmetido(false);
      return;
    }
    setRdoId(rdo.id);
    rdoIdRef.current = rdo.id;
    setRdoSubmetido(rdo.submetido || false);
    // Mesma regra do app do mestre: a janela é a SEMANA da data, e o recorte
    // por dia vem de dias_semana. Ver src/lib/atividades-do-dia.js.
    const { segunda: seg_e, domingo: dom_e } = semanaDe(date);
    const { data: rdosSemana_e } = await supabase
      .from('rdos').select('id, data').gte('data', seg_e).lte('data', dom_e);
    const idsSemana_e = (rdosSemana_e || []).map(r => r.id);
    const { data: candidatas_e } = idsSemana_e.length
      ? await supabase.from('atividades_rdo').select('*').in('rdo_id', idsSemana_e).order('created_at')
      : { data: [] };
    const dataPorRdo_e = new Map((rdosSemana_e || []).map(r => [r.id, r.data]));
    if (minhaVez !== cargaRdoRef.current) return;   // outro dia foi escolhido no meio da carga
    setRdoAtividades(atividadesDoDia(candidatas_e || [], date, id => dataPorRdo_e.get(id)));

    // Sincroniza efetivo: prefere Supabase se tiver dados
    const remoteDraft = rdo.efetivo_draft;
    // A chave sai de `date` (o dia que está sendo aberto), não de EFETIVO_KEY_ENG:
    // essa foi calculada no render anterior e ainda apontava para o dia velho,
    // então o rascunho local lido era o do dia errado.
    const chaveLocal = `cre_efetivo_eng_${date}`;
    const localSaved = (() => { try { const s = localStorage.getItem(chaveLocal); return s ? JSON.parse(s) : null; } catch (_) { return null; } })();

    const draft = (remoteDraft && remoteDraft.length > 0) ? remoteDraft
                : (localSaved && localSaved.length > 0)  ? localSaved
                : null;

    // Define o efetivo exatamente uma vez, marcando como atualização "remota"
    // para o save debounced pular esta escrita. Sem o ramo `|| []`, abrir um dia
    // sem efetivo mantinha o do dia anterior na tela — e o auto-save podia
    // gravá-lo no dia errado. (Mesmo fix que já existia no mestre.)
    isRemoteUpdate.current = true;
    setRdoEfetivo(draft || []);
    if (draft && remoteDraft && remoteDraft.length > 0) {
      try { localStorage.setItem(chaveLocal, JSON.stringify(draft)); } catch (_) { /* localStorage bloqueado (aba anonima, cota cheia): segue sem salvar */ }
    }
  }

  async function addAtividade_eng({ descricao, ambiente, empreiteiro }) {
    if (!rdoId) return null;
    const { data } = await supabase.from('atividades_rdo').insert({ rdo_id: rdoId, descricao, ambiente, empreiteiro }).select().single();
    if (data) setRdoAtividades(prev => [...prev, data]);
    return data || null;
  }

  async function setAtividadeStatus_eng(id, status, motivo) {
    const a = atividadesRef.current.find(x => x.id === id) || {};
    const patch = patchStatusDoDia(a, status, dayKeyEng);
    if (motivo !== undefined) patch.motivo_nao_exec = motivo || null;
    await supabase.from('atividades_rdo').update(patch).eq('id', id);
    setRdoAtividades(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  }

  function handleSetStatus_eng(w, newStatus) {
    const newEfetivo = rdoEfetivo.map(x => x.id === w.id ? { ...x, atividade_status: newStatus } : x);
    setRdoEfetivo(newEfetivo);
    if (w.atividade_id) { const derived = getDerivedStatus(w.atividade_id, newEfetivo); setAtividadeStatus_eng(w.atividade_id, derived); }
  }

  function handleSetExtraStatus_eng(w, extraId, newStatus) {
    const newEfetivo = rdoEfetivo.map(x =>
      x.id === w.id ? { ...x, extras: (x.extras || []).map(ex => ex.id === extraId ? { ...ex, status: newStatus } : ex) } : x
    );
    setRdoEfetivo(newEfetivo);
    const extra = w.extras?.find(e => e.id === extraId);
    if (extra?.atividade_id) { const derived = getDerivedStatus(extra.atividade_id, newEfetivo); setAtividadeStatus_eng(extra.atividade_id, derived); }
  }

  // Devolve false quando NÃO salvou — a tela não pode marcar concluído em cima
  // de um envio que o banco rejeitou ou a conexão engoliu.
  async function submitRDO_eng() {
    if (!rdoId) return false;
    if (rdoEfetivo.length > 0) {
      // Load activities fresh in case user submitted from home without opening the RDO page
      let atList = rdoAtividades.length > 0 ? rdoAtividades : [];
      if (atList.length === 0) {
        const { data } = await supabase.from('atividades_rdo').select('*').eq('rdo_id', rdoId);
        atList = data || [];
      }
      // Delete any previous efetivo_rdo records for this RDO to avoid duplicates on re-submit
      const { error: delErr } = await supabase.from('efetivo_rdo').delete().eq('rdo_id', rdoId);
      if (delErr) { console.error('Erro ao limpar o efetivo do RDO:', delErr); alert('Não foi possível salvar o efetivo. Verifique a conexão e tente enviar novamente.'); return false; }
      const records = [];
      for (const w of rdoEfetivo) {
        const descP = w.atividade_livre || atList.find(a => a.id === w.atividade_id)?.descricao || null;
        // Insert ALL workers — activity description is optional
        records.push({ rdo_id: rdoId, colaborador_id: w.colab_id || null, colaborador_nome: w.nome, empreiteiro: w.empresa_nome || null, atividade_descricao: descP });
        for (const ex of (w.extras || [])) {
          const descE = ex.atividade_livre || atList.find(a => a.id === ex.atividade_id)?.descricao || null;
          if (descE) records.push({ rdo_id: rdoId, colaborador_id: w.colab_id || null, colaborador_nome: w.nome, empreiteiro: w.empresa_nome || null, atividade_descricao: descE });
        }
      }
      if (records.length > 0) {
        const { error } = await supabase.from('efetivo_rdo').insert(records);
        // Sem esta checagem, uma falha aqui ainda marcava o RDO como submetido
        // e apagava o localStorage — o efetivo do dia era perdido de vez.
        if (error) { console.error('Erro ao gravar o efetivo do RDO:', error); alert('Não foi possível salvar o efetivo. Verifique a conexão e tente enviar novamente.'); return false; }
      }
    }
    // Cronograma: marca o início real dos itens que receberam gente hoje.
    // Só grava onde ainda está vazio, então fica a data do PRIMEIRO dia
    // em que a equipe efetivamente tocou aquele item. Falhar aqui não pode
    // derrubar o diário — é um carimbo acessório.
    try { await registrarInicioRealDoRDO(rdoId, rdoDate || today); }
    catch (e) { console.error('Erro ao registrar início real no cronograma:', e); }

    const { error: subErr } = await supabase.from('rdos').update({ submetido: true, submetido_em: new Date().toISOString(), submetido_por_nome: profile.nome }).eq('id', rdoId);
    // Era aqui que o diário "finalizava" sem finalizar: a atualização falhava
    // e a tela marcava concluído mesmo assim.
    if (subErr) { console.error('Erro ao finalizar o RDO:', subErr); alert('Não foi possível finalizar o diário. Verifique a conexão e envie de novo.'); return false; }
    setRdoSubmetido(true);
    if ((rdoDate || today) === today) setDailyState({ submitted: true });
    try { localStorage.removeItem(EFETIVO_KEY_ENG); } catch (_) { /* localStorage bloqueado (aba anonima, cota cheia): segue sem salvar */ }
    return true;
  }

  const rdoDailyState = { submitted: rdoSubmetido, activities: Object.fromEntries(rdoAtividades.map(a => [a.id, { status: a.status }])) };

  useEffect(() => {
    const todayStr = hojeLocal();
    supabase.from('rdos').select('submetido').eq('data', todayStr).maybeSingle()
      .then(({ data }) => { if (data?.submetido) setDailyState({ submitted: true }); });

    const channel = supabase.channel('eng-rdo-daily')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rdos' }, (payload) => {
        if (payload.new?.data === todayStr && payload.new?.submetido) {
          setDailyState({ submitted: true });
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  // Pilha simples de navegação: o app não tem router, e sem guardar de onde
  // veio não dá para voltar arrastando.
  const pilha = useRef([]);
  const goto = (screen, params = {}) => {
    // O início é sempre "hoje". Se o RDO aberto era de outro dia (retroativo),
    // solta ele aqui — senão o "Concluir" do início enviaria o dia velho.
    if (screen === 'home' && rdoDate !== today) soltarRdoAntigo();
    if (screen !== route.screen) pilha.current = [...pilha.current.slice(-20), route];
    setRoute({ screen, params });
  };
  function soltarRdoAntigo() {
    cargaRdoRef.current++;
    rdoIdRef.current = null;
    setRdoId(null); setRdoDate(today); setRdoSubmetido(false);
    setRdoAtividades([]); setRdoEfetivo([]);
  }
  // Trocar o dia dentro da própria tela do RDO (seletor de data / fita de dias).
  const escolherDiaRdo = (dia) => { if (dia) loadRDO_eng(dia); };
  const voltar = () => {
    const anterior = pilha.current.pop();
    const destino = anterior || { screen: 'home', params: {} };
    if (destino.screen === 'home' && rdoDate !== today) soltarRdoAntigo();
    setRoute(destino);
  };
  useSwipeBack(voltar, !isDesktop);

  // Sidebar desktop usa todos os itens
  const nav = [
    { key: 'home',         label: 'In\xedcio',        icon: Icon.home },
    { key: 'planejar',     label: 'Planejar',        icon: Icon.calendar },
    { key: 'cronograma',   label: 'Cronograma',      icon: Icon.calendarWeek },
    { key: 'medicoes',     label: 'Medi\xe7\xf5es',    icon: '📏' },
    { key: 'efetivo-resumo', label: 'Efetivo',       icon: Icon.barChart },
    { key: 'checklist',    label: 'Pend\xeancias',    icon: Icon.clipboardList, badge: checklistBadge },
    { key: 'atas',         label: 'Visitas',         icon: Icon.users },
    { key: 'contratacoes', label: 'Contrata\xe7\xf5es', icon: Icon.clipboard },
    { key: 'orcamentos',   label: 'Or\xe7amentos',    icon: '💰' },
    // Salário e valor fechado: o visitante (cliente, arquiteto...) não entra — e o banco também recusa.
    ...(profile?.role === 'visitante' ? [] : [
      { key: 'pagar',        label: 'Contas a pagar',   icon: '💸' },
      { key: 'receber',      label: 'Contas a receber', icon: '🏦' },
    ]),
    { key: 'projetos',     label: 'Projetos',        icon: Icon.ruler },
    { key: 'gestao-visual', label: 'Gest\xe3o visual', icon: Icon.eye },
    { key: 'equipamentos', label: 'Equipamentos',    icon: Icon.wrench },
    // Fotos: a rota já existia, mas só o atalho da Início do celular levava
    // até ela. No computador a galeria ficava inalcançável.
    { key: 'galeria',      label: 'Fotos',           icon: Icon.camera },
    { key: 'cadastros',    label: 'Cadastros',       icon: Icon.cog },
    { key: 'relatorios',   label: 'Relat\xf3rios',   icon: Icon.pdf },
  ];
  // Bottom nav mobile: 5 itens principais
  const mobileNav = [
    { key: 'home',      label: 'In\xedcio',     icon: Icon.home },
    { key: 'planejar',  label: 'Planejar',       icon: Icon.calendar },
    { key: 'checklist', label: 'Pend\xeancias',  icon: Icon.clipboardList, badge: checklistBadge },
    { key: 'atas',      label: 'Visitas',        icon: Icon.users },
    { key: 'cronograma', label: 'Cronograma',    icon: Icon.calendarWeek },
  ];

  const navMap = {
    'todos': 'home', 'efetivo': 'home',
    'rdo-review': 'home', 'relatorio-pdf': 'relatorios', 'rdo-historico': 'relatorios',
    'rdo-eng': 'home', 'rdo-eng-assign': 'home', 'rdo-eng-activity': 'home',
    'rdo-eng-summary': 'home', 'rdo-eng-occurrence': 'home', 'rdo-eng-classic': 'home',
    'checklist-detail': 'checklist', 'checklist-new': 'checklist',
    'obras': 'configuracoes', 'admin-usuarios': 'configuracoes',
  };
  const activeNav = navMap[route.screen] || route.screen;

  let body;
  switch (route.screen) {
    case 'home':             body = <EngHome goto={goto} dailyState={dailyState} onStartRDO={() => { loadRDO_eng(today); goto('rdo-eng'); }} submitDaily={submitRDO_eng} rdoEfetivo={rdoEfetivo} openUserMenu={() => setUserMenuOpen(true)} />; break;
    case 'planejar':         body = <EngPlanejar goto={goto} openSheet={(date) => { setSheetDate(date || null); setSheetOpen(true); }} planKey={planKey} isDesktop={isDesktop} />; break;
    case 'atas':             body = <EngAtas goto={goto} />; break;
    case 'todos':            body = <EngTodos goto={goto} />; break;
    case 'efetivo':          body = <EngEfetivo goto={goto} />; break;
    case 'rdo-eng':
      body = rdoId ? (
        <MestreRDOWizard
          goto={(s, p) => goto(s === 'rdo-classic' ? 'rdo-eng-classic' : s, p)}
          efetivo={rdoEfetivo} setEfetivo={setRdoEfetivo} atividades={rdoAtividades}
          addAtividade={addAtividade_eng} rdoId={rdoId} profile={profile}
          submitDaily={submitRDO_eng}
          activeDate={rdoDate} isRetroativo={rdoDate !== today}
          today={today} onPickDate={escolherDiaRdo} onVoltarHoje={() => loadRDO_eng(today)}
        />
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* O seletor de dia fica visível enquanto o RDO carrega (ou se falhar):
            sem ele a pessoa ficava presa numa tela sem como escolher outro dia. */}
        <BarraDiaRDO activeDate={rdoDate} today={today} isRetroativo={rdoDate !== today}
          onPickDate={escolherDiaRdo} onVoltarHoje={() => loadRDO_eng(today)} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-3)', padding: 32 }}>
          <div style={{ fontSize: 36 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)' }}>Abrindo o RDO…</div>
          <div style={{ fontSize: 13, textAlign: 'center' }}>Se não abrir, volte ao início e tente de novo.</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => goto('home')}>
            Voltar ao início
          </button>
        </div>
        </div>
      ); break;
    case 'rdo-eng-classic':
      body = <MestreRDOv2
        goto={(s, p) => goto(s === 'rdo-assign' ? 'rdo-eng-assign' : s === 'rdo-summary' ? 'rdo-eng-summary' : s === 'rdo-occurrence' ? 'rdo-eng-occurrence' : s === 'rdo-historico' ? 'rdo-historico' : s === 'rdo-classic' ? 'rdo-eng-classic' : s, p)}
        rdoId={rdoId}
        dailyState={rdoDailyState} atividades={rdoAtividades} addAtividade={addAtividade_eng}
        efetivo={rdoEfetivo} setEfetivo={setRdoEfetivo}
        openSheet={() => setEfetivoSheetOpen(true)}
        onSetStatus={handleSetStatus_eng} onSetExtraStatus={handleSetExtraStatus_eng}
        submitDaily={submitRDO_eng}
        activeDate={rdoDate} today={today} isRetroativo={rdoDate !== today}
        onPickDate={escolherDiaRdo} onVoltarHoje={() => loadRDO_eng(today)}
      />; break;
    case 'rdo-eng-assign':
      body = <MestreRDOAssign goto={(s,p) => goto(s === 'rdo' ? 'rdo-eng' : s === 'rdo-activity' ? 'rdo-eng-activity' : s, p)}
        params={route.params} efetivo={rdoEfetivo} setEfetivo={setRdoEfetivo} atividades={rdoAtividades} />; break;
    case 'rdo-eng-activity':
      body = <RDOActivity params={route.params}
        goto={(s,p) => goto(s === 'rdo' ? 'rdo-eng' : s, p)}
        atividades={rdoAtividades} setAtividadeStatus={setAtividadeStatus_eng} />; break;
    case 'rdo-eng-summary':
      body = <RDOSummary goto={(s,p) => goto(s === 'rdo' ? 'rdo-eng' : s === 'rdo-occurrence' ? 'rdo-eng-occurrence' : s === 'home' ? 'home' : s, p)}
        dailyState={rdoDailyState} atividades={rdoAtividades} efetivo={rdoEfetivo} submitDaily={submitRDO_eng} />; break;
    case 'rdo-eng-occurrence':
      body = <RDOOccurrence goto={(s,p) => goto(s === 'rdo-summary' ? 'rdo-eng-summary' : s === 'rdo' ? 'rdo-eng' : s, p)}
        rdoId={rdoId} profile={profile} />; break;
    case 'equipamentos':     body = <EngEquipamentos goto={goto} />; break;
    case 'rdo-review':       body = <EngRDOReview goto={goto} dailyState={dailyState} />; break;
    case 'relatorios':       body = <EngRelatorios goto={goto} />; break;
    case 'relatorio-pdf':    body = <TelaLazy><EngRelatorioPDF goto={goto} /></TelaLazy>; break;
    case 'checklist':        body = <ChecklistList goto={goto} onContagem={setChecklistBadge} persona="eng" />; break;
    case 'checklist-detail': body = <ChecklistDetail goto={goto} params={route.params} persona="eng" />; break;
    case 'checklist-new':    body = <ChecklistNew goto={goto} profile={profile} />; break;
    case 'cadastros':        body = <EngCadastros goto={goto} />; break;
    case 'efetivo-resumo':   body = <EfetivoResumo goto={goto} />; break;
    case 'rdo-historico':    body = <RDOHistoricoScreen goto={goto} params={route.params} onEditRDO={(date) => { loadRDO_eng(date); goto('rdo-eng', { date }); }} />; break;
    case 'contratacoes':     body = <ContratacoesScreen goto={goto} />; break;
    case 'orcamentos':       body = <OrcamentosScreen goto={goto} />; break;
    case 'pagar':            body = <ContasPagarScreen goto={goto} />; break;
    case 'receber':          body = <ContasReceberScreen goto={goto} />; break;
    case 'medicoes':         body = <MedicoesScreen goto={goto} profile={profile} />; break;
    case 'projetos':         body = <ProjetosScreen goto={goto} />; break;
    case 'cronograma':       body = <CronogramaScreen isDesktop={isDesktop} />; break;
    case 'galeria':          body = <GaleriaFotos goto={goto} voltarPara="home" />; break;
    case 'gestao-visual':    body = <TelaLazy><GestaoVisual /></TelaLazy>; break;
    case 'admin-usuarios':   body = <AdminUsuarios goto={goto} />; break;
    case 'obras':            body = <ObrasScreen goto={goto} voltarPara="configuracoes" />; break;
    case 'configuracoes':    body = <ConfiguracoesScreen goto={goto} profile={profile} />; break;
    default:                 body = <EngHome goto={goto} dailyState={dailyState} />;
  }

  // ── Labels de navegação ─────────────────────────────────────────────────
  

  return (
    <div className="app" data-palette={palette} data-density="regular" data-dark="0"
      data-desktop={isDesktop ? '1' : '0'}
      style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: isDesktop ? 'row' : 'column' }}>

      {/* Sidebar desktop */}
      {isDesktop && <BarraLateral expandida={sidebarExpanded} setExpandida={setSidebarExpanded}
        nav={nav} ativo={activeNav} goto={goto} profile={profile} abrirMenu={() => setUserMenuOpen(true)}
        obraAtual={obraAtual} obras={obras} trocarObra={trocarObra} />}

      {/* Área principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden', minWidth: 0 }}>
        {body}
      </div>

      {/* Fica no shell, não na home: o aviso tem que aparecer entrando por
          qualquer tela. Ele mesmo se esconde quando não há ninguém a conferir. */}
      <RevisaoColaboradoresPopup />

      {/* Efetivo popup centralizado */}
      {efetivoSheetOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}>
          <div style={{
            background: 'var(--surface)',
            borderRadius: 20,
            width: '100%', maxWidth: 680,
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.22)',
          }}>
            {/* Header do popup */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-1)' }}>Efetivo do dia</div>
              <button onClick={() => setEfetivoSheetOpen(false)} style={{ width: 34, height: 34, borderRadius: 999, border: '0.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            {/* Conteúdo */}
            <div style={{ overflowY: 'auto', padding: '16px 20px', flex: 1 }}>
              <MestreRDOAddSheet
                open={efetivoSheetOpen} onClose={() => setEfetivoSheetOpen(false)}
                efetivo={rdoEfetivo} setEfetivo={setRdoEfetivo}
                atividades={rdoAtividades} rdoId={rdoId}
              />
            </div>
          </div>
        </div>
      )}
      {sheetOpen && (
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Nova Atividade">
          <NovaAtividadeSheet targetDate={sheetDate} onClose={() => { setSheetOpen(false); setPlanKey(k => k + 1); }} />
        </Sheet>
      )}


      {/* Popup de links rápidos */}

      {/* Popup do usuário (avatar) */}
      {userMenuOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1300,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 20,
          }}>
          <div style={{
            width: '100%', maxWidth: 380,
            background: 'var(--surface)', borderRadius: 20,
            padding: '22px 20px 20px',
            boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
            display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 999,
                background: 'var(--primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, fontWeight: 800, flexShrink: 0,
              }}>{ini}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loginFirstName(profile)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile?.email || rotuloPapel(profile).toLowerCase()}</div>
              </div>
              <button onClick={() => setUserMenuOpen(false)} aria-label="Fechar"
                style={{ width: 32, height: 32, borderRadius: 999, border: '0.5px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ height: 1, background: 'var(--border)' }}/>

            <button onClick={() => { setUserMenuOpen(false); goto('configuracoes'); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left',
              }}>
              <span style={{ width: 18, height: 18, flexShrink: 0 }}>{Icon.cog}</span>
              <span style={{ flex: 1 }}>Configurações</span>
              <span style={{ width: 14, height: 14, color: 'var(--text-3)' }}>{Icon.chevR}</span>
            </button>

            {/* Painel de admin e Obras: só quem tem is_admin no perfil enxerga.
                A checagem de verdade é na Edge Function e na RLS — isto aqui só
                evita mostrar um botão que daria erro. */}
            {profile?.is_admin && (
              <>
                <div style={{ height: 1, background: 'var(--border)' }}/>
                <button onClick={() => { setUserMenuOpen(false); goto('obras'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🏗️</span>
                  <span style={{ flex: 1 }}>Gerenciar obras</span>
                  <span style={{ width: 14, height: 14, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                </button>
                <button onClick={() => { setUserMenuOpen(false); goto('admin-usuarios'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 14px', borderRadius: 12, cursor: 'pointer',
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text-1)', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, textAlign: 'left',
                  }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>🛡️</span>
                  <span style={{ flex: 1 }}>Painel de admin</span>
                  <span style={{ width: 14, height: 14, color: 'var(--text-3)' }}>{Icon.chevR}</span>
                </button>
              </>
            )}

            {/* No celular a barra de baixo só cabe 5 telas. As outras — Ata
                gerencial, Efetivo, Cronograma, Medição — ficavam inalcançáveis
                fora do desktop. Aqui elas voltam. */}
            {!isDesktop && (
              <>
                <div style={{ height: 1, background: 'var(--border)' }}/>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 8, textTransform: 'uppercase' }}>Outras telas</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {nav.filter(n => !mobileNav.some(m => m.key === n.key)).map(n => (
                      <button key={n.key} onClick={() => { setUserMenuOpen(false); goto(n.key); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 9,
                          padding: '11px 12px', borderRadius: 12, cursor: 'pointer',
                          border: '1px solid var(--border)', background: 'var(--surface-2)',
                          color: 'var(--text-1)', fontFamily: 'inherit',
                          fontSize: 12.5, fontWeight: 700, textAlign: 'left',
                        }}>
                        <span style={{ width: 17, height: 17, flexShrink: 0, color: 'var(--primary)', display: 'flex' }}>{n.icon}</span>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label}</span>
                        {n.badge > 0 && (
                          <span style={{ minWidth: 17, height: 17, borderRadius: 999, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', flexShrink: 0 }}>
                            {n.badge > 99 ? '99+' : n.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div style={{ height: 1, background: 'var(--border)' }}/>

            <div style={{ margin: '4px 0' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 8, textTransform: 'uppercase' }}>Tema do app</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[{ k: 'green', nome: 'Claro', cor: '#087B8B' }].map(t => {
                  const sel = palette === t.k;
                  return (
                    <button key={t.k} onClick={() => aplicarPalette(t.k)} style={{
                      flex: 1, height: 44, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                      border: sel ? `2px solid ${t.cor}` : '1px solid var(--border)',
                      background: sel ? t.cor + '14' : 'var(--surface)',
                      color: sel ? t.cor : 'var(--text-2)', fontSize: 13, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    }}>
                      <span style={{ width: 12, height: 12, borderRadius: 999, background: t.cor }} />
                      {t.nome}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ height: 1, background: 'var(--border)' }}/>

            <button
              onClick={() => { setUserMenuOpen(false); supabase.auth.signOut({ scope: 'local' }); }}
              style={{
                width: '100%', height: 44, borderRadius: 12,
                border: '0.5px solid var(--danger-tint, #FEE2E2)',
                background: 'var(--danger-tint, #FEE2E2)', color: 'var(--danger, #DC2626)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              Sair da conta
            </button>
          </div>
        </div>
      )}

      {/* Bottom nav mobile */}
      {!isDesktop && <BottomNav items={mobileNav} active={activeNav} onChange={goto} />}
    </div>
  );
}
