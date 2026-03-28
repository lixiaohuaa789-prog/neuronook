/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './pages/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        serif: ['"LXGW WenKai Screen"', '"Kaiti SC"', 'serif'],
      },
      colors: {
        'spring-green': '#78946e',
        'spring-green-light': '#97a375',
        'spring-brown': '#b19c7d',
        'spring-brown-dark': '#9b6b5c',
        'spring-olive': '#8b7d54',
        'spring-cream': '#e8e0b8',
        'spring-bg': '#f5f7f4',
        'spring-surface': '#fffcf8',
      },
    },
  },
};
