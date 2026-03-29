import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { isAuthenticated, verifyAuth, isLoading } from '@stores/auth';

interface ProtectedRouteProps {
  children: any;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    verifyAuth();
  }, []);

  useEffect(() => {
    if (!isLoading.value && !isAuthenticated.value) {
      setLocation('/admin/login');
    }
  }, [isAuthenticated.value, isLoading.value]);

  if (isLoading.value) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <div className="text-red-accent text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated.value) {
    return null;
  }

  return children;
}
