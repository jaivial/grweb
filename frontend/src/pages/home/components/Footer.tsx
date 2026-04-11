import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { Badge } from '@components/ui/Badge';

export function Footer(): JSX.Element {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-dark-base border-t border-dark-border py-12 px-4" data-ui="footer">
      <div className="max-w-6xl mx-auto" data-ui="footer-container">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8" data-ui="footer-grid">
          {/* Brand */}
          <div data-ui="footer-brand">
            <h3 className="text-2xl font-bold text-white mb-4" data-ui="footer-brand-title">
              GR Cup
            </h3>
            <p className="text-gray-400 mb-4" data-ui="footer-brand-description">
              Sorteo benéfico del campeonato de powerlifting GR Cup 2026. Gana premios exclusivos y forma parte de la comunidad GR Strength.
            </p>
            <div className="flex gap-3" data-ui="footer-social-links">
              <a
                href="https://www.instagram.com/grstrengthclub/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-dark-surface flex items-center justify-center text-gray-400 hover:text-red-accent hover:bg-red-accent/10 transition-colors"
                data-testid="footer-instagram-link"
              >
                <Icon name="instagram" size="sm" />
              </a>
              <a
                href="https://www.grteam.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-dark-surface flex items-center justify-center text-gray-400 hover:text-red-accent hover:bg-red-accent/10 transition-colors"
                data-testid="footer-website-link"
              >
                <Icon name="globe" size="sm" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div data-ui="footer-quick-links">
            <h4 className="text-lg font-semibold text-white mb-4" data-ui="footer-links-title">
              Enlaces
            </h4>
            <ul className="space-y-2" data-ui="footer-links-list">
              <li data-ui="footer-link-item-inscripcion">
                <a href="/inscripcion" className="text-gray-400 hover:text-red-accent transition-colors" data-testid="footer-link-inscripcion">
                  Inscribirse
                </a>
              </li>
              <li data-ui="footer-link-item-raffle">
                <a href="/raffle" className="text-gray-400 hover:text-red-accent transition-colors" data-testid="footer-link-raffle">
                  Sorteo
                </a>
              </li>
              <li data-ui="footer-link-item-horarios">
                <a href="/horarios" className="text-gray-400 hover:text-red-accent transition-colors" data-testid="footer-link-horarios">
                  Horarios
                </a>
              </li>
              <li data-ui="footer-link-item-como-llegar">
                <a href="/como-llegar" className="text-gray-400 hover:text-red-accent transition-colors" data-testid="footer-link-como-llegar">
                  Cómo llegar
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div data-ui="footer-contact">
            <h4 className="text-lg font-semibold text-white mb-4" data-ui="footer-contact-title">
              Contact
            </h4>
            <ul className="space-y-2 text-gray-400" data-ui="footer-contact-list">
              <li className="flex items-center gap-2" data-ui="footer-contact-email">
                <Icon name="mail" size="sm" />
                admin@grstrength.com
              </li>
              <li className="flex items-center gap-2" data-ui="footer-contact-instagram">
                <Icon name="instagram" size="sm" />
                @grstrengthclub
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-dark-border flex flex-col md:flex-row items-center justify-between gap-4" data-ui="footer-bottom-bar">
          <p className="text-gray-500 text-sm" data-ui="footer-copyright">
            © {currentYear} GR Cup. Todos los derechos reservados.
          </p>
          
          <div className="flex items-center gap-4 text-sm text-gray-500" data-ui="footer-legal-links">
            <a href="/privacy" className="hover:text-gray-300 transition-colors" data-testid="footer-link-privacy">
              Política de Privacidad
            </a>
            <a href="/terms" className="hover:text-gray-300 transition-colors" data-testid="footer-link-terms">
              Términos de Servicio
            </a>
          </div>
        </div>

        {/* Stripe badge */}
        <div className="mt-6 text-center" data-ui="footer-stripe-badge">
          <Badge variant="default" size="sm">
            <Icon name="lock" size="xs" />
            Secure payments by Stripe
          </Badge>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
