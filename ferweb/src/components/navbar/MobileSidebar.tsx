import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useLocation } from 'wouter';
import { FER_COLORS, FER_CUP_LOGO_IMAGE, NAV_LINKS } from '../../pages/fer/constants';
import { useCdnImage } from '@hooks/useCdnImage';

interface MobileSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileSidebar({ isOpen, onClose }: MobileSidebarProps) {
  const [location, navigate] = useLocation();
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const logoSrc = useCdnImage(FER_CUP_LOGO_IMAGE);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleNavClick = useCallback(
    (path: string) => {
      onClose();
      navigate(path);
    },
    [onClose, navigate]
  );

  const panelAnimate = prefersReducedMotion
    ? { opacity: isOpen ? 1 : 0 }
    : { x: isOpen ? 0 : '100%' };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: isOpen ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={isOpen ? onClose : undefined}
        style={{ pointerEvents: isOpen ? 'auto' : 'none' }}
        data-ui="mobile-sidebar-backdrop"
        aria-hidden="true"
      />
      <motion.div
        initial={prefersReducedMotion ? { opacity: 0 } : { x: '100%' }}
        animate={panelAnimate}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 z-[70] w-[280px] max-w-[80vw] flex flex-col"
        style={{
          backgroundColor: `${FER_COLORS.bgDark}f0`,
          backdropFilter: 'blur(20px)',
          borderLeft: `1px solid ${FER_COLORS.accent}30`,
          pointerEvents: isOpen ? 'auto' : 'none',
        }}
        data-ui="mobile-sidebar-panel"
      >
        <div
          className="flex items-center justify-between p-5"
          style={{ borderBottom: `1px solid ${FER_COLORS.accent}15` }}
          data-ui="mobile-sidebar-header"
        >
          FER CUP II
        </div>


        <nav className="flex-1 py-4" data-ui="mobile-sidebar-nav">
          {NAV_LINKS.map((link) => {
            const isActive = location === link.path;
            return (
              <button
                key={link.path}
                onClick={() => handleNavClick(link.path)}
                className="w-full text-left px-5 py-3.5 text-sm font-medium transition-colors"
                style={{
                  color: isActive ? FER_COLORS.accent : FER_COLORS.textMuted,
                  borderLeft: isActive
                    ? `3px solid ${FER_COLORS.accent}`
                    : '3px solid transparent',
                  backgroundColor: isActive ? `${FER_COLORS.accent}10` : 'transparent',
                }}
                data-ui={`mobile-sidebar-link-${link.path.replace(/\//g, '').replace(/-/g, '-') || 'home'}`}
              >
                {link.label}
              </button>
            );
          })}
        </nav>

        <div
          className="p-5"
          style={{ borderTop: `1px solid ${FER_COLORS.accent}15` }}
          data-ui="mobile-sidebar-footer"
        >
          <img
            src={logoSrc}
            alt="FER Cup Logo"
            className="mx-auto h-12 w-auto max-w-full object-contain opacity-90"
            loading="lazy"
            data-ui="mobile-sidebar-footer-logo"
          />
        </div>
      </motion.div>
    </>
  );
}
