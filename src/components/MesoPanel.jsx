import React from 'react';
import { useStore } from '../store';
import { locationById, locationsForStage } from '../data/locations';

/**
 * Нижняя панель мезо-уровней: где зритель находится и куда можно нырнуть.
 * На карте — список локаций слоя, внутри диорамы — её название, возврат к
 * карте и быстрый переход в соседние локации без подъёма на орбиту.
 */
export default function MesoPanel({ stage, touch }) {
    const location = useStore((s) => s.location);
    const reversed = useStore((s) => s.reversedFactors);
    const enterLocation = useStore((s) => s.enterLocation);
    const leaveLocation = useStore((s) => s.leaveLocation);

    const current = locationById(location);
    const list = locationsForStage(stage);
    const isNature = stage === 2;
    const kicker = isNature ? 'Мезо-уровень 1 · Природа и стихии' : 'Мезо-уровень 2 · Общество и города';
    const kickerColor = isNature ? 'text-emerald-300/80' : 'text-amber-300/80';

    const hint = current
        ? (touch ? 'Касание метки — фактор. Двумя пальцами — облёт. Свайп назад — к карте.' : 'Кликай на метки факторов, вращай камеру. Колесо назад — к карте.')
        : (touch ? 'Коснись локации на планете или выбери ниже. Свайп дальше — следующий слой.' : 'Выбери локацию на планете или ниже. Скролль дальше — следующий слой.');

    return (
        <div className="text-white/70 animate-fade-in relative z-50 pointer-events-auto">
            <p className={`tracking-[0.3em] uppercase text-[10px] sm:text-[11px] mb-1.5 ${kickerColor}`}>
                {kicker}
            </p>
            {current && (
                <p className="text-lg sm:text-2xl font-light tracking-[0.2em] uppercase text-white mb-1">
                    {current.title}
                    <span className="text-white/40 text-xs sm:text-sm tracking-[0.1em] normal-case"> · {current.place}</span>
                </p>
            )}
            <p className="text-[11px] sm:text-xs text-white/40 mb-3">{hint}</p>

            <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
                {current && (
                    <button
                        onClick={leaveLocation}
                        className="px-3 py-1 rounded-full border border-white/25 bg-white/10 text-[10px] sm:text-[11px] uppercase tracking-wider text-white/80 hover:bg-white hover:text-black transition-colors"
                    >
                        ← Карта
                    </button>
                )}
                {list.map((l) => {
                    const count = l.factors.filter((f) => reversed[f]).length;
                    const active = l.id === location;
                    return (
                        <button
                            key={l.id}
                            onClick={() => enterLocation(l.id)}
                            disabled={active}
                            className={`group px-3 py-1 rounded-full border text-[10px] sm:text-[11px] uppercase tracking-wider transition-colors ${active
                                ? 'border-transparent text-black'
                                : 'border-white/15 bg-black/40 text-white/60 hover:text-white hover:border-white/40'}`}
                            style={active ? { background: l.accent } : undefined}
                        >
                            {l.title}
                            {count > 0 && (
                                <span className={`ml-1.5 ${active ? 'text-black/60' : 'text-white/35'}`}>{count}/{l.factors.length}</span>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
