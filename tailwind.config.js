/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // Roboto как веб-шрифт не грузится (файл в public — только для
            // подписей в 3D), и интерфейс падал в Arial без светлого
            // начертания: font-light рисовался обычным. Системный шрифт
            // приходит со всеми весами и оптическими размерами.
            fontFamily: {
                sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
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
                // Стрелка «крути вниз»: короткий толчок в сторону жеста и пауза
                'scroll-cue': {
                    '0%, 60%, 100%': { transform: 'translateY(0)', opacity: '0.7' },
                    '30%': { transform: 'translateY(6px)', opacity: '1' },
                },
            },
            animation: {
                'scroll-cue': 'scroll-cue 2.2s cubic-bezier(0.45, 0, 0.55, 1) infinite',
                'fade-in': 'fade-in 700ms ease-out both',
                'rise-in': 'rise-in 900ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }
        },
    },
    plugins: [],
}
