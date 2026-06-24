/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/renderer/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e8f0f9',
          100: '#d0e1f3',
          500: '#2e75b6',
          600: '#1f5a99',
          700: '#1a4d82',
          800: '#1f4e79',
          900: '#163a5c',
        },
        success: '#16a34a',
        danger:  '#dc2626',
        warning: '#d97706',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
