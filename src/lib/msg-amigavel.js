// Erro em português de obra.
//
// O banco, a internet e o Supabase respondem em inglês técnico ("TypeError:
// Failed to fetch", "new row violates row-level security policy…"). Quem está
// no canteiro precisa saber só duas coisas: o que não deu certo e o que fazer.
// Este arquivo traduz os casos comuns; o erro original continua no console
// (F12) para quem for investigar.
//
// Uso:
//   avisarErro(error, 'salvar o fornecedor')   → mostra o alerta
//   msgAmigavel(error, 'salvar')               → devolve o texto, para pôr na tela
//   motivoAmigavel(error)                      → só o motivo, sem "Não consegui…"
//
// Sem imports de propósito: roda no Node, no teste, sem navegador.

// O mesmo texto de src/lib/visitante.js. Repetido aqui para este arquivo não
// depender de nada.
const AVISO_VISITANTE = 'Modo visitante: você pode ver tudo, mas não alterar.';

const SEM_INTERNET = 'Sem internet agora. Confira a conexão e tente de novo.';

// Cada regra: [teste, motivo]. A primeira que bater vale.
const REGRAS = [
  [(e, t) => e.code === 'SEM_RESPOSTA' || /timed? ?out|tempo esgotado/i.test(t),
    'O servidor não respondeu. Confira a internet e tente de novo.'],
  [(e, t) => /failed to fetch|networkerror|network request failed|load failed|failed to send a request|err_internet|fetch failed|err_network/i.test(t)
    || (typeof navigator !== 'undefined' && navigator.onLine === false),
    SEM_INTERNET],
  [(e, t) => ['PGRST301', 'PGRST303'].includes(e.code) || e.status === 401
    || /jwt expired|invalid jwt|refresh token|session_not_found|auth session missing|sessão inválida|sem autenticação/i.test(t),
    'Sua sessão venceu. Saia da conta e entre de novo.'],
  [(e, t) => e.code === '42501' || e.status === 403
    || /row-level security|permission denied|só o administrador/i.test(t),
    'Seu acesso não permite essa alteração. Fale com o administrador da obra.'],
  [(e, t) => ['22007', '22008', '22P02', '22003'].includes(e.code)
    || /invalid input syntax|out of range|invalid date/i.test(t),
    'Algum campo está com formato inválido (data ou número). Confira e tente de novo.'],
  [(e, t) => e.code === '23505' || /duplicate key|already been registered|already exists/i.test(t),
    'Já existe um cadastro igual a este.'],
  [(e, t) => e.code === '23503' || /foreign key/i.test(t),
    'Este item está ligado a outros registros da obra. Tire o vínculo antes.'],
  [(e, t) => e.code === '23502' || /null value in column/i.test(t),
    'Falta preencher um campo obrigatório.'],
  [(e, t) => e.status === 413 || /payload too large|maximum allowed size|entity too large/i.test(t),
    'O arquivo é grande demais. Escolha um menor.'],
  [(e, t) => /password should be at least|weak password/i.test(t),
    'A senha é curta ou fácil demais. Use uma senha maior.'],
  [(e, t) => /unable to validate email|invalid email|email address.*invalid/i.test(t),
    'O e-mail está em formato inválido.'],
];

function textoDo(erro) {
  if (!erro) return '';
  if (typeof erro === 'string') return erro;
  return [erro.message, erro.details, erro.hint, erro.error_description, erro.name]
    .filter(Boolean).join(' ');
}

// Só o motivo. Mensagem que o próprio app escreveu em português (marcada com
// paraUsuario) passa como veio.
export function motivoAmigavel(erro) {
  if (!erro) return 'Tente de novo em instantes.';
  const e = typeof erro === 'string' ? { message: erro } : erro;
  const t = textoDo(erro);
  if (e.code === 'VISITANTE' || t.includes(AVISO_VISITANTE)) return AVISO_VISITANTE;
  for (const [bate, motivo] of REGRAS) {
    if (bate(e, t)) return motivo;
  }
  if (e.paraUsuario && e.message) return e.message;
  return 'Tente de novo em instantes. Se continuar, avise o administrador da obra.';
}

// Frase inteira: "Não consegui salvar. Sem internet agora…"
export function msgAmigavel(erro, acao = 'salvar') {
  const motivo = motivoAmigavel(erro);
  if (motivo === AVISO_VISITANTE) return motivo;
  return `Não consegui ${acao}. ${motivo}`;
}

// Mostra o alerta. O visitante já recebeu o aviso na hora em que tentou
// escrever (src/lib/supabase.js); repetir seria o alerta duplo.
export function avisarErro(erro, acao = 'salvar') {
  console.error(`[erro ao ${acao}]`, erro);
  const e = typeof erro === 'string' ? { message: erro } : (erro || {});
  if (e.code === 'VISITANTE' || textoDo(erro).includes(AVISO_VISITANTE)) return;
  window.alert(msgAmigavel(erro, acao));
}

// Espera a resposta do banco por no máximo `ms`. No canteiro a internet cai no
// meio do pedido e ele pode ficar pendurado; sem prazo, o botão ficava preso
// em "Salvando…" para sempre. Devolve sempre { data, error }.
export function comPrazo(consulta, ms = 20000) {
  let relogio;
  const prazo = new Promise(resolve => {
    relogio = setTimeout(() => resolve({ data: null, error: { code: 'SEM_RESPOSTA', message: 'tempo esgotado' } }), ms);
  });
  const resposta = Promise.resolve(consulta).then(
    r => r || { data: null, error: null },
    e => ({ data: null, error: e }),
  );
  return Promise.race([resposta, prazo]).finally(() => clearTimeout(relogio));
}
