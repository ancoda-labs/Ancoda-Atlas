import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#03070d',
        panel: '#070e17',
        'panel-bright': '#0c1524',
        border: 'rgba(68,204,255,0.08)',
        'border-bright': 'rgba(68,204,255,0.22)',
        textColor: '#e2f1ff', // avoid collision with default text utilities
        dim: '#7da5cc',
        accent: '#64f0c8',
        accent2: '#ff5f63',
        warn: '#ffe082',
        danger: '#ff5f63',
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
