import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';

const ObraContext = createContext(null);

export function ObraProvider({ children, profile }) {
  const [empreiteiros, setEmpreiteiros] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [ambientes, setAmbientes] = useState([]);
  const [loading, setLoading] = useState(true);

  // Inclui ADM própria como empresa extra
  const empresas = [
    ...empreiteiros.map(e => ({ ...e, tipo: 'empreiteiro' })),
    { id: 'adm', nome: 'ADM (própria)', cor: '#1F6B3A', tipo: 'adm' },
  ];

  async function reload() {
    const [{ data: e }, { data: c }, { data: a }] = await Promise.all([
      supabase.from('empreiteiros').select('*').order('nome'),
      supabase.from('colaboradores')
        .select('*, empreiteiro:empreiteiro_id(id, nome, cor)')
        .order('nome'),
      supabase.from('ambientes').select('*').order('ordem'),
    ]);
    setEmpreiteiros(e || []);
    setColaboradores(c || []);
    setAmbientes(a || []);
    setLoading(false);
  }

  useEffect(() => { reload(); }, []);

  // Visitante só olha. A trava de verdade é no banco e em src/lib/visitante.js;
  // isto aqui serve para as telas esconderem os botões de criar, editar e
  // excluir, em vez de deixar a pessoa preencher tudo e só avisar no fim.
  const somenteLeitura = profile?.role === 'visitante';

  return (
    <ObraContext.Provider value={{
      empreiteiros, colaboradores, ambientes, empresas,
      loading, reload, profile, somenteLeitura,
    }}>
      {children}
    </ObraContext.Provider>
  );
}

export const useObra = () => useContext(ObraContext);
