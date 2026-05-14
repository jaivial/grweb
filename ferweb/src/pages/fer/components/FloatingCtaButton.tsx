import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap } from 'lucide-react';
import { FER_COLORS } from '../constants';

interface FloatingCtaButtonProps {
  /** Called when the user clicks the button */
  onCtaClick: () => void;
}

/**
 * Floating "¡Inscríbete ya!" button that follows the user across the homepage.
 * Hidden when the hero section is ≥50% visible (top of page) or when the
 * inscription form section is ≥50% visible (user reached the form).
 */
export function FloatingCtaButton({ onCtaClick }: FloatingCtaButtonProps): JSX.Element {
  const [isVisible, setIsVisible] = useState(false);
  const heroHiddenRef = useRef(false);
  const formHiddenRef = useRef(false);

  useEffect(() => {
    const heroEl = document.querySelector('[data-ui="fer-hero-section"]');
    const formEl = document.querySelector('[data-ui="fer-inscripcion-section"]');

    const evaluate = () => {
      setIsVisible(!heroHiddenRef.current && !formHiddenRef.current);
    };

    let observer: IntersectionObserver | null = null;

    if (heroEl || formEl) {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const el = entry.target;
            const isHalfVisible = entry.isIntersecting && entry.intersectionRatio >= 0.5;

            if (el === heroEl) {
              heroHiddenRef.current = isHalfVisible;
            }
            if (el === formEl) {
              formHiddenRef.current = isHalfVisible;
            }
          }
          evaluate();
        },
        { threshold: [0, 0.5] }
      );

      if (heroEl) observer.observe(heroEl);
      if (formEl) observer.observe(formEl);
    } else {
      // If neither exists yet, show the button by default
      setIsVisible(true);
    }

    return () => {
      observer?.disconnect();
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
