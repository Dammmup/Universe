import * as THREE from 'three';

const cache = new Map();

function cached(key, factory) {
    if (!cache.has(key)) cache.set(key, factory());
    return cache.get(key);
}

/** Мягкий круглый спрайт для частиц, звёзд и хвостов комет. */
export function circleSprite() {
    return cached('circle', () => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.35, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    });
}

/** Звезда с лучами — читается как настоящая звезда, а не как точка. */
export function starSprite() {
    return cached('star', () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const c = size / 2;

        const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
        halo.addColorStop(0, 'rgba(255,255,255,1)');
        halo.addColorStop(0.12, 'rgba(255,255,255,0.9)');
        halo.addColorStop(0.35, 'rgba(255,255,255,0.25)');
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, size, size);

        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 4; i += 1) {
            const angle = (i / 4) * Math.PI;
            const len = i % 2 === 0 ? c * 0.92 : c * 0.55;
            ctx.beginPath();
            ctx.moveTo(c - Math.cos(angle) * len, c - Math.sin(angle) * len);
            ctx.lineTo(c + Math.cos(angle) * len, c + Math.sin(angle) * len);
            ctx.stroke();
        }

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    });
}

/** Клубящееся облако газа для туманностей — дёшево заменяет полупрозрачные сферы. */
/**
 * Туманность. Прежде — девяносто размытых кругов: в кадре они сливались в
 * ровное цветное пятно с квадратными краями. Теперь яркость — шум с
 * искажением координат: волокна, сгустки и тёмные пылевые прожилки, а
 * край размыт неровно, по тому же шуму.
 */
export function nebulaSprite() {
    return cached('nebula', () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Решётка случайных значений для value-noise
        const G = 64;
        const grid = new Float32Array(G * G);
        let seed = 0x1e5;
        const rnd = () => {
            seed = (seed * 16807) % 2147483647;
            return seed / 2147483647;
        };
        for (let i = 0; i < grid.length; i += 1) grid[i] = rnd();
        const smooth = (t) => t * t * (3 - 2 * t);
        const noise = (x, y) => {
            const xi = Math.floor(x);
            const yi = Math.floor(y);
            const xf = smooth(x - xi);
            const yf = smooth(y - yi);
            const at = (i, j) => grid[(((j % G) + G) % G) * G + (((i % G) + G) % G)];
            const top = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * xf;
            const bottom = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * xf;
            return top + (bottom - top) * yf;
        };
        const fbm = (x, y) => {
            let f = 0;
            let a = 0.5;
            for (let o = 0; o < 5; o += 1) {
                f += a * noise(x, y);
                x *= 2.02;
                y *= 2.02;
                a *= 0.5;
            }
            return f;
        };

        const img = ctx.createImageData(size, size);
        for (let py = 0; py < size; py += 1) {
            for (let px = 0; px < size; px += 1) {
                const u = px / size - 0.5;
                const v = py / size - 0.5;
                const x = u * 6;
                const y = v * 6;
                // Искажение координат даёт волокна вместо пятен
                const wx = fbm(x + 3.1, y + 1.7) * 2.4;
                const wy = fbm(x - 2.3, y + 5.2) * 2.4;
                const n = fbm(x + wx, y + wy);
                const dust = fbm(x * 2.2 - wy, y * 2.2 + wx);
                const r = Math.sqrt(u * u + v * v) * 2;
                const edge = Math.max(0, 1 - r * (0.85 + n * 0.6));
                let lum = Math.pow(Math.max(0, n - 0.28) * 2.1, 1.6) * edge * edge;
                lum *= 1 - Math.max(0, dust - 0.55) * 1.8;
                lum = Math.min(1, Math.max(0, lum));
                const k = (py * size + px) * 4;
                // Яркие сгустки белеют: свет ионизированного газа горячее края
                const core = Math.min(1, lum * 1.4);
                img.data[k] = 255;
                img.data[k + 1] = 200 + core * 55;
                img.data[k + 2] = 210 + core * 45;
                img.data[k + 3] = lum * 255;
            }
        }
        ctx.putImageData(img, 0, 0);

        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    });
}

/** Освобождает разделяемые текстуры (вызывается при полной выгрузке приложения). */
export function disposeSprites() {
    cache.forEach((tex) => tex.dispose());
    cache.clear();
}
