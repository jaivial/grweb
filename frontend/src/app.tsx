import { Router, Route, useLocation } from 'wouter';
import { useEffect, lazy, Suspense } from 'react';
import Layout from './layouts/Layout';
import { Home } from './pages/home/Home';
import Login from './admin/pages/Login';
import ProtectedRoute from './components/ProtectedRoute';

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

// Lazy load backoffice pages (these are heavy and rarely accessed)
const BackofficeHome = lazy(() => import('./pages/backoffice/Home').then(m => ({ default: m.BackofficeHome })));
const Inscripciones = lazy(() => import('./pages/backoffice/inscripciones/Inscripciones').then(m => ({ default: m.default })));
const Sorteo = lazy(() => import('./pages/backoffice/sorteo/Sorteo').then(m => ({ default: m.Sorteo })));
const Horarios = lazy(() => import('./pages/backoffice/horarios/Horarios').then(m => ({ default: m.default })));
const InscripcionConfigPage = lazy(() => import('./pages/backoffice/InscripcionConfig').then(m => ({ default: m.default })));
const Configuracion = lazy(() => import('./pages/backoffice/configuracion/Configuracion').then(m => ({ default: m.Configuracion })));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-dark-base flex items-center justify-center">
    <div className="text-center">
      <div className="w-16 h-16 border-4 border-red-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-400">Cargando...</p>
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

export function App() {
  return (
    <>
      <ScrollToTop />
      <Router>
      {/* Public Routes */}
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

      {/* Backoffice Login (Public) */}
      <Route path="/backoffice/login" component={Login} />

      {/* Protected Backoffice Routes */}
      <Route
        path="/backoffice"
        component={() => (
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}><BackofficeHome /></Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/inscripciones"
        component={() => (
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}><Inscripciones /></Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/sorteo"
        component={() => (
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}><Sorteo /></Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/horarios"
        component={() => (
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}><Horarios /></Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/inscripcion-config"
        component={() => (
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}><InscripcionConfigPage /></Suspense>
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/configuracion"
        component={() => (
          <ProtectedRoute>
            <Suspense fallback={<PageLoader />}><Configuracion /></Suspense>
          </ProtectedRoute>
        )}
      />
      </Router>
    </>
  );
}
