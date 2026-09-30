/**
 * Детерминированный шум для рельефа локаций. Value-noise с плавной
 * интерполяцией: его хватает на дюны, холмы и хребты, а собственная
 * реализация не тянет зависимость ради двадцати строк.
 */

function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const smooth = (t) => t * t * (3 - 2 * t);

export function noise2(x, y, seed = 1) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = hash2(xi, yi, seed);
    const b = hash2(xi + 1, yi, seed);
    const c = hash2(xi, yi + 1, seed);
    const d = hash2(xi + 1, yi + 1, seed);
    const u = smooth(xf);
    const v = smooth(yf);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Фрактальная сумма октав: крупные формы плюс мелкая шероховатость. */
export function fbm(x, y, octaves = 4, seed = 1) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
        sum += noise2(x * freq, y * freq, seed + i * 17) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.03;
    }
    return sum / norm;
}

/** Гребнистый шум: острые хребты вместо округлых холмов. */
export function ridged(x, y, octaves = 4, seed = 1) {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
        const n = 1 - Math.abs(noise2(x * freq, y * freq, seed + i * 31));
        sum += n * n * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2.1;
    }
    return sum / norm;
}
