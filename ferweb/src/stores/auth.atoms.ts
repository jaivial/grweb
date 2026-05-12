import { atom } from 'jotai';
import type { Usuario, CompeticionAssignment } from '../types/api';

// Auth atoms
export const userAtom = atom<Usuario | null>(null);
export const isAuthenticatedAtom = atom((get) => get(userAtom) !== null);
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

// Check if user has a specific permission
export const hasPermissionAtom = atom((get) => {
  const user = get(userAtom);
  const currentCompeticion = get(currentCompeticionAtom);
  
  return (permission: string) => {
    if (!user) return false;
    if (user.isSuperadmin) return true;
    
    const competicionId = currentCompeticion?.id;
    if (!competicionId) return false;
    
    // Check role-based permissions
    if (currentCompeticion?.role === 'admin') {
      const adminPerms = [
        'view_dashboard', 'view_inscriptos', 'manage_inscriptos',
        'view_stats', 'export_data', 'manage_config', 'manage_raffle'
      ];
      return adminPerms.includes(permission.replace('comp:', '').replace(`${competicionId}:`, ''));
    }
    
    if (currentCompeticion?.role === 'operator') {
      const operatorPerms = ['view_inscriptos', 'do_checkin', 'sell_tickets'];
      return operatorPerms.includes(permission.replace('comp:', '').replace(`${competicionId}:`, ''));
    }
    
    return false;
  };
});

// Derived atoms
export const userNameAtom = atom((get) => get(userAtom)?.nombre ?? 'Usuario');
export const userEmailAtom = atom((get) => get(userAtom)?.email ?? '');
export const userRoleAtom = atom((get) => get(currentCompeticionAtom)?.role ?? null);
