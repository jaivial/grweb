import { useMemo } from 'react';

const CONFETTI_COLORS = [
  '#22c55e', '#4ade80', '#86efac', '#fbbf24',
  '#f59e0b', '#ef4444', '#8b5cf6', '#3b82f6',
  '#ec4899', '#14b8a6',
];

export function Confetti({ active }: { active: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        left: `${Math.random() * 100}%`,
        delay: `${Math.random() * 1.5}s`,
        duration: `${1.5 + Math.random() * 2}s`,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        size: `${6 + Math.random() * 8}px`,
        drift: `${-30 + Math.random() * 60}px`,
        round: Math.random() > 0.5,
      })),
    []
  );

  if (!active) return null;

  return (
    <div data-ui="confetti-container" className="fixed inset-0 z-[60] pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          data-ui={`confetti-particle-${p.id}`}
          className="absolute top-[-10px] animate-confetti-fall"
          style={{
            left: p.left,
            animationDelay: p.delay,
            animationDuration: p.duration,
            backgroundColor: p.color,
            width: p.size,
            height: p.size,
            borderRadius: p.round ? '50%' : '2px',
            '--confetti-drift': p.drift,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
