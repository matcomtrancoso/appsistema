import { supabase } from './supabase';
import { hojeLocal } from './date';
import { enviarArquivo } from './enviar-arquivo';

// Envio de foto do RDO: comprime no navegador, sobe pro bucket 'fotos' (o mesmo
// que pedidos/visitas já usam) e grava um registro leve em rdo_fotos com a
// legenda montada sozinha (serviço · pavimento · ambiente · dia).

function fmtDiaBR(dataISO) {
  const [, m, d] = String(dataISO || '').slice(0, 10).split('-');
  return d && m ? `${d}/${m}` : '';
}

function montarLegenda({ servico, pavimento, ambiente, data }) {
  return [servico, pavimento, ambiente, fmtDiaBR(data)].filter(Boolean).join(' · ');
}

// meta: { rdoId, atividadeId, data, pavimento, ambiente, servico, empresa, status, autorNome }
export async function enviarFotoRDO(file, meta = {}) {
  const data = meta.data || hojeLocal();
  const { url, path } = await enviarArquivo(file, `rdo/${meta.rdoId || 'sem-rdo'}`);
  const legenda = montarLegenda({ servico: meta.servico, pavimento: meta.pavimento, ambiente: meta.ambiente, data });

  const { data: row, error: insErr } = await supabase.from('rdo_fotos').insert({
    rdo_id: meta.rdoId || null,
    atividade_id: meta.atividadeId || null,
    data,
    pavimento: meta.pavimento || null,
    ambiente: meta.ambiente || null,
    servico: meta.servico || null,
    empresa: meta.empresa || null,
    status: meta.status || null,
    legenda,
    url,
    storage_path: path,
    autor_nome: meta.autorNome || null,
  }).select().single();
  if (insErr) throw insErr;
  return row;
}

// Baixa uma foto (força download em vez de abrir no navegador).
export async function baixarFoto(url, nome = 'foto.jpg') {
  try {
    const resp = await fetch(url);
    const blob = await resp.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 4000);
  } catch (_) {
    window.open(url, '_blank');   // fallback: abre pra salvar na mão
  }
}
