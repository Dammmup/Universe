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
                // Окно сценария всплывает из глубины — событие важнее подсказки
                'rise-in': {
                    from: { opacity: '0', transform: 'translateY(24px) scale(0.94)' },
                    to: { opacity: '1', transform: 'translateY(0) scale(1)' },
                },
            },
            animation: {
                'fade-in': 'fade-in 700ms ease-out both',
                'rise-in': 'rise-in 900ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }
        },
    },
    plugins: [],
}
