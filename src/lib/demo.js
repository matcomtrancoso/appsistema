// Modo demonstração: o app inteiro rodando sem banco nenhum.
//
// Serve para duas coisas: ver as telas antes de criar o Supabase, e mostrar o
// app para alguém sem pedir login. Nada aqui vai para produção — basta apagar
// VITE_DEMO do .env.local que o app volta a falar com o banco de verdade.
//
// A ideia é simples: devolver, para cada tabela, uma lista fictícia pronta.
// Os filtros (.eq, .in, .gte…) são aceitos e ignorados — a lista volta
// inteira. Para olhar layout isso basta, e mantém este arquivo pequeno.

import { DADOS_DEMO, PERFIL_DEMO } from './demo-dados.js';

const SESSAO = {
  access_token: 'demo',
  expires_at: Math.floor(Date.now() / 1000) + 86400,
  user: { id: PERFIL_DEMO.id, email: PERFIL_DEMO.email },
};

// Consulta encadeável: aceita qualquer método do PostgREST e resolve na lista
// da tabela. É "thenable", então `await supabase.from('x').select()` funciona.
function consulta(tabela) {
  const estado = {
    linhas: (DADOS_DEMO[tabela] || []).map(l => ({ ...l })),
    unico: false,
  };

  const resolver = (resolve, reject) => {
    const valor = estado.unico ? (estado.linhas[0] ?? null) : estado.linhas;
    return Promise.resolve({ data: valor, error: null, count: estado.linhas.length })
      .then(resolve, reject);
  };

  const encadeavel = new Proxy({ then: resolver }, {
    get(alvo, prop) {
      if (prop === 'then') return resolver;

      if (prop === 'single' || prop === 'maybeSingle') {
        return () => { estado.unico = true; return encadeavel; };
      }
      // No demo nada persiste, mas insert/update/delete devolvem o mesmo
      // formato para o `.select()` que costuma vir depois não quebrar.
      if (prop === 'insert' || prop === 'upsert') {
        return (payload) => {
          const arr = Array.isArray(payload) ? payload : [payload];
          estado.linhas = arr.map((l, i) => ({ id: `demo-${Date.now()}-${i}`, ...l }));
          return encadeavel;
        };
      }
      if (prop === 'update' || prop === 'delete') {
        return () => { estado.linhas = []; return encadeavel; };
      }
      // select, eq, in, order, limit, or, not, is… seguem a corrente
      return () => encadeavel;
    },
  });

  return encadeavel;
}

export function clienteDemo() {
  return {
    from: (tabela) => consulta(tabela),

    auth: {
      onAuthStateChange(callback) {
        setTimeout(() => callback('SIGNED_IN', SESSAO), 0);
        return { data: { subscription: { unsubscribe() {} } } };
      },
      getUser: async () => ({ data: { user: SESSAO.user }, error: null }),
      signInWithPassword: async () => ({ data: { session: SESSAO }, error: null }),
      signOut: async () => ({ error: null }),
    },

    // Painel de admin no demo: a lista sai dos perfis fictícios; criar,
    // salvar e apagar fingem que deu certo (nada persiste no demo).
    functions: {
      invoke: async (_nome, { body } = {}) => {
        if (body?.acao !== 'listar') return { data: { ok: true }, error: null };
        const perfis = [
          ...(DADOS_DEMO.profiles || []),
          { id: 'demo-mestre', nome: 'Paulo', role: 'mestre', is_admin: false, email: 'paulo@flowplanner.app' },
          { id: 'demo-visita', nome: 'Ana', role: 'visitante', is_admin: false, email: 'ana@flowplanner.app' },
        ];
        const usuarios = perfis.map(p => ({
          id: p.id, nome: p.nome, role: p.role, is_admin: !!p.is_admin,
          email: p.email, ultimo_acesso: new Date().toISOString(),
        }));
        return { data: { usuarios }, error: null };
      },
    },

    storage: {
      from: () => ({
        getPublicUrl: (caminho) => ({ data: { publicUrl: `/demo/${caminho}` } }),
        upload: async () => ({ data: { path: 'demo' }, error: null }),
        remove: async () => ({ data: [], error: null }),
      }),
    },

    channel() {
      const canal = { on: () => canal, subscribe: () => canal, unsubscribe: () => {} };
      return canal;
    },
    removeChannel() {},
  };
}
