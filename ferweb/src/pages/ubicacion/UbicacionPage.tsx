import { FER_COLORS } from '../fer/constants';
import { Head } from '../../components/Head';
import { FerFooter } from '../fer/components/FerFooter';
import {
  UbicacionHero,
  MapSection,
  TransportSection,
  VenueGallery,
  ContactSection,
  UbicacionCta,
} from './components';

export function UbicacionPage() {
  return (
    <>
      <Head
        title="Ubicación | FER CUP"
        description="Encuentra el GRS Club en Valencia, Valencia. Cómo llegar al FER CUP: coche, autobús y tren."
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="ubicacion-page"
      >
        <main
          className="flex-1"
          data-ui="ubicacion-page-main"
        >
          <UbicacionHero />
          <MapSection />
          <TransportSection />
          <VenueGallery />
          <ContactSection />
          <UbicacionCta />
        </main>
        <FerFooter />
      </div>
    </>
  );
}

export default UbicacionPage;
