/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Quadria Capital brand palette
        qnavy: {
          DEFAULT: '#132546',
          50:  '#EEF2F8',
          100: '#D3DEED',
          200: '#A8BCDB',
          300: '#7D9BC9',
          400: '#5279B7',
          500: '#2F5DA3',
          600: '#264C87',
          700: '#1D3B6B',
          800: '#132546', // brand primary
          900: '#0C1A31',
        },
        qteal: {
          DEFAULT: '#0D8C75',
          50:  '#E7F6F4',
          100: '#BEEAE3',
          200: '#7ED5CA',
          300: '#3EC0B0',
          400: '#1AAD98',
          500: '#0D9A83',
          600: '#0D8C75',
          700: '#0A7562',
          800: '#075E4E',
          900: '#04473B',
        },
        qgreen: {
          DEFAULT: '#1E723F',
          50:  '#EBF5EF',
          100: '#C8E6D3',
          200: '#92CEA8',
          300: '#5CB57C',
          400: '#33A05B',
          500: '#268B4C',
          600: '#1F7841',
          700: '#1E723F', // Quadria brand primary
          800: '#175B32',
          900: '#104524',
        },
        qgold: {
          DEFAULT: '#C4943D',
          50:  '#FBF4E8',
          100: '#F5E4C0',
          200: '#EBC881',
          300: '#E1AC42',
          400: '#C4943D',
          500: '#A87A2F',
          600: '#8C6121',
        },
        qgray: {
          DEFAULT: '#F4F5F7',
          50:  '#FAFBFC',
          100: '#F4F5F7',
          200: '#E8EAED',
          300: '#D2D6DC',
          400: '#B0B7C3',
          500: '#8996A8',
          600: '#64748B',
          700: '#475569',
          800: '#2D3748',
          900: '#1A202C',
        },
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(19, 37, 70, 0.08), 0 1px 2px -1px rgba(19, 37, 70, 0.06)',
        'card-hover': '0 4px 12px 0 rgba(19, 37, 70, 0.12), 0 2px 4px -1px rgba(19, 37, 70, 0.08)',
        'nav': '0 1px 0 0 rgba(19, 37, 70, 0.1)',
      },
    }
  },
  plugins: []
}
