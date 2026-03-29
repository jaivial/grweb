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
              The premier powerlifting championship raffle. Win exclusive prizes and be part of the GR Cup community.
            </p>
            <div className="flex gap-3">
              <a
                href="https://instagram.com/grstrength"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-dark-surface flex items-center justify-center text-gray-400 hover:text-red-accent hover:bg-red-accent/10 transition-colors"
              >
                <Icon name="instagram" size="sm" />
              </a>
              <a
                href="https://twitter.com/grstrength"
                target="_blank"
                rel="noopener noreferrer"
                className="w-10 h-10 rounded-lg bg-dark-surface flex items-center justify-center text-gray-400 hover:text-red-accent hover:bg-red-accent/10 transition-colors"
              >
                <Icon name="twitter" size="sm" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold text-white mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2">
              <li>
                <a href="#rules" className="text-gray-400 hover:text-red-accent transition-colors">
                  Rules
                </a>
              </li>
              <li>
                <a href="#how-to-enter" className="text-gray-400 hover:text-red-accent transition-colors">
                  How to Enter
                </a>
              </li>
              <li>
                <a href="#winners" className="text-gray-400 hover:text-red-accent transition-colors">
                  Past Winners
                </a>
              </li>
              <li>
                <a href="/checkout" className="text-gray-400 hover:text-red-accent transition-colors">
                  Buy Tickets
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
                support@grcup.com
              </li>
              <li className="flex items-center gap-2">
                <Icon name="instagram" size="sm" />
                @grstrength
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-dark-border flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {currentYear} GR Cup. All rights reserved.
          </p>
          
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <a href="#" className="hover:text-gray-300 transition-colors">
              Privacy Policy
            </a>
            <a href="#" className="hover:text-gray-300 transition-colors">
              Terms of Service
            </a>
            <a href="#" className="hover:text-gray-300 transition-colors">
              Cookie Policy
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
