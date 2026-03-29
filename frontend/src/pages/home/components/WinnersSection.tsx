import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { Button } from '@components/ui/Button';
import { Badge } from '@components/ui/Badge';

interface Winner {
  name: string;
  instagram: string;
  prize: string;
  date: string;
}

const winners: Winner[] = [
  {
    name: 'Marcus R.',
    instagram: '@marcus_lifts',
    prize: 'VIP Package + Merchandise',
    date: 'GR Cup 2025',
  },
  {
    name: 'Elena K.',
    instagram: '@elena_powerlifting',
    prize: 'Competition Entry',
    date: 'GR Cup 2024',
  },
  {
    name: 'James T.',
    instagram: '@iron_james',
    prize: 'Premium Equipment',
    date: 'GR Cup 2023',
  },
];

export function WinnersSection(): JSX.Element {
  return (
    <section id="winners" className="min-h-screen py-24 px-4 bg-dark-surface">
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Past Winners
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Meet some of our lucky winners from previous GR Cup Raffles.
          </p>
        </div>

        {/* Winners Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {winners.map((winner, index) => (
            <div
              key={winner.instagram}
              className="group p-6 rounded-2xl bg-dark-base border border-dark-border hover:border-dark-red/50 transition-all duration-300 hover:scale-[1.02]"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              {/* Trophy Icon */}
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-accent to-dark-red flex items-center justify-center mb-6 mx-auto">
                <Icon name="trophy" size="xl" color="white" />
              </div>

              {/* Winner Info */}
              <div className="text-center">
                <Badge variant="warning" size="sm" className="mb-3">
                  {winner.date}
                </Badge>

                <h3 className="text-xl font-bold text-white mb-1">
                  {winner.name}
                </h3>

                <a
                  href={`https://instagram.com/${winner.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-red-accent hover:text-dark-red transition-colors mb-4 inline-block"
                >
                  {winner.instagram}
                </a>

                <p className="text-gray-400">
                  Won: <span className="text-dark-red font-semibold">{winner.prize}</span>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <p className="text-gray-400 mb-6">
            Want to be our next winner?
          </p>
          <Button
            variant="primary"
            size="xl"
            onClick={() => {
              window.location.href = '/checkout';
            }}
            className="shadow-lg shadow-red-accent/30"
            leftIcon={<Icon name="sparkles" />}
          >
            Enter Now
          </Button>
        </div>
      </div>
    </section>
  );
}

export default WinnersSection;
