/**
 * Тайминги и палитра переходов между слоями.
 * cover — сколько кадр заливается, hold — пауза на полной заливке (в ней
 * меняется содержимое сцены), reveal — сколько кадр открывается обратно.
 */
export const VEIL_PRESETS = {
    // Ударная волна: кадр выбеливает изнутри
    bang: {
        core: '#fff8e6', edge: '#ff9538', streaks: 0.95, grain: 0.03,
        cover: 0.85, hold: 0.22, reveal: 1.35,
        coverEase: 'power2.in', revealEase: 'power2.out',
    },
    // Вход в атмосферу: холодный дневной свет и полосы плазмы
    dive: {
        core: '#f2faff', edge: '#2f79c8', streaks: 0.85, grain: 0.025,
        cover: 0.8, hold: 0.2, reveal: 1.5,
        coverEase: 'power3.in', revealEase: 'power2.out',
    },
    // Проваливание в вещество: фиолетово-бирюзовый тоннель
    matter: {
        core: '#e2fdff', edge: '#5c23c4', streaks: 1.0, grain: 0.03,
        cover: 1.0, hold: 0.24, reveal: 1.55,
        coverEase: 'power3.in', revealEase: 'power2.out',
    },
    // Клетка → тело: тьма разрешается в тёплый свет
    flesh: {
        core: '#ffffff', edge: '#ff9aa8', streaks: 0.5, grain: 0.02,
        cover: 1.0, hold: 0.3, reveal: 1.7,
        coverEase: 'power2.inOut', revealEase: 'power2.out',
    },
    // Возврат наверх: кадр уходит в холодную дымку
    ascend: {
        core: '#e6f1ff', edge: '#0a1730', streaks: 0.45, grain: 0.02,
        cover: 0.75, hold: 0.18, reveal: 1.3,
        coverEase: 'power2.in', revealEase: 'power2.out',
    },
    // Схлопывание назад к предыдущему масштабу
    collapse: {
        core: '#ffffff', edge: '#0b0d12', streaks: 0.3, grain: 0.02,
        cover: 0.7, hold: 0.16, reveal: 1.2,
        coverEase: 'power2.in', revealEase: 'power2.out',
    },
};

export const veilPreset = (kind) => VEIL_PRESETS[kind] ?? VEIL_PRESETS.dive;
