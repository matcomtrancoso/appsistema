// Componentes base, conjunto de icones e navegacao do app.

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { salvarStatusAtividade } from '../lib/atividades';
import { useVoz } from './useVoz';
import { DIA_ORDEM, DIA_CURTO } from '../lib/atividades-do-dia';

// ── Icons (Lucide-style: fill=none, stroke=currentColor, 2px, round caps) ──
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' };

export const Icon = {
  // ── Navegação ──
  home: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
      <polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  calendar: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M3 10h18M8 2v4M16 2v4"/>
    </svg>
  ),
  calendarWeek: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <path d="M3 10h18M8 2v4M16 2v4"/>
      <circle cx="8"  cy="15" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="15" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="16" cy="15" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="8"  cy="19" r="1.2" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  ),
  kanban: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3"  y="3" width="5" height="18" rx="1.5"/>
      <rect x="10" y="3" width="5" height="11" rx="1.5"/>
      <rect x="17" y="3" width="4" height="14" rx="1.5"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="5"  cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>
    </svg>
  ),

  // ── Documentos / listas ──
  clipboard: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1"/>
      <path d="M9 12h6M9 16h6"/>
    </svg>
  ),
  clipboardList: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
      <rect x="8" y="2" width="8" height="4" rx="1"/>
      <path d="M9 12h6M9 16h6M9 8h2"/>
    </svg>
  ),
  reportExport: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M8 18v-4M12 18V9M16 18v-7"/>
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M9 15h2a1.5 1.5 0 0 0 0-3H9v5m5-5v5h2a2.5 2.5 0 0 0 0-5h-2"/>
    </svg>
  ),
  excel: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <path d="M10 12l4 6m0-6l-4 6"/>
    </svg>
  ),

  // ── Ações / UI ──
  check: (
    <svg viewBox="0 0 24 24" {...S} strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  x: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  back: (
    <svg viewBox="0 0 24 24" {...S}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  ),
  chevR: (
    <svg viewBox="0 0 24 24" {...S}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  ),
  chevD: (
    <svg viewBox="0 0 24 24" {...S}>
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  ),
  arrowR: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="11" cy="11" r="7"/>
      <path d="M21 21l-4.35-4.35"/>
    </svg>
  ),
  filter: (
    <svg viewBox="0 0 24 24" {...S}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  ),
  refresh: (
    <svg viewBox="0 0 24 24" {...S}>
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  trash: (
    <svg viewBox="0 0 24 24" {...S}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  ),
  partial: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3v9h9" fill="currentColor" stroke="none" opacity="0.5"/>
    </svg>
  ),
  download: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  share: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
      <polyline points="16 6 12 2 8 6"/>
      <line x1="12" y1="2" x2="12" y2="15"/>
    </svg>
  ),

  // ── Ferramentas / objetos ──
  wrench: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
  truck: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="1" y="3" width="15" height="13" rx="1"/>
      <path d="M16 8h4l3 3v5h-7V8z"/>
      <circle cx="5.5"  cy="18.5" r="2.5"/>
      <circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  ),
  package: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
      <line x1="7.5" y1="4.21" x2="16.5" y2="9.4"/>
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  ),

  // ── Alertas / info ──
  alert: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9"  x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),

  // ── Localização / etiquetas ──
  pin: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
      <circle cx="12" cy="10" r="3"/>
    </svg>
  ),
  tag: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
      <line x1="7" y1="7" x2="7.01" y2="7"/>
    </svg>
  ),

  // ── Configurações / misc ──
  cog: (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>
    </svg>
  ),
  eye: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M1 12s4.5-8 11-8 11 8 11 8-4.5 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
    </svg>
  ),
  eyeOff: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="2" y1="2" x2="22" y2="22"/>
    </svg>
  ),
  barChart: (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="18" y="3" width="4" height="18" rx="1"/>
      <rect x="10" y="8" width="4" height="13" rx="1"/>
      <rect x="2" y="13" width="4" height="8" rx="1"/>
    </svg>
  ),
  ruler: (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M21.3 8.7l-6-6a1 1 0 0 0-1.4 0L2.7 13.9a1 1 0 0 0 0 1.4l6 6a1 1 0 0 0 1.4 0L21.3 10.1a1 1 0 0 0 0-1.4z"/>
      <path d="M7.5 10.5l1.5 1.5"/>
      <path d="M10.5 7.5l1.5 1.5"/>
      <path d="M13.5 4.5l1.5 1.5"/>
    </svg>
  ),
};

// ── BottomNav ────────────────────────────────────────────────────────────
export function BottomNav({ items, active, onChange, goto }) {
  const navigate = onChange || goto;
  return (
    <div className="botnav">
      {items.map((it) => (
        <button
          key={it.key}
          className={'botnav-item' + (active === it.key ? ' active' : '')}
          onClick={() => navigate(it.key)}
        >
          <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {it.icon}
            {it.badge > 0 && (
              <div style={{
                position: 'absolute', top: -5, right: -7,
                minWidth: 16, height: 16, borderRadius: 999,
                background: '#EF4444', color: '#fff',
                fontSize: 9, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1,
                border: '1.5px solid var(--bg, #fff)',
                pointerEvents: 'none',
              }}>
                {it.badge > 99 ? '99+' : it.badge}
              </div>
            )}
          </div>
          <span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Page header (large title with subtitle) ──────────────────────────────
// Cabeçalho de módulo, no padrão de Visitas e Reuniões: rótulo pequeno, título
// discreto e as ações na mesma linha. O anterior empilhava pílula, título de
// 28px e subtítulo — no celular isso empurrava o conteúdo para fora da tela.
export function PageHeader({ eyebrow, title, sub, right }) {
  return (
    // As ações não encolhem (viram botões ilegíveis) e o título não pode ser
    // espremido até virar uma coluna de uma palavra por linha — foi o que
    // acontecia no Cronograma e no Planejar, onde as ações são largas. Com o
    // wrap e o piso de 190px no título, quem não cabe desce para a linha de
    // baixo em vez de espremer o vizinho.
    <div style={{ padding: '8px var(--pad-4) 10px', display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 190px', minWidth: 0 }}>
        {eyebrow && <div className="t-micro">{eyebrow}</div>}
        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25, color: 'var(--text)' }}>
          {title}
        </div>
        {sub && <div className="t-caption" style={{ marginTop: 2 }}>{sub}</div>}
      </div>
      {right && <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>{right}</div>}
    </div>
  );
}

// Indicadores compactos e clicáveis — no celular os quadrados grandes de
// número empurravam a lista para baixo da dobra. Aqui eles viram filtro:
// mostram a contagem e selecionam ao toque.
export function StatChips({ itens, valor, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 var(--pad-4) 10px' }}>
      {itens.map(it => {
        const on = valor === it.chave;
        const cor = it.cor || 'var(--primary)';
        return (
          <button key={it.chave} onClick={() => onChange?.(on && it.limpavel ? null : it.chave)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 11px',
              borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 700,
              border: on ? 'none' : '1px solid var(--border)',
              background: on ? cor : 'var(--surface)',
              color: on ? '#fff' : 'var(--text-2)',
            }}>
            <span style={{ fontWeight: 900, color: on ? '#fff' : cor }}>{it.n}</span>
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

// ── Avatar (initials) ────────────────────────────────────────────────────
export function Avatar({ ini, color, size = 36, onClick }) {
  const style = { width: size, height: size, fontSize: size * 0.34 };
  if (color) {
    style.background = color + '22';
    style.color = color;
  }
  if (onClick) {
    return (
      <button className="av" onClick={onClick} aria-label="Menu do usuário"
        style={{ ...style, border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
        {ini}
      </button>
    );
  }
  return <div className="av" style={style}>{ini}</div>;
}

// ── Search bar ───────────────────────────────────────────────────────────
export function Search({ placeholder, value, onChange }) {
  return (
    <div className="search" style={{ margin: '0 var(--pad-4)' }}>
      <span style={{ width: 18, height: 18, color: 'var(--text-3)' }}>{Icon.search}</span>
      <input
        placeholder={placeholder}
        value={value || ''}
        onChange={(e) => onChange && onChange(e.target.value)}
      />
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────
export function Empty({ title, sub }) {
  return (
    <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--text-3)' }}>
      <div className="t-title" style={{ color: 'var(--text-2)', marginBottom: 4 }}>{title}</div>
      {sub && <div className="t-caption">{sub}</div>}
    </div>
  );
}

// ── Sheet (slide-up modal) ───────────────────────────────────────────────
// Clique no fundo NÃO fecha (perde-se o que foi digitado) — só o ✕ ou os
// botões do próprio conteúdo (Cancelar/Salvar).
export function Sheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="sheet-backdrop">
      <div className="sheet" style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <button onClick={onClose} aria-label="Fechar" style={{
          position: 'absolute', top: 10, right: 12, width: 32, height: 32,
          borderRadius: 999, border: '0.5px solid var(--border)',
          background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, zIndex: 2,
        }}>✕</button>
        {children}
      </div>
    </div>
  );
}

// ── ConfirmDialog ────────────────────────────────────────────────────────
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancelar',
  variant = 'primary',
  onConfirm,
  onCancel,
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setBusy(false);
  }, [open]);

  if (!open) return null;

  // Depois de confirmar, o diálogo fecha sozinho (chama onCancel, que é quem
  // fecha). Antes quem usava tinha de lembrar de fechar; em Cadastros ninguém
  // lembrou: o item saía no 1º clique, o diálogo ficava aberto, e o 2º clique
  // dizia ao admin que ele não tinha permissão. Se o onConfirm lançar erro, o
  // diálogo fica aberto para tentar de novo.
  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
      onCancel?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)', padding: 24 }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
        {title && <div className="t-strong" style={{ fontSize: 17, marginBottom: 8 }}>{title}</div>}
        {message && <div className="t-2" style={{ fontSize: 14, lineHeight: 1.5 }}>{message}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={onCancel}>{cancelLabel}</button>
          <button className={"btn btn-" + variant} style={{ flex: 1 }} disabled={busy} onClick={handleConfirm}>
            {busy ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const STATUS_CONFIG = {
  feita:       { label: 'Feita',        bg: 'var(--success)', color: '#fff' },
  em_andamento:{ label: 'Em andamento', bg: 'var(--warn)',    color: '#fff' },
  parcial:     { label: 'Em andamento', bg: 'var(--warn)',    color: '#fff' },
  naofeita:    { label: 'Não feita',    bg: 'var(--danger)',  color: '#fff' },
  nao_feita:   { label: 'Não feita',    bg: 'var(--danger)',  color: '#fff' },
  pendente:    { label: 'Pendente',     bg: 'var(--surface-2)', color: 'var(--text-2)' },
  aguardando:    { label: 'Aguardando entrega', bg: 'var(--info)',    color: '#fff' },
  conferido_ok:  { label: 'Conferido OK',       bg: 'var(--success)', color: '#fff' },
  pendencia:     { label: 'Pendência',          bg: 'var(--danger)',  color: '#fff' },
  a_contratar:   { label: 'A contratar',        bg: 'var(--surface-2)', color: 'var(--text-2)' },
  cotando:       { label: 'Cotando',            bg: 'var(--info)',    color: '#fff' },
  enviado:       { label: 'Aprovação',          bg: 'var(--warn)',    color: '#fff' },
  aprovado:      { label: 'Aprovado',           bg: 'var(--primary)', color: '#fff' },
  contratado:    { label: 'Contratado',         bg: 'var(--success)', color: '#fff' },
};

// Foto em tela cheia. Existe porque abrir a imagem numa aba nova NÃO funciona
// quando ela é um data: URL — o Chrome bloqueia navegação para data: no nível
// da aba, então o clique simplesmente não fazia nada.
export function VisualizadorFoto({ url, titulo, onFechar }) {
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onFechar]);
  if (!url) return null;
  return (
    <div onClick={onFechar}
      style={{ position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(0,0,0,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch', marginBottom: 10 }}>
        <span style={{ flex: 1, color: '#fff', fontSize: 14, fontWeight: 800 }}>{titulo || 'Foto'}</span>
        <button onClick={onFechar} title="fechar (Esc)"
          style={{ width: 36, height: 36, borderRadius: 999, border: 0, cursor: 'pointer',
            background: 'rgba(255,255,255,0.16)', color: '#fff', fontSize: 17 }}>✕</button>
      </div>
      {/* contain, nunca cover: a foto da obra não pode ser cortada */}
      <img src={url} alt={titulo || ''} onClick={e => e.stopPropagation()}
        style={{ maxWidth: '100%', maxHeight: '82vh', objectFit: 'contain', borderRadius: 12 }} />
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11.5, marginTop: 10 }}>
        toque fora ou aperte Esc para fechar
      </div>
    </div>
  );
}

export function StatusPill({ status }) {
  const cfg = STATUS_CONFIG[status] || { label: status || 'Pendente', bg: 'var(--surface-2)', color: 'var(--text-3)' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
      padding: '3px 9px', borderRadius: 999, flexShrink: 0,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

// ── Status picker chip (inline bottom-sheet) ──────────────────────────────────
const ACTIVITY_STATUS_OPTIONS = [
  { key: 'feita',         label: 'Feita',          icon: '✅', color: 'var(--success,#16A34A)', bg: '#DCFCE7' },
  { key: 'em_andamento',  label: 'Em andamento',   icon: '🔵', color: 'var(--primary)',         bg: 'rgba(59,130,246,0.08)' },
  { key: 'nao_feita',     label: 'Não feita',      icon: '❌', color: 'var(--danger,#DC2626)',  bg: '#FEE2E2' },
  { key: 'pendente',      label: 'Pendente',       icon: '⏳', color: 'var(--text-3)',          bg: 'var(--surface-2)' },
];

// Avanço por toque: Pendente → Em andamento → Feita. Um toque em "Feita" abre
// a única pergunta que existe (reiniciar o serviço), porque zerar um serviço
// concluído sem querer é o erro caro aqui. "Não feita" não entra no ciclo:
// ela vem pelo ✕ do card, junto com o motivo.
const PROXIMO_STATUS = {
  pendente:     'em_andamento',
  em_andamento: 'feita',
  parcial:      'feita',
  nao_feita:    'pendente',
};

// O portal precisa cair DENTRO de .app: as variáveis de cor do tema são
// declaradas lá, não em :root — jogando no document.body o popup saía sem
// fundo. E precisa sair do card, cujo backdrop-filter faz o position:fixed
// se ancorar no cartão em vez da tela.
const alvoPortal = () => (typeof document === 'undefined' ? null : (document.querySelector('.app') || document.body));

export function StatusPickerChip({ status, activityId, onUpdated, dayKey, statusPorDia, diasSemana }) {
  const effStatus = () => (dayKey && statusPorDia && statusPorDia[dayKey]) || status || 'pendente';
  const [currentStatus, setCurrentStatus] = useState(effStatus);
  const [perguntar, setPerguntar] = useState(false);
  // Concluiu no meio da semana e ainda havia dias planejados pela frente?
  // Pergunta se limpa o resto do planejamento — guarda os dias e o mapa novo.
  const [sobraram, setSobraram] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setCurrentStatus((dayKey && statusPorDia && statusPorDia[dayKey]) || status || 'pendente'); }, [status, dayKey, statusPorDia]);

  const cfg = STATUS_CONFIG[currentStatus] || { label: currentStatus || 'Pendente', bg: 'var(--surface-2)', color: 'var(--text-3)' };
  const opt = ACTIVITY_STATUS_OPTIONS.find(o => o.key === currentStatus);

  async function aplicar(newStatus) {
    setPerguntar(false);
    setSaving(true);
    const anterior = currentStatus;
    setCurrentStatus(newStatus);
    if (!activityId) { setSaving(false); onUpdated?.(activityId, newStatus); return; }

    const { newMap, error } = await salvarStatusAtividade(activityId, newStatus, { dayKey, statusPorDia });
    setSaving(false);
    if (error) {
      setCurrentStatus(anterior);   // o chip não pode mostrar um status que não gravou
      window.alert('Não foi possível salvar o status. Tente novamente.');
      return;
    }
    onUpdated?.(activityId, newStatus, newMap);

    // Concluída antes da hora: se o planejamento ainda tem dias DEPOIS deste,
    // oferece limpar — senão a semana segue mostrando dias de um serviço pronto.
    if (newStatus === 'feita' && dayKey && Array.isArray(diasSemana)) {
      const depois = diasSemana.filter(d =>
        DIAS_ALL.indexOf(d) > DIAS_ALL.indexOf(dayKey));
      if (depois.length > 0) setSobraram({ depois, newMap });
    }
  }

  async function removerDiasRestantes() {
    const { depois, newMap } = sobraram;
    setSobraram(null);
    setSaving(true);
    const novosDias = diasSemana.filter(d => !depois.includes(d));
    // limpa também o status que porventura já existia nos dias removidos
    const mapa = { ...(newMap || statusPorDia || {}) };
    depois.forEach(d => delete mapa[d]);
    const { error } = await supabase.from('atividades_rdo')
      .update({ dias_semana: novosDias, status_por_dia: mapa }).eq('id', activityId);
    setSaving(false);
    if (error) { window.alert('Não consegui remover os dias. Tente novamente.'); return; }
    onUpdated?.(activityId, 'feita', mapa, novosDias);
  }

  function tocar(e) {
    e.stopPropagation();
    if (saving) return;
    if (currentStatus === 'feita') { setPerguntar(true); return; }
    aplicar(PROXIMO_STATUS[currentStatus] || 'em_andamento');
  }

  const botaoPopup = (texto, cor, fundo, onClick) => (
    <button onClick={onClick} style={{
      width: '100%', padding: '13px 14px', borderRadius: 12, border: 'none', cursor: 'pointer',
      background: fundo, color: cor, fontSize: 14.5, fontWeight: 800, fontFamily: 'inherit', textAlign: 'center',
    }}>{texto}</button>
  );

  return (
    <>
      <button
        onClick={tocar}
        title="Toque para avançar o status"
        style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
          padding: '4px 10px', borderRadius: 999, flexShrink: 0,
          background: cfg.bg, color: cfg.color,
          border: '1px solid transparent',
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
          opacity: saving ? 0.6 : 1,
        }}>
        {opt && <span style={{ fontSize: 11, lineHeight: 1 }}>{opt.icon}</span>}
        {saving ? '…' : cfg.label}
      </button>

      {perguntar && alvoPortal() && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(330px, calc(100vw - 48px))',
            background: 'var(--surface, #fff)', borderRadius: 20, padding: '22px 18px 18px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 16.5, fontWeight: 900, color: 'var(--text-1, #111)', marginBottom: 4, textAlign: 'center' }}>
              Reiniciar este serviço?
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3, #777)', marginBottom: 18, textAlign: 'center', lineHeight: 1.5 }}>
              Ele está marcado como concluído.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {botaoPopup('Voltar para não iniciado', '#fff', 'var(--primary, #087B8B)', () => aplicar('pendente'))}
              {botaoPopup('Marcar como em andamento', 'var(--primary, #087B8B)', 'var(--primary-tint, rgba(8,123,139,0.10))', () => aplicar('em_andamento'))}
              {botaoPopup('Continuar como feita', 'var(--text-2, #444)', 'var(--surface-2, #f2f2f2)', () => setPerguntar(false))}
            </div>
          </div>
        </div>,
        alvoPortal()
      )}

      {sobraram && alvoPortal() && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
          }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: 'min(330px, calc(100vw - 48px))',
            background: 'var(--surface, #fff)', borderRadius: 20, padding: '22px 18px 18px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ fontSize: 16.5, fontWeight: 900, color: 'var(--text-1, #111)', marginBottom: 4, textAlign: 'center' }}>
              Concluiu antes do previsto 🎉
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-3, #777)', marginBottom: 18, textAlign: 'center', lineHeight: 1.5 }}>
              O planejamento ainda tinha {sobraram.depois.map(d => DIAS_LABELS[d] || d).join(' e ')}.
              Remover {sobraram.depois.length === 1 ? 'esse dia' : 'esses dias'} da semana?
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {botaoPopup('Remover do planejamento', '#fff', 'var(--primary, #087B8B)', removerDiasRestantes)}
              {botaoPopup('Manter como está', 'var(--text-2, #444)', 'var(--surface-2, #f2f2f2)', () => setSobraram(null))}
            </div>
          </div>
        </div>,
        alvoPortal()
      )}
    </>
  );
}

const DIAS_ALL = DIA_ORDEM;
const DIAS_LABELS = DIA_CURTO;

export function ReplanejaDiasChip({ activityId, diasSemana = [], onUpdated }) {
  const [open, setOpen]     = useState(false);
  const [dias, setDias]     = useState(diasSemana);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDias(diasSemana); }, [JSON.stringify(diasSemana)]);

  const toggle = (d) => setDias(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const save = async () => {
    setSaving(true);
    if (activityId) {
      await supabase.from('atividades_rdo').update({ dias_semana: dias }).eq('id', activityId);
    }
    setSaving(false);
    setOpen(false);
    onUpdated?.(activityId, dias);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 999,
          border: '1px solid var(--border)',
          background: 'var(--surface-2)',
          color: 'var(--text-2)',
          fontSize: 11, fontWeight: 700, cursor: 'pointer',
          letterSpacing: 0.2,
        }}>
        📅 Replanejar dias
      </button>

      {/* Portal para dentro do `.app`, NÃO para o body. Dois motivos:
          1. `.card` tem backdrop-filter, e um ancestral com filter vira o bloco
             de contenção do `position: fixed` — sem portal o popup saía cortado;
          2. as variáveis de tema (--surface, --text-2, --primary) são declaradas
             em `.app`. Portalando para o body elas não existem, `var(--surface)`
             não resolve e o popup aparecia TRANSPARENTE, ilegível.
          As cores levam valor de reserva pelo mesmo motivo: se um dia isso cair
          fora do `.app`, ainda dá para ler. */}
      {open && createPortal(
        <>
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9998,
          }} />
          <div style={{
            position: 'fixed', left: '50%', top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(320px, calc(100vw - 48px))',
            background: 'var(--surface, #FFFFFF)', borderRadius: 20,
            border: '1px solid var(--border, #D9E2E3)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
            zIndex: 9999, padding: '22px 20px 20px',
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.05em', color: 'var(--text-3, #6B6055)', textAlign: 'center', marginBottom: 14 }}>
              REPLANEJAR DIAS
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 18 }}>
              {DIAS_ALL.map(d => {
                const active = dias.includes(d);
                return (
                  <button key={d} onClick={() => toggle(d)} style={{
                    width: 38, height: 38, borderRadius: 11, fontFamily: 'inherit',
                    border: active ? '2px solid var(--primary, #087B8B)' : '1.5px solid var(--border-strong, #BCCACC)',
                    background: active ? 'var(--primary, #087B8B)' : 'var(--surface-2, #F1F3F5)',
                    color: active ? '#fff' : 'var(--text, #12343B)',
                    fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}>
                    {DIAS_LABELS[d]}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setOpen(false)} style={{
                flex: 1, height: 44, borderRadius: 12, fontFamily: 'inherit',
                border: '1.5px solid var(--border-strong, #BCCACC)',
                background: 'var(--surface-2, #F1F3F5)',
                color: 'var(--text, #12343B)', fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                Cancelar
              </button>
              <button onClick={save} disabled={saving} style={{
                flex: 2, height: 44, borderRadius: 12, fontFamily: 'inherit',
                border: 0, background: 'var(--primary, #087B8B)',
                color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? 'Salvando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </>,
        alvoPortal() || document.body
      )}
    </>
  );
}


// ── Microfone de ditado ────────────────────────────────────────────────────
// Em obra a mão está suja e o texto sai falando. O ditado nasceu no andamento
// da ata e provou que vale em toda caixa de texto longa — descrição de
// pendência, assunto de visita, tópico de reunião —, então virou botão.
//
// Fora do Chrome (iPhone/Safari) a Web Speech API não existe: o botão some em
// vez de aparecer e não funcionar. `onTexto` recebe o texto inteiro quando a
// pessoa manda parar; quem chama decide se acrescenta ou substitui.
export function BotaoDitar({ onTexto, titulo = 'Ditar', style }) {
  const { ouvindo, suportado, alternar } = useVoz({ onTexto });
  if (!suportado) return null;
  return (
    // onMouseDown preventDefault: sem isso o clique tira o foco do campo e o
    // cursor volta para o começo do texto ao retomar a digitação.
    <button type="button" onMouseDown={e => e.preventDefault()} onClick={alternar}
      title={ouvindo ? 'Parar de ditar' : titulo}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
        fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '6px 11px',
        borderRadius: 999, whiteSpace: 'nowrap',
        border: ouvindo ? 0 : '1px solid var(--border)',
        background: ouvindo ? 'var(--danger)' : 'var(--surface)',
        color: ouvindo ? '#fff' : 'var(--text-2)',
        ...style,
      }}>
      {ouvindo ? '● gravando' : '🎤 ditar'}
    </button>
  );
}

