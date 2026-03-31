/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '280px',
        'sm2': '320px',
        'sm': '480px',
        'md': '540px',
        'lg': '640px',
        'xl': '768px',
        '2xl': '992px',
        '3xl': '1024px',
      },
      colors: {
        'red-accent': { DEFAULT: '#DC143C', 400: '#DC143C' },
        'dark-red': { DEFAULT: '#8B0000', 400: '#8B0000' },
        'dark-base': '#0a0a0a',
        'dark-surface': '#141414',
        'dark-card': '#1e1e1e',
      },
      fontFamily: {
        mono: ['Roboto Mono', 'monospace'],
        display: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.8s ease-out forwards',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'counter-bounce': 'counterBounce 0.3s ease-out',
        'text-fade-in': 'textFadeIn 0.8s ease-in-out forwards',
        'text-fade-out': 'textFadeOut 0.8s ease-in-out forwards',
        'smoke-reveal': 'smokeReveal 1.5s ease-in-out forwards',
        'hero-entrance': 'heroEntrance 0.5s ease-out forwards',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(30px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        glowPulse: { '0%, 100%': { boxShadow: '0 0 5px #00f0ff, 0 0 10px #00f0ff' }, '50%': { boxShadow: '0 0 20px #00f0ff, 0 0 40px #00f0ff' } },
        counterBounce: { '0%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.15)' }, '100%': { transform: 'scale(1)' } },
        textFadeIn: { '0%': { opacity: '0', transform: 'translateY(10px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        textFadeOut: { '0%': { opacity: '1', transform: 'translateY(0)' }, '100%': { opacity: '0', transform: 'translateY(-10px)' } },
        smokeReveal: {
          '0%': { clipPath: 'inset(0 0 0 0)', opacity: '1' },
          '100%': { clipPath: 'inset(0 50% 0 50%)', opacity: '0' },
        },
        heroEntrance: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      boxShadow: {
        'red-accent': '0 0 5px #DC143C, 0 0 20px #DC143C',
        'dark-red': '0 0 5px #8B0000, 0 0 20px #8B0000',
      },
    },
  },
  plugins: [],
};
