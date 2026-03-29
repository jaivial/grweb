import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { isAuthenticated, username, logout } from '../stores/auth';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [location] = useLocation();
  const isAdminPage = location.startsWith('/admin') && location !== '/admin/login';

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  function handleLogout() {
    logout();
    window.location.href = '/';
  }

  // Admin Navbar
  if (isAdminPage && isAuthenticated.value) {
    return (
      <header className="fixed top-0 left-0 right-0 z-50 bg-dark-base/95 backdrop-blur-md border-b border-white/10">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/grcuplogo.png"
              alt="GR Cup Logo"
              className="w-10 h-10 object-contain"
            />
            <a href="/admin/dashboard" className="text-xl font-black font-mono text-red-accent">
              GR <span className="text-dark-red">CUP</span>
              <span className="text-gray-500 text-sm ml-2">Admin</span>
            </a>
          </div>
          
          {/* Desktop Admin Links */}
          <div className="hidden md:flex items-center gap-6">
            <a 
              href="/admin/dashboard" 
              className={`text-sm transition-colors ${
                location === '/admin/dashboard' ? 'text-red-accent' : 'text-gray-400 hover:text-white'
              }`}
            >
              Dashboard
            </a>
            <a 
              href="/admin/participants" 
              className={`text-sm transition-colors ${
                location === '/admin/participants' ? 'text-red-accent' : 'text-gray-400 hover:text-white'
              }`}
            >
              Participants
            </a>
            <a 
              href="/admin/draw" 
              className={`text-sm transition-colors ${
                location === '/admin/draw' ? 'text-red-accent' : 'text-gray-400 hover:text-white'
              }`}
            >
              Draw Winner
            </a>
            <div className="h-6 w-px bg-dark-lighter"></div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-text-muted">
                {username.value}
              </div>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-semibold"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden p-2 text-red-accent"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </nav>

        {/* Mobile Admin Menu */}
        <div className={`md:hidden overflow-hidden transition-all duration-300 ${
          menuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        } bg-dark-surface border-t border-gray-700`}>
          <div className="px-4 py-4 space-y-4">
            <a 
              href="/admin/dashboard" 
              onClick={() => setMenuOpen(false)} 
              className="block text-gray-400 hover:text-red-accent"
            >
              Dashboard
            </a>
            <a 
              href="/admin/participants" 
              onClick={() => setMenuOpen(false)} 
              className="block text-gray-400 hover:text-red-accent"
            >
              Participants
            </a>
            <a 
              href="/admin/draw" 
              onClick={() => setMenuOpen(false)} 
              className="block text-gray-400 hover:text-red-accent"
            >
              Draw Winner
            </a>
            <div className="pt-4 border-t border-gray-700">
              <div className="text-gray-500 text-sm mb-3">Logged in as: {username.value}</div>
              <button
                onClick={handleLogout}
                className="w-full px-4 py-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 transition-colors text-sm font-semibold"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>
    );
  }

  // Public Navbar
  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-dark-base/95 backdrop-blur-md border-b border-gray-800' : 'bg-transparent'
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
          <a href="/#rules" className="text-sm text-zinc-400 hover:text-white transition-colors">Rules</a>
          <a href="/#how-to-enter" className="text-sm text-zinc-400 hover:text-white transition-colors">How to Enter</a>
          <a href="/#winners" className="text-sm text-zinc-400 hover:text-white transition-colors">Winners</a>
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
          {menuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile Menu */}
      <div className={`md:hidden overflow-hidden transition-all duration-300 ${
        menuOpen ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'
      } bg-dark-surface border-t border-gray-800`}>
        <div className="px-4 py-4 space-y-4">
          <a href="/#hero" onClick={() => setMenuOpen(false)} className="block text-gray-300 hover:text-red-accent">Home</a>
          <a href="/#rules" onClick={() => setMenuOpen(false)} className="block text-gray-300 hover:text-red-accent">Rules</a>
          <a href="/#how-to-enter" onClick={() => setMenuOpen(false)} className="block text-gray-300 hover:text-red-accent">How to Enter</a>
          <a href="/#winners" onClick={() => setMenuOpen(false)} className="block text-gray-300 hover:text-red-accent">Winners</a>
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
