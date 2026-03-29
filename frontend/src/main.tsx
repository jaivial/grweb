/**
 * Main Application Entry Point
 * 
 * Sets up the application with providers and global configuration.
 */

import { createRoot } from 'react-dom/client';
import { App } from './app';
import './styles/globals.css';

const originalWarn = console.warn;
console.warn = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('THREE.Clock')) return;
  originalWarn.apply(console, args);
};

// Scroll to top on page load
const scrollToTop = () => {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
};

// Ensure scroll to top after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scrollToTop);
} else {
  scrollToTop();
}

// Scroll to top on navigation
window.addEventListener('beforeunload', () => {
  window.scrollTo(0, 0);
});

const container = document.getElementById('app')!;
const root = createRoot(container);
root.render(<App />);