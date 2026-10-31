/**
 * Уровень текстур: решается один раз при запуске.
 *
 * Карты Земли на видеокарте лежат несжатыми — webp экономит загрузку, но не
 * видеопамять. Карта 2048×1024 занимает там около 11 МБ с мипами, пять карт —
 * почти полсотни мегабайт. Для школьной машины с интегрированной графикой это
 * много: браузер начинает выгружать и подгружать текстуры заново, и кадр
 * спотыкается. Половинный набор (public/textures/planets/lo) стоит вчетверо
 * меньше памяти.
 *
 * Выбор делается один раз и не меняется: Canvas пересоздаётся при падении
 * качества, и смена путей на ходу заставила бы грузить все карты второй раз —
 * ровно в тот момент, когда машине и так тяжело.
 */

const LIGHT = 'light';
const FULL = 'full';

function detect() {
    if (typeof window === 'undefined') return FULL;

    const forced = new URLSearchParams(window.location.search).get('textures');
    if (forced === 'light' || forced === 'low') return LIGHT;
    if (forced === 'full' || forced === 'high') return FULL;
    // ?quality=low — общий тумблер низкого качества (см. App.jsx)
    if (new URLSearchParams(window.location.search).get('quality') === 'low') return LIGHT;

    // deviceMemory и hardwareConcurrency есть не везде; где нет — не угадываем
    const memory = navigator.deviceMemory;
    if (typeof memory === 'number' && memory <= 4) return LIGHT;
    const cores = navigator.hardwareConcurrency;
    if (typeof cores === 'number' && cores <= 4) return LIGHT;

    // Телефон качает те же мегабайты по мобильной сети и рисует их на экране,
    // где полное разрешение всё равно не видно
    if (window.matchMedia('(pointer: coarse)').matches && Math.max(window.screen.width, window.screen.height) < 1100) return LIGHT;

    const net = navigator.connection;
    if (net && (net.saveData || /^(slow-)?2g$/.test(net.effectiveType || ''))) return LIGHT;

    return FULL;
}

export const TEXTURE_TIER = detect();
export const LIGHT_TEXTURES = TEXTURE_TIER === LIGHT;

const DIR = LIGHT_TEXTURES ? '/textures/planets/lo/' : '/textures/planets/';

/** Путь к карте по имени из scripts/textures.mjs. */
export const texturePath = (name) => `${DIR}${name}.webp`;

/** Анизотропия стоит выборок на пиксель — на слабой машине её не берём. */
export const TEXTURE_ANISOTROPY = LIGHT_TEXTURES ? 1 : 4;

export const EARTH_TEXTURE_PATHS = {
    day: texturePath('earth_day'),
    bump: texturePath('earth_normal'),
    water: texturePath('earth_water'),
    night: texturePath('earth_night'),
    clouds: texturePath('earth_clouds'),
};

export const MOON_TEXTURE = texturePath('moon');

if (import.meta.env.DEV) {
    console.info(`[textures] набор: ${TEXTURE_TIER}`);
}
