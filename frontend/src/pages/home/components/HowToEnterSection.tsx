import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { Button } from '@components/ui/Button';

interface Step {
  number: number;
  title: string;
  description: string;
  icon: string;
}

const steps: Step[] = [
  {
    number: 1,
    title: 'Choose Your Tickets',
    description: 'Select how many tickets you want to purchase. Each ticket costs 0.50€.',
    icon: 'ticket',
  },
  {
    number: 2,
    title: 'Fill In Your Details',
    description: 'Enter your first name, surname, Instagram username, and email address.',
    icon: 'user',
  },
  {
    number: 3,
    title: 'Follow @grstrength',
    description: 'Make sure you follow @grstrength on Instagram to be eligible.',
    icon: 'instagram',
  },
  {
    number: 4,
    title: 'Complete Payment',
    description: 'Pay securely via Stripe Checkout with your card.',
    icon: 'credit-card',
  },
  {
    number: 5,
    title: 'Wait for the Draw',
    description: 'The winner will be randomly selected and announced on the website.',
    icon: 'target',
  },
];

export function HowToEnterSection(): JSX.Element {
  return (
    <section id="how-to-enter" className="min-h-screen py-24 px-4 bg-dark-base" data-ui="how-to-enter-section">
      <div className="max-w-6xl mx-auto" data-ui="how-to-enter-container">
        {/* Section Header */}
        <div className="text-center mb-16" data-ui="how-to-enter-header">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4" data-ui="how-to-enter-title">
            How to Enter
          </h2>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto" data-ui="how-to-enter-subtitle">
            It's quick and easy! Follow these 5 simple steps to enter the GR Cup Raffle.
          </p>
        </div>

        {/* Steps */}
        <div className="relative" data-ui="how-to-enter-steps">
          {/* Connection line */}
          <div className="hidden lg:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-red-accent via-dark-red to-red-accent transform -translate-x-1/2" data-ui="steps-connection-line" />

          {/* Steps List */}
          <div className="space-y-12" data-ui="steps-list">
            {steps.map((step, index) => (
              <div
                key={step.number}
                className={`relative flex flex-col lg:flex-row items-center gap-8 ${
                  index % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
                data-ui={`step-row-${step.number}`}
              >
                {/* Step Card */}
                <div className={`flex-1 ${index % 2 === 1 ? 'lg:text-right' : ''}`} data-ui={`step-card-${step.number}`}>
                  <div className="p-8 rounded-2xl bg-dark-surface border border-dark-border hover:border-red-accent/50 transition-all duration-300" data-ui={`step-card-inner-${step.number}`}>
                    {/* Step number */}
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-accent text-white font-bold text-lg mb-4" data-ui={`step-number-${step.number}`}>
                      {step.number}
                    </div>

                    {/* Title */}
                    <h3 className="text-2xl font-bold text-white mb-3" data-ui={`step-title-${step.number}`}>
                      {step.title}
                    </h3>

                    {/* Description */}
                    <p className="text-gray-400" data-ui={`step-description-${step.number}`}>
                      {step.description}
                    </p>
                  </div>
                </div>

                {/* Icon */}
                <div className="relative z-10 w-16 h-16 rounded-full bg-dark-surface border-4 border-red-accent flex items-center justify-center flex-shrink-0" data-ui={`step-icon-${step.number}`}>
                  <Icon name={step.icon as any} color="red-accent" size="lg" />
                </div>

                {/* Spacer for alternating layout */}
                <div className="flex-1 hidden lg:block" data-ui={`step-spacer-${step.number}`} />
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="mt-16 text-center" data-ui="how-to-enter-cta">
          <Button
            variant="secondary"
            size="xl"
            onClick={() => {
              window.location.href = '/checkout';
            }}
            className="shadow-lg shadow-dark-red/30"
            data-testid="how-to-enter-cta-btn"
          >
            Get Your Tickets Now
          </Button>
        </div>
      </div>
    </section>
  );
}

export default HowToEnterSection;
