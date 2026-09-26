// Dados fictícios do modo demonstração. Obra inventada, pessoas inventadas.
// Trocar aqui muda o que aparece nas telas quando VITE_DEMO=1.

const hoje = new Date();
const iso = (d) => d.toISOString().slice(0, 10);
const maisDias = (n) => { const d = new Date(hoje); d.setDate(d.getDate() + n); return iso(d); };

export const PERFIL_DEMO = {
  id: 'demo-user',
  email: 'joao@flowplanner.app',
  nome: 'João',
  role: 'engenheiro',
  is_admin: true,
};

const EMPREITEIROS = [
  { id: 'e1', nome: 'Alvenaria Souza', cor: '#136066' },
  { id: 'e2', nome: 'Elétrica Nova Luz', cor: '#1A7C83' },
  { id: 'e3', nome: 'Hidráulica Prime', cor: '#9A6700' },
];

const COLABORADORES = [
  { id: 'c1', nome: 'Carlos Menezes',  funcao: 'Pedreiro',   empreiteiro_id: 'e1', empreiteiro: EMPREITEIROS[0], valor_diaria: 180 },
  { id: 'c2', nome: 'Rafael Duarte',   funcao: 'Servente',   empreiteiro_id: 'e1', empreiteiro: EMPREITEIROS[0], valor_diaria: 120 },
  { id: 'c3', nome: 'Marina Alves',    funcao: 'Eletricista', empreiteiro_id: 'e2', empreiteiro: EMPREITEIROS[1] },
  { id: 'c4', nome: 'Pedro Bastos',    funcao: 'Encanador',  empreiteiro_id: 'e3', empreiteiro: EMPREITEIROS[2] },
  { id: 'c5', nome: 'Lucas Ferreira',  funcao: 'Pedreiro',   empreiteiro_id: 'e1', empreiteiro: EMPREITEIROS[0] },
];

const RDO_HOJE = 'r1';

export const DADOS_DEMO = {
  profiles: [PERFIL_DEMO],

  empreiteiros: EMPREITEIROS,
  colaboradores: COLABORADORES,

  ambientes: [
    { id: 'a1', nome: 'Térreo',     ordem: 1 },
    { id: 'a2', nome: '1º Pavimento', ordem: 2 },
    { id: 'a3', nome: '2º Pavimento', ordem: 3 },
    { id: 'a4', nome: 'Área externa', ordem: 4 },
  ],

  relatorio_semanal_config: [{
    id: 'cfg', obra_codigo: 'OBRA-01', cliente: 'Cliente Exemplo Ltda.',
    obra_local: 'Rua das Palmeiras, 100 — São Paulo/SP',
    arquiteto: 'Estúdio Norte Arquitetura', logo_url: null,
  }],

  // Fatia 2 do multi-obra: uma obra só no demo (o modo demo ignora filtro, então
  // uma segunda obra fictícia aqui não provaria nada — a troca de verdade se
  // testa no banco real, com impersonação. Ver CLAUDE.md).
  obras: [{
    id: 'demo-obra-1', nome: 'Residencial Aurora (demo)', codigo: 'OBRA-01',
    localizacao: 'Rua das Palmeiras, 100 — São Paulo/SP', cliente: 'Cliente Exemplo Ltda.',
    arquiteto: 'Estúdio Norte Arquitetura', data_inicio: maisDias(-90),
    capa_padrao_url: null, assinaturas: [], ativa: true,
  }],

  rdos: [
    { id: RDO_HOJE, data: iso(hoje), submetido: false, submetido_por_nome: null, efetivo_draft: [{ nome: 'Carlos Menezes', colab_id: 'c1', empresa_nome: 'ADM (própria)', is_adm: true }, { nome: 'Rafael Duarte', colab_id: 'c2', empresa_nome: 'ADM (própria)', is_adm: true }] },
    { id: 'r2', data: maisDias(-1), submetido: true, submetido_por_nome: 'João', efetivo_draft: [{ nome: 'Carlos Menezes', colab_id: 'c1', empresa_nome: 'ADM (própria)', is_adm: true }, { nome: 'Rafael Duarte', colab_id: 'c2', empresa_nome: 'ADM (própria)', is_adm: true }] },
    { id: 'r3', data: maisDias(-2), submetido: true, submetido_por_nome: 'João', efetivo_draft: [{ nome: 'Carlos Menezes', colab_id: 'c1', empresa_nome: 'ADM (própria)', is_adm: true }] },
  ],

  atividades_rdo: [
    { id: 'at1', rdo_id: RDO_HOJE, descricao: 'Alvenaria de vedação — eixo 3 a 7', ambiente: '1º Pavimento', empreiteiro: 'Alvenaria Souza', status: 'em_andamento', status_por_dia: {}, dias_semana: [] },
    { id: 'at2', rdo_id: RDO_HOJE, descricao: 'Infra elétrica de laje', ambiente: '2º Pavimento', empreiteiro: 'Elétrica Nova Luz', status: 'feita', status_por_dia: {}, dias_semana: [] },
    { id: 'at3', rdo_id: RDO_HOJE, descricao: 'Prumada hidráulica — banheiros', ambiente: '1º Pavimento', empreiteiro: 'Hidráulica Prime', status: 'pendente', status_por_dia: {}, dias_semana: [] },
    { id: 'at4', rdo_id: RDO_HOJE, descricao: 'Contrapiso da área externa', ambiente: 'Área externa', empreiteiro: 'Alvenaria Souza', status: 'nao_feita', motivo_nao_exec: 'm1', status_por_dia: {}, dias_semana: [] },
    { id: 'at5', rdo_id: RDO_HOJE, descricao: 'Chapisco do térreo', ambiente: 'Térreo', empreiteiro: 'Alvenaria Souza', status: 'feita', status_por_dia: {}, dias_semana: [] },
  ],

  efetivo_rdo: COLABORADORES.map((c, i) => ({
    id: `ef${i}`, rdo_id: RDO_HOJE, colaborador_id: c.id, colaborador_nome: c.nome,
    empreiteiro: EMPREITEIROS.find(e => e.id === c.empreiteiro_id)?.nome,
    atividade_descricao: 'Frente do dia', funcao: c.funcao,
  })),

  ocorrencias: [
    { id: 'o1', rdo_id: RDO_HOJE, descricao: 'Chuva forte das 13h às 15h — frente externa parada.', tipo: 'clima', created_at: new Date().toISOString() },
  ],

  pendencias: [
    { id: 'p1', titulo: 'Definir ponto de tomada da bancada', descricao: 'Falta posição no projeto elétrico.', status: 'aberta', prioridade: 'alta', ambiente: '1º Pavimento', empresa: 'Estúdio Norte', prazo: maisDias(3), created_at: new Date().toISOString() },
    { id: 'p2', titulo: 'Reapertar fôrma do pilar P12', descricao: 'Conferido na visita de segunda.', status: 'em_andamento', prioridade: 'media', ambiente: 'Térreo', empresa: 'Alvenaria Souza', prazo: maisDias(1), created_at: new Date().toISOString() },
    { id: 'p3', titulo: 'Furo de passagem sem vedação', descricao: 'Shaft do 2º pavimento.', status: 'atrasada', prioridade: 'alta', ambiente: '2º Pavimento', empresa: 'Hidráulica Prime', prazo: maisDias(-2), created_at: new Date().toISOString() },
    { id: 'p4', titulo: 'Limpeza da área de descarga', descricao: '', status: 'resolvida', prioridade: 'baixa', ambiente: 'Área externa', empresa: 'Alvenaria Souza', prazo: maisDias(-5), created_at: new Date().toISOString() },
  ],

  equipamentos: [
    { id: 'q1', nome: 'Betoneira 400L', tipo_locacao: 'mensal', status: 'ativo', fornecedor: 'Loc Máquinas', data_inicio: maisDias(-40), data_fim_previsto: maisDias(5), valor_mensal: 780 },
    { id: 'q2', nome: 'Andaime fachadeiro (120 m²)', tipo_locacao: 'mensal', status: 'ativo', fornecedor: 'Andaimes SP', data_inicio: maisDias(-20), data_fim_previsto: maisDias(25), valor_mensal: 2400 },
    { id: 'q3', nome: 'Compactador de solo', tipo_locacao: 'diaria', status: 'devolvido', fornecedor: 'Loc Máquinas', data_inicio: maisDias(-60), data_fim_previsto: maisDias(-50), valor_mensal: 0 },
  ],

  contratacoes: [
    { id: 'k1', descricao: 'Esquadrias de alumínio', responsavel_nome: 'João', fornecedor_nome: 'Alumínio Vale', status: 'aprovado', prazo_envio: maisDias(-10), data_envio: maisDias(-12), data_aprovacao: maisDias(-4), valor_contrato: 86000 },
    { id: 'k2', descricao: 'Impermeabilização de lajes', responsavel_nome: 'João', fornecedor_nome: 'Imperm Brasil', status: 'enviado', prazo_envio: maisDias(2), data_envio: maisDias(-1), data_aprovacao: null, valor_contrato: 34500 },
    { id: 'k3', descricao: 'Pintura interna', responsavel_nome: 'João', fornecedor_nome: null, status: 'aberto', prazo_envio: maisDias(9), data_envio: null, data_aprovacao: null, valor_contrato: null },
  ],

  // Fatia orçamentos/medições: itens do orçamento de uma contratação (k1) e
  // um histórico curto de medições da obra.
  orcamento_itens: [
    { id: 'oi1', contratacao_id: 'k1', descricao: 'Janela de correr 2 folhas', unidade: 'un', quantidade: 18, preco_unitario: 1450, ordem: 0 },
    { id: 'oi2', contratacao_id: 'k1', descricao: 'Porta balcão', unidade: 'un', quantidade: 6, preco_unitario: 2200, ordem: 1 },
    { id: 'oi3', contratacao_id: 'k1', descricao: 'Instalação e vedação', unidade: 'vb', quantidade: 1, preco_unitario: 8600, ordem: 2 },
  ],
  // Financeiro: valor fechado, recebimentos e despesas. (O demo ignora filtros,
  // então a mão de obra paga não entra aqui — a tela filtra por tipo também.)
  obra_contrato: [{ id: 'oc1', valor_aprovado: 480000, aprovado_em: maisDias(-100), observacoes: 'Proposta 12' }],
  recebimentos: [
    { id: 'rc2', data: maisDias(-8), valor: 60000, descricao: '2ª medição' },
    { id: 'rc1', data: maisDias(-38), valor: 48000, descricao: '1ª medição' },
  ],
  contas_pagar: [
    { id: 'cp1', tipo: 'despesa', descricao: 'Cimento CP-II — 40 sacos', categoria: 'Material', valor: 1680, vencimento: maisDias(3), status: 'aberto', pago_em: null },
    { id: 'cp2', tipo: 'despesa', descricao: 'Aluguel do container', categoria: 'Aluguel', valor: 900, vencimento: maisDias(-2), status: 'pago', pago_em: maisDias(-2) },
  ],

  // Ordem já do mais recente pro mais antigo: o modo demo ignora .order()
  // (ver src/lib/demo.js), então a lista só sai na ordem certa se já nascer
  // assim aqui.
  medicoes_obra: [
    { id: 'md3', data: maisDias(-1), percentual: 65, observacoes: 'Alvenaria do 2º pavimento iniciada.', responsavel_nome: 'João' },
    { id: 'md2', data: maisDias(-15), percentual: 58, observacoes: null, responsavel_nome: 'Paulo' },
    { id: 'md1', data: maisDias(-30), percentual: 52, observacoes: 'Estrutura avançando conforme planejado.', responsavel_nome: 'Paulo' },
  ],

  projetos: [
    { id: 'j1', nome: 'Elétrico — pavimento tipo R03', disciplina: 'Elétrica', status: 'recebido', data_prevista: maisDias(-6), data_recebimento: maisDias(-7), projetista: 'Estúdio Norte', oculto: false },
    { id: 'j2', nome: 'Hidrossanitário — prumadas R02', disciplina: 'Hidráulica', status: 'atrasado', data_prevista: maisDias(-3), data_recebimento: null, projetista: 'HidroProj', oculto: false },
    { id: 'j3', nome: 'Estrutural — escada', disciplina: 'Estrutura', status: 'previsto', data_prevista: maisDias(12), data_recebimento: null, projetista: 'Calculo & Cia', oculto: false },
  ],
  projetos_comentarios: [],
  projetos_dependencias: [],

  cronograma_itens: [
    { id: 'g1', wbs_id: '1',   nome: 'Fundação',   is_grupo: true,  percentual: 100, concluido: true,  inicio_previsto: maisDias(-90), termino_previsto: maisDias(-50), inicio_real: maisDias(-90), duracao_dias: 40 },
    { id: 'g2', wbs_id: '2',   nome: 'Estrutura',  is_grupo: true,  percentual: 72,  concluido: false, inicio_previsto: maisDias(-50), termino_previsto: maisDias(10),  inicio_real: maisDias(-48), duracao_dias: 60 },
    { id: 'g3', wbs_id: '2.1', nome: 'Pilares e vigas', is_grupo: false, percentual: 90, concluido: false, inicio_previsto: maisDias(-50), termino_previsto: maisDias(-5), inicio_real: maisDias(-48), duracao_dias: 45 },
    { id: 'g4', wbs_id: '2.2', nome: 'Lajes',      is_grupo: false, percentual: 55,  concluido: false, inicio_previsto: maisDias(-20), termino_previsto: maisDias(10),  inicio_real: maisDias(-18), duracao_dias: 30 },
    { id: 'g5', wbs_id: '3',   nome: 'Alvenaria',  is_grupo: true,  percentual: 18,  concluido: false, inicio_previsto: maisDias(-10), termino_previsto: maisDias(45),  inicio_real: maisDias(-8),  duracao_dias: 55 },
  ],
  cronograma_avanco: [],

  visitas: [
    { id: 'v1', data: maisDias(-3), titulo: 'Visita técnica — arquitetura', local: 'Canteiro', pauta: 'Compatibilização do 2º pavimento.', created_at: new Date().toISOString() },
    { id: 'v2', data: maisDias(-10), titulo: 'Visita do cliente', local: 'Canteiro', pauta: 'Andamento geral e prazos.', created_at: new Date().toISOString() },
  ],
  visitas_dir_empresas: [
    { id: 'de1', nome: 'Estúdio Norte Arquitetura' },
    { id: 'de2', nome: 'Cliente Exemplo Ltda.' },
  ],
  visitas_dir_pessoas: [
    { id: 'dp1', empresa_id: 'de1', nome: 'Helena Prado', cargo: 'Arquiteta' },
    { id: 'dp2', empresa_id: 'de2', nome: 'Roberto Lima', cargo: 'Diretor' },
  ],
  reunioes: [
    { id: 'm1', data: maisDias(-3), titulo: 'Compatibilização 2º pavimento', tipo: 'visita' },
  ],

  fotos: [],
  rdo_fotos: [],
  plantas_visuais: [],
  planta_marcacoes: [],
  planta_etapas: [],
  planejador_projetos: [],
  planejador_ignorados: [],
  materiais: [],
};
