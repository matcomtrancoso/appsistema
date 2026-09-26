// Medições: ao fim de cada mês, o % ACUMULADO executado de cada linha do
// orçamento da obra. O valor do mês é o que avançou desde o mês anterior:
// preço da linha × (% agora − % do mês anterior). Fechar o mês trava os
// números e passa o valor para o Contas a receber.
// Mestre e engenharia usam esta tela (é o mestre quem costuma medir no campo).
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { hojeLocal, rotuloMesAno, somaMesesYM } from '../lib/date';
import { contem } from '../lib/busca';
import { fmtCur, fmtPct } from '../lib/moeda.js';
import { numeroBR, ordenarEap, nivel, orcamentoAprovado, linhasVisiveis } from '../lib/eap.js';
import {
  primeiroDia, ymDe, mapaDePercentuais, calcularMedicao, validarPercentual,
  podeAbrirMes, podeReabrir, percentuaisAntesDe,
} from '../lib/medicao-mensal.js';
import { todasAsLinhas } from '../lib/paginar.js';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';
import { campo } from '../components/popup-financeiro';

const txtPct = (n) => String(n).replace('.', ',');

export function MedicoesScreen({ goto, profile, voltarPara = 'home' }) {
  const hoje = hojeLocal();
  const [linhas, setLinhas] = useState(null);
  const [contrato, setContrato] = useState(null);
  const [medicoes, setMedicoes] = useState([]);
  const [itens, setItens] = useState([]);
  const [erro, setErro] = useState('');
  const [ym, setYm] = useState(null);
  const [rascunho, setRascunho] = useState({});   // eap_id -> texto digitado (ainda não gravado)
  const [erros, setErros] = useState({});         // eap_id -> mensagem
  const [busca, setBusca] = useState('');
  const [fechados, setFechados] = useState(() => new Set());
  const [ocupado, setOcupado] = useState(false);
  const cargaRef = useRef(0);

  const carregar = useCallback(async () => {
    const minhaVez = ++cargaRef.current;
    const [l, c, m, i] = await Promise.all([
      todasAsLinhas(() => supabase.from('orcamento_eap').select('*').order('ordem')),
      supabase.from('obra_contrato').select('*').maybeSingle(),
      supabase.from('medicoes_mensais').select('*').order('mes'),
      todasAsLinhas(() => supabase.from('medicao_itens').select('*').order('id')),
    ]);
    if (minhaVez !== cargaRef.current) return;
    const falha = l.error || c.error || m.error || i.error;
    if (falha) { setErro(msgAmigavel(falha, 'carregar as medições')); return; }
    setErro('');
    setLinhas(ordenarEap(l.data || []));
    setContrato(c.data || null);
    setMedicoes(m.data || []);
    setItens(i.data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // mês em foco: o aberto, senão o seguinte ao último fechado, senão o mês de hoje
  useEffect(() => {
    if (ym || linhas === null) return;
    const aberta = medicoes.find(m => m.status !== 'fechada');
    const ultima = medicoes.at(-1);
    setYm(aberta ? ymDe(aberta.mes) : ultima ? somaMesesYM(ymDe(ultima.mes), 1) : hoje.slice(0, 7));
  }, [linhas, medicoes, ym, hoje]);

  const medicao = ym ? medicoes.find(m => ymDe(m.mes) === ym) : null;
  const aberta = medicao && medicao.status !== 'fechada';
  const fechada = medicao && medicao.status === 'fechada';

  const base = useMemo(() => (ym ? percentuaisAntesDe(medicoes, itens, ym) : new Map()), [medicoes, itens, ym]);
  const gravados = useMemo(() => (medicao ? mapaDePercentuais(itens, medicao.id) : new Map()), [itens, medicao]);
  // o que vale na conta: o gravado, com o digitado por cima quando é um número aceitável
  const atuais = useMemo(() => {
    const m = new Map(gravados);
    for (const [id, txt] of Object.entries(rascunho)) {
      const n = numeroBR(txt);
      if (!Number.isNaN(n) && validarPercentual(n, base.get(id) ?? 0) === null) m.set(id, n);
    }
    return m;
  }, [gravados, rascunho, base]);
  const conta = useMemo(() => calcularMedicao({ linhas: linhas || [], atuais, anteriores: base }), [linhas, atuais, base]);

  // ao trocar de mês ou de obra, some o que estava sendo digitado
  useEffect(() => { setRascunho({}); setErros({}); }, [ym]);

  const visiveis = useMemo(() => {
    const todas = linhas || [];
    if (busca.trim()) return todas.filter(l => !l.is_grupo && (contem(l.descricao, busca) || contem(l.codigo, busca)));
    return linhasVisiveis(todas, fechados);
  }, [linhas, busca, fechados]);
  const alternar = (codigo) => setFechados(s => { const n = new Set(s); n.has(codigo) ? n.delete(codigo) : n.add(codigo); return n; });

  const aprovado = orcamentoAprovado(contrato);
  const podeAbrir = ym ? podeAbrirMes(medicoes, ym) : { ok: false };
  const podeReabrirEste = ym ? podeReabrir(medicoes, ym) : { ok: false };

  async function abrirMes() {
    if (!podeAbrir.ok || ocupado) return;
    setOcupado(true);
    const { error } = await supabase.from('medicoes_mensais').insert({ mes: primeiroDia(ym), status: 'aberta' });
    setOcupado(false);
    if (error) { avisarErro(error, 'abrir a medição'); return; }
    carregar();
  }

  // grava o % de uma linha (ao sair do campo)
  async function gravar(l, txt) {
    if (!aberta) return;
    const anterior = base.get(l.id) ?? 0;
    const n = numeroBR(txt);
    const msg = Number.isNaN(n) ? 'Digite um número de 0 a 100.' : validarPercentual(n, anterior);
    setErros(e => ({ ...e, [l.id]: msg || '' }));
    if (msg) return;
    if (gravados.get(l.id) === n) { setRascunho(r => { const c = { ...r }; delete c[l.id]; return c; }); return; }
    if (!gravados.has(l.id) && n === anterior) { setRascunho(r => { const c = { ...r }; delete c[l.id]; return c; }); return; }
    const { error } = await supabase.from('medicao_itens').upsert(
      { medicao_id: medicao.id, eap_id: l.id, percentual_acumulado: n }, { onConflict: 'medicao_id,eap_id' });
    if (error) { setErros(e => ({ ...e, [l.id]: msgAmigavel(error, 'salvar o percentual') })); return; }
    setItens(lista => [...lista.filter(x => !(x.medicao_id === medicao.id && x.eap_id === l.id)),
      { medicao_id: medicao.id, eap_id: l.id, percentual_acumulado: n }]);
    setRascunho(r => { const c = { ...r }; delete c[l.id]; return c; });
  }

  async function fecharMes() {
    if (!aberta || ocupado) return;
    if (Object.keys(rascunho).length) { alert('Tem percentual digitado que ainda não foi salvo. Saia do campo (toque fora) e tente de novo.'); return; }
    if (Object.values(erros).some(Boolean)) { alert('Corrija os percentuais marcados em vermelho antes de fechar o mês.'); return; }
    const t = conta.total;
    if (!confirm(`Fechar a medição de ${rotuloMesAno(ym)}?\n\nMedido no mês: ${fmtCur(t.medidoNoMes)}\nAcumulado: ${fmtCur(t.medidoAcumulado)} (${fmtPct(t.pctGeral)})\n\nDepois de fechado os números ficam travados e o valor do mês entra no Contas a receber.`)) return;
    setOcupado(true);
    const { error } = await supabase.from('medicoes_mensais')
      .update({ status: 'fechada', fechada_em: new Date().toISOString(), fechada_por_nome: profile?.nome || null }).eq('id', medicao.id);
    setOcupado(false);
    if (error) { avisarErro(error, 'fechar a medição'); return; }
    carregar();
  }

  async function reabrirMes() {
    if (!podeReabrirEste.ok || ocupado) return;
    if (!confirm(`Reabrir a medição de ${rotuloMesAno(ym)}?\n\nO valor deste mês sai do Contas a receber até você fechar de novo.`)) return;
    setOcupado(true);
    const { error } = await supabase.from('medicoes_mensais').update({ status: 'aberta', fechada_em: null, fechada_por_nome: null }).eq('id', medicao.id);
    setOcupado(false);
    if (error) { avisarErro(error, 'reabrir a medição'); return; }
    carregar();
  }

  async function apagarMes() {
    if (!aberta || ocupado) return;
    if (!confirm(`Apagar a medição aberta de ${rotuloMesAno(ym)} e tudo o que foi lançado nela?`)) return;
    setOcupado(true);
    const { error } = await supabase.from('medicoes_mensais').delete().eq('id', medicao.id);
    setOcupado(false);
    if (error) { avisarErro(error, 'apagar a medição'); return; }
    carregar();
  }

  const t = conta.total;
  const semOrcamento = linhas !== null && (!linhas.length || !aprovado);

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div className="t-micro">ACOMPANHAMENTO</div>
        <div className="t-h1">Medições</div>
      </div>

      <div className="page-pad" style={{ marginTop: 14 }}>
        {erro && (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            ⚠️ {erro}
            <div><button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={carregar}>Tentar de novo</button></div>
          </div>
        )}
        {linhas === null && !erro && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

        {semOrcamento && !erro && (
          <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.5 }}>
            <div style={{ fontSize: 30, marginBottom: 6 }}>🧮</div>
            {!linhas.length
              ? <>A medição mede cada linha do <b>orçamento da obra</b>, e o orçamento ainda não foi criado.</>
              : <>O orçamento da obra ainda não foi <b>aprovado</b>. Aprove-o para começar a medir.</>}
            {goto && profile?.role !== 'mestre' && (
              <div style={{ marginTop: 12 }}><button className="btn btn-primary btn-sm" onClick={() => goto('orcamento-obra')}>Abrir o orçamento da obra</button></div>
            )}
            {profile?.role === 'mestre' && <div className="t-caption" style={{ marginTop: 8 }}>Peça à engenharia para montar e aprovar o orçamento.</div>}
          </div>
        )}

        {linhas !== null && !semOrcamento && ym && (
          <>
            {/* Navegador de mês */}
            <div className="card" style={{ padding: '10px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-ghost btn-sm" aria-label="Mês anterior" onClick={() => setYm(somaMesesYM(ym, -1))}>‹</button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontSize: 16, fontWeight: 900, textTransform: 'capitalize' }}>{rotuloMesAno(ym)}</div>
                <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', color: fechada ? 'var(--success)' : aberta ? 'var(--primary)' : 'var(--text-3)' }}>
                  {fechada ? '✓ FECHADA' : aberta ? 'ABERTA' : 'NÃO INICIADA'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" aria-label="Próximo mês" onClick={() => setYm(somaMesesYM(ym, 1))}>›</button>
            </div>

            {!medicao && (
              <div className="card" style={{ padding: 18, textAlign: 'center', marginBottom: 12 }}>
                <div className="t-caption" style={{ fontSize: 12.5, marginBottom: 10, lineHeight: 1.5 }}>
                  {podeAbrir.ok ? `Nenhuma medição em ${rotuloMesAno(ym)} ainda.` : podeAbrir.motivo}
                </div>
                {podeAbrir.ok && <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={abrirMes}>Abrir medição de {rotuloMesAno(ym)}</button>}
              </div>
            )}

            {medicao && (
              <>
                {/* Totais do mês */}
                <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
                    <Numero nome="MEDIDO NO MÊS" valor={fmtCur(t.medidoNoMes)} cor="var(--primary)" />
                    <Numero nome="ACUMULADO" valor={fmtCur(t.medidoAcumulado)} />
                    <Numero nome="AVANÇO GERAL" valor={fmtPct(t.pctGeral)} />
                    <Numero nome="FALTA MEDIR" valor={fmtCur(t.valorTotal - t.medidoAcumulado)} />
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                    {aberta && <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={fecharMes}>Fechar mês</button>}
                    {aberta && <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={apagarMes}>Apagar medição</button>}
                    {fechada && podeReabrirEste.ok && <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={reabrirMes}>Reabrir</button>}
                    {fechada && <button className="btn btn-ghost btn-sm" onClick={() => goto('receber')}>Contas a receber</button>}
                  </div>
                  {fechada && (
                    <div className="t-caption" style={{ fontSize: 11, marginTop: 8 }}>
                      Fechada{medicao.fechada_por_nome ? ` por ${medicao.fechada_por_nome}` : ''}.{!podeReabrirEste.ok ? ' Só a última medição pode ser reaberta.' : ''}
                    </div>
                  )}
                  {aberta && <div className="t-caption" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45 }}>
                    Digite o <b>% acumulado</b> de cada linha (o total executado até o fim do mês, não só o do mês). O valor do mês é o que passou do mês anterior.
                  </div>}
                </div>

                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou descrição…"
                  style={{ ...campo, height: 42, fontSize: 14, marginBottom: 10 }} />

                <div className="stack stack-1" style={{ gap: 6 }}>
                  {visiveis.map(l => {
                    if (l.is_grupo) {
                      const g = conta.porGrupo.get(l.codigo);
                      const recolhido = fechados.has(l.codigo);
                      return (
                        <div key={l.id} className="card" style={{ padding: '9px 12px', marginLeft: Math.min(nivel(l.codigo) - 1, 4) * 12, background: 'var(--surface-2)', boxShadow: 'none', border: '0.5px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => alternar(l.codigo)} aria-label={recolhido ? 'Abrir grupo' : 'Recolher grupo'}
                              style={{ border: 0, background: 'none', cursor: 'pointer', width: 22, height: 22, padding: 0, color: 'var(--text-3)', fontSize: 12 }}>{recolhido ? '▸' : '▾'}</button>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, lineHeight: 1.3 }}>
                              <span style={{ color: 'var(--text-3)', marginRight: 6 }}>{l.codigo}</span>{l.descricao}
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 900 }}>{fmtPct(g?.pctAcum || 0)}</div>
                              <div className="t-caption" style={{ fontSize: 10.5 }}>mês {fmtCur(g?.valorNoMes || 0)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    const c = conta.porLinha.get(l.id);
                    const anterior = base.get(l.id) ?? 0;
                    const valor = rascunho[l.id] ?? (atuais.has(l.id) ? txtPct(atuais.get(l.id)) : (anterior ? txtPct(anterior) : ''));
                    const msg = erros[l.id];
                    return (
                      <div key={l.id} className="card" style={{ padding: '9px 12px', marginLeft: busca ? 0 : Math.min(nivel(l.codigo) - 1, 4) * 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>
                              <span style={{ color: 'var(--text-3)', fontWeight: 800, marginRight: 6 }}>{l.codigo}</span>{l.descricao}
                            </div>
                            <div className="t-caption" style={{ fontSize: 11, marginTop: 2 }}>
                              {fmtCur(c.valorLinha)}{anterior ? ` · mês anterior ${fmtPct(anterior)}` : ''}
                              {c.valorNoMes ? <b style={{ color: 'var(--primary)' }}> · no mês {fmtCur(c.valorNoMes)}</b> : null}
                            </div>
                          </div>
                          {aberta ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <input value={valor} inputMode="decimal" aria-label={`Percentual acumulado de ${l.codigo}`}
                                onChange={e => setRascunho(r => ({ ...r, [l.id]: e.target.value }))}
                                onBlur={() => rascunho[l.id] !== undefined && gravar(l, rascunho[l.id])}
                                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                style={{ ...campo, width: 64, height: 38, padding: '0 8px', fontSize: 14, textAlign: 'right', borderColor: msg ? 'var(--danger)' : 'var(--border)' }} />
                              <span style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700 }}>%</span>
                              <button onMouseDown={e => e.preventDefault()} onClick={() => gravar(l, '100')} title="Marcar 100%" aria-label="Marcar 100%"
                                style={{ border: 0, background: 'var(--surface-2)', borderRadius: 8, height: 38, padding: '0 8px', fontSize: 11, fontWeight: 800, color: 'var(--text-2)', cursor: 'pointer' }}>100</button>
                            </div>
                          ) : (
                            <div style={{ fontSize: 14, fontWeight: 900, flexShrink: 0 }}>{fmtPct(c.pctAcum)}</div>
                          )}
                        </div>
                        {msg && <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 700, marginTop: 4 }}>{msg}</div>}
                      </div>
                    );
                  })}
                  {visiveis.length === 0 && <div className="card" style={{ padding: 18, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nada encontrado.</div>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Numero({ nome, valor, cor }) {
  return (
    <div>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 2 }}>{nome}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: cor || 'var(--text-1)' }}>{valor}</div>
    </div>
  );
}
