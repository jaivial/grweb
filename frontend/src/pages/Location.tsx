import type { JSX } from 'react';
import { LocalizacionSection } from './home/components';
import { Footer } from './home/components/Footer';
import { Head } from '../components/Head';
import { pageMetaConfig } from '../metaConfig';

export function LocationPage(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/como-llegar']} />
      <main className="min-h-screen bg-dark-base" style={{ paddingTop: '190px' }} data-page="location">
      <LocalizacionSection />
        <Footer />
      </main>
    </>
  );
}

export default Location;
