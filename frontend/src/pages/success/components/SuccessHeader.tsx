import type { JSX } from 'react';

/**
 * Success Header Component
 * Displays an animated success checkmark and title
 */
export function SuccessHeader(): JSX.Element {
  return (
    <div className="text-center mb-12">
      {/* Animated checkmark circle */}
      <div className="relative inline-block mb-8">
        {/* Success circle */}
        <div className="w-32 h-32 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center animate-bounce-in shadow-lg shadow-green-500/30">
          {/* Checkmark */}
          <svg
            className="w-16 h-16 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="3"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5 13l4 4L19 7"
              className="animate-draw-check"
            />
          </svg>
        </div>
        
        {/* Glow effect */}
        <div className="absolute inset-0 w-32 h-32 rounded-full bg-green-500/20 blur-xl animate-pulse" />
      </div>

      {/* Title */}
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 animate-slide-up">
        You're In!
      </h1>
      
      {/* Subtitle */}
      <p className="text-xl text-gray-300 animate-slide-up" style={{ animationDelay: '0.1s' }}>
        Your tickets have been secured
      </p>
    </div>
  );
}

export default SuccessHeader;
