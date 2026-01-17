/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./host/index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        screens: {
            'xs': '480px',
            'sm': '640px',
            'md': '768px',
            'lg': '1024px',
            'xl': '1280px',
            '2xl': '1536px',
            '3xl': '1920px',
            '4xl': '2560px',
        },
        extend: {
            colors: {
                'brand-dark': '#121212',
                'brand-gray': '#1E1E1E',
                'brand-neon': '#EE7A45',
                'brand-accent': '#535353',
            },
            animation: {
                'spin-slow': 'spin 8s linear infinite',
            },
        },
    },
    plugins: [],
}
