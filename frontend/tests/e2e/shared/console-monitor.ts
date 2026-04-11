import { Page, ConsoleMessage } from '@playwright/test';

type ConsoleError = {
  type: 'error';
  text: string;
  location: { url: string; lineNumber: number; columnNumber: number };
};

/**
 * Attaches console error monitoring to a page.
 * Call this in test hooks to fail tests on console errors.
 * Filters out Vite HMR client warnings which are not real app errors.
 */
export function monitorConsole(page: Page) {
  const errors: ConsoleError[] = [];

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const location = msg.location();
      // Skip Vite HMR client errors (SVG attribute warnings in dev mode)
      if (location.url.includes('@vite/client')) {
        return;
      }
      // Skip React style prop warnings (not real errors)
      if (text.includes('style') && text.includes('mapping from style properties')) {
        return;
      }
      // Skip nested anchor warnings
      if (text.includes('cannot contain a nested')) {
        return;
      }
      // Skip 401 Unauthorized errors (expected when testing auth/error handling)
      if (text.includes('401') || text.includes('Unauthorized')) {
        return;
      }
      // Skip 500 errors (expected in error handling tests with mocked routes)
      if (text.includes('500') || text.includes('Internal Server Error')) {
        return;
      }
      // Skip timeout errors (expected in network timeout tests)
      if (text.includes('ERR_TIMED_OUT') || text.includes('timed out')) {
        return;
      }
      // Skip CORS errors (external resources, not app errors)
      if (text.includes('CORS') || text.includes('ERR_FAILED')) {
        return;
      }
      // Skip WebGL context errors (common in dev mode)
      if (text.includes('WebGL') || text.includes('WebGPU')) {
        return;
      }
      errors.push({
        type: 'error',
        text,
        location,
      });
    }
  });

  page.on('pageerror', (err: Error) => {
    // Filter WebGL context errors (common in dev mode with 3D libraries)
    if (err.message.includes('WebGL') || err.message.includes('WebGPU')) {
      return;
    }
    errors.push({
      type: 'error',
      text: err.message,
      location: { url: '', lineNumber: 0, columnNumber: 0 },
    });
  });

  return {
    getErrors: () => errors,
    assertNoErrors: () => {
      if (errors.length > 0) {
        throw new Error(
          `Console errors detected:\n${errors.map(e => `  - ${e.text} (${e.location.url}:${e.location.lineNumber})`).join('\n')}`
        );
      }
    },
    clear: () => errors.splice(0, errors.length),
  };
}
