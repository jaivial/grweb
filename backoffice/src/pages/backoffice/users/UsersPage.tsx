import { useCallback, useEffect, useMemo, type FormEvent } from 'react';
import { toast } from 'react-hot-toast';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useLocation, useParams } from 'wouter';
import api from '../../../api/client';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { currentCompeticionAtom, currentCompeticionIdAtom } from '../../../stores/auth.atoms';
import { usePermissions } from '../../../hooks/usePermissions';
import type { CompetitionMember, UserRole, Role } from '../../../types/api';
import { Eye, UserPlus, Pencil, Trash2, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MEMBER_ROLE_BADGE_CLASSES,
  MEMBER_ROLE_DESCRIPTIONS,
  MEMBER_ROLE_LABELS,
  MEMBER_ROLE_ORDER,
} from './UsersPage.constants';
import {
  competitionMembersAtom,
  competitionMembersErrorAtom,
  competitionMembersLoadingAtom,
  usersPaginationAtom,
  usersRoleCountsAtom,
} from './UsersPage.atoms';
import {
  canEditMemberRole,
  canManageMemberTarget,
  filterMembersByRole,
  formatInviteState,
  groupMembersByRole,
  normalizeCompetitionUsersResponse,
  normalizeMemberRole,
  sortMembers,
  resolveBackofficeUsersBasePath,
} from './UsersPage.helpers';

interface RoleCardProps {
  role: UserRole;
  count: number;
  onView: (role: UserRole) => void;
  onAddMember?: (role: UserRole) => void;
  canAddMember?: boolean;
}

interface MemberRowProps {
  member: CompetitionMember;
  onView: (member: CompetitionMember) => void;
  onEditRole?: (member: CompetitionMember) => void;
  onDelete?: (member: CompetitionMember) => void;
  canManage: boolean;
  canEditTarget: boolean;
  canDeleteTarget: boolean;
}

function RoleCard({ role, count, onView, onAddMember, canAddMember }: RoleCardProps) {
  const cardClasses = useMemo(
    () => `rounded-2xl border p-5 text-left transition-transform hover:-translate-y-0.5 hover:shadow-xl ${MEMBER_ROLE_BADGE_CLASSES[role] ?? MEMBER_ROLE_BADGE_CLASSES.staff}`,
    [role],
  );

  return (
    <div className={cardClasses} data-ui={`members-role-card-${role}`}>
      <span className="block text-xs font-semibold uppercase tracking-[0.24em] opacity-70" data-ui={`members-role-kicker-${role}`}>
        {MEMBER_ROLE_LABELS[role]}
      </span>
      <span className="mt-4 flex items-end gap-2" data-ui={`members-role-count-row-${role}`}>
        <strong className="text-4xl font-black leading-none" data-ui={`members-role-count-${role}`}>{count}</strong>
        <span className="pb-1 text-sm opacity-75" data-ui={`members-role-count-label-${role}`}>usuarios</span>
      </span>
      <span className="mt-4 block text-sm leading-relaxed opacity-80" data-ui={`members-role-description-${role}`}>
        {MEMBER_ROLE_DESCRIPTIONS[role]}
      </span>
      <div className="mt-4 flex gap-2" data-ui={`members-role-actions-${role}`}>
        <button
          onClick={() => onView(role)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
          data-ui={`members-role-view-btn-${role}`}
          type="button"
        >
          <Eye className="w-3.5 h-3.5" />
          Ver rol
        </button>
        {onAddMember && canAddMember && (
          <button
            onClick={() => onAddMember(role)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white transition-colors"
            data-ui={`members-role-add-btn-${role}`}
            type="button"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Añadir
          </button>
        )}
      </div>
    </div>
  );
}

function MemberRow({ member, onView, onEditRole, onDelete, canManage, canEditTarget, canDeleteTarget }: MemberRowProps) {
  const role = member.role as UserRole;
  const status = useMemo(() => formatInviteState(member), [member]);
  const badgeClasses = useMemo(
    () => `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${MEMBER_ROLE_BADGE_CLASSES[role] ?? MEMBER_ROLE_BADGE_CLASSES.staff}`,
    [role],
  );

  return (
    <tr className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.03]" data-ui={`members-row-${member.usuarioId}`}>
      <td className="px-4 py-4" data-ui={`members-name-cell-${member.usuarioId}`}>
        <span className="block font-semibold text-white" data-ui={`members-name-${member.usuarioId}`}>{member.nombre}</span>
        <span className="block text-sm text-gray-500" data-ui={`members-email-${member.usuarioId}`}>{member.email}</span>
      </td>
      <td className="px-4 py-4" data-ui={`members-role-cell-${member.usuarioId}`}>
        <span className={badgeClasses} data-ui={`members-role-badge-${member.usuarioId}`}>{MEMBER_ROLE_LABELS[role]}</span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-400" data-ui={`members-status-cell-${member.usuarioId}`}>{status}</td>
      <td className="px-4 py-4" data-ui={`members-actions-cell-${member.usuarioId}`}>
        <div className="flex gap-1 justify-end" data-ui={`members-actions-${member.usuarioId}`}>
          <button
            onClick={() => onView(member)}
            className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            data-ui={`members-view-btn-${member.usuarioId}`}
            aria-label="Ver miembro"
            type="button"
          >
            <Eye className="w-4 h-4" />
          </button>
          {onEditRole && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditRole(member); }}
              className={`p-1.5 rounded-lg transition-colors ${canEditTarget ? 'text-white/50 hover:text-white hover:bg-white/10' : 'text-white/20 cursor-not-allowed'}`}
              data-ui={`members-edit-btn-${member.usuarioId}`}
              aria-label={canEditTarget ? 'Editar rol' : 'No tienes permisos para editar este rol'}
              type="button"
              disabled={!canEditTarget}
              title={canEditTarget ? 'Editar rol' : 'No tienes permisos para editar este rol'}
            >
              <Pencil className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(member); }}
              className={`p-1.5 rounded-lg transition-colors ${canDeleteTarget ? 'text-red-400/80 hover:text-red-300 hover:bg-white/10' : 'text-red-400/20 cursor-not-allowed'}`}
              data-ui={`members-delete-btn-${member.usuarioId}`}
              aria-label={canDeleteTarget ? 'Eliminar miembro' : 'No tienes permisos para eliminar este rol'}
              type="button"
              disabled={!canDeleteTarget}
              title={canDeleteTarget ? 'Eliminar miembro' : 'No tienes permisos para eliminar este usuario'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function UsersPage() {
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const { canViewUsers, canManageUsers, isRoot } = usePermissions();
  const [members, setMembers] = useAtom(competitionMembersAtom);
  const [isLoading, setIsLoading] = useAtom(competitionMembersLoadingAtom);
  const [pagination, setPagination] = useAtom(usersPaginationAtom);
  const [roleCounts, setRoleCounts] = useAtom(usersRoleCountsAtom);
  const [, setLocation] = useLocation();
  const setError = useSetAtom(competitionMembersErrorAtom);
  const error = useAtomValue(competitionMembersErrorAtom);

  const currentPath = useLocation()[0];
  const params = useParams<{ competicionSlug?: string }>();

  const usersBasePath = useMemo(
    () => resolveBackofficeUsersBasePath(currentPath, params.competicionSlug),
    [currentPath, params.competicionSlug],
  );

  const isAdmin = useMemo(() => !isRoot && canManageUsers, [isRoot, canManageUsers]);

  const availableRoles = useMemo<UserRole[]>(() => (isRoot ? MEMBER_ROLE_ORDER : ['staff', 'registrador']), [isRoot]);
  const sortedMembers = useMemo(() => sortMembers(members), [members]);
  const pageTitle = useMemo(() => `Miembros de ${currentCompeticion?.nombre ?? 'la competicion'}`, [currentCompeticion?.nombre]);

  const loadMembers = useCallback(async () => {
    if (!competicionId || !canViewUsers) return;
    setIsLoading(true);
    setError(null);
    const response = await api.getCompetitionUsers(competicionId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: pagination.search || undefined,
      role: pagination.role || undefined,
    });
    if (response.success && response.data) {
      const members = normalizeCompetitionUsersResponse(response.data);
      setMembers(members);
      setPagination(prev => ({
        ...prev,
        totalCount: response.data!.totalCount,
        totalPages: response.data!.totalPages,
      }));
    } else {
      setError(response.message ?? 'No se pudieron cargar los miembros');
    }
    setIsLoading(false);
  }, [canViewUsers, competicionId, pagination.page, pagination.pageSize, pagination.search, pagination.role, setError, setIsLoading, setMembers, setPagination]);

  const loadRoleCounts = useCallback(async () => {
    if (!competicionId) return;
    const response = await api.getCompetitionRoles(competicionId);
    if (response.success && response.data) {
      const counts: Record<string, number> = {};
      for (const role of response.data) {
        counts[role.slug] = role.memberCount;
      }
      setRoleCounts(counts);
    }
  }, [competicionId, setRoleCounts]);

  useEffect(() => {
    void loadRoleCounts();
  }, [loadRoleCounts]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const handleSearchChange = useCallback((value: string) => {
    setPagination(prev => ({ ...prev, search: value, page: 1 }));
  }, [setPagination]);

  const handleRoleFilterChange = useCallback((role: UserRole | null) => {
    setPagination(prev => ({ ...prev, role, page: 1 }));
  }, [setPagination]);

  const handlePageChange = useCallback((newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  }, [setPagination]);

  const handleViewRole = useCallback((role: UserRole) => {
    setLocation(`${usersBasePath}/roles/${role}`);
  }, [setLocation, usersBasePath]);

  const handleAddMember = useCallback((role?: UserRole) => {
    const query = role ? `?role=${role}` : '';
    setLocation(`${usersBasePath}/new${query}`);
  }, [setLocation, usersBasePath]);

  const handleViewMember = useCallback((member: CompetitionMember) => {
    setLocation(`${usersBasePath}/members/${member.usuarioId}`);
  }, [setLocation, usersBasePath]);

  const handleEditMemberRole = useCallback((member: CompetitionMember) => {
    setLocation(`${usersBasePath}/members/${member.usuarioId}`);
  }, [setLocation, usersBasePath]);

  const handleDeleteMember = useCallback(async (member: CompetitionMember) => {
    if (!competicionId) return;
    const targetRole = normalizeMemberRole(member.role);
    if (!canManageMemberTarget({ isRoot, isAdmin, targetRole })) {
      toast.error('No tienes permisos para eliminar este usuario');
      return;
    }
    if (!window.confirm(`¿Eliminar a ${member.nombre} de la competición?`)) return;
    const response = await api.deleteCompetitionMember(competicionId, member.usuarioId);
    if (!response.success) {
      toast.error(response.message ?? 'No se pudo eliminar el miembro');
      return;
    }
    toast.success('Miembro eliminado de la competicion');
    await loadMembers();
  }, [competicionId, isRoot, isAdmin, loadMembers]);

  const canUserAddRole = useCallback((role: UserRole): boolean => {
    if (!canManageUsers) return false;
    return canEditMemberRole({ isRoot, targetRole: role });
  }, [canManageUsers, isRoot]);

  const canUserEditMember = useCallback((member: CompetitionMember): boolean => {
    if (!canManageUsers) return false;
    const targetRole = normalizeMemberRole(member.role);
    return canManageMemberTarget({ isRoot, isAdmin, targetRole });
  }, [canManageUsers, isRoot, isAdmin]);

  const canUserDeleteMember = useCallback((member: CompetitionMember): boolean => {
    if (!canManageUsers) return false;
    const targetRole = normalizeMemberRole(member.role);
    return canManageMemberTarget({ isRoot, isAdmin, targetRole });
  }, [canManageUsers, isRoot, isAdmin]);

  const startItem = useMemo(() => (pagination.page - 1) * pagination.pageSize + 1, [pagination.page, pagination.pageSize]);
  const endItem = useMemo(() => Math.min(pagination.page * pagination.pageSize, pagination.totalCount), [pagination.page, pagination.pageSize, pagination.totalCount]);

  return (
    <BackofficeLayout>
      <main className="min-h-screen bg-dark-base px-4 py-6 sm:px-6 lg:px-8" data-ui="members-page">
        {!canViewUsers ? (
          <section className="rounded-2xl border border-white/10 bg-dark-surface p-8 text-center" data-ui="members-denied-card">
            <h1 className="text-2xl font-bold text-white" data-ui="members-denied-title">Acceso restringido</h1>
            <p className="mt-3 text-gray-400" data-ui="members-denied-text">Solo root y admin pueden ver miembros de la competicion.</p>
          </section>
        ) : (
          <section className="mx-auto max-w-6xl" data-ui="members-shell">
            <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between" data-ui="members-header">
              <div data-ui="members-heading-block">
                <p className="text-xs font-semibold uppercase tracking-[0.32em] text-red-accent" data-ui="members-kicker">Equipo</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl" data-ui="members-title">{pageTitle}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-gray-400" data-ui="members-description">
                  Gestiona roles por competition ID. Root ve todas las competiciones; admin solo gestiona staff y registradores.
                </p>
              </div>
              {canManageUsers && (
                <button
                  className="min-h-[44px] rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10"
                  data-ui="members-invite-button"
                  type="button"
                  onClick={() => handleAddMember()}
                >
                  Añadir miembro
                </button>
              )}
            </header>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-ui="members-role-grid">
              {MEMBER_ROLE_ORDER.map((role) => (
                <RoleCard
                  key={role}
                  role={role}
                  count={roleCounts[role] ?? 0}
                  onView={handleViewRole}
                  onAddMember={canManageUsers ? handleAddMember : undefined}
                  canAddMember={canUserAddRole(role)}
                />
              ))}
            </div>

            <section className="mt-8 overflow-hidden rounded-2xl border border-white/10 bg-dark-surface" data-ui="members-table-section">
              <div className="border-b border-white/5 px-4 py-4" data-ui="members-table-header">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" data-ui="members-table-controls">
                  <div data-ui="members-table-title-block">
                    <h2 className="text-lg font-bold text-white" data-ui="members-table-title">Lista de miembros</h2>
                    <p className="mt-1 text-sm text-gray-500" data-ui="members-table-subtitle">
                      {pagination.totalCount > 0 ? (
                        <>Mostrando {startItem}-{endItem} de {pagination.totalCount}</>
                      ) : (
                        <>Gestiona los miembros de la competición</>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row" data-ui="members-filters">
                    <div className="relative" data-ui="members-search-wrapper">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" data-ui="members-search-icon" />
                      <input
                        type="text"
                        value={pagination.search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Buscar por nombre o email..."
                        className="pl-10 pr-4 py-2 min-h-[44px] text-sm bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-accent/50"
                        data-ui="members-search-input"
                      />
                    </div>
                    <select
                      value={pagination.role ?? ''}
                      onChange={(e) => handleRoleFilterChange(e.target.value as UserRole || null)}
                      className="px-4 py-2 min-h-[44px] text-sm bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-red-accent/50"
                      data-ui="members-role-filter"
                    >
                      <option value="" data-ui="members-role-filter-option-all">Todos los roles</option>
                      {MEMBER_ROLE_ORDER.map(role => (
                        <option key={role} value={role} data-ui={`members-role-filter-option-${role}`}>{MEMBER_ROLE_LABELS[role]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {isLoading && <p className="p-6 text-sm text-gray-400" data-ui="members-loading">Cargando miembros...</p>}
              {error && <p className="p-6 text-sm text-red-300" data-ui="members-error">{error}</p>}
              {!isLoading && !error && sortedMembers.length === 0 && (
                <p className="p-6 text-sm text-gray-400" data-ui="members-empty">
                  {pagination.search || pagination.role ? 'No hay miembros que coincidan con los filtros.' : 'Todavia no hay miembros asignados.'}
                </p>
              )}
              {!isLoading && !error && sortedMembers.length > 0 && (
                <div data-ui="members-table-content">
                  <div className="overflow-x-auto" data-ui="members-table-scroll">
                    <table className="w-full min-w-[640px]" data-ui="members-table">
                      <thead data-ui="members-table-head">
                        <tr className="border-b border-white/5 text-left text-xs uppercase tracking-[0.18em] text-gray-500" data-ui="members-table-head-row">
                          <th className="px-4 py-3 font-semibold" data-ui="members-th-user">Usuario</th>
                          <th className="px-4 py-3 font-semibold" data-ui="members-th-role">Rol</th>
                          <th className="px-4 py-3 font-semibold" data-ui="members-th-status">Estado</th>
                          <th className="px-4 py-3 font-semibold text-right" data-ui="members-th-actions">Acciones</th>
                        </tr>
                      </thead>
                      <tbody data-ui="members-table-body">
                        {sortedMembers.map((member) => (
                          <MemberRow
                            key={member.usuarioId}
                            member={member}
                            onView={handleViewMember}
                            onEditRole={canManageUsers ? handleEditMemberRole : undefined}
                            onDelete={canManageUsers ? handleDeleteMember : undefined}
                            canManage={canManageUsers}
                            canEditTarget={canUserEditMember(member)}
                            canDeleteTarget={canUserDeleteMember(member)}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-white/5" data-ui="members-pagination">
                      <div className="text-sm text-gray-400" data-ui="members-pagination-info">
                        Página {pagination.page} de {pagination.totalPages}
                      </div>
                      <div className="flex gap-2" data-ui="members-pagination-controls">
                        <button
                          onClick={() => handlePageChange(pagination.page - 1)}
                          disabled={pagination.page <= 1}
                          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          data-ui="members-pagination-prev"
                          type="button"
                          aria-label="Página anterior"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handlePageChange(pagination.page + 1)}
                          disabled={pagination.page >= pagination.totalPages}
                          className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          data-ui="members-pagination-next"
                          type="button"
                          aria-label="Página siguiente"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </section>
        )}
      </main>
    </BackofficeLayout>
  );
}

export default UsersPage;