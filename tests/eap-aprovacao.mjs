import { numeroBR, orcamentoAprovado, podeReabrirOrcamento, podeSubstituirOrcamento, linhasVisiveis } from '../src/lib/eap.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const aprov = { aprovado_em: '2026-09-01', valor_aprovado: 10 };
t('aprovado = tem data de aprovação', orcamentoAprovado(aprov) && !orcamentoAprovado({ valor_aprovado: 10 }) && !orcamentoAprovado(null));
t('reabre aprovado sem medição', podeReabrirOrcamento({ contrato: aprov, medicoes: [] }).ok === true);
t('não reabre com medição (mesmo aberta)', podeReabrirOrcamento({ contrato: aprov, medicoes: [{ id: 'm', status: 'aberta' }] }).ok === false);
t('não reabre o que não está aprovado', podeReabrirOrcamento({ contrato: null }).ok === false);
t('substitui rascunho limpo', podeSubstituirOrcamento({ contrato: null }).ok === true);
t('não substitui aprovado', podeSubstituirOrcamento({ contrato: aprov }).ok === false);
t('não substitui com medição', podeSubstituirOrcamento({ contrato: null, medicoes: [{}] }).ok === false);
t('não substitui com cronograma gerado', podeSubstituirOrcamento({ contrato: null, tarefasLigadas: 3 }).ok === false);

const arv = [{ codigo: '1' }, { codigo: '1.1' }, { codigo: '1.1.1' }, { codigo: '1.2' }, { codigo: '2' }];
t('recolher 1.1 esconde só o que está dentro dele', igual(linhasVisiveis(arv, new Set(['1.1'])).map(l => l.codigo), ['1', '1.1', '1.2', '2']));
t('recolher 1 esconde todos os descendentes', igual(linhasVisiveis(arv, new Set(['1'])).map(l => l.codigo), ['1', '2']));
t('nada recolhido mostra tudo', linhasVisiveis(arv, new Set()).length === 5);

// número com ponto decimal e zero na frente nunca é milhar
t('0.125 é 0,125 (não 125)', numeroBR('0.125') === 0.125);
t('1.500 continua milhar em português', numeroBR('1.500') === 1500);
t('1.234,56 e 0,5', numeroBR('1.234,56') === 1234.56 && numeroBR('0,5') === 0.5);

console.log(`eap-aprovacao: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
