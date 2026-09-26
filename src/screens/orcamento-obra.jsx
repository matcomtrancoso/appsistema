// Orçamento da obra: o PRIMEIRO passo. A EAP (1, 1.1, 1.1.1...) com quantidade e
// preço de cada linha. Depois de aprovado, dele nascem o cronograma (uma tarefa
// por linha) e a medição mensal (um % por linha).
// Diferente da tela "Orçamentos de compra", que é o custo com cada fornecedor.
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { hojeLocal, fmtDataBR } from '../lib/date';
import { contem } from '../lib/busca';
import { fmtV, parseV, fmtCur } from '../lib/moeda.js';
import {
  lerOrcamento, montarEap, numeroBR, ordenarEap, valoresPorCodigo, totalEap, subarvore,
  proximoCodigo, cronogramaDeEap, nivel, CODIGO_VALIDO, orcamentoAprovado, podeReabrirOrcamento, podeSubstituirOrcamento, linhasVisiveis,
} from '../lib/eap.js';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';
import { todasAsLinhas } from '../lib/paginar.js';
import { Popup, Rodape, campo, rotulo } from '../components/popup-financeiro';

const fmtQtd = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const LOTE = 400;   // linhas por insert (o servidor limita o tamanho do pedido)

async function inserirEmLotes(tabela, linhas) {
  for (let i = 0; i < linhas.length; i += LOTE) {
    const { error } = await supabase.from(tabela).insert(linhas.slice(i, i + LOTE));
    if (error) return error;
  }
  return null;
}

export function OrcamentoObraScreen({ goto, voltarPara = 'home' }) {
  const hoje = hojeLocal();
  const [linhas, setLinhas] = useState(null);
  const [contrato, setContrato] = useState(null);
  const [cronograma, setCronograma] = useState([]);
  const [medicoes, setMedicoes] = useState([]);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [fechados, setFechados] = useState(() => new Set());   // grupos recolhidos
  const [editando, setEditando] = useState(null);   // linha, ou { nova: true, pai }
  const [importando, setImportando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [l, c, cr, m] = await Promise.all([
      todasAsLinhas(() => supabase.from('orcamento_eap').select('*').order('ordem')),
      supabase.from('obra_contrato').select('*').maybeSingle(),
      todasAsLinhas(() => supabase.from('cronograma_itens').select('id, wbs_id, orcamento_eap_id').order('id')),
      supabase.from('medicoes_mensais').select('id'),
    ]);
    const falha = l.error || c.error || cr.error || m.error;
    if (falha) { setErro(msgAmigavel(falha, 'carregar o orçamento')); return; }
    setErro('');
    setLinhas(ordenarEap(l.data || []));
    setContrato(c.data || null);
    setCronograma(cr.data || []);
    setMedicoes(m.data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const aprovado = orcamentoAprovado(contrato);
  const temMedicao = medicoes.length > 0;
  const valores = useMemo(() => valoresPorCodigo(linhas || []), [linhas]);
  const total = totalEap(linhas || []);
  const ligadas = new Set(cronograma.map(t => t.orcamento_eap_id).filter(Boolean));
  const trocaTotal = podeSubstituirOrcamento({ contrato, medicoes, tarefasLigadas: ligadas.size });
  const faltamNoCronograma = (linhas || []).filter(l => !ligadas.has(l.id)).length;

  // linhas visíveis: sem ancestral recolhido; com busca, só as que combinam
  const visiveis = useMemo(() => {
    const todas = linhas || [];
    if (busca.trim()) return todas.filter(l => contem(l.descricao, busca) || contem(l.codigo, busca));
    return linhasVisiveis(todas, fechados);
  }, [linhas, busca, fechados]);

  const alternar = (codigo) => setFechados(s => { const n = new Set(s); n.has(codigo) ? n.delete(codigo) : n.add(codigo); return n; });

  async function aprovar() {
    if (!linhas?.length || total <= 0) { alert('O orçamento precisa ter linhas com valor antes de ser aprovado.'); return; }
    if (!confirm(`Aprovar o orçamento de ${fmtCur(total)}?\n\nDepois de aprovado, as linhas ficam travadas e você pode gerar o cronograma e começar as medições.`)) return;
    setOcupado(true);
    const { error } = await supabase.from('obra_contrato').upsert({ valor_aprovado: total, aprovado_em: hoje }, { onConflict: 'obra_id' });
    setOcupado(false);
    if (error) { avisarErro(error, 'aprovar o orçamento'); return; }
    carregar();
  }

  async function reabrir() {
    const pode = podeReabrirOrcamento({ contrato, medicoes });
    if (!pode.ok) { alert(pode.motivo); return; }
    if (!confirm('Reabrir o orçamento para edição? O valor aprovado volta a ser calculado quando você aprovar de novo.')) return;
    setOcupado(true);
    // Só tira a data de aprovação: as observações da linha do contrato ficam.
    const { error } = await supabase.from('obra_contrato').update({ aprovado_em: null });
    setOcupado(false);
    if (error) { avisarErro(error, 'reabrir o orçamento'); return; }
    carregar();
  }

  async function gerarCronograma() {
    const { itens } = cronogramaDeEap(linhas, cronograma);
    if (!itens.length) { alert('Todas as linhas do orçamento já têm tarefa no cronograma.'); return; }
    const jaTem = cronograma.length;
    if (!confirm(`Criar ${itens.length} ${itens.length === 1 ? 'tarefa' : 'tarefas'} no Cronograma, uma por linha do orçamento?\n\nDatas e duração ficam em branco para você preencher lá.${jaTem ? `\n\nO cronograma já tem ${jaTem} itens: os novos entram depois deles.` : ''}`)) return;
    setOcupado(true);
    const e = await inserirEmLotes('cronograma_itens', itens);
    setOcupado(false);
    if (e) { avisarErro(e, 'gerar o cronograma'); carregar(); return; }
    await carregar();
    if (confirm(`${itens.length} tarefas criadas. Abrir o Cronograma agora?`)) goto('cronograma');
  }

  async function apagarLinha(l) {
    const filhos = subarvore(linhas, l.codigo);
    const msg = filhos.length > 1
      ? `Apagar "${l.codigo} ${l.descricao}" e as ${filhos.length - 1} linhas abaixo dela?`
      : `Apagar a linha "${l.codigo} ${l.descricao}"?`;
    if (!confirm(msg)) return;
    // em blocos: a lista de ids vai na URL e um ramo grande estoura o limite
    const ids = filhos.map(f => f.id);
    for (let i = 0; i < ids.length; i += 100) {
      const { error } = await supabase.from('orcamento_eap').delete().in('id', ids.slice(i, i + 100));
      if (error) { avisarErro(error, 'apagar a linha'); carregar(); return; }
    }
    // se o pai ficou sem filhos, volta a ser folha
    const pai = linhas.find(x => x.codigo === l.pai_codigo);
    if (pai && !linhas.some(x => x.pai_codigo === pai.codigo && !filhos.includes(x))) {
      const { error } = await supabase.from('orcamento_eap').update({ is_grupo: false }).eq('id', pai.id);
      if (error) avisarErro(error, 'ajustar o grupo de cima');
    }
    carregar();
  }

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div className="t-micro">PRIMEIRO PASSO</div>
        <div className="t-h1">Orçamento da obra</div>
      </div>

      <div className="page-pad" style={{ marginTop: 14 }}>
        {erro && <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>⚠️ {erro}</div>}
        {linhas === null && !erro && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

        {linhas !== null && (
          <>
            {/* Total e situação */}
            <div className="card" style={{ padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 4 }}>VALOR DO ORÇAMENTO</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: 'var(--text-1)' }}>{fmtCur(total)}</div>
                  <div className="t-caption" style={{ fontSize: 11.5 }}>{linhas.length} {linhas.length === 1 ? 'linha' : 'linhas'}{aprovado ? ` · aprovado em ${fmtDataBR(contrato.aprovado_em)}` : ''}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 999,
                  background: aprovado ? 'var(--success-tint,#DCFCE7)' : 'var(--surface-2)', color: aprovado ? 'var(--success)' : 'var(--text-2)' }}>
                  {aprovado ? '✓ APROVADO' : 'RASCUNHO'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {!aprovado && <button className="btn btn-secondary btn-sm" disabled={!trocaTotal.ok && linhas.length > 0} title={!trocaTotal.ok && linhas.length > 0 ? trocaTotal.motivo : undefined} onClick={() => setImportando(true)}><span style={{ width: 14, height: 14 }}>{Icon.download}</span>Importar planilha</button>}
                {!aprovado && <button className="btn btn-secondary btn-sm" onClick={() => setEditando({ nova: true, pai: null })}><span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Linha</button>}
                {!aprovado && linhas.length > 0 && <button className="btn btn-primary btn-sm" disabled={ocupado} onClick={aprovar}>Aprovar orçamento</button>}
                {aprovado && <button className="btn btn-primary btn-sm" disabled={ocupado || faltamNoCronograma === 0} onClick={gerarCronograma}>
                  {faltamNoCronograma === 0 ? '✓ Cronograma gerado' : `Gerar cronograma (${faltamNoCronograma})`}</button>}
                {aprovado && <button className="btn btn-ghost btn-sm" onClick={() => goto('medicoes')}>Medições</button>}
                {podeReabrirOrcamento({ contrato, medicoes }).ok && <button className="btn btn-ghost btn-sm" disabled={ocupado} onClick={reabrir}>Reabrir</button>}
              </div>
              {aprovado && (
                <div className="t-caption" style={{ fontSize: 11, marginTop: 10, lineHeight: 1.45 }}>
                  Orçamento aprovado: as linhas estão travadas.{temMedicao ? ' Já há medição lançada, então não dá mais para reabrir.' : ' Para mudar algo, reabra.'}
                </div>
              )}
            </div>

            {linhas.length === 0 && (
              <div className="card" style={{ padding: 22, textAlign: 'center', color: 'var(--text-2)', fontSize: 13.5, lineHeight: 1.5 }}>
                <div style={{ fontSize: 30, marginBottom: 6 }}>🧮</div>
                <b>Comece por aqui.</b> Suba a planilha do orçamento (Item, Descrição, Un, Quantidade, Preço unitário) ou crie as linhas uma a uma.
                Depois de aprovado, o orçamento gera o cronograma e a medição de cada mês.
              </div>
            )}

            {linhas.length > 0 && (
              <>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou descrição…"
                  style={{ ...campo, height: 42, fontSize: 14, marginBottom: 10 }} />
                <div className="stack stack-1" style={{ gap: 6 }}>
                  {visiveis.map(l => {
                    const grupo = l.is_grupo;
                    const recolhido = fechados.has(l.codigo);
                    return (
                      <div key={l.id} className="card" style={{ padding: '9px 12px', marginLeft: busca ? 0 : Math.min(nivel(l.codigo) - 1, 4) * 12,
                        background: grupo ? 'var(--surface-2)' : undefined, boxShadow: grupo ? 'none' : undefined, border: grupo ? '0.5px solid var(--border)' : undefined }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          {grupo && (
                            <button onClick={() => alternar(l.codigo)} aria-label={recolhido ? 'Abrir grupo' : 'Recolher grupo'}
                              style={{ border: 0, background: 'none', cursor: 'pointer', width: 22, height: 22, padding: 0, color: 'var(--text-3)', fontSize: 12, flexShrink: 0 }}>{recolhido ? '▸' : '▾'}</button>
                          )}
                          <div style={{ flex: 1, minWidth: 0, cursor: aprovado ? 'default' : 'pointer' }} onClick={() => !aprovado && setEditando(l)}>
                            <div style={{ fontSize: grupo ? 13.5 : 13, fontWeight: grupo ? 800 : 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
                              <span style={{ color: 'var(--text-3)', fontWeight: 800, marginRight: 6 }}>{l.codigo}</span>{l.descricao}
                            </div>
                            {!grupo && (
                              <div className="t-caption" style={{ fontSize: 11, marginTop: 2 }}>
                                {fmtQtd(l.quantidade)} {l.unidade} × {fmtCur(l.preco_unitario)}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ fontSize: grupo ? 14 : 13, fontWeight: 900, color: 'var(--text-1)' }}>{fmtCur(valores.get(l.codigo) || 0)}</div>
                            {!aprovado && (
                              <div style={{ display: 'flex', gap: 2, justifyContent: 'flex-end', marginTop: 2 }}>
                                {grupo && <button onClick={() => setEditando({ nova: true, pai: l.codigo })} title="Adicionar linha dentro deste grupo" aria-label="Adicionar linha neste grupo"
                                  style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--primary)', fontSize: 11, fontWeight: 800, padding: '2px 4px' }}>＋ linha</button>}
                                <button onClick={() => apagarLinha(l)} title="Apagar" aria-label="Apagar a linha"
                                  style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, padding: '2px 4px' }}>🗑</button>
                              </div>
                            )}
                          </div>
                        </div>
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

      {editando && <LinhaPopup alvo={editando} linhas={linhas} onFechar={() => setEditando(null)} onSalvo={() => { setEditando(null); carregar(); }} />}
      {importando && <ImportarPopup linhasAtuais={linhas} onFechar={() => setImportando(false)} onImportado={() => { setImportando(false); carregar(); }} />}
    </div>
  );
}

// ── Criar / editar uma linha ────────────────────────────────────────────────
function LinhaPopup({ alvo, linhas, onFechar, onSalvo }) {
  const nova = !!alvo.nova;
  const linha = nova ? null : alvo;
  const [pai, setPai] = useState(nova ? (alvo.pai || '') : (linha.pai_codigo || ''));
  const [codigo, setCodigo] = useState(nova ? proximoCodigo(linhas, alvo.pai || null) : linha.codigo);
  const [descricao, setDescricao] = useState(linha?.descricao || '');
  const [unidade, setUnidade] = useState(linha?.unidade || '');
  const [quantidade, setQuantidade] = useState(linha ? String(linha.quantidade).replace('.', ',') : '');
  const precoInicial = linha ? fmtCur(linha.preco_unitario) : '';
  const [preco, setPreco] = useState(precoInicial);
  const [salvando, setSalvando] = useState(false);

  const ehGrupo = !!linha?.is_grupo;
  const paiLinha = linhas.find(l => l.codigo === pai);
  const converte = nova && paiLinha && !paiLinha.is_grupo && (Number(paiLinha.quantidade) || Number(paiLinha.preco_unitario));
  const q = numeroBR(quantidade);
  const p = parseV(preco) ?? 0;
  const codigoRepetido = nova && linhas.some(l => l.codigo === codigo.trim());
  const codigoOk = CODIGO_VALIDO.test(codigo.trim()) && (!pai || codigo.trim().startsWith(pai + '.'));
  const pronto = descricao.trim() && (ehGrupo || (!Number.isNaN(q) && q >= 0)) && (!nova || (codigoOk && !codigoRepetido));

  function trocarPai(novoPai) { setPai(novoPai); if (nova) setCodigo(proximoCodigo(linhas, novoPai || null)); }

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    let erroBanco = null;
    if (nova) {
      const virouGrupo = paiLinha && !paiLinha.is_grupo;
      if (virouGrupo) {
        // a linha que ganha filho vira grupo: quantidade e preço passam a ser a soma dos filhos
        const r = await supabase.from('orcamento_eap').update({ is_grupo: true, quantidade: 0, preco_unitario: 0, unidade: '' }).eq('id', paiLinha.id);
        erroBanco = r.error;
      }
      if (!erroBanco) {
        const ordem = linhas.reduce((m, l) => Math.max(m, l.ordem || 0), 0) + 1;
        const r = await supabase.from('orcamento_eap').insert({
          codigo: codigo.trim(), pai_codigo: pai || null, descricao: descricao.trim(), unidade: unidade.trim(),
          quantidade: q || 0, preco_unitario: p, is_grupo: false, ordem,
        });
        erroBanco = r.error;
        if (erroBanco && virouGrupo) {
          // o filho não entrou: devolve o pai como era, para não sobrar grupo vazio e sem valor
          await supabase.from('orcamento_eap').update({ is_grupo: false, quantidade: paiLinha.quantidade, preco_unitario: paiLinha.preco_unitario, unidade: paiLinha.unidade }).eq('id', paiLinha.id);
        }
      }
    } else {
      const r = await supabase.from('orcamento_eap').update(ehGrupo
        ? { descricao: descricao.trim() }
        : { descricao: descricao.trim(), unidade: unidade.trim(), quantidade: q,
            // o campo mostra só centavos: sem mexer nele, o preço (que pode ter mais casas) fica como está
            ...(preco !== precoInicial ? { preco_unitario: p } : {}) }).eq('id', linha.id);
      erroBanco = r.error;
    }
    setSalvando(false);
    if (erroBanco) { avisarErro(erroBanco, 'salvar a linha'); return; }
    onSalvo();
  }

  return (
    <Popup titulo={nova ? '🧮 Nova linha' : `✏️ ${linha.codigo}`} onFechar={onFechar}>
      {nova && (
        <>
          <div style={{ ...rotulo, marginTop: 12 }}>DENTRO DE</div>
          <select value={pai} onChange={e => trocarPai(e.target.value)} style={{ ...campo, marginBottom: 12 }}>
            <option value="">Primeiro nível</option>
            {linhas.map(l => <option key={l.id} value={l.codigo}>{'  '.repeat(nivel(l.codigo) - 1)}{l.codigo} {l.descricao}</option>)}
          </select>
          <div style={rotulo}>ITEM (CÓDIGO DA EAP) *</div>
          <input value={codigo} onChange={e => setCodigo(e.target.value)} style={{ ...campo, marginBottom: codigoRepetido || !codigoOk ? 4 : 12 }} />
          {codigoRepetido && <div className="t-caption" style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 10 }}>Já existe uma linha {codigo.trim()}.</div>}
          {!codigoRepetido && !codigoOk && <div className="t-caption" style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 10 }}>Use números separados por ponto{pai ? ` começando por ${pai}.` : ' (ex.: 3 ou 3.1).'}</div>}
        </>
      )}
      <div style={{ ...rotulo, marginTop: nova ? 0 : 12 }}>DESCRIÇÃO *</div>
      <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: Alvenaria de vedação" style={{ ...campo, marginBottom: 12 }} />
      {!ehGrupo && (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
            <div style={{ flex: 1 }}><div style={rotulo}>UNIDADE</div><input value={unidade} onChange={e => setUnidade(e.target.value)} placeholder="m², un, vb" style={campo} /></div>
            <div style={{ flex: 1 }}><div style={rotulo}>QUANTIDADE</div><input value={quantidade} onChange={e => setQuantidade(e.target.value)} inputMode="decimal" placeholder="0" style={campo} /></div>
          </div>
          <div style={rotulo}>PREÇO UNITÁRIO</div>
          <input value={preco} onChange={e => setPreco(fmtV(e.target.value))} inputMode="numeric" placeholder="R$ 0,00" style={{ ...campo, marginBottom: 12 }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 12 }}>
            <span style={{ color: 'var(--text-2)', fontWeight: 700 }}>Total da linha</span>
            <b>{fmtCur((Number.isNaN(q) ? 0 : q) * p)}</b>
          </div>
        </>
      )}
      {ehGrupo && <div className="t-caption" style={{ fontSize: 12, marginBottom: 14 }}>Esta linha tem filhos: o valor dela é a soma deles.</div>}
      {converte && (
        <div className="card" style={{ padding: '10px 12px', marginBottom: 12, background: 'var(--warn-tint, #FEF3C7)', boxShadow: 'none', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', lineHeight: 1.45 }}>
          ⚠️ A linha {pai} tem quantidade e preço. Ao ganhar filhos ela vira grupo e esses valores saem (vale a soma dos filhos).
        </div>
      )}
      <Rodape onFechar={onFechar} onConfirmar={salvar} pronto={!!pronto} salvando={salvando} texto="Salvar" />
    </Popup>
  );
}

// ── Importar planilha ───────────────────────────────────────────────────────
function ImportarPopup({ linhasAtuais, onFechar, onImportado }) {
  const temLinhas = linhasAtuais.length > 0;
  const [texto, setTexto] = useState('');
  const [previa, setPrevia] = useState(null);
  const [salvando, setSalvando] = useState(false);

  function analisar() {
    const lido = lerOrcamento(texto);
    if (lido.erros.length && !lido.linhas.length) { setPrevia({ erros: lido.erros, avisos: [], linhas: [] }); return; }
    const { linhas, avisos } = montarEap(lido.linhas);
    setPrevia({ erros: lido.erros, avisos, linhas });
  }

  function lerArquivo(e) {
    const arq = e.target.files?.[0];
    if (!arq) return;
    const leitor = new FileReader();
    leitor.onload = () => {
      // Excel em português salva CSV em Windows-1252: se não for UTF-8 válido, lê como tal
      const bytes = new Uint8Array(leitor.result);
      let lido;
      try { lido = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { lido = new TextDecoder('windows-1252').decode(bytes); }
      setTexto(lido);
      setPrevia(null);
    };
    leitor.readAsArrayBuffer(arq);
    e.target.value = '';
  }

  async function importar() {
    if (!previa?.linhas.length || previa.erros.length || salvando) return;
    if (temLinhas && !confirm('Já existe um orçamento rascunho. Substituir tudo pelo que está na planilha?\n\nAs linhas atuais serão apagadas.')) return;
    setSalvando(true);
    if (temLinhas) {
      const { error } = await supabase.from('orcamento_eap').delete();
      if (error) { setSalvando(false); avisarErro(error, 'limpar o orçamento antigo'); return; }
    }
    const novas = previa.linhas.map(l => ({
      codigo: l.codigo, pai_codigo: l.pai_codigo, descricao: l.descricao, unidade: l.unidade,
      quantidade: l.quantidade, preco_unitario: l.preco_unitario, is_grupo: l.is_grupo, ordem: l.ordem,
    }));
    let e = await inserirEmLotes('orcamento_eap', novas);
    if (e && temLinhas) {
      // a troca falhou no meio: tenta devolver as linhas de antes (mesmos ids)
      await supabase.from('orcamento_eap').delete();
      const voltou = await inserirEmLotes('orcamento_eap', linhasAtuais.map(l => ({
        id: l.id, codigo: l.codigo, pai_codigo: l.pai_codigo, descricao: l.descricao, unidade: l.unidade,
        quantidade: l.quantidade, preco_unitario: l.preco_unitario, is_grupo: l.is_grupo, ordem: l.ordem,
      })));
      e = { ...e, message: `${e.message} ${voltou ? '(não consegui restaurar o orçamento de antes: importe de novo)' : '(o orçamento de antes foi restaurado)'}` };
    }
    setSalvando(false);
    if (e) { avisarErro(e, 'importar o orçamento'); return; }
    onImportado();
  }

  const total = previa ? totalEap(previa.linhas) : 0;
  return (
    <Popup titulo="📥 Importar orçamento" onFechar={onFechar}>
      <div className="t-caption" style={{ margin: '10px 0', lineHeight: 1.5, fontSize: 12 }}>
        Copie as células da planilha (colunas <b>Item · Descrição · Un · Quantidade · Preço unitário</b>, com ou sem cabeçalho) e cole aqui — ou escolha um arquivo .csv/.txt. O <b>Item</b> é o código da EAP (1, 1.1, 1.1.1…); quem tem filhos vira grupo.
      </div>
      <label className="btn btn-ghost btn-sm" style={{ marginBottom: 8, cursor: 'pointer' }}>
        Escolher arquivo
        <input type="file" accept=".csv,.txt,.tsv,text/plain,text/csv" onChange={lerArquivo} style={{ display: 'none' }} />
      </label>
      <textarea value={texto} onChange={e => { setTexto(e.target.value); setPrevia(null); }} rows={7} placeholder="Cole aqui…"
        style={{ ...campo, height: 'auto', padding: '10px 12px', fontSize: 12.5, fontFamily: 'monospace', resize: 'vertical', marginBottom: 10 }} />
      <button onClick={analisar} disabled={!texto.trim()} className="btn btn-secondary btn-sm" style={{ marginBottom: 12 }}>Analisar</button>

      {previa && (
        <div style={{ marginBottom: 14 }}>
          {previa.erros.length > 0 && (
            <div className="card" style={{ padding: '10px 12px', background: 'var(--danger-tint,#FEE2E2)', boxShadow: 'none', marginBottom: 8, fontSize: 12, color: 'var(--danger)', fontWeight: 600, lineHeight: 1.5 }}>
              {previa.erros.length} {previa.erros.length === 1 ? 'problema' : 'problemas'} — corrija a planilha e cole de novo:
              {previa.erros.slice(0, 8).map((e, i) => <div key={i}>• {e}</div>)}
              {previa.erros.length > 8 && <div>… e mais {previa.erros.length - 8}.</div>}
            </div>
          )}
          {previa.avisos.length > 0 && (
            <div className="card" style={{ padding: '10px 12px', background: 'var(--warn-tint, #FEF3C7)', boxShadow: 'none', marginBottom: 8, fontSize: 12, color: 'var(--text-2)', fontWeight: 600, lineHeight: 1.5 }}>
              {previa.avisos.slice(0, 5).map((a, i) => <div key={i}>ℹ️ {a}</div>)}
              {previa.avisos.length > 5 && <div>… e mais {previa.avisos.length - 5} avisos.</div>}
            </div>
          )}
          {previa.linhas.length > 0 && !previa.erros.length && (
            <div className="card" style={{ padding: '10px 12px', boxShadow: 'none', border: '0.5px solid var(--border)', fontSize: 13 }}>
              <b>{previa.linhas.length}</b> linhas ({previa.linhas.filter(l => l.is_grupo).length} grupos) · total <b>{fmtCur(total)}</b>
            </div>
          )}
        </div>
      )}
      <Rodape onFechar={onFechar} onConfirmar={importar} pronto={!!previa?.linhas.length && !previa.erros.length} salvando={salvando}
        texto={temLinhas ? 'Substituir orçamento' : 'Importar'} />
    </Popup>
  );
}
