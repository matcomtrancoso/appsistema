// Contas a receber: o valor fechado com o cliente (orçamento aprovado da obra),
// o quanto já foi medido (Medições) e o quanto já entrou de dinheiro, mês a mês.
// Mestre e engenharia veem e lançam (decisão do dono do produto).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { hojeLocal, fmtDataBR, rotuloMesAno } from '../lib/date';
import { fmtV, parseV, fmtCur } from '../lib/moeda.js';
import { demonstrativoMensal, resumoGeral } from '../lib/receber.js';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';
import { Popup, Rodape, campo, rotulo } from '../components/popup-financeiro';

const fmtPct = (n) => `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;


export function ContasReceberScreen({ goto, voltarPara = 'home' }) {
  const hoje = hojeLocal();
  const [contrato, setContrato] = useState(undefined);   // undefined = carregando; null = não definido
  const [medicoes, setMedicoes] = useState([]);
  const [recebimentos, setRecebimentos] = useState([]);
  const [erro, setErro] = useState('');
  const [editandoContrato, setEditandoContrato] = useState(false);
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    const [c, m, r] = await Promise.all([
      supabase.from('obra_contrato').select('*').maybeSingle(),
      supabase.from('medicoes_obra').select('data, percentual'),
      supabase.from('recebimentos').select('*').order('data', { ascending: false }),
    ]);
    const falha = c.error || m.error || r.error;
    if (falha) { setErro(msgAmigavel(falha, 'carregar o contas a receber')); setContrato(undefined); return; }
    setErro('');
    setContrato(c.data || null);
    setMedicoes(m.data || []);
    setRecebimentos(r.data || []);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const valor = contrato ? contrato.valor_aprovado : null;
  const geral = resumoGeral({ valorContrato: valor, medicoes, recebimentos });
  const meses = demonstrativoMensal({ valorContrato: valor, medicoes, recebimentos, ateMes: hoje.slice(0, 7) }).reverse();

  async function apagar(r) {
    if (!confirm(`Apagar o recebimento de ${fmtCur(r.valor)} (${fmtDataBR(r.data)})?`)) return;
    const { error } = await supabase.from('recebimentos').delete().eq('id', r.id);
    if (error) { avisarErro(error, 'apagar o recebimento'); return; }
    carregar();
  }

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="t-micro">FINANCEIRO</div>
            <div className="t-h1">Contas a receber</div>
          </div>
          <button className="btn btn-primary btn-sm" disabled={contrato === undefined} onClick={() => setNovo(true)}>
            <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Recebimento
          </button>
        </div>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        {erro && (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>⚠️ {erro}</div>
        )}
        {contrato === undefined && erro && (
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={carregar}>Tentar de novo</button>
        )}
        {contrato === undefined && !erro && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

        {contrato !== undefined && (
          <>
            {/* Valor fechado */}
            <div className="card" style={{ padding: '14px 16px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 4 }}>ORÇAMENTO APROVADO (VALOR FECHADO)</div>
                {contrato ? (
                  <>
                    <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text-1)' }}>{fmtCur(contrato.valor_aprovado)}</div>
                    {contrato.aprovado_em && <div className="t-caption" style={{ fontSize: 11 }}>aprovado em {fmtDataBR(contrato.aprovado_em)}</div>}
                  </>
                ) : (
                  <div className="t-caption" style={{ fontSize: 12.5, lineHeight: 1.45 }}>
                    Ainda não definido. Informe o valor fechado com o cliente para calcular quanto já dá para receber.
                  </div>
                )}
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditandoContrato(true)}>{contrato ? 'Editar' : 'Definir'}</button>
            </div>

            {contrato && (
              <div className="card" style={{ padding: '14px 16px', marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14 }}>
                <Numero nome={`MEDIDO (${fmtPct(geral.percentual)})`} valor={fmtCur(geral.medido)} />
                <Numero nome="RECEBIDO" valor={fmtCur(geral.recebido)} cor="var(--success)" />
                <Numero nome="A RECEBER" valor={fmtCur(geral.aReceber)} cor={geral.aReceber < 0 ? 'var(--warn)' : 'var(--primary)'}
                  dica={geral.aReceber < 0 ? 'recebido a mais que o medido' : 'medido e ainda não recebido'} legenda={geral.aReceber < 0 ? 'recebido a mais que o medido' : null} />
                <Numero nome="FALTA MEDIR" valor={fmtCur(geral.faltaMedir)} />
              </div>
            )}

            {!contrato && (
              <div className="card" style={{ padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 2 }}>RECEBIDO ATÉ AGORA</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: 'var(--success)' }}>{fmtCur(geral.recebido)}</div>
                </div>
                <div className="t-caption" style={{ fontSize: 11.5, maxWidth: 180, textAlign: 'right' }}>Defina o valor fechado para ver o que já dá para receber.</div>
              </div>
            )}

            {contrato && medicoes.length === 0 && (
              <div className="card" style={{ padding: '10px 14px', marginBottom: 12, background: 'var(--warn-tint, #FEF3C7)', color: 'var(--text-2)', fontSize: 12.5, fontWeight: 600, boxShadow: 'none' }}>
                ℹ️ Ainda não há medições. O valor a receber sai do percentual medido — registre em <button onClick={() => goto('medicoes')} style={{ border: 0, background: 'none', padding: 0, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 800, color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}>Medições</button>.
              </div>
            )}

            {/* Mês a mês (sem o valor fechado não há o que medir: ficaria só saldo negativo) */}
            {contrato && <>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', margin: '4px 0 8px' }}>MÊS A MÊS</div>
            <div className="stack stack-2" style={{ marginBottom: 20 }}>
              {meses.map(m => (
                <div key={m.mes} className="card" style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div className="t-strong" style={{ fontSize: 14 }}>{rotuloMesAno(m.mes)}</div>
                    <div className="t-caption" style={{ fontSize: 11.5 }}>{fmtPct(m.percentual)} medido no acumulado</div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(112px, 1fr))', gap: 10 }}>
                    <Numero nome="MEDIDO NO MÊS" valor={fmtCur(m.medidoNoMes)} pequeno />
                    <Numero nome="RECEBIDO NO MÊS" valor={fmtCur(m.recebidoNoMes)} cor={m.recebidoNoMes ? 'var(--success)' : undefined} pequeno />
                    <Numero nome="SALDO ACUMULADO" valor={fmtCur(m.saldo)} cor={m.saldo < 0 ? 'var(--warn)' : m.saldo > 0 ? 'var(--primary)' : undefined} pequeno />
                  </div>
                </div>
              ))}
              {meses.length === 0 && (
                <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                  Sem medições nem recebimentos ainda.
                </div>
              )}
            </div>

            </>}

            {/* Recebimentos */}
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', margin: '4px 0 8px' }}>RECEBIMENTOS LANÇADOS</div>
            <div className="stack stack-2">
              {recebimentos.map(r => (
                <div key={r.id} className="card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-strong" style={{ fontSize: 13.5 }}>{fmtDataBR(r.data)}</div>
                    {r.descricao && <div className="t-caption" style={{ fontSize: 11.5 }}>{r.descricao}</div>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 900, color: 'var(--success)' }}>{fmtCur(r.valor)}</div>
                  <button onClick={() => apagar(r)} title="Apagar" aria-label="Apagar o recebimento"
                    style={{ width: 34, height: 34, border: 0, borderRadius: 8, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
                </div>
              ))}
              {recebimentos.length === 0 && (
                <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhum recebimento lançado ainda.</div>
              )}
            </div>
          </>
        )}
      </div>

      {editandoContrato && <ContratoPopup contrato={contrato} onFechar={() => setEditandoContrato(false)} onSalvo={() => { setEditandoContrato(false); carregar(); }} />}
      {novo && <RecebimentoPopup hoje={hoje} onFechar={() => setNovo(false)} onSalvo={() => { setNovo(false); carregar(); }} />}
    </div>
  );
}

function Numero({ nome, valor, cor, dica, legenda, pequeno }) {
  return (
    <div title={dica}>
      <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 2 }}>{nome}</div>
      <div style={{ fontSize: pequeno ? 13.5 : 16, fontWeight: 900, color: cor || 'var(--text-1)' }}>{valor}</div>
      {legenda && <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--warn)', marginTop: 1 }}>{legenda}</div>}
    </div>
  );
}

function ContratoPopup({ contrato, onFechar, onSalvo }) {
  const [valor, setValor] = useState(contrato ? fmtCur(contrato.valor_aprovado) : '');
  const [data, setData] = useState(contrato?.aprovado_em || '');
  const [obs, setObs] = useState(contrato?.observacoes || '');
  const [salvando, setSalvando] = useState(false);
  const v = parseV(valor);
  const pronto = v != null && v >= 0;

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    // Uma linha por obra: upsert na chave única obra_id (o obra_id entra sozinho, ver obra-escopo.js).
    const { error } = await supabase.from('obra_contrato').upsert(
      { valor_aprovado: v, aprovado_em: data || null, observacoes: obs.trim() || null },
      { onConflict: 'obra_id' });
    setSalvando(false);
    if (error) { avisarErro(error, 'salvar o valor fechado'); return; }
    onSalvo();
  }

  return (
    <Popup titulo="🏦 Orçamento aprovado" onFechar={onFechar}>
      <div className="t-caption" style={{ marginBottom: 14, lineHeight: 1.5 }}>O valor total fechado com o cliente para esta obra. É sobre ele que o percentual medido vira dinheiro a receber.</div>
      <div style={rotulo}>VALOR FECHADO *</div>
      <input value={valor} onChange={e => setValor(fmtV(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" style={{ ...campo, marginBottom: 14 }} />
      <div style={rotulo}>DATA DA APROVAÇÃO</div>
      <input type="date" value={data} onChange={e => setData(e.target.value)} style={{ ...campo, marginBottom: 14 }} />
      <div style={rotulo}>OBSERVAÇÕES</div>
      <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2} placeholder="Ex.: proposta 12, aditivo…"
        style={{ ...campo, height: 'auto', padding: '10px 14px', resize: 'none', marginBottom: 18 }} />
      <Rodape onFechar={onFechar} onConfirmar={salvar} pronto={pronto} salvando={salvando} texto="Salvar" />
    </Popup>
  );
}

function RecebimentoPopup({ hoje, onFechar, onSalvo }) {
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const v = parseV(valor);
  const pronto = v > 0 && !!data;

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    const { error } = await supabase.from('recebimentos').insert({ data, valor: v, descricao: descricao.trim() });
    setSalvando(false);
    if (error) { avisarErro(error, 'salvar o recebimento'); return; }
    onSalvo();
  }

  return (
    <Popup titulo="💵 Novo recebimento" onFechar={onFechar}>
      <div style={{ display: 'flex', gap: 10, margin: '14px 0' }}>
        <div style={{ flex: 1 }}>
          <div style={rotulo}>DATA *</div>
          <input type="date" value={data} onChange={e => setData(e.target.value)} style={campo} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={rotulo}>VALOR *</div>
          <input value={valor} onChange={e => setValor(fmtV(e.target.value))} placeholder="R$ 0,00" inputMode="numeric" style={campo} />
        </div>
      </div>
      <div style={rotulo}>DESCRIÇÃO</div>
      <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: 2ª medição, NF 1234" style={{ ...campo, marginBottom: 18 }} />
      <Rodape onFechar={onFechar} onConfirmar={salvar} pronto={pronto} salvando={salvando} texto="Salvar recebimento" />
    </Popup>
  );
}
