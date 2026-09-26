// Fatia 2 do multi-obra: quais tabelas são "da obra" (têm `obra_id`) e como
// embrulhar um cliente do tipo Supabase para que, sozinho, ele só leia e só
// grave na obra atual — sem que nenhuma tela precise passar `obra_id` na mão.
//
// Fica fora de src/lib/supabase.js de propósito: aqui não tem `createClient`
// nem `import.meta.env`, então dá para testar em Node puro, sem Vite e sem
// banco. Mesma ideia de src/lib/visitante.js, só que para a obra em vez do
// papel de quem está logado.

// As 20 primeiras têm que bater com a lista de tabelas de
// supabase/migrations/20260921-multiobra-fatia1-preparar.sql. Divergir aqui
// silenciosamente faz uma tabela nova vazar entre obras (fica sem o filtro) ou
// gravar em obra nenhuma sem avisar (fica sem o obra_id no insert). As oito
// últimas (orcamento_itens, medicoes_obra, contas_pagar, recebimentos, obra_contrato,
// orcamento_eap, medicoes_mensais, medicao_itens) já nasceram com obra_id obrigatório
// (migrations 20260922-orcamentos-medicoes.sql, 20260926-contas-pagar-receber.sql e
// 20260927-orcamento-eap-medicao-mensal.sql).
export const TABELAS_DA_OBRA = [
  'ambientes', 'cronograma_itens', 'cronograma_avanco',
  'rdos', 'atividades_rdo', 'efetivo_rdo', 'ocorrencias', 'rdo_fotos',
  'pendencias', 'equipamentos',
  'contratacoes', 'contratacoes_comentarios',
  'projetos', 'projetos_comentarios', 'projetos_dependencias',
  'planta_etapas', 'plantas_visuais', 'planta_marcacoes',
  'reunioes', 'visitas',
  'orcamento_itens', 'medicoes_obra',
  'contas_pagar', 'recebimentos', 'obra_contrato',
  'orcamento_eap', 'medicoes_mensais', 'medicao_itens',
];

// Set à parte para o `.has()` ser O(1): `ehTabelaDaObra` roda em todo
// `supabase.from(...)` do app (são mais de cem chamadas, por CLAUDE.md).
const CONJUNTO_TABELAS_DA_OBRA = new Set(TABELAS_DA_OBRA);
export function ehTabelaDaObra(nome) {
  return CONJUNTO_TABELAS_DA_OBRA.has(nome);
}

// Nome pelo que cada método GANHA, não pelo que já é: os dois filtram por
// `.eq('obra_id', ...)` (leem/mudam só a obra atual); os dois de baixo
// GRAVAM `obra_id` no que a tela mandar. Achou estranho `update` estar na
// lista de cima por "ler"? Ele lê, sim — filtra ANTES de mudar. Se um dia
// ele for para a lista de baixo "porque também escreve", o `.eq` some e a
// tela passa a poder atualizar linha de outra obra: `tests/obra-escopo.mjs`
// tem um teste nomeado só para pegar essa troca.
const METODOS_QUE_FILTRAM_POR_OBRA = ['select', 'update', 'delete'];
const METODOS_QUE_GRAVAM_A_OBRA = ['insert', 'upsert'];

// `obterObraId` é uma função (não um valor) para o Proxy ler sempre a obra
// ATUAL — o cliente embrulhado é criado uma vez só, e a pessoa troca de obra
// muitas vezes na mesma sessão, sem recarregar a página.
export function comEscopoDeObra(cliente, obterObraId) {
  return new Proxy(cliente, {
    get(o, prop) {
      if (prop === 'from') {
        return (tabela) => {
          const consulta = o.from(tabela);
          if (!ehTabelaDaObra(tabela)) return consulta;
          return new Proxy(consulta, {
            get(q, p) {
              const v = q[p];
              if (typeof v !== 'function') return v;

              if (typeof p === 'string' && METODOS_QUE_FILTRAM_POR_OBRA.includes(p)) {
                return (...args) => {
                  const resultado = v.apply(q, args);
                  const id = obterObraId();
                  // Sem obra escolhida ainda (app carregando), ou resultado sem
                  // .eq (ex.: cadeia já fechada) — segue sem filtrar, para não
                  // quebrar; a tela que chamou cedo demais é o bug a caçar.
                  return id && resultado && typeof resultado.eq === 'function'
                    ? resultado.eq('obra_id', id)
                    : resultado;
                };
              }
              if (typeof p === 'string' && METODOS_QUE_GRAVAM_A_OBRA.includes(p)) {
                return (...args) => {
                  const id = obterObraId();
                  if (id && args[0] != null) {
                    args[0] = Array.isArray(args[0])
                      ? args[0].map(linha => ({ ...linha, obra_id: id }))
                      : { ...args[0], obra_id: id };
                  }
                  return v.apply(q, args);
                };
              }
              return v.bind(q);
            },
          });
        };
      }
      const v = o[prop];
      return typeof v === 'function' ? v.bind(o) : v;
    },
  });
}
