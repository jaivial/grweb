import { useMemo } from 'react';
import { MapPin, Mail } from 'lucide-react';
import { FER_COLORS, FER_EVENT } from '../constants';

interface FerFooterProps {
  contactEmail?: string;
}

export function FerFooter({ contactEmail }: FerFooterProps) {
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  return (
    <footer
      className="py-10 sm:py-12 px-4"
      style={{ backgroundColor: FER_COLORS.bgDark }}
      data-ui="fer-footer"
    >
      <div className="max-w-4xl mx-auto" data-ui="fer-footer-container">
        <div className="flex flex-col items-center text-center" data-ui="fer-footer-content">
          {/* Logo image */}
          <div className="mb-6" data-ui="fer-footer-logo-image-wrapper">
            <img
              src="https://jaimedigitalstudio.b-cdn.net/fer/media/icons/ferwebicons/Gemini_Generated_Image_ocrwoeocrwoeocrw-removebg-preview.webp"
              alt="FER Entrenamiento"
              className="h-16 sm:h-20 w-auto object-contain"
              loading="lazy"
              data-ui="fer-footer-logo-image"
            />
          </div>

          {/* Social & Location */}
          <div
            className="flex flex-wrap items-center justify-center gap-3 sm:gap-5 mb-6"
            data-ui="fer-footer-links"
          >
            {/* Instagram GRStrengthClub */}
            <a
              href="https://www.instagram.com/grstrengthclub/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-full transition-all duration-200 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
              data-ui="fer-footer-instagram-gr"
              aria-label="Instagram GR Strength Club"
            >
              <span
                className="text-sm font-medium hidden sm:inline"
                style={{ color: FER_COLORS.text }}
                data-ui="fer-footer-instagram-gr-text"
              >
                @grstrengthclub
              </span>
            </a>

            {/* Instagram FER */}
            <a
              href="https://www.instagram.com/ferentrenamiento/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-full transition-all duration-200 hover:bg-white/8 focus:outline-none focus:ring-2 focus:ring-fer-accent/50"
              data-ui="fer-footer-instagram-fer"
              aria-label="Instagram FER Entrenamiento"
            >
              <span
                className="text-sm font-medium hidden sm:inline"
                style={{ color: FER_COLORS.text }}
                data-ui="fer-footer-instagram-fer-text"
              >
                @ferentrenamiento
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

          {/* Contact email */}
          {contactEmail && (
            <a
              href={`mailto:${contactEmail}`}
              className="flex items-center gap-2 mb-5 transition-all duration-200 hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-fer-accent/50 rounded-lg px-2 py-1"
              data-ui="fer-footer-email"
            >
              <Mail size={16} style={{ color: FER_COLORS.textMuted }} data-ui="fer-footer-email-icon" />
              <span
                className="text-sm font-medium"
                style={{ color: FER_COLORS.textMuted }}
                data-ui="fer-footer-email-text"
              >
                {contactEmail}
              </span>
            </a>
          )}

          {/* Legal links */}
          <nav
            className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-4"
            data-ui="fer-footer-legal-nav"
          >
            <a
              href="/terms"
              className="text-xs font-medium transition-colors duration-200 hover:opacity-80"
              style={{ color: `${FER_COLORS.textMuted}99` }}
              data-ui="fer-footer-legal-terms"
            >
              Términos y condiciones
            </a>
            <span
              className="text-xs"
              style={{ color: `${FER_COLORS.textMuted}40` }}
              data-ui="fer-footer-legal-sep"
              aria-hidden="true"
            >
              ·
            </span>
            <a
              href="/privacy"
              className="text-xs font-medium transition-colors duration-200 hover:opacity-80"
              style={{ color: `${FER_COLORS.textMuted}99` }}
              data-ui="fer-footer-legal-privacy"
            >
              Política de privacidad
            </a>
          </nav>

          {/* Copyright */}
          <p
            className="text-xs sm:text-sm mb-3"
            style={{ color: FER_COLORS.textMuted }}
            data-ui="fer-footer-copyright"
          >
            © {currentYear}{' '}
            <a
              href="https://jaimedigitalstudio.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity"
              style={{ color: FER_COLORS.text }}
              data-ui="fer-footer-copyright-link"
            >
              Jaime Digital Studios
            </a>
            . Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default FerFooter;
