import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { FACTORS_DATA } from '../data/factors';
import { placeOfFactor } from '../data/locations';
import { SCENARIOS, SCENARIO_KINDS, scenarioById } from '../data/scenarios';

const placeOf = (factorId) => placeOfFactor(factorId)?.title ?? null;

/**
 * Окно сложившегося мира. Появляется поверх всего, когда перевёрнутые факторы
 * совпали с одним из сценариев (data/scenarios.js). Несколько сценариев за
 * одно переключение показываются по очереди.
 */
export function ScenarioModal() {
    const queue = useStore((s) => s.scenarioQueue);
    const dismiss = useStore((s) => s.dismissScenario);
    const total = SCENARIOS.length;
    const found = useStore((s) => Object.keys(s.discoveredScenarios).length);
    const scenario = scenarioById(queue[0]);

    useEffect(() => {
        if (!scenario) return undefined;
        const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') dismiss(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [scenario, dismiss]);

    if (!scenario) return null;
    const kind = SCENARIO_KINDS[scenario.kind];

    return (
        <div className="absolute inset-0 z-[120] flex items-center justify-center p-4 pointer-events-auto">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={dismiss} />
            <div
                key={scenario.id}
                className="relative w-full max-w-xl overflow-hidden rounded-3xl border bg-[#06070b]/95 px-6 py-8 sm:px-10 sm:py-10 text-center animate-rise-in"
                style={{ borderColor: `${kind.accent}55`, boxShadow: `0 0 90px ${kind.glow}` }}
                role="dialog"
                aria-label={scenario.title}
            >
                <div
                    className="pointer-events-none absolute left-1/2 -top-40 h-72 w-72 -translate-x-1/2 rounded-full blur-3xl opacity-50"
                    style={{ background: kind.accent }}
                />
                <p className="relative text-[10px] sm:text-[11px] uppercase tracking-[0.4em] mb-4" style={{ color: kind.accent }}>
                    {kind.kicker}
                </p>
                <h2 className="relative text-3xl sm:text-4xl font-light tracking-wide text-white mb-5">
                    {scenario.title}
                </h2>
                <p className="relative text-[15px] leading-relaxed text-white/80 mb-7">
                    {scenario.text}
                </p>

                <div className="relative flex flex-wrap justify-center gap-2 mb-8">
                    {scenario.factors.map((id) => (
                        <span key={id} className="rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] uppercase tracking-wider text-white/70">
                            {FACTORS_DATA[id]?.reverseName ?? id}
                            {placeOf(id) && <span className="text-white/35 normal-case tracking-normal"> · {placeOf(id)}</span>}
                        </span>
                    ))}
                </div>

                <div className="relative flex flex-col sm:flex-row items-center justify-center gap-4">
                    <button
                        onClick={dismiss}
                        className="rounded-full px-7 py-2.5 text-xs uppercase tracking-[0.25em] text-black font-semibold transition-transform hover:scale-105"
                        style={{ background: kind.accent }}
                    >
                        {queue.length > 1 ? 'Дальше' : 'Продолжить'}
                    </button>
                    <span className="text-[11px] text-white/40 tracking-wider">
                        Открыто миров: {found} из {total}
                    </span>
                </div>
            </div>
        </div>
    );
}

/**
 * Журнал миров: сколько комбинаций уже сложилось и сколько ещё скрыто.
 * Неоткрытые показывают только число нужных факторов — цель, но не ответ.
 */
export function ScenarioJournal({ light = false, hidden = false }) {
    const discovered = useStore((s) => s.discoveredScenarios);
    const [open, setOpen] = useState(false);
    const found = Object.keys(discovered).length;

    if (hidden) return null;

    const chip = light
        ? 'border-slate-300 bg-white/75 text-slate-600 hover:text-slate-950'
        : 'border-white/20 bg-black/50 text-white/60 hover:text-white';

    return (
        <div className="absolute top-4 right-4 z-[70] flex flex-col items-end gap-2 pointer-events-none">
            <button
                onClick={() => setOpen((v) => !v)}
                className={`pointer-events-auto rounded-full border px-3.5 py-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.25em] backdrop-blur-md transition-colors ${chip}`}
            >
                Миры {found}/{SCENARIOS.length}
            </button>
            {open && (
                <div className="pointer-events-auto w-72 max-w-[calc(100vw-2rem)] max-h-[60vh] overflow-y-auto rounded-2xl border border-white/15 bg-black/85 p-4 backdrop-blur-xl animate-fade-in">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-white/40 mb-3">
                        Комбинации факторов
                    </p>
                    <ul className="flex flex-col gap-2">
                        {SCENARIOS.map((s) => {
                            const kind = SCENARIO_KINDS[s.kind];
                            const isFound = !!discovered[s.id];
                            return (
                                <li key={s.id} className="flex items-start gap-2.5 text-xs leading-snug">
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: isFound ? kind.accent : 'rgba(255,255,255,0.2)' }} />
                                    {isFound
                                        ? <span className="text-white/85">{s.title}</span>
                                        : <span className="text-white/35">??? · нужно факторов: {s.factors.length}</span>}
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
