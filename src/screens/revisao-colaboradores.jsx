// Aviso para a engenharia: o mestre cadastrou alguém direto no efetivo do dia.
// Aparece ao entrar no app e só sai quando cada pessoa for conferida — a
// documentação de segurança do trabalho é o motivo de existir desta tela.
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Icon } from '../components/index';
import { useObra } from '../lib/ObraContext';

export function RevisaoColaboradoresPopup() {
  const { empresas, reload } = useObra();
  const [pendentes, setPendentes] = useState([]);
  const [fechado, setFechado] = useState(false);
  const [salvando, setSalvando] = useState(null);

  useEffect(() => {
    let vivo = true;
    supabase.from('colaboradores')
      .select('id, nome, funcao, iniciais, empreiteiro_id, cadastrado_por, created_at')
      .eq('pendente_revisao', true)
      .order('created_at')
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) { console.error('Erro ao buscar colaboradores a revisar:', error); return; }
        setPendentes(data || []);
      });
    return () => { vivo = false; };
  }, []);

  if (fechado || pendentes.length === 0) return null;

  const nomeEmpresa = (id) => empresas.find(e => (id ? e.id === id : e.id === 'adm'))?.nome || 'ADM';

  const conferir = async (id) => {
    setSalvando(id);
    const { error } = await supabase.from('colaboradores')
      .update({ pendente_revisao: false }).eq('id', id);
    setSalvando(null);
    if (error) {
      console.error('Erro ao marcar colaborador como conferido:', error);
      window.alert('Não foi possível confirmar. Tente novamente.');
      return;
    }
    setPendentes(prev => prev.filter(p => p.id !== id));
    reload?.();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: 'var(--surface)', borderRadius: 18, width: '100%', maxWidth: 460,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ padding: '20px 20px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 6 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: 'var(--warn-tint)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ width: 16, height: 16 }}>{Icon.alert}</span>
            </span>
            <div className="t-strong" style={{ fontSize: 17 }}>
              {pendentes.length === 1 ? 'Uma pessoa nova no canteiro' : `${pendentes.length} pessoas novas no canteiro`}
            </div>
          </div>
          <div className="t-caption" style={{ fontSize: 13, lineHeight: 1.5 }}>
            O mestre lançou no efetivo {pendentes.length === 1 ? 'alguém que não estava' : 'gente que não estava'} no
            cadastro. <strong>Confira a documentação de segurança do trabalho</strong> antes de liberar.
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
          {pendentes.map(p => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderTop: '0.5px solid var(--border)' }}>
              <span style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, background: 'var(--surface-2)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800 }}>
                {p.iniciais || '?'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>{p.nome}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
                  {[p.funcao, nomeEmpresa(p.empreiteiro_id), p.cadastrado_por && `por ${p.cadastrado_por}`]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <button onClick={() => conferir(p.id)} disabled={salvando === p.id}
                style={{ height: 30, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 800, background: 'var(--success)', color: '#fff', opacity: salvando === p.id ? 0.5 : 1 }}>
                {salvando === p.id ? '…' : 'Conferido'}
              </button>
            </div>
          ))}
        </div>

        <div style={{ padding: '12px 20px 18px', borderTop: '0.5px solid var(--border)' }}>
          {/* "Depois" não confere ninguém: o aviso volta na próxima entrada. */}
          <button className="btn btn-secondary btn-block" onClick={() => setFechado(true)}>
            Ver depois
          </button>
        </div>
      </div>
    </div>
  );
}
