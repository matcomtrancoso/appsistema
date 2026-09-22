// Medições: o percentual de avanço físico que alguém MEDIU no canteiro e
// registrou, por data — diferente do percentual que a tela de Cronograma
// CALCULA a partir do avanço de cada item. Mestre e engenharia usam esta
// tela (é o mestre quem costuma medir no campo).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { hojeLocal } from '../lib/date';
import { avisarErro, msgAmigavel } from '../lib/msg-amigavel';

const fmtData = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function MedicoesScreen({ goto, profile, voltarPara = 'home' }) {
  const [medicoes, setMedicoes] = useState(null);
  const [erro, setErro] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);

  const carregar = useCallback(() => {
    supabase.from('medicoes_obra').select('*').order('data', { ascending: false })
      .then(({ data, error }) => {
        if (error) { setErro(msgAmigavel(error, 'carregar as medições')); setMedicoes([]); return; }
        setErro('');
        setMedicoes(data || []);
      });
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Não existe edição — só apagar e medir de novo. É o jeito de corrigir uma
  // medição digitada errado (o dia só aceita uma, por causa da chave única).
  async function apagar(m) {
    if (!confirm(`Apagar a medição de ${fmtData(m.data)} (${m.percentual}%)?`)) return;
    const { error } = await supabase.from('medicoes_obra').delete().eq('id', m.id);
    if (error) { avisarErro(error, 'apagar a medição'); return; }
    carregar();
  }

  const ultima = medicoes?.[0];

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div className="t-micro">ACOMPANHAMENTO</div>
            <div className="t-h1">Medições</div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setNovaAberta(true)}>
            <span style={{ width: 14, height: 14 }}>{Icon.plus}</span>Medir
          </button>
        </div>
      </div>

      <div className="page-pad" style={{ marginTop: 16 }}>
        <div className="t-caption" style={{ fontSize: 12, marginBottom: 14, lineHeight: 1.5 }}>
          O percentual que alguém mediu no canteiro e registrou aqui — diferente do avanço que o
          Cronograma calcula sozinho a partir de cada item.
        </div>

        {erro && (
          <div className="card" style={{ padding: 14, marginBottom: 12, background: 'var(--danger-tint,#FEE2E2)', color: 'var(--danger)', fontSize: 13, fontWeight: 700 }}>
            ⚠️ {erro}
          </div>
        )}
        {medicoes === null && <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

        {ultima && (
          <div className="card" style={{ padding: 18, marginBottom: 16, textAlign: 'center', position: 'relative' }}>
            <button onClick={() => apagar(ultima)} title="Apagar" aria-label="Apagar esta medição"
              style={{ position: 'absolute', top: 10, right: 10, width: 32, height: 32, border: 0, borderRadius: 8,
                background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14 }}>🗑</button>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>ÚLTIMA MEDIÇÃO</div>
            <div style={{ fontSize: 36, fontWeight: 900, color: 'var(--primary)' }}>{ultima.percentual}%</div>
            <div className="t-caption" style={{ marginTop: 2 }}>{fmtData(ultima.data)}</div>
          </div>
        )}

        <div className="stack stack-2">
          {(medicoes || []).slice(ultima ? 1 : 0).map(m => (
            <div key={m.id} className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0, background: 'var(--primary-tint)', color: 'var(--primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900 }}>{m.percentual}%</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-strong" style={{ fontSize: 13.5 }}>{fmtData(m.data)}</div>
                {m.observacoes && <div className="t-caption" style={{ fontSize: 11.5, marginTop: 2 }}>{m.observacoes}</div>}
                {m.responsavel_nome && <div className="t-caption" style={{ fontSize: 10.5, marginTop: 2 }}>por {m.responsavel_nome}</div>}
              </div>
              <button onClick={() => apagar(m)} title="Apagar" aria-label="Apagar esta medição"
                style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: 14, flexShrink: 0 }}>🗑</button>
            </div>
          ))}
        </div>

        {medicoes?.length === 0 && !erro && (
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Nenhuma medição registrada ainda.</div>
        )}
      </div>

      {novaAberta && (
        <NovaMedicaoPopup profile={profile} onFechar={() => setNovaAberta(false)}
          onSalvo={() => { setNovaAberta(false); carregar(); }} />
      )}
    </div>
  );
}

function NovaMedicaoPopup({ profile, onFechar, onSalvo }) {
  const [data, setData] = useState(hojeLocal());
  const [percentual, setPercentual] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [salvando, setSalvando] = useState(false);

  const num = Number(percentual);
  const percentualValido = percentual !== '' && Number.isFinite(num) && num >= 0 && num <= 100;
  // O max="{hoje}" do <input type="date"> é só uma dica pro seletor nativo —
  // digitando os dígitos na mão dá pra passar dele. Sem checar aqui de novo,
  // uma medição "do futuro" entrava sem ninguém barrar.
  const dataValida = data <= hojeLocal();
  const pronto = percentualValido && dataValida;

  async function salvar() {
    if (!pronto || salvando) return;
    setSalvando(true);
    const { error } = await supabase.from('medicoes_obra').insert({
      data, percentual: num, observacoes: observacoes.trim() || null,
      responsavel_nome: profile?.nome || null,
    });
    setSalvando(false);
    if (error) { avisarErro(error, 'salvar a medição'); return; }
    onSalvo();
  }

  const campo = { width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
    background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' };
  const rotulo = { fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', borderRadius: 20,
        padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>📏 Nova medição</div>
          <button onClick={onFechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        <div style={rotulo}>DATA</div>
        <input type="date" value={data} max={hojeLocal()} onChange={e => setData(e.target.value)} style={{ ...campo, marginBottom: dataValida ? 14 : 4 }} />
        {!dataValida && (
          <div className="t-caption" style={{ fontSize: 11, marginBottom: 10, color: 'var(--danger)' }}>A data não pode ser no futuro.</div>
        )}

        <div style={rotulo}>PERCENTUAL EXECUTADO (0 a 100) *</div>
        <input type="number" min="0" max="100" step="0.1" value={percentual} onChange={e => setPercentual(e.target.value)}
          placeholder="Ex.: 42" style={{ ...campo, marginBottom: 4 }} />
        {percentual !== '' && !percentualValido && (
          <div className="t-caption" style={{ fontSize: 11, marginBottom: 10, color: 'var(--danger)' }}>Digite um número de 0 a 100.</div>
        )}

        <div style={{ ...rotulo, marginTop: 10 }}>OBSERVAÇÕES</div>
        <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3}
          placeholder="O que foi conferido, ressalvas…" style={{ ...campo, height: 'auto', padding: '10px 14px', resize: 'none', marginBottom: 18 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onFechar} style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
            background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
          <button onClick={salvar} disabled={!pronto || salvando}
            style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', fontFamily: 'inherit',
              background: pronto && !salvando ? 'var(--primary)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
            {salvando ? 'Salvando…' : 'Salvar medição'}
          </button>
        </div>
      </div>
    </div>
  );
}
