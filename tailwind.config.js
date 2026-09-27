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
            },
            // Класс animate-fade-in стоял по всему приложению, но анимации с
            // таким именем не было — подписи слоёв и модалка фактора просто
            // возникали. Только прозрачность: сдвиг перебил бы центрирование
            // через transform у модалки фактора.
            keyframes: {
                'fade-in': {
                    from: { opacity: '0' },
                    to: { opacity: '1' },
                },
            },
            animation: {
                'fade-in': 'fade-in 700ms ease-out both',
            }
        },
    },
    plugins: [],
}
