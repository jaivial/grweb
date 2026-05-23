import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowRight, Boxes, Cpu, Search, ToggleLeft, Users } from 'lucide-react';
import api from '../../../api/client';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { usePermissions } from '../../../hooks/usePermissions';
import type { WorkspaceSummary } from '../../../types/api';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function WorkspaceCard({ workspace, onOpen }: { workspace: WorkspaceSummary; onOpen: (id: number) => void }) {
  const enabledLabel = `${workspace.modulesEnabled}/${workspace.modulesTotal}`;

  return (
    <button
      type="button"
      onClick={() => onOpen(workspace.id)}
      className="group flex min-h-[260px] flex-[1_1_280px] flex-col rounded-2xl border border-white/10 bg-[#111318]/90 p-5 text-left shadow-[0_18px_60px_rgba(0,0,0,0.28)] transition-all duration-200 hover:-translate-y-1 hover:border-white/20 hover:bg-[#151820] focus:outline-none focus:ring-2 focus:ring-white/20"
      data-ui={`workspace-card-${workspace.id}`}
      data-testid={`workspace-card-${workspace.id}`}
    >
      <span className="flex items-center justify-between" data-ui={`workspace-card-top-${workspace.id}`}>
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-400" data-ui={`workspace-type-${workspace.id}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${workspace.activo ? 'bg-emerald-400' : 'bg-zinc-500'}`} data-ui={`workspace-status-dot-${workspace.id}`} />
          {workspace.tipo}
        </span>
        <ArrowRight className="h-4 w-4 text-gray-500 transition-transform group-hover:translate-x-1 group-hover:text-white" data-ui={`workspace-arrow-${workspace.id}`} />
      </span>

      <span className="mt-5 flex items-start gap-3" data-ui={`workspace-heading-${workspace.id}`}>
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-white" data-ui={`workspace-icon-${workspace.id}`}>
          <Boxes className="h-5 w-5" data-ui={`workspace-icon-svg-${workspace.id}`} />
        </span>
        <span className="min-w-0 flex-1" data-ui={`workspace-title-block-${workspace.id}`}>
          <span className="block truncate text-xl font-semibold tracking-tight text-white" data-ui={`workspace-title-${workspace.id}`}>{workspace.nombre}</span>
          <span className="mt-1 block truncate font-mono text-xs text-gray-500" data-ui={`workspace-slug-${workspace.id}`}>/{workspace.slug}</span>
        </span>
      </span>

      <span className="mt-5 grid grid-cols-3 gap-2" data-ui={`workspace-metrics-${workspace.id}`}>
        <span className="rounded-xl border border-white/10 bg-black/20 p-3" data-ui={`workspace-members-${workspace.id}`}>
          <Users className="mb-2 h-4 w-4 text-gray-500" data-ui={`workspace-members-icon-${workspace.id}`} />
          <span className="block text-lg font-semibold text-white" data-ui={`workspace-members-value-${workspace.id}`}>{workspace.memberCount}</span>
          <span className="block text-[11px] text-gray-500" data-ui={`workspace-members-label-${workspace.id}`}>miembros</span>
        </span>
        <span className="rounded-xl border border-white/10 bg-black/20 p-3" data-ui={`workspace-modules-${workspace.id}`}>
          <ToggleLeft className="mb-2 h-4 w-4 text-gray-500" data-ui={`workspace-modules-icon-${workspace.id}`} />
          <span className="block text-lg font-semibold text-white" data-ui={`workspace-modules-value-${workspace.id}`}>{enabledLabel}</span>
          <span className="block text-[11px] text-gray-500" data-ui={`workspace-modules-label-${workspace.id}`}>modulos</span>
        </span>
        <span className="rounded-xl border border-white/10 bg-black/20 p-3" data-ui={`workspace-spots-${workspace.id}`}>
          <Cpu className="mb-2 h-4 w-4 text-gray-500" data-ui={`workspace-spots-icon-${workspace.id}`} />
          <span className="block text-lg font-semibold text-white" data-ui={`workspace-spots-value-${workspace.id}`}>{workspace.plazasDisponibles}</span>
          <span className="block text-[11px] text-gray-500" data-ui={`workspace-spots-label-${workspace.id}`}>plazas</span>
        </span>
      </span>

      <span className="mt-auto pt-5 text-sm text-gray-500" data-ui={`workspace-meta-${workspace.id}`}>
        {formatDate(workspace.fecha)} · {workspace.lugar}
      </span>
    </button>
  );
}

export function WorkspacesPage() {
  const { isRoot } = usePermissions();
  const [, setLocation] = useLocation();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadWorkspaces = useCallback(async () => {
    if (!isRoot) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const response = await api.getAdminWorkspaces();
    if (response.success && response.data) {
      setWorkspaces(response.data);
    } else {
      setError(response.message ?? 'No se pudieron cargar los workspaces');
    }
    setLoading(false);
  }, [isRoot]);

  useEffect(() => {
    void loadWorkspaces();
  }, [loadWorkspaces]);

  const filteredWorkspaces = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return workspaces;
    return workspaces.filter((workspace) =>
      workspace.nombre.toLowerCase().includes(term) ||
      workspace.slug.toLowerCase().includes(term) ||
      workspace.tipo.toLowerCase().includes(term)
    );
  }, [search, workspaces]);

  const handleOpen = useCallback((id: number) => {
    setLocation(`/backoffice/workspaces/${id}`);
  }, [setLocation]);

  return (
    <BackofficeLayout>
      <main className="min-h-screen bg-[#0b0d12] px-4 py-6 text-white sm:px-6 xl:px-8" data-ui="workspaces-page">
        {!isRoot ? (
          <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#111318] p-8 text-center" data-ui="workspaces-denied">
            <h1 className="text-2xl font-semibold tracking-tight text-white" data-ui="workspaces-denied-title">Acceso root requerido</h1>
            <p className="mt-3 text-sm text-gray-400" data-ui="workspaces-denied-text">Solo usuarios root pueden administrar todos los workspaces.</p>
          </section>
        ) : (
          <section className="mx-auto max-w-7xl" data-ui="workspaces-shell">
            <header className="mb-7 rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),#111318] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-6" data-ui="workspaces-header">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between" data-ui="workspaces-header-inner">
                <div data-ui="workspaces-heading-block">
                  <p className="font-mono text-xs uppercase tracking-[0.28em] text-gray-500" data-ui="workspaces-kicker">root / workspaces</p>
                  <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl" data-ui="workspaces-title">Administrar competiciones</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400" data-ui="workspaces-description">Vista global tipo Cursor IDE para activar modulos, auditar miembros y entrar a cada competition ID.</p>
                </div>
                <label className="relative block w-full xl:max-w-sm" data-ui="workspaces-search-label">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" data-ui="workspaces-search-icon" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar workspace..."
                    className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/20 py-2.5 pl-10 pr-3 text-sm text-white outline-none transition-colors placeholder:text-gray-600 focus:border-white/25"
                    data-ui="workspaces-search-input"
                  />
                </label>
              </div>
            </header>

            {loading && <p className="rounded-2xl border border-white/10 bg-[#111318] p-6 text-sm text-gray-400" data-ui="workspaces-loading">Cargando workspaces...</p>}
            {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200" data-ui="workspaces-error">{error}</p>}
            {!loading && !error && filteredWorkspaces.length === 0 && (
              <p className="rounded-2xl border border-white/10 bg-[#111318] p-6 text-sm text-gray-400" data-ui="workspaces-empty">No hay workspaces que coincidan con la busqueda.</p>
            )}
            {!loading && !error && filteredWorkspaces.length > 0 && (
              <div className="flex flex-wrap gap-4" data-ui="workspaces-card-flex">
                {filteredWorkspaces.map((workspace) => (
                  <WorkspaceCard key={workspace.id} workspace={workspace} onOpen={handleOpen} />
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </BackofficeLayout>
  );
}

export default WorkspacesPage;
