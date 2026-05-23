import { useCallback, useMemo, useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useAtomValue, useAtom, atom } from 'jotai';
import { currentCompeticionAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { Role, MemberDetail, RoleSlug } from '../../../types/api';
import { BackofficeLayout } from '../BackofficeLayout';
import { Tabs } from '../../../components/ui/Tabs';
import { Icon } from '../../../components/ui/Icon';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { SearchIcon, EyeIcon, UserPlusIcon, ShieldCheckIcon, ChevronRightIcon, UsersIcon } from '../../../components/ui/Icon';
import toast from 'react-hot-toast';

const ROLE_CARDS = [
  {
    slug: 'root' as RoleSlug,
    name: 'Root',
    description: 'Acceso total al sistema. Puede gestionar todas las competiciones y usuarios.',
    icon: ShieldCheckIcon,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  {
    slug: 'admin' as RoleSlug,
    name: 'Admin',
    description: 'Gestión completa de miembros, inscripciones y configuración.',
    icon: ShieldCheckIcon,
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  {
    slug: 'staff' as RoleSlug,
    name: 'Staff',
    description: 'Personal de apoyo. Acceso a horarios y gestión de inscripciones.',
    icon: ShieldCheckIcon,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  {
    slug: 'registrador' as RoleSlug,
    name: 'Registrador',
    description: 'Encargado del registro y control de asistencia.',
    icon: ShieldCheckIcon,
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
];

const usersPageAtoms = {
  rolesTab: atom({
    loading: true,
    roles: [] as Role[],
  }),
  membersTab: atom({
    loading: true,
    members: [] as MemberDetail[],
    search: '',
    roleFilter: 'all',
    page: 1,
    totalPages: 1,
    total: 0,
  }),
};

export function UsersPage(): JSX.Element {
  const params = useParams<{ competicionSlug: string }>();
  const [, setLocation] = useLocation();

  const getInitialTab = useCallback((): string => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    return tabParam === 'members' ? 'members' : 'roles';
  }, []);

  const [activeTab, setActiveTab] = useState(getInitialTab);

  const handleTabChange = useCallback((tabId: string) => {
    setActiveTab(tabId);
    const url = `/backoffice/${params.competicionSlug}/users?tab=${tabId}`;
    setLocation(url);
  }, [setLocation, params.competicionSlug]);

  const tabs = useMemo(() => [
    { id: 'roles', label: 'Roles' },
    { id: 'members', label: 'Miembros' },
  ], []);

  return (
    <BackofficeLayout breadcrumbs={[{ label: 'Miembros' }]}>
      <div data-ui="users-page" className="max-w-6xl mx-auto">
        <Tabs
          tabs={tabs}
          activeTab={activeTab}
          onChange={handleTabChange}
          className="mb-8"
        />

        {activeTab === 'roles' ? (
          <RolesTab competicionSlug={params.competicionSlug} />
        ) : (
          <MembersTab competicionSlug={params.competicionSlug} />
        )}
      </div>
    </BackofficeLayout>
  );
}

interface RolesTabProps {
  competicionSlug: string;
}

function RolesTab({ competicionSlug }: RolesTabProps): JSX.Element {
  const [rolesState, setRolesState] = useAtom(usersPageAtoms.rolesTab);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!currentCompeticion?.id) return;
    api.getCompetitionRoles(currentCompeticion.id).then(result => {
      if (result.success && result.data) {
        setRolesState({ loading: false, roles: result.data });
      } else {
        setRolesState({ loading: false, roles: [] });
      }
    });
  }, [currentCompeticion?.id, setRolesState]);

  const handleViewRole = useCallback((slug: RoleSlug) => {
    setLocation(`/backoffice/${competicionSlug}/users/roles/${slug}`);
  }, [setLocation, competicionSlug]);

  const handleAddMember = useCallback((slug: RoleSlug) => {
    setLocation(`/backoffice/${competicionSlug}/users/new?role=${slug}`);
  }, [setLocation, competicionSlug]);

  if (rolesState.loading) {
    return (
      <div data-ui="roles-loading" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} data-ui="role-skeleton" className="bg-dark-card rounded-xl p-6 animate-pulse">
            <div className="h-6 bg-white/10 rounded w-1/3 mb-3" />
            <div className="h-4 bg-white/10 rounded w-2/3 mb-4" />
            <div className="h-10 bg-white/10 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div data-ui="roles-grid" className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {ROLE_CARDS.map(card => {
        const roleData = rolesState.roles.find(r => r.slug === card.slug);
        return (
          <div
            key={card.slug}
            data-ui="role-card"
            data-role={card.slug}
            className="bg-dark-card rounded-xl border border-white/5 overflow-hidden
              hover:border-white/10 transition-all duration-200"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-lg ${card.bgColor}`}>
                  <card.icon className={card.color} size="lg" />
                </div>
                <span data-ui="member-count" className="text-2xl font-bold text-white">
                  {roleData?.memberCount || 0}
                </span>
              </div>
              <h3 data-ui="role-name" className="text-lg font-semibold text-white mb-2">
                {card.name}
              </h3>
              <p data-ui="role-description" className="text-sm text-gray-400 mb-4">
                {card.description}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleViewRole(card.slug)}
                  leftIcon={<EyeIcon size="sm" />}
                  className="flex-1"
                >
                  Ver rol
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleAddMember(card.slug)}
                  leftIcon={<UserPlusIcon size="sm" />}
                  className="flex-1"
                >
                  Añadir
                </Button>
              </div>
            </div>
            {roleData?.capabilities && roleData.capabilities.length > 0 && (
              <div data-ui="role-capabilities" className="px-6 py-3 bg-black/20 border-t border-white/5">
                <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Permisos</p>
                <div className="flex flex-wrap gap-1">
                  {roleData.capabilities.slice(0, 3).map(cap => (
                    <span key={cap} data-ui="capability-tag" className="text-xs px-2 py-0.5 rounded bg-white/5 text-gray-400">
                      {cap}
                    </span>
                  ))}
                  {roleData.capabilities.length > 3 && (
                    <span data-ui="more-capabilities" className="text-xs text-gray-500">
                      +{roleData.capabilities.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface MembersTabProps {
  competicionSlug: string;
}

function MembersTab({ competicionSlug }: MembersTabProps): JSX.Element {
  const [membersState, setMembersState] = useAtom(usersPageAtoms.membersTab);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const [, setLocation] = useLocation();

  const loadMembers = useCallback(async () => {
    if (!currentCompeticion?.id) return;
    setMembersState(prev => ({ ...prev, loading: true }));
    const result = await api.getCompetitionUsers(currentCompeticion.id, {
      page: membersState.page,
      pageSize: 10,
      search: membersState.search || undefined,
      role: membersState.roleFilter !== 'all' ? membersState.roleFilter : undefined,
    });
    if (result.success && result.data) {
      const users = Array.isArray(result.data) ? result.data : (result.data as any).users || [];
      const total = Array.isArray(result.data) ? result.data.length : (result.data as any).total || 0;
      setMembersState(prev => ({
        ...prev,
        loading: false,
        members: users,
        totalPages: 1,
        total: total,
      }));
    } else {
      setMembersState(prev => ({ ...prev, loading: false }));
    }
  }, [currentCompeticion?.id, membersState.page, membersState.search, membersState.roleFilter, setMembersState]);

  useEffect(() => {
    if (!currentCompeticion?.id) {
      setMembersState(prev => ({ ...prev, loading: false }));
      return;
    }
    loadMembers();
  }, [loadMembers, currentCompeticion?.id, setMembersState]);

  const handleViewMember = useCallback((memberId: number) => {
    setLocation(`/backoffice/${competicionSlug}/users/members/${memberId}`);
  }, [setLocation, competicionSlug]);

  const handleSearchChange = useCallback((value: string) => {
    setMembersState(prev => ({ ...prev, search: value, page: 1 }));
  }, [setMembersState]);

  const handleRoleFilterChange = useCallback((value: string) => {
    setMembersState(prev => ({ ...prev, roleFilter: value, page: 1 }));
  }, [setMembersState]);

  const handlePageChange = useCallback((newPage: number) => {
    setMembersState(prev => ({ ...prev, page: newPage }));
  }, [setMembersState]);

  return (
    <div data-ui="members-tab">
      <div data-ui="members-filters" className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <Input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={membersState.search}
            onChange={(e) => handleSearchChange(e.target.value)}
            leftIcon={<SearchIcon size="sm" />}
            className="w-full"
          />
        </div>
        <select
          data-ui="role-filter"
          value={membersState.roleFilter}
          onChange={(e) => handleRoleFilterChange(e.target.value)}
          className="px-4 py-2.5 rounded-lg bg-dark-card border border-white/10
            text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-accent min-w-[150px]"
        >
          <option value="all">Todos los roles</option>
          <option value="root">Root</option>
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
          <option value="registrador">Registrador</option>
        </select>
        <Button
          variant="primary"
          onClick={() => setLocation(`/backoffice/${competicionSlug}/users/new`)}
          leftIcon={<UserPlusIcon size="sm" />}
        >
          Nuevo miembro
        </Button>
      </div>

      <div data-ui="members-count" className="text-sm text-gray-400 mb-4">
        Mostrando {membersState.members.length} de {membersState.total} miembros
      </div>

      {membersState.loading ? (
        <div data-ui="members-loading" className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} data-ui="member-skeleton" className="bg-dark-card rounded-lg p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-white/10" />
                <div className="flex-1">
                  <div className="h-4 bg-white/10 rounded w-1/4 mb-2" />
                  <div className="h-3 bg-white/10 rounded w-1/3" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : membersState.members.length === 0 ? (
        <div data-ui="empty-state" className="flex flex-col items-center justify-center py-16 text-center">
          <UsersIcon size="48" className="text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No hay miembros</h3>
          <p className="text-sm text-gray-400 mb-6">
            {membersState.search || membersState.roleFilter !== 'all'
              ? 'No se encontraron miembros con los filtros seleccionados.'
              : 'Comienza añadiendo miembros a esta competición.'}
          </p>
          <Button
            variant="primary"
            onClick={() => setLocation(`/backoffice/${competicionSlug}/users/new`)}
            leftIcon={<UserPlusIcon size="sm" />}
          >
            Añadir primer miembro
          </Button>
        </div>
      ) : (
        <div data-ui="members-list" className="space-y-3">
          {membersState.members.map(member => (
            <div
              key={member.id}
              data-ui="member-row"
              data-member-id={member.id}
              className="bg-dark-card rounded-lg border border-white/5 overflow-hidden
                hover:border-white/10 transition-all duration-150"
            >
              <div className="flex items-center gap-4 p-4">
                <div data-ui="member-avatar" className="w-10 h-10 rounded-full bg-red-accent/20 flex items-center justify-center">
                  <span className="text-sm font-medium text-red-accent">
                    {(member.nombre || '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div data-ui="member-info" className="flex-1 min-w-0">
                  <div data-ui="member-name" className="text-sm font-medium text-white truncate">
                    {member.nombre}
                  </div>
                  <div data-ui="member-email" className="text-xs text-gray-400 truncate">
                    {member.email}
                  </div>
                </div>
                <div data-ui="member-role" className="px-2.5 py-1 rounded text-xs font-medium bg-white/5 text-gray-300">
                  {member.role}
                </div>
                <div data-ui="member-status">
                  {(member as any).invitationAcceptedAt === false ? (
                    <span className="px-2.5 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400">
                      Pendiente
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      Activo
                    </span>
                  )}
                </div>
                <button
                  data-ui="view-member-btn"
                  onClick={() => handleViewMember(member.id)}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px]
                    flex items-center justify-center"
                  aria-label="Ver miembro"
                >
                  <ChevronRightIcon size="sm" className="text-gray-400" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {membersState.totalPages > 1 && (
        <div data-ui="pagination" className="flex justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            disabled={membersState.page === 1}
            onClick={() => handlePageChange(membersState.page - 1)}
          >
            Anterior
          </Button>
          <span data-ui="page-info" className="px-4 py-2 text-sm text-gray-400">
            Página {membersState.page} de {membersState.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={membersState.page === membersState.totalPages}
            onClick={() => handlePageChange(membersState.page + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}