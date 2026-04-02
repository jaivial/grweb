import type { JSX } from 'react';
import { Icon } from '@components/ui/Icon';
import { Badge } from '@components/ui/Badge';

export function Footer(): JSX.Element {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-dark-base border-t border-dark-border py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <h3 className="text-2xl font-bold text-white mb-4">
              GR Cup
            </h3>
            <p className="text-gray-400 mb-4">
              Sorteo benéfico del campeonato de powerlifting GR Cup 2026. Gana premios exclusivos y forma parte de la comunidad GR Strength.
            </p>
            <div className="flex gap-3">
              <a
                href="https://www.instagram.com/grstrengthclub/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-dark-surface flex items-center justify-center text-gray-400 hover:text-red-accent hover:bg-red-accent/10 transition-colors"
              >
                <Icon name="instagram" size="sm" />
              </a>
              <a
                href="https://www.grteam.net/"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-dark-surface flex items-center justify-center text-gray-400 hover:text-red-accent hover:bg-red-accent/10 transition-colors"
              >
                <Icon name="globe" size="sm" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">
              Enlaces
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="/inscripcion" className="text-gray-400 hover:text-red-accent transition-colors">
                  Inscribirse
                </a>
              </li>
              <li>
                <a href="/raffle" className="text-gray-400 hover:text-red-accent transition-colors">
                  Sorteo
                </a>
              </li>
              <li>
                <a href="/horarios" className="text-gray-400 hover:text-red-accent transition-colors">
                  Horarios
                </a>
              </li>
              <li>
                <a href="/como-llegar" className="text-gray-400 hover:text-red-accent transition-colors">
                  Cómo llegar
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">
              Contact
            </h4>
            <ul className="space-y-2 text-gray-400">
              <li className="flex items-center gap-2">
                <Icon name="mail" size="sm" />
                admin@grstrength.com
              </li>
              <li className="flex items-center gap-2">
                <Icon name="instagram" size="sm" />
                @grstrengthclub
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-dark-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {currentYear} GR Cup. Todos los derechos reservados.
          </p>
          
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <a href="/privacy" className="hover:text-gray-300 transition-colors">
              Política de Privacidad
            </a>
            <a href="/terms" className="hover:text-gray-300 transition-colors">
              Términos de Servicio
            </a>
          </div>
        </div>

        {/* Stripe badge */}
        <div className="mt-6 text-center">
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
