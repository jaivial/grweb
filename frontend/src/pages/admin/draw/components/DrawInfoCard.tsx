/**
 * Draw Info Card Component
 * 
 * Displays informational content about the draw process.
 */

import { JSX, ReactNode } from 'react';

interface DrawInfoCardProps {
  title: string;
  children: ReactNode;
  icon?: JSX.Element;
}

export function DrawInfoCard({ title, children, icon }: DrawInfoCardProps): JSX.Element {
  return (
    <div className="bg-dark-surface/50 rounded-xl p-4 border border-dark-border/50">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="text-red-accent opacity-70 flex-shrink-0 mt-0.5">
            {icon}
          </div>
        )}
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

export default DrawInfoCard;
