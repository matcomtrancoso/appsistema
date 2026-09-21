import assert from 'node:assert';
import { cabecalhoPDF, paginaPDF, CSS_CABECALHO } from '../src/lib/pdf-cabecalho.js';

const OBRA = { obra_codigo: 'OBRA-01 | Residencial Aurora', obra_local: 'Rua das Palmeiras, 100 - SP', arquiteto: 'Estudio Norte', cliente: 'Cliente Exemplo' };

// Logo à esquerda, identificação à direita
{
  const h = cabecalhoPDF({ titulo: 'Controle de entregáveis', obra: OBRA, logoUrl: 'https://x/logo.png', data: '2026-07-28' });
  assert.ok(h.indexOf('pdfh-logo') < h.indexOf('pdfh-id'), 'o logo tem que vir antes da identificação');
  assert.match(h, /<img class="pdfh-logo" src="https:\/\/x\/logo\.png"/);
  assert.match(h, /CONTROLE DE ENTREGÁVEIS|Controle de entregáveis/);
  assert.match(h, /OBRA-01 \| Residencial Aurora/);
  assert.match(h, /Rua das Palmeiras/);
  assert.match(h, /28\/07\/2026/);
}

// Sem logo cai no texto, não some
assert.match(cabecalhoPDF({ titulo: 'X' }), /pdfh-logo-txt/);

// Campos ausentes não deixam rótulo órfão
{
  const h = cabecalhoPDF({ titulo: 'X', obra: { obra_codigo: 'OBRA-01' } });
  assert.doesNotMatch(h, /Endereço/);
  assert.doesNotMatch(h, /Cliente/);
  assert.doesNotMatch(h, /Data:/);
  assert.match(h, /Obra:/);
}

// Escapa HTML vindo do banco
{
  const h = cabecalhoPDF({ titulo: '<script>x</script>', obra: { cliente: 'A & B' } });
  assert.doesNotMatch(h, /<script>/);
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /A &amp; B/);
}

// Documento completo traz o cabeçalho, o CSS e o corpo
{
  const doc = paginaPDF({ titulo: 'Requisição', obra: OBRA, corpo: '<table><tr><td>Cimento</td></tr></table>' });
  assert.match(doc, /^<!doctype html>/);
  assert.ok(doc.includes(CSS_CABECALHO));
  assert.match(doc, /Cimento/);
  assert.match(doc, /size:A4 portrait/);
  assert.match(paginaPDF({ titulo: 'X', paisagem: true }), /size:A4 landscape/);
}

console.log('pdf-cabecalho: ok');
