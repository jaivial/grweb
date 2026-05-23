import type { CompetitionMember, UserRole, MemberDetail, CompetitionUsersResponse } from '../../../types/api';
import { MEMBER_ROLE_ORDER } from './UsersPage.constants';

/**
 * Normalize a MemberDetail from the paginated API response to CompetitionMember
 * for backward compatibility with the existing atoms and UI.
 */
export function normalizeMemberDetail(item: MemberDetail): CompetitionMember {
  return {
    id: item.id,
    usuarioId: item.id, // stable identifier
    email: item.email,
    nombre: item.nombre,
    role: item.role,
    invitedByEmail: item.invitedBy?.email ?? null,
    invitedAt: item.invitationSentAt ?? null,
    invitationAccepted: !item.isPending,
    createdAt: item.invitationAcceptedAt ?? item.invitationSentAt ?? new Date().toISOString(),
  };
}

/**
 * Normalize the paginated CompetitionUsersResponse to CompetitionMember[]
 */
export function normalizeCompetitionUsersResponse(response: CompetitionUsersResponse): CompetitionMember[] {
  return response.items.map(normalizeMemberDetail);
}

export function normalizeMemberRole(role: string): UserRole {
  if (role === 'manager' || role === 'empleado' || role === 'operator') return 'staff';
  if (role === 'checkin') return 'registrador';
  return role as UserRole;
}

export function groupMembersByRole(members: CompetitionMember[]): Record<string, CompetitionMember[]> {
  return members.reduce<Record<string, CompetitionMember[]>>((groups, member) => {
    const role = normalizeMemberRole(member.role);
    groups[role] = [...(groups[role] ?? []), member];
    return groups;
  }, {});
}

export function sortMembers(members: CompetitionMember[]): CompetitionMember[] {
  return [...members].sort((a, b) => {
    const roleA = MEMBER_ROLE_ORDER.indexOf(normalizeMemberRole(a.role));
    const roleB = MEMBER_ROLE_ORDER.indexOf(normalizeMemberRole(b.role));
    if (roleA !== roleB) return roleA - roleB;
    return a.nombre.localeCompare(b.nombre, 'es');
  });
}

export function filterMembersByRole(members: CompetitionMember[], role: UserRole): CompetitionMember[] {
  return sortMembers(members.filter((member) => normalizeMemberRole(member.role) === role));
}

export function formatInviteState(member: CompetitionMember): string {
  if (member.invitationAccepted) return 'Activo';
  if (member.invitedAt) return 'Invitado';
  return 'Miembro';
}

export function canEditMemberRole(params: { isRoot: boolean; targetRole: UserRole }): boolean {
  if (params.isRoot) return true;
  return params.targetRole !== 'root' && params.targetRole !== 'admin';
}

export function canManageMemberTarget(params: { isRoot: boolean; isAdmin: boolean; targetRole: UserRole }): boolean {
  if (params.isRoot) return true;
  if (params.isAdmin) {
    return params.targetRole !== 'root' && params.targetRole !== 'admin';
  }
  return false;
}

/**
 * Get the backoffice users base path.
 * Returns `/backoffice/{slug}/users` if valid slug exists, or `/backoffice/users` if not.
 * Treats undefined, empty string, and literal 'undefined' as no slug.
 */
export function getBackofficeUsersBasePath(slug: string | undefined): string {
  if (!slug || slug === 'undefined' || slug === '') {
    return '/backoffice/users';
  }
  return `/backoffice/${slug}/users`;
}

/**
 * Build a backoffice users path with optional sub-path.
 * @param slug - The competition slug (or undefined/empty for slugless)
 * @param subPath - Optional sub-path like 'new', 'roles/staff', 'members/123'
 */
export function buildBackofficeUsersPath(slug: string | undefined, subPath?: string): string {
  const base = getBackofficeUsersBasePath(slug);
  if (!subPath) return base;
  return `${base}/${subPath}`;
}

/**
 * Resolve the backoffice users base path using route-aware logic.
 * Prefers the current route context over currentCompeticion.slug to prevent
 * slugless→slugged regressions.
 * @param currentPath - The current location path (e.g. from useLocation())
 * @param routeSlug - The slug from route params (competicionSlug), if present
 */
export function resolveBackofficeUsersBasePath(currentPath: string, routeSlug?: string): string {
  if (routeSlug && routeSlug !== 'undefined' && routeSlug !== '') {
    return `/backoffice/${routeSlug}/users`;
  }
  if (currentPath.startsWith('/backoffice/users') || currentPath.startsWith('/backoffice/members')) {
    return '/backoffice/users';
  }
  return '/backoffice/users';
}
