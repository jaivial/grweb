import { Head } from '../../components/Head';
import { FER_COLORS } from '../fer/constants';
import { FerFooter } from '../fer/components/FerFooter';
import { PolaroidGallery } from '../fer/components/PolaroidGallery';

export function GaleriaPage() {
  return (
    <>
      <Head
        title="Galería | FER CUP"
        description="Momentos épicos de GR Strength y FER CUP: competición, entrenamiento, fuerza y comunidad."
        canonicalUrl="https://fercup.com/galeria"
      />
      <div
        className="min-h-screen flex flex-col"
        style={{ backgroundColor: FER_COLORS.bgDark }}
        data-ui="galeria-page"
      >
        <main className="flex-1" data-ui="galeria-page-main">
          <PolaroidGallery />
        </main>
        <FerFooter />
      </div>
    </>
  );
}

export default GaleriaPage;
