// Tela de Configurações (fatia 2 do multi-obra).
//
// Por enquanto: dados da obra atual e o troca-obra. A logomarca do app entra
// na fatia 4 — o card abaixo já avisa isso, para não parecer esquecido.
import { Icon } from '../components/index';
import { useObraSelecionada } from '../lib/obra-selecionada';

const fmtData = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
};

export function ConfiguracoesScreen({ goto, profile, voltarPara = 'home' }) {
  const { obras, obraId, obraAtual, trocarObra } = useObraSelecionada();
  const temMaisDeUma = obras.length > 1;

  return (
    <div className="page">
      <div style={{ padding: '12px var(--pad-4) 0' }}>
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginBottom: 8 }} onClick={() => goto(voltarPara)}>
          <span style={{ width: 16, height: 16 }}>{Icon.back}</span> Voltar
        </button>
        <div className="t-micro">AJUSTES</div>
        <div className="t-h1">Configurações</div>
      </div>

      <div className="page-pad stack stack-3" style={{ marginTop: 16 }}>
        {/* Obra atual */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 10 }}>
            OBRA ATUAL
          </div>
          {obraAtual ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', marginBottom: 4 }}>{obraAtual.nome}</div>
              {(obraAtual.codigo || obraAtual.localizacao) && (
                <div className="t-caption" style={{ fontSize: 12.5, marginBottom: 2 }}>
                  {[obraAtual.codigo, obraAtual.localizacao].filter(Boolean).join(' · ')}
                </div>
              )}
              {obraAtual.cliente && <div className="t-caption" style={{ fontSize: 12.5 }}>Cliente: {obraAtual.cliente}</div>}
              {fmtData(obraAtual.data_inicio) && <div className="t-caption" style={{ fontSize: 12.5 }}>Início: {fmtData(obraAtual.data_inicio)}</div>}
            </>
          ) : (
            <div className="t-caption" style={{ fontSize: 12.5 }}>Nenhuma obra selecionada.</div>
          )}
        </div>

        {/* Trocar de obra */}
        {temMaisDeUma && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 10 }}>
              TROCAR DE OBRA
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {obras.map(o => {
                const ativa = o.id === obraId;
                return (
                  <button key={o.id} onClick={() => trocarObra(o.id)}
                    style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 10,
                      border: ativa ? '2px solid var(--primary)' : '1.5px solid var(--border)',
                      background: ativa ? 'var(--primary-tint)' : 'var(--surface-2)' }}>
                    <span style={{ fontSize: 16 }}>🏗️</span>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: ativa ? 'var(--primary)' : 'var(--text-1)' }}>{o.nome}</span>
                    {ativa && <span style={{ width: 16, height: 16, color: 'var(--primary)' }}>{Icon.check}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Administração */}
        {profile?.is_admin && (
          <div className="card tap" style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}
            onClick={() => goto('obras')}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--primary-tint)', color: 'var(--primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, flexShrink: 0 }}>🏗️</div>
            <div style={{ flex: 1 }}>
              <div className="t-strong" style={{ fontSize: 14 }}>Gerenciar obras</div>
              <div className="t-caption">Criar, editar e liberar acesso por obra</div>
            </div>
            <span style={{ width: 16, height: 16, color: 'var(--text-3)' }}>{Icon.chevR}</span>
          </div>
        )}

        {/* Logomarca — chega na fatia 4 */}
        <div className="card" style={{ padding: 16, opacity: 0.6 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 6 }}>
            LOGOMARCA DO APP
          </div>
          <div className="t-caption" style={{ fontSize: 12.5 }}>
            Em breve: enviar uma imagem aqui para trocar a logomarca padrão do app.
          </div>
        </div>
      </div>
    </div>
  );
}
