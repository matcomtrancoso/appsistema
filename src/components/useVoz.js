// ============================================================================
// useVoz — reconhecimento de voz grátis do navegador (Web Speech API), pt-BR.
// Funciona bem no Chrome (Android/desktop). No iPhone/Safari o suporte é
// limitado; nesses casos `suportado` vem false e o app esconde o microfone.
//
// Comportamento: ouve de forma CONTÍNUA (até você tocar em parar) e expõe em
// `parcial` o texto ACUMULADO (o que já foi reconhecido + o trecho em andamento),
// para o campo mostrar tudo conforme você fala. Ao parar, entrega o texto
// completo via onTexto.
// ============================================================================
import { useEffect, useRef, useState } from "react";

// Erros que não adianta insistir: sem permissão ou sem microfone, religar o
// reconhecimento vira laço infinito. Os outros ('no-speech', 'network') são
// passageiros e o religamento resolve.
const ERROS_FATAIS = ["not-allowed", "service-not-allowed", "audio-capture"];

export function useVoz({ onTexto } = {}) {
  const [ouvindo, setOuvindo] = useState(false);
  const [parcial, setParcial] = useState("");
  const recRef = useRef(null);
  const finalRef = useRef("");      // texto já finalizado nesta sessão de fala
  const pararRef = useRef(false);   // true = foi o usuário que mandou parar
  const onTextoRef = useRef(onTexto);

  useEffect(() => { onTextoRef.current = onTexto; }, [onTexto]);

  const SR =
    typeof window !== "undefined" &&
    (window.SpeechRecognition || window.webkitSpeechRecognition);
  const suportado = Boolean(SR);

  useEffect(() => {
    if (!suportado) return;
    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = true;       // não para na primeira pausa
    rec.interimResults = true;   // mostra o texto enquanto fala

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        // O espaço importa: sem ele os trechos finalizados grudam uns nos
        // outros ("bomdiaprecisode…").
        if (r.isFinal) finalRef.current += r[0].transcript + " ";
        else interim += r[0].transcript;
      }
      setParcial((finalRef.current + interim).replace(/\s+/g, " ").trim());
    };

    rec.onend = () => {
      // O Chrome encerra o reconhecimento sozinho depois de alguns segundos de
      // silêncio, mesmo com continuous = true — no Android quase sempre. Antes
      // esse encerramento automático era tratado como "o usuário parou": o
      // texto era entregue e a tela limpava. Era por isso que só a primeira
      // frase aparecia e o resto sumia. Agora, se o usuário não pediu para
      // parar, religa e o texto acumulado continua de pé.
      if (!pararRef.current) {
        try { rec.start(); return; } catch { /* já estava rodando */ }
      }
      setOuvindo(false);
      const txt = finalRef.current.replace(/\s+/g, " ").trim();
      if (txt) onTextoRef.current?.(txt);
      finalRef.current = "";
      setParcial("");
    };

    rec.onerror = (e) => {
      if (ERROS_FATAIS.includes(e?.error)) {
        pararRef.current = true;   // impede o onend de religar em laço
        setOuvindo(false);
      }
      // Erro passageiro não mexe em nada: o onend religa em seguida.
    };

    recRef.current = rec;
    return () => { pararRef.current = true; try { rec.abort(); } catch { /* ignore */ } };
  }, [suportado]);

  function alternar() {
    const rec = recRef.current;
    if (!rec) return;
    if (ouvindo) {
      pararRef.current = true;
      try { rec.stop(); } catch { /* ignore */ } // dispara onend -> entrega o texto
    } else {
      pararRef.current = false;
      finalRef.current = "";
      setParcial("");
      try {
        rec.start();
        setOuvindo(true);
      } catch { /* já estava rodando */ }
    }
  }

  return { suportado, ouvindo, parcial, alternar };
}
