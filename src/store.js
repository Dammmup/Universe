import { create } from 'zustand';

// Этапы (масштабы):
// 0: Сингулярность (Big Bang)
// 1: Космос (Макро-уровень)
// 2: Природа и Планета (Мезо-уровень 1)
// 3: Общество и Цивилизация (Мезо-уровень 2)
// 4: Человек и Сознание (Микро-уровень)
// 5: Тело, эмоции и личность (Антропо-уровень)

const MAX_STAGE = 5;

export const useStore = create((set) => ({
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

    approachingEarth: false,

    setStage: (stage) => set({
        stage,
        isExploded: stage > 0,
        activeFactorId: null,
        approachingEarth: false,
    }),
    nextStage: () => set((state) => {
        if (state.stage >= MAX_STAGE) return state;
        const goingToEarth = state.stage === 1;
        return {
            stage: state.stage + 1,
            isExploded: true,
            hasPlayedBang: true,
            activeFactorId: null,
            approachingEarth: goingToEarth,
        };
    }),
    prevStage: () => set((state) => {
        const nextSt = Math.max(state.stage - 1, 0);
        return {
            stage: nextSt,
            isExploded: nextSt > 0,
            activeFactorId: null,
            approachingEarth: false,
        };
    }),
    triggerBang: () => set((state) => {
        if (state.hasPlayedBang) {
            return { stage: 1, isExploded: true, activeFactorId: null };
        }

        return { isExploded: true, hasPlayedBang: true, activeFactorId: null };
    }),
    resetJourney: () => set({
        stage: 0,
        isExploded: false,
        hasPlayedBang: false,
        activeFactorId: null,
        reversedFactors: {},
        approachingEarth: false,
    }),
    finishEarthApproach: () => set({ approachingEarth: false }),

    // Дополнительные данные, если понадобятся для камеры
    cameraTarget: [0, 0, 0],
    setCameraTarget: (target) => set({ cameraTarget: target })
}));

// В режиме разработки стор доступен из консоли — так можно прыгать по стадиям
// и проверять факторы без прохождения всего пути заново.
if (import.meta.env.DEV) {
    window.realityStore = useStore;
}
