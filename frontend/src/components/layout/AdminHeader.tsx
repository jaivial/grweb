import { useAuth } from '../../hooks/useAuth';
import { useCompeticiones } from '../../hooks/useCompeticion';
import { Bell, User } from 'lucide-react';

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function AdminHeader({ title, subtitle, actions }: AdminHeaderProps) {
  const { user } = useAuth();
  const { currentCompeticionData } = useCompeticiones();

  return (
    <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          {subtitle && (
            <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
          )}
          {currentCompeticionData && (
            <p className="text-xs text-blue-400 mt-1">
              {currentCompeticionData.nombre} • {currentCompeticionData.lugar}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          {actions}
          
          <button className="p-2 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white relative">
            <Bell size={20} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
          </button>
          
          <div className="flex items-center gap-3 pl-4 border-l border-gray-700">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-medium text-white">{user?.nombre}</p>
              <p className="text-xs text-gray-400">{user?.email}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
              <User size={20} className="text-gray-300" />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
