// Tela de administração das obras (fatia 2 do multi-obra).
//
// Só quem é administrador chega aqui (o nav esconde o item; a RLS de `obras`
// e `obra_membros` recusa escrita de quem não é admin de qualquer forma — a
// tela só evita mostrar um botão que ia dar erro).
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { useObraSelecionada } from '../lib/obra-selecionada';
import { avisarErro } from '../lib/msg-amigavel';

export function ObrasScreen({ goto, voltarPara = 'home' }) {
  // A lista já mora no contexto (é a mesma que o seletor usa) — evita pedir
  // a mesma consulta duas vezes e ter dois estados de erro/loading para a
  // mesma informação.
  const { obras, erro, recarregarObras } = useObraSelecionada();
  const [editando, setEditando] = useState(null); // obra ou { novo: true }

  function aoSalvar() {
    setEditando(null);
    recarregarObras(); // a obra nova já aparece na lista e no seletor, sem recarregar a página
  }

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="t-micro">ADMINISTRAÇÃO</div>
            <div className="t-h1">Obras</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditando({ novo: true })}>
            <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Nova
          </button>
        </div>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        {erro && (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            ⚠️ {erro}
          </div>
        )}
        <div className="stack stack-2">
          {obras.map(o => (
            <div key={o.id} className="card tap" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
              onClick={() => setEditando(o)}>
              <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, background: 'var(--primary-tint)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🏗️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                  <span className="t-strong" style={{ fontSize: 14 }}>{o.nome}</span>
                  {!o.ativa && (
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                      background: 'var(--surface-2)', color: 'var(--text-3)' }}>ENCERRADA</span>
                  )}
                </div>
                <div className="t-caption" style={{ fontSize: 11.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {o.codigo || o.localizacao ? [o.codigo, o.localizacao].filter(Boolean).join(' · ') : 'sem código nem endereço'}
                </div>
              </div>
              <span style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }}>{Icon.chevR}</span>
            </div>
          ))}
        </div>

        {obras.length === 0 && !erro && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhuma obra cadastrada ainda.</div>
        )}
      </div>

      {editando && <ObraPopup obra={editando} onFechar={() => setEditando(null)} onSalvo={aoSalvar} />}
    </div>
  );
}

// ── Popup de criar / editar + quem acessa ───────────────────────────────────
function ObraPopup({ obra, onFechar, onSalvo }) {
  const novo = !!obra.novo;
  const [nome, setNome] = useState(novo ? '' : (obra.nome || ''));
  const [codigo, setCodigo] = useState(novo ? '' : (obra.codigo || ''));
  const [localizacao, setLocalizacao] = useState(novo ? '' : (obra.localizacao || ''));
  const [cliente, setCliente] = useState(novo ? '' : (obra.cliente || ''));
  const [arquiteto, setArquiteto] = useState(novo ? '' : (obra.arquiteto || ''));
  const [dataInicio, setDataInicio] = useState(novo ? '' : (obra.data_inicio || ''));
  const [ativa, setAtiva] = useState(novo ? true : obra.ativa !== false);
  const [salvando, setSalvando] = useState(false);

  const pronto = nome.trim().length > 0;

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    const dados = {
      nome: nome.trim(),
      codigo: codigo.trim(),
      localizacao: localizacao.trim(),
      cliente: cliente.trim() || null,
      arquiteto: arquiteto.trim(),
      data_inicio: dataInicio || null,
      ativa,
    };
    try {
      if (novo) {
        const { error } = await supabase.from('obras').insert(dados);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('obras').update(dados).eq('id', obra.id);
        if (error) throw error;
      }
      onSalvo();
    } catch (e) {
      avisarErro(e, novo ? 'criar a obra' : 'salvar a obra');
    } finally {
      setSalvando(false);
    }
  }

  const campo = { width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
    background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' };
  const rotulo = { fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 460, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 20, padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>{novo ? '🏗️ Nova obra' : '✏️ Editar obra'}</div>
          <button onClick={onFechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={rotulo}>NOME *</div>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Residencial Aurora"
          style={{ ...campo, marginBottom: 14 }} />

        <div style={rotulo}>CÓDIGO</div>
        <input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="Ex.: OBRA-02"
          style={{ ...campo, marginBottom: 14 }} />

        <div style={rotulo}>ENDEREÇO</div>
        <input value={localizacao} onChange={e => setLocalizacao(e.target.value)} placeholder="Rua, número, cidade"
          style={{ ...campo, marginBottom: 14 }} />

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <div style={rotulo}>CLIENTE</div>
            <input value={cliente} onChange={e => setCliente(e.target.value)} style={campo} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={rotulo}>ARQUITETO</div>
            <input value={arquiteto} onChange={e => setArquiteto(e.target.value)} style={campo} />
          </div>
        </div>

        <div style={rotulo}>INÍCIO DA OBRA</div>
        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
          style={{ ...campo, marginBottom: 14 }} />

        {!novo && (
          <button onClick={() => setAtiva(v => !v)}
            style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
              padding: '11px 13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
              border: ativa ? '1.5px solid var(--border)' : '2px solid var(--warn)',
              background: ativa ? 'var(--surface-2)' : 'var(--warn-tint, #FEF3C7)' }}>
            <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 13, fontWeight: 900,
              background: ativa ? 'var(--primary)' : 'transparent', color: '#fff',
              border: ativa ? 'none' : '1px solid var(--warn)' }}>{ativa ? '✓' : ''}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)' }}>Obra ativa</span>
              <span className="t-caption" style={{ display: 'block', fontSize: 11.5 }}>
                Desligue para encerrar sem apagar nada. O histórico continua acessível.
              </span>
            </span>
          </button>
        )}

        {!novo && <QuemAcessa obraId={obra.id} />}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onFechar} style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={salvar} disabled={!pronto || salvando}
            style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', fontFamily: 'inherit',
              background: pronto && !salvando ? 'var(--primary)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {salvando ? 'Salvando…' : novo ? 'Criar obra' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quem acessa esta obra ────────────────────────────────────────────────
// Administrador não precisa aparecer na lista: ele já vê todas as obras por
// ser admin (minhas_obras() no banco), com ou sem linha em obra_membros.
function QuemAcessa({ obraId }) {
  const [perfis, setPerfis] = useState(null);
  const [membros, setMembros] = useState(new Set());
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    Promise.all([
      // profiles não tem e-mail (quem lê isso é a Edge Function admin-usuarios,
      // com a chave de serviço); aqui dá para mostrar o nome e o tipo de acesso.
      supabase.from('profiles').select('id, nome, role, is_admin').order('nome'),
      supabase.from('obra_membros').select('user_id').eq('obra_id', obraId),
    ]).then(([p, m]) => {
      if (!ativo) return;
      if (p.error || m.error) { setErro('Não foi possível carregar quem acessa esta obra.'); return; }
      setPerfis((p.data || []).filter(u => !u.is_admin));
      setMembros(new Set((m.data || []).map(x => x.user_id)));
    });
    return () => { ativo = false; };
  }, [obraId]);

  async function alternar(userId, ligado) {
    // Otimista: a lista responde na hora, e volta atrás se o banco recusar.
    setMembros(prev => {
      const novo = new Set(prev);
      ligado ? novo.delete(userId) : novo.add(userId);
      return novo;
    });
    const { error } = ligado
      ? await supabase.from('obra_membros').delete().eq('obra_id', obraId).eq('user_id', userId)
      : await supabase.from('obra_membros').insert({ obra_id: obraId, user_id: userId });
    if (error) {
      setMembros(prev => {
        const novo = new Set(prev);
        ligado ? novo.add(userId) : novo.delete(userId);
        return novo;
      });
      avisarErro(error, 'atualizar o acesso');
    }
  }

  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 8 }}>
        QUEM ACESSA ESTA OBRA
      </div>
      <div className="t-caption" style={{ fontSize: 11, marginBottom: 10 }}>
        Administrador vê todas as obras sempre; não precisa ser liberado aqui.
      </div>
      {erro && <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>{erro}</div>}
      {perfis === null && <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '8px 0' }}>Carregando…</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {(perfis || []).map(u => {
          const ligado = membros.has(u.id);
          return (
            <button key={u.id} onClick={() => alternar(u.id, ligado)}
              style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
                border: ligado ? '1.5px solid var(--primary)' : '1.5px solid var(--border)',
                background: ligado ? 'var(--primary-tint)' : 'var(--surface-2)' }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 12, fontWeight: 900,
                background: ligado ? 'var(--primary)' : 'transparent', color: '#fff',
                border: ligado ? 'none' : '1px solid var(--border)' }}>{ligado ? '✓' : ''}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.nome || 'sem nome'}
                </span>
                <span className="t-caption" style={{ fontSize: 10.5 }}>{u.role || 'sem tipo de acesso'}</span>
              </span>
            </button>
          );
        })}
        {perfis?.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '8px 0' }}>Nenhum usuário além do administrador.</div>
        )}
      </div>
    </div>
  );
}
