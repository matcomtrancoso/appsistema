import { createClient } from '@supabase/supabase-js';
import { clienteSomenteLeitura, AVISO_VISITANTE } from './visitante.js';
import { clienteDemo } from './demo.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// VITE_DEMO=1 no .env.local: o app roda com dados ficticios, sem banco.
// Serve para ver as telas antes de criar o Supabase e para demonstrar o app.
const clienteReal = import.meta.env.VITE_DEMO === '1'
  ? clienteDemo()
  : createClient(supabaseUrl, supabaseAnonKey);

// O app inteiro importa `supabase` uma vez só; para o visitante, trocamos o
// alvo por um cliente que recusa escrita. Um Proxy no meio permite virar essa
// chave depois do login, sem precisar recarregar a página.
let alvo = clienteReal;
let avisando = false;

export function ativarModoVisitante(ativo) {
  alvo = ativo
    ? clienteSomenteLeitura(clienteReal, () => {
        if (avisando) return;
        avisando = true;
        setTimeout(() => { avisando = false; }, 1500);
        alert(AVISO_VISITANTE);
      })
    : clienteReal;
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const v = alvo[prop];
    return typeof v === 'function' ? v.bind(alvo) : v;
  },
});
