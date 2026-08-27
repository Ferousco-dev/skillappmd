import type { Config } from 'tailwindcss'

/** shadcn tokens are read from --sd-* to avoid colliding with the landing
 *  page's own --muted / --accent custom properties. */
const sd = (name: string) => `hsl(var(--sd-${name}))`

const config: Config = {
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        border: sd('border'),
        input: sd('input'),
        ring: sd('ring'),
        background: sd('background'),
        foreground: sd('foreground'),
        primary: { DEFAULT: sd('primary'), foreground: sd('primary-foreground') },
        secondary: { DEFAULT: sd('secondary'), foreground: sd('secondary-foreground') },
        muted: { DEFAULT: sd('muted'), foreground: sd('muted-foreground') },
        accent: { DEFAULT: sd('accent'), foreground: sd('accent-foreground') },
        destructive: { DEFAULT: sd('destructive'), foreground: sd('destructive-foreground') },

        /* Landing palette, shared with product surfaces so the two halves of
           the app are one design. These custom properties hold hex values and
           already swap with the theme. */
        brand: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          soft: 'var(--accent-soft)',
          ink: 'var(--accent-ink)',
        },
        ink: 'var(--ink)',
        subtle: 'var(--muted)',
        surface: 'var(--surface)',
        raised: 'var(--surface-raised)',
      },
    },
  },
  plugins: [],
}

export default config
