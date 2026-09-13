// Tailwind v4 loads this shared configuration through @config in both CSS entries.
export default {
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { display: ['Fraunces', 'serif'], sans: ['IBM Plex Sans', 'sans-serif'] },
      colors: {
        'page': 'var(--light-page)',
        'surface': 'var(--light-surface)',
        'border': 'var(--light-border)',
        'primary': 'var(--light-primary)',
        'muted': 'var(--light-muted)',
        'accent': 'var(--light-accent)',
        'accent-hover': 'var(--light-accent-hover)',
        'on-accent': 'var(--light-on-accent)',
        'accent-soft': 'var(--light-accent-soft)',
        'success': 'var(--light-success)',
        'success-soft': 'var(--light-success-soft)',
        'warning': 'var(--light-warning)',
        'warning-soft': 'var(--light-warning-soft)',
        'danger': 'var(--light-danger)',
        'danger-soft': 'var(--light-danger-soft)',
        'shadow': 'var(--light-shadow)',
      },
    },
  },
};
