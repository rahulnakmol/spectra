import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: { preflight: false },
  theme: { extend: {} },
  plugins: [],
};

export default config;
