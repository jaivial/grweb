import type { JSX } from 'react';
import { SchedulesSection } from './home/components';
import { Footer } from './home/components/Footer';

export function Schedules(): JSX.Element {
  return (
    <main className="min-h-screen bg-dark-base" style={{ paddingTop: '190px' }} data-page="schedules">
      <SchedulesSection />
      <Footer />
    </main>
  );
}

export default Schedules;
