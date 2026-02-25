/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Roboto', 'Inter', 'sans-serif'],
            },
            colors: {
                layer: {
                    1: '#1a1aff', // deep blue
                    2: '#ff6600', // orange
                    3: '#00ff88', // green
                    4: '#9933ff', // violet
                    5: '#ffffff', // white
                }
            }
        },
    },
    plugins: [],
}
