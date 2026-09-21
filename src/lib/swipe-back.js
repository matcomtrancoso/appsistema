import { useEffect, useRef } from 'react';

// Arrastar da borda esquerda para a direita volta a tela, como no celular.
// Só vale começando na borda: no meio da tela o gesto brigaria com as listas
// que rolam na horizontal (a fita de dias da semana, por exemplo).
export function useSwipeBack(aoVoltar, ativo = true) {
  const cb = useRef(aoVoltar);
  useEffect(() => { cb.current = aoVoltar; }, [aoVoltar]);

  useEffect(() => {
    if (!ativo || typeof window === 'undefined') return;
    let x0 = null, y0 = 0;
    const inicio = (e) => {
      const t = e.touches[0];
      x0 = t.clientX <= 32 ? t.clientX : null;
      y0 = t.clientY;
    };
    const fim = (e) => {
      if (x0 === null) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - x0;
      const dy = Math.abs(t.clientY - y0);
      x0 = null;
      if (dx > 70 && dy < 50) cb.current?.();
    };
    window.addEventListener('touchstart', inicio, { passive: true });
    window.addEventListener('touchend', fim, { passive: true });
    return () => {
      window.removeEventListener('touchstart', inicio);
      window.removeEventListener('touchend', fim);
    };
  }, [ativo]);
}
