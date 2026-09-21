// A planta com as marcações, em papel.
//
// Não redesenha nada: a tela já é uma <img> com um <svg> por cima, então a
// impressão reaproveita o MESMO svg (serializado) sobre a MESMA imagem. O que
// você vê é o que sai — inclusive etapas ocultas no 👁 e o modo por caminhão,
// que já vêm resolvidos no svg da tela.
//
// O html é string pura (testável no Node); só abrirImpressaoPlanta toca em
// window, seguindo o padrão de relatorio-pendencias.js.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param titulo     nome da planta
 * @param subtitulo  pavimento, dia, o que estiver filtrado
 * @param imagemUrl  a planta (url pública do storage)
 * @param largura    e altura: o viewBox do svg da tela
 * @param svgInterno innerHTML do <svg> da tela — as marcações já desenhadas
 * @param legenda    [{ cor, texto }] — etapas visíveis ou caminhões do dia
 * @param rodape     linha pequena no pé da página
 */
export function htmlPlantaImpressao({ titulo, subtitulo, imagemUrl, largura, altura, svgInterno, legenda = [], rodape = '' }) {
  // Planta larga imprime deitada; planta alta, em pé. Errar isso é a diferença
  // entre a planta ocupar a folha e sair num quarto dela.
  const orientacao = Number(largura) >= Number(altura) ? 'landscape' : 'portrait';

  const itens = (legenda || [])
    .map(l => `<span class="leg"><span class="dot" style="background:${esc(l.cor)}"></span>${esc(l.texto)}</span>`)
    .join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
  @page{size:A4 ${orientacao};margin:8mm}
  body{color:#111827;padding:10px}
  @media print{body{padding:0}}
  h1{font-size:13pt;line-height:1.2}
  .sub{font-size:9pt;color:#6B7280;margin-top:2px}
  .cab{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:8px}
  .leg{display:inline-flex;align-items:center;gap:5px;margin-left:12px;font-size:8.5pt;color:#374151;white-space:nowrap}
  .dot{width:9px;height:9px;border-radius:99px;display:inline-block;flex-shrink:0}
  .legs{text-align:right}
  /* A planta ocupa o resto da folha sem estourar: o limite é a altura útil. */
  .planta{position:relative;width:100%;max-height:${orientacao === 'landscape' ? '165mm' : '245mm'};
    display:flex;justify-content:center}
  .wrap{position:relative;display:inline-block;max-width:100%}
  .wrap img{display:block;width:100%;height:auto}
  .wrap svg{position:absolute;top:0;left:0;width:100%;height:100%}
  .rodape{margin-top:6px;font-size:7.5pt;color:#9CA3AF}
</style></head><body>
<div class="cab">
  <div>
    <h1>${esc(titulo)}</h1>
    <div class="sub">${esc(subtitulo)}</div>
  </div>
  <div class="legs">${itens}</div>
</div>
<div class="planta"><div class="wrap">
  <img src="${esc(imagemUrl)}" alt="${esc(titulo)}" />
  <svg viewBox="0 0 ${Number(largura) || 1000} ${Number(altura) || 1000}" xmlns="http://www.w3.org/2000/svg">${svgInterno || ''}</svg>
</div></div>
${rodape ? `<div class="rodape">${esc(rodape)}</div>` : ''}
</body></html>`;
}

export function abrirImpressaoPlanta(args) {
  const win = window.open('', '_blank');
  if (!win) { window.alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return; }
  win.document.write(htmlPlantaImpressao(args));
  win.document.close();
  // Imprimir antes de a planta carregar sai com a folha em branco — por isso
  // espera a imagem. O prazo de segurança cobre imagem que nunca carrega:
  // melhor imprimir só as marcações do que travar numa janela morta.
  let jaFoi = false;
  const imprimir = () => { if (jaFoi) return; jaFoi = true; try { win.focus(); win.print(); } catch { /* usuário fechou */ } };
  const img = win.document.querySelector('img');
  if (img && !img.complete) { img.onload = imprimir; img.onerror = imprimir; }
  else imprimir();
  setTimeout(imprimir, 6000);
}
