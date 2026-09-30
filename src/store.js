import { create } from 'zustand';
import { newlyCompleted } from './data/scenarios';
import { echoesOf } from './data/consequences';
import { MAX_STAGE, STAGE, isEarthStage, isMapStage } from './lib/stages';
import { BODY_LAYER_COUNT } from './data/bodyLayers';

// Слои пути и их порядок — в lib/stages.js. Мезо-уровень — три слоя одной
// планеты: общие процессы Земли, природные локации и города.

const { COSMOS, PLANET, SOCIETY, HUMAN, MIND, CELL, FINALE } = STAGE;

/**
 * Какой вуалью накрыт переход между слоями. Смена сцены — это подмена всего
 * содержимого кадра: без накрытия она читается как склейка. Переходов между
 * тремя слоями планеты здесь нет намеренно — сцена одна и та же, планета
 * доворачивается в кадре.
 */
const VEIL_KIND = {
    [`${STAGE.SINGULARITY}>${COSMOS}`]: 'bang',    // ударная волна взрыва выбеливает кадр
    [`${COSMOS}>${STAGE.SINGULARITY}`]: 'collapse',
    [`${COSMOS}>${PLANET}`]: 'dive',               // вход в атмосферу
    [`${PLANET}>${COSMOS}`]: 'ascend',
    [`${SOCIETY}>${HUMAN}`]: 'flesh',              // с планеты в тело: тьма переходит в свет
    [`${HUMAN}>${SOCIETY}`]: 'ascend',
    [`${HUMAN}>${MIND}`]: 'mind',                  // сквозь мозг — внутрь сети нейронов
    [`${MIND}>${HUMAN}`]: 'flesh',                 // из разума обратно к телу
    [`${MIND}>${CELL}`]: 'matter',                 // из сети в одну клетку: проваливание в вещество
    [`${CELL}>${MIND}`]: 'mind',
    [`${CELL}>${FINALE}`]: 'origin',               // клетка растворяется, кадр возвращается к началу
    [`${FINALE}>${CELL}`]: 'collapse',
};

export const veilKindFor = (from, to) => VEIL_KIND[`${from}>${to}`] ?? 'dive';

let shiftSeq = 0;

const enterStage = (stage, state, extra = {}) => ({
    stage,
    isExploded: stage > 0 || state.isExploded,
    hasPlayedBang: state.hasPlayedBang || stage > 0,
    activeFactorId: null,
    location: null,
    // Тело открывается с кожи; возврат из разума — на нервы, самый глубокий подуровень
    bodyLayer: 0,
    mindFocus: null,
    approachingEarth: false,
    // На Земле сначала киношный кадр, облёт включается, когда камера доехала
    freeLook: !isEarthStage(stage),
    ...extra,
});

export const useStore = create((set, get) => ({
    stage: 0,
    isExploded: false, // Флаг для анимации большого взрыва
    hasPlayedBang: false,

    // Состояние для интерактивных факторов
    activeFactorId: null,
    reversedFactors: {}, // { acceleration: true, gravity: false, ... }
    setActiveFactor: (id) => set({ activeFactorId: id }),
    toggleReverse: () => set((state) => {
        if (!state.activeFactorId) return state;

        const reversedFactors = {
            ...state.reversedFactors,
            [state.activeFactorId]: !state.reversedFactors[state.activeFactorId]
        };

        // Эхо: переворот отзывается на других слоях — зритель должен это
        // увидеть, иначе последствие случится там, где его сейчас нет в кадре
        const echoes = reversedFactors[state.activeFactorId]
            ? echoesOf(state.activeFactorId).map((l) => ({ key: `${l.from}>${l.to}:${Date.now()}`, text: l.text }))
            : [];
        const echoState = echoes.length ? { echoes: [...state.echoes, ...echoes].slice(-4) } : {};

        // Сценарий срабатывает один раз за путь: иначе, щёлкая один фактор
        // туда-обратно, зритель получал бы одно и то же окно раз за разом
        const fresh = newlyCompleted(reversedFactors, state.discoveredScenarios);
        if (!fresh.length) return { reversedFactors, ...echoState };

        const discoveredScenarios = { ...state.discoveredScenarios };
        fresh.forEach((id) => { discoveredScenarios[id] = true; });
        return {
            reversedFactors,
            ...echoState,
            discoveredScenarios,
            scenarioQueue: [...state.scenarioQueue, ...fresh],
        };
    }),
    isFactorReversed: (id) => Boolean(useStore.getState().reversedFactors[id]),
    clearFactor: () => set({ activeFactorId: null }),

    // Уведомления об эхе на других слоях (data/consequences.js)
    echoes: [],
    dismissEcho: (key) => set((state) => ({ echoes: state.echoes.filter((e) => e.key !== key) })),

    // ─── Сценарии мира (data/scenarios.js) ───────────────────────────────────
    discoveredScenarios: {},
    // Очередь окон: одно переключение может собрать сразу несколько миров
    scenarioQueue: [],
    dismissScenario: () => set((state) => ({ scenarioQueue: state.scenarioQueue.slice(1) })),

    // ─── Локации мезо-уровней (data/locations.js) ────────────────────────────
    // null — глобус-карта; иначе открыта диорама локации. Вход и выход накрыты
    // вуалью: планета и местность — разные масштабы, склейка между ними резала бы глаз.
    location: null,
    enterLocation: (id) => {
        const state = get();
        if (state.shift || state.approachingEarth || state.location === id) return;
        if (!isMapStage(state.stage)) return;
        get().beginShift('dive', { type: 'location', id });
    },
    leaveLocation: () => {
        const state = get();
        if (state.shift || !state.location) return;
        get().beginShift('ascend', { type: 'location', id: null });
    },

    // Подуровень тела на антропо-уровне: 0 — кожа … последний — нервы
    // (data/bodyLayers.js). Меняется без вуали: слой снимается с фигуры.
    bodyLayer: 0,
    setBodyLayer: (index) => set((state) => {
        const next = Math.max(0, Math.min(BODY_LAYER_COUNT - 1, index));
        return next === state.bodyLayer ? state : { bodyLayer: next, activeFactorId: null };
    }),
    // Нейрон, в режиме которого сейчас работает сеть «Разума» (scenes/Mind.jsx).
    // Живёт дольше карточки фактора: окно закрыто — режим остаётся.
    mindFocus: null,
    setMindFocus: (id) => set({ mindFocus: id }),

    /** Клик по мозгу: сквозь него — в сеть нейронов. */
    enterMind: () => {
        const state = get();
        if (state.shift || state.stage !== HUMAN) return;
        get().beginShift(veilKindFor(HUMAN, MIND), { type: 'stage', to: MIND });
    },

    approachingEarth: false,
    // false, пока режиссёрская камера ведёт кадр: иначе OrbitControls
    // перехватывает мышь и сбивает наезд.
    freeLook: true,

    // ─── Переход между слоями ────────────────────────────────────────────────
    // shift живёт от начала заливки кадра до её полного схода. Смена stage
    // происходит ровно в середине, под непрозрачной вуалью.
    shift: null,
    setFreeLook: (freeLook) => set({ freeLook }),

    /**
     * Запускает накрытие кадра. commit описывает, что сделать в середине:
     * перейти на стадию или завершить пролёт к Земле.
     */
    beginShift: (kind, commit) => set((state) => {
        if (state.shift) return state;
        shiftSeq += 1;
        return { shift: { kind, commit, token: shiftSeq }, activeFactorId: null };
    }),

    /** Середина перехода: кадр залит, можно менять содержимое сцены. */
    commitShift: () => set((state) => {
        const commit = state.shift?.commit;
        if (!commit) return state;
        if (commit.type === 'earthArrive') return { approachingEarth: false };
        if (commit.type === 'location') {
            return { location: commit.id, activeFactorId: null, freeLook: false };
        }
        return enterStage(commit.to, state, commit.extra);
    }),

    endShift: () => set({ shift: null }),

    setStage: (stage) => set((state) => ({ ...enterStage(stage, state), shift: null })),

    nextStage: () => {
        const state = get();
        if (state.shift || state.stage >= MAX_STAGE || state.approachingEarth) return;
        const from = state.stage;
        const to = from + 1;

        // Космос → Земля: сначала живой пролёт сквозь систему, вуаль включится
        // в конце наезда, когда планета уже заполнила кадр.
        if (from === COSMOS) {
            set({
                stage: PLANET,
                isExploded: true,
                hasPlayedBang: true,
                activeFactorId: null,
                approachingEarth: true,
                freeLook: false,
            });
            return;
        }

        // Из диорамы слой меняется под вуалью: камера стоит у земли, и
        // доворот планеты здесь показать не на чем
        if (state.location) {
            get().beginShift(isEarthStage(to) ? 'ascend' : veilKindFor(from, to), { type: 'stage', to });
            return;
        }

        // Между слоями планеты сцена та же: глобус сам доворачивается
        if (isEarthStage(from) && isEarthStage(to)) {
            set((s) => ({ ...enterStage(to, s) }));
            return;
        }

        // Тело листается вглубь: кожа → мышцы → органы → кости → нервы
        if (from === HUMAN && state.bodyLayer < BODY_LAYER_COUNT - 1) {
            set({ bodyLayer: state.bodyLayer + 1, activeFactorId: null });
            return;
        }

        get().beginShift(veilKindFor(from, to), { type: 'stage', to });
    },

    prevStage: () => {
        const state = get();
        if (state.shift) return;
        const from = state.stage;
        if (from <= 0) return;
        const to = from - 1;

        if (state.approachingEarth) {
            set((s) => ({ ...enterStage(COSMOS, s) }));
            return;
        }

        // Шаг назад из локации — сначала обратно на карту своего слоя
        if (state.location) {
            get().leaveLocation();
            return;
        }

        if (isEarthStage(from) && isEarthStage(to)) {
            set((s) => ({ ...enterStage(to, s) }));
            return;
        }

        if (from === HUMAN && state.bodyLayer > 0) {
            set({ bodyLayer: state.bodyLayer - 1, activeFactorId: null });
            return;
        }

        // Из разума возвращаемся к нервам — туда, откуда в него вошли
        const extra = from === MIND ? { bodyLayer: BODY_LAYER_COUNT - 1 } : undefined;
        get().beginShift(veilKindFor(from, to), { type: 'stage', to, extra });
    },

    triggerBang: () => set((state) => {
        if (state.hasPlayedBang) {
            if (state.shift) return state;
            shiftSeq += 1;
            return {
                shift: { kind: 'bang', commit: { type: 'stage', to: COSMOS }, token: shiftSeq },
                activeFactorId: null,
            };
        }

        return { isExploded: true, hasPlayedBang: true, activeFactorId: null };
    }),

    resetJourney: () => set({
        stage: 0,
        isExploded: false,
        hasPlayedBang: false,
        activeFactorId: null,
        bodyLayer: 0,
        location: null,
        reversedFactors: {},
        discoveredScenarios: {},
        scenarioQueue: [],
        echoes: [],
        approachingEarth: false,
        freeLook: true,
        shift: null,
    }),

    /** Конец пролёта к Земле: подменяем космос на планету под вспышкой атмосферы. */
    finishEarthApproach: () => {
        const state = get();
        if (!state.approachingEarth || state.shift) return;
        get().beginShift('dive', { type: 'earthArrive' });
    },

    // Дополнительные данные, если понадобятся для камеры
    cameraTarget: [0, 0, 0],
    setCameraTarget: (target) => set({ cameraTarget: target })
}));

// ─── Сохранение прогресса ───────────────────────────────────────────────────
// Перевёрнутые факторы и открытые миры переживают перезагрузку: собранный
// мир — это то, к чему хочется вернуться. «Пройти путь снова» его сбрасывает.
const PROGRESS_KEY = 'reality:progress';

try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null');
    if (saved && typeof saved === 'object') {
        useStore.setState({
            reversedFactors: saved.reversedFactors ?? {},
            discoveredScenarios: saved.discoveredScenarios ?? {},
        });
    }
} catch {
    // Хранилище недоступно или испорчено — начинаем с чистого мира
}

let saveTimer = null;
useStore.subscribe((state, prev) => {
    if (state.reversedFactors === prev.reversedFactors && state.discoveredScenarios === prev.discoveredScenarios) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(PROGRESS_KEY, JSON.stringify({
                reversedFactors: state.reversedFactors,
                discoveredScenarios: state.discoveredScenarios,
            }));
        } catch {
            // Приватный режим: прогресс просто не сохранится
        }
    }, 300);
});

// В режиме разработки стор доступен из консоли — так можно прыгать по стадиям
// и проверять факторы без прохождения всего пути заново.
if (import.meta.env.DEV) {
    window.realityStore = useStore;
}
