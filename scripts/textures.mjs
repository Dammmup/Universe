/**
 * Пережатие текстур планет: assets-src → public/textures/planets.
 *
 * Исходники (JPEG и PNG из дистрибутива three.js) лежат вне public и в сборку
 * не попадают. Отсюда выходят два набора webp: `hi` в исходном разрешении и
 * `lo` в половинном — какой набор грузить, решает lib/quality.js по машине.
 *
 * Половинный набор нужен не ради трафика, а ради видеопамяти: webp на видеокарте
 * всё равно разворачивается в несжатый RGBA, и карта 2048×1024 занимает там
 * около 11 МБ с мипами. Пять карт — почти полсотни мегабайт, которых у школьной
 * интегрированной видеокарты попросту нет. Половина стороны — четверть памяти.
 *
 * Каналы: шейдер (lib/shaders/earth.js) берёт из маски воды только `.r`, а
 * облака считает как `a * max(rgb)` — поэтому маска уходит в серый, а у облаков
 * альфа умножается на яркость заранее, и получается один серый канал вместо
 * четырёх. Карта цвета, рельефа и огней остаются цветными.
 *
 * Запуск: npm run textures
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const SRC = 'assets-src/textures/planets';
const OUT = 'public/textures/planets';

/** mode: color — как есть; gray — один канал; cloud — альфа вмешивается в яркость. */
const MAPS = [
    { src: 'earth_atmos_2048.jpg', name: 'earth_day', mode: 'color', quality: 80 },
    // Нормали к артефактам сжатия чувствительнее цвета: рябь на карте рельефа
    // читается как рябь на поверхности
    { src: 'earth_normal_2048.jpg', name: 'earth_normal', mode: 'color', quality: 88 },
    { src: 'earth_specular_2048.jpg', name: 'earth_water', mode: 'gray', quality: 78 },
    { src: 'earth_lights_2048.png', name: 'earth_night', mode: 'color', quality: 80 },
    { src: 'earth_clouds_1024.png', name: 'earth_clouds', mode: 'cloud', quality: 82 },
    { src: 'moon_1024.jpg', name: 'moon', mode: 'color', quality: 78 },
];

/** Облака: coverage = alpha × яркость. Считаем заранее — остаётся один канал. */
async function bakeClouds(input) {
    const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = Buffer.alloc(info.width * info.height);
    for (let i = 0, p = 0; i < out.length; i += 1, p += info.channels) {
        const bright = Math.max(data[p], data[p + 1], data[p + 2]);
        out[i] = Math.round((bright * data[p + 3]) / 255);
    }
    return sharp(out, { raw: { width: info.width, height: info.height, channels: 1 } });
}

async function source(map) {
    const file = `${SRC}/${map.src}`;
    if (map.mode === 'cloud') return bakeClouds(file);
    if (map.mode === 'gray') return sharp(file).toColourspace('b-w');
    return sharp(file);
}

mkdirSync(`${OUT}/lo`, { recursive: true });

const rows = [];
let before = 0;
let hi = 0;
let lo = 0;

for (const map of MAPS) {
    const { width, height } = await sharp(`${SRC}/${map.src}`).metadata();
    const origin = statSync(`${SRC}/${map.src}`).size;

    const full = await (await source(map)).webp({ quality: map.quality, effort: 6 }).toBuffer();
    const half = await (await source(map))
        .resize(Math.round(width / 2), Math.round(height / 2))
        .webp({ quality: map.quality, effort: 6 })
        .toBuffer();

    writeFileSync(`${OUT}/${map.name}.webp`, full);
    writeFileSync(`${OUT}/lo/${map.name}.webp`, half);

    before += origin;
    hi += full.length;
    lo += half.length;
    rows.push([`${map.name}.webp`, `${width}×${height}`, origin, full.length, half.length]);
}

const kb = (n) => `${(n / 1024).toFixed(0)} КБ`;
rows.forEach(([name, size, a, b, c]) => {
    console.log(name.padEnd(20), size.padEnd(11), kb(a).padStart(8), '→', kb(b).padStart(8), '| lo', kb(c).padStart(7));
});
console.log(''.padEnd(20, '─'));
console.log('итого'.padEnd(20), ''.padEnd(11), kb(before).padStart(8), '→', kb(hi).padStart(8), '| lo', kb(lo).padStart(7));

// Пути текстур живут в коде — пусть скрипт сам скажет, если они разъехались
const quality = readFileSync('src/lib/quality.js', 'utf8');
const missing = MAPS.filter((m) => !quality.includes(`texturePath('${m.name}')`)).map((m) => m.name);
if (missing.length) {
    console.error('\nНет в lib/quality.js:', missing.join(', '));
    process.exit(1);
}
