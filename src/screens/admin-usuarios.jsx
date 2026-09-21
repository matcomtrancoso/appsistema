// Painel de administração de usuários.
//
// Nada aqui fala direto com a tabela de autenticação: criar usuário, trocar
// e-mail e trocar senha exigem a chave de serviço do Supabase, que nunca pode
// estar no app (qualquer pessoa leria o bundle e teria o banco inteiro). Tudo
// passa pela Edge Function `admin-usuarios`, que guarda a chave no servidor e
// confere, a cada chamada, se quem pediu tem is_admin no próprio perfil.
import { MARCA } from '../marca.js';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { msgAmigavel, avisarErro } from '../lib/msg-amigavel';

// Senha mínima. A Edge Function confere de novo no servidor; aqui é só para o
// botão não deixar mandar uma senha que vai voltar recusada.
const SENHA_MIN = 8;

const ROLES = [
  { k: 'engenheiro', l: '📐 Engenharia', desc: 'vê tudo: planejamento, projetos, contratações' },
  { k: 'mestre',     l: '🧱 Mestre',     desc: 'canteiro: RDO, pendências, requisições' },
  { k: 'visitante',  l: '👁 Visitante',  desc: 'vê tudo, mas não altera nada' },
];

const fmtData = (iso) => {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? 'sem data' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

async function chamar(acao, corpo = {}) {
  const { data, error } = await supabase.functions.invoke('admin-usuarios', { body: { acao, ...corpo } });
  if (error) {
    // O corpo do erro traz a mensagem boa (permissão, e-mail duplicado…),
    // escrita em português pela própria função: essa passa como veio. Sem
    // corpo (sem internet, função fora do ar), fica o erro técnico, que o
    // msgAmigavel traduz.
    let j = null;
    try { j = await error.context?.json?.(); } catch { /* sem corpo */ }
    if (j?.error) throw doApp(j.error);
    throw error;
  }
  if (data?.error) throw doApp(data.error);
  return data;
}

// Mensagem que veio da nossa Edge Function, já em português de obra.
function doApp(texto) {
  const e = new Error(texto);
  e.paraUsuario = true;
  return e;
}

// Nome para mostrar na tela sem nunca cair em "null": o e-mail pode faltar
// quando a função não conseguiu ler os logins (ver o aviso no topo).
function nomeDe(u) {
  return (u.email ? u.email.split('@')[0] : '') || u.nome || 'sem nome';
}

export function AdminUsuarios({ goto, voltarPara = 'home' }) {
  const [usuarios, setUsuarios] = useState(null);
  const [erro, setErro] = useState('');
  // Aviso opcional que a função manda junto com a lista (ex.: não conseguiu
  // ler os e-mails dos logins). A lista vem mesmo assim; o aviso só explica.
  const [aviso, setAviso] = useState('');
  const [editando, setEditando] = useState(null);   // usuário ou { novo: true }

  const carregar = useCallback(() => {
    chamar('listar')
      .then(d => {
        setUsuarios(d?.usuarios || []);
        setErro('');
        setAviso(typeof d?.aviso === 'string' ? d.aviso.trim() : '');
      })
      .catch(e => { console.error(e); setErro(msgAmigavel(e, 'carregar os usuários')); setUsuarios([]); });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function apagar(u) {
    if (!confirm(`Apagar o usuário ${u.email || u.nome || 'sem nome'}? Ele perde o acesso na hora.`)) return;
    try { await chamar('apagar', { id: u.id }); carregar(); }
    catch (e) { avisarErro(e, 'apagar o usuário'); }
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
            <div className="t-h1">Usuários</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setEditando({ novo: true })}>
            <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Novo
          </button>
        </div>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        {aviso && (
          <div role="status" className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--warn-tint, #FEF3C7)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, lineHeight: 1.45, boxShadow: 'none', border: '0.5px solid var(--border)' }}>
            ℹ️ {aviso}
          </div>
        )}
        {erro && (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            ⚠️ {erro}
          </div>
        )}
        {usuarios === null && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

        <div className="stack stack-2">
          {(usuarios || []).map(u => {
            const r = ROLES.find(x => x.k === u.role);
            return (
              <div key={u.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 999, flexShrink: 0, background: 'var(--primary)', color: '#fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
                  {(u.nome || u.email || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span className="t-strong" style={{ fontSize: 14 }}>{nomeDe(u)}</span>
                    {u.is_admin && (
                      <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                        background: 'var(--primary-tint)', color: 'var(--primary)' }}>ADMIN</span>
                    )}
                    <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                      background: 'var(--surface-2)', color: 'var(--text-2)' }}>{r ? r.l : u.role || 'sem acesso'}</span>
                  </div>
                  <div className="t-caption" style={{ fontSize: 11.5, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email ? `${u.email} · último acesso ${fmtData(u.ultimo_acesso)}` : 'sem e-mail'}
                  </div>
                </div>
                <button onClick={() => setEditando(u)} title="Editar" aria-label="Editar"
                  style={{ width: 40, height: 40, border: 0, borderRadius: 10, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>✏️</button>
                <button onClick={() => apagar(u)} title="Apagar" aria-label="Apagar"
                  style={{ width: 40, height: 40, border: 0, borderRadius: 10, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 15, flexShrink: 0 }}>🗑</button>
              </div>
            );
          })}
        </div>

        {usuarios?.length === 0 && !erro && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhum usuário.</div>
        )}
      </div>

      {editando && (
        <UsuarioPopup u={editando} onFechar={() => setEditando(null)}
          onSalvo={() => { setEditando(null); carregar(); }} />
      )}
    </div>
  );
}

// ── Popup de criar / editar ───────────────────────────────────────────────
function UsuarioPopup({ u, onFechar, onSalvo }) {
  const novo = !!u.novo;
  const [email, setEmail] = useState(novo ? '' : (u.email || ''));
  const [senha, setSenha] = useState('');
  const [nome, setNome] = useState(novo ? '' : (u.nome || ''));
  // Login novo nasce visitante (só olha): o admin escolhe mestre ou engenheiro de propósito.
  const [role, setRole] = useState(novo ? 'visitante' : (u.role || 'visitante'));
  const [isAdmin, setIsAdmin] = useState(novo ? false : !!u.is_admin);
  const [salvando, setSalvando] = useState(false);
  const [verSenha, setVerSenha] = useState(false);

  // Editar não exige e-mail: quando a função não consegue ler os logins, o
  // e-mail vem vazio, e antes isso travava o botão Salvar até para trocar o
  // nome ou o tipo. O e-mail só vai no pedido se foi digitado um diferente.
  const senhaOk = novo ? senha.length >= SENHA_MIN : (senha === '' || senha.length >= SENHA_MIN);
  const pronto = novo ? (!!email.trim() && senhaOk) : senhaOk;

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    try {
      if (novo) {
        await chamar('criar', { email: email.trim(), senha, nome: nome.trim() || email.trim(), role, is_admin: isAdmin });
      } else {
        const corpo = { id: u.id, nome: nome.trim(), role, is_admin: isAdmin };
        if (email.trim() && email.trim() !== (u.email || '')) corpo.email = email.trim();
        if (senha) corpo.senha = senha;
        await chamar('atualizar', corpo);
      }
      onSalvo();
    } catch (e) {
      avisarErro(e, novo ? 'criar o usuário' : 'salvar o usuário');
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
      <div style={{ width: '100%', maxWidth: 420, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 20, padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>{novo ? '👤 Novo usuário' : '✏️ Editar usuário'}</div>
          <button onClick={onFechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={rotulo}>E-MAIL {novo ? '*' : '(login)'}</div>
        <input type="email" autoComplete="off" value={email} onChange={e => setEmail(e.target.value)}
          placeholder={`nome@${MARCA.dominioEmail}`} style={{ ...campo, marginBottom: 4 }} />
        {!novo && !u.email && (
          <div className="t-caption" style={{ fontSize: 11, marginBottom: 6, color: 'var(--warn)' }}>
            Não deu para ler o e-mail deste usuário agora. Dá para salvar o nome e o tipo de acesso sem mexer no e-mail.
          </div>
        )}
        <div className="t-caption" style={{ fontSize: 11, marginBottom: 14 }}>
          Com @{MARCA.dominioEmail} a pessoa entra digitando só o nome. Com e-mail de fora
          (gmail, hotmail…), ela precisa digitar o endereço inteiro na tela de login.
        </div>

        <div style={rotulo}>{novo ? 'SENHA *' : 'NOVA SENHA (deixe vazio para manter)'}</div>
        {/* Senha escondida por padrão: quem está ao lado não lê. "Mostrar"
            serve para conferir o que foi digitado antes de passar à pessoa. */}
        <div style={{ position: 'relative', marginBottom: senha && !senhaOk ? 4 : 14 }}>
          <input type={verSenha ? 'text' : 'password'} autoComplete="new-password" value={senha}
            onChange={e => setSenha(e.target.value)}
            placeholder={`pelo menos ${SENHA_MIN} caracteres`} style={{ ...campo, paddingRight: 92 }} />
          <button type="button" onClick={() => setVerSenha(v => !v)}
            aria-label={verSenha ? 'Esconder a senha' : 'Mostrar a senha'}
            style={{ position: 'absolute', right: 4, top: 3, height: 40, minWidth: 80, padding: '0 10px', border: 0, borderRadius: 9,
              background: 'var(--surface)', color: 'var(--primary)', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
            {verSenha ? 'Esconder' : 'Mostrar'}
          </button>
        </div>
        {senha && !senhaOk && (
          <div className="t-caption" style={{ fontSize: 11, marginBottom: 14, color: 'var(--danger)' }}>
            A senha precisa de pelo menos {SENHA_MIN} caracteres.
          </div>
        )}

        <div style={rotulo}>NOME</div>
        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Como aparece no app"
          style={{ ...campo, marginBottom: 14 }} />

        <div style={rotulo}>TIPO DE ACESSO</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {ROLES.map(r => (
            <button key={r.k} onClick={() => setRole(r.k)}
              style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                border: role === r.k ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                background: role === r.k ? 'var(--primary-tint)' : 'var(--surface-2)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: role === r.k ? 'var(--primary)' : 'var(--text-1)' }}>{r.l}</div>
              <div className="t-caption" style={{ fontSize: 11.5, marginTop: 2 }}>{r.desc}</div>
            </button>
          ))}
        </div>

        <button onClick={() => setIsAdmin(v => !v)}
          style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
            padding: '11px 13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
            border: isAdmin ? '2px solid var(--primary)' : '1.5px solid var(--border)',
            background: isAdmin ? 'var(--primary-tint)' : 'var(--surface-2)' }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 13, fontWeight: 900,
            background: isAdmin ? 'var(--primary)' : 'transparent', color: '#fff',
            border: isAdmin ? 'none' : '1px solid var(--border)' }}>✓</span>
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 800, color: isAdmin ? 'var(--primary)' : 'var(--text-1)' }}>Administrador</span>
            <span className="t-caption" style={{ display: 'block', fontSize: 11.5 }}>pode abrir este painel e mexer nos usuários</span>
          </span>
        </button>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onFechar} style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={salvar} disabled={!pronto || salvando}
            style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', fontFamily: 'inherit',
              background: pronto && !salvando ? 'var(--primary)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {salvando ? 'Salvando…' : novo ? 'Criar usuário' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
