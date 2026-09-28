import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { profileFor, sound } from '../lib/audio';
import { STAGE } from '../lib/stages';
import { CITY_LOCATIONS } from '../data/locations';
import { scenarioById } from '../data/scenarios';

const STORAGE_KEY = 'reality:sound';

function readEnabled() {
    try {
        return localStorage.getItem(STORAGE_KEY) !== '0';
    } catch {
        return true;
    }
}

/**
 * Связывает звук с путём: профиль эмбиента по слою и локации, настроение
 * по перевёрнутым факторам, эффекты на события стора. Ничего не рисует.
 */
export function SoundController() {
    useEffect(() => {
        sound.setEnabled(readEnabled());
        // Браузер разрешает звук только после жеста зрителя
        const unlock = () => sound.unlock();
        const events = ['pointerdown', 'wheel', 'touchstart', 'keydown'];
        events.forEach((e) => window.addEventListener(e, unlock, { passive: true }));

        const apply = (state) => {
            const isCity = CITY_LOCATIONS.some((l) => l.id === state.location);
            sound.setProfile(profileFor({ stage: state.stage, location: state.location, STAGE, isCity }));
            const r = state.reversedFactors;
            // Сердце на теле слышно: стресс и аритмия его разгоняют, ишемия замедляет
            let heart = 64;
            if (r.heartRhythm) heart = 118;
            else if (r.circulation) heart = 44;
            else if (r.stress) heart = 56;
            // Сеть разума щёлкает чаще в гневе и стрессе, реже во сне
            const crackleByFocus = { anger: 22, stress: 30, attention: 12, sleep: 1.5, dreaming: 3, joy: 14 };
            sound.setMood({ heart, crackle: crackleByFocus[state.mindFocus] ?? 6 });
        };
        apply(useStore.getState());

        const unsubscribe = useStore.subscribe((state, prev) => {
            apply(state);
            if (state.reversedFactors !== prev.reversedFactors && prev.activeFactorId) {
                sound.toggle(!!state.reversedFactors[prev.activeFactorId]);
            }
            if (state.shift && !prev.shift) sound.whoosh();
            if (state.scenarioQueue.length > prev.scenarioQueue.length) {
                sound.scenario(scenarioById(state.scenarioQueue[state.scenarioQueue.length - 1])?.kind);
            }
            if (state.echoes.length > prev.echoes.length) setTimeout(() => sound.echo(), 400);
        });

        return () => {
            unsubscribe();
            events.forEach((e) => window.removeEventListener(e, unlock));
        };
    }, []);
    return null;
}

/** Кнопка «Звук»: выбор запоминается между визитами. */
export function SoundToggle({ light = false }) {
    const [on, setOn] = useState(readEnabled);
    const toggle = () => {
        const next = !on;
        setOn(next);
        sound.unlock();
        sound.setEnabled(next);
        try {
            localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        } catch {
            // Хранилище недоступно — выбор просто не запомнится
        }
    };
    const chip = light
        ? 'border-slate-300 bg-white/75 text-slate-600 hover:text-slate-950'
        : 'border-white/20 bg-black/50 text-white/60 hover:text-white';
    return (
        <button
            onClick={toggle}
            aria-pressed={on}
            className={`pointer-events-auto rounded-full border px-3.5 py-1.5 text-[10px] sm:text-[11px] uppercase tracking-[0.25em] backdrop-blur-md transition-colors ${chip}`}
        >
            {on ? '♪ Звук' : '♪ Тихо'}
        </button>
    );
}
