/**
 * Scoped logger.
 *
 * `debug`/`info` print in development, or in production when
 * `localStorage.grDebug` is set (e.g. `localStorage.grDebug = '1'`).
 * `warn`/`error` always print. Every line is prefixed with `[scope]`.
 */
export interface Logger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

function verboseEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem('grDebug') !== null;
  } catch {
    return false;
  }
}

export function createLogger(scope: string): Logger {
  const prefix = `[${scope}]`;
  const emit = (method: 'debug' | 'info' | 'warn' | 'error', verboseOnly: boolean) =>
    (message: string, data?: unknown) => {
      if (verboseOnly && !verboseEnabled()) return;
      if (data === undefined) console[method](prefix, message);
      else console[method](prefix, message, data);
    };
  return {
    debug: emit('debug', true),
    info: emit('info', true),
    warn: emit('warn', false),
    error: emit('error', false),
  };
}
