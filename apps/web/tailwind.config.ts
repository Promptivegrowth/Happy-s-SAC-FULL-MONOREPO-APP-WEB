import type { Config } from 'tailwindcss';
import preset from '@happy/config/tailwind/preset.js';

const config: Config = {
  presets: [preset],
  content: [
    './src/**/*.{ts,tsx,js,jsx,mdx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
};
export default config;
