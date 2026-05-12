/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        xs: '280px',
        sm2: '320px',
        sm: '480px',
        md: '540px',
        lg: '640px',
        xl: '768px',
        '2xl': '992px',
        '3xl': '1024px',
      },
      // Keep in sync with FER_COLORS in src/pages/fer/constants.ts and CSS vars in src/styles/globals.css
      colors: {
        'fer-bg-dark': '#0B0F1A',
        'fer-bg-card': '#161B26',
        'fer-accent': '#8B95A5',
        'fer-glow': '#CBD5E1',
        'fer-text': '#F1F5F9',
        'fer-text-muted': '#8494A7',
        'fer-gold': '#C9CDD4',
        'fer-purple': '#7C8DA4',
        'fer-silver': '#A8B2C1',
        'fer-shimmer': '#E2E8F0',
      },
      fontFamily: {
        display: ['"Syne"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        body: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'sans-serif'],
        accent: ['"Caveat"', 'cursive'],
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out forwards',
        'slide-up': 'slideUp 0.8s ease-out forwards',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'text-fade-in': 'textFadeIn 0.8s ease-in-out forwards',
        'hero-entrance': 'heroEntrance 0.5s ease-out forwards',
        'shimmer': 'shimmer 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 5px #8B95A5, 0 0 10px #8B95A5' },
          '50%': { boxShadow: '0 0 20px #A8B2C1, 0 0 40px #CBD5E1' },
        },
        textFadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        heroEntrance: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      boxShadow: {
        'fer-accent': '0 0 5px #8B95A5, 0 0 20px #8B95A5',
        'fer-glow': '0 0 40px rgba(139, 149, 165, 0.15)',
      },
    },
  },
  plugins: [],
};
