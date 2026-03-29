import { FC, useState, useEffect } from 'react';
import { AnimatedText } from './AnimatedText';

export interface HeroTextSequenceProps {
  scrollProgress: number;
  className?: string;
}

const HERO_TEXT = 'Los ganadores nunca se rinden';
const LOGO_SRC = '/grcuplogo.png';

const TEXT_FADE_START = 0.02;
const TEXT_FADE_END = 0.08;

export const HeroTextSequence: FC<HeroTextSequenceProps> = ({
  scrollProgress,
  className = '',
}) => {
  const [hasAppeared, setHasAppeared] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasAppeared(true);
    }, 800);

    return () => clearTimeout(timer);
  }, []);

  const textOpacity = hasAppeared 
    ? Math.max(0, 1 - ((scrollProgress - TEXT_FADE_START) / (TEXT_FADE_END - TEXT_FADE_START)))
    : 0;

  const textVisible = textOpacity > 0.01;
  const showScrollHint = hasAppeared && scrollProgress < 0.05;

  return (
    <div
      className={`absolute inset-0 flex flex-col items-center justify-center ${className}`}
      style={{ zIndex: 20 }}
      data-component="HeroTextSequence"
    >
      <div className="flex-1 flex items-center justify-center">
        <AnimatedText
          text={HERO_TEXT}
          opacity={textOpacity}
          visible={textVisible}
          logoSrc={LOGO_SRC}
          textStyle="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight"
        />
      </div>
      
      <div
        className="pb-8 flex flex-col items-center transition-opacity duration-500"
        style={{ opacity: showScrollHint ? 1 : 0 }}
      >
        <span className="text-white/70 text-sm tracking-widest uppercase mb-2">desliza</span>
        <svg
          className="w-6 h-6 text-white/70 animate-bounce"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
      </div>
    </div>
  );
};
