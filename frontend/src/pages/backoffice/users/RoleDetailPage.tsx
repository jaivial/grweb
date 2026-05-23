import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { atom, useAtomValue, useAtom } from 'jotai';
import { currentCompeticionAtom, userRoleAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { RoleWithMembers, RoleSlug, MemberDetail } from '../../../types/api';
import { BackofficeLayout } from '../BackofficeLayout';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { UserPlusIcon, ChevronRightIcon, ShieldCheckIcon } from '../../../components/ui/Icon';
import toast from 'react-hot-toast';

const roleDetailAtoms = {
  roleData: atom<{
    loading: boolean;
    data: RoleWithMembers | null;
    error: string | null;
  }>({
    loading: true,
    data: null,
    error: null,
  }),
};

const ROLE_INFO: Record<RoleSlug, { name: string; description: string; color: string; bgColor: string }> = {
  root: {
    name: 'Root',
    description: 'Acceso total al sistema. Puede gestionar todas las competiciones y usuarios.',
    color: 'text-red-400',
    bgColor: 'bg-red-500/10',
  },
  admin: {
    name: 'Admin',
    description: 'Gestión completa de miembros, inscripciones y configuración.',
    color: 'text-orange-400',
    bgColor: 'bg-orange-500/10',
  },
  staff: {
    name: 'Staff',
    description: 'Personal de apoyo. Acceso a horarios y gestión de inscripciones.',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
  },
  registrador: {
    name: 'Registrador',
    description: 'Encargado del registro y control de asistencia.',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10',
  },
};

export function RoleDetailPage(): JSX.Element {
  const params = useParams<{ competicionSlug: string; roleSlug: string }>();
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const [roleState, setRoleState] = useAtom(roleDetailAtoms.roleData);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!currentCompeticion?.id || !params.roleSlug) {
      setRoleState(prev => ({ ...prev, loading: false, error: prev.error || 'Competición no disponible' }));
      return;
    }

    setRoleState(prev => ({ ...prev, loading: true, error: null }));

    api.getCompetitionRoleWithMembers(currentCompeticion.id, params.roleSlug).then(result => {
      if (result.success && result.data) {
        setRoleState({ loading: false, data: result.data, error: null });
      } else {
        setRoleState({ loading: false, data: null, error: result.message || 'Error al cargar el rol' });
      }
    });
  }, [currentCompeticion?.id, params.roleSlug, setRoleState]);

  const handleAddMember = useCallback(() => {
    setLocation(`/backoffice/${params.competicionSlug}/users/new?role=${params.roleSlug}`);
  }, [setLocation, params.competicionSlug, params.roleSlug]);

  const handleViewMember = useCallback((memberId: number) => {
    setLocation(`/backoffice/${params.competicionSlug}/users/members/${memberId}`);
  }, [setLocation, params.competicionSlug]);

  const roleInfo = ROLE_INFO[params.roleSlug as RoleSlug];

  const breadcrumbs = useMemo(() => [
    { label: 'Miembros', href: `/backoffice/${params.competicionSlug}/users` },
    { label: 'Roles', href: `/backoffice/${params.competicionSlug}/users?tab=roles` },
    { label: roleInfo?.name || params.roleSlug },
  ], [params.competicionSlug, params.roleSlug, roleInfo]);

  if (roleState.loading) {
    return (
      <BackofficeLayout breadcrumbs={breadcrumbs} title={roleInfo?.name || params.roleSlug}>
        <div data-ui="role-detail-loading" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-6 mb-6 animate-pulse">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 rounded-xl bg-white/10" />
              <div className="flex-1">
                <div className="h-6 bg-white/10 rounded w-1/4 mb-2" />
                <div className="h-4 bg-white/10 rounded w-2/3" />
              </div>
            </div>
            <div className="h-4 bg-white/10 rounded w-1/3 mb-4" />
            <div className="flex gap-2">
              <div className="h-8 bg-white/10 rounded w-24" />
              <div className="h-8 bg-white/10 rounded w-24" />
            </div>
          </div>
        </div>
      </BackofficeLayout>
    );
  }

  if (roleState.error || !roleState.data) {
    return (
      <BackofficeLayout breadcrumbs={breadcrumbs} title="Error">
        <div data-ui="role-detail-error" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-8 text-center">
            <p className="text-red-400 mb-4">{roleState.error || 'Rol no encontrado'}</p>
            <Button
              variant="primary"
              onClick={() => setLocation(`/backoffice/${params.competicionSlug}/users`)}
            >
              Volver a miembros
            </Button>
          </div>
        </div>
      </BackofficeLayout>
    );
  }

  const { data: role } = roleState;

  return (
    <BackofficeLayout breadcrumbs={breadcrumbs} title={roleInfo?.name || role.name}>
      <div data-ui="role-detail-page" className="max-w-4xl mx-auto">
        <div data-ui="role-header" className="bg-dark-card rounded-xl border border-white/5 overflow-hidden mb-6">
          <div className="p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className={`p-4 rounded-xl ${roleInfo?.bgColor}`}>
                <ShieldCheckIcon className={roleInfo?.color} size="xl" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <h2 data-ui="role-title" className="text-2xl font-bold text-white">{role.name}</h2>
                  <span data-ui="member-count-badge" className="text-3xl font-bold text-white">
                    {role.memberCount}
                  </span>
                </div>
                <p data-ui="role-description" className="text-gray-400">{role.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div data-ui="capabilities-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">Capacidades</h4>
                <div className="flex flex-wrap gap-2">
                  {(role.capabilities || []).map(cap => (
                    <span key={cap} data-ui="capability" className="px-3 py-1 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
              <div data-ui="restrictions-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3">Restricciones</h4>
                <div className="flex flex-wrap gap-2">
                  {(role.restrictions || []).length > 0 ? role.restrictions.map(rest => (
                    <span key={rest} data-ui="restriction" className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                      {rest}
                    </span>
                  )) : (
                    <span className="text-xs text-gray-500">Sin restricciones</span>
                  )}
                </div>
              </div>
            </div>

            <Button
              variant="primary"
              onClick={handleAddMember}
              leftIcon={<UserPlusIcon size="sm" />}
            >
              Añadir miembro
            </Button>
          </div>
        </div>

        <div data-ui="members-section">
          <h3 data-ui="members-title" className="text-lg font-semibold text-white mb-4">
            Miembros ({(role.members || []).length})
          </h3>

          {(role.members || []).length === 0 ? (
            <div data-ui="empty-members" className="bg-dark-card rounded-xl border border-white/5 p-8 text-center">
              <p className="text-gray-400 mb-4">No hay miembros con este rol.</p>
              <Button
                variant="primary"
                onClick={handleAddMember}
                leftIcon={<UserPlusIcon size="sm" />}
              >
                Añadir primer miembro
              </Button>
            </div>
          ) : (
            <div data-ui="members-list" className="space-y-3">
              {role.members.map(member => (
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
        </div>
      </div>
    </BackofficeLayout>
  );
}