import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '../hooks/useAuth';

interface ProtectedRouteProps {
  children: ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const [initialCheck, setInitialCheck] = useState(false);

  useEffect(() => {
    if (!isLoading) {
      setInitialCheck(true);
      if (!isAuthenticated) {
        setLocation('/backoffice/login');
      }
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (!initialCheck || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base" data-ui="protected-route-loading">
        <div className="text-red-accent text-xl" data-ui="protected-route-loading-text">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return children;
}
