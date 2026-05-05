/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        felt: {
          50: '#e8f5e9',
          100: '#c8e6c9',
          200: '#a5d6a7',
          300: '#81c784',
          400: '#66bb6a',
          500: '#4caf50',
          600: '#2e7d32',
          700: '#1b5e20',
          800: '#144d1a',
          900: '#0d3b12',
        },
        gold: {
          300: '#ffd54f',
          400: '#ffca28',
          500: '#ffc107',
          600: '#ffb300',
        },
      },
      fontFamily: {
        card: ['"Georgia"', 'serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.4)',
        'card-hover': '0 6px 20px rgba(0,0,0,0.5)',
        'card-selected': '0 0 0 3px #ffc107, 0 6px 20px rgba(0,0,0,0.5)',
      },
      backgroundImage: {
        'felt-texture': "radial-gradient(ellipse at center, #1b5e20 0%, #144d1a 40%, #0d3b12 100%)",
      },
    },
  },
  plugins: [],
}
