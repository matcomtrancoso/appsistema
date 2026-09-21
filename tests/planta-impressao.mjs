// A planta impressa: reaproveita o svg da tela, não redesenha.
import { htmlPlantaImpressao } from '../src/lib/planta-impressao.js';

let ok = 0, tot = 0;
const t = (nome, real, esperado) => {
  tot++;
  const bate = JSON.stringify(real) === JSON.stringify(esperado);
  if (bate) ok++;
  console.log((bate ? 'ok   ' : 'ERRO ') + '| ' + nome + (bate ? '' : '\n       obtido:   ' + JSON.stringify(real) + '\n       esperado: ' + JSON.stringify(esperado)));
};

const base = {
  titulo: 'Sapatas subsolo Casa',
  subtitulo: 'Subsolo · 02/09/2026',
  imagemUrl: 'https://exemplo.supabase.co/planta.png',
  largura: 2000, altura: 1400,
  svgInterno: '<rect x="10" y="10" width="50" height="50" fill="#EA580C"/>',
  legenda: [{ cor: '#2563EB', texto: 'BT1111 · NF 4521' }, { cor: '#EA580C', texto: 'BT2222' }],
  rodape: 'FlowPlanner · impresso em 02/09/2026',
};
const h = htmlPlantaImpressao(base);

// ── O essencial: as marcações da tela vão junto ──────────────────────────
t('o svg da tela entra inteiro', h.includes('<rect x="10" y="10" width="50" height="50" fill="#EA580C"/>'), true);
t('o viewBox mantém a proporção da planta', h.includes('viewBox="0 0 2000 1400"'), true);
t('a imagem da planta é a mesma', h.includes('src="https://exemplo.supabase.co/planta.png"'), true);

// ── Orientação: errar isso é a planta sair num quarto da folha ───────────
t('planta larga imprime deitada', h.includes('A4 landscape'), true);
t('planta alta imprime em pé',
  htmlPlantaImpressao({ ...base, largura: 1000, altura: 1600 }).includes('A4 portrait'), true);
t('planta quadrada cai em deitada', htmlPlantaImpressao({ ...base, largura: 1000, altura: 1000 }).includes('A4 landscape'), true);

// ── Cabeçalho e legenda ─────────────────────────────────────────────────
t('título e subtítulo aparecem', h.includes('Sapatas subsolo Casa') && h.includes('Subsolo · 02/09/2026'), true);
t('a legenda leva as cores', h.includes('background:#2563EB') && h.includes('BT1111 · NF 4521'), true);
t('sem legenda não quebra', htmlPlantaImpressao({ ...base, legenda: [] }).includes('class="legs"'), true);
t('sem rodapé não deixa div vazia', htmlPlantaImpressao({ ...base, rodape: '' }).includes('class="rodape"'), false);

// ── Segurança: o título vem do nome da planta, que a pessoa digita ───────
t('título com html é escapado',
  htmlPlantaImpressao({ ...base, titulo: '<script>alert(1)</script>' }).includes('<script>alert'), false);
t('url com aspas não escapa do atributo',
  htmlPlantaImpressao({ ...base, imagemUrl: 'x" onerror="alert(1)' }).includes('onerror="alert(1)"'), false);

// ── Faltando medida, ainda imprime ──────────────────────────────────────
t('sem largura/altura usa um viewBox padrão',
  htmlPlantaImpressao({ ...base, largura: null, altura: null }).includes('viewBox="0 0 1000 1000"'), true);

console.log('\n' + ok + '/' + tot + ' casos corretos');
process.exit(ok === tot ? 0 : 1);
