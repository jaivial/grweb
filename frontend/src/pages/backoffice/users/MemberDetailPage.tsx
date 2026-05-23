import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { atom, useAtomValue, useAtom } from 'jotai';
import { currentCompeticionAtom, userRoleAtom } from '../../../stores/auth.atoms';
import { api } from '../../../api/client';
import type { MemberDetail, RoleSlug } from '../../../types/api';
import { BackofficeLayout } from '../BackofficeLayout';
import { Button } from '../../../components/ui/Button';
import { Icon } from '../../../components/ui/Icon';
import { ArrowLeftIcon, EditIcon, TrashIcon } from '../../../components/ui/Icon';
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
};

const ROLES: { value: RoleSlug; label: string }[] = [
  { value: 'root', label: 'Root' },
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
  { value: 'registrador', label: 'Registrador' },
];

export function MemberDetailPage(): JSX.Element {
  const params = useParams<{ competicionSlug: string; usuarioId: string }>();
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const currentUserRole = useAtomValue(userRoleAtom);
  const [memberState, setMemberState] = useAtom(memberDetailAtoms.memberData);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [, setLocation] = useLocation();

  const usuarioId = useMemo(() => parseInt(params.usuarioId, 10), [params.usuarioId]);

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

  const handleRoleChange = useCallback(async (newRole: RoleSlug) => {
    if (!currentCompeticion?.id || !usuarioId) return;

    const canChange = useMemo(() => {
      if (currentUserRole === 'root') return true;
      if (currentUserRole === 'admin' && newRole !== 'root' && newRole !== 'admin') return true;
      return false;
    }, [currentUserRole, newRole]);

    if (!canChange) {
      toast.error('No tienes permisos para asignar este rol');
      return;
    }

    setSaving(true);
    const result = await api.updateCompetitionUserRole(currentCompeticion.id, usuarioId, newRole);
    setSaving(false);

    if (result.success && result.data) {
      setMemberState(prev => ({ ...prev, data: result.data }));
      toast.success('Rol actualizado correctamente');
    } else {
      toast.error(result.message || 'Error al actualizar el rol');
    }
  }, [currentCompeticion?.id, usuarioId, currentUserRole, setMemberState]);

  const handleDelete = useCallback(async () => {
    if (!currentCompeticion?.id || !usuarioId) return;

    const member = memberState.data;
    if (!member) return;

    if (currentUserRole === 'admin' && (member.role === 'admin' || member.role === 'root')) {
      toast.error('No puedes eliminar administradores o usuarios root');
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
      setLocation(`/backoffice/${params.competicionSlug}/users?tab=members`);
    } else {
      toast.error(result.message || 'Error al eliminar el miembro');
    }
  }, [currentCompeticion?.id, usuarioId, memberState.data, currentUserRole, params.competicionSlug, setMemberState, setLocation]);

  const canEditRole = useMemo(() => {
    if (currentUserRole === 'root') return true;
    if (currentUserRole === 'admin') {
      const memberRole = memberState.data?.role;
      return memberRole !== 'root' && memberRole !== 'admin';
    }
    return false;
  }, [currentUserRole, memberState.data?.role]);

  const canDelete = useMemo(() => {
    if (currentUserRole === 'root') return true;
    if (currentUserRole === 'admin') {
      const memberRole = memberState.data?.role;
      return memberRole !== 'root' && memberRole !== 'admin';
    }
    return false;
  }, [currentUserRole, memberState.data?.role]);

  const breadcrumbs = useMemo(() => [
    { label: 'Miembros', href: `/backoffice/${params.competicionSlug}/users` },
    { label: memberState.data?.nombre || 'Cargando...' },
  ], [params.competicionSlug, memberState.data?.nombre]);

  if (memberState.loading) {
    return (
      <BackofficeLayout breadcrumbs={breadcrumbs}>
        <div data-ui="member-detail-loading" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-6 animate-pulse">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-white/10" />
              <div className="flex-1">
                <div className="h-6 bg-white/10 rounded w-1/3 mb-2" />
                <div className="h-4 bg-white/10 rounded w-1/2" />
              </div>
            </div>
            <div className="space-y-3">
              <div className="h-4 bg-white/10 rounded w-1/4" />
              <div className="h-4 bg-white/10 rounded w-1/3" />
              <div className="h-4 bg-white/10 rounded w-1/4" />
            </div>
          </div>
        </div>
      </BackofficeLayout>
    );
  }

  if (memberState.error || !memberState.data) {
    return (
      <BackofficeLayout breadcrumbs={breadcrumbs} title="Error">
        <div data-ui="member-detail-error" className="max-w-4xl mx-auto">
          <div className="bg-dark-card rounded-xl p-8 text-center">
            <p className="text-red-400 mb-4">{memberState.error || 'Miembro no encontrado'}</p>
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

  const { data: member } = memberState;

  return (
    <BackofficeLayout breadcrumbs={breadcrumbs} title={member.nombre}>
      <div data-ui="member-detail-page" className="max-w-4xl mx-auto">
        <div data-ui="member-header" className="bg-dark-card rounded-xl border border-white/5 overflow-hidden mb-6">
          <div className="p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full bg-red-accent/20 flex items-center justify-center">
                <span className="text-2xl font-bold text-red-accent">
                  {member.nombre.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1">
                <h2 data-ui="member-name" className="text-2xl font-bold text-white mb-1">
                  {member.nombre}
                </h2>
                <p data-ui="member-email" className="text-gray-400">{member.email}</p>
              </div>
              <div data-ui="member-status-badge">
                {member.isPending ? (
                  <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-yellow-500/20 text-yellow-400">
                    Pendiente
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-green-500/20 text-green-400">
                    Activo
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div data-ui="member-info-section">
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">Información</h4>
                <dl className="space-y-3">
                  <div data-ui="info-email">
                    <dt className="text-xs text-gray-500 mb-1">Email</dt>
                    <dd className="text-sm text-white">{member.email}</dd>
                  </div>
                  <div data-ui="info-role">
                    <dt className="text-xs text-gray-500 mb-1">Rol</dt>
                    <dd className="text-sm text-white capitalize">{member.role}</dd>
                  </div>
                  {member.invitedBy && (
                    <div data-ui="info-invited-by">
                      <dt className="text-xs text-gray-500 mb-1">Invitado por</dt>
                      <dd className="text-sm text-white">{member.invitedBy.nombre}</dd>
                    </div>
                  )}
                  {member.invitationSentAt && (
                    <div data-ui="info-invitation-date">
                      <dt className="text-xs text-gray-500 mb-1">Fecha de invitación</dt>
                      <dd className="text-sm text-white">
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
                      <dt className="text-xs text-gray-500 mb-1">Fecha de aceptación</dt>
                      <dd className="text-sm text-white">
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
                <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wider mb-4">Acciones</h4>

                {canEditRole ? (
                  <div data-ui="edit-role-form" className="mb-4">
                    <label className="block text-xs text-gray-500 mb-2">Cambiar rol</label>
                    <select
                      data-ui="role-select"
                      value={member.role}
                      onChange={(e) => handleRoleChange(e.target.value as RoleSlug)}
                      disabled={saving}
                      className="w-full px-4 py-2.5 rounded-lg bg-dark-base border border-white/10
                        text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-accent
                        disabled:opacity-50"
                    >
                      {ROLES.filter(r => {
                        if (currentUserRole === 'admin') {
                          return r.value !== 'root' && r.value !== 'admin';
                        }
                        return true;
                      }).map(role => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div data-ui="no-edit-role" className="mb-4 p-3 rounded-lg bg-white/5 text-sm text-gray-400">
                    No tienes permisos para cambiar el rol de este usuario.
                  </div>
                )}

                {canDelete ? (
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    isLoading={deleting}
                    leftIcon={<TrashIcon size="sm" />}
                    className="w-full"
                  >
                    Eliminar miembro
                  </Button>
                ) : (
                  <div data-ui="no-delete" className="p-3 rounded-lg bg-white/5 text-sm text-gray-400">
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
            onClick={() => setLocation(`/backoffice/${params.competicionSlug}/users`)}
            leftIcon={<ArrowLeftIcon size="sm" />}
          >
            Volver a miembros
          </Button>
        </div>
      </div>
    </BackofficeLayout>
  );
}