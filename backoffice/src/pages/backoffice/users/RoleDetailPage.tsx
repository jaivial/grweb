import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { atom, useAtomValue, useAtom } from 'jotai';
import { currentCompeticionAtom, userRoleAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { RoleWithMembers, RoleSlug } from '../../../types/api';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { getBackofficeUsersBasePath, buildBackofficeUsersPath, canEditMemberRole } from './UsersPage.helpers';
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
  const currentUserRole = useAtomValue(userRoleAtom);
  const [roleState, setRoleState] = useAtom(roleDetailAtoms.roleData);
  const [, setLocation] = useLocation();

  const isRoot = currentUserRole === 'root';
  const roleSlug = params.roleSlug as RoleSlug;
  const canAddThisRole = useMemo(() => {
    if (!isRoot && roleSlug) {
      return canEditMemberRole({ isRoot, targetRole: roleSlug });
    }
    return isRoot;
  }, [isRoot, roleSlug]);

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
    if (!canAddThisRole) {
      toast.error('No tienes permisos para añadir miembros con este rol');
      return;
    }
    const basePath = buildBackofficeUsersPath(params.competicionSlug);
    setLocation(`${basePath}/new?role=${params.roleSlug}`);
  }, [canAddThisRole, params.competicionSlug, params.roleSlug, setLocation]);

  const handleViewMember = useCallback((memberId: number) => {
    const basePath = buildBackofficeUsersPath(params.competicionSlug);
    setLocation(`${basePath}/members/${memberId}`);
  }, [params.competicionSlug, setLocation]);

  const roleInfo = ROLE_INFO[params.roleSlug as RoleSlug];
  const backPath = useMemo(() => getBackofficeUsersBasePath(params.competicionSlug), [params.competicionSlug]);

  if (roleState.loading) {
    return (
      <BackofficeLayout>
        <div data-ui="role-detail-loading" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-6 mb-6 animate-pulse" data-ui="role-detail-loading-content">
            <div className="flex items-start gap-4 mb-6" data-ui="role-detail-loading-header">
              <div className="w-16 h-16 rounded-xl bg-white/10" data-ui="role-detail-loading-icon" />
              <div className="flex-1" data-ui="role-detail-loading-info">
                <div className="h-6 bg-white/10 rounded w-1/4 mb-2" data-ui="role-detail-loading-title" />
                <div className="h-4 bg-white/10 rounded w-2/3" data-ui="role-detail-loading-desc" />
              </div>
            </div>
            <div className="h-4 bg-white/10 rounded w-1/3 mb-4" data-ui="role-detail-loading-count" />
            <div className="flex gap-2" data-ui="role-detail-loading-caps">
              <div className="h-8 bg-white/10 rounded w-24" data-ui="role-detail-loading-cap-1" />
              <div className="h-8 bg-white/10 rounded w-24" data-ui="role-detail-loading-cap-2" />
            </div>
          </div>
        </div>
      </BackofficeLayout>
    );
  }

  if (roleState.error || !roleState.data) {
    return (
      <BackofficeLayout>
        <div data-ui="role-detail-error" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-8 text-center" data-ui="role-detail-error-content">
            <p className="text-red-400 mb-4" data-ui="role-detail-error-message">{roleState.error || 'Rol no encontrado'}</p>
            <Button
              variant="primary"
              onClick={() => setLocation(backPath)}
              data-ui="role-detail-error-back-btn"
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
    <BackofficeLayout>
      <div data-ui="role-detail-page" className="max-w-4xl mx-auto">
        <div data-ui="role-header" className="bg-dark-card rounded-xl border border-white/5 overflow-hidden mb-6">
          <div className="p-6" data-ui="role-detail-card-body">
            <div className="flex items-start gap-4 mb-6" data-ui="role-detail-header">
              <div className={`p-4 rounded-xl ${roleInfo?.bgColor}`} data-ui="role-detail-icon-wrapper">
                <Icon name="shield" className={roleInfo?.color} size="lg" data-ui="role-detail-icon" />
              </div>
              <div className="flex-1" data-ui="role-detail-identity">
                <div className="flex items-center justify-between mb-2" data-ui="role-detail-title-row">
                  <h2 data-ui="role-title" className="text-2xl font-bold text-white">{role.name}</h2>
                  <span data-ui="member-count-badge" className="text-3xl font-bold text-white">
                    {role.memberCount}
                  </span>
                </div>
                <p data-ui="role-description" className="text-gray-400">{role.description}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6" data-ui="role-detail-capabilities">
              <div data-ui="capabilities-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3" data-ui="capabilities-heading">Capacidades</h4>
                <div className="flex flex-wrap gap-2" data-ui="capabilities-list">
                  {(role.capabilities || []).map((cap, idx) => (
                    <span key={cap} data-ui={`capability-${roleSlug}-${idx}`} className="px-3 py-1 rounded-lg text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
              <div data-ui="restrictions-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-3" data-ui="restrictions-heading">Restricciones</h4>
                <div className="flex flex-wrap gap-2" data-ui="restrictions-list">
                  {(role.restrictions || []).length > 0 ? role.restrictions.map((rest, idx) => (
                    <span key={rest} data-ui={`restriction-${roleSlug}-${idx}`} className="px-3 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                      {rest}
                    </span>
                  )) : (
                    <span className="text-xs text-gray-500" data-ui="no-restrictions">Sin restricciones</span>
                  )}
                </div>
              </div>
            </div>

            {canAddThisRole ? (
              <Button
                variant="primary"
                onClick={handleAddMember}
                leftIcon={<Icon name="users" />}
                data-ui="add-member-btn"
              >
                Añadir miembro
              </Button>
            ) : (
              <div className="p-3 rounded-lg bg-white/5 text-sm text-gray-400" data-ui="no-add-member-message">
                No tienes permisos para añadir miembros con este rol.
              </div>
            )}
          </div>
        </div>

        <div data-ui="members-section">
          <h3 data-ui="members-title" className="text-lg font-semibold text-white mb-4">
            Miembros ({role.members?.length || 0})
          </h3>

          {(!role.members || role.members.length === 0) ? (
            <div data-ui="empty-members" className="bg-dark-card rounded-xl border border-white/5 p-8 text-center">
              <p className="text-gray-400 mb-4" data-ui="empty-members-message">No hay miembros con este rol.</p>
              {canAddThisRole ? (
                <Button
                  variant="primary"
                  onClick={handleAddMember}
                  leftIcon={<Icon name="users" />}
                  data-ui="add-first-member-btn"
                >
                  Añadir primer miembro
                </Button>
              ) : (
                <div className="p-3 rounded-lg bg-white/5 text-sm text-gray-400 inline-block" data-ui="empty-no-add-message">
                  No tienes permisos para añadir miembros.
                </div>
              )}
            </div>
          ) : (
            <div data-ui="members-list" className="space-y-3">
              {role.members.map(member => (
                <div
                  key={member.id}
                  data-ui={`member-row-${member.id}`}
                  data-member-id={member.id}
                  className="bg-dark-card rounded-lg border border-white/5 overflow-hidden hover:border-white/10 transition-all duration-150"
                >
                  <div className="flex items-center gap-4 p-4" data-ui={`member-row-content-${member.id}`}>
                    <div data-ui={`member-avatar-${member.id}`} className="w-10 h-10 rounded-full bg-red-accent/20 flex items-center justify-center">
                      <span className="text-sm font-medium text-red-accent" data-ui={`member-avatar-letter-${member.id}`}>
                        {(member.nombre || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div data-ui={`member-info-${member.id}`} className="flex-1 min-w-0">
                      <div data-ui={`member-name-${member.id}`} className="text-sm font-medium text-white truncate">
                        {member.nombre}
                      </div>
                      <div data-ui={`member-email-${member.id}`} className="text-xs text-gray-400 truncate">
                        {member.email}
                      </div>
                    </div>
                    <div data-ui={`member-status-${member.id}`}>
                      {member.isPending ? (
                        <span className="px-2.5 py-1 rounded text-xs font-medium bg-yellow-500/20 text-yellow-400" data-ui={`member-status-badge-pending-${member.id}`}>
                          Pendiente
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded text-xs font-medium bg-green-500/20 text-green-400" data-ui={`member-status-badge-active-${member.id}`}>
                          Confirmado
                        </span>
                      )}
                    </div>
                    <button
                      data-ui={`view-member-btn-${member.id}`}
                      onClick={() => handleViewMember(member.id)}
                      className="p-2 rounded-lg hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Ver miembro"
                      type="button"
                    >
                      <Icon name="chevron-right" className="text-gray-400" data-ui={`view-member-icon-${member.id}`} />
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

export default RoleDetailPage;