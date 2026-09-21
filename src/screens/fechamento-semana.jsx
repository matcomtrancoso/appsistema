// Fechamento da semana: o que o app já sabe, pronto para colar na planilha
// "Planejamento Semanal". Só desktop — é a tela da quinta-feira.
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { MOTIVOS_NAO_EXEC } from '../data/index';
import { hojeLocal, parseISODate, addDaysISO } from '../lib/date';
import { statusDaSemana, contratacoesDaSemana, indicadores, paraTSV, C, I, N }
  from '../lib/fechamento-semana';

const NOME_MOTIVO = Object.fromEntries(MOTIVOS_NAO_EXEC.map(m => [m.id, m.nome]));
const COR ={ [C]: 'var(--success)', [I]: 'var(--warn)', [N]: 'var(--danger)' };
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function segundaDaSemana(iso) {
  const d = parseISODate(iso);
  const dow = d.getDay();
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

const Tile = ({ rotulo, valor, cor }) => (
  <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '9px 11px', flex: 1 }}>
    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)' }}>{rotulo}</div>
    <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.1, marginTop: 2, color: cor || 'var(--text-1)' }}>{valor}</div>
  </div>
);

function Secao({ titulo, colunas, campos, linhas, vazio }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(paraTSV(linhas, campos));
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1600);
  };
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
        <div className="t-micro" style={{ flex: 1 }}>{titulo} · {linhas.length}</div>
        {linhas.length > 0 && (
          <button onClick={copiar} style={{
            height: 26, padding: '0 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
            fontSize: 11.5, fontWeight: 800, border: '1px solid var(--border)',
            background: copiado ? 'var(--success)' : 'var(--surface-2)',
            color: copiado ? '#fff' : 'var(--text-2)',
          }}>
            {copiado ? '✓ copiado' : 'Copiar'}
          </button>
        )}
      </div>
      {linhas.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '6px 0' }}>{vazio}</div>
      ) : (
        <div style={{ border: '0.5px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `2.2fr 1fr 34px 2fr`, gap: 0, background: 'var(--surface-2)', padding: '6px 10px' }}>
            {colunas.map(c => (
              <div key={c} style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.05em' }}>{c}</div>
            ))}
          </div>
          {linhas.map((l, i) => (
            <div key={l.id || i} style={{
              display: 'grid', gridTemplateColumns: `2.2fr 1fr 34px 2fr`, gap: 0,
              padding: '7px 10px', borderTop: '0.5px solid var(--border)', alignItems: 'baseline',
            }}>
              {campos.map((k, ci) => (
                <div key={k} style={{
                  fontSize: 12, minWidth: 0, paddingRight: 8,
                  fontWeight: ci === 0 ? 700 : 500,
                  color: k === 'status' ? COR[l[k]] : ci === 0 ? 'var(--text-1)' : 'var(--text-3)',
                }}>
                  {k === 'status' ? <strong>{l[k]}</strong> : l[k]}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function FechamentoSemanaPopup({ onClose }) {
  const [offset, setOffset] = useState(0);
  const [ativs, setAtivs] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const { de, ate } = useMemo(() => {
    const seg = addDaysISO(segundaDaSemana(hojeLocal()), offset * 7);
    return { de: seg, ate: addDaysISO(seg, 6) };
  }, [offset]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true);
      const dias = Array.from({ length: 7 }, (_, i) => addDaysISO(de, i));
      const { data: rdos, error: eR } = await supabase.from('rdos').select('id, data').in('data', dias);
      if (!vivo) return;
      if (eR) { setErro('Não foi possível carregar a semana.'); setCarregando(false); return; }

      let linhas = [];
      if (rdos?.length) {
        const { data: rows } = await supabase
          .from('atividades_rdo')
          .select('id, descricao, ambiente, empreiteiro, status, status_por_dia, dias_semana, motivo_nao_exec, rdo_id')
          .in('rdo_id', rdos.map(r => r.id));
        if (!vivo) return;
        // Uma atividade repetida em vários dias vira uma linha só na planilha —
        // uma linha por atividade na semana.
        linhas = (rows || []).map(a => {
          const st = statusDaSemana(a);
          return {
            id: a.id,
            descricao: a.descricao || '',
            responsavel: a.empreiteiro || '',
            ambiente: a.ambiente || '',
            status: st,
            observacao: st === N && a.motivo_nao_exec ? (NOME_MOTIVO[a.motivo_nao_exec] || a.motivo_nao_exec) : '',
          };
        });
      }
      setAtivs(linhas);

      const { data: cts } = await supabase
        .from('contratacoes')
        .select('id, descricao, responsavel_nome, fornecedor_nome, prazo_envio, data_envio, data_aprovacao');
      if (!vivo) return;
      setContratos(cts || []);
      setCarregando(false);
    })();
    return () => { vivo = false; };
  }, [de]);

  const linhasContrat = useMemo(() => contratacoesDaSemana(contratos, de, ate), [contratos, de, ate]);
  const ind = indicadores([...ativs, ...linhasContrat]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 24 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.28)' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px 12px' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-strong" style={{ fontSize: 18 }}>Fechamento da semana</div>
            <div className="t-caption" style={{ fontSize: 12.5, marginTop: 1 }}>Para colar no Planejamento Semanal</div>
          </div>
          <button onClick={() => setOffset(o => o - 1)} title="Semana anterior"
            style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 15, height: 15 }}>{Icon.back}</span>
          </button>
          <div style={{ textAlign: 'center', minWidth: 104 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>{ddmm(de)} – {ddmm(ate)}</div>
            <div className="t-caption" style={{ fontSize: 11 }}>
              {offset === 0 ? 'Esta semana' : offset === -1 ? 'Semana passada' : `${-offset} semanas atrás`}
            </div>
          </div>
          <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset >= 0} title="Próxima semana"
            style={{ width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: offset >= 0 ? 'not-allowed' : 'pointer', opacity: offset >= 0 ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 15, height: 15 }}>{Icon.chevR}</span>
          </button>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 0, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 14, height: 14 }}>{Icon.x}</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '0 20px 14px' }}>
          <Tile rotulo="Total de atividades" valor={ind.total} />
          <Tile rotulo="Concluído" valor={`${ind.pctC}%`} cor="var(--success)" />
          <Tile rotulo="Iniciado" valor={`${ind.pctI}%`} cor="var(--warn)" />
          <Tile rotulo="Não executado" valor={`${ind.pctN}%`} cor="var(--danger)" />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 20px' }}>
          {erro && <div style={{ padding: 16, textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          {carregando && <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Carregando…</div>}

          {!carregando && !erro && (
            <>
              <Secao
                titulo="CANTEIRO DE OBRA"
                colunas={['ATIVIDADE', 'FORNECEDOR', 'ST', 'OBSERVAÇÃO']}
                campos={['descricao', 'responsavel', 'status', 'observacao']}
                linhas={ativs}
                vazio="Nenhuma atividade planejada nesta semana."
              />
              <Secao
                titulo="CONTRATAÇÕES / COMPRA DE MATERIAIS"
                colunas={['SERVIÇO/MATERIAL', 'RESPONSÁVEL', 'ST', 'OBSERVAÇÃO']}
                campos={['descricao', 'responsavel', 'status', 'observacao']}
                linhas={linhasContrat}
                vazio="Nada enviado, aprovado ou vencendo nesta semana."
              />
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6, borderTop: '0.5px solid var(--border)', paddingTop: 10 }}>
                Fora daqui: <strong>Atividades da engenharia</strong> e <strong>Aprovações pendentes</strong> não existem no app —
                continuam na mão. A coluna <strong>Efetivo</strong> da planilha também não é preenchida.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
