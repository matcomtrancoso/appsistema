// Simulação de atraso na malha de projetos: "se este item atrasar N dias, quem
// mais escorrega?"
//
// Modelo: o atraso propaga integralmente para quem depende. Não há folga a
// absorver porque a malha não guarda folga — guarda só a data prevista de cada
// entregável. Assumir folga que ninguém informou seria inventar prazo bom.
//
// Quem não tem data prevista aparece como "sem prazo": não dá para dizer que
// atrasou algo que nunca teve data. É justamente por isso que o item sem prazo
// é um alerta na tela.
//
// Sem imports de propósito: roda no Node, no teste, sem banco.

export function somarDias(iso, n) {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

// deps: [{ projeto_id, depende_de_id }] → { paiId: [filhoId, ...] }
export function mapaSucessores(deps) {
  const m = {};
  for (const d of deps || []) {
    if (!d || !d.depende_de_id || !d.projeto_id) continue;
    (m[d.depende_de_id] = m[d.depende_de_id] || []).push(d.projeto_id);
  }
  return m;
}

/**
 * @param projetos [{ id, nome, responsavel_nome, data_prevista, status }]
 * @param deps     [{ projeto_id, depende_de_id }]
 * @param raizId   id do item que vai atrasar
 * @param dias     quantos dias de atraso
 * @returns { raiz, afetados: [{ id, nome, responsavel_nome, de, para, nivel, semPrazo }] }
 *          afetados em ordem de nível (1 = depende direto) e depois por data.
 */
export function simularAtraso(projetos, deps, raizId, dias) {
  const porId = {};
  for (const p of projetos || []) porId[p.id] = p;
  const raiz = porId[raizId];
  if (!raiz || !dias) return { raiz: raiz || null, afetados: [] };

  const suc = mapaSucessores(deps);
  const nivelDe = {};
  const afetados = [];

  // Largura primeiro: garante que cada item receba o MENOR nível possível, que é
  // a distância real dele até a raiz. Em profundidade, um item alcançável por dois
  // caminhos ficaria com o nível do caminho mais longo.
  let fila = [raizId];
  nivelDe[raizId] = 0;
  const visto = new Set([raizId]);

  while (fila.length) {
    const proxima = [];
    for (const id of fila) {
      for (const filhoId of suc[id] || []) {
        if (visto.has(filhoId)) continue;      // corta ciclo e caminho repetido
        visto.add(filhoId);
        nivelDe[filhoId] = nivelDe[id] + 1;
        const p = porId[filhoId];
        if (!p) continue;
        // Item já recebido não escorrega: ele já aconteceu.
        if (p.status === 'recebido') continue;
        afetados.push({
          id: p.id,
          nome: p.nome,
          responsavel_nome: p.responsavel_nome || '',
          nivel: nivelDe[filhoId],
          semPrazo: !p.data_prevista,
          de: p.data_prevista || null,
          para: p.data_prevista ? somarDias(p.data_prevista, dias) : null,
        });
        proxima.push(filhoId);
      }
    }
    fila = proxima;
  }

  afetados.sort((a, b) =>
    (a.nivel - b.nivel) || String(a.de || '9999').localeCompare(String(b.de || '9999')));

  return {
    raiz: {
      id: raiz.id, nome: raiz.nome, responsavel_nome: raiz.responsavel_nome || '',
      de: raiz.data_prevista || null,
      para: raiz.data_prevista ? somarDias(raiz.data_prevista, dias) : null,
      semPrazo: !raiz.data_prevista,
    },
    afetados,
  };
}
