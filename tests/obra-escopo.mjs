// Testa o embrulho de obra (fatia 2) com um cliente falso, sem banco.
import { comEscopoDeObra, ehTabelaDaObra, TABELAS_DA_OBRA } from '../src/lib/obra-escopo.js';

let ok = 0, tot = 0;
function t(nome, cond) {
  tot++;
  if (cond) { ok++; } else { console.error('FALHOU:', nome); }
}

// Cliente falso: cada tabela devolve uma cadeia que registra as chamadas.
function clienteFalso(chamadas) {
  function builder(tabela) {
    const obj = {
      select: (...a) => { chamadas.push(['select', tabela, a]); return obj; },
      eq: (col, val) => { chamadas.push(['eq', tabela, [col, val]]); return obj; },
      update: (...a) => { chamadas.push(['update', tabela, a]); return obj; },
      delete: (...a) => { chamadas.push(['delete', tabela, a]); return obj; },
      order: (...a) => { chamadas.push(['order', tabela, a]); return obj; },
      insert: (payload) => { chamadas.push(['insert', tabela, payload]); return obj; },
      upsert: (payload) => { chamadas.push(['upsert', tabela, payload]); return obj; },
    };
    return obj;
  }
  return { from: (tabela) => builder(tabela) };
}

// ── ehTabelaDaObra ──────────────────────────────────────────────────────────
t('rdos é da obra', ehTabelaDaObra('rdos') === true);
t('profiles não é da obra (compartilhada)', ehTabelaDaObra('profiles') === false);
t('empreiteiros não é da obra (compartilhada)', ehTabelaDaObra('empreiteiros') === false);
t('obras não é "da obra" (é a própria tabela de obras)', ehTabelaDaObra('obras') === false);

// Lista exata, não só o tamanho: um nome trocado por engano (typo, tabela
// renomeada) mantém o tamanho em 20 e passaria batido num teste só de
// `.length`. Tem que bater com `tabelas` em
// supabase/migrations/20260921-multiobra-fatia1-preparar.sql.
const TABELAS_ESPERADAS = [
  'ambientes', 'cronograma_itens', 'cronograma_avanco',
  'rdos', 'atividades_rdo', 'efetivo_rdo', 'ocorrencias', 'rdo_fotos',
  'pendencias', 'equipamentos',
  'contratacoes', 'contratacoes_comentarios',
  'projetos', 'projetos_comentarios', 'projetos_dependencias',
  'planta_etapas', 'plantas_visuais', 'planta_marcacoes',
  'reunioes', 'visitas',
].sort();
t('lista de tabelas da obra bate com a da migration, nome a nome',
  JSON.stringify([...TABELAS_DA_OBRA].sort()) === JSON.stringify(TABELAS_ESPERADAS));

// ── select ganha .eq('obra_id', ...) quando há obra escolhida ──────────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-1');
  cliente.from('rdos').select('*').eq('data', '2026-09-22');
  t('select em tabela da obra chama eq(obra_id) logo após o select',
    chamadas[0][0] === 'select' && chamadas[1][0] === 'eq' && chamadas[1][2][0] === 'obra_id' && chamadas[1][2][1] === 'obra-1');
  t('o filtro que a tela pediu continua chegando depois',
    chamadas[2][0] === 'eq' && chamadas[2][2][0] === 'data');
}

// ── sem obra escolhida ainda: não filtra (evita quebrar o boot) ────────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => null);
  cliente.from('rdos').select('*');
  t('sem obra escolhida, select não ganha eq(obra_id)',
    chamadas.length === 1 && chamadas[0][0] === 'select');
}

// ── tabela compartilhada nunca ganha o filtro, mesmo com obra escolhida ────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-1');
  cliente.from('empreiteiros').select('*').order('nome');
  t('tabela compartilhada não ganha eq(obra_id)',
    chamadas.every(c => c[0] !== 'eq'));
}

// ── update e delete também ganham o filtro ─────────────────────────────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-2');
  cliente.from('pendencias').update({ status: 'ok' }).eq('id', 5);
  cliente.from('pendencias').delete().eq('id', 5);
  const eqsUpdate = chamadas.filter(c => c[1] === 'pendencias' && c[0] === 'eq');
  t('update em tabela da obra ganha eq(obra_id)', eqsUpdate.some(c => c[2][0] === 'obra_id' && c[2][1] === 'obra-2'));
}

// ── update FILTRA por obra, não GRAVA obra_id no que a tela mandou ─────────
// Trava a categorização de `update` como método que filtra (não que grava):
// se alguém mover 'update' para METODOS_QUE_GRAVAM_A_OBRA achando que "também
// escreve", o .eq some (passa a poder mudar linha de outra obra) e o payload
// passa a ganhar obra_id — este teste pega as duas coisas.
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-2');
  const payload = { status: 'ok' };
  cliente.from('pendencias').update(payload).eq('id', 5);
  const [, , argsUpdate] = chamadas.find(c => c[0] === 'update');
  t('update não grava obra_id no payload (quem grava é insert/upsert)', argsUpdate[0].obra_id === undefined);
  t('update continua seguido de eq(obra_id) — quem "escreve" sem isso muda obra errada',
    chamadas.some(c => c[0] === 'eq' && c[2][0] === 'obra_id'));
}

// ── insert injeta obra_id no objeto, sem apagar o que a tela mandou ────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-3');
  cliente.from('rdos').insert({ data: '2026-09-22' });
  const [, , payload] = chamadas.find(c => c[0] === 'insert');
  t('insert ganha obra_id', payload.obra_id === 'obra-3');
  t('insert mantém os campos que a tela mandou', payload.data === '2026-09-22');
}

// ── insert em lote injeta obra_id em cada linha ────────────────────────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-4');
  cliente.from('efetivo_rdo').insert([{ nome: 'A' }, { nome: 'B' }]);
  const [, , payload] = chamadas.find(c => c[0] === 'insert');
  t('insert em lote injeta obra_id em cada linha', payload.every(l => l.obra_id === 'obra-4'));
}

// ── upsert também ganha obra_id ─────────────────────────────────────────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-5');
  cliente.from('rdos').upsert({ data: '2026-09-22' }, { onConflict: 'data' });
  const [, , payload] = chamadas.find(c => c[0] === 'upsert');
  t('upsert ganha obra_id', payload.obra_id === 'obra-5');
}

// ── insert em tabela compartilhada não ganha obra_id ───────────────────────
{
  const chamadas = [];
  const cliente = comEscopoDeObra(clienteFalso(chamadas), () => 'obra-6');
  cliente.from('colaboradores').insert({ nome: 'Fulano' });
  const [, , payload] = chamadas.find(c => c[0] === 'insert');
  t('insert em tabela compartilhada não ganha obra_id', payload.obra_id === undefined);
}

console.log(`obra-escopo: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
