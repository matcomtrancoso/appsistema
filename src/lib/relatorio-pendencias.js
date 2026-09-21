// Relatório de pendências: abre numa aba nova e manda imprimir. Mesmo caminho
// que o resto do app já usa para PDF — o navegador é quem gera o arquivo.
import { contarStatus, resumoPorEmpresa } from './pendencias-filtro';
import { hojeLocal } from './date.js';

const ROTULO = {
  aberta: 'Pendente', em_andamento: 'Em andamento', atrasada: 'Atrasada',
  resolvida: 'Resolvido', fechada: 'Fechado',
};
const COR = {
  aberta: '#DC2626', em_andamento: '#D97706', atrasada: '#B91C1C',
  resolvida: '#16A34A', fechada: '#6B7280',
};

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const dataBR = (iso) => {
  if (!iso) return '—';
  const d = String(iso).slice(0, 10).split('-');
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : String(iso);
};

// A primeira foto que existir. O banco guarda em campos diferentes conforme a
// pendência tenha sido criada antes ou depois da tela de solução.
const primeiraFoto = (p) => p.foto_problema || p.foto_url || (Array.isArray(p.fotos) ? p.fotos[0] : null) || p.foto_solucao || null;

function cardHTML(p) {
  const foto = primeiraFoto(p);
  const cor = COR[p.status] || '#6B7280';
  const linha = (r, v) => v ? `<div><span style="color:#6B7280">${r}:</span> ${esc(v)}</div>` : '';
  return `
<div style="border:1px solid #E5E7EB;border-radius:10px;padding:12px;margin-bottom:10px;display:flex;gap:12px;page-break-inside:avoid">
  ${foto ? `<img src="${esc(foto)}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;flex-shrink:0">` : ''}
  <div style="flex:1;min-width:0">
    <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px">
      <div style="flex:1;font-size:13pt;font-weight:800">${esc(p.titulo || 'Registro') }${p.numero ? ` <span style="color:#9CA3AF">#${esc(p.numero)}</span>` : ''}</div>
      <span style="background:${cor};color:#fff;font-size:8pt;font-weight:800;padding:3px 10px;border-radius:999px;white-space:nowrap">${ROTULO[p.status] || esc(p.status)}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:2px 16px;font-size:9pt;line-height:1.5">
      ${linha('Vistoria', dataBR(p.created_at))}
      ${linha('Prazo', dataBR(p.prazo))}
      ${linha('Vistoriado', p.criada_por_nome)}
      ${linha('Responsável', p.empresa)}
      ${linha('Local', [p.pavimento, p.ambiente].filter(Boolean).join(' · '))}
      ${linha('Resolvido em', dataBR(p.resolvida_em) !== '—' ? dataBR(p.resolvida_em) : '')}
    </div>
    ${p.descricao ? `<div style="margin-top:7px;font-size:9pt"><span style="color:#6B7280">Problema:</span><br>${esc(p.descricao)}</div>` : ''}
  </div>
</div>`;
}

export function abrirRelatorioPendencias(lista, { obra, filtroTexto }) {
  const c = contarStatus(lista);
  const resumo = resumoPorEmpresa(lista);
  const agora = new Date();
  const carimbo = `${agora.toLocaleDateString('pt-BR')}, ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

  const kpi = (n, r, cor) => `<div style="flex:1;text-align:center"><div style="font-size:22pt;font-weight:900;color:${cor}">${n}</div><div style="font-size:8.5pt;color:#4B5563">${r}</div></div>`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório de Pendências — ${esc(obra)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif}
  body{padding:24px;color:#111827;font-size:10pt;line-height:1.45;max-width:900px;margin:0 auto}
  @media print{body{padding:0}}
  h2{font-size:13pt;margin:18px 0 8px}
</style></head><body>

<div style="text-align:center;border-bottom:1px solid #E5E7EB;padding-bottom:14px">
  <div style="font-size:19pt;font-weight:900">RELATÓRIO DE PENDÊNCIAS</div>
  <div style="font-size:10pt;margin-top:4px"><b>Obra:</b> ${esc(obra)}</div>
  <div style="font-size:10pt"><b>Data do relatório:</b> ${dataBR(hojeLocal())}</div>
  <div style="font-size:9pt;color:#6B7280;margin-top:4px"><b>Filtro:</b> ${esc(filtroTexto)}</div>
</div>

<div style="display:flex;background:#F3F4F6;border-radius:10px;padding:14px;margin-top:14px">
  ${kpi(c.total, 'Total', '#111827')}
  ${kpi(c.pendentes, 'Pendentes', '#DC2626')}
  ${kpi(c.andamento, 'Em andamento', '#D97706')}
  ${kpi(c.resolvidas, 'Resolvidas', '#16A34A')}
</div>

<h2>Resumo por Responsável</h2>
${resumo.length === 0 ? '<div style="color:#9CA3AF;font-style:italic">Nada no filtro escolhido.</div>' : `
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
  ${resumo.map(r => `
    <div style="border-left:3px solid #DC2626;background:#F9FAFB;border-radius:6px;padding:8px 12px">
      <div style="font-weight:800;font-size:10.5pt">${esc(r.nome)}</div>
      <div style="font-size:9pt;margin-top:2px">
        Total: <b>${r.total}</b> &nbsp;
        <span style="color:#DC2626">Pend: <b>${r.pendentes}</b></span> &nbsp;
        <span style="color:#D97706">And: <b>${r.andamento}</b></span> &nbsp;
        <span style="color:#16A34A">Resol: <b>${r.resolvidas}</b></span>
      </div>
    </div>`).join('')}
</div>`}

<h2>Registros Detalhados</h2>
${lista.length === 0 ? '<div style="color:#9CA3AF;font-style:italic">Nenhuma pendência no filtro escolhido.</div>' : lista.map(cardHTML).join('')}

<div style="text-align:center;color:#6B7280;font-size:8.5pt;margin-top:22px;padding-top:12px;border-top:1px solid #E5E7EB">
  Relatório gerado automaticamente em ${carimbo}
</div>
</body></html>`;

  const win = window.open('', '_blank');
  if (!win) { window.alert('Permita pop-ups para gerar o relatório.'); return; }
  win.document.write(html);
  win.document.close();
  // Imprime quando terminar de carregar; o timeout cobre o caso de as fotos
  // segurarem o onload, e a trava evita imprimir duas vezes.
  let impresso = false;
  const imprimir = () => { if (impresso) return; impresso = true; win.focus(); win.print(); };
  win.onload = imprimir;
  setTimeout(imprimir, 1200);
}
