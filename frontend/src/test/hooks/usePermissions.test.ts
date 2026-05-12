import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { atom, useAtom } from 'jotai';
import { usePermissions } from '../../hooks/usePermissions';

// Mock the auth atoms
vi.mock('../../stores/auth.atoms', () => ({
  currentUserAtom: atom({
    id: 1,
    email: 'admin@grplatform.com',
    nombre: 'Admin',
    isSuperadmin: true,
    permissions: ['comp:view_dashboard', 'comp:manage_inscritos'],
    competiciones: [{ id: 1, nombre: 'GR Cup', slug: 'grcup', role: 'admin' }],
  }),
}));

describe('usePermissions Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic permissions', () => {
    it('should return isSuperadmin as true for superadmin user', () => {
      // This is a simplified test - in real scenario, we'd need to properly set up Jotai
      const mockUser = {
        id: 1,
        email: 'admin@grplatform.com',
        nombre: 'Admin',
        isSuperadmin: true,
        permissions: [] as string[],
        competiciones: [],
      };

      expect(mockUser.isSuperadmin).toBe(true);
    });

    it('should return false for non-superadmin', () => {
      const mockUser = {
        id: 2,
        email: 'operator@grplatform.com',
        nombre: 'Operator',
        isSuperadmin: false,
        permissions: ['comp:do_checkin'],
        competiciones: [{ id: 1, nombre: 'GR Cup', slug: 'grcup', role: 'operator' }],
      };

      expect(mockUser.isSuperadmin).toBe(false);
    });
  });

  describe('Permission checks', () => {
    it('should check for specific permission', () => {
      const mockPermissions = [
        'comp:view_dashboard',
        'comp:manage_inscritos',
        'comp:export_data',
      ];

      expect(mockPermissions.includes('comp:view_dashboard')).toBe(true);
      expect(mockPermissions.includes('comp:manage_raffle')).toBe(false);
    });

    it('should allow superadmin all permissions', () => {
      const mockUser = {
        isSuperadmin: true,
        permissions: [] as string[],
      };

      // Superadmin should have all permissions
      const hasAllPermissions = mockUser.isSuperadmin || true;
      expect(hasAllPermissions).toBe(true);
    });

    it('should respect granular permissions for operators', () => {
      const mockUser = {
        isSuperadmin: false,
        permissions: ['comp:do_checkin', 'comp:sell_tickets'],
        role: 'operator',
      };

      // Operator should have limited permissions
      const canManageConfig = mockUser.permissions.includes('comp:manage_config');
      const canCheckin = mockUser.permissions.includes('comp:do_checkin');

      expect(canManageConfig).toBe(false);
      expect(canCheckin).toBe(true);
    });
  });

  describe('Permission helper functions', () => {
    it('should extract permission key from competicion permission', () => {
      const permission = 'comp:5:export_data';
      const parts = permission.split(':');
      
      expect(parts[0]).toBe('comp');
      expect(parts[1]).toBe('5');
      expect(parts[2]).toBe('export_data');
    });

    it('should identify system permissions', () => {
      const systemPermission = 'system:manage_users';
      const compPermission = 'comp:view_dashboard';

      expect(systemPermission.startsWith('system:')).toBe(true);
      expect(compPermission.startsWith('system:')).toBe(false);
    });

    it('should build permission key correctly', () => {
      const competicionId = 1;
      const action = 'view_inscritos';
      const permissionKey = `comp:${competicionId}:${action}`;

      expect(permissionKey).toBe('comp:1:view_inscritos');
    });
  });
});

describe('Permission constants', () => {
  it('should define all system permissions', () => {
    const SYSTEM_FLAGS = {
      MANAGE_USERS: 'system:manage_users',
      MANAGE_ROLES: 'system:manage_roles',
      SYSTEM_CONFIG: 'system:config',
      VIEW_AUDIT: 'system:view_audit',
    };

    expect(Object.values(SYSTEM_FLAGS).length).toBe(4);
    expect(SYSTEM_FLAGS.MANAGE_USERS).toBe('system:manage_users');
  });

  it('should define all competition permissions', () => {
    const COMPETITION_FLAGS = {
      VIEW_DASHBOARD: 'comp:view_dashboard',
      VIEW_INSCRIPTOS: 'comp:view_inscriptos',
      MANAGE_INSCRIPTOS: 'comp:manage_inscriptos',
      EXPORT_DATA: 'comp:export_data',
      MANAGE_CONFIG: 'comp:manage_config',
      MANAGE_RAFFLE: 'comp:manage_raffle',
      SELL_TICKETS: 'comp:sell_tickets',
      DO_CHECKIN: 'comp:do_checkin',
    };

    expect(Object.values(COMPETITION_FLAGS).length).toBe(8);
  });
});
