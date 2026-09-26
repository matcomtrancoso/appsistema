import { numeroBR, paiDe, nivel, compararCodigos, lerOrcamento, montarEap, valoresPorCodigo, totalEap, subarvore, proximoCodigo, cronogramaDeEap } from '../src/lib/eap.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── códigos ──
t('pai de 1.2.3 é 1.2', paiDe('1.2.3') === '1.2');
t('pai de primeiro nível é null', paiDe('4') === null);
t('nível', nivel('1') === 1 && nivel('1.2.3') === 3);
t('ordem natural: 1.2 antes de 1.10', ['1.10', '1.2', '2', '1', '1.1'].sort(compararCodigos).join() === '1,1.1,1.2,1.10,2');
t('pai vem antes do filho', compararCodigos('1', '1.1') < 0);

// ── números em português ──
t('R$ com milhar e vírgula', numeroBR('R$ 1.234,56') === 1234.56);
t('vírgula decimal simples', numeroBR('1,5') === 1.5);
t('ponto decimal', numeroBR('1234.5') === 1234.5);
t('ponto de milhar sem vírgula', numeroBR('1.234') === 1234 && numeroBR('1.234.567') === 1234567);
t('vazio é zero', numeroBR('') === 0 && numeroBR(undefined) === 0);
t('texto inválido é NaN', Number.isNaN(numeroBR('abc')));

// ── leitura da planilha ──
const planilha = ['Item\tDescrição\tUn\tQuantidade\tPreço unitário',
  '1\tServiços preliminares\t\t\t',
  '1.1\tLimpeza do terreno\tm²\t250\tR$ 12,50',
  '1.2\tMobilização\tvb\t1\t3.000,00',
  '2\tFundação\t\t\t',
  '2.1\tEscavação\tm³\t80,5\t45'].join('\n');
const r = lerOrcamento(planilha);
t('lê 5 linhas sem erro', r.linhas.length === 5 && r.erros.length === 0);
t('lê quantidade e preço em português', r.linhas[1].quantidade === 250 && r.linhas[1].preco_unitario === 12.5 && r.linhas[4].quantidade === 80.5);
t('sem cabeçalho vale a ordem item, descrição, un, qtd, preço', lerOrcamento('1.1\tLimpeza\tm²\t10\t2').linhas[0].preco_unitario === 2);
t('aceita ponto e vírgula', lerOrcamento('1;Fundação;;;\n1.1;Escavação;m³;10;5').linhas.length === 2);
t('cabeçalho em outra ordem', lerOrcamento('Descrição\tItem\tPreço\tQtd\tUn\nLimpeza\t1.1\t2\t10\tm²').linhas[0].codigo === '1.1');
t('código inválido vira erro com o número da linha', lerOrcamento('1\tA\n1.x\tB').erros[0].startsWith('Linha 2'));
t('código repetido é erro', lerOrcamento('1\tA\n1\tB').erros.some(e => e.includes('duas vezes')));
t('descrição faltando é erro', lerOrcamento('1\t\tm²\t1\t1').erros.length === 1);
t('preço inválido é erro', lerOrcamento('1\tA\tm²\t1\tabc').erros.length === 1);
t('texto sem colunas avisa', lerOrcamento('só uma linha solta').erros.length === 1);
t('vazio avisa', lerOrcamento('  ').erros.length === 1);
t('código com ponto no fim é aceito (1.)', lerOrcamento('1.\tGrupo').linhas[0].codigo === '1');

// ── árvore ──
const { linhas: eap, avisos } = montarEap(r.linhas);
t('grupo é quem tem filhos', eap.find(l => l.codigo === '1').is_grupo && !eap.find(l => l.codigo === '1.1').is_grupo);
t('pai preenchido', eap.find(l => l.codigo === '2.1').pai_codigo === '2');
t('sem aviso quando tudo veio na planilha', avisos.length === 0);
t('ordem sequencial pela árvore', igual(eap.map(l => l.ordem), [1, 2, 3, 4, 5]));

const faltando = montarEap(lerOrcamento('1.1.1\tServiço fundo\tm\t2\t10').linhas);
t('pais que faltam na planilha são criados como grupo, com aviso', faltando.linhas.map(l => l.codigo).join() === '1,1.1,1.1.1' && faltando.avisos.length === 2);
const valorEmGrupo = montarEap(lerOrcamento('1\tGrupo\tm\t5\t5\n1.1\tFilho\tm\t1\t1').linhas);
t('valor digitado em grupo é ignorado, com aviso', valorEmGrupo.linhas[0].quantidade === 0 && valorEmGrupo.avisos.length === 1);

// ── valores ──
const v = valoresPorCodigo(eap);
t('folha = quantidade × preço', v.get('1.1') === 3125 && v.get('1.2') === 3000);
t('grupo = soma dos filhos', v.get('1') === 6125);
t('grupo de outro ramo', v.get('2') === 3622.5);
t('total = soma do primeiro nível', totalEap(eap) === 9747.5);
t('total de lista vazia é zero', totalEap([]) === 0);
t('grupo dentro de grupo soma por baixo',
  totalEap(montarEap(lerOrcamento('1\tA\n1.1\tB\n1.1.1\tC\tm\t2\t10\n1.1.2\tD\tm\t1\t5\n1.2\tE\tm\t1\t100').linhas).linhas) === 125);

// ── edição ──
t('subárvore traz a linha e os descendentes, não o vizinho 1.10', igual(subarvore([{ codigo: '1' }, { codigo: '1.1' }, { codigo: '1.10' }, { codigo: '10' }], '1').map(l => l.codigo), ['1', '1.1', '1.10']));
t('próximo código sob um pai', proximoCodigo(eap, '1') === '1.3');
t('próximo código no primeiro nível', proximoCodigo(eap, null) === '3');
t('próximo código sob pai sem filhos', proximoCodigo(eap, '2.1') === '2.1.1');
t('próximo código com lista vazia', proximoCodigo([], null) === '1');

// ── cronograma ──
const comId = eap.map((l, i) => ({ ...l, id: 'e' + (i + 1) }));
const c1 = cronogramaDeEap(comId, []);
t('uma tarefa por linha, em ordem', c1.itens.length === 5 && c1.itens[0].nome === '1 Serviços preliminares');
t('numera de 1 em diante', igual(c1.itens.map(i => i.wbs_id), [1, 2, 3, 4, 5]));
t('filho aponta para o wbs do pai', c1.itens[1].pai_wbs_id === 1 && c1.itens[4].pai_wbs_id === 4);
t('grupo vira grupo', c1.itens[0].is_grupo === true && c1.itens[1].is_grupo === false);
t('guarda de que linha nasceu', c1.itens[2].orcamento_eap_id === 'e3');
const c2 = cronogramaDeEap(comId, [{ wbs_id: 10, orcamento_eap_id: 'e1' }, { wbs_id: 11, orcamento_eap_id: 'e2' }]);
t('não recria o que já está ligado', c2.itens.length === 3 && c2.itens[0].orcamento_eap_id === 'e3');
t('continua depois do maior wbs existente', c2.itens[0].wbs_id === 12);
t('novo filho de pai já ligado aponta para o wbs do pai existente', c2.itens[0].pai_wbs_id === 10);
const c3 = cronogramaDeEap(comId, [{ wbs_id: 50, orcamento_eap_id: null }]);
t('cronograma importado (sem ligação) não é tocado: números continuam depois dele', c3.itens[0].wbs_id === 51 && c3.itens.length === 5);
t('tudo ligado: nada a criar', cronogramaDeEap(comId, comId.map((l, i) => ({ wbs_id: i + 1, orcamento_eap_id: l.id }))).itens.length === 0);

console.log(`eap: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
