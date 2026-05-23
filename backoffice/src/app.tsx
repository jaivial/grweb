import { lazy, Suspense, useEffect } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { Toaster } from 'react-hot-toast';
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';

const BackofficeHome = lazy(() => import('./pages/backoffice/Home').then((m) => ({ default: m.BackofficeHome })));
const Inscripciones = lazy(() => import('./pages/backoffice/inscripciones/Inscripciones').then((m) => ({ default: m.default })));
const Sorteo = lazy(() => import('./pages/backoffice/sorteo/Sorteo').then((m) => ({ default: m.Sorteo })));
const Horarios = lazy(() => import('./pages/backoffice/horarios/Horarios').then((m) => ({ default: m.default })));
const InscripcionConfigPage = lazy(() => import('./pages/backoffice/InscripcionConfig').then((m) => ({ default: m.default })));
const Configuracion = lazy(() => import('./pages/backoffice/configuracion/Configuracion').then((m) => ({ default: m.Configuracion })));
const RaffleConfigPage = lazy(() => import('./pages/backoffice/raffle-config/RaffleConfigPage').then((m) => ({ default: m.RaffleConfigPage })));
const Participantes = lazy(() => import('./pages/backoffice/participantes/Participantes').then((m) => ({ default: m.default })));
const Checkin = lazy(() => import('./pages/backoffice/checkin/CheckinPage').then((m) => ({ default: m.CheckinPage })));
const JudgeTable = lazy(() => import('./pages/backoffice/judge-table/JudgeTablePage').then((m) => ({ default: m.JudgeTablePage })));
const QrReader = lazy(() => import('./pages/backoffice/qr-reader/QrReaderPage').then((m) => ({ default: m.QrReaderPage })));
const UsersPage = lazy(() => import('./pages/backoffice/users').then((m) => ({ default: m.UsersPage })));
const RoleDetailPage = lazy(() => import('./pages/backoffice/users').then((m) => ({ default: m.RoleDetailPage })));
const MemberDetailPage = lazy(() => import('./pages/backoffice/users').then((m) => ({ default: m.MemberDetailPage })));
const NewMemberPage = lazy(() => import('./pages/backoffice/users').then((m) => ({ default: m.NewMemberPage })));
const WorkspacesPage = lazy(() => import('./pages/backoffice/workspaces').then((m) => ({ default: m.WorkspacesPage })));
const WorkspaceDetailPage = lazy(() => import('./pages/backoffice/workspaces').then((m) => ({ default: m.WorkspaceDetailPage })));

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

function ProtectedLazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ProtectedRoute>
  );
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Toaster position="top-right" toastOptions={{ duration: 4000, style: { background: '#1a1a2e', color: '#fff', border: '1px solid #374151' } }} />
      <Router>
        <Switch>
          <Route path="/" component={() => <Login />} />
          <Route path="/backoffice/login" component={Login} />
          <Route path="/backoffice" component={() => <ProtectedLazyPage><BackofficeHome /></ProtectedLazyPage>} />
          <Route path="/backoffice/inscripciones" component={() => <ProtectedLazyPage><Inscripciones /></ProtectedLazyPage>} />
          <Route path="/backoffice/sorteo" component={() => <ProtectedLazyPage><Sorteo /></ProtectedLazyPage>} />
          <Route path="/backoffice/horarios" component={() => <ProtectedLazyPage><Horarios /></ProtectedLazyPage>} />
          <Route path="/backoffice/inscripcion-config" component={() => <ProtectedLazyPage><InscripcionConfigPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/configuracion" component={() => <ProtectedLazyPage><Configuracion /></ProtectedLazyPage>} />
          <Route path="/backoffice/raffle-config" component={() => <ProtectedLazyPage><RaffleConfigPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/participantes" component={() => <ProtectedLazyPage><Participantes /></ProtectedLazyPage>} />
          <Route path="/backoffice/checkin" component={() => <ProtectedLazyPage><Checkin /></ProtectedLazyPage>} />
          <Route path="/backoffice/judge-table" component={() => <ProtectedLazyPage><JudgeTable /></ProtectedLazyPage>} />
          <Route path="/backoffice/qr-reader" component={() => <ProtectedLazyPage><QrReader /></ProtectedLazyPage>} />
          <Route path="/backoffice/users" component={() => <ProtectedLazyPage><UsersPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/users/new" component={() => <ProtectedLazyPage><NewMemberPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/users/roles/:roleSlug" component={() => <ProtectedLazyPage><RoleDetailPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/users/members/:usuarioId" component={() => <ProtectedLazyPage><MemberDetailPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/members" component={() => <ProtectedLazyPage><UsersPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/workspaces" component={() => <ProtectedLazyPage><WorkspacesPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/workspaces/:competitionId" component={() => <ProtectedLazyPage><WorkspaceDetailPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/inscripciones" component={() => <ProtectedLazyPage><Inscripciones /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/sorteo" component={() => <ProtectedLazyPage><Sorteo /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/horarios" component={() => <ProtectedLazyPage><Horarios /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/inscripcion-config" component={() => <ProtectedLazyPage><InscripcionConfigPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/configuracion" component={() => <ProtectedLazyPage><Configuracion /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/raffle-config" component={() => <ProtectedLazyPage><RaffleConfigPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/participantes" component={() => <ProtectedLazyPage><Participantes /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/checkin" component={() => <ProtectedLazyPage><Checkin /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/judge-table" component={() => <ProtectedLazyPage><JudgeTable /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/qr-reader" component={() => <ProtectedLazyPage><QrReader /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/users" component={() => <ProtectedLazyPage><UsersPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/users/new" component={() => <ProtectedLazyPage><NewMemberPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/users/roles/:roleSlug" component={() => <ProtectedLazyPage><RoleDetailPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/users/members/:usuarioId" component={() => <ProtectedLazyPage><MemberDetailPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug/members" component={() => <ProtectedLazyPage><UsersPage /></ProtectedLazyPage>} />
          <Route path="/backoffice/:competicionSlug" component={() => <ProtectedLazyPage><BackofficeHome /></ProtectedLazyPage>} />
          <Route component={() => <Login />} />
        </Switch>
      </Router>
    </>
  );
}
