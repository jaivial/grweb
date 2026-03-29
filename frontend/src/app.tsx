import { Router, Route } from 'wouter';
import Layout from './layouts/Layout';
import { Home } from './pages/home/Home';
import Checkout from './pages/Checkout';
import Success from './pages/Success';
import Login from './admin/pages/Login';
import Dashboard from './admin/pages/Dashboard';
import Participants from './admin/pages/Participants';
import DrawWinner from './admin/pages/DrawWinner';
import ProtectedRoute from './components/ProtectedRoute';

// Backoffice pages
import { BackofficeHome } from './pages/backoffice/Home';
import Inscripciones from './pages/backoffice/inscripciones/Inscripciones';
import Horarios from './pages/backoffice/horarios/Horarios';
import { Sorteo } from './pages/backoffice/sorteo/Sorteo';

export function App() {
  return (
    <Router>
      {/* Public Routes */}
      <Route path="/" component={() => <Layout><Home /></Layout>} />
      <Route path="/checkout" component={() => <Layout><Checkout /></Layout>} />
      <Route path="/success" component={() => <Layout><Success /></Layout>} />
      
      {/* Admin Login (Public) */}
      <Route path="/admin/login" component={Login} />
      
      {/* Protected Admin Routes */}
      <Route 
        path="/admin/dashboard" 
        component={() => (
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        )} 
      />
      <Route 
        path="/admin/participants" 
        component={() => (
          <ProtectedRoute>
            <Layout><Participants /></Layout>
          </ProtectedRoute>
        )} 
      />
      <Route 
        path="/admin/draw" 
        component={() => (
          <ProtectedRoute>
            <Layout><DrawWinner /></Layout>
          </ProtectedRoute>
        )} 
      />

      {/* Backoffice Routes */}
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
        path="/backoffice/horarios" 
        component={() => (
          <ProtectedRoute>
            <Horarios />
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
    </Router>
  );
}
