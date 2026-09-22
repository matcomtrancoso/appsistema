// Fatia 2 do multi-obra: quais obras a pessoa logada pode ver (via RLS de
// `obras`, que já resolve "todas, se for admin; senão, só as liberadas") e
// qual está escolhida agora.
//
// `definirObraId` (em supabase.js) é sempre chamado ANTES de trocar o estado
// do React, nunca dentro de um efeito: efeito de componente filho roda antes
// do efeito do pai, e se a troca dependesse de um efeito daqui, uma tela dois
// níveis abaixo podia montar e já consultar o banco com a obra antiga.
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase, definirObraId } from './supabase';

const Ctx = createContext(null);

// Por usuário: duas contas no mesmo navegador (comum em teste) não pisam na
// escolha uma da outra.
const chaveStorage = (userId) => `obra_atual_${userId}`;

// Mesmo prazo do "Carregando perfil…" em App.jsx: sem isso, uma consulta que
// nunca volta (não dá erro, só não responde) prende a pessoa num spinner para
// sempre, sem nenhum botão para sair.
const PRAZO_CARREGANDO_MS = 8000;

export function ObraSelecionadaProvider({ profile, children }) {
  const [obras, setObras] = useState(null); // null = ainda carregando
  const [obraId, setObraIdEstado] = useState(null);
  const [erro, setErro] = useState('');
  const [travou, setTravou] = useState(false);
  // Espelha `obraId` para o carregar() de baixo ler o valor de agora, sem
  // precisar recriar a função (e o efeito que a chama) a cada troca de obra.
  const obraIdRef = useRef(null);

  const carregar = useCallback(async () => {
    const primeiraVez = obraIdRef.current === null && obras === null;
    const { data, error } = await supabase.from('obras').select('*').order('nome');
    if (error) {
      console.error('Erro ao carregar obras:', error);
      // Só bloqueia o app inteiro na carga inicial. Um recarregamento em
      // segundo plano (ex.: depois de criar uma obra) que falhar por uma
      // instabilidade passageira não pode derrubar quem já estava usando o
      // app — fica como estava, e o erro vai só para o console.
      if (primeiraVez) { setErro('Não foi possível carregar as obras. Verifique a conexão e recarregue a página.'); setObras([]); }
      return;
    }
    const lista = data || [];
    setObras(lista);

    // Se a obra atual (escolhida nesta sessão) continua na lista, mantém —
    // um recarregamento em segundo plano não pode reverter a troca que a
    // pessoa acabou de fazer. Só cai para o storage/primeira obra na carga
    // inicial ou quando a obra atual sumiu da lista (perdeu acesso, por exemplo).
    if (obraIdRef.current && lista.some(o => o.id === obraIdRef.current)) return;

    const salva = (() => {
      try { return localStorage.getItem(chaveStorage(profile.id)); } catch { return null; }
    })();
    // A obra salva pode ter sido desativada ou a pessoa pode ter perdido
    // acesso a ela desde a última visita — cai para a primeira disponível.
    const escolhida = lista.find(o => o.id === salva) || lista[0] || null;
    definirObraId(escolhida?.id || null);
    obraIdRef.current = escolhida?.id || null;
    setObraIdEstado(escolhida?.id || null);
  }, [profile.id, obras]);

  // Só na carga inicial (por isso `[]`, não `[carregar]`): recargas seguintes
  // vêm de `recarregarObras()`, chamado pela tela que mudou algo.
  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    if (obras !== null) return;
    const t = setTimeout(() => setTravou(true), PRAZO_CARREGANDO_MS);
    return () => clearTimeout(t);
  }, [obras]);

  function trocarObra(id) {
    if (!id || id === obraId) return;
    definirObraId(id);
    obraIdRef.current = id;
    try { localStorage.setItem(chaveStorage(profile.id), id); } catch { /* localStorage bloqueado: troca vale só nesta sessão */ }
    setObraIdEstado(id);
  }

  const obraAtual = (obras || []).find(o => o.id === obraId) || null;

  return (
    <Ctx.Provider value={{
      obras: obras || [],
      obraId,
      obraAtual,
      carregando: obras === null,
      travou,
      erro,
      trocarObra,
      recarregarObras: carregar,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useObraSelecionada = () => useContext(Ctx);
