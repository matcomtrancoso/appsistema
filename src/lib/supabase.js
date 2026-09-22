import { createClient } from '@supabase/supabase-js';
import { clienteSomenteLeitura, AVISO_VISITANTE } from './visitante.js';
import { clienteDemo } from './demo.js';
import { comEscopoDeObra } from './obra-escopo.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// VITE_DEMO=1 no .env.local: o app roda com dados ficticios, sem banco.
// Serve para ver as telas antes de criar o Supabase e para demonstrar o app.
const clienteReal = import.meta.env.VITE_DEMO === '1'
  ? clienteDemo()
  : createClient(supabaseUrl, supabaseAnonKey);

// Fatia 2 do multi-obra: qual obra está selecionada agora. Fica aqui (e não
// só no Context) porque quem lê é o Proxy abaixo, fora do React. Quem troca é
// sempre src/lib/obra-selecionada.jsx, e sempre ANTES de trocar o estado do
// React — nunca dentro de um efeito — para nenhuma tela consultar o banco com
// a obra errada. Ver obra-escopo.js para o que isso faz com cada tabela.
let obraId = null;
export function definirObraId(id) { obraId = id || null; }
export function obraIdAtual() { return obraId; }
const clienteComObra = comEscopoDeObra(clienteReal, obraIdAtual);

// O app inteiro importa `supabase` uma vez só; para o visitante, trocamos o
// alvo por um cliente que recusa escrita. Um Proxy no meio permite virar essa
// chave depois do login, sem precisar recarregar a página.
let alvo = clienteComObra;
let avisando = false;

export function ativarModoVisitante(ativo) {
  alvo = ativo
    ? clienteSomenteLeitura(clienteComObra, () => {
        if (avisando) return;
        avisando = true;
        setTimeout(() => { avisando = false; }, 1500);
        alert(AVISO_VISITANTE);
      })
    : clienteComObra;
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const v = alvo[prop];
    return typeof v === 'function' ? v.bind(alvo) : v;
  },
});
