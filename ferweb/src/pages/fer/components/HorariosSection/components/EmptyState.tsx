import { motion } from 'framer-motion';
import { CalendarClock } from 'lucide-react';
import { FER_COLORS } from '../../../constants';

export function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-20"
      data-ui="horarios-empty-state"
    >
      {/* Radial glow behind icon */}
      <div
        className="absolute w-40 h-40 rounded-full pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${FER_COLORS.gold}10 0%, transparent 65%)`,
        }}
        aria-hidden="true"
        data-ui="horarios-empty-glow"
      />

      <motion.div
        className="relative w-24 h-24 rounded-full flex items-center justify-center mb-8"
        style={{
          backgroundColor: `${FER_COLORS.accent}10`,
          border: `1px solid ${FER_COLORS.accent}20`,
          boxShadow: `0 0 40px ${FER_COLORS.gold}15, inset 0 0 20px ${FER_COLORS.accent}08`,
        }}
        animate={{
          boxShadow: [
            `0 0 40px ${FER_COLORS.gold}15, inset 0 0 20px ${FER_COLORS.accent}08`,
            `0 0 60px ${FER_COLORS.gold}25, inset 0 0 30px ${FER_COLORS.accent}12`,
            `0 0 40px ${FER_COLORS.gold}15, inset 0 0 20px ${FER_COLORS.accent}08`,
          ],
        }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        data-ui="horarios-empty-icon-container"
      >
        <CalendarClock
          size={44}
          style={{ color: FER_COLORS.gold }}
          data-ui="horarios-empty-icon"
        />
      </motion.div>

      <h3
        className="text-2xl sm:text-3xl font-display font-bold mb-3"
        style={{ color: FER_COLORS.text }}
        data-ui="horarios-empty-title"
      >
        Pr&oacute;ximamente
      </h3>
      <p
        className="text-base sm:text-lg text-center max-w-md leading-relaxed"
        style={{ color: FER_COLORS.textMuted }}
        data-ui="horarios-empty-subtitle"
      >
        Estamos preparando los horarios de la competici&oacute;n.
        <br />
        <span style={{ color: FER_COLORS.gold }} data-ui="horarios-empty-subtitle-highlight">
          &iexcl;Te avisaremos cuando est&eacute;n listos!
        </span>
      </p>
    </div>
  );
}
