import type { JSX } from 'react';
import { Button } from '@components/ui/Button';
import { Icon } from '@components/ui/Icon';
import { Card } from '@components/ui/Card';
import { generateShareMessage, getTwitterShareUrl, getFacebookShareUrl } from '../utils/formatters';

interface ShareButtonsProps {
  ticketCount: number;
}

/**
 * Share Buttons Component
 * Allows users to share their entry on social media
 */
export function ShareButtons({ ticketCount }: ShareButtonsProps): JSX.Element {
  const message = generateShareMessage(ticketCount);

  const handleTwitterShare = () => {
    window.open(getTwitterShareUrl(message), '_blank', 'width=600,height=400');
  };

  const handleFacebookShare = () => {
    window.open(getFacebookShareUrl(), '_blank', 'width=600,height=400');
  };

  const handleInstagramShare = () => {
    // Copy message to clipboard
    navigator.clipboard.writeText(message).then(() => {
      alert('Message copied to clipboard! Share it on Instagram.');
    });
  };

  return (
    <Card variant="outlined" padding="md" className="mb-8 animate-slide-up" style={{ animationDelay: '0.4s' }}>
      <h3 className="text-lg font-semibold text-white mb-4 text-center">
        Share the Excitement!
      </h3>
      
      <p className="text-gray-400 text-sm text-center mb-6">
        Let your friends know about the GR Cup Raffle
      </p>
      
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {/* Twitter */}
        <Button
          variant="outline"
          size="md"
          onClick={handleTwitterShare}
          leftIcon={<Icon name="twitter" size="sm" />}
          className="flex-1 sm:flex-none"
        >
          Twitter
        </Button>
        
        {/* Facebook */}
        <Button
          variant="outline"
          size="md"
          onClick={handleFacebookShare}
          leftIcon={<Icon name="facebook" size="sm" />}
          className="flex-1 sm:flex-none"
        >
          Facebook
        </Button>
        
        {/* Instagram */}
        <Button
          variant="outline"
          size="md"
          onClick={handleInstagramShare}
          leftIcon={<Icon name="instagram" size="sm" />}
          className="flex-1 sm:flex-none"
        >
          Instagram
        </Button>
      </div>
    </Card>
  );
}

export default ShareButtons;
