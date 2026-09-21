// Constantes fixas — não vêm do banco de dados

// Os ids ficam gravados em atividades_rdo.motivo_nao_exec, então m1..m6 não
// mudam de significado — só de rótulo e de ordem. Os novos entram de m7 pra frente.
export const MOTIVOS_NAO_EXEC = [
  { id: 'm2',  nome: 'Falta de material' },
  { id: 'm4',  nome: 'Falta de frente liberada' },
  { id: 'm7',  nome: 'Falta de mão de obra' },
  { id: 'm8',  nome: 'Falta de energia' },
  { id: 'm9',  nome: 'Falta de água' },
  { id: 'm10', nome: 'Falta de projeto' },
  { id: 'm3',  nome: 'Retrabalho' },
  { id: 'm1',  nome: 'Chuva' },
  { id: 'm5',  nome: 'Equipamento indisponível' },
  { id: 'm6',  nome: 'Outro' },
];

