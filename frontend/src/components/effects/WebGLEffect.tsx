import { useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { createLogger } from '@utils/logger';
import { hasWebGL } from '@utils/webgl';

const log = createLogger('effects');

export interface WebGLEffectProps {
  /** Effect name for the logs. */
  name: string;
  children: ReactNode;
}

/**
 * Guard for a decorative WebGL effect: without WebGL it renders nothing, and if the effect
 * throws (e.g. «Error creating WebGL context») it is dropped instead of taking the page down.
 * With WebGL the children render exactly as before.
 */
export function WebGLEffect({ name, children }: WebGLEffectProps) {
  const supported = useMemo(() => hasWebGL(), []);

  useEffect(() => {
    if (!supported) log.info('effect skipped: no WebGL', { name });
  }, [supported, name]);

  const handleError = useCallback((error: Error) => {
    log.warn('effect failed, skipped', { name, message: error.message });
  }, [name]);

  if (!supported) return null;
  return (
    <ErrorBoundary fallback={null} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}
