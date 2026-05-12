import { FER_COLORS } from '../../../constants';

export function LoadingSkeleton() {
  return (
    <div className="space-y-10" data-ui="horarios-loading-skeleton">
      {[0, 1].map((block) => (
        <div key={`skel-block-${block}`} data-ui={`horarios-skeleton-block-${block}`}>
          {/* Date header skeleton */}
          <div
            className="relative h-8 w-64 rounded-lg mb-6 overflow-hidden"
            data-ui={`horarios-skeleton-date-${block}`}
          >
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `${FER_COLORS.accent}15` }}
              data-ui={`horarios-skeleton-date-bg-${block}`}
            />
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${FER_COLORS.gold}18 40%, ${FER_COLORS.accent}18 60%, transparent 100%)`,
                animation: 'shimmer-slide 2s ease-in-out infinite',
              }}
              data-ui={`horarios-skeleton-date-shimmer-${block}`}
            />
          </div>

          {/* Row skeletons */}
          <div className="space-y-4" data-ui={`horarios-skeleton-rows-${block}`}>
            {[0, 1, 2].map((row) => (
              <div
                key={`skel-row-${block}-${row}`}
                className="relative h-20 sm:h-24 rounded-2xl overflow-hidden"
                data-ui={`horarios-skeleton-row-${block}-${row}`}
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundColor: `${FER_COLORS.bgCard}`,
                    border: `1px solid ${FER_COLORS.accent}15`,
                  }}
                  data-ui={`horarios-skeleton-row-bg-${block}-${row}`}
                />
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${FER_COLORS.gold}10 35%, ${FER_COLORS.accent}12 50%, ${FER_COLORS.gold}10 65%, transparent 100%)`,
                    animation: `shimmer-slide ${1.8 + row * 0.2}s ease-in-out infinite`,
                    animationDelay: `${row * 0.15}s`,
                  }}
                  data-ui={`horarios-skeleton-row-shimmer-${block}-${row}`}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      <style>{`
        @keyframes shimmer-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
