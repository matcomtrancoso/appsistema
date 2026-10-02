import { lerOrcamento, montarEap, mesclarOrcamento } from '../src/lib/eap.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }

// orçamento que já existe no banco (com id), como a tela carrega
const atuais = montarEap(lerOrcamento([
  '1\tPreliminares\t\t\t',
  '1.1\tLimpeza\tm²\t250\t12,50',
  '2\tFundação\t\t\t',
  '2.1\tEscavação\tm³\t80\t45',
].join('\n')).linhas).linhas.map((l, i) => ({ ...l, id: `id${i + 1}` }));
const plan = (linhas) => lerOrcamento(linhas.join('\n')).linhas;

// ── serviço novo no escopo ──
const m1 = mesclarOrcamento(atuais, plan([
  '1.1\tLimpeza\tm²\t250\t12,50',
  '2.1\tEscavação\tm³\t80\t45',
  '2.2\tReaterro\tm³\t30\t20',
  '3\tEstrutura\t\t\t',
  '3.1\tConcreto\tm³\t12\t900',
]));
t('só os códigos novos entram: 2.2, 3 e 3.1', m1.novas.map(l => l.codigo).join() === '2.2,3,3.1');
t('quem não mudou conta como igual (e grupo não conta como mudança)', m1.alteradas.length === 0 && m1.iguais === 4);
t('o grupo novo 3 nasce grupo e o 3.1 é folha com pai 3', m1.novas.find(l => l.codigo === '3').is_grupo && m1.novas.find(l => l.codigo === '3.1').pai_codigo === '3');
t('as linhas que já existem não aparecem como novas (mantêm o id)', !m1.novas.some(l => ['1', '1.1', '2', '2.1'].includes(l.codigo)));

// ── a planilha traz outra quantidade/preço ──
const m2 = mesclarOrcamento(atuais, plan(['1.1\tLimpeza do terreno\tm²\t300\t12,50', '2.1\tEscavação\tm³\t80\t45']));
t('quantidade e descrição diferentes viram alteração com o id da linha', m2.alteradas.length === 1 && m2.alteradas[0].id === 'id2' && m2.alteradas[0].depois.quantidade === 300 && m2.alteradas[0].depois.descricao === 'Limpeza do terreno');
t('o que a planilha não cita fica como está (não apaga)', m2.ficam === 2 && m2.novas.length === 0);
const m3 = mesclarOrcamento(atuais, plan(['1.1\tLimpeza do terreno\tm²\t300\t12,50']), { atualizar: false });
t('sem "atualizar", linha existente não muda', m3.alteradas.length === 0 && m3.novas.length === 0);

// ── planilha igual: nada a fazer ──
const m4 = mesclarOrcamento(atuais, plan(['1.1\tLimpeza\tm²\t250\t12,50']));
t('planilha igual ao que já está: nada novo, nada alterado', m4.novas.length === 0 && m4.alteradas.length === 0);
t('preço 12,5 do banco = 12,50 da planilha (comparação numérica)', mesclarOrcamento(atuais.map(l => l.codigo === '1.1' ? { ...l, preco_unitario: '12.5', quantidade: '250.000' } : l), plan(['1.1\tLimpeza\tm²\t250\t12,50'])).alteradas.length === 0);

// ── filho novo debaixo de uma linha que era folha ──
const m5 = mesclarOrcamento(atuais, plan(['1.1.1\tLimpeza manual\tm²\t50\t10']));
const virou = m5.alteradas.find(a => a.codigo === '1.1');
t('folha que ganha filho vira grupo (avisado) e o filho entra', !!virou && virou.virouGrupo && virou.depois.quantidade === 0 && m5.novas.length === 1 && m5.novas[0].codigo === '1.1.1');
t('o aviso de valor ignorado vem junto', m5.avisos.some(a => a.includes('1.1')));

console.log(`eap-mesclar: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
