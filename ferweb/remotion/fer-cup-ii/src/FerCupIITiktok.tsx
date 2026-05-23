import {useMemo} from 'react';
import {
  AbsoluteFill,
  Easing,
  Img,
  Sequence,
  Video,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {FER_CUP_II_MEDIA} from './media';

// ── Color palette ────────────────────────────────────────────────────────────
const GOLD = '#D4AF37';
const DARK_GOLD = '#B8860B';
const BONE = '#F5F5DC';
const MUTED = '#C8C8B0';
const INK = '#0A0A0A';
const DARK_BG = '#0A0A0A';

// ── Event copy ───────────────────────────────────────────────────────────────
const COPY = {
  event: 'FER CUP II',
  organizer: 'GR STRENGTH',
  presentedBy: 'GR STRENGTH presenta',
  tagline: 'Tu primera competición de Powerlifting',
  date: '25 JULIO 2026',
  location: 'ALMUSSAFES',
  venue: 'Pabellón Municipal de Almussafes',
  address: 'Calle Paralelo, nº2, Bloque A, Puerta 3',
  city: '46440 Almussafes (Valencia)',
  cta: 'INSCRIBIRME',
  instagram: '@ferentrenamiento',
  lifts: {
    squat: 'SENTADILLA',
    bench: 'PRESS DE BANCA',
    deadlift: 'PESO MUERTO',
  },
} as const;

// ── Shared style helpers ──────────────────────────────────────────────────────
const BASE_IMAGE_STYLE = {
  height: '100%',
  objectFit: 'cover' as const,
  width: '100%',
};

const CENTERED = {
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};

const STRONG_SHADOW = '0 18px 70px rgba(0,0,0,0.78), 0 0 40px rgba(212,175,55,0.18)';

// ── ACT 1: Hook (0–90 frames / 0–3s) ─────────────────────────────────────────
function Act1Hook() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const pop = spring({frame, fps, config: {damping: 14, stiffness: 110}});
  const opacity = interpolate(frame, [0, 12, 72, 90], [0, 1, 1, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const logoStyle = useMemo(
    () => ({
      filter: 'drop-shadow(0 0 48px rgba(212,175,55,0.5))',
      height: 380,
      objectFit: 'contain' as const,
      opacity,
      transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])}) rotate(${interpolate(pop, [0, 1], [-6, 0])}deg)`,
      width: 380,
    }),
    [opacity, pop],
  );

  const presentedStyle = useMemo(
    () => ({
      color: GOLD,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 42,
      letterSpacing: 6,
      marginBottom: 24,
      opacity,
      textTransform: 'uppercase' as const,
    }),
    [opacity],
  );

  const titleStyle = useMemo(
    () => ({
      color: BONE,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 148,
      letterSpacing: 4,
      lineHeight: 0.85,
      opacity,
      textShadow: STRONG_SHADOW,
    }),
    [opacity],
  );

  return (
    <AbsoluteFill data-ui="act1-hook" style={{background: DARK_BG}}>
      {/* Gradient overlay */}
      <div
        data-ui="act1-overlay"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.3) 0%, rgba(10,10,10,0.7) 100%)',
          bottom: 0,
          left: 0,
          position: 'absolute' as const,
          right: 0,
          top: 0,
        }}
      />
      <AbsoluteFill data-ui="act1-content" style={{...CENTERED}}>
        <div data-ui="act1-presented" style={presentedStyle}>
          {COPY.presentedBy}
        </div>
        <Img
          data-ui="act1-logo"
          src={FER_CUP_II_MEDIA.logo}
          style={logoStyle}
        />
        <div data-ui="act1-title" style={titleStyle}>
          {COPY.event}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── ACT 2: Hero Ken Burns Image (90–210 frames / 3–7s) ────────────────────────
// hero-background.webm does NOT exist on CDN — use Ken Burns photo instead
function Act2HeroImage() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Local frame within this sequence (starts at 0 when sequence begins at 90)
  const local = frame;

  // Fade in/out for the whole act
  const opacity = interpolate(local, [0, 20, 190, 210], [0, 1, 1, 0], {
    easing: Easing.out(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Ken Burns: slow zoom-in over the duration
  const kbProgress = interpolate(local, [0, 210], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const scale = interpolate(kbProgress, [0, 1], [1.0, 1.18]);
  const translateX = interpolate(kbProgress, [0, 1], [-1.5, 1.5]);
  const translateY = interpolate(kbProgress, [0, 1], [-1, 1]);

  // Text animations
  const taglineEnter = spring({
    frame: local,
    fps,
    config: {damping: 16, stiffness: 100},
  });
  const taglineOpacity = interpolate(local, [10, 40, 180, 210], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const taglineStyle = useMemo(
    () => ({
      color: BONE,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 52,
      letterSpacing: 3,
      opacity: taglineOpacity * taglineEnter,
      textAlign: 'center' as const,
      textShadow: STRONG_SHADOW,
      transform: `translateY(${interpolate(taglineEnter, [0, 1], [40, 0])}px)`,
    }),
    [taglineOpacity, taglineEnter],
  );

  const logoScale = interpolate(local, [30, 80], [0.8, 1], {
    easing: Easing.out(Easing.back(1.2)),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const logoStyle = useMemo(
    () => ({
      filter: 'drop-shadow(0 0 36px rgba(212,175,55,0.4))',
      height: 160,
      objectFit: 'contain' as const,
      opacity,
      transform: `scale(${logoScale})`,
      width: 160,
    }),
    [opacity, logoScale],
  );

  const imageStyle = useMemo(
    () => ({
      ...BASE_IMAGE_STYLE,
      filter: 'saturate(0.9) brightness(0.7)',
      opacity: 0.9,
      transform: `scale(${scale}) translate(${translateX}%, ${translateY}%)`,
    }),
    [scale, translateX, translateY],
  );

  return (
    <AbsoluteFill data-ui="act2-hero" style={{opacity}}>
      {/* Ken Burns hero image */}
      <Img
        data-ui="act2-image"
        src={FER_CUP_II_MEDIA.heroBackgroundImage}
        style={imageStyle}
      />
      {/* Dark gradient overlay for text readability */}
      <div
        data-ui="act2-gradient"
        style={{
          background:
            'linear-gradient(180deg, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.6) 50%, rgba(10,10,10,0.9) 100%)',
          bottom: 0,
          left: 0,
          position: 'absolute' as const,
          right: 0,
          top: 0,
        }}
      />
      <AbsoluteFill data-ui="act2-content" style={{...CENTERED}}>
        <Img
          data-ui="act2-logo"
          src={FER_CUP_II_MEDIA.logo}
          style={logoStyle}
        />
        <div data-ui="act2-tagline" style={taglineStyle}>
          {COPY.tagline}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

// ── Lift clip component ───────────────────────────────────────────────────────
type LiftClipProps = {
  readonly src: string;
  readonly label: string;
  readonly startFrom?: number;
  readonly duration?: number;
};

function LiftClip({src, label, startFrom = 0, duration = 90}: LiftClipProps) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Flash effect at start
  const flashOpacity = interpolate(frame, [0, 4, 12], [0.4, 0.05, 0], {
    extrapolateRight: 'clamp',
  });

  // Text spring in
  const textEnter = spring({
    frame: frame - 10,
    fps,
    config: {damping: 14, stiffness: 120},
  });
  const textOpacity = interpolate(frame, [8, 30, 75, 90], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const videoStyle = useMemo(
    () => ({
      ...BASE_IMAGE_STYLE,
      filter: 'saturate(1.1) contrast(1.15) brightness(0.75)',
    }),
    [],
  );

  const flashStyle = useMemo(
    () => ({
      background: GOLD,
      bottom: 0,
      left: 0,
      mixBlendMode: 'screen' as const,
      opacity: flashOpacity,
      position: 'absolute' as const,
      right: 0,
      top: 0,
    }),
    [flashOpacity],
  );

  const labelStyle = useMemo(
    () => ({
      color: GOLD,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 108,
      left: 60,
      letterSpacing: 4,
      lineHeight: 0.9,
      opacity: textOpacity * textEnter,
      position: 'absolute' as const,
      textShadow: '0 0 60px rgba(212,175,55,0.6), 0 10px 40px rgba(0,0,0,0.8)',
      top: '50%',
      transform: `translateY(-50%) scale(${interpolate(textEnter, [0, 1], [0.7, 1])})`,
    }),
    [textOpacity, textEnter],
  );

  // Scan line effect
  const scanStyle = useMemo(
    () => ({
      backgroundImage:
        'repeating-linear-gradient(0deg, transparent 0 8px, rgba(0,0,0,0.08) 8px 10px)',
      bottom: 0,
      left: 0,
      opacity: 0.5,
      position: 'absolute' as const,
      right: 0,
      top: 0,
    }),
    [],
  );

  return (
    <AbsoluteFill data-ui={`lift-clip-${label}`}>
      <Video
        data-ui="lift-video"
        src={src}
        startFrom={startFrom}
        endAt={startFrom + duration}
        style={videoStyle}
      />
      <AbsoluteFill data-ui="lift-scanlines" style={scanStyle} />
      <AbsoluteFill data-ui="lift-flash" style={flashStyle} />
      <div data-ui="lift-label" style={labelStyle}>
        {label}
      </div>
    </AbsoluteFill>
  );
}

// ── ACT 3: Lift Montage (210–390 frames / 7–13s) ────────────────────────────
function Act3LiftMontage() {
  return (
    <AbsoluteFill data-ui="act3-montage" style={{background: INK}}>
      {/* Bench Press — frames 210–300 */}
      <Sequence from={0} durationInFrames={90}>
        <LiftClip
          src={FER_CUP_II_MEDIA.liftVideos.benchPress}
          label={COPY.lifts.bench}
          startFrom={0}
          duration={90}
        />
      </Sequence>
      {/* Squat — frames 300–390 */}
      <Sequence from={90} durationInFrames={90}>
        <LiftClip
          src={FER_CUP_II_MEDIA.liftVideos.squat}
          label={COPY.lifts.squat}
          startFrom={0}
          duration={90}
        />
      </Sequence>
      {/* Deadlift — frames 300–390 */}
      <Sequence from={180} durationInFrames={90}>
        <LiftClip
          src={FER_CUP_II_MEDIA.liftVideos.deadlift}
          label={COPY.lifts.deadlift}
          startFrom={0}
          duration={90}
        />
      </Sequence>
    </AbsoluteFill>
  );
}

// ── ACT 4: Event Details (390–510 frames / 13–17s) ─────────────────────────
function Act4EventDetails() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const local = frame;

  // Ken Burns on photo
  const kbProgress = interpolate(local, [0, 120], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Date reveal
  const dateEnter = spring({
    frame: local - 20,
    fps,
    config: {damping: 16, stiffness: 110},
  });
  const dateOpacity = interpolate(local, [15, 50, 100, 120], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Location reveal
  const locEnter = spring({
    frame: local - 40,
    fps,
    config: {damping: 18, stiffness: 105},
  });
  const locOpacity = interpolate(local, [50, 80, 100, 120], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const photoStyle = useMemo(
    () => ({
      ...BASE_IMAGE_STYLE,
      filter: 'saturate(0.85) contrast(1.2) brightness(0.55)',
      transform: `scale(${1.15 + Math.sin(kbProgress * Math.PI) * 0.08}) translate(${interpolate(kbProgress, [0, 1], [-2, 2])}%, 0)`,
    }),
    [kbProgress],
  );

  const gradientStyle = useMemo(
    () => ({
      background:
        'linear-gradient(180deg, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.7) 100%)',
      bottom: 0,
      left: 0,
      position: 'absolute' as const,
      right: 0,
      top: 0,
    }),
    [],
  );

  const dateStyle = useMemo(
    () => ({
      color: GOLD,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 96,
      left: 50,
      letterSpacing: 4,
      lineHeight: 0.9,
      opacity: dateOpacity * dateEnter,
      position: 'absolute' as const,
      textShadow: '0 0 40px rgba(212,175,55,0.5), 0 8px 30px rgba(0,0,0,0.8)',
      top: 680,
      transform: `translateY(${interpolate(dateEnter, [0, 1], [50, 0])}px)`,
    }),
    [dateOpacity, dateEnter],
  );

  const locationStyle = useMemo(
    () => ({
      color: BONE,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 64,
      left: 50,
      letterSpacing: 3,
      opacity: locOpacity * locEnter,
      position: 'absolute' as const,
      textShadow: '0 8px 30px rgba(0,0,0,0.8)',
      top: 810,
      transform: `translateY(${interpolate(locEnter, [0, 1], [40, 0])}px)`,
    }),
    [locOpacity, locEnter],
  );

  const venueStyle = useMemo(
    () => ({
      color: MUTED,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 36,
      fontWeight: 700,
      left: 50,
      letterSpacing: 2,
      opacity: locOpacity * locEnter,
      position: 'absolute' as const,
      top: 890,
      transform: `translateY(${interpolate(locEnter, [0, 1], [30, 0])}px)`,
    }),
    [locOpacity, locEnter],
  );

  const addressStyle = useMemo(
    () => ({
      color: MUTED,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 28,
      left: 50,
      letterSpacing: 1,
      opacity: locOpacity * locEnter * 0.8,
      position: 'absolute' as const,
      top: 945,
      transform: `translateY(${interpolate(locEnter, [0, 1], [20, 0])}px)`,
    }),
    [locOpacity, locEnter],
  );

  return (
    <AbsoluteFill data-ui="act4-details">
      <Img
        data-ui="act4-photo"
        src={FER_CUP_II_MEDIA.montageImages[0]}
        style={photoStyle}
      />
      <div data-ui="act4-gradient" style={gradientStyle} />
      <div data-ui="act4-date" style={dateStyle}>
        {COPY.date}
      </div>
      <div data-ui="act4-location" style={locationStyle}>
        {COPY.location}
      </div>
      <div data-ui="act4-venue" style={venueStyle}>
        {COPY.venue}
      </div>
      <div data-ui="act4-address" style={addressStyle}>
        {COPY.address}
      </div>
      <div data-ui="act4-city" style={{...addressStyle, top: 985}}>
        {COPY.city}
      </div>
    </AbsoluteFill>
  );
}

// ── ACT 5: CTA (510–600 frames / 17–20s) ─────────────────────────────────────
function Act5CTA() {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const local = frame;

  const cardEnter = spring({
    frame: local,
    fps,
    config: {damping: 16, stiffness: 105},
  });
  const cardOpacity = interpolate(local, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const logoScale = interpolate(local, [10, 50], [0.7, 1], {
    easing: Easing.out(Easing.back(1.1)),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const ctaEnter = spring({
    frame: local - 30,
    fps,
    config: {damping: 14, stiffness: 110},
  });
  const ctaOpacity = interpolate(local, [25, 50, 80, 90], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardStyle = useMemo(
    () => ({
      background:
        'linear-gradient(145deg, rgba(14,12,20,0.97), rgba(58,34,8,0.85))',
      border: `3px solid rgba(212,175,55,0.6)`,
      boxShadow:
        '0 34px 130px rgba(0,0,0,0.76), inset 0 0 130px rgba(212,175,55,0.08)',
      bottom: 0,
      left: 0,
      opacity: cardOpacity,
      position: 'absolute' as const,
      right: 0,
      top: 0,
      transform: `translateY(${interpolate(cardEnter, [0, 1], [80, 0])}px)`,
    }),
    [cardOpacity, cardEnter],
  );

  const logoStyle = useMemo(
    () => ({
      filter: 'drop-shadow(0 0 36px rgba(212,175,55,0.4))',
      height: 200,
      objectFit: 'contain' as const,
      transform: `scale(${logoScale})`,
      width: 200,
    }),
    [logoScale],
  );

  const titleStyle = useMemo(
    () => ({
      color: BONE,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 140,
      letterSpacing: 4,
      lineHeight: 0.85,
      textShadow: STRONG_SHADOW,
    }),
    [],
  );

  const ctaStyle = useMemo(
    () => ({
      background: GOLD,
      borderRadius: 8,
      color: INK,
      fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
      fontSize: 64,
      letterSpacing: 4,
      opacity: ctaOpacity * ctaEnter,
      padding: '20px 48px',
      transform: `scale(${interpolate(ctaEnter, [0, 1], [0.8, 1])})`,
    }),
    [ctaOpacity, ctaEnter],
  );

  const instagramStyle = useMemo(
    () => ({
      color: GOLD,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 42,
      fontWeight: 900,
      letterSpacing: 2,
      opacity: ctaOpacity * ctaEnter,
    }),
    [ctaOpacity, ctaEnter],
  );

  return (
    <AbsoluteFill data-ui="act5-cta" style={{background: DARK_BG}}>
      <div data-ui="act5-card" style={cardStyle}>
        <AbsoluteFill data-ui="act5-content" style={{...CENTERED}}>
          <Img
            data-ui="act5-logo"
            src={FER_CUP_II_MEDIA.logo}
            style={logoStyle}
          />
          <div data-ui="act5-title" style={titleStyle}>
            {COPY.event}
          </div>
          <div data-ui="act5-instagram" style={instagramStyle}>
            {COPY.instagram}
          </div>
          <div data-ui="act5-cta-btn" style={ctaStyle}>
            {COPY.cta}
          </div>
        </AbsoluteFill>
      </div>
    </AbsoluteFill>
  );
}

// ── Main Composition ──────────────────────────────────────────────────────────
export function FerCupIITiktok() {
  return (
    <AbsoluteFill
      data-ui="fer-cup-ii-tiktok"
      style={{
        background: DARK_BG,
        fontFamily: 'Impact, Haettenschweiler, Arial Narrow, system-ui, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Act 1: Hook — 0 to 90 frames (0–3s) */}
      <Sequence from={0} durationInFrames={90}>
        <Act1Hook />
      </Sequence>

      {/* Act 2: Hero Ken Burns Image — 90 to 210 frames (3–7s) */}
      <Sequence from={90} durationInFrames={120}>
        <Act2HeroImage />
      </Sequence>

      {/* Act 3: Lift Montage — 210 to 390 frames (7–13s) */}
      <Sequence from={210} durationInFrames={180}>
        <Act3LiftMontage />
      </Sequence>

      {/* Act 4: Event Details — 390 to 510 frames (13–17s) */}
      <Sequence from={390} durationInFrames={120}>
        <Act4EventDetails />
      </Sequence>

      {/* Act 5: CTA — 510 to 600 frames (17–20s) */}
      <Sequence from={510} durationInFrames={90}>
        <Act5CTA />
      </Sequence>
    </AbsoluteFill>
  );
}