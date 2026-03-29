import type { JSX } from 'react';
import { useEffect } from 'react';
import { 
  HeroSection, 
  TestSection,
  AthletesSection,
  PricesAllMovementsSection,
  OrganizationEquipmentSection,
  WeightCategoriesSection,
  RulesSection, 
  HowToEnterSection, 
  WinnersSection,
  Footer 
} from './components';
import { fetchParticipantCount } from './lib/api';
import { participantCount } from './atoms/state';

export function Home(): JSX.Element {
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

      {/* Weight Categories Section - Competition categories */}
      <WeightCategoriesSection />

      {/* Rules Section */}
      <RulesSection />

      {/* How to Enter Section */}
      <HowToEnterSection />

      {/* Winners Section */}
      <WinnersSection />

      {/* Footer */}
      <Footer />
    </main>
  );
}

export default Home;
