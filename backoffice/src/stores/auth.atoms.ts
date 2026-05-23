import { atom } from 'jotai';
import type { Usuario, CompeticionAssignment, UserRole } from '../types/api';

// Auth atoms
export const userAtom = atom<Usuario | null>(null);
export const isAuthenticatedAtom = atom((get) => get(userAtom) !== null);
export const isRootAtom = atom((get) => get(userAtom)?.isRoot ?? get(userAtom)?.isSuperadmin ?? false);
export const isSuperadminAtom = atom((get) => get(userAtom)?.isSuperadmin ?? false);
export const isLoadingAuthAtom = atom<boolean>(true);

// Competicion selection atoms
export const currentCompeticionIdAtom = atom<number | null>(null);
export const currentCompeticionAtom = atom<CompeticionAssignment | null>((get) => {
  const user = get(userAtom);
  const competicionId = get(currentCompeticionIdAtom);
  
  if (!user?.competiciones) return null;
  
  return user.competiciones.find(c => c.id === competicionId) ?? user.competiciones[0] ?? null;
});

// User's competitions
export const userCompeticionesAtom = atom<CompeticionAssignment[]>((get) => {
  const user = get(userAtom);
  return user?.competiciones ?? [];
});

// UI atoms
export const sidebarOpenAtom = atom<boolean>(true);
export const toastsAtom = atom<Array<{ id: string; type: 'success' | 'error' | 'info'; message: string }>>([]);

// Permission helpers
export const permissionsAtom = atom<string[]>([]);

/**
 * Role-based permission mapping.
 * Each role maps to the set of backoffice areas they can access.
 */
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  root: [
    'view_dashboard', 'view_inscriptos', 'manage_inscriptos',
    'view_stats', 'export_data', 'manage_config', 'manage_raffle',
    'do_checkin', 'sell_tickets', 'view_horarios', 'manage_horarios',
    'view_participantes', 'view_qr', 'view_users', 'manage_users',
    // System permissions
    'system:manage_users', 'system:manage_roles', 'system:config',
  ],
  admin: [
    'view_dashboard', 'view_inscriptos', 'manage_inscriptos',
    'view_stats', 'export_data', 'manage_config', 'manage_raffle',
    'do_checkin', 'sell_tickets', 'view_horarios', 'manage_horarios',
    'view_participantes', 'view_qr', 'view_users', 'manage_users',
  ],
  staff: [
    'view_dashboard', 'view_inscriptos', 'manage_inscriptos',
    'view_stats', 'export_data',
    'view_raffle', 'manage_raffle',
    'do_checkin', 'sell_tickets',
    'view_horarios', 'manage_horarios',
    'view_participantes', 'view_qr',
  ],
  registrador: [
    'do_checkin',
    'view_qr',
  ],
  manager: [
    'view_dashboard', 'view_inscriptos', 'manage_inscriptos',
    'view_stats', 'export_data',
    'view_raffle', 'manage_raffle',
    'do_checkin', 'sell_tickets',
    'view_horarios', 'manage_horarios',
    'view_participantes', 'view_qr',
  ],
  empleado: [
    'view_inscriptos',
    'do_checkin',
    'sell_tickets',
    'view_horarios',
    'view_qr',
  ],
  checkin: [
    'do_checkin',
    'view_qr',
  ],
  operator: [
    'view_dashboard', 'view_inscriptos', 'manage_inscriptos',
    'view_stats', 'export_data',
    'view_raffle', 'manage_raffle',
    'do_checkin', 'sell_tickets',
    'view_horarios', 'manage_horarios',
    'view_participantes', 'view_qr',
  ],
};

/**
 * Normalize legacy 'operator' role to 'empleado'
 */
function normalizeRole(role: string): UserRole {
  if (role === 'operator') return 'staff';
  if (role === 'manager') return 'staff';
  if (role === 'empleado') return 'staff';
  if (role === 'checkin') return 'registrador';
  return role as UserRole;
}

/**
 * Get permissions for a given role
 */
export function getPermissionsForRole(role: string): string[] {
  const normalized = normalizeRole(role);
  return ROLE_PERMISSIONS[normalized] ?? [];
}

/**
 * Check if a specific role has a given permission
 */
export function roleHasPermission(role: string, permission: string): boolean {
  const perms = getPermissionsForRole(role);
  return perms.includes(permission);
}

// Check if user has a specific permission in the current competition
export const hasPermissionAtom = atom((get) => {
  const user = get(userAtom);
  const currentCompeticion = get(currentCompeticionAtom);
  
  return (permission: string) => {
    if (!user) return false;
    if (user.isRoot || user.isSuperadmin) return true;
    
    const role = currentCompeticion?.role;
    if (!role) return false;
    
    return roleHasPermission(role, permission);
  };
});

export const currentCompeticionTipoAtom = atom((get) => {
  const current = get(currentCompeticionAtom);
  return current?.tipo ?? 'grcup';
});

export const isCurrentFerAtom = atom((get) => get(currentCompeticionTipoAtom) === 'fer');

export const userNameAtom = atom((get) => get(userAtom)?.nombre ?? 'Usuario');
export const userEmailAtom = atom((get) => get(userAtom)?.email ?? '');
export const userRoleAtom = atom((get) => {
  const role = get(currentCompeticionAtom)?.role ?? null;
  return role ? normalizeRole(role) : null;
});
