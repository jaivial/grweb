import type { JSX } from 'react';
import { SchedulesSection } from './home/components';
import { Footer } from './home/components/Footer';
import { Head } from '../components/Head';
import { pageMetaConfig } from '../metaConfig';

export function Schedules(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/horarios']} />
      <main className="min-h-screen bg-dark-base" style={{ paddingTop: '190px' }} data-page="schedules">
      <SchedulesSection />
        <Footer />
      </main>
    </>
  );
}

export default Schedules;
