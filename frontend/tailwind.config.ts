import type { Config } from 'tailwindcss';
export default { content: ['./src/**/*.{ts,tsx}'], theme: { extend: { colors: { navy: { DEFAULT: '#0B2545', 700: '#13315C' }, teal: { DEFAULT: '#0E7C86' }, leaf: '#2E9E6B', warn: '#B7791F', crit: '#C53030', mist: '#F2F6F8', line: '#D5DEE5' } } }, plugins: [] } satisfies Config;
