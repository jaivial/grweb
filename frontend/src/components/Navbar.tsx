import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { logout } from '../stores/auth';

// Returns true if navbar should always show at full opacity
function isFullOpacityPage(pathname: string): boolean {
  return pathname === '/inscripcion' || pathname === '/horarios' || pathname === '/como-llegar';
}

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const fullOpacity = isFullOpacityPage(location);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler, { passive: true });
    handler(); // Check initial scroll position
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const isTransparentBg = !fullOpacity && !scrolled && location === '/';

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      isTransparentBg
        ? 'bg-transparent'
        : 'bg-dark-base/95 backdrop-blur-md border-b border-gray-800'
    }`}>
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/grcuplogo.png"
            alt="GR Cup Logo"
            className="w-10 h-10 object-contain"
          />
          <a href="/" className="text-xl font-black font-mono text-red-accent">
            GR <span className="text-dark-red">CUP</span>
          </a>
        </div>

        {/* Desktop Links */}
        <div className="hidden md:flex items-center gap-8">
          <a href="/#hero" className="text-sm text-zinc-400 hover:text-white transition-colors">Home</a>
          <a href="/raffle" className="text-sm text-zinc-400 hover:text-white transition-colors">Sorteo</a>
          <a href="/checkout" className="px-6 py-2 bg-gradient-to-r from-red-accent to-dark-red text-white font-bold rounded-lg hover:scale-105 transition-transform text-sm">
            Enter Now
          </a>
        </div>

        {/* Mobile Hamburger */}
        <button
          className="md:hidden p-2 text-red-accent"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? '\u2715' : '\u2630'}
        </button>
      </nav>

      {/* Mobile Menu */}
      <div className={`md:hidden overflow-hidden transition-all duration-300 ${
        menuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
      } bg-dark-surface border-t border-gray-800`}>
        <div className="px-4 py-4 space-y-4">
          <a href="/#hero" onClick={() => setMenuOpen(false)} className="block text-gray-300 hover:text-red-accent">Home</a>
          <a href="/raffle" onClick={() => setMenuOpen(false)} className="block text-gray-300 hover:text-red-accent">Sorteo</a>
          <a
            href="/checkout"
            onClick={() => setMenuOpen(false)}
            className="block px-6 py-2 bg-gradient-to-r from-red-accent to-dark-red text-white font-bold rounded-lg text-center"
          >
            Enter Now
          </a>
        </div>
      </div>
    </header>
  );
}
