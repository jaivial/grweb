import { Router, Route, useLocation } from 'wouter';
import { useEffect } from 'react';
import Layout from './layouts/Layout';
import { Home } from './pages/home/Home';
import Checkout from './pages/Checkout';
import Success from './pages/Success';
import Login from './admin/pages/Login';
import ProtectedRoute from './components/ProtectedRoute';
import { Inscripcion } from './pages/home/Inscripcion';
import { Raffle } from './pages/raffle/Raffle';
import { PrivacyPolicy } from './pages/legal/PrivacyPolicy';
import { TermsOfService } from './pages/legal/TermsOfService';
import { DataConsent } from './pages/legal/DataConsent';
import { ContestPolicy } from './pages/legal/ContestPolicy';
import { Schedules } from './pages/Schedules';
import { LocationPage } from './pages/Location';

import { BackofficeHome } from './pages/backoffice/Home';
import Inscripciones from './pages/backoffice/inscripciones/Inscripciones';
import { Sorteo } from './pages/backoffice/sorteo/Sorteo';
import Horarios from './pages/backoffice/horarios/Horarios';
import InscripcionConfigPage from './pages/backoffice/InscripcionConfig';
import { Configuracion } from './pages/backoffice/configuracion/Configuracion';

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [location]);
  return null;
}

export function App() {
  return (
    <>
      <ScrollToTop />
      <Router>
      {/* Public Routes */}
      <Route path="/" component={() => <Layout><Home /></Layout>} />
      <Route path="/checkout" component={() => <Layout><Checkout /></Layout>} />
      <Route path="/success" component={() => <Layout><Success /></Layout>} />
      <Route path="/inscripcion" component={() => <Layout><Inscripcion /></Layout>} />
      <Route path="/raffle" component={() => <Layout><Raffle /></Layout>} />
      <Route path="/privacy" component={() => <Layout><PrivacyPolicy /></Layout>} />
      <Route path="/terms" component={() => <Layout><TermsOfService /></Layout>} />
      <Route path="/consentimiento-datos" component={() => <Layout><DataConsent /></Layout>} />
      <Route path="/politica-concurso" component={() => <Layout><ContestPolicy /></Layout>} />
      <Route path="/horarios" component={() => <Layout><Schedules /></Layout>} />
      <Route path="/como-llegar" component={() => <Layout><LocationPage /></Layout>} />

      {/* Backoffice Login (Public) */}
      <Route path="/backoffice/login" component={Login} />

      {/* Protected Backoffice Routes */}
      <Route
        path="/backoffice"
        component={() => (
          <ProtectedRoute>
            <BackofficeHome />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/inscripciones"
        component={() => (
          <ProtectedRoute>
            <Inscripciones />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/sorteo"
        component={() => (
          <ProtectedRoute>
            <Sorteo />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/horarios"
        component={() => (
          <ProtectedRoute>
            <Horarios />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/inscripcion-config"
        component={() => (
          <ProtectedRoute>
            <InscripcionConfigPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/backoffice/configuracion"
        component={() => (
          <ProtectedRoute>
            <Configuracion />
          </ProtectedRoute>
        )}
      />
      </Router>
    </>
  );
}
