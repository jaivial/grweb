import { FER_COLORS } from '../fer/constants';
import { Head } from '../../components/Head';
import { FerFooter } from '../fer/components/FerFooter';
import {
  SobreHero,
  MissionVision,
  HistorySection,
  ValuesSection,
  TeamSection,
  FacilitiesGallery,
  CommunityCta,
} from './components';

export function SobreNosotrosPage() {
  return (
    <>
      <Head
        title="Sobre Nosotros | FER CUP"
        description="Conoce la historia, valores y equipo de GR Strength. Más que un club de powerlifting, somos una comunidad en Valencia, Valencia."
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="sobre-nosotros-page"
      >
        <main
          className="flex-1"
          data-ui="sobre-nosotros-page-main"
        >
          <SobreHero />
          <MissionVision />
          <HistorySection />
          <ValuesSection />
          <TeamSection />
          <FacilitiesGallery />
          <CommunityCta />
        </main>
        <FerFooter />
      </div>
    </>
  );
}

export default SobreNosotrosPage;
