import { useState, useMemo, useEffect, useRef, Component } from 'react';
import { useObra } from '../lib/ObraContext';
import { supabase } from '../lib/supabase';
import { contem } from '../lib/busca';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';
import { Icon } from '../components/index';
import { hojeLocal } from '../lib/date';
import { getDerivedStatus, WORKER_STATUS_OPTIONS } from './mestre-rdo-v2';
import { proximoStatus, ACOES_CONCLUIDA } from '../lib/status-atividade';
import { agruparPorAmbiente } from '../lib/atividades-do-dia';
import { enviarFotoRDO } from '../lib/foto-rdo';

// Botão de câmera: abre a câmera do celular, comprime e sobe a foto já ligada
// ao ambiente/frente (legenda montada sozinha). `meta` é uma função pra pegar
// o estado atual (status, etc.) na hora do clique.
function BotaoCamera({ meta, compacto }) {
  const [enviando, setEnviando] = useState(false);
  const [n, setN] = useState(0);
  const inputRef = useRef(null);
  const onChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEnviando(true);
    try { await enviarFotoRDO(file, meta()); setN(v => v + 1); }
    catch (err) { avisarErro(err, 'enviar a foto'); }
    setEnviando(false);
  };
  return (
    <>
      <button onClick={() => inputRef.current?.click()} disabled={enviando} title="Tirar/anexar foto"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)', background: n > 0 ? 'var(--primary-tint)' : 'var(--surface)', color: n > 0 ? 'var(--primary)' : 'var(--text-3)', borderRadius: 9, padding: compacto ? '3px 8px' : '5px 9px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
        {enviando ? '…' : '📷'}{n > 0 && <span style={{ fontSize: 11 }}>{n}</span>}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={onChange} style={{ display: 'none' }} />
    </>
  );
}

// O RDO do dia pode ainda não existir quando o mestre registra a primeira coisa.
// Garante a linha em `rdos` (uma por data) e devolve o id.
// dataAlvo é obrigatória na prática: sem ela, um dia retroativo sem RDO ainda
// criado caía em HOJE e o registro ia parar no dia errado, calado. Foi assim
// que o diário de um dia anterior apareceu misturado com o de hoje.
async function garantirRdoId(rdoId, dataAlvo) {
  if (rdoId) return rdoId;
  const dia = dataAlvo || hojeLocal();
  const { data: existente } = await supabase.from('rdos').select('id').eq('data', dia).maybeSingle();
  if (existente) return existente.id;
  const { data: novo } = await supabase.from('rdos').upsert({ data: dia }, { onConflict: 'obra_id,data' }).select().single();
  return novo?.id || null;
}

// Status derivado da atividade (feita/em_andamento/…) → chave do ciclo do chip.
const CHAVE_POR_DERIVADO = { feita: 'concluida', em_andamento: 'em_andamento', nao_feita: 'nao_iniciou', pendente: 'nao_iniciou' };

// Tipos de imprevisto (mesma linguagem da tela de Ocorrência do RDO clássico).
const TIPOS_OC = [
  { id: 'chuva',     emoji: '🌧️', label: 'Choveu' },
  { id: 'material',  emoji: '📦', label: 'Faltou material' },
  { id: 'gente',     emoji: '👷', label: 'Faltou gente' },
  { id: 'equip',     emoji: '🔧', label: 'Faltou equipamento' },
  { id: 'energia',   emoji: '⚡', label: 'Faltou energia/água' },
  { id: 'projeto',   emoji: '📐', label: 'Problema de projeto' },
  { id: 'frente',    emoji: '🚧', label: 'Faltou frente' },
  { id: 'seguranca', emoji: '🦺', label: 'Segurança do trabalho' },
];
const primeiroNome = (n) => String(n || '').trim().split(/\s+/)[0] || '—';

// Boundary local: se um passo quebrar ao renderizar, mostra a mensagem AQUI
// dentro do wizard, em vez de deixar o erro subir e jogar o mestre pra Início.
class PassoBoundary extends Component {
  constructor(props) { super(props); this.state = { erro: null }; }
  static getDerivedStateFromError(e) { return { erro: e }; }
  render() {
    if (this.state.erro) {
      return (
        <div className="card" style={{ padding: 16, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger,#b3261e)' }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>⚠️ Erro no passo do wizard</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, wordBreak: 'break-word' }}>
            {String(this.state.erro?.message || this.state.erro)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── RDO em passo-a-passo (wizard) ──────────────────────────────────────────
// Formato do wizard: o RDO inteiro vira um
// fluxo guiado, no naipe de "criar pendência". 4 passos:
//   1 · Quem veio   (fornecedor → pessoas, com marca ADM por pessoa)
//   2 · As frentes  (a lista compacta; abrir a frente = apropriar pessoas)
//   3 · Imprevistos (a observação pós-RDO)
//   4 · Foto + revisão
// Passo 1 já é funcional (mexe no efetivo real). Passos 2–4 entram a seguir.
// Layout no padrão do app (.page/.page-pad) — a área externa já rola sozinha.
const PASSOS = [
  { id: 'pessoas',     titulo: 'Quem está no canteiro?',        sub: 'Escolha o fornecedor e marque quem veio.' },
  { id: 'frentes',     titulo: 'Quem trabalhou em cada frente?', sub: 'Abra a frente e marque as pessoas.' },
  { id: 'imprevistos', titulo: 'Teve algum imprevisto?',        sub: 'O que não deu pra fazer, o que atrapalhou.' },
  { id: 'revisao',     titulo: 'Foto do dia e conferir',        sub: 'Registre uma foto e revise antes de salvar.' },
];

// O wizard não dizia de que dia era o diário. Num dia retroativo isso é a
// diferença entre registrar certo e registrar no dia errado sem perceber.
function FaixaDataWizard({ data, retroativo }) {
  if (!data) return null;
  const [a, m, d] = String(data).slice(0, 10).split('-');
  const ehHoje = data === hojeLocal();
  const alerta = retroativo || !ehHoje;
  return (
    <div style={{ margin: '10px var(--pad-4) 0', padding: '8px 12px', borderRadius: 11,
      display: 'flex', alignItems: 'center', gap: 8,
      background: alerta ? 'rgba(217,119,6,0.10)' : 'var(--surface-2)',
      border: alerta ? '1px solid rgba(217,119,6,0.35)' : '0.5px solid var(--border)' }}>
      <span style={{ fontSize: 14 }}>📅</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: alerta ? 'var(--warn, #D97706)' : 'var(--text-2)' }}>
        Diário de {d}/{m}/{a}{ehHoje ? ' · hoje' : ' · RETROATIVO'}
      </span>
    </div>
  );
}

function WizardDots({ total, atual }) {
  return (
    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginBottom: 20 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: i === atual ? 20 : 7, height: 7, borderRadius: 999,
          background: i <= atual ? 'var(--primary)' : 'var(--border)', transition: 'all .2s',
        }} />
      ))}
    </div>
  );
}

export function MestreRDOWizard({ goto, efetivo, setEfetivo, atividades = [], addAtividade, rdoId, profile, submitDaily, activeDate, isRetroativo = false }) {
  const dataRDO = activeDate || hojeLocal();
  const { empresas, colaboradores, ambientes } = useObra();
  const [modo, setModo] = useState(null);   // null = tela de escolha (aparece toda vez)
  const [step, setStep] = useState(0);
  // O fornecedor escolhido no passo 1 segue para o passo 2. "Por equipe" é por
  // equipe do começo ao fim: quem marcou a turma da alvenaria não quer ver as
  // frentes da elétrica para achar as dela.
  const [foco, setFoco] = useState(null);   // nome da empreiteira · null = todas
  // O passo 1 guarda por dentro qual fornecedor está aberto. Trocar a `key`
  // remonta o passo na lista de fornecedores — sem isso, "outra equipe"
  // devolvia a pessoa para a mesma turma que ela acabou de lançar.
  const [voltas, setVoltas] = useState(0);
  const outraEquipe = () => { setFoco(null); setVoltas(v => v + 1); setStep(0); };

  // Tela de escolha do modo — some depois que escolhe; volta ao trocar de modo.
  if (!modo) return <EscolhaModo goto={goto} onEscolher={(m) => { setModo(m); setStep(0); }} />;
  if (modo === 'ambiente') {
    return <ModoAmbiente
      atividades={atividades} efetivo={efetivo || []} setEfetivo={setEfetivo}
      addAtividade={addAtividade} rdoId={rdoId} profile={profile} dataRDO={dataRDO}
      submitDaily={submitDaily} onTrocarModo={() => setModo(null)} onClassico={() => goto('rdo-classic')} />;
  }

  const passo = PASSOS[step];
  const avancar = () => setStep(s => Math.min(PASSOS.length - 1, s + 1));
  const voltar  = () => (step === 0 ? setModo(null) : setStep(s => s - 1));

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={voltar}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span>
          {step === 0 ? 'Trocar modo' : 'Voltar'}
        </button>
        <button onClick={() => goto('rdo-classic')} title="Abrir o RDO clássico"
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: 'none', border: 0, cursor: 'pointer' }}>
          RDO clássico ›
        </button>
      </div>

      <FaixaDataWizard data={dataRDO} retroativo={isRetroativo} />

      <div className="page-pad" style={{ paddingTop: 14, paddingBottom: 28 }}>
        <WizardDots total={PASSOS.length} atual={step} />
        <div style={{ fontSize: 21, fontWeight: 900, color: 'var(--text-1)', lineHeight: 1.15, marginBottom: 5 }}>{passo.titulo}</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18 }}>{passo.sub}</div>

        <PassoBoundary>
        {step === 0 && (
          <PassoPessoas key={voltas}
            empresas={empresas || []} colaboradores={colaboradores || []}
            efetivo={efetivo || []} setEfetivo={setEfetivo} avancar={avancar} onFoco={setFoco}
          />
        )}
        {step === 1 && (
          <PassoFrentes
            atividades={atividades} efetivo={efetivo || []} setEfetivo={setEfetivo}
            addAtividade={addAtividade} ambientes={ambientes || []}
            rdoId={rdoId} profile={profile} dataRDO={dataRDO} avancar={avancar}
            foco={foco} setFoco={setFoco}
          />
        )}
        {step === 2 && (
          <PassoImprevistos rdoId={rdoId} profile={profile} dataRDO={dataRDO} avancar={avancar} />
        )}
        {step === 3 && (
          <PassoRevisao rdoId={rdoId} profile={profile} atividades={atividades} dataRDO={dataRDO}
            efetivo={efetivo || []} submitDaily={submitDaily}
            onEncerrar={() => goto('rdo-classic')} onOutraEquipe={outraEquipe} />
        )}
        </PassoBoundary>
      </div>
    </div>
  );
}

// ── Passo 1: Quem veio (fornecedor → pessoas) ──────────────────────────────
function PassoPessoas({ empresas, colaboradores, efetivo, setEfetivo, avancar, onFoco }) {
  const [empresaId, setEmpresaId] = useState(null);   // null = escolhendo fornecedor
  const [q, setQ] = useState('');

  // Só empreiteiras de verdade — "ADM própria" não é empresa (ADM é marca da pessoa).
  const fornecedores = useMemo(() => empresas
    .filter(e => e.tipo === 'empreiteiro')
    .map(e => ({ ...e, n: colaboradores.filter(c => c.empreiteiro_id === e.id && c.ativo !== false).length }))
    .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
    [empresas, colaboradores]);

  const empresaSel = empresas.find(e => e.id === empresaId);

  const pessoas = useMemo(() => {
    if (!empresaId) return [];
    return colaboradores
      .filter(c => c.empreiteiro_id === empresaId && c.ativo !== false)
      .filter(c => contem(c.nome, q))
      .sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR'));
  }, [colaboradores, empresaId, q]);

  const selecionadoIds = new Set(efetivo.map(w => w.colab_id).filter(Boolean));
  const admDe = (id) => !!efetivo.find(w => w.colab_id === id)?.is_adm;

  function togglePessoa(c) {
    if (selecionadoIds.has(c.id)) {
      setEfetivo(prev => prev.filter(w => w.colab_id !== c.id));
    } else {
      const e = empresas.find(x => x.id === c.empreiteiro_id) || {};
      setEfetivo(prev => [...prev, {
        id: 'w' + Date.now() + '_' + c.id,
        colab_id: c.id, nome: c.nome, iniciais: c.iniciais, funcao: c.funcao,
        empresa_id: c.empreiteiro_id, empresa_nome: e.nome || '',
        is_adm: false, atividade_id: null, atividade_livre: null, extras: [],
      }]);
    }
  }
  function toggleAdm(c) {
    setEfetivo(prev => prev.map(w => w.colab_id === c.id ? { ...w, is_adm: !w.is_adm } : w));
  }

  const totalDia = efetivo.length;

  // ── Sub-tela A: escolher fornecedor ──────────────────────────────────────
  if (!empresaId) {
    const lista = fornecedores.filter(e => contem(e.nome, q));
    return (
      <div>
        <Busca placeholder="Buscar empresa…" value={q} onChange={setQ} />
        <div className="stack stack-1">
          {lista.map(e => (
            <button key={e.id} onClick={() => { setEmpresaId(e.id); setQ(''); onFoco?.(e.nome); }}
              style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '12px 14px', border: 0, cursor: 'pointer', background: 'var(--surface)', borderRadius: 12, boxShadow: 'inset 0 0 0 0.5px var(--border)', textAlign: 'left', width: '100%' }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: e.cor || '#888', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-strong" style={{ fontSize: 14 }}>{e.nome}</div>
                <div className="t-caption" style={{ fontSize: 11 }}>{e.n} {e.n === 1 ? 'pessoa' : 'pessoas'}</div>
              </div>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
            </button>
          ))}
          {lista.length === 0 && (
            <div className="t-caption" style={{ textAlign: 'center', padding: 24 }}>Nenhuma empreiteira encontrada.</div>
          )}
        </div>
        {totalDia > 0 && (
          <button className="btn btn-primary btn-block" style={{ height: 48, marginTop: 14 }} onClick={avancar}>
            Continuar → <span style={{ opacity: .85, fontWeight: 700 }}>({totalDia} no canteiro)</span>
          </button>
        )}
      </div>
    );
  }

  // ── Sub-tela B: pessoas do fornecedor ────────────────────────────────────
  const selDaEmpresa = colaboradores.filter(c => c.empreiteiro_id === empresaId && selecionadoIds.has(c.id)).length;
  return (
    <div>
      <button onClick={() => { setEmpresaId(null); setQ(''); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 12, padding: '6px 10px', border: 0, cursor: 'pointer', background: 'var(--surface-2)', borderRadius: 999, fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>
        <span style={{ width: 14, height: 14 }}>{Icon.back}</span>
        <span style={{ width: 7, height: 7, borderRadius: 999, background: empresaSel?.cor || '#888' }} />
        {empresaSel?.nome} · trocar
      </button>
      <Busca placeholder="Digitar nome…" value={q} onChange={setQ} />
      <div className="stack stack-1">
        {pessoas.map(c => {
          const on = selecionadoIds.has(c.id);
          const adm = admDe(c.id);
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: on ? 'var(--primary-tint)' : 'var(--surface)', borderRadius: 12, boxShadow: on ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 0.5px var(--border)' }}>
              <button onClick={() => togglePessoa(c)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                <div style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: '#fff', fontSize: 13, fontWeight: 900 }}>
                  {on ? '✓' : ''}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-strong" style={{ fontSize: 13.5 }}>{c.nome}</div>
                  <div className="t-caption" style={{ fontSize: 11 }}>{c.funcao || 'Colaborador'}</div>
                </div>
              </button>
              {on && (
                <button onClick={() => toggleAdm(c)} title="Serviço pontual, direto pela administração própria (não empreitada)"
                  style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '.3px', padding: '5px 10px', borderRadius: 999, cursor: 'pointer',
                    border: adm ? '1px solid #9cc0ea' : '1px solid var(--border)',
                    background: adm ? '#eef4ff' : 'var(--surface)', color: adm ? '#2f6db0' : 'var(--text-3)' }}>
                  {adm ? 'ADM ✓' : 'ADM'}
                </button>
              )}
            </div>
          );
        })}
        {pessoas.length === 0 && (
          <div className="t-caption" style={{ textAlign: 'center', padding: 24 }}>
            {q.trim() ? 'Ninguém com esse nome.' : 'Nenhuma pessoa nesta empresa.'}
          </div>
        )}
      </div>

      <div className="t-caption" style={{ fontSize: 11, margin: '14px 0 8px', textAlign: 'center' }}>
        {selDaEmpresa} de {empresaSel?.nome} · <b style={{ color: 'var(--text-1)' }}>{totalDia}</b> no canteiro hoje
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" style={{ height: 48, flexShrink: 0, paddingInline: 14 }}
          onClick={() => { setEmpresaId(null); setQ(''); }}>+ Outra empresa</button>
        <button className="btn btn-primary" style={{ height: 48, flex: 1 }} disabled={totalDia === 0}
          onClick={avancar}>Continuar →</button>
      </div>
    </div>
  );
}

function Busca({ placeholder, value, onChange }) {
  return (
    <div className="search" style={{ margin: '0 0 12px' }}>
      <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.search}</span>
      <input placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)}
        style={{ flex: 1, border: 0, background: 'transparent', outline: 'none', fontSize: 15 }} />
    </div>
  );
}

// Tocar de novo numa frente já concluída não pode desmarcá-la sem querer — o
// popup pergunta antes. Vale nos dois modos, por isso mora fora do passo.
function PopupFrenteConcluida({ id, onEscolher, onFechar }) {
  if (!id) return null;
  const escolher = (novo) => { onEscolher(id, novo); onFechar(); };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 800, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 22px' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 360, background: 'var(--surface)', borderRadius: 18, padding: '20px 18px' }}>
        <div style={{ fontSize: 16, fontWeight: 900, color: 'var(--text-1)' }}>Frente concluída</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.45 }}>Esta frente já está concluída. O que você quer fazer?</div>
        <button onClick={() => escolher(ACOES_CONCLUIDA.voltar)} style={{ width: '100%', marginTop: 16, height: 46, borderRadius: 12, border: 0, cursor: 'pointer', background: 'var(--warn,#D97706)', color: '#fff', fontSize: 14, fontWeight: 800 }}>↩ Voltar para “Em andamento”</button>
        <button onClick={() => escolher(ACOES_CONCLUIDA.reiniciar)} style={{ width: '100%', marginTop: 10, height: 46, borderRadius: 12, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', fontSize: 14, fontWeight: 800 }}>⟲ Reiniciar a frente</button>
        <button onClick={onFechar} style={{ width: '100%', marginTop: 10, height: 42, borderRadius: 12, cursor: 'pointer', border: 0, background: 'transparent', color: 'var(--text-3)', fontSize: 13, fontWeight: 700 }}>Cancelar</button>
      </div>
    </div>
  );
}

// ── O cartão de uma frente ─────────────────────────────────────────────────
// Mesmo cartão nos dois modos do wizard: no "por equipe" ele vem numa lista
// corrida, no "por ambiente" vem dentro do grupo do ambiente. Era código
// duplicado; mexer num só deixava o outro para trás.
function CartaoFrente({ frente, efetivo, setEfetivo, rdoId, profile, pavDe, local, aberta, onAbrir, onPedirConfirmacao }) {
  const [verTodos, setVerTodos] = useState(false);

  const pessoas = efetivo.filter(w => w.atividade_id === frente.id);
  const foraDoPlano = !(Array.isArray(frente.dias_semana) && frente.dias_semana.length > 0);
  const chave = CHAVE_POR_DERIVADO[getDerivedStatus(frente.id, efetivo)] || 'nao_iniciou';
  const opt = WORKER_STATUS_OPTIONS.find(o => o.key === chave) || WORKER_STATUS_OPTIONS[2];
  const temGente = pessoas.length > 0;

  const toggleNaFrente = (w) => {
    setEfetivo(prev => prev.map(x => x.id === w.id
      ? { ...x, atividade_id: x.atividade_id === frente.id ? null : frente.id, atividade_livre: null }
      : x));
  };
  const ciclar = () => {
    if (!temGente) return;   // status só faz sentido com gente
    const r = proximoStatus(chave);
    if (r.pedirConfirmacao) onPedirConfirmacao();
    else setEfetivo(prev => prev.map(w => w.atividade_id === frente.id ? { ...w, atividade_status: r.status } : w));
  };

  // Quem aparece para marcar. A frente planejada já sabe de qual empreiteira
  // ela é, então a lista abre só com a equipe daquela empresa — com cinco
  // empreiteiras no canteiro, rolar 40 nomes para marcar 3 é o que fazia o
  // mestre desistir. Frente fora do plano (sem empresa) abre com todo mundo,
  // e quem já está marcado nesta frente nunca some, senão não dava pra
  // desmarcar quem foi apontado por engano.
  const mesmaEmpresa = (w) => String(w.empresa_nome || '').trim().toLowerCase() === String(frente.empreiteiro || '').trim().toLowerCase();
  const daEmpresa = frente.empreiteiro ? efetivo.filter(mesmaEmpresa) : [];
  const filtrando = daEmpresa.length > 0 && !verTodos;
  const visiveis = filtrando ? efetivo.filter(w => mesmaEmpresa(w) || w.atividade_id === frente.id) : efetivo;
  const escondidos = efetivo.length - visiveis.length;

  return (
    <div style={{ background: foraDoPlano ? '#f4f9fe' : 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${foraDoPlano ? '#2f6db0' : '#4a9a5a'}`, borderRadius: 13, padding: '11px 12px' }}>
      <button onClick={onAbrir}
        style={{ width: '100%', border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: 'var(--text-1)' }}>
            {frente.descricao}
            <span style={{ fontSize: 8.5, fontWeight: 800, borderRadius: 5, padding: '1px 5px', marginLeft: 6, background: foraDoPlano ? '#dcebfb' : '#eaf4ec', color: foraDoPlano ? '#2f6db0' : '#3f7a4c' }}>
              {foraDoPlano ? 'fora' : 'plano'}
            </span>
          </div>
          <span style={{ color: '#b5bcc2', fontSize: 13, fontWeight: 900 }}>{aberta ? '⌄' : '›'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--text-3)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {local}{frente.empreiteiro ? ' · ' + frente.empreiteiro : ''}
          </div>
          <span style={{ fontSize: 11.5, fontWeight: 800, flexShrink: 0, color: 'var(--text-2)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '3px 8px' }}>👷 {pessoas.length}</span>
        </div>
      </button>

      {/* Chip de status (toca pra ciclar; só com gente) + câmera */}
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <button onClick={ciclar} disabled={!temGente}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: 0, borderRadius: 999, padding: '5px 11px', cursor: temGente ? 'pointer' : 'default', opacity: temGente ? 1 : 0.5, background: opt.bg, color: opt.color, fontSize: 10.5, fontWeight: 800 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: opt.color }} />
          {opt.label}{temGente && <span style={{ opacity: .55, fontSize: 12 }}>›</span>}
        </button>
        <BotaoCamera compacto meta={() => ({ rdoId, atividadeId: frente.id, ambiente: frente.ambiente, pavimento: pavDe(frente.ambiente), servico: frente.descricao, empresa: frente.empreiteiro, status: chave, autorNome: profile?.nome })} />
      </div>

      {aberta && (
        <div style={{ marginTop: 11, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.4px' }}>
              Quem trabalhou aqui{filtrando ? ' · ' + frente.empreiteiro : ''}
            </div>
            <span style={{ flex: 1 }} />
            {(filtrando ? escondidos > 0 : daEmpresa.length > 0) && (
              <button onClick={() => setVerTodos(v => !v)}
                style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', fontSize: 11, fontWeight: 800, color: 'var(--primary)' }}>
                {filtrando ? `+ ver todos (${escondidos})` : 'só a equipe'}
              </button>
            )}
          </div>
          {efetivo.length === 0 && <div className="t-caption">Ninguém no canteiro. Volte ao passo 1.</div>}
          <div className="stack stack-1">
            {visiveis.map(w => {
              const on = w.atividade_id === frente.id;
              const noutra = !on && !!w.atividade_id;
              return (
                <button key={w.id} onClick={() => toggleNaFrente(w)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 0, cursor: 'pointer', borderRadius: 10, textAlign: 'left', width: '100%', background: on ? 'var(--primary-tint)' : 'var(--surface-2)', boxShadow: on ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 0.5px var(--border)' }}>
                  <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: '#fff', fontSize: 12, fontWeight: 900 }}>{on ? '✓' : ''}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{w.nome}{w.is_adm && <span style={{ fontSize: 9, fontWeight: 800, color: '#2f6db0', marginLeft: 6 }}>ADM</span>}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{w.funcao || 'Colaborador'}{noutra ? ' · em outra frente' : ''}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Passo 2: As frentes (apropriação) ──────────────────────────────────────
function PassoFrentes({ atividades, efetivo, setEfetivo, addAtividade, ambientes = [], rdoId, profile, avancar, foco, setFoco }) {
  const [abertaId, setAbertaId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);   // frente aguardando popup voltar/reiniciar
  const [novaOpen, setNovaOpen] = useState(false);
  const [novaDesc, setNovaDesc] = useState('');
  const [novaPav, setNovaPav] = useState('');
  const [novaAmb, setNovaAmb] = useState('');
  const [salvandoNova, setSalvandoNova] = useState(false);

  // Pavimento vem do cadastro de ambientes (cada ambiente sabe seu pavimento).
  const pavDe = (ambNome) => ambientes.find(a => a.nome === ambNome)?.pavimento || '';
  const localDe = (frente) => {
    if (!frente.ambiente) return 'sem ambiente';
    const pav = pavDe(frente.ambiente);
    return '📍 ' + (pav ? pav + ' · ' : '') + frente.ambiente;
  };
  const pavimentos = [...new Set(ambientes.map(a => a.pavimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ambsDoPav = novaPav ? ambientes.filter(a => a.pavimento === novaPav) : [];

  const setStatusFrente = (frenteId, novo) => {
    setEfetivo(prev => prev.map(w => w.atividade_id === frenteId ? { ...w, atividade_status: novo } : w));
  };

  // ── Recorte por fornecedor ───────────────────────────────────────────────
  // Vem escolhido do passo 1. As empreiteiras oferecidas são as que TÊM gente
  // no canteiro hoje — a lista completa do cadastro aqui seria papel de parede.
  const igual = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
  const empresasNoCanteiro = [...new Set(efetivo.map(w => (w.empresa_nome || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const focoValido = foco && empresasNoCanteiro.some(n => igual(n, foco)) ? foco : null;

  // Uma frente entra se é da empreiteira em foco ou se alguém dela já foi
  // apontado nela — inclusive as frentes fora do plano, que não têm empresa e
  // sumiriam justo depois de serem criadas ali.
  const doFoco = (w) => igual(w.empresa_nome, focoValido);
  const visiveis = !focoValido ? atividades : atividades.filter(f =>
    igual(f.empreiteiro, focoValido) || efetivo.some(w => w.atividade_id === f.id && doFoco(w)));
  const escondidas = atividades.length - visiveis.length;

  // Só interessa quem é da equipe em foco: o alerta existe para fechar a
  // apropriação daquela turma, não para cobrar as outras.
  const semFrente = efetivo.filter(w => !w.atividade_id && !w.atividade_livre && (!focoValido || doFoco(w)));

  const adicionarFrente = async () => {
    if (!novaDesc.trim() || salvandoNova || !addAtividade) return;
    setSalvandoNova(true);
    await addAtividade({ descricao: novaDesc.trim(), ambiente: novaAmb || null, empreiteiro: null });
    setSalvandoNova(false);
    setNovaDesc(''); setNovaPav(''); setNovaAmb(''); setNovaOpen(false);
  };

  return (
    <div>
      {semFrente.length > 0 && (
        <div style={{ display: 'flex', gap: 7, padding: '8px 11px', borderRadius: 10, background: 'var(--warn-tint,#FEF3C7)', color: 'var(--warn,#B45309)', fontSize: 11.5, fontWeight: 700, marginBottom: 12, lineHeight: 1.4 }}>
          <span>⚠</span>
          <span>{semFrente.length} sem frente: {semFrente.map(w => primeiroNome(w.nome)).join(', ')}</span>
        </div>
      )}

      {empresasNoCanteiro.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {empresasNoCanteiro.map(nome => (
            <ChipBtn key={nome} on={igual(nome, focoValido)}
              onClick={() => setFoco?.(igual(nome, focoValido) ? null : nome)}>{nome}</ChipBtn>
          ))}
          <ChipBtn on={!focoValido} onClick={() => setFoco?.(null)}>Todas</ChipBtn>
        </div>
      )}

      {visiveis.length === 0 && (
        <div className="t-caption" style={{ textAlign: 'center', padding: '14px 0' }}>
          {focoValido
            ? <>Nenhuma frente de <b>{focoValido}</b> planejada para hoje. Toque em “Todas” ou adicione uma fora do plano.</>
            : 'Nenhuma frente hoje. Adicione uma fora do plano abaixo.'}
        </div>
      )}

      <div className="stack stack-2">
        {visiveis.map(frente => (
          <CartaoFrente key={frente.id} frente={frente} efetivo={efetivo} setEfetivo={setEfetivo}
            rdoId={rdoId} profile={profile} pavDe={pavDe} local={localDe(frente)}
            aberta={abertaId === frente.id} onAbrir={() => setAbertaId(abertaId === frente.id ? null : frente.id)}
            onPedirConfirmacao={() => setConfirmId(frente.id)} />
        ))}
      </div>

      {escondidas > 0 && (
        <div style={{ textAlign: 'center', marginTop: 10 }}>
          <button onClick={() => setFoco?.(null)}
            style={{ border: 0, background: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, color: 'var(--text-3)' }}>
            {escondidas} {escondidas === 1 ? 'frente' : 'frentes'} de outras equipes · ver todas
          </button>
        </div>
      )}

      {/* Nova frente fora do plano */}
      {!novaOpen ? (
        <button onClick={() => setNovaOpen(true)} style={{ width: '100%', marginTop: 10, padding: '11px', borderRadius: 12, border: '1.5px dashed var(--primary)', background: 'var(--primary-tint)', color: 'var(--primary)', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
          + Frente fora do plano
        </button>
      ) : (
        <div style={{ marginTop: 10, padding: 12, borderRadius: 12, background: '#f4f9fe', border: '1px solid #cfe0f2' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#2f6db0', marginBottom: 8 }}>Nova frente (fora do plano)</div>
          <input className="ipt" placeholder="Serviço (ex.: Contrapiso)" value={novaDesc} onChange={e => setNovaDesc(e.target.value)} style={{ marginBottom: 8 }} />
          <select className="ipt" value={novaPav} onChange={e => { setNovaPav(e.target.value); setNovaAmb(''); }} style={{ marginBottom: 8 }}>
            <option value="">Pavimento…</option>
            {pavimentos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select className="ipt" value={novaAmb} onChange={e => setNovaAmb(e.target.value)} disabled={!novaPav}>
            <option value="">{novaPav ? 'Ambiente…' : 'Escolha o pavimento primeiro'}</option>
            {ambsDoPav.map(a => <option key={a.id} value={a.nome}>{a.nome}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-secondary" style={{ height: 42, flex: 1 }} onClick={() => { setNovaOpen(false); setNovaDesc(''); setNovaPav(''); setNovaAmb(''); }}>Cancelar</button>
            <button className="btn btn-primary" style={{ height: 42, flex: 1 }} disabled={!novaDesc.trim() || salvandoNova} onClick={adicionarFrente}>{salvandoNova ? 'Salvando…' : 'Adicionar'}</button>
          </div>
        </div>
      )}

      <button className="btn btn-primary btn-block" style={{ height: 48, marginTop: 16 }} onClick={avancar}>Continuar →</button>

      {/* Popup: frente concluída tocada de novo */}
      <PopupFrenteConcluida id={confirmId} onEscolher={setStatusFrente} onFechar={() => setConfirmId(null)} />
    </div>
  );
}

// ── Passo 3: Imprevistos (ocorrências do dia) ──────────────────────────────
function PassoImprevistos({ rdoId, profile, dataRDO, avancar }) {
  const [sel, setSel] = useState([]);
  const [desc, setDesc] = useState('');
  const [turno, setTurno] = useState('dia');
  const [salvando, setSalvando] = useState(false);
  const [registradas, setRegistradas] = useState([]);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!rdoId) return;
    supabase.from('ocorrencias').select('*').eq('rdo_id', rdoId).order('created_at')
      .then(({ data }) => setRegistradas(data || []));
  }, [rdoId]);

  const toggle = (id) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const registrar = async () => {
    if (!sel.length || salvando) return;
    setSalvando(true); setErro('');
    const rid = await garantirRdoId(rdoId, dataRDO);
    const labels = sel.map(id => TIPOS_OC.find(t => t.id === id)?.label || id).join(', ');
    const { data, error } = await supabase.from('ocorrencias').insert({
      rdo_id: rid || null, categoria: labels, descricao: desc.trim() || labels, turno,
      // data ia nula: a ocorrência existia sem dizer de que dia era.
      data: dataRDO || hojeLocal(),
      registrado_por: profile?.nome || null,
    }).select().single();
    setSalvando(false);
    if (error) { setErro(msgAmigavel(error, 'salvar')); return; }
    setRegistradas(prev => [...prev, data]);
    setSel([]); setDesc('');
  };

  return (
    <div>
      {registradas.length > 0 && (
        <div className="stack stack-1" style={{ marginBottom: 14 }}>
          {registradas.map(oc => (
            <div key={oc.id} style={{ padding: '9px 12px', borderRadius: 10, background: 'var(--danger-tint,#FEE2E2)', borderLeft: '3px solid var(--danger)' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--text-1)' }}>{oc.categoria}</div>
              {oc.descricao && oc.descricao !== oc.categoria && <div style={{ fontSize: 11.5, color: 'var(--text-2)', marginTop: 2 }}>{oc.descricao}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
        {TIPOS_OC.map(t => {
          const on = sel.includes(t.id);
          return (
            <button key={t.id} onClick={() => toggle(t.id)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 10px', borderRadius: 12, border: `1.5px solid ${on ? 'var(--primary)' : 'var(--border)'}`, background: on ? 'var(--primary-tint)' : 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ fontSize: 17, flexShrink: 0 }}>{t.emoji}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: on ? 'var(--primary)' : 'var(--text-2)', lineHeight: 1.15 }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      <textarea className="ipt" style={{ marginTop: 10, minHeight: 52, height: 'auto', padding: '10px 12px', resize: 'vertical' }}
        placeholder="Escreva o que quiser (opcional)…" value={desc} onChange={e => setDesc(e.target.value)} />

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        {[['manha', 'Manhã'], ['tarde', 'Tarde'], ['dia', 'Dia todo']].map(([k, l]) => (
          <button key={k} onClick={() => setTurno(k)} style={{ flex: 1, height: 40, borderRadius: 10, border: 0, cursor: 'pointer', fontSize: 13, fontWeight: 700, background: turno === k ? 'var(--primary)' : 'var(--surface-2)', color: turno === k ? '#fff' : 'var(--text-2)' }}>{l}</button>
        ))}
      </div>

      {erro && <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600 }}>{erro}</div>}

      <button onClick={registrar} disabled={!sel.length || salvando} style={{ width: '100%', marginTop: 12, height: 46, borderRadius: 12, border: '1.5px dashed var(--primary)', background: sel.length ? 'var(--primary-tint)' : 'var(--surface-2)', color: 'var(--primary)', fontWeight: 800, fontSize: 13, cursor: sel.length ? 'pointer' : 'default', opacity: sel.length ? 1 : 0.55 }}>
        {salvando ? 'Salvando…' : '+ Registrar imprevisto'}
      </button>

      <button className="btn btn-primary btn-block" style={{ height: 48, marginTop: 12 }} onClick={avancar}>
        {registradas.length ? 'Continuar →' : 'Nada hoje, continuar →'}
      </button>
    </div>
  );
}

// ── Passo 4: foto do dia, revisão e salvar ─────────────────────────────────
// A foto aqui é do dia inteiro, não de uma frente: é a que vai para o relatório
// semanal. As fotos por frente continuam saindo pelo 📷 do passo 2.
function PassoRevisao({ rdoId, profile, atividades = [], efetivo = [], submitDaily, dataRDO, onEncerrar, onOutraEquipe }) {
  const [fotos, setFotos] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!rdoId) return;
    supabase.from('rdo_fotos').select('id, url, legenda').eq('rdo_id', rdoId).order('created_at')
      .then(({ data }) => setFotos(data || []));
  }, [rdoId]);

  const anexar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEnviando(true); setErro('');
    try {
      const rid = await garantirRdoId(rdoId, dataRDO);
      const row = await enviarFotoRDO(file, { rdoId: rid, data: dataRDO || hojeLocal(), autorNome: profile?.nome });
      setFotos(f => [...f, row]);
    } catch (err) {
      setErro(msgAmigavel(err, 'enviar a foto'));
    }
    setEnviando(false);
  };

  const apagar = async (id) => {
    setFotos(f => f.filter(x => x.id !== id));
    await supabase.from('rdo_fotos').delete().eq('id', id);
  };

  const frentes = atividades.filter(a => efetivo.some(w => w.atividade_id === a.id)).length;
  const pessoas = new Set(efetivo.map(w => w.colaborador_id || w.id)).size;
  // Equipe "lançada" é a que já tem gente apontada numa frente — marcar quem
  // veio, no passo 1, ainda não é diário de ninguém.
  const equipesLancadas = [...new Set(efetivo.filter(w => w.atividade_id).map(w => (w.empresa_nome || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));

  return (
    <div>
      <div className="t-micro" style={{ marginBottom: 8 }}>FOTO DO DIA</div>

      {fotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          {fotos.map(f => (
            <div key={f.id} style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', aspectRatio: '1' }}>
              <img src={f.url} alt={f.legenda || ''} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              <button onClick={() => apagar(f.id)} title="Remover"
                style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: 999, border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 13, lineHeight: 1 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <button onClick={() => inputRef.current?.click()} disabled={enviando}
        style={{ width: '100%', height: 88, borderRadius: 14, border: '1.5px dashed var(--border)',
          background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: 14, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <span style={{ fontSize: 26 }}>{enviando ? '⏳' : '📷'}</span>
        {enviando ? 'Enviando…' : fotos.length ? 'Adicionar outra foto' : 'Tirar ou escolher foto'}
      </button>
      <input ref={inputRef} type="file" accept="image/*" onChange={anexar} style={{ display: 'none' }} />

      {erro && <div className="t-caption" style={{ color: 'var(--danger)', marginTop: 8 }}>{erro}</div>}

      <div className="card" style={{ marginTop: 16, padding: '12px 14px', display: 'flex', gap: 18 }}>
        <div><div style={{ fontSize: 20, fontWeight: 900 }}>{pessoas}</div><div className="t-caption">no canteiro</div></div>
        <div><div style={{ fontSize: 20, fontWeight: 900 }}>{frentes}</div><div className="t-caption">frentes</div></div>
        <div><div style={{ fontSize: 20, fontWeight: 900 }}>{fotos.length}</div><div className="t-caption">foto(s)</div></div>
      </div>

      {/* Lançar equipe por equipe é o fluxo real: termina a empreiteira A, começa a
          Geplan. Sem isto era preciso voltar três passos na mão, e o resumo não
          dizia quem já tinha sido lançado — dava para repetir ou pular uma. */}
      {onOutraEquipe && (
        <>
          <button onClick={onOutraEquipe}
            style={{ width: '100%', marginTop: 12, padding: 13, borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit',
              border: '1.5px dashed var(--primary)', background: 'var(--primary-tint)', color: 'var(--primary)',
              fontSize: 14, fontWeight: 800 }}>
            👥 Lançar outra equipe
          </button>
          {equipesLancadas.length > 0 && (
            <div className="t-caption" style={{ fontSize: 11.5, textAlign: 'center', marginTop: 7 }}>
              já apropriadas: {equipesLancadas.join(' · ')}
            </div>
          )}
        </>
      )}

      <BotaoSalvarDiario onSalvar={submitDaily} onEncerrar={onEncerrar} />
    </div>
  );
}

// Salvar sem devolutiva parecia que não tinha acontecido nada — o botão ficava
// igual antes e depois. Agora ele começa cinza com o quadrado vazio e termina
// laranja com o check.
function BotaoSalvarDiario({ onSalvar, onEncerrar }) {
  const [estado, setEstado] = useState('idle');   // idle | salvando | salvo

  const clicar = async () => {
    if (estado === 'salvando') return;
    setEstado('salvando');
    // submitRDO devolve false quando o banco recusou — aí o botão volta ao
    // normal em vez de mentir "Diário salvo".
    try {
      const ok = onSalvar ? await onSalvar() : true;
      setEstado(ok === false ? 'idle' : 'salvo');
      // Salvar deixava a pessoa parada no último passo do wizard, sem ver o que
      // acabou de gravar. Encerrado o diário, ele abre no formato completo.
      if (ok !== false && onEncerrar) setTimeout(onEncerrar, 700);
    } catch { setEstado('idle'); }
  };

  const salvo = estado === 'salvo';
  return (
    <button onClick={clicar} disabled={estado === 'salvando'}
      style={{
        width: '100%', height: 54, marginTop: 16, borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 15, fontWeight: 800,
        border: salvo ? 'none' : '1.5px solid var(--border)',
        background: salvo ? '#D97706' : 'var(--surface-2)',
        color: salvo ? '#fff' : 'var(--text-2)',
        transition: 'background .2s, color .2s',
      }}>
      <span style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: salvo ? 'none' : '2px solid var(--text-3)',
        background: salvo ? 'rgba(255,255,255,0.25)' : 'transparent',
        color: '#fff', fontSize: 14, fontWeight: 900,
      }}>{salvo ? '✓' : ''}</span>
      {estado === 'salvando' ? 'Salvando…' : salvo ? 'Diário salvo' : 'Salvar diário'}
    </button>
  );
}

// ── Tela de escolha do modo (aparece toda vez que abre o RDO) ───────────────
function EscolhaModo({ goto, onEscolher }) {
  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('home')}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Início
        </button>
        <button onClick={() => goto('rdo-classic')} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: 'none', border: 0, cursor: 'pointer' }}>RDO clássico ›</button>
      </div>
      <div className="page-pad" style={{ paddingTop: 18 }}>
        <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 5 }}>Como quer fazer hoje?</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 18 }}>Os dois geram o mesmo diário. Escolha o mais fácil no dia.</div>
        <EscolhaCard emoji="👥" titulo="Por equipe" desc="Marca todo mundo que veio e depois distribui nas frentes." tag="Rápido se já sabe quem veio" onClick={() => onEscolher('equipe')} />
        <EscolhaCard emoji="📍" titulo="Por ambiente" desc="Anda pela obra e vai ambiente por ambiente: quem está e o que faz." tag="Bom pra ir caminhando" onClick={() => onEscolher('ambiente')} />
      </div>
    </div>
  );
}
function EscolhaCard({ emoji, titulo, desc, tag, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', gap: 13, alignItems: 'flex-start', width: '100%', textAlign: 'left', border: '1.5px solid var(--border)', borderRadius: 16, padding: 16, background: 'var(--surface)', marginBottom: 12, cursor: 'pointer' }}>
      <div style={{ width: 46, height: 46, borderRadius: 13, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, background: 'var(--primary-tint)' }}>{emoji}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{titulo}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 3, lineHeight: 1.4 }}>{desc}</div>
        <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-tint)', borderRadius: 6, padding: '2px 7px', marginTop: 6 }}>{tag}</span>
      </div>
    </button>
  );
}

function ChipBtn({ on, dashed, onClick, children }) {
  return (
    <button onClick={onClick} style={{ fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 11, cursor: 'pointer',
      border: on ? '1.5px solid var(--primary)' : `1.5px ${dashed ? 'dashed' : 'solid'} var(--border)`,
      background: on ? 'var(--primary-tint)' : 'var(--surface)', color: on ? 'var(--primary)' : 'var(--text-2)' }}>{children}</button>
  );
}

// ── Modo Por ambiente: lista dos ambientes lançados + adicionar + imprevistos ─
function ModoAmbiente({ atividades, efetivo, setEfetivo, addAtividade, rdoId, profile, dataRDO, submitDaily, onTrocarModo, onClassico }) {
  const { ambientes } = useObra();
  const [view, setView] = useState('lista');   // 'lista' | 'add' | 'imprevistos'
  const [abertaId, setAbertaId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const setStatusFrente = (frenteId, novo) =>
    setEfetivo(prev => prev.map(w => w.atividade_id === frenteId ? { ...w, atividade_status: novo } : w));

  const pavDe = (ambNome) => ambientes.find(a => a.nome === ambNome)?.pavimento || '';
  // Antes esta lista só mostrava ambiente onde JÁ havia gente apontada — ou
  // seja, abria vazia todo dia e obrigava a recadastrar à mão o que o plano da
  // semana já dizia. Agora ela parte das frentes do dia, agrupadas por
  // ambiente; o que não tem ambiente cai num grupo próprio no fim.
  const grupos = agruparPorAmbiente(atividades, pavDe);

  if (view === 'add') {
    return <AddAmbiente addAtividade={addAtividade} setEfetivo={setEfetivo}
      onPronto={() => setView('lista')} onVoltar={() => setView('lista')} />;
  }
  if (view === 'imprevistos') {
    return (
      <div className="page">
        <div style={{ padding: '12px var(--pad-4) 0' }}>
          <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setView('lista')}>
            <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
          </button>
        </div>
        <div className="page-pad" style={{ paddingTop: 8 }}>
          <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 5 }}>Imprevistos do dia</div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Registre o que atrapalhou. Uma vez pro dia.</div>
          <PassoBoundary><PassoImprevistos rdoId={rdoId} profile={profile} dataRDO={dataRDO} avancar={() => setView('lista')} /></PassoBoundary>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={onTrocarModo}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Trocar modo
        </button>
        <button onClick={onClassico} style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-3)', background: 'none', border: 0, cursor: 'pointer' }}>RDO clássico ›</button>
      </div>
      <FaixaDataWizard data={dataRDO} />
      <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 24 }}>
        <div style={{ fontSize: 21, fontWeight: 900, marginBottom: 5 }}>Ambientes de hoje</div>
        <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>Passe pelos ambientes onde tem gente trabalhando.</div>

        <PassoBoundary>
          {grupos.length === 0 && (
            <div className="t-caption" style={{ textAlign: 'center', padding: '10px 0 4px' }}>
              Nada planejado para este dia. Use “+ Adicionar ambiente” abaixo.
            </div>
          )}
          {grupos.map(g => (
            <div key={g.ambiente} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 2px 8px' }}>
                <span style={{ fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em',
                  color: g.semAmbiente ? 'var(--text-3)' : 'var(--text-1)' }}>{g.ambiente}</span>
                {g.pavimento && <span className="t-caption" style={{ fontSize: 11 }}>📍 {g.pavimento}</span>}
                <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span className="t-caption" style={{ fontSize: 11 }}>{g.itens.length}</span>
              </div>
              <div className="stack stack-2">
                {g.itens.map(a => (
                  <CartaoFrente key={a.id} frente={a} efetivo={efetivo} setEfetivo={setEfetivo}
                    rdoId={rdoId} profile={profile} pavDe={pavDe}
                    local={g.semAmbiente ? 'sem ambiente' : '📍 ' + (g.pavimento ? g.pavimento + ' · ' : '') + g.ambiente}
                    aberta={abertaId === a.id} onAbrir={() => setAbertaId(abertaId === a.id ? null : a.id)}
                    onPedirConfirmacao={() => setConfirmId(a.id)} />
                ))}
              </div>
            </div>
          ))}

          <button onClick={() => setView('add')} style={{ width: '100%', marginTop: 12, padding: '14px', borderRadius: 13, border: '1.5px dashed var(--primary)', background: 'var(--primary-tint)', color: 'var(--primary)', fontWeight: 800, fontSize: 14, cursor: 'pointer' }}>+ Adicionar ambiente</button>

          <div className="t-micro" style={{ margin: '18px 2px 8px' }}>IMPREVISTOS DO DIA</div>
          <button onClick={() => setView('imprevistos')} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 12, padding: 11, cursor: 'pointer', textAlign: 'left' }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--primary-tint)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>+</span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-2)' }}>Registrar imprevisto (chuva, faltou frente, segurança…)</span>
          </button>

          <div style={{ marginTop: 18 }} />
          <PassoRevisao rdoId={rdoId} profile={profile} atividades={atividades}
            efetivo={efetivo || []} submitDaily={submitDaily} />
          <PopupFrenteConcluida id={confirmId} onEscolher={setStatusFrente} onFechar={() => setConfirmId(null)} />
        </PassoBoundary>
      </div>
    </div>
  );
}

// ── Formulário de um ambiente (uma tela) ────────────────────────────────────
function AddAmbiente({ addAtividade, setEfetivo, onPronto, onVoltar }) {
  const { empresas, colaboradores, ambientes, reload } = useObra();
  const [pav, setPav] = useState('');
  const [amb, setAmb] = useState('');
  const [criandoAmb, setCriandoAmb] = useState(false);
  const [novoAmb, setNovoAmb] = useState('');
  const [empresaId, setEmpresaId] = useState('');
  const [servico, setServico] = useState('');
  const [status, setStatus] = useState('em_andamento');
  const [selIds, setSelIds] = useState([]);
  const [admIds, setAdmIds] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const pavimentos = [...new Set(ambientes.map(a => a.pavimento).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const ambsDoPav = pav ? ambientes.filter(a => a.pavimento === pav).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')) : [];
  const fornecedores = empresas.filter(e => e.tipo === 'empreiteiro').sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const empresaSel = empresas.find(e => e.id === empresaId);
  const pessoasEmpresa = empresaId ? colaboradores.filter(c => c.empreiteiro_id === empresaId && c.ativo !== false).sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')) : [];

  const ambFinal = criandoAmb ? novoAmb.trim() : amb;
  const podeSalvar = !!ambFinal && !!empresaId && !!servico.trim() && selIds.length > 0 && !salvando;
  const toggleSel = (id) => setSelIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAdm = (id) => setAdmIds(m => ({ ...m, [id]: !m[id] }));

  const salvar = async () => {
    if (!podeSalvar) return;
    setSalvando(true); setErro('');
    if (criandoAmb && novoAmb.trim()) {
      try { await supabase.from('ambientes').insert({ nome: novoAmb.trim(), pavimento: pav || null }); await reload(); } catch (_) { /* segue mesmo se o cadastro falhar */ }
    }
    const nova = await addAtividade({ descricao: servico.trim(), ambiente: ambFinal, empreiteiro: empresaSel?.nome || null });
    if (!nova) { setErro('Não deu pra criar (RDO não encontrado).'); setSalvando(false); return; }
    setEfetivo(prev => {
      const next = [...prev];
      for (const c of pessoasEmpresa.filter(c => selIds.includes(c.id))) {
        const base = {
          colab_id: c.id, nome: c.nome, iniciais: c.iniciais, funcao: c.funcao,
          empresa_id: c.empreiteiro_id, empresa_nome: empresaSel?.nome || '',
          is_adm: !!admIds[c.id], atividade_id: nova.id, atividade_status: status,
          atividade_livre: null, extras: [],
        };
        const idx = next.findIndex(w => w.colab_id === c.id);
        if (idx >= 0) next[idx] = { ...next[idx], ...base };
        else next.push({ id: 'w' + Date.now() + '_' + c.id, ...base });
      }
      return next;
    });
    setSalvando(false);
    onPronto();
  };

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={onVoltar}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Ambientes
        </button>
      </div>
      <div className="page-pad" style={{ paddingTop: 8, paddingBottom: 28 }}>
        <div style={{ fontSize: 19, fontWeight: 900, marginBottom: 14 }}>Onde você está?</div>
        <PassoBoundary>
          <div className="t-micro" style={{ marginBottom: 7 }}>PAVIMENTO</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {pavimentos.map(p => <ChipBtn key={p} on={pav === p} onClick={() => { setPav(p); setAmb(''); setCriandoAmb(false); }}>{p}</ChipBtn>)}
            {pavimentos.length === 0 && <div className="t-caption">Sem pavimentos no cadastro.</div>}
          </div>

          {pav && (
            <>
              <div className="t-micro" style={{ margin: '14px 0 7px' }}>AMBIENTE</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {ambsDoPav.map(a => <ChipBtn key={a.id} on={!criandoAmb && amb === a.nome} onClick={() => { setAmb(a.nome); setCriandoAmb(false); }}>{a.nome}</ChipBtn>)}
                <ChipBtn on={criandoAmb} dashed onClick={() => { setCriandoAmb(true); setAmb(''); }}>+ criar</ChipBtn>
              </div>
              {criandoAmb && <input className="ipt" style={{ marginTop: 8 }} placeholder="Nome do novo ambiente" value={novoAmb} onChange={e => setNovoAmb(e.target.value)} />}
            </>
          )}

          <div className="t-micro" style={{ margin: '14px 0 7px' }}>EMPRESA</div>
          <select className="ipt" value={empresaId} onChange={e => { setEmpresaId(e.target.value); setSelIds([]); setAdmIds({}); }}>
            <option value="">Escolha a empresa…</option>
            {fornecedores.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>

          <div className="t-micro" style={{ margin: '14px 0 7px' }}>SERVIÇO</div>
          <input className="ipt" placeholder="Ex.: Reboco" value={servico} onChange={e => setServico(e.target.value)} />

          {empresaId && (
            <>
              <div className="t-micro" style={{ margin: '14px 0 7px' }}>QUEM ESTÁ AQUI</div>
              <div className="stack stack-1">
                {pessoasEmpresa.map(c => {
                  const on = selIds.includes(c.id);
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 11, background: on ? 'var(--primary-tint)' : 'var(--surface)', boxShadow: on ? 'inset 0 0 0 1.5px var(--primary)' : 'inset 0 0 0 .5px var(--border)' }}>
                      <button onClick={() => toggleSel(c.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                        <div style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--primary)' : 'transparent', boxShadow: on ? 'none' : 'inset 0 0 0 1.5px var(--border-strong)', color: '#fff', fontSize: 12, fontWeight: 900 }}>{on ? '✓' : ''}</div>
                        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700 }}>{c.nome}</div><div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{c.funcao || 'Colaborador'}</div></div>
                      </button>
                      {on && <button onClick={() => toggleAdm(c.id)} style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, padding: '4px 9px', borderRadius: 999, cursor: 'pointer', border: admIds[c.id] ? '1px solid #9cc0ea' : '1px solid var(--border)', background: admIds[c.id] ? '#eef4ff' : 'var(--surface)', color: admIds[c.id] ? '#2f6db0' : 'var(--text-3)' }}>{admIds[c.id] ? 'ADM ✓' : 'ADM'}</button>}
                    </div>
                  );
                })}
                {pessoasEmpresa.length === 0 && <div className="t-caption">Nenhuma pessoa nesta empresa.</div>}
              </div>
            </>
          )}

          <div className="t-micro" style={{ margin: '14px 0 7px' }}>STATUS</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['nao_iniciou', 'Não iniciou'], ['em_andamento', 'Em andamento'], ['concluida', 'Concluído']].map(([k, l]) => (
              <button key={k} onClick={() => setStatus(k)} style={{ flex: 1, height: 40, borderRadius: 10, border: 0, cursor: 'pointer', fontSize: 11.5, fontWeight: 800, background: status === k ? 'var(--primary)' : 'var(--surface-2)', color: status === k ? '#fff' : 'var(--text-3)' }}>{l}</button>
            ))}
          </div>

          {erro && <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 12.5 }}>{erro}</div>}

          <button onClick={salvar} disabled={!podeSalvar} className="btn btn-primary btn-block" style={{ height: 50, marginTop: 16 }}>
            {salvando ? 'Salvando…' : 'Salvar ambiente e ir pro próximo →'}
          </button>
        </PassoBoundary>
      </div>
    </div>
  );
}
