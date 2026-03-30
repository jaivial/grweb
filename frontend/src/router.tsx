/**
 * Application Router
 * 
 * Defines all application routes and route guards.
 */

import { lazy, Suspense, ComponentType, FC, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { Router, Route } from 'wouter';
import { useLocation } from 'wouter';

// Layout
import Layout from './layouts/Layout';

// Pages
import { Home } from './pages/home';
import { Checkout } from './pages/checkout';
import { Success } from './pages/success';

// Admin Pages (lazy loaded)
const AdminLogin: FC = lazy(() => import('./pages/admin/login')) as any;
const AdminDashboard: FC = lazy(() => import('./pages/admin/dashboard')) as any;
const AdminParticipants: FC = lazy(() => import('./pages/admin/participants')) as any;
const AdminDraw: FC = lazy(() => import('./pages/admin/draw')) as any;

// Backoffice Pages (lazy loaded)
const BackofficeHome: FC = lazy(() => import('./pages/backoffice/Home')) as any;
const Inscripciones: FC = lazy(() => import('./pages/backoffice/inscripciones/Inscripciones')) as any;
const Horarios: FC = lazy(() => import('./pages/backoffice/horarios/Horarios')) as any;
const Sorteo: FC = lazy(() => import('./pages/backoffice/sorteo/Sorteo')) as any;

// Protected Route Component
import { token, verifyAuth } from './stores/auth';

function ProtectedRoute({ children }: { children: () => JSX.Element }): JSX.Element {
  const [location, setLocation] = useLocation();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // Check for token and verify with backend
    verifyAuth().then(valid => {
      if (!valid) {
        setLocation('/admin/login');
      }
      setIsVerifying(false);
    });
  }, []);

  if (isVerifying) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <div className="animate-spin w-8 h-8 border-4 border-red-accent border-t-transparent rounded-full"></div>
      </div>
    );
  }

  if (!token.value) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <div className="animate-spin w-8 h-8 border-4 border-red-accent border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return <>{children()}</>;
}

// Loading Component
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-base">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-red-accent border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}

// Main App Router
export function AppRouter() {
  return (
    <Router>
      {/* Public Routes */}
      <Route path="/" component={Home} />
      <Route path="/checkout" component={Checkout} />
      <Route path="/success" component={Success} />

      {/* Admin Routes */}
      <Route path="/admin/login">
        {() => (
          <Suspense fallback={<PageLoader />}>
            <AdminLogin />
          </Suspense>
        )}
      </Route>

      <Route path="/admin/dashboard">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <AdminDashboard />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/admin/participants">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <AdminParticipants />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/admin/draw">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <AdminDraw />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      {/* Backoffice Routes */}
      <Route path="/backoffice">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <BackofficeHome />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/backoffice/inscripciones">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <Inscripciones />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/backoffice/horarios">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <Horarios />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      <Route path="/backoffice/sorteo">
        {() => (
          <ProtectedRoute>
            {() => (
              <Suspense fallback={<PageLoader />}>
                <Sorteo />
              </Suspense>
            )}
          </ProtectedRoute>
        )}
      </Route>

      {/* Catch-all */}
      <Route>
        {() => (
          <div className="min-h-screen flex items-center justify-center bg-dark-base">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-white mb-4">404</h1>
              <p className="text-gray-400 mb-6">Page not found</p>
              <a href="/" className="text-red-accent hover:underline">
                Go home
              </a>
            </div>
          </div>
        )}
      </Route>
    </Router>
  );
}

export default AppRouter;