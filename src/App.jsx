import { useEffect, useState, Component, lazy, Suspense } from 'react';
import { supabase, ativarModoVisitante } from './lib/supabase';
import { ObraProvider } from './lib/ObraContext';
import Login from './pages/Login';

// Ninguém "fecha" um app no celular — só troca de tela. Quando a pessoa volta
// na manhã seguinte, o navegador restaura a página como estava ONTEM: dado
// velho e, se houve deploy, código velho. Nenhuma tela escuta isso hoje.
// Recarregar quando a aba volta depois de muito tempo escondida resolve os
// dois de uma vez. A régua de 1h é o seguro contra perder digitação: ninguém
// esconde o app por uma hora no meio de um formulário.
const OCULTO_MAX_MS = 60 * 60 * 1000;
let escondidoDesde = null;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { escondidoDesde = Date.now(); return; }
  if (escondidoDesde && Date.now() - escondidoDesde > OCULTO_MAX_MS) {
    window.location.reload();
  }
  escondidoDesde = null;
});

// O rascunho do efetivo grava uma chave por dia (cre_efetivo_<data>) e nada
// apagava as antigas: o localStorage só crescia. O que vale é o efetivo_draft
// no servidor; a chave local é só amortecedor do dia — 14 dias cobre qualquer
// retroativo e o resto é lixo.
try {
  const corte = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('cre_efetivo_')) continue;
    const dataDaChave = k.slice(-10);   // sempre termina em YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(dataDaChave) && dataDaChave < corte) localStorage.removeItem(k);
  }
} catch { /* localStorage indisponível não pode derrubar o app */ }

// Carrega apenas o código do perfil logado (mestre OU engenheiro), não os dois.
const AppMestre = lazy(() => import('./pages/AppMestre'));
const AppEngenheiro = lazy(() => import('./pages/AppEngenheiro'));

// Faixa fixa: quem está de visita precisa saber por que nada salva.
function FaixaVisitante() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9000,
      background: '#B45309', color: '#fff', textAlign: 'center',
      fontSize: 11.5, fontWeight: 800, letterSpacing: '.03em',
      padding: '3px 10px', pointerEvents: 'none',
    }}>
      👁 MODO VISITANTE · somente leitura
    </div>
  );
}

function TelaCarregando({ texto = 'Carregando…' }) {
  return (
    <div className="boot-screen">
      <div className="boot-logo">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="9 22 9 12 15 12 15 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="boot-spinner" />
      <div className="boot-text">{texto}</div>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info?.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100dvh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 16,
          background: 'var(--bg)', padding: 24, textAlign: 'center',
        }}>
          <div style={{ fontSize: 36 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>
            Algo deu errado
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 280 }}>
            {this.state.error?.message || 'Erro inesperado. Tente recarregar a página.'}
          </div>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload(); }}
            style={{
              marginTop: 8, height: 46, padding: '0 28px',
              borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'var(--primary)', color: '#fff',
              fontSize: 15, fontWeight: 800,
            }}
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = carregando
  const [profile, setProfile] = useState(null);
  const [profileTimeout, setProfileTimeout] = useState(false); // true se demorou demais


  async function fetchProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn('fetchProfile falhou (sera tentado novamente apos refresh):', error.message);
      return;
    }
    setProfileTimeout(false);
    // Antes de a primeira tela montar: a partir daqui todo insert/update/delete
    // do visitante para no cliente, com aviso, em vez de bater no banco e
    // voltar erro de permissão.
    ativarModoVisitante(data?.role === 'visitante');
    setProfile(data);
  }
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session ?? null);

      if (session) {
        const tokenExpired = session.expires_at
          ? session.expires_at * 1000 < Date.now()
          : false;

        if (!tokenExpired) {
          fetchProfile(session.user.id);
        }
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session && !profile) {
      const t = setTimeout(() => setProfileTimeout(true), 8000);
      return () => clearTimeout(t);
    }
  }, [session, profile]);

  if (session === undefined) {
    return <TelaCarregando />;
  }

  if (!session) return <Login />;

  if (!profile) {
    if (!profileTimeout) return <TelaCarregando texto="Carregando perfil…" />;
    return (
      <div className="boot-screen">
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text, #12343B)' }}>
          Sessão expirada
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-3, #7D9296)' }}>
          Sua sessão expirou. Entre de novo para continuar.
        </div>
        <button
          onClick={() => supabase.auth.signOut({ scope: 'local' })}
          style={{
            marginTop: 4, height: 46, padding: '0 28px',
            borderRadius: 12, border: 'none', cursor: 'pointer',
            background: 'var(--primary, #087B8B)', color: '#fff',
            fontSize: 15, fontWeight: 800,
          }}
        >
          Fazer login novamente
        </button>
      </div>
    );
  }

  if (profile.role === 'mestre')      return <ErrorBoundary><Suspense fallback={<TelaCarregando />}><ObraProvider profile={profile}><AppMestre profile={profile} /></ObraProvider></Suspense></ErrorBoundary>;
  // Visitante usa a casca da engenharia (enxerga tudo), mas o cliente do
  // Supabase já está em modo somente leitura e o banco recusa escrita.
  if (profile.role === 'visitante')   return <ErrorBoundary><Suspense fallback={<TelaCarregando />}><ObraProvider profile={profile}><FaixaVisitante /><AppEngenheiro profile={profile} /></ObraProvider></Suspense></ErrorBoundary>;
  if (profile.role === 'engenheiro')  return <ErrorBoundary><Suspense fallback={<TelaCarregando />}><ObraProvider profile={profile}><AppEngenheiro profile={profile} /></ObraProvider></Suspense></ErrorBoundary>;

  return (
    <div style={{
      height: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 12,
      background: 'var(--bg)', padding: 24, textAlign: 'center',
    }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-1)' }}>
        Seu acesso ainda não foi liberado.
      </div>
      <div style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 320, lineHeight: 1.5 }}>
        Peça ao administrador da obra para definir o seu tipo de usuário: engenharia, mestre ou visitante.
      </div>
      <button
        onClick={() => supabase.auth.signOut({ scope: 'local' })}
        style={{ marginTop: 8, minHeight: 40, padding: '0 16px', fontSize: 13, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
      >
        Sair
      </button>
    </div>
  );
}
