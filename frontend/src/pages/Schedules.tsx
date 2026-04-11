import type { JSX } from 'react';
import { SchedulesSection } from './home/components';
import { Head } from '../components/Head';
import { pageMetaConfig } from '../metaConfig';

export function Schedules(): JSX.Element {
  return (
    <>
      <Head {...pageMetaConfig['/horarios']} />
      <main className="min-h-screen bg-dark-base" style={{ paddingTop: '190px' }} data-ui="schedules-page">
      <SchedulesSection />
      </main>
    </>
  );
}

export default Schedules;
