import { STAGE } from '../lib/stages';

/**
 * Локации мезо-уровней.
 *
 * Глобус на природе и в обществе — это карта, а не сцена: с орбиты лес,
 * пустыня и мегаполис одинаково выглядят цветным пятном. Поэтому каждая точка
 * на карте раскрывается в собственную диораму со своим масштабом — десятки
 * километров местности, а не планета целиком.
 *
 * У каждой локации свой набор факторов. Процессы масштаба всей планеты —
 * тектоника, течения, круговорот воды, озон — живут на слое «Планета» (Planet.jsx).
 * Факторы не повторяются между
 * локациями: переворачивая их в разных местах, зритель собирает комбинации
 * (см. data/scenarios.js).
 *
 * shot — кадр камеры внутри диорамы, sky — палитра для фона сцены между
 * кадрами (совпадает с горизонтом неба, чтобы стык под вуалью был незаметен).
 */

export const NATURE_LOCATIONS = [
    {
        id: 'jungle',
        title: 'Джунгли',
        place: 'Амазония',
        lat: -4, lon: -62,
        accent: '#5fe07a',
        horizon: '#9fb8a0',
        factors: ['photosynthesis', 'tropicalRain', 'canopy', 'wildlife'],
        shot: { pos: [0, 26, 46], look: [0, 4, -8], fov: 48 },
    },
    {
        id: 'taiga',
        title: 'Тайга',
        place: 'Канадский бореальный лес',
        lat: 56, lon: -100,
        accent: '#8fd0b4',
        horizon: '#a9b8c4',
        factors: ['seasons', 'mycelium', 'migration', 'fireCycle'],
        shot: { pos: [2, 12, 34], look: [0, 3, 0], fov: 48 },
    },
    {
        id: 'desert',
        title: 'Пустыня',
        place: 'Сахара',
        lat: 23, lon: 8,
        accent: '#ffc46b',
        horizon: '#e9c79a',
        factors: ['dayNight', 'sandstorm', 'oasis', 'desertBloom'],
        shot: { pos: [0, 11, 34], look: [0, 2.5, 0], fov: 48 },
    },
    {
        id: 'arctic',
        title: 'Арктика',
        place: 'Льды Гренландии',
        lat: 74, lon: -40,
        accent: '#bfeaff',
        horizon: '#1a2a44',
        factors: ['glaciers', 'polarNight', 'permafrost', 'starField'],
        shot: { pos: [0, 9, 34], look: [0, 4, 0], fov: 52 },
    },
    {
        id: 'ocean',
        title: 'Океан',
        place: 'Атлантика и риф',
        lat: 14, lon: -40,
        accent: '#58c8ff',
        horizon: '#8fc2dc',
        factors: ['waves', 'ocean', 'coral', 'plankton'],
        shot: { pos: [0, 12, 32], look: [0, 0, 0], fov: 50 },
    },
    {
        id: 'mountains',
        title: 'Горы',
        place: 'Анды',
        lat: -28, lon: -70,
        accent: '#d9c1a0',
        horizon: '#aebfd4',
        factors: ['avalanche', 'volcano', 'snowcap', 'highlands'],
        shot: { pos: [0, 12, 40], look: [0, 6, 0], fov: 50 },
    },
];

export const CITY_LOCATIONS = [
    {
        id: 'tokyo',
        title: 'Токио',
        place: 'Неон, метро, храмы',
        lat: 35.68, lon: 139.69,
        accent: '#ff5fb4',
        horizon: '#1a1330',
        factors: ['progress', 'transit', 'aging', 'tradition'],
        shot: { pos: [12, 30, 54], look: [-4, 4, -16], fov: 48 },
    },
    {
        id: 'newyork',
        title: 'Нью-Йорк',
        place: 'Манхэттен',
        lat: 40.71, lon: -74.01,
        accent: '#ffbf5a',
        horizon: '#d98a5c',
        factors: ['skyline', 'trade', 'diversity', 'media'],
        shot: { pos: [38, 40, 76], look: [0, 8, -24], fov: 46 },
    },
    {
        id: 'dubai',
        title: 'Дубай',
        place: 'Город-витрина в пустыне',
        lat: 25.2, lon: 55.27,
        accent: '#ffd98a',
        horizon: '#e6c9a0',
        factors: ['energy', 'desalination', 'luxury', 'aircon'],
        shot: { pos: [26, 30, 68], look: [4, 10, -10], fov: 48 },
    },
    {
        id: 'mumbai',
        title: 'Мумбаи',
        place: 'Трущобы и Болливуд',
        lat: 19.08, lon: 72.88,
        accent: '#ff9d4a',
        horizon: '#c88a6a',
        factors: ['urbanization', 'medicine', 'cinema', 'inequality'],
        shot: { pos: [36, 34, 54], look: [6, 4, -14], fov: 48 },
    },
    {
        id: 'amsterdam',
        title: 'Амстердам',
        place: 'Каналы ниже уровня моря',
        lat: 52.37, lon: 4.9,
        accent: '#7fd8ff',
        horizon: '#b7c3cc',
        factors: ['cycling', 'dikes', 'education', 'law'],
        shot: { pos: [0, 30, 48], look: [0, 0, -4], fov: 48 },
    },
    {
        id: 'shenzhen',
        title: 'Шэньчжэнь',
        place: 'Фабрика мира',
        lat: 22.54, lon: 114.06,
        accent: '#9dff8a',
        horizon: '#8d8f86',
        factors: ['ecology', 'manufacturing', 'automation', 'connectivity'],
        shot: { pos: [42, 32, 58], look: [4, 6, -12], fov: 48 },
    },
    {
        id: 'cairo',
        title: 'Каир',
        place: 'Нил и пирамиды',
        lat: 30.04, lon: 31.24,
        accent: '#ffb870',
        horizon: '#e0a878',
        factors: ['culture', 'language', 'nile', 'heritage'],
        shot: { pos: [8, 18, 46], look: [0, 3, -6], fov: 48 },
    },
];

export const ALL_LOCATIONS = [...NATURE_LOCATIONS, ...CITY_LOCATIONS];

export const locationById = (id) => ALL_LOCATIONS.find((l) => l.id === id) ?? null;

/** Карта природы — точки природных локаций, карта общества — города, у слоя «Планета» точек нет. */
export const locationsForStage = (stage) => {
    if (stage === STAGE.SOCIETY) return CITY_LOCATIONS;
    if (stage === STAGE.NATURE) return NATURE_LOCATIONS;
    return [];
};

/** Какому слою принадлежит локация: природа или общество. */
export const stageOfLocation = (id) => (CITY_LOCATIONS.some((l) => l.id === id) ? STAGE.SOCIETY : STAGE.NATURE);

/** Факторы, которые живут не в локации, а на самой планете-карте. */
const PLANET_WIDE = {
    atmosphere: 'Планета', aurora: 'Планета', tectonics: 'Планета', currents: 'Планета',
    waterCycle: 'Планета', pressure: 'Планета', emissions: 'Планета', ozone: 'Планета',
    sunEnergy: 'Небо Земли', moonPhase: 'Небо Земли', war: 'Карта общества',
};

/** Где живёт фактор: «Джунгли · Амазония», «Планета» или null для других уровней. */
export function placeOfFactor(id) {
    const loc = ALL_LOCATIONS.find((l) => l.factors.includes(id));
    if (loc) return { title: loc.title, place: loc.place };
    return PLANET_WIDE[id] ? { title: PLANET_WIDE[id], place: null } : null;
}
