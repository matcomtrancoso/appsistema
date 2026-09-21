// Comparação das caixas de busca do app.
//
// Quem digita no celular, no canteiro, quase nunca acentua: "hidrau" tem que
// achar "Hidráulica", e "reboco" tem que achar "Rebôco" e "REBOCO". Caixa alta,
// acento e espaço a mais não podem esconder o resultado.
//
// Mora em lib e não dentro das telas porque é regra pura, sem React — assim o
// teste roda no Node direto, sem bundler. A limpeza do texto é a mesma da
// leitura da planilha (`normalizar`), para as duas não divergirem.
import { normalizar } from './planilha-semanal.js';

// Para quem precisa do texto limpo e não só do "contém" (ex.: casar por palavra).
export { normalizar };

// true se `texto` contém o termo. `texto` ausente (null/undefined) só casa com
// termo vazio, e termo vazio casa com tudo — a tela decide se "sem busca"
// mostra a lista inteira.
export function contem(texto, termo) {
  return normalizar(texto).includes(normalizar(termo));
}
