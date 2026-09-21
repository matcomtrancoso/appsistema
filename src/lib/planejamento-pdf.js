// O quadro da semana em papel, e a ordem que segura as linhas no lugar.
//
// Duas regras e um gerador:
// 1) ordemDeFornecedores: a MESMA ordem de fornecedores para a semana toda —
//    quem tem mais atividades primeiro, empate em ordem alfabética, sem
//    fornecedor por último. Sem uma ordem fixa, cada coluna do quadro listava
//    os fornecedores na ordem em que as atividades foram cadastradas, e o
//    mesmo fornecedor pulava de posição de um dia para o outro.
// 2) ordenarPorFornecedor: aplica essa ordem numa lista de um dia.
// 3) htmlPlanejamentoSemanal: a versão imprimível — matriz com uma LINHA por
//    fornecedor e uma coluna por dia, que é como se lê "quem faz o quê".
//
// O html é string pura (testável no Node); só abrirPdfPlanejamento toca em
// window, seguindo o padrão de relatorio-pendencias.js.
import { chaveDoDia, DIA_CURTO } from './atividades-do-dia.js';

const SEM_FORN = 'Sem fornecedor';

export function ordemDeFornecedores(atividades) {
  const cont = new Map();
  for (const a of atividades || []) {
    const nome = (a.empreiteiro || '').trim() || SEM_FORN;
    cont.set(nome, (cont.get(nome) || 0) + 1);
  }
  return [...cont.entries()].sort((x, y) => {
    if (x[0] === SEM_FORN) return 1;
    if (y[0] === SEM_FORN) return -1;
    return (y[1] - x[1]) || x[0].localeCompare(y[0], 'pt-BR');
  }).map(([nome]) => nome);
}

export function ordenarPorFornecedor(lista, ordem) {
  const pos = new Map((ordem || []).map((n, i) => [n, i]));
  const de = (a) => {
    const n = (a.empreiteiro || '').trim() || SEM_FORN;
    return pos.has(n) ? pos.get(n) : 999;
  };
  return [...(lista || [])].sort((a, b) =>
    (de(a) - de(b)) || String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR'));
}

// Status daquele DIA: atividade da semana lê o mapa; avulsa lê o status liso.
function statusNoDia(a, iso) {
  const multi = Array.isArray(a.dias_semana) && a.dias_semana.length > 0;
  if (multi) return a.status_por_dia?.[chaveDoDia(iso)] || 'pendente';
  return a.status || 'pendente';
}

// Cores fixas em hex: no papel não existe var(--...).
const ST = {
  feita:        { label: 'Feita',        cor: '#16A34A' },
  em_andamento: { label: 'Em andamento', cor: '#D97706' },
  nao_feita:    { label: 'Não feita',    cor: '#DC2626' },
  pendente:     { label: 'Pendente',     cor: '#9CA3AF' },
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * @param rotulo   "25/08 – 31/08" (título da semana)
 * @param dias     [{ iso, rotulo }] — as colunas, na ordem
 * @param porDia   { iso: [atividades] } — já recortadas por dia
 * @param corDe    (nomeFornecedor|null) => cor hex da empresa
 */
export function htmlPlanejamentoSemanal({ obra, rotulo, dias, porDia, corDe = () => '#888' }) {
  const todas = Object.values(porDia || {}).flat();
  const fornecedores = ordemDeFornecedores(todas);

  const celula = (forn, iso) => {
    const doDia = (porDia[iso] || []).filter(a => (((a.empreiteiro || '').trim()) || SEM_FORN) === forn);
    if (!doDia.length) return '<td></td>';
    const linhas = doDia.map(a => {
      const st = ST[statusNoDia(a, iso)] || ST.pendente;
      return `<div class="atv">
        <span class="dot" style="background:${st.cor}" title="${esc(st.label)}"></span>
        <span>${esc(a.descricao)}${a.ambiente ? `<span class="amb"> · ${esc(a.ambiente)}</span>` : ''}</span>
      </div>`;
    }).join('');
    return `<td>${linhas}</td>`;
  };

  const linhas = fornecedores.map(f => {
    const cor = f === SEM_FORN ? '#9CA3AF' : (corDe(f) || '#888');
    return `<tr>
      <th class="forn" style="border-left:5px solid ${cor}"><span style="color:${cor}">${esc(f)}</span></th>
      ${dias.map(d => celula(f, d.iso)).join('')}
    </tr>`;
  }).join('');

  const legenda = Object.values(ST)
    .map(s => `<span class="leg"><span class="dot" style="background:${s.cor}"></span>${s.label}</span>`)
    .join('');

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
<title>Planejamento Semanal — ${esc(rotulo)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
  @page{size:A4 landscape;margin:10mm}
  body{padding:16px;color:#111827;font-size:9pt}
  @media print{body{padding:0}}
  h1{font-size:14pt;margin-bottom:2px}
  .sub{font-size:9pt;color:#6B7280;margin-bottom:10px}
  table{width:100%;border-collapse:collapse;table-layout:fixed}
  th,td{border:1px solid #D1D5DB;padding:5px 6px;vertical-align:top;text-align:left}
  thead th{background:#F3F4F6;font-size:8pt;text-transform:uppercase;letter-spacing:.05em;text-align:center}
  th.forn{width:110px;background:#FAFAF9;font-size:8.5pt;text-transform:uppercase;letter-spacing:.03em}
  .atv{display:flex;gap:4px;align-items:flex-start;font-size:8.5pt;line-height:1.35;margin-bottom:3px}
  .atv:last-child{margin-bottom:0}
  .amb{color:#6B7280;font-size:7.5pt}
  .dot{width:7px;height:7px;border-radius:99px;flex-shrink:0;display:inline-block;margin-top:2px}
  .leg{display:inline-flex;align-items:center;gap:4px;margin-right:12px;font-size:8pt;color:#374151}
  tr{page-break-inside:avoid}
</style></head><body>
<h1>Planejamento Semanal — ${esc(rotulo)}</h1>
<div class="sub">${esc(obra || '')}</div>
<table>
  <thead><tr><th class="forn">Fornecedor</th>${dias.map(d => `<th>${esc(d.rotulo)}</th>`).join('')}</tr></thead>
  <tbody>${linhas || `<tr><td colspan="${dias.length + 1}" style="text-align:center;color:#9CA3AF;padding:20px">Nenhuma atividade nesta semana</td></tr>`}</tbody>
</table>
<div style="margin-top:8px">${legenda}</div>
</body></html>`;
}

export function abrirPdfPlanejamento(args) {
  const win = window.open('', '_blank');
  if (!win) { window.alert('O navegador bloqueou a janela do PDF. Libere pop-ups para este site.'); return; }
  win.document.write(htmlPlanejamentoSemanal(args));
  win.document.close();
  // O print imediato pegava a página ainda sem estilo em celular lento.
  setTimeout(() => { try { win.focus(); win.print(); } catch { /* usuário fecha, tudo bem */ } }, 350);
}

// Rótulo curto de coluna: "Seg 25/08".
export function rotuloColuna(iso) {
  const [, m, d] = String(iso).slice(0, 10).split('-');
  const curto = DIA_CURTO[chaveDoDia(iso)] || '';
  return `${curto} ${d}/${m}`;
}

// ── Enviar o quadro (WhatsApp, e-mail…) ───────────────────────────────────
// No celular, navigator.share abre a folha nativa do aparelho com o quadro
// como IMAGEM — no WhatsApp ela aparece dentro da conversa, sem baixar nada.
// Imagem em vez de PDF de propósito: o destinatário vê sem abrir anexo.
// Onde não há share de arquivo (desktop), baixa o PNG para anexar à mão.
// Desenhado num canvas para não trazer biblioteca nenhuma.

function desenharQuadro({ obra, rotulo, dias, porDia, corDe = () => '#888' }) {
  const todas = Object.values(porDia || {}).flat();
  const fornecedores = ordemDeFornecedores(todas);

  const ESCALA = 2;                                   // nitidez no zoom do WhatsApp
  const W = 1560, COL_F = 190, PAD = 9, LH = 19, LH_AMB = 15;
  const COL_D = (W - COL_F - 24) / dias.length;
  const F_ATV = '600 14px Arial', F_AMB = '11.5px Arial';

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const quebrar = (texto, maxW, font) => {
    ctx.font = font;
    const linhas = []; let cur = '';
    for (const p of String(texto || '').split(/[ ]+/)) {
      const t = cur ? cur + ' ' + p : p;
      if (ctx.measureText(t).width > maxW && cur) { linhas.push(cur); cur = p; }
      else cur = t;
    }
    if (cur) linhas.push(cur);
    return linhas;
  };

  // 1ª passada: mede tudo para saber a altura de cada linha de fornecedor.
  const larguraTexto = COL_D - PAD * 2 - 14;
  const celulas = fornecedores.map(f => dias.map(d => {
    const doDia = (porDia[d.iso] || [])
      .filter(a => (((a.empreiteiro || '').trim()) || 'Sem fornecedor') === f);
    return doDia.map(a => ({
      st: ST[statusNoDia(a, d.iso)] || ST.pendente,
      linhas: quebrar(a.descricao, larguraTexto, F_ATV),
      amb: a.ambiente ? quebrar('· ' + a.ambiente, larguraTexto, F_AMB) : [],
    }));
  }));
  const nomesForn = fornecedores.map(f => quebrar(f.toUpperCase(), COL_F - 26, '800 13px Arial'));
  const altCel = (atvs) => atvs.reduce((s, a) => s + a.linhas.length * LH + a.amb.length * LH_AMB + 7, 0);
  const altLinha = fornecedores.map((_, i) => Math.max(
    44, nomesForn[i].length * 17 + PAD * 2,
    ...dias.map((_, j) => altCel(celulas[i][j]) + PAD * 2)));

  const TOPO = 74, CAB = 42, LEG = 44;
  const H = TOPO + CAB + altLinha.reduce((a, b) => a + b, 0) + LEG + 20 || 300;

  canvas.width = W * ESCALA; canvas.height = H * ESCALA;
  ctx.scale(ESCALA, ESCALA);
  ctx.textBaseline = 'middle';

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#111827'; ctx.font = '900 24px Arial';
  ctx.fillText(`Planejamento Semanal — ${rotulo}`, 12, 28);
  ctx.fillStyle = '#6B7280'; ctx.font = '13px Arial';
  ctx.fillText(obra || '', 12, 52);

  const x0 = 12, largura = COL_F + COL_D * dias.length;
  const xDia = (j) => x0 + COL_F + j * COL_D;

  // cabeçalho dos dias
  let y = TOPO;
  ctx.fillStyle = '#F3F4F6'; ctx.fillRect(x0, y, largura, CAB);
  ctx.fillStyle = '#374151'; ctx.font = '800 13px Arial'; ctx.textAlign = 'center';
  dias.forEach((d, j) => ctx.fillText(d.rotulo.toUpperCase(), xDia(j) + COL_D / 2, y + CAB / 2));
  ctx.textAlign = 'left';
  ctx.fillText('FORNECEDOR', x0 + 14, y + CAB / 2);

  // linhas
  y += CAB;
  fornecedores.forEach((f, i) => {
    const alt = altLinha[i];
    const cor = f === 'Sem fornecedor' ? '#9CA3AF' : (corDe(f) || '#888');
    ctx.fillStyle = cor; ctx.fillRect(x0, y, 5, alt);
    ctx.fillStyle = cor; ctx.font = '800 13px Arial';
    nomesForn[i].forEach((l, k) => ctx.fillText(l, x0 + 14, y + PAD + 9 + k * 17));

    dias.forEach((d, j) => {
      let yy = y + PAD + 9;
      for (const a of celulas[i][j]) {
        ctx.fillStyle = a.st.cor;
        ctx.beginPath(); ctx.arc(xDia(j) + PAD + 4, yy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111827'; ctx.font = F_ATV;
        a.linhas.forEach((l, k) => ctx.fillText(l, xDia(j) + PAD + 14, yy + k * LH));
        yy += a.linhas.length * LH;
        ctx.fillStyle = '#6B7280'; ctx.font = F_AMB;
        a.amb.forEach((l, k) => ctx.fillText(l, xDia(j) + PAD + 14, yy + k * LH_AMB));
        yy += a.amb.length * LH_AMB + 7;
      }
    });

    // grade da linha
    ctx.strokeStyle = '#D1D5DB'; ctx.lineWidth = 1;
    ctx.strokeRect(x0, y, largura, alt);
    for (let j = 0; j < dias.length; j++) { ctx.beginPath(); ctx.moveTo(xDia(j), y); ctx.lineTo(xDia(j), y + alt); ctx.stroke(); }
    y += alt;
  });
  if (!fornecedores.length) {
    ctx.fillStyle = '#9CA3AF'; ctx.font = '14px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Nenhuma atividade nesta semana', x0 + largura / 2, y + 30);
    ctx.textAlign = 'left'; y += 60;
  }

  // legenda
  let xl = x0 + 2; y += 22;
  for (const s of Object.values(ST)) {
    ctx.fillStyle = s.cor; ctx.beginPath(); ctx.arc(xl + 4, y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#374151'; ctx.font = '12px Arial';
    ctx.fillText(s.label, xl + 13, y);
    xl += 13 + ctx.measureText(s.label).width + 22;
  }

  return new Promise(res => canvas.toBlob(res, 'image/png'));
}

export async function compartilharQuadroSemanal(args) {
  const blob = await desenharQuadro(args);
  if (!blob) { window.alert('Não consegui gerar a imagem do quadro.'); return 'erro'; }
  const nome = `planejamento-${String(args.rotulo || 'semana').replace(/[^\w-]+/g, '-')}.png`;
  const file = new File([blob], nome, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Planejamento Semanal', text: `Planejamento Semanal — ${args.rotulo}` });
      return 'compartilhado';
    } catch (e) {
      // Cancelar a folha de compartilhar não é erro — só não força o download.
      if (e && e.name === 'AbortError') return 'cancelado';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'baixado';
}
