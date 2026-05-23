import { Router, Route, useLocation } from 'wouter';
import { useEffect, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import Layout from './layouts/Layout';
import { Home } from './pages/home/Home';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { UsersPage, RoleDetailPage, MemberDetailPage, NewMemberPage } from './pages/backoffice/users';
import { DashboardPage } from './pages/backoffice/dashboard';
import { QrReaderPage } from './pages/backoffice/qr-reader';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load all page components to reduce initial bundle size
const Checkout = lazy(() => import('./pages/Checkout').then(m => ({ default: m.default })));
const Success = lazy(() => import('./pages/Success').then(m => ({ default: m.default })));
const Inscripcion = lazy(() => import('./pages/home/Inscripcion').then(m => ({ default: m.Inscripcion })));
const Raffle = lazy(() => import('./pages/raffle/Raffle').then(m => ({ default: m.Raffle })));
const PrivacyPolicy = lazy(() => import('./pages/legal/PrivacyPolicy').then(m => ({ default: m.PrivacyPolicy })));
const TermsOfService = lazy(() => import('./pages/legal/TermsOfService').then(m => ({ default: m.TermsOfService })));
const DataConsent = lazy(() => import('./pages/legal/DataConsent').then(m => ({ default: m.DataConsent })));
const ContestPolicy = lazy(() => import('./pages/legal/ContestPolicy').then(m => ({ default: m.ContestPolicy })));
const Schedules = lazy(() => import('./pages/Schedules').then(m => ({ default: m.Schedules })));
const LocationPage = lazy(() => import('./pages/Location').then(m => ({ default: m.LocationPage })));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-dark-base flex items-center justify-center" data-ui="page-loader">
    <div className="text-center" data-ui="page-loader-content">
      <div className="w-16 h-16 border-4 border-red-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" data-ui="page-loader-spinner" />
      <p className="text-gray-400" data-ui="page-loader-text">Cargando...</p>
    </div>
  </div>
);

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location]);
  return null;
}

// Helper to wrap lazy components with Layout and Suspense
const LazyPage = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<PageLoader />}>
    <Layout>{children}</Layout>
  </Suspense>
);

// Helper for protected backoffice pages
const BackofficePage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  </ProtectedRoute>
);

export function App() {
  return (
    <>
      <ScrollToTop />
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: '#1a1a2e', color: '#fff', border: '1px solid #374151' } }} />
      <Router>
        {/* Public Routes - NOT wrapped by ErrorBoundary */}
        <Route path="/" component={() => <Layout><Home /></Layout>} />
        <Route path="/checkout" component={() => <LazyPage><Checkout /></LazyPage>} />
        <Route path="/success" component={() => <LazyPage><Success /></LazyPage>} />
        <Route path="/inscripcion" component={() => <LazyPage><Inscripcion /></LazyPage>} />
        <Route path="/raffle" component={() => <LazyPage><Raffle /></LazyPage>} />
        <Route path="/privacy" component={() => <LazyPage><PrivacyPolicy /></LazyPage>} />
        <Route path="/terms" component={() => <LazyPage><TermsOfService /></LazyPage>} />
        <Route path="/consentimiento-datos" component={() => <LazyPage><DataConsent /></LazyPage>} />
        <Route path="/politica-concurso" component={() => <LazyPage><ContestPolicy /></LazyPage>} />
        <Route path="/horarios" component={() => <LazyPage><Schedules /></LazyPage>} />
        <Route path="/como-llegar" component={() => <LazyPage><LocationPage /></LazyPage>} />

        {/* Backoffice Routes - wrapped by ErrorBoundary */}
        <ErrorBoundary>
          <Route path="/backoffice/login" component={() => <LoginPage />} />
          <Route path="/backoffice/:competicionSlug" component={() => <BackofficePage><DashboardPage /></BackofficePage>} />
          <Route path="/backoffice/:competicionSlug/users" component={() => <BackofficePage><UsersPage /></BackofficePage>} />
          <Route path="/backoffice/:competicionSlug/users/roles/:roleSlug" component={() => <BackofficePage><RoleDetailPage /></BackofficePage>} />
          <Route path="/backoffice/:competicionSlug/users/members/:usuarioId" component={() => <BackofficePage><MemberDetailPage /></BackofficePage>} />
          <Route path="/backoffice/:competicionSlug/users/new" component={() => <BackofficePage><NewMemberPage /></BackofficePage>} />
          <Route path="/backoffice/:competicionSlug/qr" component={() => <BackofficePage><QrReaderPage /></BackofficePage>} />
          <Route path="/backoffice" component={() => <BackofficePage><DashboardPage /></BackofficePage>} />
        </ErrorBoundary>
      </Router>
    </>
  );
}
