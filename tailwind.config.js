/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF7EC',
        paper: '#FFFDF8',
        ink: '#2A1A12',
        muted: '#7A6558',
        line: '#F0E1CF',
        tomato: {
          DEFAULT: '#E23D2D',
          deep: '#B8281B',
        },
        cheese: {
          DEFAULT: '#FFC94A',
          deep: '#D99A22',
        },
        crust: '#C9732A',
        basil: '#2F7D4F',
      },
      fontFamily: {
        display: ['"Lilita One"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgb(42 26 18 / 0.06), 0 8px 24px -12px rgb(42 26 18 / 0.18)',
        pop: '0 18px 50px -18px rgb(184 40 27 / 0.45)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
}
