import { useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, Camera } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS, NAV_LINKS, SECTION_IDS } from '../../pages/fer/constants';
import { useNavbarVisibility } from './hooks/useNavbarVisibility';
import { MobileSidebar } from './MobileSidebar';

export function Navbar() {
  const [location, navigate] = useLocation();
  const isHomePage = location === '/';
  const { isVisible: heroScrolledPast } = useNavbarVisibility(
    isHomePage ? SECTION_IDS.hero : ''
  );
  const isVisible = isHomePage ? heroScrolledPast : true;

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const handleNavClick = useCallback(
    (path: string) => {
      closeMobileMenu();
      navigate(path);
    },
    [closeMobileMenu, navigate]
  );

  const navbarVariants = useMemo(
    () =>
      prefersReducedMotion
        ? {
            initial: { opacity: 0 },
            animate: { opacity: 1 },
            exit: { opacity: 0 },
          }
        : {
            initial: { y: -100, opacity: 0 },
            animate: { y: 0, opacity: 1 },
            exit: { y: -100, opacity: 0 },
          },
    [prefersReducedMotion]
  );

  const activeLinkStyle = useMemo(
    () => ({
      color: FER_COLORS.accent,
      borderBottom: `2px solid ${FER_COLORS.accent}`,
    }),
    []
  );

  const inactiveLinkStyle = useMemo(
    () => ({
      color: FER_COLORS.textMuted,
      borderBottom: '2px solid transparent',
    }),
    []
  );

  return (
    <>
      <AnimatePresence data-ui="navbar-presence">
        {isVisible && (
          <motion.header
            key="fer-navbar"
            initial={navbarVariants.initial}
            animate={navbarVariants.animate}
            exit={navbarVariants.exit}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed top-0 left-0 right-0 z-50"
            style={{
              backgroundColor: `${FER_COLORS.bgDark}e6`,
              backdropFilter: 'blur(20px)',
              borderBottom: `1px solid ${FER_COLORS.accent}15`,
            }}
            data-ui="fer-navbar"
          >
            <div
              className="absolute bottom-0 left-0 right-0 h-px"
              style={{
                background: `linear-gradient(90deg, transparent, ${FER_COLORS.accent}40, transparent)`,
              }}
              data-ui="fer-navbar-glow-line"
              aria-hidden="true"
            />
            <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between" data-ui="fer-navbar-inner">
              <button
                onClick={() => handleNavClick('/')}
                className="flex items-center gap-2 transition-opacity hover:opacity-80"
                data-ui="fer-navbar-logo-button"
                aria-label="Ir al inicio"
              >
                <span
                  className="text-lg font-black"
                  style={{ color: FER_COLORS.text }}
                  data-ui="fer-navbar-logo-fer"
                >
                  FER CUP II 2026
                </span>
                <span
                  className="text-xs font-medium hidden sm:inline"
                  style={{ color: FER_COLORS.glow }}
                  data-ui="fer-navbar-logo-sub"
                >
                  ENTRENAMIENTO
                </span>
              </button>

              <nav className="hidden xl:flex items-center gap-1" data-ui="fer-navbar-desktop-nav">
                {NAV_LINKS.map((link) => {
                  const isActive = location === link.path;
                  const isInscripcion = link.path === '/inscripcion';
                  return (
                    <button
                      key={link.path}
                      onClick={() => handleNavClick(link.path)}
                      className={`px-3 py-2 text-sm font-medium transition-colors rounded-lg ${
                        isInscripcion
                          ? 'ml-2 px-4'
                          : 'hover:bg-white/5'
                      }`}
                      style={
                        isInscripcion
                          ? {
                              backgroundColor: FER_COLORS.accent,
                              color: FER_COLORS.text,
                            }
                          : isActive
                            ? activeLinkStyle
                            : inactiveLinkStyle
                      }
                      data-ui={`fer-navbar-link-${link.path.replace(/\//g, '').replace(/-/g, '-') || 'home'}`}
                    >
                      {link.label}
                    </button>
                  );
                })}
              </nav>

              <button
                onClick={toggleMobileMenu}
                className="xl:hidden p-2 rounded-lg transition-colors hover:bg-white/5"
                style={{ color: FER_COLORS.text }}
                data-ui="fer-navbar-hamburger"
                aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              >
                <Menu size={24} data-ui="fer-navbar-hamburger-icon" />
              </button>
            </div>
          </motion.header>
        )}
      </AnimatePresence>

      <MobileSidebar isOpen={mobileMenuOpen} onClose={closeMobileMenu} />
    </>
  );
}
