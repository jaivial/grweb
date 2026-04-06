import type { JSX } from 'react';
import { useEffect, useMemo } from 'react';
import {
  HeroSection,
  TestSection,
  AthletesSection,
  PricesAllMovementsSection,
  OrganizationEquipmentSection,
  WeightCategoriesSection,
  SchedulesSection,
  LocalizacionSection,
  RaffleSection,
} from './components';
import { fetchParticipantCount } from './lib/api';
import { participantCount } from './atoms/state';
import { Head } from '../../components/Head';
import { pageMetaConfig } from '../../metaConfig';

export function Home(): JSX.Element {
  // JSON-LD structured data
  const jsonLd = useMemo(() => ({
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: 'GR Cup 2026',
    description: 'Copa de powerlifting en España. Competición de squat, bench press y deadlift con sorteos de material SBD y A7.',
    startDate: '2026-09-01',
    endDate: '2026-09-02',
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: 'Madrid, España',
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Madrid',
        addressCountry: 'ES',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: 'Nico GR',
      url: 'https://grcup.es',
    },
    sport: 'https://schema.org/Powerlifting',
    competitor: {
      '@type': 'SportsEvent',
      name: 'GR Cup 2026',
    },
  }), []);

  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.text = JSON.stringify(jsonLd);
    script.setAttribute('data-ui', 'json-ld-sports-event');
    document.head.appendChild(script);

    // WebSite schema
    const websiteScript = document.createElement('script');
    websiteScript.type = 'application/ld+json';
    websiteScript.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'GR Cup 2026',
      url: 'https://grcup.es',
      description: 'Copa de powerlifting en España. Competición de squat, bench press y deadlift.',
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://grcup.es/inscripcion',
        },
        'query-input': 'required name=search_term_string',
      },
    });
    websiteScript.setAttribute('data-ui', 'json-ld-website');
    document.head.appendChild(websiteScript);

    return () => {
      const existing = document.querySelector('[data-ui="json-ld-sports-event"]');
      if (existing) existing.remove();
      const existingWebsite = document.querySelector('[data-ui="json-ld-website"]');
      if (existingWebsite) existingWebsite.remove();
    };
  }, [jsonLd]);

  useEffect(() => {
    fetchParticipantCount()
      .then(count => {
        participantCount.value = count;
      })
      .catch(() => {
        participantCount.value = 0;
      });
  }, []);

  return (
    <>
      <Head {...pageMetaConfig['/']} />
      <main className="min-h-screen bg-dark-base">
      {/* Hero Section */}
      <HeroSection />

      {/* Test Section - For navbar appearance testing */}
      <TestSection />

      {/* Athletes Section - Competition and effort theme */}
      <AthletesSection />

      {/* Prices All Movements Section - Best in each movement */}
      <PricesAllMovementsSection />

      {/* Organization & Equipment Section - Competition organization and high quality equipment */}
      <OrganizationEquipmentSection />

      {/* Raffle Section - Sorteo belt animation */}
      <RaffleSection />

      {/* Weight Categories Section - Competition categories */}
      <WeightCategoriesSection />

      {/* Schedules Section - Competition schedule by date */}
      <SchedulesSection />

      {/* Localización Section - Venue information */}
      <LocalizacionSection />
      </main>
    </>
  );
}

export default Home;
