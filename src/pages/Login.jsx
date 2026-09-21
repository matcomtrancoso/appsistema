import { MARCA } from '../marca.js';
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { msgAmigavel } from '../lib/msg-amigavel';

// Quem é da obra digita só o usuário e o domínio da casa entra sozinho. Quem
// tem e-mail de fora digita o endereço inteiro — o @ decide. Sem isso,
// "fulano@hotmail.com" virava "fulano@hotmail.com@<dominio>" e o
// login nunca achava a conta.
const toEmail = (login) => {
  const t = login.trim().toLowerCase();
  return t.includes('@') ? t : `${t}@${MARCA.dominioEmail}`;
};

const FEATURES = [
  {
    label: 'RDO diário simplificado',
    icon: (
      <svg viewBox="0 0 24 24">
        <rect x="9" y="2" width="6" height="4" rx="1" />
        <path d="M8 6h8v16a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6z" />
        <path d="M9 11h6M9 15h4" />
      </svg>
    ),
  },
  {
    label: 'Gestão de equipe e obra',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
  },
  {
    label: 'Visão rápida de indicadores',
    icon: (
      <svg viewBox="0 0 24 24">
        <path d="M23 6l-9.5 9.5-5-5L1 18" />
        <path d="M17 6h6v6" />
      </svg>
    ),
  },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const email = toEmail(username);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      // Sem internet não é senha errada: dizer "senha incorreta" com a rede
      // fora fazia a pessoa trocar de senha à toa.
      const t = error.message || '';
      setError(/email not confirmed/i.test(t)
        ? 'Este e-mail ainda não foi confirmado. Fale com o administrador da obra.'
        : (error.status === 400 || /invalid login/i.test(t))
          ? 'Usuário ou senha incorretos.'
          : msgAmigavel(error, 'entrar'));
      setLoading(false);
    }
  };

  return (
    <div className="app login-shell">

      {/* ── Painel de marca: computador ── */}
      {/* A marca é o ícone do app (o mesmo da aba e do atalho do celular, em
          public/) e o nome da empresa de src/marca.js. Não depende de nenhuma
          imagem extra: antes era um logo-full.png que não vinha no pacote e
          aparecia quebrado na primeira tela. Quem gera os próprios ícones com
          "npm run icones" vê a própria logo aqui também. */}
      <aside className="login-brand login-enter">
        <div className="login-brand-photo" aria-hidden />
        <div className="login-brand-deco" aria-hidden />
        <div className="login-brand-content">
          <div className="login-brand-logo">
            <img src="/icon-192.png" alt="" width="56" height="56" />
            <span>{MARCA.nome}</span>
          </div>
          <p className="login-brand-tagline">
            RDO, equipe e indicadores num lugar só, pensado para quem vive o canteiro.
          </p>
          <div className="login-brand-features">
            {FEATURES.map(({ label, icon }) => (
              <div key={label} className="login-brand-feature">
                {icon}
                {label}
              </div>
            ))}
          </div>
        </div>
        <div className="login-brand-bar" aria-hidden />
      </aside>

      {/* ── Marca no topo: só no celular ── */}
      <div className="login-mobile-header">
        <img src="/icon-192.png" alt="" width="52" height="52" />
        <span>{MARCA.nome}</span>
      </div>

      {/* ── Formulário ── */}
      <main className="login-main login-enter">
        <div className="login-main-inner">

          <div className="login-greeting">
            <div className="login-greeting-title">Bem-vindo de volta</div>
            <div className="login-greeting-sub">Entre com seu usuário da obra, ou com seu e-mail completo</div>
          </div>

          <div className="login-card">
            <form onSubmit={handleLogin} className="stack stack-3">
              <div className="stack stack-1">
                <label className="t-micro" htmlFor="login-user">Usuário ou e-mail</label>
                <input
                  id="login-user"
                  className="ipt"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ex.: joao, ou o seu e-mail completo"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="stack stack-1">
                <label className="t-micro" htmlFor="login-pass">Senha</label>
                <input
                  id="login-pass"
                  className="ipt"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              {error && (
                <div role="alert" className="login-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
              >
                {loading ? 'Entrando…' : 'Entrar'}
              </button>
            </form>
          </div>

          <p className="login-footer">
            Problemas de acesso? Fale com o administrador da obra.
          </p>

        </div>
      </main>

    </div>
  );
}
