import { create } from 'zustand';

// Этапы (масштабы):
// 0: Сингулярность (Big Bang)
// 1: Космос (Макро-уровень)
// 2: Природа и Планета (Мезо-уровень 1)
// 3: Общество и Цивилизация (Мезо-уровень 2)
// 4: Человек и Сознание (Микро-уровень)
// 5: Тело, эмоции и личность (Антропо-уровень)
// 6: Итог пути (Финал)

const MAX_STAGE = 6;

/**
 * Какой вуалью накрыт переход между слоями. Смена сцены — это подмена всего
 * содержимого кадра: без накрытия она читается как склейка. Пары 2↔3 здесь нет
 * намеренно — там сцена одна и та же, планета доворачивается в кадре.
 */
const VEIL_KIND = {
    '0>1': 'bang',    // ударная волна взрыва выбеливает кадр
    '1>0': 'collapse',
    '1>2': 'dive',    // вход в атмосферу
    '2>1': 'ascend',
    '3>4': 'matter',  // проваливание в вещество
    '4>3': 'ascend',
    '4>5': 'flesh',   // из клетки в тело: тьма переходит в свет
    '5>4': 'collapse',
    '5>6': 'origin',  // тело растворяется, кадр возвращается в темноту начала
    '6>5': 'flesh',
};

export const veilKindFor = (from, to) => VEIL_KIND[`${from}>${to}`] ?? 'dive';

let shiftSeq = 0;

const enterStage = (stage, state) => ({
    stage,
    isExploded: stage > 0 || state.isExploded,
    hasPlayedBang: state.hasPlayedBang || stage > 0,
    activeFactorId: null,
    bodyRegion: null,
    approachingEarth: false,
    // На Земле сначала киношный кадр, облёт включается, когда камера доехала
    freeLook: stage !== 2 && stage !== 3,
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

        return {
            reversedFactors: {
                ...state.reversedFactors,
                [state.activeFactorId]: !state.reversedFactors[state.activeFactorId]
            }
        };
    }),
    isFactorReversed: (id) => Boolean(useStore.getState().reversedFactors[id]),
    clearFactor: () => set({ activeFactorId: null }),

    // Выбранная область тела на антропо-уровне. null — фигура целиком в кадре,
    // видны только названия областей; с выбором камера подъезжает к области и
    // раскрывает её факторы.
    bodyRegion: null,
    setBodyRegion: (id) => set((state) => (
        state.bodyRegion === id ? state : { bodyRegion: id, activeFactorId: null }
    )),

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
        return enterStage(commit.to, state);
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
        if (from === 1) {
            set({
                stage: 2,
                isExploded: true,
                hasPlayedBang: true,
                activeFactorId: null,
                approachingEarth: true,
                freeLook: false,
            });
            return;
        }

        // Природа → город: сцена та же, планета сама доворачивается к Азии
        if (from === 2) {
            set((s) => ({ ...enterStage(3, s) }));
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
            set((s) => ({ ...enterStage(1, s) }));
            return;
        }

        if (from === 3) {
            set((s) => ({ ...enterStage(2, s) }));
            return;
        }

        get().beginShift(veilKindFor(from, to), { type: 'stage', to });
    },

    triggerBang: () => set((state) => {
        if (state.hasPlayedBang) {
            if (state.shift) return state;
            shiftSeq += 1;
            return {
                shift: { kind: 'bang', commit: { type: 'stage', to: 1 }, token: shiftSeq },
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
        bodyRegion: null,
        reversedFactors: {},
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

// В режиме разработки стор доступен из консоли — так можно прыгать по стадиям
// и проверять факторы без прохождения всего пути заново.
if (import.meta.env.DEV) {
    window.realityStore = useStore;
}
