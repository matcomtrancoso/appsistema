// Planilha para o Excel, sem biblioteca: uma tabela HTML salva como .xls.
// O Excel abre, respeita cor de fundo, negrito, largura e célula mesclada — que
// é tudo o que o CSV não faz. O preço é o aviso de "formato diferente da
// extensão" na primeira abertura; em troca, a planilha sai com o mesmo
// cabeçalho e as mesmas cores do PDF, em vez de um texto cru.
//
// Sem imports além do escape compartilhado com o cabeçalho do PDF.
import { esc, obraAtual, logoAtual } from './pdf-cabecalho.js';

const CINZA_CAB = '#F3F4F6';

function dataBR(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

/**
 * @param titulo   tipo do documento
 * @param colunas  [{ label, largura? }]
 * @param linhas   [{ tipo:'grupo', label, cor } | { tipo:'linha', celulas:[{ v, cor?, corTexto?, negrito? }] }]
 * @param data     ISO do documento
 */
export function planilhaHTML({ titulo, colunas = [], linhas = [], data, obra, logoUrl } = {}) {
  // `undefined` = usa o global; `null` = este documento não leva logo/obra.
  // Sem essa distinção não dá para gerar uma planilha limpa de propósito.
  const o = obra === undefined ? obraAtual() : (obra || {});
  const logo = logoUrl === undefined ? logoAtual() : logoUrl;
  const nCols = Math.max(1, colunas.length);

  const info = [
    o.obra_codigo ? 'Obra: ' + o.obra_codigo : '',
    o.cliente ? 'Cliente: ' + o.cliente : '',
    o.obra_local ? 'Endereço: ' + o.obra_local : '',
    data ? 'Data: ' + dataBR(data) : '',
  ].filter(Boolean).join('   ·   ');

  const cab = `
  <tr><td colspan="${nCols}" style="height:52px;vertical-align:middle;border:none">
    ${logo ? `<img src="${esc(logo)}" height="40">&nbsp;&nbsp;` : ''}
    <span style="font-size:16pt;font-weight:bold;color:#111">${esc(titulo || '')}</span>
  </td></tr>
  <tr><td colspan="${nCols}" style="border:none;color:#444;font-size:9pt;padding-bottom:8px">${esc(info)}</td></tr>`;

  const th = `<tr>${colunas.map(c =>
    `<th style="background:${CINZA_CAB};border:1px solid #B9C0C9;font-size:9pt;font-weight:bold;` +
    `text-align:left;padding:5px 7px${c.largura ? ';width:' + c.largura + 'px' : ''}">${esc(c.label)}</th>`
  ).join('')}</tr>`;

  const corpo = linhas.map(l => {
    if (l.tipo === 'grupo') {
      return `<tr><td colspan="${nCols}" style="background:${l.cor || '#111'};color:#fff;` +
             `font-weight:bold;font-size:10pt;padding:6px 7px;border:1px solid #B9C0C9">${esc(l.label)}</td></tr>`;
    }
    return `<tr>${(l.celulas || []).map(c =>
      `<td style="border:1px solid #D5DAE0;font-size:9pt;padding:4px 7px;vertical-align:top` +
      `${c.cor ? ';background:' + c.cor : ''}${c.corTexto ? ';color:' + c.corTexto : ''}` +
      `${c.negrito ? ';font-weight:bold' : ''}">${esc(c.v)}</td>`
    ).join('')}</tr>`;
  }).join('');

  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>${esc((titulo || 'Planilha').slice(0, 28))}</x:Name>
<x:WorksheetOptions><x:FreezePanes/><x:SplitHorizontal>3</x:SplitHorizontal>
<x:TopRowBottomPane>3</x:TopRowBottomPane><x:ActivePane>2</x:ActivePane>
</x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
</head><body><table cellspacing="0">${cab}${th}${corpo}</table></body></html>`;
}

// Tom claro da cor da situação, para a célula não virar um bloco chapado.
export function tomClaro(hex, alfa = 0.14) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return '#FFFFFF';
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (c) => Math.round(255 - (255 - c) * alfa);
  return '#' + [mix(r), mix(g), mix(b)].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}
