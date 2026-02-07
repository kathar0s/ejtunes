/** @type {import('tailwindcss').Config} */
export default {
    darkMode: 'class',
    content: [
        "./index.html",
        "./host/index.html",
        "./login/index.html",
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
                'brand-dark': '#111315', // Charcoal Black
                'brand-gray': '#1E1E1E', // Charcoal
                'brand-mint': '#44C6CC', // Maldives Mint (Accent)
                'brand-offwhite': '#F7F7F5', // Off-White (Light mode bg)
            },
            animation: {
                'spin-slow': 'spin 8s linear infinite',
            },
            backgroundImage: {
                'login-day': "url('/bg_light.jpeg')",
                'login-dark': "url('/bg_dark.jpeg')",
            },
        },
    },
    plugins: [],
}
