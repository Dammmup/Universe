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
export function nebulaSprite() {
    return cached('nebula', () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const rand = (min, max) => min + Math.random() * (max - min);

        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 90; i += 1) {
            const x = rand(size * 0.15, size * 0.85);
            const y = rand(size * 0.15, size * 0.85);
            const r = rand(size * 0.05, size * 0.3);
            const alpha = rand(0.03, 0.14);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(255,255,255,${alpha})`);
            g.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Гасим края, чтобы квадрат спрайта не был заметен
        ctx.globalCompositeOperation = 'destination-in';
        const mask = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        mask.addColorStop(0, 'rgba(255,255,255,1)');
        mask.addColorStop(0.55, 'rgba(255,255,255,0.7)');
        mask.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = mask;
        ctx.fillRect(0, 0, size, size);

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
