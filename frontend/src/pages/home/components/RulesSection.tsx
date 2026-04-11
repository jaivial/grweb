import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';

interface Rule {
  icon: string;
  title: string;
  description: string;
}

const rules: Rule[] = [
  {
    icon: 'dollar',
    title: '0.50€ Per Ticket',
    description: 'Each ticket costs just 0.50 euros. Buy as many as you want to increase your chances of winning.',
  },
  {
    icon: 'ticket',
    title: 'Unlimited Entries',
    description: 'No restrictions on how many tickets you can purchase. More tickets = more chances to win!',
  },
  {
    icon: 'users',
    title: 'One Winner Per Person',
    description: 'Even if you buy multiple tickets, you can only win once. Fair for everyone!',
  },
  {
    icon: 'shield',
    title: 'Secure Payment',
    description: 'All payments are processed securely through Stripe. Your data is protected.',
  },
  {
    icon: 'award',
    title: 'Random Selection',
    description: 'The winner is chosen randomly using weighted selection based on ticket count.',
  },
  {
    icon: 'globe',
    title: 'Worldwide Entry',
    description: 'Enter from anywhere in the world. International participants are welcome!',
  },
];

export function RulesSection(): JSX.Element {
  return (
    <section id="rules" className="min-h-screen py-24 px-4 bg-dark-surface" data-ui="rules-section">
      <div className="max-w-6xl mx-auto" data-ui="rules-container">
        {/* Section Header */}
        <div className="text-center mb-16" data-ui="rules-header">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" data-ui="rules-title">
            Raffle Rules
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto" data-ui="rules-subtitle">
            Simple, fair, and transparent. Here's everything you need to know about the GR Cup Raffle.
          </p>
        </div>

        {/* Rules Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-ui="rules-grid">
          {rules.map((rule, index) => (
            <div
              key={rule.title}
              className="group p-6 rounded-2xl bg-dark-base border border-dark-border hover:border-red-accent/50 transition-all duration-300 hover:scale-[1.02]"
              style={{ animationDelay: `${index * 0.1}s` }}
              data-ui={`rule-card-${index}`}
            >
              {/* Icon */}
              <div className="w-12 h-12 rounded-xl bg-red-accent/10 flex items-center justify-center mb-4 group-hover:bg-red-accent/20 transition-colors" data-ui={`rule-icon-${index}`}>
                <Icon name={rule.icon as any} color="red-accent" size="lg" />
              </div>

              {/* Title */}
              <h3 className="text-xl font-bold text-white mb-2" data-ui={`rule-title-${index}`}>
                {rule.title}
              </h3>

              {/* Description */}
              <p className="text-gray-400" data-ui={`rule-description-${index}`}>
                {rule.description}
              </p>
            </div>
          ))}
        </div>

        {/* Price Callout */}
        <div className="mt-16 text-center" data-ui="rules-price-callout">
          <div className="inline-block p-8 rounded-2xl bg-gradient-to-r from-red-accent/10 to-dark-red/10 border border-red-accent/30" data-ui="rules-price-card">
            <p className="text-gray-300 mb-2" data-ui="rules-price-label">
              How much does it cost?
            </p>
            <p className="text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-accent to-dark-red" data-ui="rules-price-value">
              0.50€ per ticket
            </p>
            <p className="text-gray-500 mt-2" data-ui="rules-price-detail">
              Buy 10 tickets for just 5€ = 10x more chances!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default RulesSection;
