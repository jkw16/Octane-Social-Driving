/** @type {import('tailwindcss').Config} */
// Local Tailwind build config. Replaces the former cdn.tailwindcss.com Play
// CDN <script> + inline `tailwind.config` so the WebView works fully offline.
// The octane color palette and display/sans fonts are the same as before.
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['"Exo 2"', 'sans-serif'],
      },
      colors: {
        'octane-black': '#0f172a',
        'octane-dark': '#1e293b',
        'octane-accent': '#06b6d4', // Cyan 500
        'octane-danger': '#ef4444', // Red 500
        'octane-success': '#22c55e', // Green 500
      },
    },
  },
  plugins: [],
};