import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Award } from 'lucide-react';
import { FER_COLORS } from '../../fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';
import { CLUB_PHOTOS } from '../../fer/constants/clubPhotos';
import { TEAM_MEMBERS, SOBRE_SECTION_IDS } from '../constants';

const TEAM_PHOTOS = [
  CLUB_PHOTOS.portraits[0],
  CLUB_PHOTOS.portraits[4],
  CLUB_PHOTOS.portraits[8],
] as const;

export function TeamSection() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const containerVariants = useMemo(
    () => ({
      hidden: { opacity: 0 },
      visible: {
        opacity: 1,
        transition: { staggerChildren: 0.12, delayChildren: 0.15 },
      },
    }),
    []
  );

  const itemVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 25 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <section
      id={SOBRE_SECTION_IDS.team}
      className="py-16 sm:py-20 md:py-28 px-4"
      style={{ backgroundColor: FER_COLORS.bgCard }}
      data-ui="sobre-team-section"
    >
      <div
        className="max-w-5xl mx-auto"
        data-ui="sobre-team-container"
      >
        {/* Header */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
          variants={containerVariants}
          className="text-center mb-12 sm:mb-16"
          data-ui="sobre-team-header"
        >
          <motion.h2
            variants={itemVariants}
            className="text-3xl sm:text-4xl md:text-5xl font-display font-bold mb-4"
            style={{ color: FER_COLORS.text }}
            data-ui="sobre-team-title"
          >
            Nuestro{' '}
            <span style={{ color: FER_COLORS.glow }} data-ui="sobre-team-title-highlight">
              equipo
            </span>
          </motion.h2>
          <motion.div
            variants={itemVariants}
            className="w-20 h-1 mx-auto rounded-full mb-6"
            style={{ backgroundColor: FER_COLORS.accent }}
            data-ui="sobre-team-divider"
            aria-hidden="true"
          />
          <motion.p
            variants={itemVariants}
            className="text-base sm:text-lg max-w-xl mx-auto leading-relaxed"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="sobre-team-subtitle"
          >
            Las personas que hacen posible cada competición, cada entrenamiento, cada meta.
          </motion.p>
        </motion.div>

        {/* Team cards */}
        <motion.div
          initial={prefersReducedMotion ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 sm:gap-6"
          data-ui="sobre-team-grid"
        >
          {TEAM_MEMBERS.map((member, i) => (
            <TeamCard
              key={`team-${i}`}
              member={member}
              photoSrc={TEAM_PHOTOS[i]}
              index={i}
            />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

function TeamCard({
  member,
  photoSrc,
  index,
}: {
  member: { name: string; role: string; description: string };
  photoSrc: string;
  index: number;
}) {
  const resolvedSrc = useCdnImage(photoSrc);

  const cardVariants = useMemo(
    () => ({
      hidden: { opacity: 0, y: 25 },
      visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
    }),
    []
  );

  return (
    <motion.div
      variants={cardVariants}
      className="rounded-2xl overflow-hidden transition-all duration-200 hover:scale-[1.02]"
      style={{
        backgroundColor: FER_COLORS.bgDark,
        border: `1px solid ${FER_COLORS.accent}12`,
      }}
      data-ui={`sobre-team-card-${index}`}
    >
      {/* Photo */}
      <div
        className="relative aspect-[4/5] overflow-hidden"
        data-ui={`sobre-team-card-photo-${index}`}
      >
        <img
          src={resolvedSrc}
          alt={member.name}
          className="w-full h-full object-cover"
          loading="lazy"
          decoding="async"
          data-ui={`sobre-team-card-photo-img-${index}`}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, transparent 50%, ${FER_COLORS.bgDark} 100%)`,
          }}
          data-ui={`sobre-team-card-photo-overlay-${index}`}
          aria-hidden="true"
        />
      </div>

      {/* Info */}
      <div
        className="p-5 sm:p-6 -mt-8 relative z-10"
        data-ui={`sobre-team-card-info-${index}`}
      >
        <h3
          className="text-lg sm:text-xl font-semibold mb-1"
          style={{ color: FER_COLORS.text }}
          data-ui={`sobre-team-card-name-${index}`}
        >
          {member.name}
        </h3>
        <div
          className="flex items-center gap-2 mb-3"
          data-ui={`sobre-team-card-role-wrapper-${index}`}
        >
          <Award
            size={14}
            style={{ color: FER_COLORS.accent }}
            data-ui={`sobre-team-card-role-icon-${index}`}
          />
          <span
            className="text-sm font-medium"
            style={{ color: FER_COLORS.accent }}
            data-ui={`sobre-team-card-role-${index}`}
          >
            {member.role}
          </span>
        </div>
        <p
          className="text-sm leading-relaxed"
          style={{ color: FER_COLORS.textMuted }}
          data-ui={`sobre-team-card-desc-${index}`}
        >
          {member.description}
        </p>
      </div>
    </motion.div>
  );
}
