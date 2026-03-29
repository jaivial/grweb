import { FC } from 'react';
import { useEffect, useState } from 'react';

export interface NavbarProps {
  className?: string;
}

/**
 * Navbar Component
 * 
 * Glassmorphism-style navbar with minimal design.
 * Features:
 * - Backdrop blur effect
 * - Semi-transparent dark background
 * - Horizontal margins (not full width)
 * - 0.6rem border-radius
 * - No border outline
 * - Appears when hero section is 98% out of viewport
 */
export const Navbar: FC<NavbarProps> = ({ className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Listen for hero visibility changes
    const handleHeroVisibility = (e: CustomEvent<{ isVisible: boolean }>) => {
      setIsVisible(!e.detail.isVisible);
    };

    window.addEventListener('heroVisibilityChange', handleHeroVisibility as EventListener);

    return () => {
      window.removeEventListener('heroVisibilityChange', handleHeroVisibility as EventListener);
    };
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
      } ${className}`}
    >
      <div className="mx-4 md:mx-8 lg:mx-12 mt-4">
        <div
          className="px-6 py-4 relative overflow-hidden"
          style={{
            background: 'rgba(10, 10, 10, 0.7)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '0.6rem',
            border: '1px solid rgba(139, 0, 0, 0.3)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 0 60px rgba(139, 0, 0, 0.05)',
          }}
        >
          {/* Red accent glow at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 50%, transparent 100%)',
            }}
          />
          {/* Subtle red corner glow */}
          <div
            className="absolute top-0 left-0 w-24 h-24 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at top left, rgba(139, 0, 0, 0.15) 0%, transparent 70%)',
            }}
          />
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img
                src="/grcuplogo.png"
                alt="GR Cup Logo"
                className="w-auto h-8 object-contain"
              />
            </div>

            {/* Navigation Links */}
            <div className="flex items-center gap-6">
              <a
                href="#rules"
                className="text-gray-300 hover:text-white transition-colors duration-200 text-sm font-medium hidden md:block"
              >
                Rules
              </a>
              <a
                href="#how-to-enter"
                className="text-gray-300 hover:text-white transition-colors duration-200 text-sm font-medium hidden md:block"
              >
                How to Enter
              </a>
              <a
                href="#winners"
                className="text-gray-300 hover:text-white transition-colors duration-200 text-sm font-medium hidden md:block"
              >
                Winners
              </a>
              
              {/* CTA Button */}
              <button
                onClick={() => {
                  document.getElementById('rules')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-4 py-2 bg-gradient-to-r from-red-accent to-dark-red text-white font-semibold rounded-lg hover:shadow-red-accent transition-all duration-200 text-sm"
              >
                Enter Now
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};
