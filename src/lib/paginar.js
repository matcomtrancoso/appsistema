// O servidor corta toda resposta em 1000 linhas, sem avisar. Para ler tudo, peça
// de página em página. `montar` devolve a consulta do zero a cada chamada
// (cada página é uma consulta nova, com o seu .range()).
export async function todasAsLinhas(montar, pagina = 1000) {
  const tudo = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar().range(de, de + pagina - 1);
    if (error) return { data: null, error };
    tudo.push(...(data || []));
    if ((data || []).length < pagina) return { data: tudo, error: null };
  }
}
