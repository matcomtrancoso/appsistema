// Cabeçalho único de todos os PDFs do app.
//
// Logo à esquerda, identificação à direita: o tipo do documento muda de módulo
// para módulo, o resto (obra, cliente, endereço, data) é sempre o mesmo. Antes
// cada tela montava o próprio topo e nenhum PDF saía igual ao outro.
//
// Só importa a marca (módulo puro): roda no Node, no teste, sem navegador.
import { MARCA } from '../marca.js';

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Dados da obra, carregados uma vez e usados por todos os PDFs e planilhas.
// Fica aqui e não na tela para o cabeçalho não depender de quem chamou.
let _obra = {};
export function definirObra(cfg) { _obra = cfg || {}; }
export function obraAtual() { return _obra; }
export function logoAtual() { return _obra.logo_url || null; }

function dataBR(iso) {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  return s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
}

export const CSS_CABECALHO = `
.pdfh{display:flex;align-items:center;gap:18px;padding-bottom:12px;margin-bottom:16px;border-bottom:2px solid #111}
.pdfh-logo{height:44px;width:auto;flex:0 0 auto}
.pdfh-logo-txt{font-size:26px;font-weight:800;letter-spacing:-.5px;color:#087B8B;flex:0 0 auto}
.pdfh-id{margin-left:auto;text-align:right;line-height:1.45}
.pdfh-tipo{font-size:17px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;color:#111}
.pdfh-sub{font-size:11px;color:#333}
.pdfh-sub b{color:#111}
@media print{.pdfh{break-inside:avoid}}
`;

/**
 * @param titulo    tipo do documento ("Controle de entregáveis", "Requisição de material")
 * @param subtitulo linha extra opcional (período, número da requisição…)
 * @param obra      { obra_codigo, obra_local, arquiteto, cliente }
 * @param logoUrl   URL absoluta do logo (relativa quebra na janela de impressão)
 * @param data      ISO do documento; padrão vazio
 */
export function cabecalhoPDF({ titulo, subtitulo, obra = {}, logoUrl, data } = {}) {
  const logo = logoUrl
    ? `<img class="pdfh-logo" src="${esc(logoUrl)}" alt="">`
    : `<div class="pdfh-logo-txt">${esc(MARCA.nome)}</div>`;

  const linhas = [];
  if (obra.obra_codigo || obra.cliente) {
    linhas.push(
      (obra.obra_codigo ? `<b>Obra:</b> ${esc(obra.obra_codigo)}` : '') +
      (obra.obra_codigo && obra.cliente ? ' | ' : '') +
      (obra.cliente ? `<b>Cliente:</b> ${esc(obra.cliente)}` : '')
    );
  }
  if (obra.obra_local)  linhas.push(`<b>Endereço:</b> ${esc(obra.obra_local)}`);
  if (obra.arquiteto)   linhas.push(`<b>Arquitetura:</b> ${esc(obra.arquiteto)}`);
  if (subtitulo)        linhas.push(esc(subtitulo));
  if (data)             linhas.push(`<b>Data:</b> ${dataBR(data)}`);

  return `<div class="pdfh">${logo}<div class="pdfh-id">
    <div class="pdfh-tipo">${esc(titulo || '')}</div>
    ${linhas.map(l => `<div class="pdfh-sub">${l}</div>`).join('')}
  </div></div>`;
}

// Documento inteiro, para a tela só precisar montar o corpo.
export function paginaPDF({ titulo, subtitulo, obra, logoUrl, data, corpo, css = '', paisagem = false } = {}) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo || 'Documento')}</title>
<style>@page{size:A4 ${paisagem ? 'landscape' : 'portrait'};margin:12mm}
body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:0;font-size:12px}
h1{font-size:16px;margin:0 0 8px}
h2{font-size:13px;margin:16px 0 6px;border-bottom:2px solid #333;padding-bottom:3px}
table{border-collapse:collapse;width:100%}
th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;font-size:11px;vertical-align:top}
th{background:#f3f4f6}
.tag{border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700;color:#fff}
.meta{color:#555;margin-bottom:12px}
.sub{color:#666;font-size:10px}
${CSS_CABECALHO}${css}</style></head><body>
${cabecalhoPDF({ titulo, subtitulo, obra, logoUrl, data })}
${corpo || ''}
</body></html>`;
}
