import type { JSX } from 'react';
import { Button } from '@components/ui/Button';
import { Icon } from '@components/ui/Icon';

/**
 * Action Buttons Component
 * Provides navigation options after purchase
 */
export function ActionButtons(): JSX.Element {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center animate-slide-up" style={{ animationDelay: '0.5s' }}>
      {/* Return Home */}
      <Button
        variant="outline"
        size="lg"
        onClick={() => {
          window.location.href = '/';
        }}
        leftIcon={<Icon name="home" size="sm" />}
      >
        Return Home
      </Button>
    </div>
  );
}

export default ActionButtons;
