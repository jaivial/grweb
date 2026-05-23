import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSetAtom } from 'jotai';
import { useLocation, useParams } from 'wouter';
import { ArrowLeft, Check, ChevronRight, Mail, Plus, Save, Trash2, UserCog, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../api/client';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { usePermissions } from '../../../hooks/usePermissions';
import { userAtom } from '../../../stores/auth.atoms';
import type { CompetitionModule, MemberDetail, RoleSlug, UserRole, WorkspaceDetail } from '../../../types/api';

type TabKey = 'modules' | 'members';

const ROLE_OPTIONS: RoleSlug[] = ['root', 'admin', 'staff', 'registrador'];
const ROLE_LABELS: Record<RoleSlug, string> = {
  root: 'Root',
  admin: 'Admin',
  staff: 'Staff',
  registrador: 'Registrador',
};

interface MemberFormState {
  nombre: string;
  email: string;
  role: RoleSlug;
  isActive: boolean;
  password: string;
}

const EMPTY_MEMBER_FORM: MemberFormState = {
  nombre: '',
  email: '',
  role: 'staff',
  isActive: true,
  password: '',
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function Breadcrumbs({ workspace }: { workspace: WorkspaceDetail | null }) {
  const [, setLocation] = useLocation();

  return (
    <nav className="mb-5 flex flex-wrap items-center gap-2 text-sm text-gray-500" data-ui="workspace-breadcrumbs" aria-label="Breadcrumbs">
      <button
        type="button"
        onClick={() => setLocation('/backoffice/workspaces')}
        className="rounded-lg px-2 py-1 transition-colors hover:bg-white/5 hover:text-white"
        data-ui="breadcrumb-workspaces"
      >
        Workspaces
      </button>
      <ChevronRight className="h-4 w-4" data-ui="breadcrumb-chevron" />
      <span className="rounded-lg px-2 py-1 text-gray-300" data-ui="breadcrumb-current">{workspace?.nombre ?? 'Detalle'}</span>
    </nav>
  );
}

function ModuleToggle({ module, onToggle }: { module: CompetitionModule; onToggle: (key: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onToggle(module.key)}
      className="flex min-h-[112px] flex-col rounded-2xl border border-white/10 bg-black/20 p-4 text-left transition-colors hover:border-white/20 hover:bg-white/[0.04] focus:outline-none focus:ring-2 focus:ring-white/20"
      data-ui={`workspace-module-${module.key}`}
    >
      <span className="flex items-start justify-between gap-3" data-ui={`workspace-module-top-${module.key}`}>
        <span className="min-w-0" data-ui={`workspace-module-title-block-${module.key}`}>
          <span className="block text-sm font-semibold text-white" data-ui={`workspace-module-label-${module.key}`}>{module.label}</span>
          <span className="mt-1 block font-mono text-[11px] text-gray-500" data-ui={`workspace-module-key-${module.key}`}>{module.key}</span>
        </span>
        <span className={`relative h-6 w-11 rounded-full border transition-colors ${module.enabled ? 'border-emerald-400/40 bg-emerald-400/20' : 'border-white/10 bg-white/5'}`} data-ui={`workspace-module-switch-${module.key}`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full transition-transform ${module.enabled ? 'translate-x-5 bg-emerald-300' : 'translate-x-1 bg-gray-500'}`} data-ui={`workspace-module-switch-knob-${module.key}`} />
        </span>
      </span>
      <span className="mt-3 text-sm leading-5 text-gray-400" data-ui={`workspace-module-description-${module.key}`}>{module.description}</span>
    </button>
  );
}

function MemberEditorModal({
  member,
  form,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  member: MemberDetail;
  form: MemberFormState;
  saving: boolean;
  onClose: () => void;
  onChange: (field: keyof MemberFormState, value: string | boolean) => void;
  onSave: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" data-ui="member-editor-overlay" role="dialog" aria-modal="true">
      <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-[#111318] shadow-2xl" data-ui="member-editor-modal">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4" data-ui="member-editor-header">
          <div data-ui="member-editor-heading">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-gray-500" data-ui="member-editor-kicker">member/{member.id}</p>
            <h2 className="mt-1 text-lg font-semibold text-white" data-ui="member-editor-title">Editar miembro</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-white/5 hover:text-white" data-ui="member-editor-close" aria-label="Cerrar">
            <X className="h-4 w-4" data-ui="member-editor-close-icon" />
          </button>
        </header>
        <div className="space-y-4 px-5 py-5" data-ui="member-editor-body">
          <label className="block" data-ui="member-editor-name-label">
            <span className="mb-1.5 block text-sm font-medium text-gray-300" data-ui="member-editor-name-text">Nombre</span>
            <input value={form.nombre} onChange={(event) => onChange('nombre', event.target.value)} className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-white/25" data-ui="member-editor-name-input" />
          </label>
          <label className="block" data-ui="member-editor-email-label">
            <span className="mb-1.5 block text-sm font-medium text-gray-300" data-ui="member-editor-email-text">Email</span>
            <input type="email" value={form.email} onChange={(event) => onChange('email', event.target.value)} className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-white/25" data-ui="member-editor-email-input" />
          </label>
          <label className="block" data-ui="member-editor-role-label">
            <span className="mb-1.5 block text-sm font-medium text-gray-300" data-ui="member-editor-role-text">Rol</span>
            <select value={form.role} onChange={(event) => onChange('role', event.target.value as RoleSlug)} className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-white/25" data-ui="member-editor-role-select">
              {ROLE_OPTIONS.map((role) => <option key={role} value={role} data-ui={`member-editor-role-option-${role}`}>{ROLE_LABELS[role]}</option>)}
            </select>
          </label>
          <label className="block" data-ui="member-editor-password-label">
            <span className="mb-1.5 block text-sm font-medium text-gray-300" data-ui="member-editor-password-text">Nueva contrasena</span>
            <input type="password" value={form.password} onChange={(event) => onChange('password', event.target.value)} placeholder="Dejar vacio para no cambiar" className="min-h-[44px] w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-white/25" data-ui="member-editor-password-input" />
          </label>
          <label className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 px-3 py-3" data-ui="member-editor-active-label">
            <span className="text-sm font-medium text-gray-300" data-ui="member-editor-active-text">Usuario activo</span>
            <input type="checkbox" checked={form.isActive} onChange={(event) => onChange('isActive', event.target.checked)} className="h-5 w-5 rounded border-white/20 bg-black/30" data-ui="member-editor-active-input" />
          </label>
        </div>
        <footer className="flex flex-col gap-3 border-t border-white/10 px-5 py-4 sm:flex-row sm:justify-end" data-ui="member-editor-footer">
          <button type="button" onClick={onClose} className="min-h-[44px] rounded-xl border border-white/10 px-4 text-sm font-semibold text-gray-300 transition-colors hover:bg-white/5 hover:text-white" data-ui="member-editor-cancel">Cancelar</button>
          <button type="button" onClick={onSave} disabled={saving} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60" data-ui="member-editor-save">
            <Save className="h-4 w-4" data-ui="member-editor-save-icon" />
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </footer>
      </section>
    </div>
  );
}

export function WorkspaceDetailPage() {
  const { isRoot } = usePermissions();
  const params = useParams<{ competitionId: string }>();
  const setUser = useSetAtom(userAtom);
  const [, setLocation] = useLocation();
  const competitionId = useMemo(() => Number(params.competitionId), [params.competitionId]);
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [modulesDraft, setModulesDraft] = useState<CompetitionModule[]>([]);
  const [members, setMembers] = useState<MemberDetail[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>('modules');
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [savingModules, setSavingModules] = useState(false);
  const [submittingMember, setSubmittingMember] = useState(false);
  const [savingMember, setSavingMember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newMember, setNewMember] = useState<MemberFormState>(EMPTY_MEMBER_FORM);
  const [editingMember, setEditingMember] = useState<MemberDetail | null>(null);
  const [editForm, setEditForm] = useState<MemberFormState>(EMPTY_MEMBER_FORM);

  const loadWorkspace = useCallback(async () => {
    if (!isRoot || !Number.isFinite(competitionId)) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const response = await api.getAdminWorkspace(competitionId);
    if (response.success && response.data) {
      setWorkspace(response.data);
      setModulesDraft(response.data.modules);
    } else {
      setError(response.message ?? 'No se pudo cargar el workspace');
    }
    setLoading(false);
  }, [competitionId, isRoot]);

  const loadMembers = useCallback(async () => {
    if (!isRoot || !Number.isFinite(competitionId)) return;

    setMembersLoading(true);
    const response = await api.getCompetitionUsers(competitionId, { page: 1, pageSize: 100 });
    if (response.success && response.data) {
      setMembers(response.data.items);
    } else {
      toast.error(response.message ?? 'No se pudieron cargar los miembros');
    }
    setMembersLoading(false);
  }, [competitionId, isRoot]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const toggleModule = useCallback((key: string) => {
    setModulesDraft((current) => current.map((module) => module.key === key ? { ...module, enabled: !module.enabled } : module));
  }, []);

  const saveModules = useCallback(async () => {
    if (!workspace) return;
    setSavingModules(true);
    const response = await api.updateWorkspaceModules(workspace.id, {
      modules: modulesDraft.map((module) => ({ key: module.key, enabled: module.enabled })),
    });
    setSavingModules(false);

    if (response.success && response.data) {
      setModulesDraft(response.data);
      setWorkspace((current) => current ? { ...current, modules: response.data!, modulesEnabled: response.data!.filter((module) => module.enabled).length } : current);
      setUser((current) => current ? {
        ...current,
        competiciones: current.competiciones?.map((competition) => competition.id === workspace.id ? { ...competition, modules: response.data! } : competition),
      } : current);
      toast.success('Modulos actualizados');
    } else {
      toast.error(response.message ?? 'No se pudieron guardar los modulos');
    }
  }, [modulesDraft, setUser, workspace]);

  const handleNewMemberChange = useCallback((field: keyof MemberFormState, value: string | boolean) => {
    setNewMember((current) => ({ ...current, [field]: value }));
  }, []);

  const handleCreateMember = useCallback(async (event: FormEvent) => {
    event.preventDefault();
    if (!workspace) return;
    if (!newMember.nombre.trim() || !newMember.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }

    setSubmittingMember(true);
    const response = await api.createCompetitionUser(workspace.id, {
      nombre: newMember.nombre.trim(),
      email: newMember.email.trim(),
      role: newMember.role,
      password: newMember.password.trim() || undefined,
    });
    setSubmittingMember(false);

    if (response.success) {
      toast.success('Miembro anadido');
      setNewMember(EMPTY_MEMBER_FORM);
      await loadMembers();
      await loadWorkspace();
    } else {
      toast.error(response.message ?? 'No se pudo anadir el miembro');
    }
  }, [loadMembers, loadWorkspace, newMember, workspace]);

  const openEditMember = useCallback((member: MemberDetail) => {
    setEditingMember(member);
    setEditForm({
      nombre: member.nombre,
      email: member.email,
      role: member.role as RoleSlug,
      isActive: member.isActive,
      password: '',
    });
  }, []);

  const handleEditChange = useCallback((field: keyof MemberFormState, value: string | boolean) => {
    setEditForm((current) => ({ ...current, [field]: value }));
  }, []);

  const saveMember = useCallback(async () => {
    if (!workspace || !editingMember) return;
    if (!editForm.nombre.trim() || !editForm.email.trim()) {
      toast.error('Nombre y email son obligatorios');
      return;
    }

    setSavingMember(true);
    const response = await api.updateWorkspaceMember(workspace.id, editingMember.id, {
      nombre: editForm.nombre.trim(),
      email: editForm.email.trim(),
      role: editForm.role as UserRole,
      isActive: editForm.isActive,
      password: editForm.password.trim() || undefined,
    });
    setSavingMember(false);

    if (response.success && response.data) {
      setMembers((current) => current.map((member) => member.id === response.data!.id ? response.data! : member));
      setEditingMember(null);
      toast.success('Miembro actualizado');
    } else {
      toast.error(response.message ?? 'No se pudo actualizar el miembro');
    }
  }, [editForm, editingMember, workspace]);

  const deleteMember = useCallback(async (member: MemberDetail) => {
    if (!workspace) return;
    if (!window.confirm(`Eliminar a ${member.nombre} de ${workspace.nombre}?`)) return;

    const response = await api.deleteWorkspaceMember(workspace.id, member.id);
    if (response.success) {
      toast.success('Miembro eliminado. Email enviado si la configuracion SMTP esta activa.');
      await loadMembers();
      await loadWorkspace();
    } else {
      toast.error(response.message ?? 'No se pudo eliminar el miembro');
    }
  }, [loadMembers, loadWorkspace, workspace]);

  const enabledModulesCount = useMemo(() => modulesDraft.filter((module) => module.enabled).length, [modulesDraft]);

  return (
    <BackofficeLayout>
      <main className="min-h-screen bg-[#0b0d12] px-4 py-6 text-white sm:px-6 xl:px-8" data-ui="workspace-detail-page">
        {!isRoot ? (
          <section className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#111318] p-8 text-center" data-ui="workspace-detail-denied">
            <h1 className="text-2xl font-semibold tracking-tight text-white" data-ui="workspace-detail-denied-title">Acceso root requerido</h1>
            <p className="mt-3 text-sm text-gray-400" data-ui="workspace-detail-denied-text">Solo usuarios root pueden administrar este workspace.</p>
          </section>
        ) : (
          <section className="mx-auto max-w-7xl" data-ui="workspace-detail-shell">
            <Breadcrumbs workspace={workspace} />
            <button type="button" onClick={() => setLocation('/backoffice/workspaces')} className="mb-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-gray-400 transition-colors hover:bg-white/5 hover:text-white" data-ui="workspace-back-button">
              <ArrowLeft className="h-4 w-4" data-ui="workspace-back-icon" />
              Volver
            </button>

            {loading && <p className="rounded-2xl border border-white/10 bg-[#111318] p-6 text-sm text-gray-400" data-ui="workspace-detail-loading">Cargando workspace...</p>}
            {error && <p className="rounded-2xl border border-red-400/20 bg-red-500/10 p-6 text-sm text-red-200" data-ui="workspace-detail-error">{error}</p>}
            {!loading && workspace && (
              <div data-ui="workspace-detail-content">
                <header className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_34%),#111318] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.35)] sm:p-6" data-ui="workspace-detail-header">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between" data-ui="workspace-detail-header-inner">
                    <div data-ui="workspace-detail-heading">
                      <p className="font-mono text-xs uppercase tracking-[0.28em] text-gray-500" data-ui="workspace-detail-kicker">competition id {workspace.id}</p>
                      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl" data-ui="workspace-detail-title">{workspace.nombre}</h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-gray-400" data-ui="workspace-detail-description">{workspace.descripcion || `${workspace.tipo} · ${workspace.lugar} · ${formatDate(workspace.fecha)}`}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2" data-ui="workspace-detail-kpis">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" data-ui="workspace-kpi-members">
                        <span className="block text-2xl font-semibold text-white" data-ui="workspace-kpi-members-value">{workspace.memberCount}</span>
                        <span className="block text-xs text-gray-500" data-ui="workspace-kpi-members-label">miembros</span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" data-ui="workspace-kpi-modules">
                        <span className="block text-2xl font-semibold text-white" data-ui="workspace-kpi-modules-value">{enabledModulesCount}</span>
                        <span className="block text-xs text-gray-500" data-ui="workspace-kpi-modules-label">modulos</span>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-3" data-ui="workspace-kpi-status">
                        <span className={`block text-2xl font-semibold ${workspace.activo ? 'text-emerald-300' : 'text-gray-400'}`} data-ui="workspace-kpi-status-value">{workspace.activo ? 'on' : 'off'}</span>
                        <span className="block text-xs text-gray-500" data-ui="workspace-kpi-status-label">estado</span>
                      </div>
                    </div>
                  </div>
                </header>

                <div className="mt-6 flex flex-wrap gap-2" data-ui="workspace-tabs">
                  <button type="button" onClick={() => setActiveTab('modules')} className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold transition-colors ${activeTab === 'modules' ? 'bg-white text-black' : 'border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'}`} data-ui="workspace-tab-modules">Modulos</button>
                  <button type="button" onClick={() => setActiveTab('members')} className={`min-h-[44px] rounded-xl px-4 text-sm font-semibold transition-colors ${activeTab === 'members' ? 'bg-white text-black' : 'border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white'}`} data-ui="workspace-tab-members">Miembros</button>
                </div>

                {activeTab === 'modules' && (
                  <section className="mt-4 rounded-3xl border border-white/10 bg-[#111318] p-4 sm:p-5" data-ui="workspace-modules-panel">
                    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-ui="workspace-modules-header">
                      <div data-ui="workspace-modules-heading">
                        <h2 className="text-lg font-semibold text-white" data-ui="workspace-modules-title">Secciones del sidenav</h2>
                        <p className="mt-1 text-sm text-gray-500" data-ui="workspace-modules-description">Activa o desactiva modulos visibles para este workspace.</p>
                      </div>
                      <button type="button" onClick={saveModules} disabled={savingModules} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60" data-ui="workspace-modules-save">
                        <Save className="h-4 w-4" data-ui="workspace-modules-save-icon" />
                        {savingModules ? 'Guardando...' : 'Guardar modulos'}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-ui="workspace-modules-grid">
                      {modulesDraft.map((module) => <ModuleToggle key={module.key} module={module} onToggle={toggleModule} />)}
                    </div>
                  </section>
                )}

                {activeTab === 'members' && (
                  <section className="mt-4 rounded-3xl border border-white/10 bg-[#111318] p-4 sm:p-5" data-ui="workspace-members-panel">
                    <div className="mb-5" data-ui="workspace-members-heading">
                      <h2 className="text-lg font-semibold text-white" data-ui="workspace-members-title">Miembros</h2>
                      <p className="mt-1 text-sm text-gray-500" data-ui="workspace-members-description">Edita datos, rol, estado y acceso por workspace.</p>
                    </div>

                    <form onSubmit={handleCreateMember} className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 xl:grid-cols-[1fr_1fr_180px_1fr_auto]" data-ui="workspace-member-create-form">
                      <input value={newMember.nombre} onChange={(event) => handleNewMemberChange('nombre', event.target.value)} placeholder="Nombre" className="min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-white/25" data-ui="workspace-member-create-name" />
                      <input type="email" value={newMember.email} onChange={(event) => handleNewMemberChange('email', event.target.value)} placeholder="Email" className="min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-white/25" data-ui="workspace-member-create-email" />
                      <select value={newMember.role} onChange={(event) => handleNewMemberChange('role', event.target.value as RoleSlug)} className="min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none focus:border-white/25" data-ui="workspace-member-create-role">
                        {ROLE_OPTIONS.map((role) => <option key={role} value={role} data-ui={`workspace-member-create-role-${role}`}>{ROLE_LABELS[role]}</option>)}
                      </select>
                      <input type="password" value={newMember.password} onChange={(event) => handleNewMemberChange('password', event.target.value)} placeholder="Password opcional" className="min-h-[44px] rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-gray-600 focus:border-white/25" data-ui="workspace-member-create-password" />
                      <button type="submit" disabled={submittingMember} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60" data-ui="workspace-member-create-submit">
                        <Plus className="h-4 w-4" data-ui="workspace-member-create-icon" />
                        {submittingMember ? 'Anadiendo...' : 'Anadir'}
                      </button>
                    </form>

                    {membersLoading && <p className="p-4 text-sm text-gray-400" data-ui="workspace-members-loading">Cargando miembros...</p>}
                    {!membersLoading && members.length === 0 && <p className="p-4 text-sm text-gray-400" data-ui="workspace-members-empty">No hay miembros en este workspace.</p>}
                    {!membersLoading && members.length > 0 && (
                      <div className="overflow-x-auto" data-ui="workspace-members-table-scroll">
                        <table className="w-full min-w-[760px]" data-ui="workspace-members-table">
                          <thead data-ui="workspace-members-table-head">
                            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-[0.18em] text-gray-500" data-ui="workspace-members-head-row">
                              <th className="px-3 py-3 font-semibold" data-ui="workspace-members-th-user">Usuario</th>
                              <th className="px-3 py-3 font-semibold" data-ui="workspace-members-th-role">Rol</th>
                              <th className="px-3 py-3 font-semibold" data-ui="workspace-members-th-status">Estado</th>
                              <th className="px-3 py-3 text-right font-semibold" data-ui="workspace-members-th-actions">Acciones</th>
                            </tr>
                          </thead>
                          <tbody data-ui="workspace-members-table-body">
                            {members.map((member) => (
                              <tr key={member.id} className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]" data-ui={`workspace-member-row-${member.id}`}>
                                <td className="px-3 py-4" data-ui={`workspace-member-user-${member.id}`}>
                                  <span className="block font-semibold text-white" data-ui={`workspace-member-name-${member.id}`}>{member.nombre}</span>
                                  <span className="mt-1 flex items-center gap-1.5 text-sm text-gray-500" data-ui={`workspace-member-email-${member.id}`}>
                                    <Mail className="h-3.5 w-3.5" data-ui={`workspace-member-email-icon-${member.id}`} />
                                    {member.email}
                                  </span>
                                </td>
                                <td className="px-3 py-4" data-ui={`workspace-member-role-${member.id}`}>
                                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-semibold text-gray-300" data-ui={`workspace-member-role-badge-${member.id}`}>{ROLE_LABELS[member.role as RoleSlug] ?? member.role}</span>
                                </td>
                                <td className="px-3 py-4" data-ui={`workspace-member-status-${member.id}`}>
                                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${member.isActive ? 'bg-emerald-400/10 text-emerald-300' : 'bg-zinc-500/10 text-zinc-400'}`} data-ui={`workspace-member-status-badge-${member.id}`}>
                                    {member.isActive ? <Check className="h-3 w-3" data-ui={`workspace-member-active-icon-${member.id}`} /> : <X className="h-3 w-3" data-ui={`workspace-member-inactive-icon-${member.id}`} />}
                                    {member.isActive ? 'Activo' : 'Inactivo'}
                                  </span>
                                </td>
                                <td className="px-3 py-4" data-ui={`workspace-member-actions-${member.id}`}>
                                  <div className="flex justify-end gap-2" data-ui={`workspace-member-actions-inner-${member.id}`}>
                                    <button type="button" onClick={() => openEditMember(member)} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-white/10 px-3 text-sm text-gray-300 transition-colors hover:bg-white/5 hover:text-white" data-ui={`workspace-member-edit-${member.id}`}>
                                      <UserCog className="h-4 w-4" data-ui={`workspace-member-edit-icon-${member.id}`} />
                                      Editar
                                    </button>
                                    <button type="button" onClick={() => void deleteMember(member)} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-red-400/20 px-3 text-sm text-red-300 transition-colors hover:bg-red-500/10" data-ui={`workspace-member-delete-${member.id}`}>
                                      <Trash2 className="h-4 w-4" data-ui={`workspace-member-delete-icon-${member.id}`} />
                                      Eliminar
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                )}
              </div>
            )}
          </section>
        )}
        {editingMember && (
          <MemberEditorModal
            member={editingMember}
            form={editForm}
            saving={savingMember}
            onClose={() => setEditingMember(null)}
            onChange={handleEditChange}
            onSave={() => void saveMember()}
          />
        )}
      </main>
    </BackofficeLayout>
  );
}

export default WorkspaceDetailPage;
