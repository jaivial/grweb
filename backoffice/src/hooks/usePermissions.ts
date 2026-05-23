import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { userAtom, currentCompeticionAtom, hasPermissionAtom } from '../stores/auth.atoms';

export function usePermissions() {
  const user = useAtomValue(userAtom);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);

  return {
    isRoot: user?.isRoot ?? user?.isSuperadmin ?? false,
    isSuperadmin: user?.isSuperadmin ?? false,
    isAdmin: currentCompeticion?.role === 'admin',
    isOperator: currentCompeticion?.role === 'staff' || currentCompeticion?.role === 'empleado',
    currentCompeticion,
    can: hasPermission,
    
    // Common permission helpers
    canViewDashboard: hasPermission('view_dashboard'),
    canViewInscritos: hasPermission('view_inscriptos'),
    canManageInscritos: hasPermission('manage_inscriptos'),
    canViewStats: hasPermission('view_stats'),
    canExportData: hasPermission('export_data'),
    canManageConfig: hasPermission('manage_config'),
    canManageRaffle: hasPermission('manage_raffle'),
    canViewUsers: hasPermission('view_users'),
    canManageUsers: hasPermission('manage_users'),
    canDoCheckin: hasPermission('do_checkin'),
    canSellTickets: hasPermission('sell_tickets'),
  };
}

export function useRequirePermission(permission: string) {
  const { can, isSuperadmin } = usePermissions();
  
  return isSuperadmin || can(permission);
}
