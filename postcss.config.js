export default {
  plugins: {
    tailwindcss: {},
    'postcss-preset-env': {
      stage: 2,
      features: {
        'nesting-rules': false, // Tailwind handles this
      },
      autoprefixer: {
        flexbox: 'no-2009',
        grid: 'autoplace',
      },
    },
    autoprefixer: {},
  },
}
