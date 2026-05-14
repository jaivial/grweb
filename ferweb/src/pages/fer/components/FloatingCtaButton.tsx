import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { FER_COLORS } from '../constants';

interface FloatingCtaButtonProps {
  /** Called when the user clicks the button */
  onCtaClick: () => void;
}

/**
 * Floating "¡Inscribite ya!" button that follows the user across the homepage.
 * Disappears when the inscription form section is 50% visible.
 */
export function FloatingCtaButton({ onCtaClick }: FloatingCtaButtonProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    // Observe the inscription form section — hide button when 50% in view
    const formSection = document.querySelector('[data-ui="fer-inscripcion-section"]');
    if (!formSection) {
      // If form section doesn't exist yet, show the button
      setIsVisible(true);
      return;
    }

    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            setIsVisible(false);
          } else {
            setIsVisible(true);
          }
        }
      },
      { threshold: [0, 0.5] }
    );

    observerRef.current.observe(formSection);

    return () => {
      observerRef.current?.disconnect();
    };
  }, []);

  const handleClick = useCallback(() => {
    onCtaClick();
  }, [onCtaClick]);

  return (
    <AnimatePresence>
      {isVisible && (
        <div
          className="fixed bottom-6 left-0 right-0 z-50 flex justify-center pointer-events-none"
          data-ui="floating-cta-wrapper"
        >
          <motion.button
            initial={{ y: 100, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 100, opacity: 0, scale: 0.85 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            onClick={handleClick}
            className="flex items-center gap-2.5 px-6 py-3.5 rounded-full shadow-2xl cursor-pointer select-none pointer-events-auto"
            style={{
              background: `linear-gradient(135deg, ${FER_COLORS.accent}, ${FER_COLORS.gold})`,
              boxShadow: `0 8px 32px ${FER_COLORS.accent}55, 0 0 60px ${FER_COLORS.gold}22`,
            }}
            data-ui="floating-cta-button"
          >
            <Zap
              size={18}
              className="text-white animate-pulse"
              style={{ filter: 'drop-shadow(0 0 6px rgba(255,255,255,0.4))' }}
              data-ui="floating-cta-icon"
              aria-hidden="true"
            />
            <span
              className="text-white font-bold text-sm sm:text-base tracking-wide"
              style={{ textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}
              data-ui="floating-cta-text"
            >
              ¡Inscríbete ya!
            </span>
          </motion.button>
        </div>
      )}
    </AnimatePresence>
  );
}

export default FloatingCtaButton;
