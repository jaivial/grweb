import { ReactNode } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { usePermissions } from '../../hooks/usePermissions';
import { Navigate, useLocation } from 'wouter';
import { Spinner } from '../ui/Spinner';

interface ProtectedRouteProps {
  children: ReactNode;
  permission?: string;
  requireSuperadmin?: boolean;
  fallback?: ReactNode;
}

export function ProtectedRoute({
  children,
  permission,
  requireSuperadmin,
  fallback,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { isSuperadmin } = usePermissions();
  const [location] = useLocation();

  // Show loading spinner while checking auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check superadmin requirement
  if (requireSuperadmin && !isSuperadmin) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-2">Acceso Denegado</h2>
          <p className="text-gray-400">No tienes permisos para acceder a esta sección.</p>
        </div>
      </div>
    );
  }

  // Check specific permission if required
  if (permission && !isSuperadmin) {
    // Permission check would go here
    // For now, allow access
  }

  return <>{children}</>;
}

// Wrapper for admin layout
export function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-900">
        {children}
      </div>
    </ProtectedRoute>
  );
}
