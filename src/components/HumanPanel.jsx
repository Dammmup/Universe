import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { BODY_LAYERS } from '../data/bodyLayers';
import { MIND_SYSTEMS } from '../data/mind';
import { music } from '../lib/music';

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

/** Что играет сейчас — строка появляется, только если трек действительно нашёлся. */
function NowPlaying() {
    const [state, setState] = useState(music.state);
    useEffect(() => music.subscribe(setState), []);
    if (!state.playing || !state.track) return null;
    const { artist, title } = state.track;
    return (
        <p className="mt-2 text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-violet-200/80">
            ♪ {artist ? `${artist} — ${title}` : title}
        </p>
    );
}

/**
 * Панель разума: фильтр систем и подсказка.
 *
 * Семнадцать подписанных нейронов разом не читались и ставили рядом разные
 * уровни — «Эмоцию» с её же гневом и страхом. Чипы показывают по одной
 * системе; выбранный чип сразу ставит сеть в общий режим этой системы, так что
 * «Чувства» — это и есть нейрон «Эмоция», только как целое.
 */
export function MindPanel({ touch }) {
    const focus = useStore((s) => s.mindFocus);
    const system = useStore((s) => s.mindSystem);
    const setMindSystem = useStore((s) => s.setMindSystem);
    const setMindFocus = useStore((s) => s.setMindFocus);
    const active = MIND_SYSTEMS.find((x) => x.id === system);

    const pick = (x) => {
        setMindSystem(x.id);
        // Чип — это не только фильтр: сеть сразу переходит в общий режим системы
        setMindFocus(x.mode);
    };

    return (
        <div className="text-white/70 animate-fade-in relative z-50">
            <p className="tracking-[0.3em] uppercase text-[10px] sm:text-[11px] mb-2 text-violet-300">Антропо-уровень · Разум</p>
            <div className="pointer-events-auto inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 mb-2">
                {MIND_SYSTEMS.map((x) => (
                    <button
                        key={x.id}
                        onClick={() => pick(x)}
                        aria-pressed={x.id === system}
                        className={`px-3 py-1 rounded-full border text-[10px] sm:text-[11px] uppercase tracking-wider transition-colors ${x.id === system
                            ? 'border-transparent text-black'
                            : 'border-white/20 bg-black/40 text-white/55 hover:text-white'}`}
                        style={x.id === system ? { background: x.color } : undefined}
                    >
                        {x.title}
                    </button>
                ))}
            </div>
            {active && <p className="text-[11px] text-white/40 mb-1">{active.hint}</p>}
            <p className="text-xs text-white/45">
                {focus
                    ? 'Сеть работает в режиме выбранного нейрона. Переверни его — включится антипод.'
                    : (touch ? 'Коснись нейрона — сеть перейдёт в его состояние.' : 'Кликни нейрон — вся сеть перейдёт в его состояние.')}
                {' '}{touch ? 'Свайп дальше — в клетку.' : 'Скролль дальше — в клетку.'}
            </p>
            <NowPlaying />
        </div>
    );
}
