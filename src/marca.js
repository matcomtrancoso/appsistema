// Identidade do app num lugar só. Trocar aqui muda o app inteiro.
export const MARCA = {
  nome: 'SISTEMA ENGENHARIA',
  descricao: 'Planejamento e relatórios de obra.',
  // Nome da obra exibido no topo e nos relatórios. Enquanto não vier do
  // cadastro da obra, é aqui que se troca.
  obra: 'NAMPUR MATA - FASE 2 - CASA 12 E 13',
  // Dia em que a obra começou, no formato AAAA-MM-DD (ex.: '2026-03-16'). É daqui que
  // sai o "SEMANA N" do Planejamento, das Visitas e do relatório em PDF. Deixando
  // vazio, o app simplesmente não mostra o número da semana (melhor do que mostrar errado).
  inicioObra: '2026-09-21',
  // Domínio da casa: quem tem e-mail nesse domínio faz login digitando só o
  // nome. Quem tem e-mail de fora digita o endereço inteiro.
  dominioEmail: 'nampur.com.br',
};
