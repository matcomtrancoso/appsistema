import { diasSemRdo } from '../src/lib/rdo-lacunas.js';

let ok = 0, tot = 0;
function t(nome, cond) { tot++; if (cond) ok++; else console.error('FALHOU:', nome); }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 2026-09-21 é segunda; 2026-09-27 é domingo.
t('dia sem RDO aparece', igual(diasSemRdo({ existentes: ['2026-09-21', '2026-09-23'], de: '2026-09-21', ate: '2026-09-23' }), ['2026-09-22']));
t('todos preenchidos: nenhuma lacuna', igual(diasSemRdo({ existentes: ['2026-09-21', '2026-09-22'], de: '2026-09-21', ate: '2026-09-22' }), []));
t('domingo não conta como lacuna', igual(diasSemRdo({ existentes: [], de: '2026-09-26', ate: '2026-09-28' }), ['2026-09-26', '2026-09-28']));
t('domingo COM RDO não some nem vira lacuna', igual(diasSemRdo({ existentes: ['2026-09-27'], de: '2026-09-26', ate: '2026-09-28' }), ['2026-09-26', '2026-09-28']));
t('antes do início da obra não é lacuna', igual(diasSemRdo({ existentes: [], de: '2026-09-21', ate: '2026-09-23', inicioObra: '2026-09-23' }), ['2026-09-23']));
t('início da obra antes da janela não corta a janela', igual(diasSemRdo({ existentes: [], de: '2026-09-22', ate: '2026-09-22', inicioObra: '2026-01-01' }), ['2026-09-22']));
t('janela invertida devolve vazio', igual(diasSemRdo({ existentes: [], de: '2026-09-23', ate: '2026-09-21' }), []));
t('vira o mês sem pular dia', igual(diasSemRdo({ existentes: [], de: '2026-09-30', ate: '2026-10-01' }), ['2026-09-30', '2026-10-01']));
t('sem existentes nem datas não quebra', igual(diasSemRdo({}), []));

console.log(`rdo-lacunas: ${ok}/${tot}`);
process.exit(ok === tot ? 0 : 1);
