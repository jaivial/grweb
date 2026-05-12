import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { useCompeticiones } from '../../hooks/useCompeticion';
import { useAtomValue, useSetAtom } from 'jotai';
import { isCurrentFerAtom, currentCompeticionTipoAtom, currentCompeticionIdAtom } from '../../stores/auth.atoms';
import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Users, 
  Ticket, 
  Settings, 
  LogOut, 
  ChevronDown,
  Menu,
  X,
  QrCode,
  Award,
  Calendar
} from 'lucide-react';
import clsx from 'clsx';
import api from '../../api/client';

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
  permission?: string;
  ferOnly?: boolean;
  grcupOnly?: boolean;
}

const allNavItems: NavItem[] = [
  { label: 'Dashboard', href: '/backoffice', icon: LayoutDashboard },
  { label: 'Inscripciones', href: '/backoffice/inscripciones', icon: Users, permission: 'view_inscriptos' },
  { label: 'Lector QR', href: '/backoffice/qr-reader', icon: QrCode, permission: 'do_checkin', ferOnly: true },
  { label: 'Participantes', href: '/backoffice/participantes', icon: Ticket, permission: 'manage_raffle', grcupOnly: true },
  { label: 'Rifa', href: '/backoffice/rifa', icon: Award, permission: 'manage_raffle', grcupOnly: true },
  { label: 'Horarios', href: '/backoffice/horarios', icon: Calendar },
  { label: 'Configuración', href: '/backoffice/config', icon: Settings, permission: 'manage_config' },
];

export function AdminSidebar() {
  const { user, logout } = useAuth();
  const { can } = usePermissions();
  const { userCompeticiones, currentCompeticionId, selectCompeticion, loadAdminCompeticiones } = useCompeticiones();
  const competicionId = useAtomValue(currentCompeticionIdAtom);
  const isFER = useAtomValue(isCurrentFerAtom);
  const setCurrentCompeticionTipo = useSetAtom(currentCompeticionTipoAtom);
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [competicionDropdownOpen, setCompeticionDropdownOpen] = useState(false);

  useEffect(() => {
    if (!competicionId) return;
    api.getAdminCompeticion(competicionId).then((result) => {
      if (result.success && result.data) {
        setCurrentCompeticionTipo(result.data.tipo || 'grcup');
      }
    }).catch(() => {});
  }, [competicionId, setCurrentCompeticionTipo]);

  const filteredNavItems = useMemo(() => {
    return allNavItems
      .filter(item => !item.permission || can(item.permission))
      .filter(item => {
        if (item.ferOnly && !isFER) return false;
        if (item.grcupOnly && isFER) return false;
        return true;
      });
  }, [can, isFER]);

  return (
    <aside 
      className={clsx(
        'bg-gray-800 border-r border-gray-700 h-screen flex flex-col transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-20'
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          {sidebarOpen && (
            <div>
              <h1 className="font-bold text-white">GR Platform</h1>
              <p className="text-xs text-gray-400">Admin Panel</p>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Competicion Selector */}
      {sidebarOpen && userCompeticiones.length > 0 && (
        <div className="p-4 border-b border-gray-700">
          <button
            onClick={() => {
              setCompeticionDropdownOpen(!competicionDropdownOpen);
              if (!competicionDropdownOpen) loadAdminCompeticiones();
            }}
            className="w-full flex items-center justify-between p-3 bg-gray-700 rounded-lg hover:bg-gray-600 transition-colors"
          >
            <div className="text-left">
              <p className="text-sm font-medium text-white">
                {userCompeticiones.find(c => c.id === currentCompeticionId)?.nombre || 'Seleccionar'}
              </p>
              <p className="text-xs text-gray-400">
                {userCompeticiones.find(c => c.id === currentCompeticionId)?.role === 'admin' ? 'Admin' : 'Operador'}
              </p>
            </div>
            <ChevronDown 
              size={16} 
              className={clsx(
                'text-gray-400 transition-transform',
                competicionDropdownOpen && 'rotate-180'
              )} 
            />
          </button>
          
          {competicionDropdownOpen && (
            <div className="mt-2 bg-gray-700 rounded-lg overflow-hidden">
              {userCompeticiones.map(comp => (
                <button
                  key={comp.id}
                  onClick={() => {
                    selectCompeticion(comp.id);
                    setCompeticionDropdownOpen(false);
                  }}
                  className={clsx(
                    'w-full p-3 text-left hover:bg-gray-600 transition-colors',
                    comp.id === currentCompeticionId && 'bg-gray-600'
                  )}
                >
                  <p className="text-sm font-medium text-white">{comp.nombre}</p>
                  <p className="text-xs text-gray-400 capitalize">{comp.role}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {filteredNavItems.map(item => {
          const Icon = item.icon;
          const isActive = location === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 p-3 rounded-lg transition-colors',
                isActive 
                  ? 'bg-blue-600 text-white' 
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              )}
            >
              <Icon size={20} />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-gray-700">
        <div className={clsx(
          'flex items-center',
          sidebarOpen ? 'justify-between' : 'justify-center'
        )}>
          {sidebarOpen && user && (
            <div className="text-sm">
              <p className="font-medium text-white">{user.nombre}</p>
              <p className="text-gray-400 truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400"
            title="Cerrar sesión"
          >
            <LogOut size={20} />
          </button>
        </div>
      </div>
    </aside>
  );
}
