import { useState, useCallback } from 'react';
import type { JSX } from 'react';
import { token } from '../stores/auth';

interface BackofficeLayoutProps {
  children: React.ReactNode;
}

export function BackofficeLayout({ children }: BackofficeLayoutProps): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = useCallback(() => {
    token.value = null;
    localStorage.removeItem('gr_cup_token');
    window.location.href = '/admin/login';
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev);
  }, []);

  return (
    <div className="min-h-screen bg-dark-base" data-ui="backoffice-layout">
      {/* Mobile Header */}
      <header className="lg:hidden bg-dark-surface border-b border-dark-border px-4 py-3 flex items-center justify-between" data-ui="mobile-header">
        <button
          onClick={toggleSidebar}
          className="p-2 text-gray-400 hover:text-white"
          data-ui="sidebar-toggle"
          aria-label="Toggle menu"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="text-lg font-semibold text-white" data-ui="mobile-title">GR Cup Admin</span>
        <button
          onClick={handleLogout}
          className="p-2 text-gray-400 hover:text-white"
          data-ui="logout-button"
          aria-label="Logout"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </header>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={toggleSidebar}
          data-ui="sidebar-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:static inset-y-0 left-0 z-50 w-64 bg-dark-surface border-r border-dark-border
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
        data-ui="sidebar"
      >
        <div className="flex flex-col h-full" data-ui="sidebar-content">
          {/* Logo */}
          <div className="px-6 py-5 border-b border-dark-border" data-ui="sidebar-header">
            <h1 className="text-xl font-bold text-white">GR Cup</h1>
            <p className="text-sm text-gray-500">Panel de Administración</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-1" data-ui="sidebar-nav">
            <a
              href="/backoffice"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
              data-ui="nav-link"
              data-section="home"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Inicio
            </a>
            <a
              href="/backoffice/inscripciones"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
              data-ui="nav-link"
              data-section="inscripciones"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Inscripciones
            </a>
            <a
              href="/backoffice/sorteo"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
              data-ui="nav-link"
              data-section="sorteo"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Sorteo
            </a>
            <a
              href="/backoffice/horarios"
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
              data-ui="nav-link"
              data-section="horarios"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Horarios
            </a>
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-dark-border hidden lg:block" data-ui="sidebar-footer">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-dark-hover transition-colors"
              data-ui="logout-button"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen" data-ui="main-content">
        {children}
      </main>
    </div>
  );
}

export default BackofficeLayout;
