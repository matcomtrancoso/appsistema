// Cards da coluna do meio da home (desktop): o dia, a obra e os projetos.
// Cada um busca o próprio dado — são consultas pequenas e independentes.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { hojeLocal, toISODate, diasRestantes } from '../lib/date';
import { indicadoresObra, situacaoItem, SIT } from '../lib/cronograma';
import { chaveDoDia } from '../lib/atividades-do-dia';


function CardHeader({ titulo, extra }) {
  return (
    <div className="row-between" style={{ marginBottom: 10 }}>
      <div className="t-micro">{titulo}</div>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {extra}
        <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
      </span>
    </div>
  );
}

const Vazio = ({ children }) => (
  <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '8px 0' }}>{children}</div>
);

// ── Planejamento do dia ─────────────────────────────────────────────────────
const CORES_STATUS = {
  feita:        { label: 'Feitas',       cor: 'var(--success)' },
  em_andamento: { label: 'Em andamento', cor: 'var(--primary)' },
  nao_feita:    { label: 'Não feitas',   cor: 'var(--danger)' },
  pendente:     { label: 'A fazer',      cor: 'var(--text-3)' },
};

export function PlanejamentoHojeCard({ goto }) {
  const [ativs, setAtivs] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const hoje = hojeLocal();
      const diaChave = chaveDoDia(hojeLocal());
      // A atividade pode estar num RDO de outro dia da semana e repetir hoje
      // por dias_semana, então a busca é a semana inteira e o corte é aqui.
      const agora = new Date();
      const seg = new Date(agora);
      seg.setDate(agora.getDate() - (agora.getDay() === 0 ? 6 : agora.getDay() - 1));
      const dias = [0, 1, 2, 3, 4, 5, 6].map(i => {
        const d = new Date(seg); d.setDate(seg.getDate() + i); return toISODate(d);
      });

      const { data: rdos, error } = await supabase.from('rdos').select('id, data').in('data', dias);
      if (!vivo) return;
      if (error || !rdos?.length) { setCarregando(false); return; }

      const dataPorRdo = Object.fromEntries(rdos.map(r => [r.id, r.data]));
      const { data: rows } = await supabase
        .from('atividades_rdo')
        .select('id, descricao, ambiente, empreiteiro, status, status_por_dia, dias_semana, rdo_id')
        .in('rdo_id', rdos.map(r => r.id));
      if (!vivo) return;

      const doDia = (rows || []).filter(a => (a.dias_semana?.length
        ? a.dias_semana.includes(diaChave)
        : dataPorRdo[a.rdo_id] === hoje));
      setAtivs(doDia.map(a => ({ ...a, st: a.status_por_dia?.[diaChave] || a.status || 'pendente' })));
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, []);

  const contagem = {};
  for (const a of ativs) contagem[a.st] = (contagem[a.st] || 0) + 1;
  const ordem = ['em_andamento', 'feita', 'pendente', 'nao_feita'];

  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('planejar')}>
      <CardHeader titulo="PLANEJAMENTO DO DIA"
        extra={<span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-3)' }}>{ativs.length || ''}</span>} />

      {carregando && <Vazio>Carregando…</Vazio>}
      {!carregando && ativs.length === 0 && <Vazio>Nada planejado para hoje</Vazio>}

      {ativs.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 12 }}>
            {ordem.map(k => (
              <div key={k} style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1, color: contagem[k] ? CORES_STATUS[k].cor : 'var(--text-3)' }}>
                  {contagem[k] || 0}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, marginTop: 3 }}>{CORES_STATUS[k].label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {ativs.slice(0, 3).map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', background: 'var(--surface-2)', borderRadius: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, flexShrink: 0, background: CORES_STATUS[a.st]?.cor || 'var(--text-3)' }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.descricao}
                </span>
                {a.empreiteiro && (
                  <span style={{ fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{a.empreiteiro}</span>
                )}
              </div>
            ))}
            {ativs.length > 3 && (
              <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '2px 0' }}>+{ativs.length - 3} mais</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Cronograma: indicadores + o que está em andamento ───────────────────────
export function CronogramaResumoCard({ goto }) {
  const [folhas, setFolhas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    supabase.from('cronograma_itens')
      .select('id, nome, percentual, concluido, inicio_real, inicio_previsto, termino_previsto, duracao_dias')
      .eq('is_grupo', false)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) console.error('Erro ao carregar cronograma (home):', error);
        setFolhas(data || []);
        setCarregando(false);
      });
    return () => { vivo = false; };
  }, []);

  const ind = indicadoresObra(folhas);
  const andamento = folhas
    .filter(f => situacaoItem(f).chave === SIT.andamento.chave)
    .sort((a, b) => (b.percentual || 0) - (a.percentual || 0));
  const atrasados = folhas.filter(f => situacaoItem(f).chave === SIT.atrasado.chave).length;

  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('cronograma')}>
      <CardHeader titulo="CRONOGRAMA"
        extra={atrasados > 0 && (
          <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--danger)', background: 'var(--danger-tint, #FEE2E2)', padding: '2px 7px', borderRadius: 999 }}>
            {atrasados} atrasado{atrasados !== 1 ? 's' : ''}
          </span>
        )} />

      {carregando && <Vazio>Carregando…</Vazio>}
      {!carregando && !ind && <Vazio>Cronograma ainda não importado</Vazio>}

      {ind && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)' }}>Deveria estar</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: 'var(--text-2)', lineHeight: 1.1, marginTop: 2 }}>{ind.previsto}%</div>
            </div>
            <div style={{ background: 'var(--primary-tint)', borderRadius: 10, padding: '9px 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--primary)' }}>Está</div>
              <div style={{ fontSize: 21, fontWeight: 900, color: 'var(--primary)', lineHeight: 1.1, marginTop: 2 }}>{ind.realizado}%</div>
            </div>
            <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)' }}>Desvio</div>
              <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.1, marginTop: 2, color: ind.desvio < 0 ? 'var(--danger)' : 'var(--success)' }}>
                {ind.desvio > 0 ? '+' : ''}{ind.desvio}%
              </div>
            </div>
          </div>

          <div className="t-micro" style={{ marginBottom: 7 }}>EM ANDAMENTO</div>
          {andamento.length === 0 ? (
            <Vazio>Nenhum serviço iniciado</Vazio>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {andamento.slice(0, 3).map(f => (
                <div key={f.id}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.nome}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 900, color: 'var(--primary)' }}>{f.percentual || 0}%</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: 'var(--surface-2)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(2, f.percentual || 0)}%`, height: '100%', borderRadius: 999, background: 'var(--primary)' }} />
                  </div>
                </div>
              ))}
              {andamento.length > 3 && (
                <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>+{andamento.length - 3} mais</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Projetos a vencer ───────────────────────────────────────────────────────
export function ProjetosVencendoCard({ goto }) {
  const [projetos, setProjetos] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let vivo = true;
    supabase.from('projetos')
      .select('id, nome, disciplina, data_prevista, oculto')
      .in('status', ['nao_iniciado', 'em_andamento'])
      .not('data_prevista', 'is', null)
      .order('data_prevista')
      .limit(20)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) console.error('Erro ao carregar projetos (home):', error);
        setProjetos((data || []).filter(p => !p.oculto));
        setCarregando(false);
      });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => goto('projetos')}>
      <CardHeader titulo="PROJETOS A RECEBER" />
      {carregando && <Vazio>Carregando…</Vazio>}
      {!carregando && projetos.length === 0 && <Vazio>Nenhum projeto aguardando</Vazio>}

      {projetos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {projetos.slice(0, 3).map(p => {
            const dias = diasRestantes(p.data_prevista);
            const atrasado = dias !== null && dias < 0;
            const urgente = dias !== null && dias >= 0 && dias <= 7;
            return (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '6px 8px', borderRadius: 8, background: atrasado ? 'var(--danger-tint, #FEE2E2)' : urgente ? 'var(--warn-tint)' : 'var(--surface-2)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</div>
                  {p.disciplina && <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{p.disciplina}</div>}
                </div>
                {dias !== null && (
                  <span style={{ fontSize: 11, fontWeight: 800, whiteSpace: 'nowrap', color: atrasado ? 'var(--danger)' : urgente ? 'var(--warn)' : 'var(--text-3)' }}>
                    {dias === 0 ? 'Hoje' : atrasado ? `${Math.abs(dias)}d atraso` : `${dias}d`}
                  </span>
                )}
              </div>
            );
          })}
          {projetos.length > 3 && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '2px 0' }}>+{projetos.length - 3} mais</div>
          )}
        </div>
      )}
    </div>
  );
}
