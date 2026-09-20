import React, { useCallback, useEffect, useState } from 'react';

/**
 * Подсказка при первом запуске.
 *
 * Новый зритель видел чёрный экран с одной строкой и дальше догадывался сам:
 * что камеру можно вращать, что светящиеся метки кликабельны и что у каждого
 * фактора есть обратная сторона. Здесь это сказано один раз — тремя строками,
 * без модального окна поверх кадра: слой минималистичный, и тур на полэкрана
 * спорил бы с ним.
 *
 * Подсказка живёт на макро-уровне: на сингулярности взаимодействие ровно одно,
 * и объяснять там нечего.
 */

const STORAGE_KEY = 'reality:onboarded';

const HINTS = [
    { gesture: 'Колесо', meaning: 'следующий слой реальности' },
    { gesture: 'Зажми и веди', meaning: 'повернуть камеру' },
    { gesture: 'Клик по метке', meaning: 'фактор и его обратная сторона' },
];

/**
 * localStorage бросает в приватном режиме и при запрете хранилища, а подсказка
 * не та вещь, ради которой стоит ронять весь интерфейс.
 */
function readSeen() {
    try {
        return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function writeSeen() {
    try {
        localStorage.setItem(STORAGE_KEY, '1');
    } catch {
        // Хранилище недоступно — подсказка просто покажется снова
    }
}

export default function Onboarding({ stage, hidden, light }) {
    const [seen, setSeen] = useState(readSeen);
    const [open, setOpen] = useState(false);

    // Появляется не в момент прилёта, а когда кадр уже собрался: иначе
    // подсказка всплывает поверх вспышки перехода
    useEffect(() => {
        if (seen || stage !== 1) return undefined;
        const timer = setTimeout(() => setOpen(true), 1600);
        return () => clearTimeout(timer);
    }, [seen, stage]);

    // Ушёл дальше по пути — значит разобрался сам
    useEffect(() => {
        if (seen || stage <= 1) return;
        setSeen(true);
        setOpen(false);
        writeSeen();
    }, [seen, stage]);

    const dismiss = useCallback(() => {
        setOpen(false);
        setSeen(true);
        writeSeen();
    }, []);

    if (stage === 0 || hidden) return null;

    const muted = light ? 'text-slate-500' : 'text-white/45';
    const accent = light ? 'text-slate-900' : 'text-white/90';
    const panel = light
        ? 'border-slate-300 bg-white/80 text-slate-700'
        : 'border-white/15 bg-black/70 text-white/70';

    return (
        <div className="absolute bottom-10 left-10 z-[60] flex flex-col items-start gap-3 pointer-events-none">
            {open && (
                <div className={`pointer-events-auto w-72 rounded-2xl border p-5 backdrop-blur-md shadow-lg animate-fade-in ${panel}`}>
                    <p className={`text-[10px] uppercase tracking-[0.4em] mb-4 ${muted}`}>
                        Как это работает
                    </p>
                    <ul className="flex flex-col gap-3 mb-5">
                        {HINTS.map((hint) => (
                            <li key={hint.gesture} className="text-xs leading-snug">
                                <span className={`font-medium ${accent}`}>{hint.gesture}</span>
                                <span className={muted}> — {hint.meaning}</span>
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={dismiss}
                        className={`text-[11px] uppercase tracking-wider transition-colors ${light
                            ? 'text-slate-500 hover:text-slate-950'
                            : 'text-white/50 hover:text-white'}`}
                    >
                        Понятно
                    </button>
                </div>
            )}

            {/* Подсказку можно вызвать обратно: один раз прочитать мало, а
                искать её в настройках негде */}
            <button
                onClick={() => (open ? dismiss() : setOpen(true))}
                aria-label="Подсказка по управлению"
                className={`pointer-events-auto h-8 w-8 rounded-full border text-xs transition-colors ${light
                    ? 'border-slate-300 bg-white/70 text-slate-500 hover:text-slate-950'
                    : 'border-white/20 bg-black/50 text-white/50 hover:text-white'}`}
            >
                ?
            </button>
        </div>
    );
}
