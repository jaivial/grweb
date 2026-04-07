import type { JSX } from 'react';
import { generateShareMessage, getTwitterShareUrl, getFacebookShareUrl } from '../utils/formatters';

interface ShareButtonsProps {
  ticketCount: number;
}

export function ShareButtons({ ticketCount }: ShareButtonsProps): JSX.Element {
  const message = generateShareMessage(ticketCount);

  const handleTwitterShare = () => {
    window.open(getTwitterShareUrl(message), '_blank', 'width=600,height=400');
  };

  const handleFacebookShare = () => {
    window.open(getFacebookShareUrl(), '_blank', 'width=600,height=400');
  };

  const handleInstagramShare = () => {
    navigator.clipboard.writeText(message).then(() => {
      alert('Mensaje copiado al portapapeles. Compártelo en Instagram.');
    });
  };

  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-5 mb-6" data-ui="share-section">
      <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider mb-4 text-center" data-ui="share-title">
        Comparte con tus amigos
      </h3>

      <div className="flex gap-3 justify-center" data-ui="share-buttons">
        <button
          onClick={handleTwitterShare}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
          data-ui="share-twitter"
        >
          Twitter
        </button>
        <button
          onClick={handleFacebookShare}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
          data-ui="share-facebook"
        >
          Facebook
        </button>
        <button
          onClick={handleInstagramShare}
          className="px-4 py-2.5 min-h-[44px] text-sm font-medium text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors"
          data-ui="share-instagram"
        >
          Instagram
        </button>
      </div>
    </div>
  );
}

export default ShareButtons;
