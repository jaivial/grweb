import { useMemo, useCallback, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Mail, ArrowLeft } from 'lucide-react';
import { FER_COLORS } from '../constants';

interface DuplicateEmailPanelProps {
  contactEmail?: string;
  onRetry: () => void;
}

export function DuplicateEmailPanel({ contactEmail, onRetry }: DuplicateEmailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = setTimeout(() => {
      panelRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'center',
      });
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const handleRetry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  const mailtoHref = useMemo(
    () => (contactEmail ? `mailto:${contactEmail}` : undefined),
    [contactEmail]
  );

  return (
    <motion.div
      key="duplicate-email-panel"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="p-8 sm:p-10 rounded-3xl text-center"
      style={{
        backgroundColor: FER_COLORS.bgDark,
        border: `1px solid ${FER_COLORS.red}25`,
      }}
      ref={panelRef}
      data-ui="duplicate-email-panel"
    >
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
        style={{
          backgroundColor: `${FER_COLORS.red}12`,
          border: `1px solid ${FER_COLORS.red}20`,
        }}
        data-ui="duplicate-email-icon-wrapper"
      >
        <Mail
          size={28}
          style={{ color: FER_COLORS.red }}
          data-ui="duplicate-email-icon"
          aria-hidden="true"
        />
      </div>

      <h3
        className="text-xl sm:text-2xl font-display font-bold mb-3"
        style={{ color: FER_COLORS.text }}
        data-ui="duplicate-email-title"
      >
        Email ya registrado
      </h3>

      <p
        className="text-sm sm:text-base leading-relaxed mb-6 max-w-md mx-auto"
        style={{ color: FER_COLORS.textMuted }}
        data-ui="duplicate-email-message"
      >
        Este email ya está registrado en esta competición. Si necesitas hacer alguna
        modificación, contacta con GRStrength:
      </p>

      {contactEmail ? (
        <a
          href={mailtoHref}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-[1.03]"
          style={{
            backgroundColor: `${FER_COLORS.accent}15`,
            color: FER_COLORS.accent,
            border: `1px solid ${FER_COLORS.accent}25`,
          }}
          data-ui="duplicate-email-contact-link"
        >
          <Mail size={16} data-ui="duplicate-email-contact-icon" aria-hidden="true" />
          {contactEmail}
        </a>
      ) : (
        <p
          className="text-sm font-semibold"
          style={{ color: FER_COLORS.accent }}
          data-ui="duplicate-email-generic-contact"
        >
          Contacta con el club
        </p>
      )}

      <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${FER_COLORS.accent}10` }} data-ui="duplicate-email-divider">
        <button
          type="button"
          onClick={handleRetry}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            backgroundColor: FER_COLORS.bgCard,
            color: FER_COLORS.textMuted,
            border: `1px solid ${FER_COLORS.accent}15`,
          }}
          data-ui="duplicate-email-retry-btn"
        >
          <ArrowLeft size={16} data-ui="duplicate-email-retry-icon" aria-hidden="true" />
          Reintentar con otro email
        </button>
      </div>
    </motion.div>
  );
}
