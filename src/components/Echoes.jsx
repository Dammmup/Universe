import React, { useEffect } from 'react';
import { useStore } from '../store';

/** Одно уведомление: живёт шесть секунд и уходит само. */
function Echo({ echo, onDone }) {
    useEffect(() => {
        const timer = setTimeout(() => onDone(echo.key), 6000);
        return () => clearTimeout(timer);
    }, [echo.key, onDone]);

    return (
        <div className="pointer-events-auto flex items-start gap-3 rounded-xl border border-amber-200/20 bg-black/75 px-4 py-3 backdrop-blur-md shadow-lg animate-rise-in">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300 animate-pulse" />
            <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-200/60 mb-1">Эхо на другом слое</p>
                <p className="text-xs text-white/80 leading-snug">{echo.text}</p>
            </div>
            <button onClick={() => onDone(echo.key)} aria-label="Скрыть" className="text-white/40 hover:text-white text-sm leading-none">×</button>
        </div>
    );
}

/**
 * Уведомления об эхе: переворот фактора отозвался там, где его сейчас нет в
 * кадре — в тайге, в теле, в городе. Без уведомления связь слоёв оставалась
 * бы невидимой до случайного визита в нужную локацию.
 */
export default function Echoes() {
    const echoes = useStore((s) => s.echoes);
    const dismiss = useStore((s) => s.dismissEcho);
    if (!echoes.length) return null;
    return (
        <div className="absolute right-4 top-16 z-[110] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 pointer-events-none">
            {echoes.map((e) => <Echo key={e.key} echo={e} onDone={dismiss} />)}
        </div>
    );
}
