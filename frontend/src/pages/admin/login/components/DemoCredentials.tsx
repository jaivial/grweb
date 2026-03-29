import type { JSX } from 'react';
import { Card } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Icon } from '@components/ui/Icon';

/**
 * Demo Credentials Component
 * Shows demo login information
 */
export function DemoCredentials(): JSX.Element {
  return (
    <Card variant="outlined" padding="md" className="mt-6">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-accent/10 flex items-center justify-center">
          <Icon name="info" size="sm" color="red-accent" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-white font-medium text-sm">Demo Credentials</h4>
            <Badge variant="info" size="sm">Development</Badge>
          </div>
          <div className="space-y-1 font-mono text-sm">
            <p className="text-gray-400">
              Username: <span className="text-red-accent">admin</span>
            </p>
            <p className="text-gray-400">
              Password: <span className="text-red-accent">strongpassword</span>
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default DemoCredentials;
