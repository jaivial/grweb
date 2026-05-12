import { useMemo } from 'react';
import { Camera, MapPin, Heart } from 'lucide-react';
import { FER_COLORS, FER_EVENT } from '../constants';

export function FerFooter() {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer
      className="py-10 sm:py-12 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="fer-footer"
    >
      <div className="max-w-4xl mx-auto" data-ui="fer-footer-container">
        <div className="flex flex-col items-center text-center" data-ui="fer-footer-content">
          {/* Logo */}
          <div className="flex items-center justify-center gap-3 mb-6" data-ui="fer-footer-logo">
            <span
              className="text-2xl font-display font-black tracking-tight"
              style={{ color: FER_COLORS.text }}
              data-ui="fer-footer-logo-fer"
            >
              FER
            </span>
            <span style={{ color: FER_COLORS.textMuted }} data-ui="fer-footer-logo-sep">|</span>
            <span
              className="text-sm font-medium"
              style={{ color: FER_COLORS.glow }}
              data-ui="fer-footer-logo-sub"
            >
              ENTRENAMIENTO
            </span>
          </div>

          {/* Social & Location */}
          <div
            className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-6"
            data-ui="fer-footer-links"
          >
            <a
              href={FER_EVENT.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-full transition-all duration-200 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
              data-ui="fer-footer-instagram"
              aria-label={`Instagram ${FER_EVENT.instagramHandle}`}
            >
              <Camera size={20} style={{ color: FER_COLORS.accent }} data-ui="fer-footer-instagram-icon" />
              <span
                className="text-sm font-medium hidden sm:inline"
                style={{ color: FER_COLORS.text }}
                data-ui="fer-footer-instagram-text"
              >
                {FER_EVENT.instagramHandle}
              </span>
            </a>

            <div
              className="flex items-center gap-2 px-4"
              data-ui="fer-footer-location"
            >
              <MapPin size={18} style={{ color: FER_COLORS.textMuted }} data-ui="fer-footer-location-icon" />
              <span
                className="text-sm"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="fer-footer-location-text"
              >
                {FER_EVENT.location}
              </span>
            </div>
          </div>

          {/* Copyright */}
          <p
            className="text-xs sm:text-sm mb-3"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="fer-footer-copyright"
          >
            © {currentYear} GR Strength. Todos los derechos reservados.
          </p>

          {/* Made with love */}
          <p
            className="text-xs flex items-center gap-1"
            style={{ color: `${FER_COLORS.textMuted}80` }}
            data-ui="fer-footer-heart"
          >
            <span data-ui="fer-footer-heart-text">Hecho con</span>
            <Heart size={12} style={{ color: FER_COLORS.red }} data-ui="fer-footer-heart-icon" />
            <span data-ui="fer-footer-heart-text-2">en Valencia</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
