// ── Baixar arquivo do storage ───────────────────────────────────────────────
// O atributo `download` de <a> é ignorado quando o arquivo está em outro
// domínio — e o Supabase Storage é outro domínio. Sem buscar o blob antes, o
// navegador abre o PDF numa aba em vez de baixar.
export async function baixarArquivo(url, nome, fallback = 'arquivo.pdf') {
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href; a.download = nome || fallback;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch (e) {
    console.error('Erro ao baixar arquivo:', e);
    window.open(url, '_blank');   // pior caso, abre numa aba
  }
}
