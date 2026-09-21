import assert from 'node:assert';
import { planilhaHTML, tomClaro } from '../src/lib/exportar-excel.js';
import { definirObra } from '../src/lib/pdf-cabecalho.js';

definirObra({ obra_codigo: 'OBRA-01 | Residencial Aurora', obra_local: 'Rua das Palmeiras, 100 - SP', logo_url: 'https://x/l.png' });

const COLS = [{ label: 'Entregável', largura: 260 }, { label: 'Situação' }];

{
  const h = planilhaHTML({
    titulo: 'Projetos por projetista',
    colunas: COLS,
    data: '2026-07-28',
    linhas: [
      { tipo: 'grupo', label: 'FCA', cor: '#0E6CB8' },
      { tipo: 'linha', celulas: [{ v: 'Revisão de piso' }, { v: 'Em andamento', cor: '#E4EFF9', negrito: true }] },
    ],
  });

  assert.match(h, /urn:schemas-microsoft-com:office:excel/); // Excel reconhece a aba
  assert.match(h, /<img src="https:\/\/x\/l\.png"/);          // logo no topo
  assert.match(h, /Projetos por projetista/);
  assert.match(h, /OBRA-01 \| Residencial Aurora/);
  assert.match(h, /28\/07\/2026/);
  assert.match(h, /Endereço: Rua das Palmeiras/);
  assert.match(h, /background:#0E6CB8/);                      // faixa do grupo colorida
  assert.match(h, /background:#E4EFF9/);                      // célula de situação colorida
  assert.match(h, /width:260px/);
  assert.match(h, /colspan="2"/);                             // cabeçalho mescla nas colunas
  assert.match(h, /FreezePanes/);                             // trava o cabeçalho ao rolar
}

// Escapa conteúdo vindo do banco
{
  const h = planilhaHTML({ titulo: 'X', colunas: COLS, obra: {}, logoUrl: null,
    linhas: [{ tipo: 'linha', celulas: [{ v: '<b>A & B</b>' }] }] });
  assert.doesNotMatch(h, /<b>A/);
  assert.match(h, /&lt;b&gt;A &amp; B/);
  assert.doesNotMatch(h, /<img/);       // sem logo, não deixa img quebrada
}

// Nome da aba não estoura o limite do Excel
assert.ok(/<x:Name>[^<]{1,31}<\/x:Name>/.test(planilhaHTML({ titulo: 'a'.repeat(80), colunas: COLS })));

// Sem colunas ainda gera documento válido
assert.match(planilhaHTML({ titulo: 'Vazio' }), /<table/);

// tomClaro clareia sem inventar cor
assert.equal(tomClaro('#000000', 1), '#000000');
assert.equal(tomClaro('#000000', 0), '#FFFFFF');
assert.equal(tomClaro('nao-e-cor'), '#FFFFFF');
assert.match(tomClaro('#16A34A'), /^#[0-9A-F]{6}$/);

console.log('exportar-excel: ok');
