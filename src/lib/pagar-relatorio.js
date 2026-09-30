// Relatório (PDF, via impressão) de Contas a pagar — mesmo caminho que o
// resto do app já usa: monta uma página HTML com o cabeçalho padrão
// (src/lib/pdf-cabecalho.js) e manda o navegador imprimir/salvar como PDF.
// Cada aba (Mão de obra, Despesas) tem seu relatório, sobre o que já está
// carregado na tela — não busca nada de novo no banco.
import { paginaPDF, esc } from './pdf-cabecalho.js';
import { fmtDataBR } from './date.js';
import { fmtCur } from './moeda.js';
import { valorPagamento, rotuloQuinzena, situacaoDespesa } from './pagar.js';

const CSS_PAGAR = `
.kpis{display:flex;gap:16px;margin-bottom:16px}
.kpi{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px}
.kpi .n{font-size:16px;font-weight:800}
.kpi .r{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:.4px}
.tag{border-radius:10px;padding:2px 8px;font-size:9.5px;font-weight:800;color:#fff;white-space:nowrap}
td.num,th.num{text-align:right}
`;

const kpi = (rotulo, valor) => `<div class="kpi"><div class="n">${esc(valor)}</div><div class="r">${esc(rotulo)}</div></div>`;

/** @param {{linhas:object[], quinzena:{inicio:string,fim:string}, obra:object, logoUrl?:string}} p */
export function relatorioMaoDeObra({ linhas, quinzena, obra, logoUrl }) {
  const abertas = linhas.filter(l => !l.pago);
  const aPagar = abertas.reduce((s, l) => s + valorPagamento({ dias: l.dias.length, valorDiaria: l.colab?.valor_diaria }).total, 0);
  const jaPago = linhas.reduce((s, l) => s + (l.pago ? Number(l.pago.valor) || 0 : 0), 0);

  const linha = (p) => {
    const pago = p.pago;
    const dias = pago ? pago.dias : p.dias.length;
    const diaria = pago ? pago.valor_diaria : p.colab?.valor_diaria;
    const ajuste = pago ? Number(pago.ajuste) || 0 : 0;   // sem pagamento ainda, não há ajuste a mostrar
    const valor = pago ? (Number(pago.valor) || 0) : valorPagamento({ dias, valorDiaria: diaria }).subtotal;
    return `<tr>
      <td>${esc(p.nome)}</td>
      <td class="num">${dias}</td>
      <td class="num">${esc(fmtCur(diaria || 0))}</td>
      <td class="num">${ajuste ? esc((ajuste > 0 ? '+' : '−') + fmtCur(Math.abs(ajuste))) : '—'}</td>
      <td class="num">${esc(fmtCur(valor))}</td>
      <td>${pago
        ? `<span class="tag" style="background:#16A34A">PAGO ${esc(fmtDataBR(pago.pago_em))}</span>`
        : `<span class="tag" style="background:#6B7280">EM ABERTO</span>`}</td>
    </tr>`;
  };

  const corpo = `
${kpi('Pessoas', linhas.length)}
<div class="kpis">
  ${kpi('A pagar', fmtCur(aPagar))}
  ${kpi('Já pago', fmtCur(jaPago))}
</div>
<table>
  <thead><tr><th>Nome</th><th class="num">Dias</th><th class="num">Diária</th><th class="num">Ajuste</th><th class="num">Valor</th><th>Situação</th></tr></thead>
  <tbody>${linhas.length ? linhas.map(linha).join('') : '<tr><td colspan="6" style="color:#9CA3AF;font-style:italic;text-align:center">Ninguém da equipe própria nesta quinzena.</td></tr>'}</tbody>
</table>`;

  return paginaPDF({
    titulo: 'Contas a pagar — Mão de obra',
    subtitulo: `${rotuloQuinzena(quinzena)} (${fmtDataBR(quinzena.inicio)} a ${fmtDataBR(quinzena.fim)})`,
    obra, logoUrl, data: quinzena.fim, corpo, css: CSS_PAGAR,
  });
}

/** @param {{itens:object[], mesRotulo:string, hoje:string, obra:object, logoUrl?:string}} p */
export function relatorioDespesas({ itens, mesRotulo, hoje, obra, logoUrl }) {
  const emAberto = itens.filter(d => d.status === 'aberto').reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const pagas = itens.filter(d => d.status === 'pago').reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const COR_SIT = { paga: '#16A34A', vencida: '#DC2626', aberta: '#6B7280' };
  const ROTULO_SIT = { paga: 'PAGA', vencida: 'VENCIDA', aberta: 'EM ABERTO' };

  const linha = (d) => {
    const sit = situacaoDespesa(d, hoje);
    return `<tr>
      <td>${esc(d.descricao || '(sem descrição)')}</td>
      <td>${esc(d.categoria || '')}</td>
      <td>${esc(fmtDataBR(d.vencimento))}</td>
      <td class="num">${esc(fmtCur(d.valor))}</td>
      <td><span class="tag" style="background:${COR_SIT[sit]}">${ROTULO_SIT[sit]}</span></td>
    </tr>`;
  };

  const corpo = `
<div class="kpis">
  ${kpi('Em aberto', fmtCur(emAberto))}
  ${kpi('Pago', fmtCur(pagas))}
  ${kpi('Total', fmtCur(emAberto + pagas))}
</div>
<table>
  <thead><tr><th>Descrição</th><th>Categoria</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th></tr></thead>
  <tbody>${itens.length ? itens.map(linha).join('') : `<tr><td colspan="5" style="color:#9CA3AF;font-style:italic;text-align:center">Nenhuma despesa com vencimento em ${esc(mesRotulo)}.</td></tr>`}</tbody>
</table>`;

  return paginaPDF({
    titulo: 'Contas a pagar — Despesas',
    subtitulo: mesRotulo,
    obra, logoUrl, data: hoje, corpo, css: CSS_PAGAR,
  });
}

// Abre a página numa aba nova e manda imprimir — o navegador é quem gera o PDF.
export function abrirRelatorio(html) {
  const win = window.open('', '_blank');
  if (!win) { window.alert('Habilite os pop-ups para gerar o relatório.'); return; }
  win.document.write(html);
  win.document.close();
  let impresso = false;
  const imprimir = () => { if (impresso) return; impresso = true; win.focus(); win.print(); };
  win.onload = imprimir;
  setTimeout(imprimir, 500);
}
