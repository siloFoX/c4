/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      xs: '480px',
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1536px',
    },
    extend: {
      colors: {
        // 8.9: token palette. All UI surfaces and accents go through these
        // CSS variables so theming is a single edit in src/index.css.
        background: 'hsl(var(--background))',
        surface: 'hsl(var(--surface))',
        'surface-2': 'hsl(var(--surface-2))',
        'surface-3': 'hsl(var(--surface-3))',
        border: 'hsl(var(--border))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          fg: 'hsl(var(--primary-foreground))',
        },
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        danger: 'hsl(var(--danger))',
        intervention: 'hsl(var(--intervention))',
        suspended: 'hsl(var(--suspended))',
      },
      boxShadow: {
        soft: '0 4px 14px rgba(0, 0, 0, 0.25)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.4), 0 0 24px hsl(var(--primary) / 0.25)',
      },
      transitionTimingFunction: {
        snappy: 'cubic-bezier(.22,.36,.04,1)',
      },
    },
  },
  plugins: [],
};
