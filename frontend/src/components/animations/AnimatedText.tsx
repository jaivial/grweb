import { FC, useMemo } from 'react';

export interface AnimatedTextProps {
  text: string;
  opacity: number;
  visible: boolean;
  logoSrc?: string;
  className?: string;
  textStyle?: string;
}

export const AnimatedText: FC<AnimatedTextProps> = ({
  text,
  opacity,
  visible,
  logoSrc,
  className = '',
  textStyle = 'text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-bold tracking-tight',
}) => {
  const containerStyle = useMemo(() => ({
    opacity: visible ? opacity : 0,
    transform: `translateY(${visible ? (1 - opacity) * 20 : 20}px)`,
    transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
    pointerEvents: (visible && opacity > 0.5 ? 'auto' : 'none') as 'auto' | 'none',
  }), [opacity, visible]);

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center ${className}`}
      style={containerStyle}
      data-ui="animated-text"
    >
      <div className="text-center px-4" data-ui="animated-text-inner">
        {logoSrc && (
          <img
            src={logoSrc}
            alt="GR Cup Logo"
            className="mx-auto mb-6 w-80 h-auto"
            data-ui="animated-text-logo"
          />
        )}
        <h1
          className={textStyle}
          style={{
            color: 'rgba(255, 255, 255, 0.8)',
            letterSpacing: '-0.02em',
            fontWeight: 600,
            fontFamily: '"Contrail One", sans-serif',
            WebkitFontSmoothing: 'antialiased',
            MozOsxFontSmoothing: 'grayscale',
          }}
          data-ui="animated-text-heading"
        >
          {text}
        </h1>
      </div>
    </div>
  );
};
