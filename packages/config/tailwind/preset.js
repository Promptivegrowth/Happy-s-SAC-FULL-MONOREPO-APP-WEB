/**
 * HAPPY'S DISFRACES — Tailwind preset (paleta corporativa oficial)
 *
 *  azul corporativo:  #2D3193
 *  azul oscuro:       #231459
 *  naranja:           #F5821F
 *  naranja oscuro:    #E15A25
 *  rojo (acento):     #EC1C24
 */
const colors = require('tailwindcss/colors');

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // ===== Brand HAPPY (paleta oficial 2026) =====
        // Naranja principal (#F5821F) → escala completa
        happy: {
          50:  '#fff8f1',
          100: '#feeddc',
          200: '#fcd6b3',
          300: '#fab57e',
          400: '#f79447',
          500: '#F5821F',  // principal
          600: '#E15A25',  // hover / oscuro
          700: '#bb441b',
          800: '#943818',
          900: '#762f17',
          950: '#3f1408',
        },
        // Azul corporativo (#2D3193) → escala completa
        corp: {
          50:  '#eff0fb',
          100: '#dde1f7',
          200: '#bcc3ee',
          300: '#929fe1',
          400: '#6a7bd0',
          500: '#4a5cbe',
          600: '#3a47a8',
          700: '#2D3193',  // principal
          800: '#262975',
          900: '#231459',  // oscuro
          950: '#160c39',
        },
        // Rojo institucional (acento crítico)
        danger: {
          DEFAULT: '#EC1C24',
          50:  '#fef2f2',
          100: '#fde2e3',
          500: '#EC1C24',
          600: '#c8161d',
          700: '#a51319',
        },

        // Aliases legacy de carnival mantenidos para compatibilidad
        carnival: {
          purple: '#231459',
          pink:   '#E15A25',
          yellow: '#F5821F',
          teal:   '#2D3193',
          sky:    '#4a5cbe',
        },

        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui'],
        // 'fun' = Fredoka (redondeada, juguetona) — para titulares dirigidos a familias/niños
        fun: ['var(--font-fun)', 'var(--font-sans)', 'system-ui'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        soft: '0 4px 24px -8px rgba(35, 20, 89, 0.18)',
        glow: '0 0 32px -4px rgba(245, 130, 31, 0.5)',
        'glow-corp': '0 0 32px -4px rgba(45, 49, 147, 0.45)',
      },
      backgroundImage: {
        'happy-gradient': 'linear-gradient(135deg, #F5821F 0%, #E15A25 50%, #EC1C24 100%)',
        'corp-gradient':  'linear-gradient(135deg, #2D3193 0%, #231459 100%)',
        'brand-gradient': 'linear-gradient(135deg, #F5821F 0%, #2D3193 100%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'slide-up': {
          from: { opacity: 0, transform: 'translateY(8px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        confetti: {
          '0%': { transform: 'translateY(-10px) rotate(0deg)', opacity: 1 },
          '100%': { transform: 'translateY(120vh) rotate(720deg)', opacity: 0 },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms ease-out',
        'slide-up': 'slide-up 240ms ease-out',
        float: 'float 4s ease-in-out infinite',
        confetti: 'confetti 3.5s linear forwards',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
