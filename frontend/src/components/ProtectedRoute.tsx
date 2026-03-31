import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { verifyAuth } from '@stores/auth';

interface ProtectedRouteProps {
  children: any;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [location, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    verifyAuth().then(valid => {
      setIsVerifying(false);
      if (!valid) {
        setLocation('/backoffice/login');
      }
    });
  }, []);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <div className="text-red-accent text-xl">Loading...</div>
      </div>
    );
  }

  return children;
}
