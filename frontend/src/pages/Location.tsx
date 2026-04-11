import type { JSX } from 'react';
import { LocalizacionSection } from './home/components';
import { Head } from '../components/Head';
import { pageMetaConfig } from '../metaConfig';

export function LocationPage(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/como-llegar']} />
      <main className="min-h-screen bg-dark-base" style={{ paddingTop: '190px' }} data-ui="location-page">
      <LocalizacionSection />
      </main>
    </>
  );
}

export default Location;
