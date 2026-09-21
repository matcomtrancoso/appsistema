// Modo visitante: somente leitura.
//
// A trava de verdade está no banco (políticas RESTRICTIVE por tabela e no
// storage) — esconder botão não impede ninguém de mandar um update pela API.
// O que este arquivo faz é evitar que o app tente escrever e devolva um erro
// feio de permissão: aqui a escrita para antes de sair, com um aviso claro.
//
// Sem imports de propósito: roda no Node, no teste, sem banco.

export const AVISO_VISITANTE = 'Modo visitante: você pode ver tudo, mas não alterar.';

const ESCRITA = ['insert', 'update', 'upsert', 'delete'];

// Devolve um objeto no mesmo formato do supabase-js ({ data, error }) e que
// também aceita .select()/.eq()/.single() encadeados, para o chamador não
// quebrar no meio da cadeia.
function recusa() {
  const resultado = { data: null, error: { message: AVISO_VISITANTE, code: 'VISITANTE' } };
  const encadeavel = new Proxy(resultado, {
    get(alvo, prop) {
      if (prop === 'then') return (fn) => Promise.resolve(resultado).then(fn);
      if (prop in alvo) return alvo[prop];
      return () => encadeavel;   // .select().eq().single()… continuam válidos
    },
  });
  return encadeavel;
}

// Embrulha o cliente do Supabase para o perfil visitante.
export function clienteSomenteLeitura(cliente, aoTentarEscrever) {
  const barrar = (alvo, nome) => new Proxy(alvo, {
    get(o, prop) {
      const v = o[prop];
      if (typeof prop === 'string' && ESCRITA.includes(prop)) {
        return (...args) => {
          console.warn(`Escrita bloqueada (visitante): ${nome}.${prop}`, args?.[0]);
          aoTentarEscrever?.();
          return recusa();
        };
      }
      if (typeof v === 'function') {
        return (...args) => {
          const r = v.apply(o, args);
          return r && typeof r === 'object' ? barrar(r, nome) : r;
        };
      }
      return v;
    },
  });

  return new Proxy(cliente, {
    get(o, prop) {
      if (prop === 'from') return (tabela) => barrar(o.from(tabela), tabela);
      if (prop === 'storage') {
        return new Proxy(o.storage, {
          get(st, p) {
            if (p === 'from') return (bucket) => new Proxy(st.from(bucket), {
              get(b, m) {
                if (['upload', 'remove', 'move', 'copy', 'update'].includes(m)) {
                  return (...args) => {
                    console.warn(`Arquivo bloqueado (visitante): ${bucket}.${String(m)}`, args?.[0]);
                    aoTentarEscrever?.();
                    return Promise.resolve({ data: null, error: { message: AVISO_VISITANTE } });
                  };
                }
                const v = b[m];
                return typeof v === 'function' ? v.bind(b) : v;
              },
            });
            const v = st[p];
            return typeof v === 'function' ? v.bind(st) : v;
          },
        });
      }
      const v = o[prop];
      return typeof v === 'function' ? v.bind(o) : v;
    },
  });
}
