import { useMemo, useCallback } from 'react';
import { useLocation, Link } from 'wouter';
import { useAtomValue, useSetAtom } from 'jotai';
import { userAtom, currentCompeticionAtom, currentCompeticionIdAtom, userCompeticionesAtom } from '../../stores/auth.atoms';
import { isMobileMenuOpenAtom } from '../../stores/backoffice.atoms';
import { Icon } from '../../components/ui/Icon';
import {
  HomeIcon,
  UsersIcon,
  TicketIcon,
  CalendarIcon,
  BarChartIcon,
  SettingsIcon,
  ChevronRightIcon,
  LogoutIcon,
  MenuIcon,
  XIcon,
} from '../../components/ui/Icon';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BackofficeLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  title?: string;
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: HomeIcon, href: '/backoffice' },
  { id: 'users', label: 'Miembros', icon: UsersIcon, href: '/backoffice/:competicionSlug/users' },
  { id: 'inscripciones', label: 'Inscripciones', icon: TicketIcon, href: '/backoffice/:competicionSlug/inscripciones' },
  { id: 'horarios', label: 'Horarios', icon: CalendarIcon, href: '/backoffice/:competicionSlug/horarios' },
  { id: 'stats', label: 'Estadísticas', icon: BarChartIcon, href: '/backoffice/:competicionSlug/stats' },
  { id: 'config', label: 'Configuración', icon: SettingsIcon, href: '/backoffice/:competicionSlug/config' },
];

export function BackofficeLayout({ children, breadcrumbs = [], title }: BackofficeLayoutProps): JSX.Element {
  const [location, setLocation] = useLocation();
  const user = useAtomValue(userAtom);
  const currentCompeticion = useAtomValue(currentCompeticionAtom);
  const userCompeticiones = useAtomValue(userCompeticionesAtom);
  const isMobileMenuOpen = useAtomValue(isMobileMenuOpenAtom);
  const setIsMobileMenuOpen = useSetAtom(isMobileMenuOpenAtom);
  const setCurrentCompeticionId = useSetAtom(currentCompeticionIdAtom);

  const breadcrumbsWithHome = useMemo(() => [
    { label: 'Backoffice', href: '/backoffice' },
    ...breadcrumbs,
  ], [breadcrumbs]);

  const handleToggleMenu = useCallback(() => {
    setIsMobileMenuOpen(prev => !prev);
  }, [setIsMobileMenuOpen]);

  const handleCloseMenu = useCallback(() => {
    setIsMobileMenuOpen(false);
  }, [setIsMobileMenuOpen]);

  const handleLogout = useCallback(() => {
    document.cookie = 'gr_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    window.location.href = '/backoffice/login';
  }, []);

  const getNavHref = useCallback((item: typeof NAV_ITEMS[0]): string => {
    if (item.href.includes(':competicionSlug') && currentCompeticion) {
      return item.href.replace(':competicionSlug', currentCompeticion.slug);
    }
    return item.href;
  }, [currentCompeticion]);

  const isActive = useCallback((href: string): boolean => {
    const normalizedHref = href.replace(':competicionSlug', currentCompeticion?.slug || '');
    return location === normalizedHref || location.startsWith(normalizedHref + '/');
  }, [location, currentCompeticion]);

  const handleNavItemClick = useCallback((href: string) => {
    handleCloseMenu();
    setLocation(href);
  }, [handleCloseMenu, setLocation]);

  return (
    <div className="min-h-screen bg-dark-base flex" data-ui="backoffice-layout">
      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          data-ui="mobile-overlay"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={handleCloseMenu}
        />
      )}

      {/* Mobile Sidebar */}
      <aside
        data-ui="mobile-sidebar"
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-dark-surface border-r border-white/10
          flex flex-col transform transition-transform duration-300 ease-in-out
          md:hidden
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div data-ui="mobile-sidebar-header" className="p-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h1 data-ui="mobile-sidebar-title" className="text-lg font-bold text-white truncate">
              {currentCompeticion?.nombre || 'GR Cup'}
            </h1>
            <p data-ui="mobile-sidebar-subtitle" className="text-xs text-gray-400 truncate">
              {user?.nombre || 'Usuario'}
            </p>
          </div>
          <button
            data-ui="close-menu-btn"
            onClick={handleCloseMenu}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Cerrar menú"
          >
            <XIcon size="sm" />
          </button>
        </div>

        <nav data-ui="mobile-sidebar-nav" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const href = getNavHref(item);
            const active = isActive(href);
            return (
              <button
                key={item.id}
                data-ui="mobile-nav-item"
                data-nav-id={item.id}
                onClick={() => handleNavItemClick(href)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium w-full
                  transition-all duration-150 min-h-[44px]
                  ${active
                    ? 'bg-red-accent/20 text-red-accent'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <item.icon size="sm" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div data-ui="mobile-sidebar-footer" className="p-3 border-t border-white/10">
          {userCompeticiones.length > 1 && (
            <div data-ui="mobile-competition-selector" className="mb-3">
              <select
                data-ui="mobile-competition-select"
                value={currentCompeticion?.id || ''}
                onChange={(e) => {
                  const comp = userCompeticiones.find(c => c.id === Number(e.target.value));
                  if (comp) {
                    setCurrentCompeticionId(comp.id);
                    handleCloseMenu();
                    setLocation(`/backoffice/${comp.slug}`);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-dark-card border border-white/10
                  text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-accent"
              >
                {userCompeticiones.map(comp => (
                  <option key={comp.id} value={comp.id}>{comp.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <button
            data-ui="mobile-logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
              text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-150 min-h-[44px]"
          >
            <LogoutIcon size="sm" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside
        data-ui="desktop-sidebar"
        className="hidden md:flex w-64 bg-dark-surface border-r border-white/10 flex-col"
      >
        <div data-ui="sidebar-header" className="p-4 border-b border-white/10">
          <h1 data-ui="sidebar-title" className="text-lg font-bold text-white truncate">
            {currentCompeticion?.nombre || 'GR Cup'}
          </h1>
          <p data-ui="sidebar-subtitle" className="text-xs text-gray-400 truncate">
            {user?.nombre || 'Usuario'}
          </p>
        </div>

        <nav data-ui="sidebar-nav" className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map(item => {
            const href = getNavHref(item);
            const active = isActive(href);
            return (
              <Link
                key={item.id}
                href={href}
                data-ui="nav-item"
                data-nav-id={item.id}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-all duration-150 min-h-[44px]
                  ${active
                    ? 'bg-red-accent/20 text-red-accent'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }
                `}
              >
                <item.icon size="sm" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div data-ui="sidebar-footer" className="p-3 border-t border-white/10">
          {userCompeticiones.length > 1 && (
            <div data-ui="competition-selector" className="mb-3">
              <select
                data-ui="competition-select"
                value={currentCompeticion?.id || ''}
                onChange={(e) => {
                  const comp = userCompeticiones.find(c => c.id === Number(e.target.value));
                  if (comp) {
                    setCurrentCompeticionId(comp.id);
                    setLocation(`/backoffice/${comp.slug}`);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-dark-card border border-white/10
                  text-white text-sm focus:outline-none focus:ring-2 focus:ring-red-accent"
              >
                {userCompeticiones.map(comp => (
                  <option key={comp.id} value={comp.id}>{comp.nombre}</option>
                ))}
              </select>
            </div>
          )}
          <button
            data-ui="logout-btn"
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium
              text-gray-400 hover:text-white hover:bg-white/5 transition-all duration-150 min-h-[44px]"
          >
            <LogoutIcon size="sm" />
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      <main data-ui="backoffice-main" className="flex-1 flex flex-col min-w-0">
        {/* Mobile Top Navbar */}
        <header
          data-ui="mobile-navbar"
          className="sticky top-0 z-30 bg-dark-base/95 backdrop-blur-lg border-b border-white/10 md:hidden"
        >
          <div data-ui="mobile-navbar-content" className="flex items-center justify-between px-4 py-3">
            <button
              data-ui="hamburger-btn"
              onClick={handleToggleMenu}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Abrir menú"
            >
              <MenuIcon size="sm" />
            </button>
            <h1 data-ui="mobile-navbar-title" className="text-base font-semibold text-white truncate">
              {currentCompeticion?.nombre || 'GR Cup'}
            </h1>
            <div data-ui="mobile-navbar-right" className="flex items-center gap-2">
              <span data-ui="mobile-user-name" className="text-sm text-gray-400 hidden sm:block">
                {user?.nombre || 'Usuario'}
              </span>
              <div
                data-ui="mobile-user-avatar"
                className="w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center text-red-accent text-sm font-medium"
              >
                {user?.nombre?.charAt(0).toUpperCase() || 'U'}
              </div>
            </div>
          </div>
        </header>

        {breadcrumbs.length > 0 && (
          <header data-ui="backoffice-header" className="sticky top-0 z-30 bg-dark-base/80 backdrop-blur-lg border-b border-white/10">
            <div data-ui="header-content" className="px-6 py-4">
              <nav data-ui="breadcrumbs" aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
                {breadcrumbsWithHome.map((crumb, idx) => (
                  <span key={idx} data-ui="breadcrumb-item" className="flex items-center gap-2">
                    {idx > 0 && <ChevronRightIcon size="xs" className="text-gray-500" />}
                    {crumb.href ? (
                      <Link
                        href={crumb.href}
                        data-ui="breadcrumb-link"
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span data-ui="breadcrumb-current" className="text-white font-medium">
                        {crumb.label}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
              {title && (
                <h2 data-ui="page-title" className="text-xl font-semibold text-white mt-2">{title}</h2>
              )}
            </div>
          </header>
        )}

        <div data-ui="backoffice-content" className="flex-1 p-6">
          {children}
        </div>
      </main>
    </div>
  );
}

export default BackofficeLayout;
