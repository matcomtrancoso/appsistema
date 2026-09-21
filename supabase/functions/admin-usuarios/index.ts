// Painel de admin do FlowPlanner: criar usuário, trocar e-mail/senha e
// mudar o tipo de acesso.
//
// Isto existe como Edge Function porque essas operações exigem a chave de
// serviço do Supabase, que jamais pode ir para o app no navegador: qualquer
// pessoa leria o bundle e teria controle total do banco. Aqui a chave fica no
// servidor, e toda chamada é conferida: só passa quem está logado E tem
// is_admin = true no próprio perfil.
//
// Erro interno nunca vai cru para a tela: o detalhe fica no log da função
// (painel do Supabase, Edge Functions, admin-usuarios, Logs) e o app recebe
// uma frase em português.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const URL_SB = Deno.env.get('SUPABASE_URL')!;
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Origem aberta de propósito: cada aluno publica o app num endereço diferente.
// Não há cookie; toda chamada exige o token de quem está logado e is_admin.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// visitante: enxerga tudo, não altera nada (a trava real é por política no banco).
const ROLES = ['engenheiro', 'mestre', 'visitante'];
const SENHA_MIN = 8;
const MSG_SENHA = `A senha precisa de pelo menos ${SENHA_MIN} caracteres.`;
const MSG_VISITANTE_ADMIN = 'Visitante não pode ser administrador.';

// Loga o detalhe no servidor e devolve só a frase para a tela.
function falha(onde: string, erro: unknown, frase: string, status = 400) {
  console.error(`admin-usuarios [${onde}]:`, erro);
  return json({ error: frase }, status);
}

// Os erros do login que o admin precisa entender viram frase de obra;
// o resto vira a frase padrão.
function fraseDoAuth(erro: { code?: string; status?: number } | null, padrao: string) {
  const code = erro?.code || '';
  if (code === 'email_exists' || code === 'user_already_exists') return 'Já existe um usuário com esse e-mail.';
  if (code === 'email_address_invalid' || code === 'validation_failed') return 'Esse e-mail não é válido. Confira e tente de novo.';
  if (code === 'weak_password') return MSG_SENHA;
  if (code === 'user_not_found') return 'Usuário não encontrado. Recarregue a lista.';
  return padrao;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ error: 'Sem autenticação.' }, 401);

    // Quem está chamando? (valida o token de verdade, não confia no corpo)
    const comoUsuario = createClient(URL_SB, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: eUser } = await comoUsuario.auth.getUser();
    if (eUser || !user) return json({ error: 'Sessão inválida.' }, 401);

    const admin = createClient(URL_SB, SERVICE);
    const { data: perfil, error: ePerfil } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (ePerfil) return falha('perfil', ePerfil, 'Não consegui conferir o seu acesso. Tente de novo em instantes.', 500);
    if (!perfil?.is_admin) return json({ error: 'Só o administrador pode usar este painel.' }, 403);

    let corpo: Record<string, unknown>;
    try {
      corpo = await req.json();
    } catch {
      return json({ error: 'Pedido inválido.' }, 400);
    }
    const { acao, id, email, senha, nome, role, is_admin } = corpo as {
      acao?: string; id?: string; email?: string; senha?: string; nome?: string; role?: string; is_admin?: boolean;
    };

    if (acao === 'listar') {
      const { data: perfis, error } = await admin.from('profiles').select('*').order('created_at');
      if (error) return falha('listar perfis', error, 'Não consegui carregar a lista de usuários. Tente de novo em instantes.', 500);

      // Os e-mails e o último acesso moram nos logins (Auth). Se essa leitura
      // falhar, a lista sai mesmo assim, sem e-mail, com um aviso para a tela.
      let aviso: string | undefined;
      let logins: { id: string; email?: string; last_sign_in_at?: string; created_at?: string }[] = [];
      try {
        const { data: lista, error: eLista } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        if (eLista) throw eLista;
        logins = lista?.users || [];
      } catch (e) {
        console.error('admin-usuarios [listar logins]:', e);
        aviso = 'Não consegui ler os e-mails dos logins agora. A lista mostra nome e tipo de acesso; dá para editar os dois.';
      }
      const porId = new Map(logins.map((u) => [u.id, u]));
      const usuarios = (perfis || []).map((p) => {
        const u = porId.get(p.id);
        return {
          id: p.id, nome: p.nome, role: p.role, is_admin: p.is_admin,
          email: u?.email || null,
          ultimo_acesso: u?.last_sign_in_at || null,
          criado_em: u?.created_at || p.created_at,
        };
      });
      return json(aviso ? { usuarios, aviso } : { usuarios });
    }

    if (acao === 'criar') {
      if (!email || !senha) return json({ error: 'E-mail e senha são obrigatórios.' }, 400);
      if (String(senha).length < SENHA_MIN) return json({ error: MSG_SENHA }, 400);
      if (role && !ROLES.includes(role)) return json({ error: 'Tipo de acesso inválido.' }, 400);
      // Visitante com poder de admin se anularia: o painel escreve.
      if (role === 'visitante' && is_admin) return json({ error: MSG_VISITANTE_ADMIN }, 400);
      const { data: novo, error } = await admin.auth.admin.createUser({
        email, password: senha, email_confirm: true,
      });
      if (error) return falha('criar login', error, fraseDoAuth(error, 'Não consegui criar o login. Confira o e-mail e tente de novo.'));
      // O gatilho do banco já criou o perfil como visitante; aqui ele ganha o
      // papel escolhido no painel (upsert cobre o caso de o gatilho faltar).
      const { error: eP } = await admin.from('profiles')
        .upsert({ id: novo.user.id, nome: nome || email, role: role || 'visitante', is_admin: !!is_admin });
      if (eP) {
        return falha('criar perfil', eP,
          'O login foi criado, mas não consegui gravar o tipo de acesso. Abra o usuário na lista e salve de novo.');
      }
      return json({ ok: true, id: novo.user.id });
    }

    if (acao === 'atualizar') {
      if (!id) return json({ error: 'Usuário não informado.' }, 400);
      if (role && !ROLES.includes(role)) return json({ error: 'Tipo de acesso inválido.' }, 400);
      if (senha && String(senha).length < SENHA_MIN) return json({ error: MSG_SENHA }, 400);

      // A regra vale para o estado FINAL, não só para o que veio no pedido:
      // um visitante que recebe só is_admin=true também é barrado.
      const { data: atual, error: eAtual } = await admin.from('profiles').select('role, is_admin').eq('id', id).maybeSingle();
      if (eAtual) return falha('ler perfil', eAtual, 'Não consegui ler esse usuário. Tente de novo em instantes.', 500);
      const roleFinal = role ?? atual?.role;
      const adminFinal = is_admin ?? atual?.is_admin ?? false;
      if (roleFinal === 'visitante' && adminFinal) return json({ error: MSG_VISITANTE_ADMIN }, 400);

      // O admin não pode tirar o próprio acesso e ficar sem ninguém no painel.
      if (id === user.id && !adminFinal) {
        return json({ error: 'Você não pode remover o seu próprio acesso de administrador.' }, 400);
      }
      if (id === user.id && roleFinal === 'visitante') {
        return json({ error: 'Você não pode virar visitante: perderia o painel.' }, 400);
      }

      const mudancasAuth: Record<string, unknown> = {};
      if (email) mudancasAuth.email = email;
      if (senha) mudancasAuth.password = senha;
      if (Object.keys(mudancasAuth).length) {
        if (mudancasAuth.email) mudancasAuth.email_confirm = true;
        const { error } = await admin.auth.admin.updateUserById(id, mudancasAuth);
        if (error) return falha('atualizar login', error, fraseDoAuth(error, 'Não consegui trocar o e-mail ou a senha. Tente de novo.'));
      }
      const mudancasPerfil: Record<string, unknown> = {};
      if (nome !== undefined) mudancasPerfil.nome = nome;
      if (role !== undefined) mudancasPerfil.role = role;
      if (is_admin !== undefined) mudancasPerfil.is_admin = !!is_admin;
      if (Object.keys(mudancasPerfil).length) {
        const { error } = await admin.from('profiles').update(mudancasPerfil).eq('id', id);
        if (error) return falha('atualizar perfil', error, 'Não consegui salvar o nome ou o tipo de acesso. Tente de novo.');
      }
      return json({ ok: true });
    }

    if (acao === 'apagar') {
      if (!id) return json({ error: 'Usuário não informado.' }, 400);
      if (id === user.id) return json({ error: 'Você não pode apagar a sua própria conta por aqui.' }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return falha('apagar', error, fraseDoAuth(error, 'Não consegui apagar esse usuário. Tente de novo.'));
      await admin.from('profiles').delete().eq('id', id);
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida.' }, 400);
  } catch (e) {
    return falha('inesperado', e, 'Falha inesperada no painel de admin. Tente de novo em instantes.', 500);
  }
});
