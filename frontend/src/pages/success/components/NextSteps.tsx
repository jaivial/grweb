import type { JSX } from 'react';
import { Card } from '@components/ui/Card';
import { Icon } from '@components/ui/Icon';

/**
 * Next Steps Component
 * Displays what happens after successful purchase
 */
export function NextSteps(): JSX.Element {
  const steps = [
    {
      icon: 'mail',
      title: 'Confirmation Email',
      description: 'You\'ll receive a confirmation email shortly with your ticket details.',
    },
    {
      icon: 'calendar',
      title: 'Wait for the Draw',
      description: 'The winner will be randomly selected after the ticket sales close.',
    },
    {
      icon: 'sparkles',
      title: 'Winner Announcement',
      description: 'The winner will be announced on our website and social media.',
    },
  ];

  return (
    <Card variant="gradient" padding="lg" className="mb-8 animate-slide-up" style={{ animationDelay: '0.3s' }}>
      <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
        <Icon name="info" color="red-accent" size="md" />
        What Happens Next?
      </h3>
      
      <div className="space-y-4">
        {steps.map((step, index) => (
          <div key={step.title} className="flex items-start gap-4">
            {/* Step number */}
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-accent/20 flex items-center justify-center">
              <span className="text-red-accent font-bold text-sm">{index + 1}</span>
            </div>
            
            {/* Content */}
            <div className="flex-1">
              <h4 className="text-white font-medium mb-1">{step.title}</h4>
              <p className="text-gray-400 text-sm">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default NextSteps;
