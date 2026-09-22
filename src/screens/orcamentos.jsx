// Orçamentos: os itens (descrição, quantidade, preço) de cada Contratação —
// "quanto planejamos pagar por isso". Só engenharia enxerga esta tela, mesma
// regra de Contratações (o valor do contrato já é assim hoje).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { fmtV, parseV, fmtCur } from '../lib/moeda.js';
import { totalOrcamento, saldoOrcamento } from '../lib/orcamento.js';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';

export function OrcamentosScreen({ goto, voltarPara = 'home' }) {
  const [contratacoes, setContratacoes] = useState(null);
  const [itensPorContratacao, setItensPorContratacao] = useState({});
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(null); // contratação cujos itens estão abertos no popup

  const carregar = useCallback(() => {
    Promise.all([
      supabase.from('contratacoes').select('id, descricao, fornecedor_nome, valor_contrato, status').order('descricao'),
      supabase.from('orcamento_itens').select('*').order('ordem'),
    ]).then(([c, i]) => {
      if (c.error || i.error) { setErro(msgAmigavel(c.error || i.error, 'carregar os orçamentos')); return; }
      setErro('');
      setContratacoes(c.data || []);
      const porC = {};
      for (const item of (i.data || [])) (porC[item.contratacao_id] ||= []).push(item);
      setItensPorContratacao(porC);
    });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div className="t-micro">PLANEJAMENTO</div>
        <div className="t-h1">Orçamentos</div>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        {erro && (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            ⚠️ {erro}
          </div>
        )}
        {contratacoes === null && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}
        {contratacoes?.length === 0 && !erro && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            Nenhuma contratação cadastrada ainda. O orçamento se organiza por contratação — crie uma em Contratações primeiro.
          </div>
        )}

        <div className="stack stack-2">
          {(contratacoes || []).map(c => {
            const itens = itensPorContratacao[c.id] || [];
            const total = totalOrcamento(itens);
            const saldo = saldoOrcamento(c.valor_contrato, itens);
            return (
              <div key={c.id} className="card tap" style={{ padding: '12px 14px' }} onClick={() => setAberta(c)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-strong" style={{ fontSize: 14 }}>{c.descricao}</div>
                    {c.fornecedor_nome && <div className="t-caption" style={{ fontSize: 11.5 }}>{c.fornecedor_nome}</div>}
                  </div>
                  <span style={{ width: 16, height: 16, color: 'var(--text-3)', flexShrink: 0 }}>{Icon.chevR}</span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>ORÇADO</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{fmtCur(total)}</div>
                  </div>
                  {c.valor_contrato != null && (
                    <>
                      <div>
                        <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>CONTRATO</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{fmtCur(c.valor_contrato)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>SALDO</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: saldo < 0 ? 'var(--danger)' : 'var(--success)' }}>{fmtCur(saldo)}</div>
                      </div>
                    </>
                  )}
                  <div>
                    <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em' }}>ITENS</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)' }}>{itens.length}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {aberta && (
        <ItensPopup
          contratacao={aberta}
          itens={itensPorContratacao[aberta.id] || []}
          onFechar={() => setAberta(null)}
          onMudou={carregar}
        />
      )}
    </div>
  );
}

const campo = { width: '100%', boxSizing: 'border-box', height: 40, borderRadius: 10, border: '1.5px solid var(--border)',
  background: 'var(--surface-2)', padding: '0 10px', fontSize: 13.5, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' };

// Linha de um item. Os quatro campos têm estado próprio e controlado — não
// só o preço (que precisa da máscara de moeda): se o banco recusar a
// gravação (visitante, sessão vencida, sem internet), o campo volta a
// mostrar o valor de verdade em vez de continuar exibindo o que a pessoa
// digitou como se tivesse salvo.
function ItemRow({ item, salvando, onSalvarCampo, onApagar }) {
  const [descricao, setDescricao] = useState(item.descricao || '');
  const [unidade, setUnidade] = useState(item.unidade || '');
  const [quantidade, setQuantidade] = useState(String(item.quantidade ?? ''));
  const [preco, setPreco] = useState(fmtCur(item.preco_unitario));

  async function salvarTexto(campoNome, valor, valorAtual, desfazer) {
    if (valor === (valorAtual || '')) return;
    const ok = await onSalvarCampo(item, campoNome, valor);
    if (!ok) desfazer(valorAtual || '');
  }

  async function salvarQuantidade() {
    // Number(item.quantidade) por defesa: a coluna pode voltar como string
    // dependendo do driver — mesma cautela de src/lib/orcamento.js.
    const atual = Number(item.quantidade) || 0;
    const v = Number(quantidade) || 0;
    if (v === atual) { setQuantidade(String(atual)); return; }
    const ok = await onSalvarCampo(item, 'quantidade', v);
    if (!ok) setQuantidade(String(atual));
  }

  async function salvarPreco() {
    // parseV já extrai só os dígitos (ver src/lib/moeda.js): funciona tanto
    // em cima do texto mascarado ("R$ 12,50") quanto em cima de dígitos crus.
    const atual = Number(item.preco_unitario) || 0;
    const v = parseV(preco) ?? 0;
    if (v === atual) { setPreco(fmtCur(atual)); return; }
    const ok = await onSalvarCampo(item, 'preco_unitario', v);
    if (!ok) setPreco(fmtCur(atual));
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px 118px 32px', gap: 6, alignItems: 'center' }}>
      <input value={descricao} placeholder="Descrição"
        onChange={e => setDescricao(e.target.value)}
        onBlur={e => salvarTexto('descricao', e.target.value, item.descricao, setDescricao)}
        style={campo} />
      <input value={unidade} placeholder="un."
        onChange={e => setUnidade(e.target.value)}
        onBlur={e => salvarTexto('unidade', e.target.value, item.unidade, setUnidade)}
        style={campo} />
      <input type="number" step="any" value={quantidade} placeholder="Qtd"
        onChange={e => setQuantidade(e.target.value)}
        onBlur={salvarQuantidade}
        style={campo} />
      <input value={preco} placeholder="R$ 0,00"
        onChange={e => setPreco(fmtV(e.target.value))}
        onBlur={salvarPreco}
        style={campo} />
      <button onClick={() => onApagar(item)} disabled={salvando} title="Apagar"
        style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
    </div>
  );
}

function ItensPopup({ contratacao, itens, onFechar, onMudou }) {
  const [salvandoId, setSalvandoId] = useState(null);

  async function adicionar() {
    const { error } = await supabase.from('orcamento_itens').insert({
      contratacao_id: contratacao.id, descricao: '', unidade: '', quantidade: 1, preco_unitario: 0,
      ordem: itens.length,
    });
    if (error) { avisarErro(error, 'adicionar o item'); return; }
    onMudou();
  }

  // Devolve se salvou ou não — a linha usa isso para desfazer o campo na
  // tela quando o banco recusa (visitante, sessão vencida, sem internet):
  // sem isso, o campo ficava mostrando o que a pessoa digitou como se
  // tivesse salvo, quando na verdade não salvou nada.
  async function salvarCampo(item, campoNome, valor) {
    setSalvandoId(item.id);
    const { error } = await supabase.from('orcamento_itens').update({ [campoNome]: valor }).eq('id', item.id);
    setSalvandoId(null);
    if (error) { avisarErro(error, 'salvar o item'); return false; }
    onMudou();
    return true;
  }

  async function apagar(item) {
    if (!confirm(`Apagar o item "${item.descricao || 'sem descrição'}"?`)) return;
    const { error } = await supabase.from('orcamento_itens').delete().eq('id', item.id);
    if (error) { avisarErro(error, 'apagar o item'); return; }
    onMudou();
  }

  const total = totalOrcamento(itens);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', background: 'var(--surface)',
        borderRadius: 20, padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>💰 {contratacao.descricao}</div>
          <button onClick={onFechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {contratacao.fornecedor_nome && <div className="t-caption" style={{ marginBottom: 16 }}>{contratacao.fornecedor_nome}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {itens.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '10px 0' }}>Nenhum item ainda. Adicione abaixo.</div>
          )}
          {itens.map(item => (
            <ItemRow key={item.id} item={item} salvando={salvandoId === item.id}
              onSalvarCampo={salvarCampo} onApagar={apagar} />
          ))}
        </div>

        <button onClick={adicionar} className="btn btn-ghost btn-sm" style={{ marginBottom: 16 }}>
          <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Novo item
        </button>

        <div style={{ height: 1, background: 'var(--border)', marginBottom: 12 }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-2)' }}>Total orçado</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--text-1)' }}>{fmtCur(total)}</span>
        </div>
      </div>
    </div>
  );
}
