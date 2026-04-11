import { FC, useEffect, useState } from 'react';
import { useLocation } from 'wouter';

export interface NavbarProps {
  className?: string;
}

export const Navbar: FC<NavbarProps> = ({ className = '' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location, navigate] = useLocation();

  const isNonHeroPage = location === '/inscripcion' || location === '/raffle' || location === '/horarios' || location === '/como-llegar';

  useEffect(() => {
    if (isNonHeroPage) {
      setIsVisible(true);
      return;
    }

    const handleHeroVisibility = (e: CustomEvent<{ isVisible: boolean }>) => {
      setIsVisible(!e.detail.isVisible);
    };

    window.addEventListener('heroVisibilityChange', handleHeroVisibility as EventListener);

    return () => {
      window.removeEventListener('heroVisibilityChange', handleHeroVisibility as EventListener);
    };
  }, [isNonHeroPage]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    if (href.startsWith('#')) {
      if (location === '/') {
        const element = document.getElementById(href.replace('#', ''));
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      } else {
        navigate(`/${href}`);
      }
    } else {
      navigate(href);
    }
    setMobileMenuOpen(false);
  };

  const handleInscribirseClick = () => {
    setMobileMenuOpen(false);
    navigate('/inscripcion');
  };

  const menuItems = [
    { label: 'Sorteo', href: '/raffle' },
    { label: 'Horarios', href: '/horarios' },
    { label: 'Cómo llegar', href: '/como-llegar' },
  ];

  return (
    <>
      <nav
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'
        } ${className}`}
        data-ui="navbar"
      >
        <div className="mx-4 md:mx-8 lg:mx-12 mt-4" data-ui="navbar-outer">
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
            data-ui="navbar-inner"
          >
            <div
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(220, 20, 60, 0.6) 50%, transparent 100%)',
              }}
              data-ui="navbar-accent-glow"
            />
            <div
              className="absolute top-0 left-0 w-24 h-24 pointer-events-none"
              style={{
                background: 'radial-gradient(circle at top left, rgba(139, 0, 0, 0.15) 0%, transparent 70%)',
              }}
              data-ui="navbar-corner-glow"
            />
            <div className="flex items-center justify-between" data-ui="navbar-row">
              <a href="/" className="flex items-center gap-3" data-ui="navbar-logo" data-testid="navbar-logo-link">
                <img
                  src="/grcuplogo.png"
                  alt="GR Cup Logo"
                  className="w-auto h-8 object-contain"
                  data-ui="navbar-logo-img"
                />
              </a>

              <div className="flex items-center gap-6" data-ui="desktop-nav">
                {menuItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => handleNavClick(e, item.href)}
                    className="text-gray-300 hover:text-white transition-colors duration-200 text-sm font-medium hidden md:block"
                    data-testid={`navbar-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}-link`}
                  >
                    {item.label}
                  </a>
                ))}

                <button
                  onClick={handleInscribirseClick}
                  className="px-4 py-2 bg-gradient-to-r from-red-accent to-dark-red text-white font-semibold rounded-lg hover:shadow-red-accent transition-all duration-200 text-sm"
                  data-testid="navbar-inscribirse-btn"
                >
                  Inscribirse
                </button>

                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 p-2"
                  data-testid="navbar-hamburger-btn"
                  aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                  aria-expanded={mobileMenuOpen}
                >
                  <span
                    className={`block w-6 h-0.5 bg-white transition-all duration-300 ${
                      mobileMenuOpen ? 'rotate-45 translate-y-2' : ''
                    }`}
                    data-ui="hamburger-line-1"
                  />
                  <span
                    className={`block w-6 h-0.5 bg-white transition-all duration-300 ${
                      mobileMenuOpen ? 'opacity-0' : ''
                    }`}
                    data-ui="hamburger-line-2"
                  />
                  <span
                    className={`block w-6 h-0.5 bg-white transition-all duration-300 ${
                      mobileMenuOpen ? '-rotate-45 -translate-y-2' : ''
                    }`}
                    data-ui="hamburger-line-3"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-[60] transition-all duration-300 ${
          mobileMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        data-ui="mobile-menu-overlay"
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileMenuOpen(false)}
          data-ui="mobile-menu-backdrop"
        />

        <div
          className={`absolute top-0 right-0 h-full w-72 max-w-[80vw] transition-transform duration-300 ${
            mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          style={{
            background: 'rgba(10, 10, 10, 0.95)',
            backdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(139, 0, 0, 0.3)',
          }}
          data-ui="mobile-sidenav"
        >
          <div className="relative flex items-center justify-center p-4" data-ui="mobile-sidenav-header">
            <a href="/" className="flex items-center gap-3" data-ui="mobile-sidenav-logo" data-testid="mobile-sidenav-logo-link">
              <img
                src="/grcuplogo.png"
                alt="GR Cup Logo"
                className="w-auto h-8 object-contain"
                data-ui="mobile-sidenav-logo-img"
              />
            </a>
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute right-4 w-10 h-10 flex items-center justify-center text-white hover:text-red-accent transition-colors"
              data-testid="mobile-menu-close-btn"
              aria-label="Close menu"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                data-ui="mobile-close-icon"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex flex-col gap-2 px-6 pb-8" data-ui="mobile-nav-links">
            {menuItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => handleNavClick(e, item.href)}
                className="text-gray-300 hover:text-white hover:bg-white/5 transition-all duration-200 text-base font-medium py-3 px-4 rounded-lg"
                data-testid={`mobile-nav-${item.label.toLowerCase().replace(/\s+/g, '-')}-link`}
              >
                {item.label}
              </a>
            ))}

            <button
              onClick={handleInscribirseClick}
              className="mt-4 w-full px-4 py-3 bg-gradient-to-r from-red-accent to-dark-red text-white font-semibold rounded-lg hover:shadow-red-accent transition-all duration-200 text-base"
              data-testid="mobile-inscribirse-btn"
            >
              Inscribirse
            </button>
          </nav>
        </div>
      </div>
    </>
  );
};
