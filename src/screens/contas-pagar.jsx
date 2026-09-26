// Contas a pagar: (1) a mão de obra da equipe própria, por quinzena, sai da
// presença nos RDOs; (2) as demais despesas da obra, lançadas à mão.
// Mestre e engenharia veem e lançam (decisão do dono do produto).
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { hojeLocal, fmtDataBR, rotuloMesAno, somaMesesYM, faixaDoMes } from '../lib/date';
import { fmtV, parseV, fmtCur } from '../lib/moeda.js';
import { quinzenaDe, quinzenaVizinha, rotuloQuinzena, presencasAdm, valorPagamento, linhasDaQuinzena, resumoQuinzena, situacaoDespesa, totaisDespesas } from '../lib/pagar.js';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';
import { Popup, Rodape, campo, rotulo } from '../components/popup-financeiro';

const fmtDia = (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');

const cartaoAviso = { padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 };

// O servidor devolve no máximo 1000 linhas por consulta (max-rows) e NÃO avisa
// quando corta — aqui isso viraria dia de trabalho sem pagar. Lê em páginas até
// vir uma página incompleta. `montar` cria a consulta do zero a cada página.
async function todasAsLinhas(montar, pagina = 1000) {
  const tudo = [];
  for (let de = 0; ; de += pagina) {
    const { data, error } = await montar().range(de, de + pagina - 1);
    if (error) return { data: null, error };
    tudo.push(...(data || []));
    if ((data || []).length < pagina) return { data: tudo, error: null };
  }
}

export function ContasPagarScreen({ goto, voltarPara = 'home' }) {
  const [aba, setAba] = useState('mao');
  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div className="t-micro">FINANCEIRO</div>
        <div className="t-h1">Contas a pagar</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {[['mao', 'Mão de obra'], ['despesas', 'Despesas']].map(([k, nome]) => (
            <button key={k} onClick={() => setAba(k)}
              style={{ flex: 1, height: 42, borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 800,
                border: aba === k ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                background: aba === k ? 'var(--primary-tint)' : 'var(--surface)',
                color: aba === k ? 'var(--primary)' : 'var(--text-2)' }}>{nome}</button>
          ))}
        </div>
      </div>
      <div className="page-pad" style={{ marginTop: 16 }}>
        {aba === 'mao' ? <MaoDeObra /> : <Despesas />}
      </div>
    </div>
  );
}

function Navegador({ texto, onAnterior, onProxima, onHoje, ehAtual }) {
  const botao = { width: 40, height: 40, border: '0.5px solid var(--border)', borderRadius: 10, background: 'var(--surface)',
    color: 'var(--text-2)', cursor: 'pointer', fontSize: 16, fontFamily: 'inherit', flexShrink: 0 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <button onClick={onAnterior} aria-label="Anterior" style={botao}>‹</button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 800, color: 'var(--text-1)' }}>{texto}</div>
      <button onClick={onProxima} aria-label="Próxima" style={botao}>›</button>
      {!ehAtual && (
        <button onClick={onHoje} style={{ ...botao, width: 'auto', padding: '0 12px', fontSize: 12, fontWeight: 800, color: 'var(--primary)' }}>Hoje</button>
      )}
    </div>
  );
}

function Resumo({ itens }) {
  return (
    <div className="card" style={{ padding: '14px 16px', marginBottom: 14, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {itens.map(([nome, valor, cor]) => (
        <div key={nome} style={{ flex: '1 1 90px' }}>
          <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>{nome}</div>
          <div style={{ fontSize: 16, fontWeight: 900, color: cor || 'var(--text-1)' }}>{valor}</div>
        </div>
      ))}
    </div>
  );
}

// ── Mão de obra ─────────────────────────────────────────────────────────────
function MaoDeObra() {
  const hoje = hojeLocal();
  const [quinzena, setQuinzena] = useState(() => quinzenaDe(hoje));
  const [presencas, setPresencas] = useState(null);
  const [pagos, setPagos] = useState([]);
  const [colabs, setColabs] = useState([]);
  const [erro, setErro] = useState('');
  const [pagandoChave, setPagandoChave] = useState(null);   // só a chave: a pessoa é relida de `linhas` a cada render
  const [aberto, setAberto] = useState(null);   // pessoa com a lista de dias aberta
  const [salvandoDiaria, setSalvandoDiaria] = useState(false);
  // Número da última carga pedida: navegar depressa entre quinzenas faz respostas
  // chegarem fora de ordem, e a antiga não pode sobrescrever a atual (senão o
  // "Pagar" gravava os dias de uma quinzena com o rótulo de outra).
  const cargaRef = useRef(0);

  const carregar = useCallback(async () => {
    const minhaVez = ++cargaRef.current;
    const { data: rdos, error: e1 } = await supabase.from('rdos')
      .select('id, data, efetivo_draft').gte('data', quinzena.inicio).lte('data', quinzena.fim);
    const ids = (rdos || []).map(r => r.id);
    const [ef, cb, pg] = await Promise.all([
      ids.length ? todasAsLinhas(() => supabase.from('efetivo_rdo').select('rdo_id, colaborador_id, colaborador_nome, empreiteiro').in('rdo_id', ids)) : { data: [] },
      supabase.from('colaboradores').select('id, nome, valor_diaria'),
      supabase.from('contas_pagar').select('*').eq('tipo', 'mao_de_obra').eq('competencia_inicio', quinzena.inicio),
    ]);
    if (minhaVez !== cargaRef.current) return;   // já pediram outra quinzena
    const falha = e1 || ef.error || cb.error || pg.error;
    if (falha) { setErro(msgAmigavel(falha, 'carregar a mão de obra')); setPresencas(null); setPagos([]); return; }
    setErro('');
    setPresencas(presencasAdm({ rdos: rdos || [], efetivo: ef.data || [] }));
    setColabs(cb.data || []);
    setPagos((pg.data || []).filter(x => x.tipo === 'mao_de_obra'));
  }, [quinzena.inicio, quinzena.fim]);
  useEffect(() => { setPresencas(null); setPagos([]); carregar(); }, [carregar]);

  const linhas = linhasDaQuinzena({ presencas: presencas || [], pagos, colaboradores: colabs });
  const { aPagar, jaPago, semDiaria } = resumoQuinzena(linhas);

  // Devolve se gravou: o campo usa isso para voltar ao valor de verdade quando o banco recusa.
  async function salvarDiaria(p, valor) {
    if (!p.colab) return false;
    setSalvandoDiaria(true);
    const { error } = await supabase.from('colaboradores').update({ valor_diaria: valor }).eq('id', p.colab.id);
    setSalvandoDiaria(false);
    if (error) { avisarErro(error, 'salvar a diária'); return false; }
    setColabs(cs => cs.map(c => (c.id === p.colab.id ? { ...c, valor_diaria: valor } : c)));
    return true;
  }

  const pagando = pagandoChave ? linhas.find(l => l.chave === pagandoChave && !l.pago) : null;

  async function desfazer(p) {
    const x = p.pago;
    if (!x || !confirm(`Desfazer o pagamento de ${p.nome} (${fmtCur(x.valor)})? Ele volta para "a pagar".`)) return;
    const { error } = await supabase.from('contas_pagar').delete().eq('id', x.id);
    if (error) { avisarErro(error, 'desfazer o pagamento'); return; }
    carregar();
  }

  const ehAtual = quinzena.inicio === quinzenaDe(hoje).inicio;

  return (
    <>
      <Navegador texto={rotuloQuinzena(quinzena)} ehAtual={ehAtual}
        onAnterior={() => setQuinzena(q => quinzenaVizinha(q, -1))}
        onProxima={() => setQuinzena(q => quinzenaVizinha(q, 1))}
        onHoje={() => setQuinzena(quinzenaDe(hoje))} />

      <div className="t-caption" style={{ fontSize: 11.5, marginBottom: 12, lineHeight: 1.5 }}>
        {fmtDataBR(quinzena.inicio)} a {fmtDataBR(quinzena.fim)}. Conta como presente quem aparece no efetivo de um RDO
        (enviado ou ainda em rascunho) como <b>ADM (própria)</b> — um dia por pessoa, mesmo com várias atividades.
      </div>

      {erro && <div className="card" style={cartaoAviso}>⚠️ {erro}</div>}
      {presencas === null && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

      {presencas !== null && !erro && (
        <Resumo itens={[['A PAGAR', fmtCur(aPagar)], ['JÁ PAGO', fmtCur(jaPago), 'var(--success)'], ['PESSOAS', linhas.length]]} />
      )}
      {semDiaria > 0 && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--warn-tint, #FEF3C7)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, boxShadow: 'none' }}>
          ℹ️ {semDiaria} {semDiaria === 1 ? 'pessoa está' : 'pessoas estão'} sem valor de diária — preencha abaixo para calcular.
        </div>
      )}

      <div className="stack stack-2">
        {linhas.map(p => {
          const pago = p.pago;
          const dias = pago ? pago.dias : p.dias.length;
          const diaria = pago ? pago.valor_diaria : p.colab?.valor_diaria;
          const { subtotal } = valorPagamento({ dias, valorDiaria: diaria });
          return (
            <div key={p.chave} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-strong" style={{ fontSize: 14 }}>{p.nome}</div>
                  <button onClick={() => setAberto(aberto === p.chave ? null : p.chave)} disabled={!p.dias.length}
                    style={{ border: 0, background: 'none', padding: 0, cursor: p.dias.length ? 'pointer' : 'default', fontFamily: 'inherit',
                      fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                    {dias} {dias === 1 ? 'dia' : 'dias'} presente{p.dias.length ? (aberto === p.chave ? ' ▴' : ' ▾') : ''}
                  </button>
                </div>
                {pago ? (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--success)' }}>{fmtCur(pago.valor)}</div>
                    <div className="t-caption" style={{ fontSize: 10.5 }}>✓ pago em {fmtDataBR(pago.pago_em)}</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{fmtCur(subtotal)}</div>
                    <div className="t-caption" style={{ fontSize: 10.5 }}>{dias} × {fmtCur(diaria || 0)}</div>
                  </div>
                )}
              </div>

              {aberto === p.chave && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                  {p.dias.map(d => (
                    <span key={d} style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', color: 'var(--text-2)' }}>{fmtDia(d)}</span>
                  ))}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                {pago ? (
                  <>
                    <div className="t-caption" style={{ flex: 1, fontSize: 11 }}>
                      diária {fmtCur(pago.valor_diaria)}{Number(pago.ajuste) ? ` · ajuste ${Number(pago.ajuste) > 0 ? '+' : '−'}${fmtCur(Math.abs(pago.ajuste))}` : ''}
                      {p.dias.length !== pago.dias && (
                        <div style={{ color: 'var(--warn)', fontWeight: 700, marginTop: 2 }}>
                          ⚠ pago com {pago.dias} {pago.dias === 1 ? 'dia' : 'dias'}; hoje aparecem {p.dias.length}. Desfaça e pague de novo para corrigir.
                        </div>
                      )}
                    </div>
                    <button onClick={() => desfazer(p)} className="btn btn-ghost btn-sm">Desfazer</button>
                  </>
                ) : (
                  <>
                    <DiariaCampo colab={p.colab} onSalvar={(v) => salvarDiaria(p, v)} />
                    <button className="btn btn-primary btn-sm" disabled={!p.dias.length || !Number(p.colab?.valor_diaria) || salvandoDiaria || presencas === null}
                      onClick={() => setPagandoChave(p.chave)}>Pagar</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {presencas !== null && linhas.length === 0 && !erro && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
          Ninguém da equipe própria apareceu nos RDOs desta quinzena.
        </div>
      )}

      {pagando && (
        <PagarPopup pessoa={pagando} quinzena={quinzena} hoje={hoje} onFechar={() => setPagandoChave(null)}
          onSalvo={() => { setPagandoChave(null); carregar(); }} />
      )}
    </>
  );
}

// A diária tem estado próprio (máscara de moeda) e só grava ao sair do campo.
function DiariaCampo({ colab, onSalvar }) {
  const atual = colab?.valor_diaria;
  const [texto, setTexto] = useState(atual != null ? fmtCur(atual) : '');
  useEffect(() => { setTexto(atual != null ? fmtCur(atual) : ''); }, [atual]);
  if (!colab) {
    return <div className="t-caption" style={{ flex: 1, fontSize: 11 }}>Sem cadastro em Cadastros — não dá para guardar a diária.</div>;
  }
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 3 }}>DIÁRIA</div>
      <input value={texto} placeholder="R$ 0,00" inputMode="numeric"
        onChange={e => setTexto(fmtV(e.target.value))}
        onBlur={async () => {
          const v = parseV(texto);
          if (v === (Number(atual) || null)) return;
          const ok = await onSalvar(v);
          if (!ok) setTexto(atual != null ? fmtCur(atual) : '');
        }}
        style={{ ...campo, height: 38, fontSize: 14, borderRadius: 10 }} />
    </div>
  );
}

function PagarPopup({ pessoa, quinzena, hoje, onFechar, onSalvo }) {
  const diaria = Number(pessoa.colab?.valor_diaria) || 0;
  const [adicional, setAdicional] = useState('');
  const [desconto, setDesconto] = useState('');
  const [pagoEm, setPagoEm] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const { subtotal, total, ajuste } = valorPagamento({ dias: pessoa.dias.length, valorDiaria: diaria, adicional: parseV(adicional) || 0, desconto: parseV(desconto) || 0 });
  const pronto = total >= 0 && !!pagoEm && pessoa.dias.length > 0;

  async function confirmar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    const { error } = await supabase.from('contas_pagar').insert({
      tipo: 'mao_de_obra',
      descricao: `Mão de obra · ${rotuloQuinzena(quinzena)}`,
      colaborador_id: pessoa.colab?.id || pessoa.colaboradorId || null,
      colaborador_nome: pessoa.nome,
      competencia_inicio: quinzena.inicio, competencia_fim: quinzena.fim,
      dias: pessoa.dias.length, valor_diaria: diaria,
      ajuste,
      valor: total, status: 'pago', pago_em: pagoEm,
    });
    setSalvando(false);
    if (error) { avisarErro(error, 'registrar o pagamento'); return; }
    onSalvo();
  }

  return (
    <Popup titulo={`💸 Pagar ${pessoa.nome}`} onFechar={onFechar}>
      <div className="t-caption" style={{ marginBottom: 14 }}>{rotuloQuinzena(quinzena)}</div>
      {quinzena.fim >= hoje && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 12, background: 'var(--warn-tint, #FEF3C7)', boxShadow: 'none', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.45 }}>
          ⚠️ Esta quinzena ainda não terminou. O pagamento fecha com os {pessoa.dias.length} {pessoa.dias.length === 1 ? 'dia' : 'dias'} de agora — dias que entrarem depois não podem ser pagos por aqui sem desfazer este pagamento.
        </div>
      )}
      <div className="card" style={{ padding: '12px 14px', marginBottom: 14, boxShadow: 'none', border: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
          <span>{pessoa.dias.length} {pessoa.dias.length === 1 ? 'dia' : 'dias'} × {fmtCur(diaria)}</span>
          <b>{fmtCur(subtotal)}</b>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={rotulo}>ADICIONAL</div>
          <input value={adicional} onChange={e => setAdicional(fmtV(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" style={campo} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={rotulo}>DESCONTO</div>
          <input value={desconto} onChange={e => setDesconto(fmtV(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" style={campo} />
        </div>
      </div>
      <div style={rotulo}>DATA DO PAGAMENTO</div>
      <input type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} style={{ ...campo, marginBottom: 14 }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>Total a pagar</span>
        <span style={{ fontSize: 20, fontWeight: 900, color: total < 0 ? 'var(--danger)' : 'var(--text-1)' }}>{fmtCur(total)}</span>
      </div>
      <Rodape onFechar={onFechar} onConfirmar={confirmar} pronto={pronto} salvando={salvando} texto="Confirmar pagamento" />
    </Popup>
  );
}

// ── Despesas ────────────────────────────────────────────────────────────────
const CATEGORIAS = ['Material', 'Aluguel', 'Combustível', 'Alimentação', 'Impostos e taxas', 'Transporte', 'Serviços', 'Outros'];

function Despesas() {
  const hoje = hojeLocal();
  const mesAtual = hoje.slice(0, 7);
  const [mes, setMes] = useState(mesAtual);
  const [itens, setItens] = useState(null);
  const [erro, setErro] = useState('');
  const [nova, setNova] = useState(false);

  const cargaRef = useRef(0);   // resposta de um mês que já foi trocado não pode sobrescrever o mês atual
  const carregar = useCallback(() => {
    const minhaVez = ++cargaRef.current;
    const faixa = faixaDoMes(mes);
    supabase.from('contas_pagar').select('*').eq('tipo', 'despesa')
      .gte('vencimento', faixa.inicio).lte('vencimento', faixa.fim).order('vencimento')
      .then(({ data, error }) => {
        if (minhaVez !== cargaRef.current) return;
        if (error) { setErro(msgAmigavel(error, 'carregar as despesas')); setItens([]); return; }
        setErro(''); setItens(data || []);
      });
  }, [mes]);
  useEffect(() => { setItens(null); carregar(); }, [carregar]);

  async function marcar(d, pago) {
    const { error } = await supabase.from('contas_pagar')
      .update(pago ? { status: 'pago', pago_em: hoje } : { status: 'aberto', pago_em: null }).eq('id', d.id);
    if (error) { avisarErro(error, 'atualizar a despesa'); return; }
    carregar();
  }
  async function apagar(d) {
    if (!confirm(`Apagar a despesa "${d.descricao}"?`)) return;
    const { error } = await supabase.from('contas_pagar').delete().eq('id', d.id);
    if (error) { avisarErro(error, 'apagar a despesa'); return; }
    carregar();
  }

  const { emAberto, pagas, total } = totaisDespesas(itens || []);

  return (
    <>
      <Navegador texto={rotuloMesAno(mes)} ehAtual={mes === mesAtual}
        onAnterior={() => setMes(m => somaMesesYM(m, -1))} onProxima={() => setMes(m => somaMesesYM(m, 1))} onHoje={() => setMes(mesAtual)} />
      <button className="btn btn-primary btn-sm" style={{ marginBottom: 14 }} onClick={() => setNova(true)}>
        <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Nova despesa
      </button>

      {erro && <div className="card" style={cartaoAviso}>⚠️ {erro}</div>}
      {itens === null && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}
      {itens !== null && !erro && <Resumo itens={[['EM ABERTO', fmtCur(emAberto), emAberto ? 'var(--warn)' : undefined], ['PAGO', fmtCur(pagas), 'var(--success)'], ['TOTAL', fmtCur(total)]]} />}

      <div className="stack stack-2">
        {(itens || []).map(d => {
          const situacao = situacaoDespesa(d, hoje);
          const vencida = situacao === 'vencida';
          return (
            <div key={d.id} className="card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="t-strong" style={{ fontSize: 14 }}>{d.descricao || '(sem descrição)'}</div>
                  <div className="t-caption" style={{ fontSize: 11.5 }}>
                    {[d.categoria, 'vence ' + fmtDataBR(d.vencimento)].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-1)' }}>{fmtCur(d.valor)}</div>
                  <span style={{ fontSize: 9.5, fontWeight: 800, padding: '2px 7px', borderRadius: 999,
                    background: d.status === 'pago' ? 'var(--success-tint,#DCFCE7)' : vencida ? 'var(--danger-tint,#FEE2E2)' : 'var(--surface-2)',
                    color: d.status === 'pago' ? 'var(--success)' : vencida ? 'var(--danger)' : 'var(--text-2)' }}>
                    {d.status === 'pago' ? `PAGO ${fmtDia(d.pago_em)}` : vencida ? 'VENCIDA' : 'EM ABERTO'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                {d.status === 'aberto'
                  ? <button className="btn btn-primary btn-sm" onClick={() => marcar(d, true)}>Marcar como paga</button>
                  : <button className="btn btn-ghost btn-sm" onClick={() => marcar(d, false)}>Reabrir</button>}
                <button onClick={() => apagar(d)} title="Apagar" aria-label="Apagar a despesa"
                  style={{ width: 38, height: 38, border: 0, borderRadius: 8, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
              </div>
            </div>
          );
        })}
      </div>
      {itens?.length === 0 && !erro && (
        <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhuma despesa com vencimento em {rotuloMesAno(mes)}.</div>
      )}

      {nova && <NovaDespesaPopup hoje={hoje} mesPadrao={mes} onFechar={() => setNova(false)} onSalvo={() => { setNova(false); carregar(); }} />}
    </>
  );
}

function NovaDespesaPopup({ hoje, mesPadrao, onFechar, onSalvo }) {
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState('');
  const [valor, setValor] = useState('');
  const [vencimento, setVencimento] = useState(mesPadrao === hoje.slice(0, 7) ? hoje : `${mesPadrao}-01`);
  const [jaPaga, setJaPaga] = useState(false);
  const [pagoEm, setPagoEm] = useState(hoje);
  const [salvando, setSalvando] = useState(false);
  const v = parseV(valor);
  const pronto = descricao.trim().length > 0 && v > 0 && !!vencimento && (!jaPaga || !!pagoEm);

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    const { error } = await supabase.from('contas_pagar').insert({
      tipo: 'despesa', descricao: descricao.trim(), categoria: categoria.trim(), valor: v, vencimento,
      status: jaPaga ? 'pago' : 'aberto', pago_em: jaPaga ? pagoEm : null,
    });
    setSalvando(false);
    if (error) { avisarErro(error, 'salvar a despesa'); return; }
    onSalvo();
  }

  return (
    <Popup titulo="🧾 Nova despesa" onFechar={onFechar}>
      <div style={rotulo}>DESCRIÇÃO *</div>
      <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Cimento CP-II, 40 sacos" style={{ ...campo, marginBottom: 14 }} />
      <div style={rotulo}>CATEGORIA</div>
      <input value={categoria} onChange={e => setCategoria(e.target.value)} list="categorias-despesa" placeholder="Escolha ou digite" style={{ ...campo, marginBottom: 14 }} />
      <datalist id="categorias-despesa">{CATEGORIAS.map(c => <option key={c} value={c} />)}</datalist>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={rotulo}>VALOR *</div>
          <input value={valor} onChange={e => setValor(fmtV(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" style={campo} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={rotulo}>VENCIMENTO *</div>
          <input type="date" value={vencimento} onChange={e => setVencimento(e.target.value)} style={campo} />
        </div>
      </div>
      <button onClick={() => setJaPaga(x => !x)}
        style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, marginBottom: jaPaga ? 10 : 18,
          padding: '11px 13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
          border: jaPaga ? '2px solid var(--primary)' : '1.5px solid var(--border)', background: jaPaga ? 'var(--primary-tint)' : 'var(--surface-2)' }}>
        <span style={{ width: 22, height: 22, borderRadius: 7, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900,
          background: jaPaga ? 'var(--primary)' : 'transparent', color: '#fff', border: jaPaga ? 'none' : '1px solid var(--border)' }}>{jaPaga ? '✓' : ''}</span>
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--text-1)' }}>Já foi paga</span>
      </button>
      {jaPaga && (
        <>
          <div style={rotulo}>DATA DO PAGAMENTO</div>
          <input type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} style={{ ...campo, marginBottom: 18 }} />
        </>
      )}
      <Rodape onFechar={onFechar} onConfirmar={salvar} pronto={pronto} salvando={salvando} texto="Salvar despesa" />
    </Popup>
  );
}
