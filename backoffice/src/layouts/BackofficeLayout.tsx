import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import type { JSX } from 'react';
import { useLocation } from 'wouter';
import { useAtomValue } from 'jotai';
import { userCompeticionesAtom, currentCompeticionAtom, currentCompeticionIdAtom, isCurrentFerAtom, hasPermissionAtom, isRootAtom } from '../stores/auth.atoms';
import { useCompeticionSlug } from '../hooks/useCompeticionSlug';
import { useAuth } from '../hooks/useAuth';

interface BackofficeLayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  subPath: string;
  label: string;
  icon: string;
  ferOnly?: boolean;
  grcupOnly?: boolean;
  requiredPermission?: string;
  moduleKey?: string;
}

const allNavItems: NavItem[] = [
  { subPath: '', label: 'Inicio', icon: 'home', requiredPermission: 'view_dashboard', moduleKey: 'dashboard' },
  { subPath: 'inscripciones', label: 'Inscripciones', icon: 'users', requiredPermission: 'view_inscriptos', moduleKey: 'inscripciones' },
  { subPath: 'qr-reader', label: 'Lector QR', icon: 'qrcode', requiredPermission: 'view_qr', moduleKey: 'qr-reader' },
  { subPath: 'judge-table', label: 'Mesa de Jueces', icon: 'judge', ferOnly: true, requiredPermission: 'view_dashboard', moduleKey: 'judge-table' },
  { subPath: 'participantes', label: 'Participantes', icon: 'ticket', grcupOnly: true, requiredPermission: 'view_participantes', moduleKey: 'participantes' },
  { subPath: 'sorteo', label: 'Sorteo', icon: 'dice', grcupOnly: true, requiredPermission: 'manage_raffle', moduleKey: 'sorteo' },
  { subPath: 'cupones', label: 'Cupones', icon: 'coupon', requiredPermission: 'manage_config', moduleKey: 'cupones' },
  { subPath: 'horarios', label: 'Horarios', icon: 'calendar', requiredPermission: 'view_horarios', moduleKey: 'horarios' },
  { subPath: 'users', label: 'Miembros', icon: 'members', requiredPermission: 'view_users', moduleKey: 'users' },
  { subPath: 'configuracion', label: 'Configuracion', icon: 'settings', requiredPermission: 'manage_config', moduleKey: 'configuracion' },
];

function NavIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-home">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'users':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-users">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'members':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-members">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 18.72a9.1 9.1 0 003.75.78 3 3 0 00-3-3h-.13M18 18.72A5.98 5.98 0 0012 15a5.98 5.98 0 00-6 3.72m12 0A8.96 8.96 0 0112 21a8.96 8.96 0 01-6-2.28m0 0A3 3 0 002.25 19.5a9.1 9.1 0 003.75-.78M15 9.75A3 3 0 1112 6.75a3 3 0 013 3zm6 1.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      );
    case 'ticket':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-ticket">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      );
    case 'dice':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-dice">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'coupon':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-coupon">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 15L15 9m-5.5.5h.01m5 5h.01M4 7a2 2 0 012-2h3.6a2 2 0 011.4.6l7.4 7.4a2 2 0 010 2.8l-3.6 3.6a2 2 0 01-2.8 0L4.6 12A2 2 0 014 10.6V7z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-calendar">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-settings">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'judge':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-judge">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
        </svg>
      );
    case 'qrcode':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-qrcode">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm14 3h.01M17 17h.01M14 14h3v3h-3v-3zm3 3h3v3h-3v-3z" />
        </svg>
      );
    case 'workspaces':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="navicon-svg-workspaces">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
        </svg>
      );
    default:
      return null;
  }
}

function CompeticionSelector() {
  const competiciones = useAtomValue(userCompeticionesAtom);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const { buildPath, competicionSlug } = useCompeticionSlug();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [currentPath] = useLocation();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // When selecting a different competition, navigate to the same sub-page
  // under the new competition's slug
  const handleSelect = useCallback((compSlug: string) => {
    // Extract current sub-path after the slug segment
    const slugPrefix = `/backoffice/${competicionSlug}`;
    let subPath = '';
    if (currentPath.startsWith(slugPrefix)) {
      subPath = currentPath.slice(slugPrefix.length);
      if (subPath.startsWith('/')) subPath = subPath.slice(1);
    }
    const newPath = `/backoffice/${compSlug}${subPath ? '/' + subPath : ''}`;
    setLocation(newPath);
    setIsOpen(false);
  }, [competicionSlug, currentPath, setLocation]);

  if (competiciones.length === 0) return null;

  const single = competiciones.length === 1;

  // Role display labels (Spanish)
  const roleLabels: Record<string, string> = {
    root: 'Root',
    admin: 'Admin',
    staff: 'Staff',
    registrador: 'Registrador',
    manager: 'Staff',
    empleado: 'Staff',
    checkin: 'Registrador',
    operator: 'Staff',
  };

  return (
    <div className="px-3 py-2 border-b border-white/5" data-ui="competicion-selector" ref={dropdownRef}>
      <button
        onClick={() => !single && setIsOpen(prev => !prev)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-dark-base border border-white/5 transition-colors ${
          single ? 'cursor-default' : 'hover:border-white/10 cursor-pointer'
        }`}
        data-testid="competicion-selector-btn"
        disabled={single}
      >
        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-red-accent/20 to-dark-red/20 flex items-center justify-center flex-shrink-0" data-ui="competicion-selector-icon">
          <svg className="w-3.5 h-3.5 text-red-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        </div>
        <div className="flex-1 text-left min-w-0" data-ui="competicion-selector-info">
          <p className="text-sm font-medium text-white truncate" data-ui="competicion-selector-name">
            {currentCompeticion?.nombre ?? 'Seleccionar'}
          </p>
          <p className="text-xs text-gray-500" data-ui="competicion-selector-role">
            {currentCompeticion?.role ? roleLabels[currentCompeticion.role] ?? currentCompeticion.role : ''}
          </p>
        </div>
        {!single && (
          <svg
            className={`w-4 h-4 text-gray-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
            data-ui="competicion-selector-chevron"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {isOpen && !single && (
        <div className="mt-1 py-1 bg-dark-base border border-white/5 rounded-lg shadow-xl overflow-hidden" data-ui="competicion-selector-dropdown">
          {competiciones.map((comp) => (
            <button
              key={comp.id}
              onClick={() => handleSelect(comp.slug)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors ${
                comp.slug === competicionSlug ? 'bg-white/5' : ''
              }`}
              data-testid={`competicion-option-${comp.slug}`}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate" data-ui={`competicion-option-name-${comp.slug}`}>{comp.nombre}</p>
                <p className="text-xs text-gray-500" data-ui={`competicion-option-role-${comp.slug}`}>{roleLabels[comp.role] ?? comp.role}</p>
              </div>
              {comp.slug === competicionSlug && (
                <svg className="w-4 h-4 text-red-accent flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function BackofficeLayout({ children }: BackofficeLayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { logout } = useAuth({ bootstrap: false });
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const isFER = useAtomValue(isCurrentFerAtom);
  const hasPermission = useAtomValue(hasPermissionAtom);
  const isRoot = useAtomValue(isRootAtom);
  const { buildPath, competicionSlug } = useCompeticionSlug();

  const enabledModuleKeys = useMemo(() => {
    return new Set((currentCompeticion?.modules ?? []).filter((module) => module.enabled).map((module) => module.key));
  }, [currentCompeticion?.modules]);

  const hasModuleConfig = (currentCompeticion?.modules?.length ?? 0) > 0;

  // Filter nav items by competition type AND role permissions
  const navItems = useMemo(() => {
    return allNavItems.filter((item) => {
      // Filter by competition type
      if (item.ferOnly && !isFER) return false;
      if (item.grcupOnly && isFER) return false;

      // Filter by role permission
      if (item.requiredPermission && !hasPermission(item.requiredPermission)) {
        return false;
      }

      if (hasModuleConfig && item.moduleKey && !enabledModuleKeys.has(item.moduleKey)) {
        return false;
      }

      return true;
    });
  }, [isFER, hasPermission, hasModuleConfig, enabledModuleKeys]);

  const competicionName = useMemo(() => currentCompeticion?.nombre ?? 'GR Cup', [currentCompeticion?.nombre]);

  const handleLogout = useCallback(async () => {
    await logout();
    window.location.href = '/backoffice/login';
  }, [logout]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  const isActive = useCallback((subPath: string) => {
    const fullPath = buildPath(subPath);
    if (subPath === '' || !subPath) return location === buildPath('');
    return location === fullPath || location.startsWith(fullPath + '/');
  }, [location, buildPath]);

  return (
    <div className="min-h-screen bg-dark-base flex overflow-x-hidden" data-ui="backoffice-layout">
      <header className="xl:hidden fixed top-0 left-0 right-0 z-30 bg-dark-surface/80 backdrop-blur-xl border-b border-white/5 px-3 xs:px-4 py-2.5 xs:py-3 flex items-center justify-between min-h-[56px] xs:min-h-[60px]" data-ui="mobile-header">
        <button
          onClick={toggleSidebar}
          className="p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
          data-testid="backoffice-sidebar-toggle-btn"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="hamburger-icon">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-base xs:text-lg font-semibold text-white truncate max-w-[120px] xs:max-w-none" data-ui="mobile-title">{competicionName}</span>
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
          data-testid="backoffice-mobile-logout-btn"
          aria-label="Logout"
        >
          <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="logout-icon-mobile">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </header>

      {sidebarOpen && (
        <div
          className="xl:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={toggleSidebar}
          data-ui="sidebar-overlay"
        />
      )}

      <aside
        className={`
          fixed xl:sticky top-0 left-0 z-50 xl:z-auto
          w-56 sm2:w-64 min-h-screen
          bg-dark-surface/80 backdrop-blur-xl
          border-r border-white/5
          transform transition-transform duration-200 ease-in-out
          xl:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        data-ui="sidebar"
      >
        <div className="flex flex-col h-full" data-ui="sidebar-content">
          <div className="px-6 py-5 border-b border-white/5" data-ui="sidebar-header">
            <h1 className="text-xl font-bold text-white" data-ui="sidebar-title">{competicionName}</h1>
            <p className="text-sm text-gray-500" data-ui="sidebar-subtitle">Panel de Administracion</p>
          </div>

          <CompeticionSelector />

          <nav className="flex-1 p-3" data-ui="sidebar-nav">
            <ul data-ui="sidenav-list" role="list" className="space-y-0.5">
              {isRoot && (
                <>
                  <li className="px-4 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-600" data-ui="sidenav-system-label" role="listitem">
                    Sistema
                  </li>
                  <li data-ui="sidenav-item-workspaces" role="listitem">
                    <button
                      onClick={() => { setLocation('/backoffice/workspaces'); setSidebarOpen(false); }}
                      className={`
                        flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 w-full text-left
                        ${location.startsWith('/backoffice/workspaces')
                          ? 'text-white bg-white/5 border-l-2 border-red-accent'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                        }
                      `}
                      data-testid="backoffice-nav-workspaces-link"
                      data-section="workspaces"
                      aria-current={location.startsWith('/backoffice/workspaces') ? 'page' : undefined}
                    >
                      <NavIcon icon="workspaces" />
                      <span className="text-sm font-medium" data-ui="nav-label-workspaces">Workspaces</span>
                    </button>
                  </li>
                  <li className="px-4 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-600" data-ui="sidenav-workspace-label" role="listitem">
                    Workspace actual
                  </li>
                </>
              )}
              {navItems.map((item) => {
                const active = isActive(item.subPath);
                const itemHref = buildPath(item.subPath);
                return (
                  <li data-ui="sidenav-item" role="listitem" key={item.subPath}>
                    <button
                      onClick={() => { setLocation(itemHref); setSidebarOpen(false); }}
                      className={`
                        flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150 w-full text-left
                        ${active
                          ? 'text-white bg-white/5 border-l-2 border-red-accent'
                          : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                        }
                      `}
                      data-testid={`backoffice-nav-${item.icon}-link`}
                      data-section={item.label.toLowerCase()}
                      aria-current={active ? 'page' : undefined}
                    >
                      <NavIcon icon={item.icon} />
                      <span className="text-sm font-medium" data-ui={`nav-label-${item.icon}`}>{item.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="p-3 border-t border-white/5 hidden xl:block" data-ui="sidebar-footer">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.03] transition-all duration-150"
              data-testid="backoffice-desktop-logout-btn"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" data-ui="logout-icon-desktop">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-medium" data-ui="logout-label">Cerrar Sesion</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-h-screen pt-20 xl:pt-0 min-w-0" data-ui="main-content">
        {children}
      </main>
    </div>
  );
}

export default BackofficeLayout;
