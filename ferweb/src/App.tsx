import { lazy, Suspense, useEffect } from 'react';
import { Router, Route, useLocation } from 'wouter';
import { Loader2 } from 'lucide-react';
import { FER_COLORS } from './pages/fer/constants';
import { FerLanding } from './pages/fer';
import { Navbar } from './components/navbar';

const InscripcionPage = lazy(() =>
  import('./pages/inscripcion/InscripcionPage').then((m) => ({ default: m.InscripcionPage }))
);
const HorariosPage = lazy(() =>
  import('./pages/horarios/HorariosPage').then((m) => ({ default: m.HorariosPage }))
);
const UbicacionPage = lazy(() =>
  import('./pages/ubicacion/UbicacionPage').then((m) => ({ default: m.UbicacionPage }))
);
const GaleriaPage = lazy(() =>
  import('./pages/galeria/GaleriaPage').then((m) => ({ default: m.GaleriaPage }))
);
const TutorialesPage = lazy(() =>
  import('./pages/normativa/TutorialesPage').then((m) => ({ default: m.TutorialesPage }))
);
const SobreNosotrosPage = lazy(() =>
  import('./pages/sobre-nosotros/SobreNosotrosPage').then((m) => ({ default: m.SobreNosotrosPage }))
);
const TerminosPage = lazy(() =>
  import('./pages/terminos/TerminosPage').then((m) => ({ default: m.TerminosPage }))
);
const PrivacidadPage = lazy(() =>
  import('./pages/privacidad/PrivacidadPage').then((m) => ({ default: m.PrivacidadPage }))
);

function PageLoader() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="app-page-loader"
    >
      <Loader2
        className="w-10 h-10 animate-spin"
        style={{ color: FER_COLORS.accent }}
        data-ui="app-page-loader-spinner"
      />
    </div>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

export function App() {
  return (
    <div className="[overflow-x:clip]" data-ui="app-shell">
      <Suspense fallback={<PageLoader />}>
        <Router>
          <ScrollToTop />
          <Navbar />
          <Route path="/" component={FerLanding} />
          <Route path="/inscripcion" component={InscripcionPage} />
          <Route path="/horarios" component={HorariosPage} />
          <Route path="/ubicacion" component={UbicacionPage} />
          <Route path="/galeria" component={GaleriaPage} />
          <Route path="/tutoriales" component={TutorialesPage} />
          <Route path="/sobre-nosotros" component={SobreNosotrosPage} />
          <Route path="/terms" component={TerminosPage} />
          <Route path="/privacy" component={PrivacidadPage} />
        </Router>
      </Suspense>
    </div>
  );
}
