import { useCallback, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'wouter';
import { atom, useAtomValue, useAtom } from 'jotai';
import { currentCompeticionAtom, userRoleAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { MemberDetail, RoleSlug } from '../../../types/api';
import { BackofficeLayout } from '../../../layouts/BackofficeLayout';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { CustomSelector } from '../../../components/ui/CustomSelector/CustomSelector';
import { getRoleSelectOptionsForAdmin } from './UsersPage.constants';
import { getBackofficeUsersBasePath, canManageMemberTarget, normalizeMemberRole } from './UsersPage.helpers';
import toast from 'react-hot-toast';

const memberDetailAtoms = {
  memberData: atom<{
    loading: boolean;
    data: MemberDetail | null;
    error: string | null;
  }>({
    loading: true,
    data: null,
    error: null,
  }),
  savingAtom: atom<boolean>(false),
  deletingAtom: atom<boolean>(false),
};

export function MemberDetailPage(): JSX.Element {
  const params = useParams<{ competicionSlug: string; usuarioId: string }>();
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const currentUserRole = useAtomValue(userRoleAtom);
  const [memberState, setMemberState] = useAtom(memberDetailAtoms.memberData);
  const [saving, setSaving] = useAtom(memberDetailAtoms.savingAtom);
  const [deleting, setDeleting] = useAtom(memberDetailAtoms.deletingAtom);
  const [, setLocation] = useLocation();

  const usuarioId = useMemo(() => parseInt(params.usuarioId, 10), [params.usuarioId]);
  const isRoot = currentUserRole === 'root';
  const isAdmin = currentUserRole === 'admin';

  useEffect(() => {
    if (!currentCompeticion?.id || !usuarioId) return;

    api.getCompetitionUser(currentCompeticion.id, usuarioId).then(result => {
      if (result.success && result.data) {
        setMemberState({ loading: false, data: result.data, error: null });
      } else {
        setMemberState({ loading: false, data: null, error: result.message || 'Error al cargar el miembro' });
      }
    });
  }, [currentCompeticion?.id, usuarioId, setMemberState]);

  const targetRole = useMemo(() => {
    if (!memberState.data) return null;
    return normalizeMemberRole(memberState.data.role);
  }, [memberState.data]);

  const canEditRole = useMemo(() => {
    if (!targetRole) return false;
    return canManageMemberTarget({ isRoot, isAdmin, targetRole });
  }, [isRoot, isAdmin, targetRole]);

  const canDelete = useMemo(() => {
    if (!targetRole) return false;
    return canManageMemberTarget({ isRoot, isAdmin, targetRole });
  }, [isRoot, isAdmin, targetRole]);

  const handleRoleChange = useCallback(async (newRole: RoleSlug) => {
    if (!currentCompeticion?.id || !usuarioId) return;

    if (!canEditRole) {
      toast.error('No tienes permisos para asignar este rol');
      return;
    }

    setSaving(true);
    const result = await api.updateCompetitionUserRole(currentCompeticion.id, usuarioId, newRole);
    setSaving(false);

    if (result.success && result.data) {
      setMemberState(prev => ({ ...prev, data: result.data ?? null }));
      toast.success('Rol actualizado correctamente');
    } else {
      toast.error(result.message || 'Error al actualizar el rol');
    }
  }, [currentCompeticion?.id, usuarioId, canEditRole, setSaving, setMemberState]);

  const handleDelete = useCallback(async () => {
    if (!currentCompeticion?.id || !usuarioId) return;

    const member = memberState.data;
    if (!member) return;

    if (!canDelete) {
      toast.error('No tienes permisos para eliminar este usuario');
      return;
    }

    if (!window.confirm('¿Estás seguro de que quieres eliminar este miembro? Esta acción no se puede deshacer.')) {
      return;
    }

    setDeleting(true);
    const result = await api.deleteCompetitionUser(currentCompeticion.id, usuarioId);
    setDeleting(false);

    if (result.success) {
      toast.success('Miembro eliminado correctamente');
      setLocation(getBackofficeUsersBasePath(params.competicionSlug));
    } else {
      toast.error(result.message || 'Error al eliminar el miembro');
    }
  }, [currentCompeticion?.id, usuarioId, memberState.data, canDelete, params.competicionSlug, setDeleting, setLocation]);

  const backPath = useMemo(() => getBackofficeUsersBasePath(params.competicionSlug), [params.competicionSlug]);

  if (memberState.loading) {
    return (
      <BackofficeLayout>
        <div data-ui="member-detail-loading" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-6 animate-pulse" data-ui="member-detail-loading-content">
            <div className="flex items-center gap-4 mb-6" data-ui="member-detail-loading-header">
              <div className="w-16 h-16 rounded-full bg-white/10" data-ui="member-detail-loading-avatar" />
              <div className="flex-1" data-ui="member-detail-loading-info">
                <div className="h-6 bg-white/10 rounded w-1/3 mb-2" data-ui="member-detail-loading-name" />
                <div className="h-4 bg-white/10 rounded w-1/2" data-ui="member-detail-loading-email" />
              </div>
            </div>
            <div className="space-y-3" data-ui="member-detail-loading-fields">
              <div className="h-4 bg-white/10 rounded w-1/4" data-ui="member-detail-loading-field-1" />
              <div className="h-4 bg-white/10 rounded w-1/3" data-ui="member-detail-loading-field-2" />
              <div className="h-4 bg-white/10 rounded w-1/4" data-ui="member-detail-loading-field-3" />
            </div>
          </div>
        </div>
      </BackofficeLayout>
    );
  }

  if (memberState.error || !memberState.data) {
    return (
      <BackofficeLayout>
        <div data-ui="member-detail-error" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-8 text-center" data-ui="member-detail-error-content">
            <p className="text-red-400 mb-4" data-ui="member-detail-error-message">{memberState.error || 'Miembro no encontrado'}</p>
            <Button
              variant="primary"
              onClick={() => setLocation(backPath)}
              data-ui="member-detail-error-back-btn"
            >
              Volver a miembros
            </Button>
          </div>
        </div>
      </BackofficeLayout>
    );
  }

  const { data: member } = memberState;

  return (
    <BackofficeLayout>
      <div data-ui="member-detail-page" className="max-w-4xl mx-auto">
        <div data-ui="member-header" className="bg-dark-card rounded-xl border border-white/5 overflow-hidden mb-6">
          <div className="p-6" data-ui="member-detail-card-body">
            <div className="flex items-center gap-4 mb-6" data-ui="member-detail-header">
              <div className="w-16 h-16 rounded-full bg-red-accent/20 flex items-center justify-center" data-ui="member-detail-avatar">
                <span className="text-2xl font-bold text-red-accent" data-ui="member-detail-avatar-letter">
                  {member.nombre.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1" data-ui="member-detail-identity">
                <h2 data-ui="member-name" className="text-2xl font-bold text-white mb-1">
                  {member.nombre}
                </h2>
                <p data-ui="member-email" className="text-gray-400">{member.email}</p>
              </div>
              <div data-ui="member-status-badge">
                {member.isPending ? (
                  <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-400" data-ui="member-status-pending">
                    Pendiente
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500/20 text-green-400" data-ui="member-status-active">
                    Confirmado
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6" data-ui="member-detail-grid">
              <div data-ui="member-info-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4" data-ui="member-info-heading">Información</h4>
                <dl className="space-y-3" data-ui="member-info-list">
                  <div data-ui="info-email">
                    <dt className="text-xs text-gray-500 mb-1" data-ui="info-email-label">Email</dt>
                    <dd className="text-sm text-white" data-ui="info-email-value">{member.email}</dd>
                  </div>
                  <div data-ui="info-role">
                    <dt className="text-xs text-gray-500 mb-1" data-ui="info-role-label">Rol</dt>
                    <dd className="text-sm text-white capitalize" data-ui="info-role-value">{member.role}</dd>
                  </div>
                  {member.invitedBy && (
                    <div data-ui="info-invited-by">
                      <dt className="text-xs text-gray-500 mb-1" data-ui="info-invited-by-label">Invitado por</dt>
                      <dd className="text-sm text-white" data-ui="info-invited-by-value">{member.invitedBy.nombre}</dd>
                    </div>
                  )}
                  {member.invitationSentAt && (
                    <div data-ui="info-invitation-date">
                      <dt className="text-xs text-gray-500 mb-1" data-ui="info-invitation-date-label">Fecha de invitación</dt>
                      <dd className="text-sm text-white" data-ui="info-invitation-date-value">
                        {new Date(member.invitationSentAt).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </dd>
                    </div>
                  )}
                  {member.invitationAcceptedAt && (
                    <div data-ui="info-accepted-date">
                      <dt className="text-xs text-gray-500 mb-1" data-ui="info-accepted-date-label">Fecha de aceptación</dt>
                      <dd className="text-sm text-white" data-ui="info-accepted-date-value">
                        {new Date(member.invitationAcceptedAt).toLocaleDateString('es-ES', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              <div data-ui="member-actions-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4" data-ui="member-actions-heading">Acciones</h4>

                {canEditRole ? (
                  <div data-ui="edit-role-form" className="mb-4">
                    <CustomSelector
                      label="Cambiar rol"
                      options={getRoleSelectOptionsForAdmin(currentUserRole as RoleSlug)}
                      value={member.role as RoleSlug}
                      onChange={(value) => value && handleRoleChange(value)}
                      disabled={saving}
                      data-ui="member-role-selector"
                    />
                  </div>
                ) : (
                  <div data-ui="member-no-edit-message" className="mb-4 p-3 rounded-lg bg-white/5 text-sm text-gray-400">
                    No tienes permisos para cambiar el rol de este usuario.
                  </div>
                )}

                {canDelete ? (
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    isLoading={deleting}
                    leftIcon={<Icon name="trash" />}
                    className="w-full"
                    data-ui="member-delete-btn"
                  >
                    Eliminar miembro
                  </Button>
                ) : (
                  <div data-ui="member-no-delete-message" className="p-3 rounded-lg bg-white/5 text-sm text-gray-400">
                    No tienes permisos para eliminar este usuario.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div data-ui="back-actions">
          <Button
            variant="ghost"
            onClick={() => setLocation(backPath)}
            leftIcon={<Icon name="arrow-left" />}
            data-ui="member-back-btn"
          >
            Volver a miembros
          </Button>
        </div>
      </div>
    </BackofficeLayout>
  );
}

export default MemberDetailPage;