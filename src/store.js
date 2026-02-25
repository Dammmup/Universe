import { create } from 'zustand';

// Этапы (масштабы):
// 0: Сингулярность (Big Bang)
// 1: Космос (Макро-уровень)
// 2: Природа и Планета (Мезо-уровень 1)
// 3: Общество и Цивилизация (Мезо-уровень 2)
// 4: Человек и Сознание (Микро-уровень)

export const useStore = create((set) => ({
    stage: 0,
    isExploded: false, // Флаг для анимации большого взрыва

    // Состояние для интерактивных факторов
    activeFactorId: null,
    reversedFactors: {}, // { acceleration: true, gravity: false, ... }
    setActiveFactor: (id) => set({ activeFactorId: id }),
    toggleReverse: () => set((state) => ({
        reversedFactors: {
            ...state.reversedFactors,
            [state.activeFactorId]: !state.reversedFactors[state.activeFactorId]
        }
    })),
    isFactorReversed: (id) => false, // хелпер (не используется напрямую, читаем reversedFactors)
    clearFactor: () => set({ activeFactorId: null }),

    setStage: (stage) => set({ stage }),
    nextStage: () => set((state) => ({
        stage: Math.min(state.stage + 1, 4),
        isExploded: true,
        activeFactorId: null
    })),
    prevStage: () => set((state) => {
        const nextSt = Math.max(state.stage - 1, 0);
        return {
            stage: nextSt,
            isExploded: nextSt === 0 ? false : state.isExploded, // Фикс бага: обнуляем взрыв, если вернулись на Сингулярность
            activeFactorId: null
        };
    }),
    triggerBang: () => set({ isExploded: true }),

    // Дополнительные данные, если понадобятся для камеры
    cameraTarget: [0, 0, 0],
    setCameraTarget: (target) => set({ cameraTarget: target })
}));
