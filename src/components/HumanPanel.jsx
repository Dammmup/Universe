import React from 'react';
import { useStore } from '../store';
import { BODY_LAYERS } from '../data/bodyLayers';

/**
 * Панель антропо-уровня: подуровни тела вкладками по глубине и вход в разум.
 * Колесо листает те же подуровни — вкладки нужны, чтобы прыгнуть сразу.
 */
export function HumanPanel({ touch }) {
    const bodyLayer = useStore((s) => s.bodyLayer);
    const setBodyLayer = useStore((s) => s.setBodyLayer);
    const enterMind = useStore((s) => s.enterMind);
    const layer = BODY_LAYERS[bodyLayer];

    return (
        <div className="text-slate-700 animate-fade-in relative z-50 pointer-events-auto">
            <p className="tracking-[0.3em] uppercase text-[10px] sm:text-[11px] mb-1 text-rose-600">
                Антропо-уровень · {bodyLayer + 1} из {BODY_LAYERS.length}
            </p>
            <p className="text-lg sm:text-2xl font-light tracking-[0.2em] uppercase text-slate-900 mb-1">{layer.title}</p>
            <p className="text-[11px] sm:text-xs text-slate-500 mb-3">{layer.hint}</p>
            <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 mb-2">
                {BODY_LAYERS.map((l, i) => (
                    <button
                        key={l.id}
                        onClick={() => setBodyLayer(i)}
                        className={`px-3 py-1 rounded-full border text-[10px] sm:text-[11px] uppercase tracking-wider transition-colors ${i === bodyLayer
                            ? 'border-transparent text-white'
                            : 'border-slate-300 bg-white/70 text-slate-500 hover:text-slate-950'}`}
                        style={i === bodyLayer ? { background: l.accent } : undefined}
                    >
                        {i + 1}. {l.title}
                    </button>
                ))}
                <button
                    onClick={enterMind}
                    className="px-3 py-1 rounded-full border border-violet-400 bg-violet-500/90 text-[10px] sm:text-[11px] uppercase tracking-wider text-white hover:bg-violet-600 transition-colors"
                >
                    В разум →
                </button>
            </div>
            <p className="text-[11px] text-slate-400">
                {touch ? 'Свайп — слой глубже. ◆ — аномалия.' : 'Колесо — слой глубже. ◆ — аномалия. На нервах клик по мозгу — внутрь разума.'}
            </p>
        </div>
    );
}

export function MindPanel({ touch }) {
    const focus = useStore((s) => s.mindFocus);
    return (
        <div className="text-white/70 animate-fade-in relative z-50">
            <p className="tracking-[0.3em] uppercase text-[10px] sm:text-[11px] mb-1 text-violet-300">Антропо-уровень · Разум</p>
            <p className="text-xs text-white/45">
                {focus
                    ? 'Сеть работает в режиме выбранного нейрона. Переверни его — включится антипод.'
                    : (touch ? 'Коснись нейрона — сеть перейдёт в его состояние.' : 'Кликни нейрон — вся сеть перейдёт в его состояние.')}
                {' '}{touch ? 'Свайп дальше — в клетку.' : 'Скролль дальше — в клетку.'}
            </p>
        </div>
    );
}
