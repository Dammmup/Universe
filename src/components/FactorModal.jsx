import React from 'react';
import { useStore } from '../store';
import { FACTORS_DATA } from '../data/factors';
import { placeOfFactor } from '../data/locations';
import { SCENARIOS } from '../data/scenarios';
import { activeSourcesOf, echoesOf } from '../data/consequences';
import { STAGE } from '../lib/stages';

/**
 * Карточка фактора.
 *
 * Прежняя версия была плашкой с двумя кнопками, где «Включить Засуха» читалось
 * как ошибка, а связь фактора с остальным миром не показывалась никак. Здесь
 * пара «фактор ↔ антипод» — это переключатель: оба состояния видны сразу, и
 * понятно, куда ведёт клик. Внизу — сколько миров-комбинаций проходит через
 * этот фактор: подсказка без спойлера, что его стоит сочетать с другими.
 */
export default function FactorModal() {
    const activeFactorId = useStore((s) => s.activeFactorId);
    const isReversed = useStore((s) => !!s.reversedFactors[s.activeFactorId]);
    const toggleReverse = useStore((s) => s.toggleReverse);
    const clearFactor = useStore((s) => s.clearFactor);
    const discovered = useStore((s) => s.discoveredScenarios);
    const blocked = useStore((s) => s.scenarioQueue.length > 0);
    const reversedAll = useStore((s) => s.reversedFactors);
    // В «Разуме» карточка уходит вбок: сеть нейронов — главное, что меняет клик
    const docked = useStore((s) => s.stage === STAGE.MIND);

    const factor = activeFactorId ? FACTORS_DATA[activeFactorId] : null;
    if (!factor || blocked) return null;

    const place = placeOfFactor(activeFactorId);
    const related = SCENARIOS.filter((s) => s.factors.includes(activeFactorId));
    const found = related.filter((s) => discovered[s.id]);
    const accent = isReversed ? 'text-cyan-300' : 'text-fuchsia-300';
    const incoming = activeSourcesOf(reversedAll, activeFactorId);
    const outgoing = echoesOf(activeFactorId);

    return (
        <div
            className={docked
                ? 'absolute right-4 top-1/2 -translate-y-1/2 z-[100] w-[calc(100vw-2rem)] max-w-sm pointer-events-auto animate-fade-in max-h-[80vh] overflow-y-auto'
                : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] w-[calc(100vw-2rem)] max-w-lg pointer-events-auto animate-fade-in'}
            role="dialog"
            aria-label={isReversed ? factor.reverseName : factor.name}
        >
            <div className={`relative overflow-hidden rounded-2xl border bg-[#07080d]/90 backdrop-blur-xl p-5 sm:p-7 flex flex-col gap-4 transition-shadow duration-700 ${isReversed
                ? 'border-cyan-300/25 shadow-[0_0_60px_rgba(80,220,255,0.18)]'
                : 'border-fuchsia-300/25 shadow-[0_0_60px_rgba(240,120,255,0.16)]'}`}
            >
                {/* Световое пятно за заголовком меняет тон вместе с состоянием */}
                <div className={`pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full blur-3xl opacity-40 transition-colors duration-700 ${isReversed ? 'bg-cyan-500' : 'bg-fuchsia-600'}`} />

                <div className="relative flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                        {place ? [place.title, place.place].filter(Boolean).join(' · ') : 'Фактор реальности'}
                    </p>
                    <button
                        onClick={clearFactor}
                        aria-label="Закрыть"
                        className="h-7 w-7 shrink-0 rounded-full border border-white/15 text-white/50 hover:text-white hover:border-white/40 transition-colors text-sm leading-none"
                    >
                        ×
                    </button>
                </div>

                <h3 className={`relative text-2xl sm:text-3xl font-light uppercase tracking-[0.14em] transition-colors duration-500 ${accent}`}>
                    {isReversed ? factor.reverseName : factor.name}
                </h3>

                <p className="relative text-[15px] text-white/85 leading-relaxed">
                    {isReversed ? factor.reverseDescription : factor.description}
                </p>

                <div className="relative rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3">
                    <span className="text-[10px] text-white/40 uppercase tracking-[0.3em] block mb-1">Природа фактора</span>
                    <p className="text-sm text-amber-100/80 italic leading-relaxed">{factor.influence}</p>
                </div>

                {/* Переключатель: оба полюса видны, активный подсвечен */}
                <button
                    onClick={toggleReverse}
                    className="relative grid grid-cols-2 rounded-full border border-white/15 bg-black/40 p-1 text-[11px] sm:text-xs uppercase tracking-wider"
                    aria-label={`Переключить на ${isReversed ? factor.name : factor.reverseName}`}
                >
                    <span
                        className={`absolute top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full transition-all duration-500 ease-out ${isReversed
                            ? 'left-[calc(50%+0rem)] bg-cyan-400/90'
                            : 'left-1 bg-fuchsia-400/90'}`}
                    />
                    <span className={`relative z-10 py-2 px-2 truncate transition-colors ${isReversed ? 'text-white/50' : 'text-black font-semibold'}`}>
                        {factor.name}
                    </span>
                    <span className={`relative z-10 py-2 px-2 truncate transition-colors ${isReversed ? 'text-black font-semibold' : 'text-white/50'}`}>
                        {factor.reverseName}
                    </span>
                </button>

                {/* Эхо: связь с другими слоями — откуда пришло и куда уйдёт */}
                {(incoming.length > 0 || outgoing.length > 0) && (
                    <div className="relative flex flex-col gap-1.5 rounded-xl border border-amber-200/15 bg-amber-200/[0.04] px-4 py-3">
                        <span className="text-[10px] uppercase tracking-[0.3em] text-amber-200/60">Эхо между слоями</span>
                        {incoming.map((l) => (
                            <p key={`in-${l.from}`} className="text-xs text-amber-100/85 leading-snug">
                                ← Сейчас действует: {l.text}
                            </p>
                        ))}
                        {outgoing.map((l) => (
                            <p key={`out-${l.to}`} className={`text-xs leading-snug ${isReversed ? 'text-white/75' : 'text-white/45'}`}>
                                → {isReversed ? '' : 'Если перевернуть: '}{l.text}
                            </p>
                        ))}
                    </div>
                )}

                {related.length > 0 && (
                    <p className="relative text-[11px] text-white/40 leading-snug">
                        Этот фактор входит в миров-комбинаций: <span className="text-white/70">{related.length}</span>
                        {found.length > 0 && <> · открыто: <span className="text-amber-200/80">{found.map((s) => s.title).join(', ')}</span></>}
                        {found.length === 0 && ' — переверни его вместе с другими и посмотри, что получится.'}
                    </p>
                )}
            </div>
        </div>
    );
}
