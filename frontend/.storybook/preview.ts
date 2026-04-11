import type { Preview } from '@storybook/react-vite';
import '../src/styles/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'dark',
      values: [
        { name: 'dark', value: '#0a0a0a' },
        { name: 'surface', value: '#1a1a2e' },
        { name: 'light', value: '#ffffff' },
      ],
    },
    a11y: {
      test: 'todo',
    },
  },
};

export default preview;
