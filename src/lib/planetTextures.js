import * as THREE from 'three';
import { seededRandom } from './geo';

/**
 * Процедурные текстуры небесных тел. Все генераторы детерминированы (свой сид),
 * поэтому планеты выглядят одинаково между перезапусками, и кэшируются —
 * повторный вход в сцену не создаёт новые текстуры на видеокарте.
 */

const cache = new Map();

function canvasTexture(key, width, height, draw) {
    if (cache.has(key)) return cache.get(key);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    draw(canvas.getContext('2d'), width, height, seededRandom(hash(key)));

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    cache.set(key, tex);
    return tex;
}

function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function drawCrater(ctx, x, y, r, rimColor) {
    const rim = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 1.1);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.5, `${rimColor}66`);
    rim.addColorStop(1, 'rgba(200,200,200,0.15)');
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.1, 0, Math.PI * 2);
    ctx.fill();

    const pit = ctx.createRadialGradient(x + r * 0.15, y + r * 0.15, 0, x, y, r * 0.85);
    pit.addColorStop(0, 'rgba(0,0,0,0.62)');
    pit.addColorStop(0.5, 'rgba(0,0,0,0.28)');
    pit.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pit;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    ctx.fill();

    if (r > 8) {
        ctx.fillStyle = 'rgba(200,200,200,0.18)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.15, 0, Math.PI * 2);
        ctx.fill();
    }
}

/** Полосы газового гиганта: широтные пояса с турбулентными завихрениями. */
function drawGasBands(ctx, W, H, rand, palette, turbulence) {
    const bandCount = palette.length;
    for (let i = 0; i < bandCount; i += 1) {
        const y0 = (i / bandCount) * H;
        const y1 = ((i + 1) / bandCount) * H;
        ctx.fillStyle = palette[i];
        ctx.fillRect(0, y0, W, y1 - y0 + 1);
    }

    // Размываем границы поясов вытянутыми мазками — так работает зональный ветер
    for (let i = 0; i < turbulence; i += 1) {
        const y = rand() * H;
        const h = 2 + rand() * 14;
        const x = rand() * W;
        const w = 40 + rand() * 220;
        const bright = rand() > 0.5;
        ctx.fillStyle = bright ? `rgba(255,245,225,${0.05 + rand() * 0.1})`
            : `rgba(60,35,20,${0.05 + rand() * 0.1})`;
        ctx.beginPath();
        ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

export function mercuryTexture() {
    return canvasTexture('mercury', 512, 256, (ctx, W, H, rand) => {
        ctx.fillStyle = '#7a7a7a';
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < 260; i += 1) {
            const x = rand() * W;
            const y = rand() * H;
            const r = 10 + rand() * 40;
            const l = 80 + Math.floor(rand() * 50);
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, `rgba(${l},${l},${l},0.4)`);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 8; i += 1) drawCrater(ctx, rand() * W, rand() * H, 15 + rand() * 30, '#aaaaaa');
        for (let i = 0; i < 22; i += 1) drawCrater(ctx, rand() * W, rand() * H, 6 + rand() * 14, '#999999');
        for (let i = 0; i < 60; i += 1) drawCrater(ctx, rand() * W, rand() * H, 2 + rand() * 6, '#888888');
    });
}

export function venusTexture() {
    return canvasTexture('venus', 512, 256, (ctx, W, H, rand) => {
        ctx.fillStyle = '#d8b878';
        ctx.fillRect(0, 0, W, H);

        // Сернокислотные облака закручены в широтные вихри — планета скрыта целиком
        for (let i = 0; i < 400; i += 1) {
            const y = rand() * H;
            const x = rand() * W;
            const w = 30 + rand() * 150;
            const h = 4 + rand() * 22;
            const warm = rand() > 0.45;
            ctx.fillStyle = warm
                ? `rgba(255,232,180,${0.06 + rand() * 0.14})`
                : `rgba(168,120,58,${0.06 + rand() * 0.14})`;
            ctx.beginPath();
            ctx.ellipse(x, y, w, h, (rand() - 0.5) * 0.4, 0, Math.PI * 2);
            ctx.fill();
        }

        const pole = ctx.createLinearGradient(0, 0, 0, H * 0.12);
        pole.addColorStop(0, 'rgba(255,240,205,0.55)');
        pole.addColorStop(1, 'rgba(255,240,205,0)');
        ctx.fillStyle = pole;
        ctx.fillRect(0, 0, W, H * 0.12);
    });
}

export function marsTexture() {
    return canvasTexture('mars', 512, 256, (ctx, W, H, rand) => {
        ctx.fillStyle = '#a84422';
        ctx.fillRect(0, 0, W, H);

        for (let i = 0; i < 240; i += 1) {
            const x = rand() * W;
            const y = rand() * H;
            const r = 8 + rand() * 45;
            const col = rand() > 0.5 ? 'rgba(200,120,70,0.25)' : 'rgba(80,20,10,0.25)';
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, col);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        for (let i = 0; i < 6; i += 1) drawCrater(ctx, rand() * W, (0.15 + rand() * 0.7) * H, 14 + rand() * 28, '#cc6644');
        for (let i = 0; i < 22; i += 1) drawCrater(ctx, rand() * W, (0.1 + rand() * 0.8) * H, 5 + rand() * 13, '#bb5533');
        for (let i = 0; i < 50; i += 1) drawCrater(ctx, rand() * W, rand() * H, 2 + rand() * 5, '#aa4422');

        // Долина Маринер — крупнейший каньон Солнечной системы
        ctx.fillStyle = 'rgba(60,15,5,0.35)';
        ctx.beginPath();
        ctx.ellipse(W * 0.5, H * 0.48, W * 0.22, H * 0.055, -0.1, 0, Math.PI * 2);
        ctx.fill();

        // Гора Олимп
        const olympus = ctx.createRadialGradient(W * 0.28, H * 0.42, 0, W * 0.28, H * 0.42, 26);
        olympus.addColorStop(0, 'rgba(215,150,105,0.5)');
        olympus.addColorStop(0.7, 'rgba(150,70,40,0.3)');
        olympus.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = olympus;
        ctx.beginPath();
        ctx.arc(W * 0.28, H * 0.42, 26, 0, Math.PI * 2);
        ctx.fill();

        const capN = ctx.createLinearGradient(0, 0, 0, H * 0.14);
        capN.addColorStop(0, 'rgba(245,245,255,0.9)');
        capN.addColorStop(1, 'rgba(200,180,180,0)');
        ctx.fillStyle = capN;
        ctx.fillRect(0, 0, W, H * 0.14);

        const capS = ctx.createLinearGradient(0, H * 0.9, 0, H);
        capS.addColorStop(0, 'rgba(200,180,180,0)');
        capS.addColorStop(1, 'rgba(235,235,245,0.7)');
        ctx.fillStyle = capS;
        ctx.fillRect(0, H * 0.9, W, H);
    });
}

export function jupiterTexture() {
    return canvasTexture('jupiter', 1024, 512, (ctx, W, H, rand) => {
        drawGasBands(ctx, W, H, rand, [
            '#c9b294', '#e3d3b4', '#b98f63', '#e8dcc0', '#a9743f',
            '#d9c4a0', '#8d5c33', '#e5d8bd', '#bb8b57', '#dcc9a6',
            '#a97744', '#e0d2b2',
        ], 700);

        // Большое Красное Пятно — антициклон крупнее Земли
        const cx = W * 0.68;
        const cy = H * 0.62;
        const spot = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.075);
        spot.addColorStop(0, 'rgba(214,92,54,0.95)');
        spot.addColorStop(0.55, 'rgba(178,66,38,0.75)');
        spot.addColorStop(1, 'rgba(150,80,50,0)');
        ctx.fillStyle = spot;
        ctx.beginPath();
        ctx.ellipse(cx, cy, W * 0.075, H * 0.055, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(120,50,30,0.35)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy, W * 0.072, H * 0.052, 0, 0, Math.PI * 2);
        ctx.stroke();
    });
}

export function saturnTexture() {
    return canvasTexture('saturn', 1024, 512, (ctx, W, H, rand) => {
        drawGasBands(ctx, W, H, rand, [
            '#d8c69a', '#e8dcbb', '#cbb489', '#f0e6cb', '#d2bd93',
            '#e6d9b6', '#c2a97f', '#eee2c4', '#d6c294', '#e9dcba',
        ], 420);

        // Шестиугольный полярный вихрь
        const pole = ctx.createLinearGradient(0, 0, 0, H * 0.1);
        pole.addColorStop(0, 'rgba(150,170,190,0.5)');
        pole.addColorStop(1, 'rgba(150,170,190,0)');
        ctx.fillStyle = pole;
        ctx.fillRect(0, 0, W, H * 0.1);
    });
}

/**
 * Кольца Сатурна. RingGeometry получает планарные UV, поэтому текстура рисуется
 * как набор концентрических полос — деления Кассини и Максвелла на своих местах.
 */
export function saturnRingsTexture() {
    return canvasTexture('saturn-rings', 512, 512, (ctx, W, H, rand) => {
        const cx = W / 2;
        const cy = H / 2;
        ctx.clearRect(0, 0, W, H);

        const bands = [
            { from: 0.56, to: 0.66, alpha: 0.30, tint: '#c9b189' },
            { from: 0.66, to: 0.70, alpha: 0.08, tint: '#8d7d63' },
            { from: 0.70, to: 0.82, alpha: 0.72, tint: '#e6d6b4' },
            { from: 0.82, to: 0.845, alpha: 0.06, tint: '#6f6350' },
            { from: 0.845, to: 0.93, alpha: 0.55, tint: '#d8c8a6' },
            { from: 0.93, to: 0.985, alpha: 0.22, tint: '#bfae8c' },
        ];

        bands.forEach((band) => {
            const steps = 46;
            for (let i = 0; i < steps; i += 1) {
                const t = i / steps;
                const radius = (band.from + (band.to - band.from) * t) * (W / 2);
                const jitter = 0.82 + rand() * 0.36;
                ctx.strokeStyle = band.tint;
                ctx.globalAlpha = band.alpha * jitter;
                ctx.lineWidth = ((band.to - band.from) * (W / 2)) / steps + 0.9;
                ctx.beginPath();
                ctx.arc(cx, cy, radius, 0, Math.PI * 2);
                ctx.stroke();
            }
        });
        ctx.globalAlpha = 1;
    });
}

export function sunTexture() {
    return canvasTexture('sun', 512, 512, (ctx, W, H, rand) => {
        const base = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
        base.addColorStop(0, '#fffce0');
        base.addColorStop(0.35, '#ffe873');
        base.addColorStop(0.68, '#ffc21f');
        base.addColorStop(0.88, '#ff9000');
        base.addColorStop(1, '#ff5c00');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, W, H);

        // Гранулы конвекции
        for (let i = 0; i < 220; i += 1) {
            const x = rand() * W;
            const y = rand() * H;
            const r = 6 + rand() * 34;
            const g = ctx.createRadialGradient(x, y, 0, x, y, r);
            g.addColorStop(0, rand() > 0.45 ? 'rgba(255,255,200,0.3)' : 'rgba(190,85,0,0.2)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
        }

        // Пятна с умброй и пенумброй
        for (let i = 0; i < 7; i += 1) {
            const ang = rand() * Math.PI * 2;
            const dist = (0.12 + rand() * 0.34) * W * 0.5;
            const sx = W / 2 + Math.cos(ang) * dist;
            const sy = H / 2 + Math.sin(ang) * dist;
            const sr = 10 + rand() * 20;

            const pen = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 1.8);
            pen.addColorStop(0, 'rgba(110,45,0,0.7)');
            pen.addColorStop(0.5, 'rgba(145,62,0,0.4)');
            pen.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = pen;
            ctx.beginPath();
            ctx.arc(sx, sy, sr * 1.8, 0, Math.PI * 2);
            ctx.fill();

            const umb = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
            umb.addColorStop(0, 'rgba(34,12,0,0.95)');
            umb.addColorStop(0.6, 'rgba(66,24,0,0.7)');
            umb.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = umb;
            ctx.beginPath();
            ctx.arc(sx, sy, sr, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

export function disposePlanetTextures() {
    cache.forEach((tex) => tex.dispose());
    cache.clear();
}
