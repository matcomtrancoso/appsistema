import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useObra } from '../lib/ObraContext';
import { Icon, PageHeader, Avatar, ConfirmDialog } from '../components/index';
import { apagarLinha } from '../lib/excluir';
import { avisarErro, comPrazo } from '../lib/msg-amigavel';
// Apagar cadastro é só da engenharia (regra no banco). O aviso mora aqui, em
// escopo de módulo, porque três componentes desta tela removem cadastros.
async function apagarComAviso(tabela, id, oQue) {
  const r = await apagarLinha(tabela, id);
  if (r.erro) { avisarErro(r.erro, 'remover o ' + oQue); return false; }
  if (r.barrado) {
    window.alert('Nada foi removido. Seu acesso não permite apagar ' + oQue + ': só a engenharia pode.');
    return false;
  }
  return true;
}

// Grava e diz se deu certo. Antes o erro do banco era ignorado: o formulário
// fechava como se tivesse salvo e, sem internet, o botão ficava preso em
// "Salvando…". Aqui o erro vira aviso em português e o pedido tem prazo.
async function gravar(consulta, acao) {
  const { error } = await comPrazo(consulta);
  if (error) { avisarErro(error, acao); return false; }
  return true;
}

const CORES = [
  '#7C5CFF','#0EA5E9','#F59E0B','#8B7355','#64748B',
  '#1F6B3A','#E11D48','#0891B2','#7C3AED','#EA580C',
];

// ── Tela principal ──────────────────────────────────────────────────────────
export function EngCadastros({ goto }) {
  const [tab, setTab] = useState('empreiteiros');

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => goto('mais')}>
          <span style={{ width: 18, height: 18 }}>{Icon.back}</span> Voltar
        </button>
      </div>
      <PageHeader eyebrow="CONFIGURAÇÕES" title="Cadastros base"
        sub="Fornecedores, colaboradores e ambientes" />

      <div style={{ padding: '0 var(--pad-4) 14px', display: 'flex', gap: 6 }}>
        {[
          { k: 'empreiteiros', l: 'Fornecedores' },
          { k: 'colaboradores', l: 'Colaboradores' },
          { k: 'ambientes', l: 'Ambientes' },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} style={{
            flex: 1, height: 34, border: 0, cursor: 'pointer',
            borderRadius: 999, fontSize: 12, fontWeight: 700,
            background: tab === t.k ? 'var(--primary)' : 'var(--surface-2)',
            color: tab === t.k ? '#fff' : 'var(--text-2)',
          }}>{t.l}</button>
        ))}
      </div>

      {tab === 'empreiteiros'  && <EmpreiteirosList />}
      {tab === 'colaboradores' && <ColaboradoresList />}
      {tab === 'ambientes'     && <AmbientesList />}
    </div>
  );
}

// ── Pill de cor ─────────────────────────────────────────────────────────────
function ColorPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {CORES.map(c => (
        <button key={c} onClick={() => onChange(c)} style={{
          width: 34, height: 34, borderRadius: 999, background: c,
          border: value === c ? '3px solid var(--text)' : '3px solid transparent',
          cursor: 'pointer',
          boxShadow: value === c ? '0 0 0 2px var(--surface), 0 0 0 4px ' + c : 'none',
        }} />
      ))}
    </div>
  );
}

// ── Fornecedores / Empreiteiros ─────────────────────────────────────────────
function EmpreiteirosList() {
  const { empreiteiros, colaboradores, reload, profile, somenteLeitura } = useObra();
  const isMestre = profile?.role === 'mestre';
  const [confirm, setConfirm] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // form add
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES[0]);
  const [saving, setSaving] = useState(false);

  // form edit
  const [editNome, setEditNome] = useState('');
  const [editCor, setEditCor] = useState(CORES[0]);

  const openEdit = (e) => {
    setEditingId(e.id);
    setEditNome(e.nome);
    setEditCor(e.cor);
    setAdding(false);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editNome.trim()) return;
    setSaving(true);
    try {
      const ok = await gravar(supabase.from('empreiteiros')
        .update({ nome: editNome.trim(), cor: editCor })
        .eq('id', editingId), 'salvar o fornecedor');
      if (!ok) return;   // formulário fica aberto com o que foi digitado
      await reload();
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    try {
      const ok = await gravar(supabase.from('empreiteiros').insert({ nome: nome.trim(), cor }), 'salvar o fornecedor');
      if (!ok) return;
      await reload();
      setNome(''); setCor(CORES[0]); setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const askDelEmp = (e) => {
    setConfirm({
      title: 'Remover fornecedor',
      message: `Remover "${e.nome}"? Os colaboradores vinculados perderão o vínculo.`,
      confirmLabel: 'Remover',
      variant: 'danger',
      onConfirm: async () => {
        await apagarComAviso('empreiteiros', e.id, 'fornecedor');
        await reload();
      },
    });
  };

  const closeConfirm = () => setConfirm(null);

  return (
    <>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel || 'OK'}
        variant={confirm?.variant || 'primary'}
        onCancel={closeConfirm}
        onConfirm={confirm?.onConfirm || (async () => {})}
      />
      <div className="page-pad stack stack-2">
      {empreiteiros.length === 0 && !adding && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 12px' }}>
          <div className="t-strong">Nenhum fornecedor ainda</div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            Adicione empreiteiros e fornecedores de mão de obra.
          </div>
        </div>
      )}

      {empreiteiros.map(e => {
        const nColabs = colaboradores.filter(c => c.empreiteiro_id === e.id && c.ativo !== false).length;
        return (
        <div key={e.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Linha normal */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: e.cor + '22', color: e.cor,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 14,
            }}>
              {e.nome.split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 999, background: e.cor }} />
                <div className="t-strong" style={{ fontSize: 15 }}>{e.nome}</div>
              </div>
              {nColabs > 0 && (
                <div className="t-caption" style={{ marginTop: 2 }}>
                  {nColabs} colaborador{nColabs !== 1 ? 'es' : ''} ativo{nColabs !== 1 ? 's' : ''}
                </div>
              )}
            </div>
            {/* Editar (o visitante só olha) */}
            {!somenteLeitura && (
            <button onClick={() => editingId === e.id ? cancelEdit() : openEdit(e)} title="Editar" aria-label="Editar" style={{
              width: 40, height: 40, border: 0, borderRadius: 8, cursor: 'pointer',
              background: editingId === e.id ? 'var(--primary-tint)' : 'transparent',
              color: editingId === e.id ? 'var(--primary)' : 'var(--text-3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ width: 16, height: 16 }}>{Icon.edit || Icon.more}</span>
            </button>
            )}
            {/* Excluir (só engenharia) */}
            {!isMestre && !somenteLeitura && (
            <button onClick={() => askDelEmp(e)} title="Remover" aria-label="Remover" style={{
              width: 40, height: 40, border: 0, borderRadius: 8, cursor: 'pointer',
              background: 'transparent', color: 'var(--danger)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ width: 16, height: 16 }}>{Icon.x}</span>
            </button>
            )}
          </div>

          {/* Painel de edição inline */}
          {editingId === e.id && (
            <div style={{
              borderTop: '0.5px solid var(--divider)',
              padding: '14px 14px 16px',
              background: 'var(--surface-2)',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              <div>
                <div className="t-micro" style={{ marginBottom: 6 }}>NOME</div>
                <input className="ipt" value={editNome}
                  onChange={ev => setEditNome(ev.target.value)} autoFocus />
              </div>
              <div>
                <div className="t-micro" style={{ marginBottom: 10 }}>COR</div>
                <ColorPicker value={editCor} onChange={setEditCor} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={cancelEdit}>Cancelar</button>
                <button className="btn btn-primary" style={{ flex: 1 }}
                  disabled={!editNome.trim() || saving} onClick={saveEdit}>
                  {saving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          )}
        </div>
        );
      })}

      {/* Formulário de novo fornecedor */}
      {adding ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input className="ipt" placeholder="Nome do fornecedor" value={nome}
            onChange={e => setNome(e.target.value)} autoFocus />
          <div>
            <div className="t-micro" style={{ marginBottom: 10 }}>COR</div>
            <ColorPicker value={cor} onChange={setCor} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }}
              onClick={() => { setAdding(false); setNome(''); }}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={!nome.trim() || saving} onClick={saveNew}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : !somenteLeitura && (
        <button className="btn btn-secondary btn-block"
          onClick={() => { setAdding(true); setEditingId(null); }}>
          <span style={{ width: 16, height: 16 }}>{Icon.plus}</span>Novo fornecedor
        </button>
      )}
      </div>
    </>
  );
}

// ── Colaboradores ───────────────────────────────────────────────────────────
function ColaboradoresList() {
  const { colaboradores, empreiteiros, empresas, reload, profile, somenteLeitura } = useObra();
  const isMestre = profile?.role === 'mestre';
  const [confirm, setConfirm] = useState(null);
  const [adding, setAdding] = useState(false);
  const [addingGroupKey, setAddingGroupKey] = useState(null); // empresa em que se está adicionando
  const [editingId, setEditingId] = useState(null);
  const [showInativos, setShowInativos] = useState(false);

  // form add
  const [nome, setNome] = useState('');
  const [funcao, setFuncao] = useState('Oficial');
  const [empId, setEmpId] = useState(null);
  const [saving, setSaving] = useState(false);

  // form edit
  const [editNome, setEditNome] = useState('');
  const [editFuncao, setEditFuncao] = useState('Oficial');
  const [editEmpId, setEditEmpId] = useState(null);

  const openEdit = (c) => {
    setEditingId(c.id);
    setEditNome(c.nome);
    setEditFuncao(c.funcao || 'Oficial');
    setEditEmpId(c.empreiteiro_id || null);
    setAdding(false);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async () => {
    if (!editNome.trim()) return;
    setSaving(true);
    const iniciais = editNome.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    try {
      const ok = await gravar(supabase.from('colaboradores')
        .update({ nome: editNome.trim(), funcao: editFuncao, empreiteiro_id: editEmpId, iniciais })
        .eq('id', editingId), 'salvar o colaborador');
      if (!ok) return;
      await reload();
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const saveNew = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    try {
      const ok = await gravar(supabase.from('colaboradores').insert({
        nome: nome.trim(), funcao, empreiteiro_id: empId, iniciais, ativo: true,
      }), 'salvar o colaborador');
      if (!ok) return;
      await reload();
      setNome(''); setFuncao('Oficial'); setEmpId(null);
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  // Adiciona colaborador já vinculado a uma empresa do grupo
  const saveNewForGroup = async (key) => {
    if (!nome.trim()) return;
    setSaving(true);
    const iniciais = nome.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join('').toUpperCase();
    try {
      const ok = await gravar(supabase.from('colaboradores').insert({
        nome: nome.trim(), funcao, empreiteiro_id: key === '__adm' ? null : key, iniciais, ativo: true,
      }), 'salvar o colaborador');
      if (!ok) return;
      await reload();
      setNome(''); setFuncao('Oficial'); setAddingGroupKey(null);
    } finally {
      setSaving(false);
    }
  };

  const askToggleAtivo = (c) => {
    const novoAtivo = c.ativo !== false ? false : true;
    setConfirm({
      title: novoAtivo ? 'Reativar colaborador' : 'Ocultar colaborador',
      message: novoAtivo
        ? `Deseja reativar ${c.nome}? Ele voltará a aparecer no efetivo.`
        : `Ocultar ${c.nome}? Ele não aparecerá mais no efetivo, mas o histórico é preservado.`,
      confirmLabel: novoAtivo ? 'Reativar' : 'Ocultar',
      variant: 'primary',
      onConfirm: async () => {
        const ok = await gravar(supabase.from('colaboradores').update({ ativo: novoAtivo }).eq('id', c.id),
          novoAtivo ? 'reativar o colaborador' : 'ocultar o colaborador');
        if (ok) await reload();
      },
    });
  };

  const askDelColab = (c) => {
    setConfirm({
      title: 'Remover colaborador',
      message: `Remover ${c.nome} permanentemente? Esta ação não pode ser desfeita.`,
      confirmLabel: 'Remover',
      variant: 'danger',
      onConfirm: async () => {
        await apagarComAviso('colaboradores', c.id, 'colaborador');
        await reload();
      },
    });
  };

  const closeConfirmColab = () => setConfirm(null);

  // Separar ativos e inativos
  const ativos   = colaboradores.filter(c => c.ativo !== false);
  const inativos = colaboradores.filter(c => c.ativo === false);

  // Grupos colapsáveis — inicia todos fechados
  const [openGroups, setOpenGroups] = useState({});
  const toggleGroup = (key) => setOpenGroups(v => ({ ...v, [key]: !v[key] }));

  // Agrupar ativos por empreiteiro
  const grupos = {};
  ativos.forEach(c => {
    const key = c.empreiteiro_id || '__adm';
    if (!grupos[key]) grupos[key] = [];
    grupos[key].push(c);
  });

  const ColabRow = ({ c, emp }) => (
    <div style={{ borderTop: '0.5px solid var(--divider)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
        <Avatar ini={c.iniciais} color={emp.cor} size={32} />
        <div style={{ flex: 1 }}>
          <div className="t-strong" style={{ fontSize: 14, color: c.ativo === false ? 'var(--text-3)' : 'inherit' }}>
            {c.nome}
          </div>
          <div className="t-caption">{c.funcao}</div>
        </div>
        {/* Editar, ocultar e excluir: o visitante só olha */}
        {!somenteLeitura && (<>
        <button onClick={() => editingId === c.id ? cancelEdit() : openEdit(c)} title="Editar" aria-label="Editar" style={{
          width: 40, height: 40, border: 0, borderRadius: 6, cursor: 'pointer',
          background: editingId === c.id ? 'var(--primary-tint)' : 'transparent',
          color: editingId === c.id ? 'var(--primary)' : 'var(--text-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ width: 14, height: 14 }}>{Icon.edit || Icon.more}</span>
        </button>
        {/* Ocultar / Reativar */}
        <button onClick={() => askToggleAtivo(c)} title={c.ativo === false ? 'Reativar' : 'Ocultar da obra'} aria-label={c.ativo === false ? 'Reativar' : 'Ocultar da obra'} style={{
          width: 40, height: 40, border: 0, borderRadius: 6, cursor: 'pointer',
          background: 'transparent',
          color: c.ativo === false ? 'var(--success)' : 'var(--text-3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ width: 16, height: 16 }}>
            {c.ativo === false ? Icon.check : Icon.eyeOff}
          </span>
        </button>
        </>)}
        {/* Excluir (só engenharia) */}
        {!isMestre && !somenteLeitura && (
        <button onClick={() => askDelColab(c)} title="Remover" aria-label="Remover" style={{
          width: 40, height: 40, border: 0, borderRadius: 6, cursor: 'pointer',
          background: 'transparent', color: 'var(--danger)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span style={{ width: 14, height: 14 }}>{Icon.x}</span>
        </button>
        )}
      </div>

      {/* Painel de edição inline */}
      {editingId === c.id && (
        <div style={{
          borderTop: '0.5px solid var(--divider)',
          padding: '14px 14px 16px',
          background: 'var(--surface-2)',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>NOME</div>
            <input className="ipt" value={editNome}
              onChange={ev => setEditNome(ev.target.value)} autoFocus />
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>EMPRESA</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {empresas.map(em => (
                <button key={em.id} onClick={() => setEditEmpId(em.id === 'adm' ? null : em.id)}
                  style={{
                    height: 32, padding: '0 12px', border: 0, cursor: 'pointer',
                    borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: (editEmpId === em.id || (em.id === 'adm' && !editEmpId))
                      ? 'var(--primary)' : 'var(--surface)',
                    color: (editEmpId === em.id || (em.id === 'adm' && !editEmpId))
                      ? '#fff' : 'var(--text-2)',
                    boxShadow: 'inset 0 0 0 0.5px var(--border)',
                  }}>
                  {em.nome}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>FUNÇÃO</div>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface)', borderRadius: 10 }}>
              {['Oficial', 'Ajudante', 'Outro'].map(f => (
                <button key={f} onClick={() => setEditFuncao(f)} style={{
                  flex: 1, height: 34, border: 0, cursor: 'pointer', borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  background: editFuncao === f ? 'var(--primary)' : 'transparent',
                  color: editFuncao === f ? '#fff' : 'var(--text-2)',
                }}>{f}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={cancelEdit}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={!editNome.trim() || saving} onClick={saveEdit}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel || 'OK'}
        variant={confirm?.variant || 'primary'}
        onCancel={closeConfirmColab}
        onConfirm={confirm?.onConfirm || (async () => {})}
      />
    <div className="page-pad stack stack-2">
      {ativos.length === 0 && !adding && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 12px' }}>
          <div className="t-strong">Nenhum colaborador ativo</div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            Adicione os colaboradores de cada empreiteiro.
          </div>
        </div>
      )}

      {/* Grupos de ativos — colapsáveis */}
      {Object.entries(grupos).map(([key, list]) => {
        const emp = empreiteiros.find(e => e.id === key) || { nome: 'ADM (própria)', cor: '#1F6B3A' };
        const isOpen = !!openGroups[key];
        return (
          <div key={key} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <button onClick={() => toggleGroup(key)} style={{
              width: '100%', border: 0, cursor: 'pointer', textAlign: 'left',
              padding: '10px 14px',
              background: emp.cor + '12',
              borderBottom: isOpen ? '0.5px solid var(--divider)' : 'none',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: emp.cor, flexShrink: 0 }} />
              <div className="t-strong" style={{ fontSize: 13, color: emp.cor, flex: 1 }}>{emp.nome}</div>
              <div className="t-caption">· {list.length} pessoa{list.length !== 1 ? 's' : ''}</div>
              <span style={{ width: 16, height: 16, color: emp.cor, transition: 'transform 0.2s',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{Icon.chevR}</span>
            </button>
            {isOpen && list.map(c => <ColabRow key={c.id} c={c} emp={emp} />)}
            {isOpen && (addingGroupKey === key ? (
              <div style={{ borderTop: '0.5px solid var(--divider)', padding: '14px', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div className="t-micro" style={{ marginBottom: 6 }}>NOME</div>
                  <input className="ipt" value={nome} onChange={ev => setNome(ev.target.value)} autoFocus placeholder="Nome do colaborador" />
                </div>
                <div>
                  <div className="t-micro" style={{ marginBottom: 6 }}>FUNÇÃO</div>
                  <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface)', borderRadius: 10 }}>
                    {['Oficial', 'Ajudante', 'Outro'].map(f => (
                      <button key={f} onClick={() => setFuncao(f)} style={{
                        flex: 1, height: 34, border: 0, cursor: 'pointer', borderRadius: 8, fontSize: 12, fontWeight: 700,
                        background: funcao === f ? 'var(--primary)' : 'transparent', color: funcao === f ? '#fff' : 'var(--text-2)',
                      }}>{f}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => { setAddingGroupKey(null); setNome(''); }}>Cancelar</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} disabled={!nome.trim() || saving} onClick={() => saveNewForGroup(key)}>
                    {saving ? 'Salvando…' : 'Adicionar'}
                  </button>
                </div>
              </div>
            ) : !somenteLeitura && (
              <button onClick={() => { setAddingGroupKey(key); setNome(''); setFuncao('Oficial'); setAdding(false); setEditingId(null); }} style={{
                width: '100%', border: 0, borderTop: '0.5px solid var(--divider)', cursor: 'pointer',
                padding: '11px 14px', background: 'transparent', color: emp.cor, fontSize: 13, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <span style={{ width: 16, height: 16 }}>{Icon.plus}</span> Adicionar colaborador
              </button>
            ))}
          </div>
        );
      })}

      {/* Seção de ocultos */}
      {inativos.length > 0 && (
        <button
          onClick={() => setShowInativos(v => !v)}
          style={{
            width: '100%', padding: '10px 14px', border: 0, borderRadius: 12, cursor: 'pointer',
            background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10,
            color: 'var(--text-3)', fontSize: 13, fontWeight: 700,
          }}>
          <span style={{ width: 16, height: 16 }}>{showInativos ? Icon.partial : Icon.chevR}</span>
          {inativos.length} colaborador{inativos.length !== 1 ? 'es' : ''} oculto{inativos.length !== 1 ? 's' : ''}
        </button>
      )}

      {showInativos && inativos.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', opacity: 0.8 }}>
          <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--divider)' }}>
            <div className="t-micro">OCULTOS (fora da obra)</div>
          </div>
          {inativos.map(c => {
            const emp = empreiteiros.find(e => e.id === c.empreiteiro_id) || { nome: 'ADM', cor: '#888' };
            return <ColabRow key={c.id} c={c} emp={emp} />;
          })}
        </div>
      )}

      {/* Formulário de novo colaborador */}
      {adding ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <input className="ipt" placeholder="Nome completo" value={nome}
            onChange={e => setNome(e.target.value)} autoFocus />

          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>EMPRESA</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {empresas.map(e => (
                <button key={e.id} onClick={() => setEmpId(e.id === 'adm' ? null : e.id)}
                  style={{
                    height: 34, padding: '0 12px', border: 0, cursor: 'pointer',
                    borderRadius: 999, fontSize: 12, fontWeight: 700,
                    background: (empId === e.id || (e.id === 'adm' && empId === null))
                      ? 'var(--primary)' : 'var(--surface-2)',
                    color: (empId === e.id || (e.id === 'adm' && empId === null))
                      ? '#fff' : 'var(--text-2)',
                  }}>
                  {e.nome}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>FUNÇÃO</div>
            <div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--surface-2)', borderRadius: 10 }}>
              {['Oficial', 'Ajudante', 'Outro'].map(f => (
                <button key={f} onClick={() => setFuncao(f)} style={{
                  flex: 1, height: 36, border: 0, cursor: 'pointer', borderRadius: 8,
                  fontSize: 12, fontWeight: 700,
                  background: funcao === f ? 'var(--surface)' : 'transparent',
                  color: funcao === f ? 'var(--text-1)' : 'var(--text-2)',
                  boxShadow: funcao === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}>{f}</button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }}
              onClick={() => { setAdding(false); setNome(''); }}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={!nome.trim() || saving} onClick={saveNew}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : !somenteLeitura && (
        <button className="btn btn-secondary btn-block"
          onClick={() => { setAdding(true); setEditingId(null); }}>
          <span style={{ width: 16, height: 16 }}>{Icon.plus}</span>Novo colaborador
        </button>
      )}
      </div>
    </>
  );
}

// ── Ambientes ───────────────────────────────────────────────────────────────
const PAVIMENTOS = ['Térreo', '1º Pavimento', 'Subsolo', 'Obra'];

const PAV_COLORS = {
  'Térreo':        { bg: '#0EA5E922', text: '#0EA5E9' },
  '1º Pavimento':  { bg: '#7C5CFF22', text: '#7C5CFF' },
  'Subsolo':       { bg: '#64748B22', text: '#64748B' },
  'Obra':          { bg: '#F59E0B22', text: '#F59E0B' },
};

function PavSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {PAVIMENTOS.map(p => {
        const active = value === p;
        const col = PAV_COLORS[p] || { bg: 'var(--surface-2)', text: 'var(--text-2)' };
        return (
          <button key={p} onClick={() => onChange(p)} style={{
            height: 32, padding: '0 14px', border: 0, cursor: 'pointer', borderRadius: 999,
            fontSize: 12, fontWeight: 700,
            background: active ? col.text : 'var(--surface)',
            color: active ? '#fff' : 'var(--text-2)',
            boxShadow: 'inset 0 0 0 0.5px var(--border)',
          }}>{p}</button>
        );
      })}
    </div>
  );
}

function AmbientesList() {
  const { ambientes, reload, profile, somenteLeitura } = useObra();
  const isMestre = profile?.role === 'mestre';
  const [confirm, setConfirm] = useState(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [nome, setNome] = useState('');
  const [pavimento, setPavimento] = useState('Térreo');
  const [editNome, setEditNome] = useState('');
  const [editPavimento, setEditPavimento] = useState('Térreo');
  const [saving, setSaving] = useState(false);
  const [openPavs, setOpenPavs] = useState({});
  const togglePav = (pav) => setOpenPavs(v => ({ ...v, [pav]: !v[pav] }));

  const saveNew = async () => {
    if (!nome.trim()) return;
    setSaving(true);
    const pavAmbs = ambientes.filter(a => a.pavimento === pavimento);
    try {
      const ok = await gravar(supabase.from('ambientes').insert({
        nome: nome.trim(),
        pavimento,
        ordem: pavAmbs.length,
      }), 'salvar o ambiente');
      if (!ok) return;
      await reload();
      setNome(''); setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!editNome.trim()) return;
    setSaving(true);
    try {
      const ok = await gravar(supabase.from('ambientes')
        .update({ nome: editNome.trim(), pavimento: editPavimento })
        .eq('id', editingId), 'salvar o ambiente');
      if (!ok) return;
      await reload();
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (a) => {
    setEditingId(a.id);
    setEditNome(a.nome);
    setEditPavimento(a.pavimento || 'Térreo');
    setAdding(false);
  };

  const askDelAmb = (id, nomeAmb) => {
    setConfirm({
      title: 'Remover ambiente',
      message: `Remover "${nomeAmb}"?`,
      confirmLabel: 'Remover',
      variant: 'danger',
      onConfirm: async () => {
        await apagarComAviso('ambientes', id, 'ambiente');
        await reload();
      },
    });
  };

  const closeConfirmAmb = () => setConfirm(null);

  // Agrupar por pavimento, mantendo ordem definida
  const grupos = PAVIMENTOS.map(pav => ({
    pav,
    items: ambientes.filter(a => (a.pavimento || '') === pav),
  })).filter(g => g.items.length > 0);

  // Ambientes sem pavimento definido
  const semPav = ambientes.filter(a => !a.pavimento || !PAVIMENTOS.includes(a.pavimento));

  return (
    <>
      <ConfirmDialog
        open={!!confirm}
        title={confirm?.title || ''}
        message={confirm?.message || ''}
        confirmLabel={confirm?.confirmLabel || 'OK'}
        variant={confirm?.variant || 'primary'}
        onCancel={closeConfirmAmb}
        onConfirm={confirm?.onConfirm || (async () => {})}
      />
    <div className="page-pad stack stack-2">
      {ambientes.length === 0 && !adding && (
        <div className="card" style={{ textAlign: 'center', padding: '28px 12px' }}>
          <div className="t-strong">Nenhum ambiente cadastrado</div>
          <div className="t-caption" style={{ marginTop: 4 }}>
            Ex.: Suíte Master, Área Gourmet, Garagem.
          </div>
        </div>
      )}

      {/* Grupos por pavimento — colapsáveis */}
      {grupos.map(({ pav, items }) => {
        const col = PAV_COLORS[pav] || { bg: 'var(--surface-2)', text: 'var(--text-3)' };
        const isOpen = !!openPavs[pav];
        return (
          <div key={pav} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Cabeçalho do pavimento */}
            <button onClick={() => togglePav(pav)} style={{
              width: '100%', border: 0, cursor: 'pointer', textAlign: 'left',
              padding: '9px 14px',
              background: col.bg,
              borderBottom: isOpen ? '0.5px solid var(--divider)' : 'none',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: 999, background: col.text, flexShrink: 0 }} />
              <div className="t-strong" style={{ fontSize: 12, color: col.text, letterSpacing: '0.04em', flex: 1 }}>
                {pav.toUpperCase()}
              </div>
              <div className="t-caption">· {items.length} ambiente{items.length !== 1 ? 's' : ''}</div>
              <span style={{ width: 16, height: 16, color: col.text, transition: 'transform 0.2s',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>{Icon.chevR}</span>
            </button>

            {isOpen && items.map(a => (
              <div key={a.id} style={{ borderTop: '0.5px solid var(--divider)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
                  <div className="t-strong" style={{ flex: 1, fontSize: 14 }}>{a.nome}</div>
                  {/* Editar (o visitante só olha) */}
                  {!somenteLeitura && (
                  <button onClick={() => editingId === a.id ? setEditingId(null) : openEdit(a)} title="Editar" aria-label="Editar" style={{
                    width: 40, height: 40, border: 0, borderRadius: 8, cursor: 'pointer',
                    background: editingId === a.id ? 'var(--primary-tint)' : 'transparent',
                    color: editingId === a.id ? 'var(--primary)' : 'var(--text-3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ width: 15, height: 15 }}>{Icon.edit || Icon.more}</span>
                  </button>
                  )}
                  {/* Excluir (só engenharia) */}
                  {!isMestre && !somenteLeitura && (
                  <button onClick={() => askDelAmb(a.id, a.nome)} title="Remover" aria-label="Remover" style={{
                    width: 40, height: 40, border: 0, borderRadius: 8, cursor: 'pointer',
                    background: 'transparent', color: 'var(--danger)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ width: 15, height: 15 }}>{Icon.x}</span>
                  </button>
                  )}
                </div>

                {/* Painel de edição inline */}
                {editingId === a.id && (
                  <div style={{
                    borderTop: '0.5px solid var(--divider)',
                    padding: '12px 14px 14px',
                    background: 'var(--surface-2)',
                    display: 'flex', flexDirection: 'column', gap: 12,
                  }}>
                    <div>
                      <div className="t-micro" style={{ marginBottom: 6 }}>NOME</div>
                      <input className="ipt" value={editNome}
                        onChange={ev => setEditNome(ev.target.value)} autoFocus />
                    </div>
                    <div>
                      <div className="t-micro" style={{ marginBottom: 8 }}>PAVIMENTO</div>
                      <PavSelector value={editPavimento} onChange={setEditPavimento} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-secondary" style={{ flex: 1 }}
                        onClick={() => setEditingId(null)}>Cancelar</button>
                      <button className="btn btn-primary" style={{ flex: 1 }}
                        disabled={!editNome.trim() || saving} onClick={saveEdit}>
                        {saving ? 'Salvando…' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}

      {/* Ambientes sem pavimento (legado) */}
      {semPav.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '9px 14px', background: 'var(--surface-2)', borderBottom: '0.5px solid var(--divider)' }}>
            <div className="t-micro">SEM PAVIMENTO</div>
          </div>
          {semPav.map(a => (
            <div key={a.id} style={{ borderTop: '0.5px solid var(--divider)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
                <div className="t-strong" style={{ flex: 1, fontSize: 14 }}>{a.nome}</div>
                {!somenteLeitura && (
                <button onClick={() => editingId === a.id ? setEditingId(null) : openEdit(a)} title="Editar" aria-label="Editar" style={{
                  width: 40, height: 40, border: 0, borderRadius: 8, cursor: 'pointer',
                  background: editingId === a.id ? 'var(--primary-tint)' : 'transparent',
                  color: editingId === a.id ? 'var(--primary)' : 'var(--text-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ width: 15, height: 15 }}>{Icon.edit || Icon.more}</span>
                </button>
                )}
                {!isMestre && !somenteLeitura && (
                <button onClick={() => askDelAmb(a.id, a.nome)} title="Remover" aria-label="Remover" style={{
                  width: 40, height: 40, border: 0, borderRadius: 8, cursor: 'pointer',
                  background: 'transparent', color: 'var(--danger)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span style={{ width: 15, height: 15 }}>{Icon.x}</span>
                </button>
                )}
              </div>
              {editingId === a.id && (
                <div style={{
                  borderTop: '0.5px solid var(--divider)',
                  padding: '12px 14px 14px',
                  background: 'var(--surface-2)',
                  display: 'flex', flexDirection: 'column', gap: 12,
                }}>
                  <div>
                    <div className="t-micro" style={{ marginBottom: 6 }}>NOME</div>
                    <input className="ipt" value={editNome}
                      onChange={ev => setEditNome(ev.target.value)} autoFocus />
                  </div>
                  <div>
                    <div className="t-micro" style={{ marginBottom: 8 }}>PAVIMENTO</div>
                    <PavSelector value={editPavimento} onChange={setEditPavimento} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }}
                      onClick={() => setEditingId(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 1 }}
                      disabled={!editNome.trim() || saving} onClick={saveEdit}>
             {saving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="t-micro" style={{ marginBottom: 6 }}>NOME</div>
            <input className="ipt" placeholder="Ex.: Suíte 1, Área de lazer…" value={nome}
              onChange={e => setNome(e.target.value)} autoFocus />
          </div>
          <div>
            <div className="t-micro" style={{ marginBottom: 8 }}>PAVIMENTO</div>
            <PavSelector value={pavimento} onChange={setPavimento} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" style={{ flex: 1 }}
              onClick={() => { setAdding(false); setNome(''); }}>Cancelar</button>
            <button className="btn btn-primary" style={{ flex: 1 }}
              disabled={!nome.trim() || saving} onClick={saveNew}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      ) : !somenteLeitura && (
        <button className="btn btn-secondary btn-block"
          onClick={() => { setAdding(true); setEditingId(null); }}>
          <span style={{ width: 16, height: 16 }}>{Icon.plus}</span>Novo ambiente
        </button>
      )}
    </div>
    </>
  );
}
