// Peças de formulário em popup compartilhadas pelas telas financeiras
// (Contas a pagar / Contas a receber). Mesmo visual dos popups de admin.
export const campo = { width: '100%', boxSizing: 'border-box', height: 46, borderRadius: 12, border: '1.5px solid var(--border)',
  background: 'var(--surface-2)', padding: '0 14px', fontSize: 15, color: 'var(--text-1)', outline: 'none', fontFamily: 'inherit' };
export const rotulo = { fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 };

export function Popup({ titulo, onFechar, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', background: 'var(--surface)', borderRadius: 20,
        padding: '22px 20px 18px', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ fontSize: 17, fontWeight: 900, flex: 1 }}>{titulo}</div>
          <button onClick={onFechar} aria-label="Fechar" style={{ width: 40, height: 40, border: 0, borderRadius: 10,
            background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Rodape({ onFechar, onConfirmar, pronto, salvando, texto }) {
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <button onClick={onFechar} style={{ flex: 1, height: 46, borderRadius: 12, border: '0.5px solid var(--border)',
        background: 'var(--surface)', fontSize: 14, fontWeight: 700, color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
      <button onClick={onConfirmar} disabled={!pronto || salvando}
        style={{ flex: 2, height: 46, borderRadius: 12, border: 'none', fontFamily: 'inherit',
          background: pronto && !salvando ? 'var(--primary)' : 'var(--border)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
        {salvando ? 'Salvando…' : texto}
      </button>
    </div>
  );
}
