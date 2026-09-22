import { MARCA } from '../marca.js';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { BottomNav, Icon, Sheet } from '../components/index';
import { useSwipeBack } from '../lib/swipe-back';
import {
  MestreHome, MestreRDOActivity, MestreRDOSummary,
  MestreOccurrence, MestreMais, MestreEfetivo,
} from '../screens/mestre';
import { MestreEquipamentos } from '../screens/equipamentos';
import { EfetivoResumo } from '../screens/efetivo-resumo';
import { MestreRDOv2, MestreRDOAddSheet, MestreRDOAssign, getDerivedStatus } from '../screens/mestre-rdo-v2';
import { MestreRDOWizard } from '../screens/mestre-rdo-wizard';
import { ChecklistList, ChecklistDetail, ChecklistNew } from '../screens/checklist';
import { ABERTAS } from '../lib/pendencias-filtro';
import { EngCadastros } from '../screens/cadastros';
import { RDOHistoricoScreen } from '../screens/rdo-historico';
import { GaleriaFotos } from '../screens/galeria-fotos';
import { ObrasScreen } from '../screens/obras';
import { ConfiguracoesScreen } from '../screens/configuracoes';
import { useObraSelecionada } from '../lib/obra-selecionada';
import { hojeLocal } from '../lib/date';
import { semanaDe, atividadesDoDia, chaveDoDia } from '../lib/atividades-do-dia';
import { registrarInicioRealDoRDO } from '../lib/cronograma';
import { patchStatusDoDia } from '../lib/status-atividade';


function loginInitialM(profile) {
  const raw = profile?.nome || profile?.email || '';
  const base = raw.includes('@') ? raw.split('@')[0] : raw.split(' ')[0];
  return (base.charAt(0) || 'M').toUpperCase();
}



export default function AppMestre({ profile }) {
  const { obraAtual, obras } = useObraSelecionada();
  const [route, setRoute] = useState({ screen: 'home', params: {} });
  const [efetivoSheetOpen, setEfetivoSheetOpen] = useState(false);
  const ini = loginInitialM(profile);

  // ── RDO state ──────────────────────────────────────────────────────────────
  const [rdoId, setRdoId] = useState(null);
  const [rdoSubmetido, setRdoSubmetido] = useState(false);
  const [atividades, setAtividades] = useState([]);
  const [efetivo, setEfetivo] = useState([]);
  const saveTimer = useRef(null);
  const rdoIdRef = useRef(null);
  const isRemoteUpdate = useRef(false);
  // Espelho das atividades para ler dias_semana/status_por_dia dentro de
  // callbacks sem depender do closure (o save é disparado por [efetivo]).
  const atividadesRef = useRef([]);
  useEffect(() => { atividadesRef.current = atividades; }, [atividades]);

  // ── Badges ─────────────────────────────────────────────────────────────────
  const [checklistBadge, setChecklistBadge] = useState(0);

  // Recarrega a cada troca de tela: pendência criada, resolvida ou apagada em
  // outra tela (detalhe, nova) muda o número, e antes ele só era lido ao abrir o app.
  useEffect(() => {
    let ativo = true;
    supabase.from('pendencias').select('id', { count: 'exact', head: true })
      .in('status', ABERTAS)
      .then(({ count }) => { if (ativo) setChecklistBadge(count || 0); });
    return () => { ativo = false; };
  }, [route.screen]);

  // Pilha simples de navegação, para o gesto de voltar arrastando funcionar.
  const pilha = useRef([]);
  const goto = (screen, params = {}) => {
    if (screen !== route.screen) pilha.current = [...pilha.current.slice(-20), route];
    setRoute({ screen, params });
  };
  const voltar = () => {
    const anterior = pilha.current.pop();
    setRoute(anterior || { screen: 'home', params: {} });
  };
  useSwipeBack(voltar);

  const today = hojeLocal();

  // Data ativa do RDO (padrão: hoje). Permite RDO retroativo escolhendo dia anterior.
  const [activeDate, setActiveDate] = useState(today);
  const isRetroativo = activeDate !== today;
  const dayKeyAtual = chaveDoDia(activeDate);   // dia da semana do RDO aberto
  const EFETIVO_KEY = `cre_efetivo_${activeDate}`;

  // Abre o RDO de uma data específica (usado no retroativo) e navega para a tela do RDO.
  function abrirRDOData(dateStr) {
    const d = (dateStr && dateStr <= today) ? dateStr : today;
    setActiveDate(d);
    setRoute({ screen: 'rdo', params: {} });
  }


  async function loadRDO(dateStr) {
    const alvo = dateStr || today;

    // Reset ao trocar de data (evita salvar no rdo antigo durante o carregamento)
    rdoIdRef.current = null;
    setAtividades([]);

    let { data: rdo } = await supabase
      .from('rdos').select('*').eq('data', alvo).maybeSingle();

    if (!rdo) {
      // upsert: se outro dispositivo criar o RDO do dia ao mesmo tempo, a
      // constraint unique(data) devolve o registro existente em vez de falhar.
      const { data, error } = await supabase
        .from('rdos').upsert({ data: alvo }, { onConflict: 'obra_id,data' }).select().single();
      if (error) console.error('Erro ao abrir o RDO de', alvo, error);
      rdo = data;
    }
    if (!rdo) return;

    setRdoId(rdo.id);
    rdoIdRef.current = rdo.id;
    setRdoSubmetido(rdo.submetido || false);

    // O plano da semana mora no RDO da segunda, com dias_semana. Então a janela
    // é a SEMANA da data — não os 14 dias de antes, que pegavam duas segundas e
    // traziam o plano da semana passada junto com o de hoje.
    const { segunda, domingo } = semanaDe(alvo);
    const { data: rdosSemana } = await supabase
      .from('rdos').select('id, data').gte('data', segunda).lte('data', domingo);
    const idsSemana = (rdosSemana || []).map(r => r.id);
    const { data: candidatas } = idsSemana.length
      ? await supabase.from('atividades_rdo').select('*').in('rdo_id', idsSemana).order('created_at')
      : { data: [] };
    const dataPorRdo = new Map((rdosSemana || []).map(r => [r.id, r.data]));
    const doDia = atividadesDoDia(candidatas || [], alvo, id => dataPorRdo.get(id));
    setAtividades(doDia);

    // Sincroniza efetivo: prefere Supabase (efetivo_draft) se tiver dados
    const remoteDraft = rdo.efetivo_draft;
    const localSaved = (() => { try { const s = localStorage.getItem(EFETIVO_KEY); return s ? JSON.parse(s) : null; } catch (_) { return null; } })();

    const draft = (remoteDraft && remoteDraft.length > 0) ? remoteDraft
                : (localSaved && localSaved.length > 0)  ? localSaved
                : null;

    // Sempre define o efetivo exatamente uma vez, marcando como atualização "remota"
    // para o efeito de save pular esta escrita (não regravar o que acabou de carregar,
    // e não vazar o efetivo do dia anterior ao abrir um dia vazio).
    isRemoteUpdate.current = true;
    setEfetivo(draft || []);
    if (draft && remoteDraft && remoteDraft.length > 0) {
      try { localStorage.setItem(EFETIVO_KEY, JSON.stringify(draft)); } catch (_) { /* localStorage bloqueado (aba anonima, cota cheia): segue sem salvar */ }
    }

    if (draft) {
      // Sync imediato: garante que atividades_rdo.status reflita o efetivo atual
      // (o debounced save é pulado para carregamentos remotos, então fazemos aqui)
      const atividadeIds = new Set([
        ...draft.filter(w => w.atividade_id).map(w => w.atividade_id),
        ...draft.flatMap(w => (w.extras || []).filter(e => e.atividade_id).map(e => e.atividade_id)),
      ]);
      if (atividadeIds.size > 0) {
        const derivadoPorId = {};
        for (const id of atividadeIds) derivadoPorId[id] = getDerivedStatus(id, draft);
        // Grava o status no DIA do RDO (status_por_dia) para atividades da
        // semana; só as de um dia usam o status liso. Sem isso, o RDO de um dia
        // carimbava o status na semana inteira do planejamento.
        const patchPorId = {};
        for (const a of doDia) {
          if (derivadoPorId[a.id] === undefined) continue;
          patchPorId[a.id] = patchStatusDoDia(a, derivadoPorId[a.id], chaveDoDia(alvo));
        }
        // Atualiza estado local imediatamente, sobre a lista já recortada
        // para o dia — e não sobre tudo que a semana tem.
        setAtividades(doDia.map(a => (
          patchPorId[a.id] ? { ...a, ...patchPorId[a.id] } : a
        )));
        // Persiste no banco em background. O builder do supabase-js é preguiçoso:
        // sem .then()/await a requisição HTTP nunca chega a ser enviada.
        Promise.all(Object.entries(patchPorId).map(([id, patch]) =>
          supabase.from('atividades_rdo').update(patch).eq('id', id)
        )).then(res => {
          // O supabase-js resolve com { error } em vez de rejeitar.
          const falha = res.find(r => r?.error);
          if (falha) console.error('Erro ao sincronizar status das atividades:', falha.error);
        }).catch(e => console.error('Erro ao sincronizar status das atividades:', e));
      }
    }
  }
  // ── Carrega RDO da data ativa e sincroniza efetivo ─────────────────────────
  useEffect(() => { loadRDO(activeDate);  }, [activeDate]);

  // ── Realtime: atualiza efetivo quando outra tela altera efetivo_draft ─────
  useEffect(() => {
    if (!rdoId) return;
    const ch = supabase.channel('mestre-rdo-efetivo-' + rdoId)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rdos', filter: `id=eq.${rdoId}` }, (payload) => {
        const draft = payload.new?.efetivo_draft;
        if (!Array.isArray(draft)) return;
        // Ignora limpeza do draft quando o RDO for submetido (evita zerar a contagem no mestre)
        if (draft.length === 0 && payload.new?.submetido) return;
        setEfetivo(prev => {
          if (JSON.stringify(prev) === JSON.stringify(draft)) return prev;
          isRemoteUpdate.current = true;
          return draft;
        });
      })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [rdoId]);

  // ── Salva efetivo no localStorage e no Supabase (debounced) ───────────────
  useEffect(() => {
    try { localStorage.setItem(EFETIVO_KEY, JSON.stringify(efetivo)); } catch (_) { /* localStorage bloqueado (aba anonima, cota cheia): segue sem salvar */ }
    if (!rdoIdRef.current) return;
    if (isRemoteUpdate.current) { isRemoteUpdate.current = false; return; }
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from('rdos').update({ efetivo_draft: efetivo }).eq('id', rdoIdRef.current);
      // Sincroniza status derivado de cada atividade com colaborador atribuído
      const atividadeIds = new Set([
        ...efetivo.filter(w => w.atividade_id).map(w => w.atividade_id),
        ...efetivo.flatMap(w => (w.extras || []).filter(e => e.atividade_id).map(e => e.atividade_id)),
      ]);
      const derivadoPorId = {};
      for (const id of atividadeIds) derivadoPorId[id] = getDerivedStatus(id, efetivo);
      // Grava no DIA (status_por_dia) para atividades da semana; um dia só usa o
      // status liso. Lê dias_semana do espelho para não pegar closure velho.
      const patchPorId = {};
      for (const a of atividadesRef.current) {
        if (derivadoPorId[a.id] === undefined) continue;
        patchPorId[a.id] = patchStatusDoDia(a, derivadoPorId[a.id], dayKeyAtual);
      }
      // Em paralelo (era 1 requisição por atividade, em série) e com um único
      // setState no fim, em vez de um re-render por atividade.
      await Promise.all(Object.entries(patchPorId).map(([id, patch]) =>
        supabase.from('atividades_rdo').update(patch).eq('id', id)
      ));
      setAtividades(prev => prev.map(a => (
        patchPorId[a.id] ? { ...a, ...patchPorId[a.id] } : a
      )));
    }, 800);
  }, [efetivo]);

  async function reabrirRDO() {
    if (!rdoId) return;
    await supabase.from('rdos').update({ submetido: false, submetido_em: null, submetido_por_nome: null, efetivo_draft: [] }).eq('id', rdoId);
    setRdoSubmetido(false);
    try { localStorage.removeItem(EFETIVO_KEY); } catch (_) { /* localStorage bloqueado (aba anonima, cota cheia): segue sem salvar */ }
    setEfetivo([]);
  }

  async function addAtividade({ descricao, ambiente, empreiteiro }) {
    if (!rdoId) return null;
    const { data } = await supabase
      .from('atividades_rdo')
      .insert({ rdo_id: rdoId, descricao, ambiente, empreiteiro })
      .select().single();
    if (data) setAtividades(prev => [...prev, data]);
    return data || null;
  }

  async function setAtividadeStatus(id, status, motivo) {
    const a = atividadesRef.current.find(x => x.id === id) || {};
    // Atividade da semana grava só no dia; um dia só usa o status liso.
    const patch = patchStatusDoDia(a, status, dayKeyAtual);
    if (motivo !== undefined) patch.motivo_nao_exec = motivo || null;
    await supabase.from('atividades_rdo').update(patch).eq('id', id);
    setAtividades(prev =>
      prev.map(x => x.id === id ? { ...x, ...patch } : x)
    );
  }

  function handleSetStatus(w, newStatus) {
    const newEfetivo = efetivo.map(x =>
      x.id === w.id ? { ...x, atividade_status: newStatus } : x
    );
    setEfetivo(newEfetivo);
    if (w.atividade_id) {
      const derived = getDerivedStatus(w.atividade_id, newEfetivo);
      setAtividadeStatus(w.atividade_id, derived);
    }
  }

  function handleSetExtraStatus(w, extraId, newStatus) {
    const newEfetivo = efetivo.map(x =>
      x.id === w.id
        ? { ...x, extras: (x.extras || []).map(ex => ex.id === extraId ? { ...ex, status: newStatus } : ex) }
        : x
    );
    setEfetivo(newEfetivo);
    const extra = w.extras?.find(e => e.id === extraId);
    if (extra?.atividade_id) {
      const derived = getDerivedStatus(extra.atividade_id, newEfetivo);
      setAtividadeStatus(extra.atividade_id, derived);
    }
  }

  // Devolve false quando NÃO salvou — os botões usam isso para não mostrar
  // "concluído" em cima de um envio que o banco rejeitou ou a conexão engoliu.
  async function submitRDO() {
    if (!rdoId) return false;
    if (efetivo.length > 0) {
      const records = [];
      for (const w of efetivo) {
        const descPrincipal = w.atividade_livre || atividades.find(a => a.id === w.atividade_id)?.descricao || null;
        // Grava TODOS os trabalhadores, com ou sem atividade descrita (a descrição
        // é opcional). Antes, quem estava sem atividade não era gravado: o dia
        // contava como "submetido" e o resumo de efetivo reportava só uma parte
        // das pessoas presentes. É o mesmo critério já usado pelo engenheiro.
        records.push({
          rdo_id: rdoId,
          colaborador_id: w.colab_id || null,
          colaborador_nome: w.nome,
          empreiteiro: w.empresa_nome || null,
          atividade_descricao: descPrincipal,
        });
        for (const ex of (w.extras || [])) {
          const descExtra = ex.atividade_livre || atividades.find(a => a.id === ex.atividade_id)?.descricao || null;
          if (descExtra) {
            records.push({
              rdo_id: rdoId,
              colaborador_id: w.colab_id || null,
              colaborador_nome: w.nome,
              empreiteiro: w.empresa_nome || null,
              atividade_descricao: descExtra,
            });
          }
        }
      }
      // Limpa o efetivo já gravado deste RDO antes de reinserir: sem isso,
      // concluir o RDO duas vezes duplicava todas as linhas do dia e inflava
      // as médias do resumo de efetivo e do PDF.
      const { error: delErr } = await supabase.from('efetivo_rdo').delete().eq('rdo_id', rdoId);
      if (delErr) { console.error('Erro ao limpar o efetivo do RDO:', delErr); alert('Não foi possível salvar o efetivo. Verifique a conexão e tente concluir novamente.'); return false; }
      if (records.length > 0) {
        const { error } = await supabase.from('efetivo_rdo').insert(records);
        if (error) { console.error('Erro ao gravar o efetivo do RDO:', error); alert('Não foi possível salvar o efetivo. Verifique a conexão e tente concluir novamente.'); return false; }
      }
    }
    // Cronograma: registra o início real dos itens vinculados às atividades
    // deste RDO (só onde ainda estiver vazio). Falhar aqui não pode derrubar o
    // diário — é um carimbo acessório.
    try { await registrarInicioRealDoRDO(rdoId, activeDate); }
    catch (e) { console.error('Erro ao registrar início real no cronograma:', e); }

    const { error: subErr } = await supabase.from('rdos').update({
      submetido: true,
      submetido_em: new Date().toISOString(),
      submetido_por_nome: profile.nome,
      // Mantemos efetivo_draft intacto para o mestre continuar lendo após submit
    }).eq('id', rdoId);
    // Era aqui que o diário "finalizava" sem finalizar: a atualização falhava
    // (conexão, banco) e a tela marcava concluído mesmo assim.
    if (subErr) { console.error('Erro ao finalizar o RDO:', subErr); alert('Não foi possível finalizar o diário. Verifique a conexão e toque em concluir de novo.'); return false; }
    setRdoSubmetido(true);
    // Não limpa localStorage nem efetivo local — mestre continua mostrando os dados
    return true;
  }

  const dailyState = {
    submitted: rdoSubmetido,
    activities: Object.fromEntries(
      atividades.map(a => [a.id, { status: a.status, motivo: a.motivo_nao_exec }])
    ),
  };

  
  const navMap = {
    'rdo-activity': 'rdo', 'rdo-summary': 'rdo', 'rdo-occurrence': 'rdo', 'rdo-assign': 'rdo', 'rdo-historico': 'rdo', 'rdo-wizard': 'rdo', 'rdo-classic': 'rdo',
    'checklist-detail': 'checklist', 'checklist-new': 'checklist',
    'efetivo': 'home', 'cadastros': 'home', 'efetivo-resumo': 'home', 'galeria': 'home',
    'configuracoes': 'mais', 'obras': 'mais',
  };
  const activeNav = navMap[route.screen] || route.screen;

  let body;
  switch (route.screen) {
    case 'home':
      body = <MestreHome goto={goto} dailyState={dailyState} atividades={atividades} efetivo={efetivo} setDailyState={() => {}} onReopenRDO={reabrirRDO} submitDaily={submitRDO} />;
      break;
    case 'rdo':
    case 'rdo-wizard':
      body = <MestreRDOWizard goto={goto}
        efetivo={efetivo} setEfetivo={setEfetivo} atividades={atividades}
        addAtividade={addAtividade} rdoId={rdoId} profile={profile}
        submitDaily={submitRDO}
        activeDate={activeDate} isRetroativo={isRetroativo} />;
      break;
    case 'rdo-classic':
      body = <MestreRDOv2
        goto={goto} rdoId={rdoId} dailyState={dailyState}
        atividades={atividades} addAtividade={addAtividade}
        efetivo={efetivo} setEfetivo={setEfetivo}
        openSheet={() => setEfetivoSheetOpen(true)}
        onSetStatus={handleSetStatus}
        onSetExtraStatus={handleSetExtraStatus}
        submitDaily={submitRDO}
        activeDate={activeDate} today={today} isRetroativo={isRetroativo}
        onPickDate={abrirRDOData} onVoltarHoje={() => setActiveDate(today)}
      />;
      break;
    case 'rdo-assign':
      body = <MestreRDOAssign goto={goto} params={route.params}
        efetivo={efetivo} setEfetivo={setEfetivo} atividades={atividades} />;
      break;
    case 'rdo-activity':
      body = <MestreRDOActivity params={route.params} goto={goto}
        atividades={atividades} setAtividadeStatus={setAtividadeStatus} />;
      break;
    case 'rdo-summary':
      body = <MestreRDOSummary goto={goto} dailyState={dailyState}
        atividades={atividades} efetivo={efetivo} submitDaily={submitRDO} />;
      break;
    case 'rdo-occurrence':
      body = <MestreOccurrence goto={goto} rdoId={rdoId} profile={profile} />;
      break;
    case 'equipamentos':  body = <MestreEquipamentos goto={goto} />; break;
    case 'mais':          body = <MestreMais goto={goto} profile={profile} />; break;
    case 'efetivo':       body = <MestreEfetivo goto={goto} />; break;
    case 'checklist':     body = <ChecklistList goto={goto} onContagem={setChecklistBadge} persona="mestre" />; break;
    case 'checklist-detail': body = <ChecklistDetail goto={goto} params={route.params} persona="mestre" />; break;
    case 'checklist-new': body = <ChecklistNew goto={goto} profile={profile} />; break;
    case 'cadastros':        body = <EngCadastros goto={goto} />; break;
    case 'efetivo-resumo':   body = <EfetivoResumo goto={goto} />; break;
    case 'rdo-historico':    body = <RDOHistoricoScreen goto={goto} onEditRDO={abrirRDOData} today={today} />; break;
    case 'galeria':          body = <GaleriaFotos goto={goto} voltarPara="home" />; break;
    case 'obras':            body = <ObrasScreen goto={goto} voltarPara="configuracoes" />; break;
    case 'configuracoes':    body = <ConfiguracoesScreen goto={goto} profile={profile} voltarPara="mais" />; break;
    default:
      body = <MestreHome goto={goto} dailyState={dailyState} efetivo={efetivo} setDailyState={() => {}} />;
  }

  return (
    <div className="app" data-palette={(typeof localStorage !== 'undefined' && localStorage.getItem('cr-palette')) || 'green'} data-density="regular" data-dark="0"
      style={{ position: 'relative', width: '100%', height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingTop: 'max(10px, env(safe-area-inset-top))', paddingBottom: 10, paddingLeft: 16, paddingRight: 16,
        background: 'var(--surface)',
        borderBottom: '0.5px solid var(--border)', flexShrink: 0,
      }}>
        <div>
          {obras.length > 1 ? (
            <button onClick={() => goto('configuracoes')} title="Trocar de obra"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>
              {obraAtual?.nome || MARCA.obra} ▾
            </button>
          ) : (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{obraAtual?.nome || MARCA.obra}</div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600 }}>MESTRE DE OBRAS</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* scope 'local': sai só deste aparelho, não de todos. */}
          <button onClick={() => supabase.auth.signOut({ scope: 'local' })}
            style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, minHeight: 40, padding: '0 6px' }}>
            Sair
          </button>
          <div style={{ width: 30, height: 30, borderRadius: 999, background: 'var(--primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
            {ini}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {body}
      </div>

      <BottomNav active={activeNav} goto={goto}
        items={[
          { key: 'home',       label: 'Início',      icon: Icon.home },
          { key: 'rdo',        label: 'Diário',      icon: Icon.clipboard, badge: rdoSubmetido ? 0 : 1 },
          { key: 'checklist',  label: 'Pendências',  icon: Icon.clipboardList, badge: checklistBadge },
          { key: 'equipamentos', label: 'Equipamentos', icon: Icon.wrench },
          { key: 'mais',       label: 'Mais',        icon: Icon.more },
        ]}
      />

      <Sheet open={efetivoSheetOpen} onClose={() => setEfetivoSheetOpen(false)}>
        <MestreRDOAddSheet
          rdoId={rdoId}
          efetivo={efetivo}
          setEfetivo={setEfetivo}
          onClose={() => setEfetivoSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}
