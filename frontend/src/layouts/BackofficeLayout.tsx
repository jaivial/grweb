import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { useLocation } from 'wouter';
import { logout } from '../stores/auth';

interface BackofficeLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/backoffice', label: 'Inicio', icon: 'home' },
  { href: '/backoffice/inscripciones', label: 'Inscripciones', icon: 'users' },
  { href: '/backoffice/sorteo', label: 'Sorteo', icon: 'dice' },
  { href: '/backoffice/horarios', label: 'Horarios', icon: 'calendar' },
  { href: '/backoffice/configuracion', label: 'Configuración', icon: 'settings' },
] as const;

function NavIcon({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    case 'users':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      );
    case 'ticket':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
        </svg>
      );
    case 'dice':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'calendar':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      );
    case 'settings':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

export function BackofficeLayout({ children }: BackofficeLayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [location] = useLocation();

  const handleLogout = useCallback(() => {
    logout();
    window.location.href = '/backoffice/login';
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  function isActive(href: string) {
    if (href === '/backoffice') return location === '/backoffice';
    return location.startsWith(href);
  }

  return (
    <div className="min-h-screen bg-dark-base flex" data-ui="backoffice-layout">
      {/* Mobile Header */}
      <header className="xl:hidden fixed top-0 left-0 right-0 z-30 bg-dark-surface/80 backdrop-blur-xl border-b border-white/5 px-3 xs:px-4 py-2.5 xs:py-3 flex items-center justify-between min-h-[56px] xs:min-h-[60px]" data-ui="mobile-header">
        <button
          onClick={toggleSidebar}
          className="p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -ml-2"
          data-ui="sidebar-toggle"
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-base xs:text-lg font-semibold text-white truncate max-w-[120px] xs:max-w-none" data-ui="mobile-title">GR Cup</span>
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
          data-ui="logout-button"
          aria-label="Logout"
        >
          <svg className="w-5 h-5 xs:w-6 xs:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="xl:hidden fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
          onClick={toggleSidebar}
          data-ui="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
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
          {/* Logo */}
          <div className="px-6 py-5 border-b border-white/5" data-ui="sidebar-header">
            <h1 className="text-xl font-bold text-white" data-ui="sidebar-title">GR Cup</h1>
            <p className="text-sm text-gray-500" data-ui="sidebar-subtitle">Panel de Administracion</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-3 space-y-0.5" data-ui="sidebar-nav">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`
                    flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all duration-150
                    ${active
                      ? 'text-white bg-white/5 border-l-2 border-red-accent'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.03]'
                    }
                  `}
                  data-ui="nav-link"
                  data-section={item.label.toLowerCase()}
                >
                  <NavIcon icon={item.icon} />
                  <span className="text-sm font-medium">{item.label}</span>
                </a>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="p-3 border-t border-white/5 hidden xl:block" data-ui="sidebar-footer">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.03] transition-all duration-150"
              data-ui="logout-button"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="text-sm font-medium">Cerrar Sesion</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen pt-20 xl:pt-0" data-ui="main-content">
        {children}
      </main>
    </div>
  );
}

export default BackofficeLayout;
