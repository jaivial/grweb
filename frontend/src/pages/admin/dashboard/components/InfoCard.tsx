/**
 * Info Card Component
 * 
 * Displays informational content in a card format.
 */

import { JSX, ReactNode } from 'react';
import { InfoIcon } from '@components/ui/Icon';

interface InfoCardProps {
  title: string;
  children: ReactNode;
  icon?: JSX.Element;
}

export function InfoCard({ title, children, icon }: InfoCardProps): JSX.Element {
  return (
    <div className="bg-dark-surface/50 rounded-xl p-4 border border-dark-border/50">
      <div className="flex items-start gap-3">
        {icon || <InfoIcon className="w-5 h-5 text-red-accent flex-shrink-0 mt-0.5" />}
        <div>
          <h4 className="text-white font-medium mb-2">{title}</h4>
          <div className="text-gray-400 text-sm space-y-2">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InfoCard;
