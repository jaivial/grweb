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

const container = document.getElementById('app')!;
const root = createRoot(container);
root.render(<App />);