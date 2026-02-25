import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';

// ═══════════════════════════════════════════════════════════
// ПРОЦЕДУРНЫЕ ТЕКСТУРЫ
// ═══════════════════════════════════════════════════════════

function drawCrater(ctx, x, y, r, baseColor) {
    // Внешний бортик (светлый)
    const rim = ctx.createRadialGradient(x, y, r * 0.7, x, y, r * 1.1);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.5, baseColor + '66');
    rim.addColorStop(1, 'rgba(200,200,200,0.15)');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(x, y, r * 1.1, 0, Math.PI * 2); ctx.fill();

    // Впадина (тёмная)
    const pit = ctx.createRadialGradient(x + r * 0.15, y + r * 0.15, 0, x, y, r * 0.85);
    pit.addColorStop(0, 'rgba(0,0,0,0.65)');
    pit.addColorStop(0.5, 'rgba(0,0,0,0.3)');
    pit.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pit;
    ctx.beginPath(); ctx.arc(x, y, r * 0.85, 0, Math.PI * 2); ctx.fill();

    // Центральная горка
    if (r > 8) {
        ctx.fillStyle = 'rgba(200,200,200,0.18)';
        ctx.beginPath(); ctx.arc(x, y, r * 0.15, 0, Math.PI * 2); ctx.fill();
    }
}

function generateMercuryTexture() {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Базовый фон — тёмно-серый
    ctx.fillStyle = '#7a7a7a'; ctx.fillRect(0, 0, W, H);

    // Цветовые вариации — пятна разной яркости
    for (let i = 0; i < 300; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 10 + Math.random() * 40;
        const l = 80 + Math.floor(Math.random() * 50);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${l},${l},${l},0.4)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Кратеры — большие
    for (let i = 0; i < 8; i++) {
        drawCrater(ctx, Math.random() * W, Math.random() * H, 15 + Math.random() * 30, '#aaaaaa');
    }
    // Кратеры — средние
    for (let i = 0; i < 20; i++) {
        drawCrater(ctx, Math.random() * W, Math.random() * H, 6 + Math.random() * 14, '#999999');
    }
    // Кратеры — мелкие
    for (let i = 0; i < 60; i++) {
        drawCrater(ctx, Math.random() * W, Math.random() * H, 2 + Math.random() * 6, '#888888');
    }

    // Гладкие равнины (светлые)
    for (let i = 0; i < 5; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 40 + Math.random() * 60;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(175,170,165,0.3)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    return new THREE.CanvasTexture(c);
}

function generateEarthTexture() {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Океан
    ctx.fillStyle = '#1a4a8a'; ctx.fillRect(0, 0, W, H);

    // Подводные вариации
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const r = 15 + Math.random() * 50;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(30,100,180,0.3)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Материки — упрощённые blob-формы
    const continents = [
        // Сев. Америка
        { pts: [{ x: 0.06, y: 0.28 }, { x: 0.19, y: 0.22 }, { x: 0.24, y: 0.38 }, { x: 0.2, y: 0.52 }, { x: 0.14, y: 0.6 }, { x: 0.06, y: 0.52 }], col: '#2d7a3a' },
        // Юж. Америка
        { pts: [{ x: 0.22, y: 0.55 }, { x: 0.3, y: 0.5 }, { x: 0.33, y: 0.62 }, { x: 0.29, y: 0.78 }, { x: 0.22, y: 0.8 }, { x: 0.18, y: 0.68 }], col: '#3aaa4a' },
        // Европа + Африка
        { pts: [{ x: 0.44, y: 0.22 }, { x: 0.53, y: 0.2 }, { x: 0.55, y: 0.35 }, { x: 0.52, y: 0.55 }, { x: 0.54, y: 0.75 }, { x: 0.48, y: 0.82 }, { x: 0.43, y: 0.7 }, { x: 0.42, y: 0.5 }, { x: 0.43, y: 0.35 }], col: '#4aaa44' },
        // Азия
        { pts: [{ x: 0.56, y: 0.18 }, { x: 0.78, y: 0.15 }, { x: 0.88, y: 0.22 }, { x: 0.85, y: 0.38 }, { x: 0.78, y: 0.48 }, { x: 0.7, y: 0.5 }, { x: 0.62, y: 0.44 }, { x: 0.55, y: 0.36 }], col: '#3d9944' },
        // Австралия
        { pts: [{ x: 0.73, y: 0.6 }, { x: 0.82, y: 0.58 }, { x: 0.85, y: 0.68 }, { x: 0.8, y: 0.74 }, { x: 0.72, y: 0.73 }], col: '#c8a86a' },
        // Антарктида (частично)
        { pts: [{ x: 0.1, y: 0.93 }, { x: 0.5, y: 0.9 }, { x: 0.9, y: 0.93 }, { x: 0.9, y: 1.0 }, { x: 0.1, y: 1.0 }], col: '#dde8f0' },
    ];

    continents.forEach(({ pts, col }) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        pts.forEach((p, i) => {
            const px = p.x * W, py = p.y * H;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.closePath(); ctx.fill();
    });

    // Горы/рельеф (тёмные вариации на суше)
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * W, y = (0.15 + Math.random() * 0.75) * H, r = 3 + Math.random() * 12;
        ctx.fillStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.12})`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Полярные шапки (белые градиенты)
    const capN = ctx.createLinearGradient(0, 0, 0, H * 0.18);
    capN.addColorStop(0, 'rgba(230,245,255,0.95)');
    capN.addColorStop(1, 'rgba(200,230,250,0)');
    ctx.fillStyle = capN; ctx.fillRect(0, 0, W, H * 0.18);

    const capS = ctx.createLinearGradient(0, H * 0.88, 0, H);
    capS.addColorStop(0, 'rgba(200,230,250,0)');
    capS.addColorStop(1, 'rgba(230,245,255,0.95)');
    ctx.fillStyle = capS; ctx.fillRect(0, H * 0.88, W, H);

    return new THREE.CanvasTexture(c);
}

function generateEarthCloudsTexture() {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    // Облачные скопления
    for (let i = 0; i < 120; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const rx = 15 + Math.random() * 50, ry = 8 + Math.random() * 20;
        const a = Math.random() * Math.PI;
        const op = 0.3 + Math.random() * 0.55;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
        g.addColorStop(0, `rgba(255,255,255,${op})`);
        g.addColorStop(0.5, `rgba(255,255,255,${op * 0.5})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
        ctx.beginPath(); ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
    return new THREE.CanvasTexture(c);
}

function generateMarsTexture() {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Базовый цвет — ржаво-красный
    ctx.fillStyle = '#a84422'; ctx.fillRect(0, 0, W, H);

    // Вариации рельефа
    for (let i = 0; i < 250; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 8 + Math.random() * 45;
        const bright = Math.random() > 0.5;
        const col = bright ? 'rgba(200,120,70,0.25)' : 'rgba(80,20,10,0.25)';
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Кратеры — большие
    for (let i = 0; i < 6; i++) {
        drawCrater(ctx, Math.random() * W, (0.15 + Math.random() * 0.7) * H, 14 + Math.random() * 28, '#cc6644');
    }
    // Кратеры — средние
    for (let i = 0; i < 22; i++) {
        drawCrater(ctx, Math.random() * W, (0.1 + Math.random() * 0.8) * H, 5 + Math.random() * 13, '#bb5533');
    }
    // Мелкие
    for (let i = 0; i < 50; i++) {
        drawCrater(ctx, Math.random() * W, Math.random() * H, 2 + Math.random() * 5, '#aa4422');
    }

    // Долина Маринер — тёмная впадина
    ctx.fillStyle = 'rgba(60,15,5,0.35)';
    ctx.beginPath();
    ctx.ellipse(W * 0.5, H * 0.48, W * 0.22, H * 0.06, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Полярная шапка (северная — CO2 лёд)
    const capN = ctx.createLinearGradient(0, 0, 0, H * 0.14);
    capN.addColorStop(0, 'rgba(245,245,255,0.9)');
    capN.addColorStop(1, 'rgba(200,180,180,0)');
    ctx.fillStyle = capN; ctx.fillRect(0, 0, W, H * 0.14);

    // Южная шапка (меньше)
    const capS = ctx.createLinearGradient(0, H * 0.91, 0, H);
    capS.addColorStop(0, 'rgba(200,180,180,0)');
    capS.addColorStop(1, 'rgba(235,235,245,0.7)');
    ctx.fillStyle = capS; ctx.fillRect(0, H * 0.91, W, H);

    // Пылевые бури
    for (let i = 0; i < 3; i++) {
        const x = Math.random() * W, y = (0.3 + Math.random() * 0.4) * H;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 60);
        g.addColorStop(0, 'rgba(210,130,70,0.2)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 60, 0, Math.PI * 2); ctx.fill();
    }

    return new THREE.CanvasTexture(c);
}

// ─── Текстура Солнца с пятнами ────────────────────────────
function generateSunTexture() {
    const W = 512, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Основа — жёлто-оранжевый радиальный градиент
    const base = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
    base.addColorStop(0, '#ffffcc');
    base.addColorStop(0.3, '#ffee44');
    base.addColorStop(0.6, '#ffcc00');
    base.addColorStop(0.85, '#ff9900');
    base.addColorStop(1, '#ff6600');
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);

    // Конвекционные ячейки — светлые и тёмные пятна
    for (let i = 0; i < 80; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 12 + Math.random() * 45;
        const bright = Math.random() > 0.45;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        if (bright) {
            g.addColorStop(0, 'rgba(255,255,180,0.35)');
        } else {
            g.addColorStop(0, 'rgba(180,80,0,0.22)');
        }
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Солнечные пятна (умбра + пенумбра)
    const spotCount = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < spotCount; i++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = (0.15 + Math.random() * 0.35) * W * 0.5;
        const sx = W / 2 + Math.cos(ang) * dist, sy = H / 2 + Math.sin(ang) * dist;
        const sr = 12 + Math.random() * 22;
        // Пенумбра
        const pen = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 1.8);
        pen.addColorStop(0, 'rgba(100,40,0,0.75)');
        pen.addColorStop(0.5, 'rgba(140,60,0,0.4)');
        pen.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = pen; ctx.beginPath(); ctx.arc(sx, sy, sr * 1.8, 0, Math.PI * 2); ctx.fill();
        // Умбра (чёрный центр)
        const umb = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        umb.addColorStop(0, 'rgba(30,10,0,0.95)');
        umb.addColorStop(0.6, 'rgba(60,20,0,0.7)');
        umb.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = umb; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, Math.PI * 2); ctx.fill();
    }

    return new THREE.CanvasTexture(c);
}

// ─── Лучи короны Солнца ───────────────────────────────────
function SunCorona({ isReversed }) {
    const innerRef = useRef();
    const outerRef = useRef();

    const makeRays = (count, innerR, outerR) => {
        const pos = new Float32Array(count * 2 * 3);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const lenVar = 0.7 + Math.random() * 0.6;
            pos[i * 6 + 0] = Math.cos(angle) * innerR;
            pos[i * 6 + 1] = Math.sin(angle) * innerR;
            pos[i * 6 + 2] = 0;
            pos[i * 6 + 3] = Math.cos(angle) * (outerR * lenVar);
            pos[i * 6 + 4] = Math.sin(angle) * (outerR * lenVar);
            pos[i * 6 + 5] = 0;
        }
        return { pos, count: count * 2 };
    };

    const rays1 = useMemo(() => makeRays(28, 4.3, 9.5), []);
    const rays2 = useMemo(() => makeRays(18, 4.6, 13.0), []);

    useFrame((s) => {
        if (innerRef.current) innerRef.current.rotation.z = s.clock.elapsedTime * 0.12;
        if (outerRef.current) outerRef.current.rotation.z = -s.clock.elapsedTime * 0.07;

        // Пульсация прозрачности
        if (innerRef.current?.material) {
            innerRef.current.material.opacity = 0.45 + Math.sin(s.clock.elapsedTime * 2.1) * 0.15;
        }
        if (outerRef.current?.material) {
            outerRef.current.material.opacity = 0.25 + Math.sin(s.clock.elapsedTime * 1.4 + 1) * 0.1;
        }
    });

    const rayColor = isReversed ? '#ff5500' : '#ffdd66';

    return (
        <group>
            <lineSegments ref={innerRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={rays1.count} array={rays1.pos} itemSize={3} />
                </bufferGeometry>
                <lineBasicMaterial color={rayColor} transparent opacity={0.45} />
            </lineSegments>
            <lineSegments ref={outerRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={rays2.count} array={rays2.pos} itemSize={3} />
                </bufferGeometry>
                <lineBasicMaterial color={rayColor} transparent opacity={0.22} />
            </lineSegments>
        </group>
    );
}

function generateMoonTexture() {
    const W = 512, H = 256;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Базовый фон — средне-серый
    ctx.fillStyle = '#888888'; ctx.fillRect(0, 0, W, H);

    // Лунные «моря» (mare) — тёмные области
    const mares = [
        { x: 0.35, y: 0.38, r: 0.12 }, { x: 0.55, y: 0.3, r: 0.09 },
        { x: 0.25, y: 0.5, r: 0.08 }, { x: 0.6, y: 0.48, r: 0.1 },
        { x: 0.42, y: 0.58, r: 0.07 },
    ];
    mares.forEach(m => {
        const g = ctx.createRadialGradient(m.x * W, m.y * H, 0, m.x * W, m.y * H, m.r * W);
        g.addColorStop(0, 'rgba(60,60,65,0.8)');
        g.addColorStop(0.6, 'rgba(70,70,75,0.5)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(m.x * W, m.y * H, m.r * W, 0, Math.PI * 2); ctx.fill();
    });

    // Текстурные вариации
    for (let i = 0; i < 200; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = 5 + Math.random() * 25;
        const l = 100 + Math.floor(Math.random() * 60);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${l},${l},${l},0.2)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Кратеры — крупные
    for (let i = 0; i < 6; i++) drawCrater(ctx, Math.random() * W, Math.random() * H, 18 + Math.random() * 35, '#aaaaaa');
    // Средние
    for (let i = 0; i < 18; i++) drawCrater(ctx, Math.random() * W, Math.random() * H, 7 + Math.random() * 16, '#999999');
    // Мелкие
    for (let i = 0; i < 55; i++) drawCrater(ctx, Math.random() * W, Math.random() * H, 2 + Math.random() * 7, '#888888');

    return new THREE.CanvasTexture(c);
}

// ═══════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ КОМПОНЕНТЫ
// ═══════════════════════════════════════════════════════════

function createCircleTexture() {
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
}

// ─── Звёзды ───────────────────────────────────────────────────
function StarField() {
    const pointsRef = useRef();
    const tex = useMemo(() => createCircleTexture(), []);
    const [pos, col] = useMemo(() => {
        const count = 5000;
        const p = new Float32Array(count * 3), c = new Float32Array(count * 3);
        const col3 = new THREE.Color();
        for (let i = 0; i < count; i++) {
            const r = 130 + Math.random() * 200, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
            p[i * 3] = r * Math.sin(ph) * Math.cos(th);
            p[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
            p[i * 3 + 2] = r * Math.cos(ph);
            col3.setHSL(Math.random() < 0.6 ? 0.62 : 0.1, 0.25, 0.75 + Math.random() * 0.25);
            c[i * 3] = col3.r; c[i * 3 + 1] = col3.g; c[i * 3 + 2] = col3.b;
        }
        return [p, c];
    }, []);
    useFrame(s => { if (pointsRef.current) pointsRef.current.rotation.y = s.clock.elapsedTime * 0.003; });
    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" count={pos.length / 3} array={pos} itemSize={3} />
                <bufferAttribute attach="attributes-color" count={col.length / 3} array={col} itemSize={3} />
            </bufferGeometry>
            <pointsMaterial size={1.1} vertexColors transparent opacity={1} depthWrite={false}
                blending={THREE.AdditiveBlending} map={tex} alphaMap={tex} alphaTest={0.001} sizeAttenuation />
        </points>
    );
}

// ─── Орбитальное кольцо ────────────────────────────────────
function OrbitRing({ rx, rz, color = '#ffffff', opacity = 0.12 }) {
    const pts = useMemo(() => {
        const a = new Float32Array(129 * 3);
        for (let i = 0; i <= 128; i++) {
            const ang = (i / 128) * Math.PI * 2;
            a[i * 3] = Math.cos(ang) * rx; a[i * 3 + 1] = 0; a[i * 3 + 2] = Math.sin(ang) * rz;
        }
        return a;
    }, [rx, rz]);
    return (
        <line>
            <bufferGeometry><bufferAttribute attach="attributes-position" count={129} array={pts} itemSize={3} /></bufferGeometry>
            <lineBasicMaterial color={color} transparent opacity={opacity} />
        </line>
    );
}

// ─── Атмосферический ореол ─────────────────────────────────
function AtmoGlow({ radius, color, opacity = 0.18 }) {
    return (
        <mesh>
            <sphereGeometry args={[radius * 1.15, 32, 32]} />
            <meshBasicMaterial color={color} transparent opacity={opacity} side={THREE.BackSide} />
        </mesh>
    );
}

// ─── Луна ─────────────────────────────────────────────────
function Moon({ earthPosRef, reversedFactors, setActiveFactor }) {
    const meshRef = useRef();
    const groupRef = useRef();
    const angle = useRef(1.2);
    const tex = useMemo(() => generateMoonTexture(), []);
    const ORBIT = 5.5;

    const moonRev = !!reversedFactors['moonlight'];

    useFrame((_, delta) => {
        angle.current += delta * 1.0;
        if (groupRef.current && earthPosRef.current) {
            groupRef.current.position.set(
                earthPosRef.current.x + Math.cos(angle.current) * ORBIT,
                earthPosRef.current.y + Math.sin(angle.current * 0.4) * 0.6,
                earthPosRef.current.z + Math.sin(angle.current) * ORBIT
            );
        }
        if (meshRef.current) meshRef.current.rotation.y += delta * 0.08;
    });

    return (
        <group ref={groupRef}>
            {/* Тело Луны — кликабельно (отражение) */}
            <group
                onClick={(e) => { e.stopPropagation(); setActiveFactor('moonlight'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh ref={meshRef}>
                    <sphereGeometry args={[0.42, 48, 48]} />
                    <meshStandardMaterial map={tex} roughness={0.92} metalness={0}
                        emissive={moonRev ? '#222211' : '#111111'} emissiveIntensity={moonRev ? 0.1 : 0.03} />
                </mesh>

                {/* Лунное свечение при отражении */}
                {!moonRev && (
                    <mesh>
                        <sphereGeometry args={[0.55, 16, 16]} />
                        <meshBasicMaterial color="#ffffee" transparent opacity={0.04} />
                    </mesh>
                )}

                <Text font="/Roboto-Regular.ttf" position={[0, 0.8, 0]} fontSize={0.45} color={moonRev ? '#88aacc' : '#ffffaa'}
                    anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>
                    {moonRev ? 'ПОГЛОЩЕНИЕ' : 'ОТРАЖЕНИЕ'}
                </Text>
            </group>
        </group>
    );
}

// ─── Меркурий ─────────────────────────────────────────────
function Mercury({ reversedFactors, setActiveFactor }) {
    const meshRef = useRef();
    const groupRef = useRef();
    const angle = useRef(0.5);
    const tex = useMemo(() => generateMercuryTexture(), []);
    const RX = 13, RZ = 9;

    useFrame((_, delta) => {
        angle.current += delta * 0.55;
        if (groupRef.current) {
            groupRef.current.position.set(Math.cos(angle.current) * RX, 0, Math.sin(angle.current) * RZ);
        }
        if (meshRef.current) meshRef.current.rotation.y += delta * 0.05; // очень медленное вращение
    });

    const isRev = !!reversedFactors['heating'];

    return (
        <group ref={groupRef}>
            <group
                onClick={(e) => { e.stopPropagation(); setActiveFactor('heating'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh ref={meshRef}>
                    <sphereGeometry args={[0.82, 64, 64]} />
                    <meshStandardMaterial map={tex} roughness={0.75} metalness={0}
                        emissive={isRev ? '#332211' : '#554433'} emissiveIntensity={isRev ? 0.18 : 0.35} />
                </mesh>
                <Text font="/Roboto-Regular.ttf" position={[0, 1.4, 0]} fontSize={0.7} color="#cccccc"
                    anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>Меркурий</Text>
                <Text font="/Roboto-Regular.ttf" position={[0, 0.7, 0]} fontSize={0.55} color={isRev ? '#88aacc' : '#ffaa44'}
                    anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>
                    {isRev ? '▼ остывание' : '▶ нагревание'}
                </Text>
            </group>
        </group>
    );
}

// ─── Земля + Луна (система) ────────────────────────────────
function EarthSystem({ reversedFactors, setActiveFactor }) {
    const meshRef = useRef();
    const cloudRef = useRef();
    const groupRef = useRef();
    const gravityRingRef = useRef();
    const angle = useRef(2.1);
    const earthPos = useRef(new THREE.Vector3());

    const baseTex = useMemo(() => generateEarthTexture(), []);
    const cloudTex = useMemo(() => generateEarthCloudsTexture(), []);
    const RX = 22, RZ = 16;

    const isRev = !!reversedFactors['gravity'];
    const tidesRev = !!reversedFactors['tides'];

    useFrame((_, delta) => {
        angle.current += delta * 0.30;
        const x = Math.cos(angle.current) * RX;
        const z = Math.sin(angle.current) * RZ;
        if (groupRef.current) groupRef.current.position.set(x, 0, z);
        earthPos.current.set(x, 0, z);

        if (meshRef.current) meshRef.current.rotation.y += delta * 0.55;
        if (cloudRef.current) cloudRef.current.rotation.y += delta * 0.75; // облака быстрее

        // Анимация гравитации: wireframe-сфера сужается (гравитация) или расширяется (антигравитация)
        if (gravityRingRef.current) {
            const speed = isRev ? 1.0 : -1.0;
            gravityRingRef.current.scale.addScalar(delta * speed);
            const s = gravityRingRef.current.scale.x;
            if (!isRev && s < 1.0) gravityRingRef.current.scale.setScalar(2.5);
            if (isRev && s > 2.5) gravityRingRef.current.scale.setScalar(1.0);

            // Прозрачность затухает на краях
            if (gravityRingRef.current.material) {
                const alpha = isRev ? (2.5 - s) / 1.5 : (s - 1.0) / 1.5;
                gravityRingRef.current.material.opacity = Math.max(0, Math.min(0.2, alpha * 0.2));
            }
        }
    });

    return (
        <>
            {/* Земля */}
            <group ref={groupRef}>
                <group
                    onClick={(e) => { e.stopPropagation(); setActiveFactor('gravity'); }}
                    onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                    onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                >
                    {/* Океан / суша */}
                    <mesh ref={meshRef}>
                        <sphereGeometry args={[1.52, 64, 64]} />
                        <meshStandardMaterial map={baseTex} roughness={0.65} metalness={0.02}
                            emissive="#112255" emissiveIntensity={0.28} />
                    </mesh>

                    {/* Облачный слой */}
                    <mesh ref={cloudRef}>
                        <sphereGeometry args={[1.58, 48, 48]} />
                        <meshStandardMaterial map={cloudTex} transparent opacity={0.72}
                            roughness={1} metalness={0} depthWrite={false} />
                    </mesh>

                    {/* Атмосферный ореол */}
                    <AtmoGlow radius={1.52} color="#2255ff" opacity={0.14} />

                    {/* Анимация Гравитации */}
                    <mesh ref={gravityRingRef}>
                        <sphereGeometry args={[1.6, 24, 24]} />
                        <meshBasicMaterial color={isRev ? '#ff4422' : '#4488ff'} wireframe transparent opacity={0.2} />
                    </mesh>

                    <Text font="/Roboto-Regular.ttf" position={[0, 2.8, 0]} fontSize={0.9} color="#ffffff"
                        anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>Земля</Text>
                    <Text font="/Roboto-Regular.ttf" position={[0, 1.8, 0]} fontSize={0.6} color={isRev ? '#ff6644' : '#44aaff'}
                        anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>
                        {isRev ? '▼ АНТИГРАВИТАЦИЯ' : '▶ ГРАВИТАЦИЯ'}
                    </Text>
                </group>

                {/* Фактор ПРИЛИВЫ — кольцо вокруг Земли */}
                <group
                    position={[0, 0, 0]}
                    onClick={(e) => { e.stopPropagation(); setActiveFactor('tides'); }}
                    onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                    onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                >
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <ringGeometry args={[2.0, 2.2, 48]} />
                        <meshBasicMaterial color={tidesRev ? '#2266aa' : '#88ccff'} transparent opacity={0.3} side={THREE.DoubleSide} />
                    </mesh>
                    <Text font="/Roboto-Regular.ttf" position={[0, -2.4, 0]} fontSize={0.5} color={tidesRev ? '#88aacc' : '#aaddff'}
                        anchorX="center" anchorY="top" outlineColor="black" outlineWidth={0.04}>
                        {tidesRev ? 'ОТЛИВЫ ▼' : 'ПРИЛИВЫ ▶'}
                    </Text>
                </group>
            </group>

            {/* Луна — следует за Землёй */}
            <Moon earthPosRef={earthPos} reversedFactors={reversedFactors} setActiveFactor={setActiveFactor} />
        </>
    );
}

// ─── Марс ─────────────────────────────────────────────────
function Mars({ reversedFactors, setActiveFactor }) {
    const meshRef = useRef();
    const groupRef = useRef();
    const angle = useRef(4.2);
    const tex = useMemo(() => generateMarsTexture(), []);
    const RX = 33, RZ = 24;

    useFrame((_, delta) => {
        angle.current += delta * 0.22;
        if (groupRef.current) {
            groupRef.current.position.set(Math.cos(angle.current) * RX, 0, Math.sin(angle.current) * RZ);
        }
        if (meshRef.current) meshRef.current.rotation.y += delta * 0.48;
    });

    const isRev = !!reversedFactors['freezing'];

    return (
        <group ref={groupRef}>
            <group
                onClick={(e) => { e.stopPropagation(); setActiveFactor('freezing'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh ref={meshRef}>
                    <sphereGeometry args={[1.12, 64, 64]} />
                    <meshStandardMaterial map={tex} roughness={0.72} metalness={0}
                        emissive={isRev ? '#002244' : '#442211'} emissiveIntensity={isRev ? 0.2 : 0.32} />
                </mesh>

                {/* Тонкая пылевая атмосфера */}
                <AtmoGlow radius={1.12} color="#cc6633" opacity={0.08} />

                <Text font="/Roboto-Regular.ttf" position={[0, 1.7, 0]} fontSize={0.8} color="#ff8866"
                    anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>Марс</Text>
                <Text font="/Roboto-Regular.ttf" position={[0, 0.85, 0]} fontSize={0.58} color={isRev ? '#aaddff' : '#cc9988'}
                    anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.04}>
                    {isRev ? '▼ оттепель' : '▶ замерзание'}
                </Text>
            </group>
        </group>
    );
}

// ─── Солнце ───────────────────────────────────────────────
function Sun({ isReversed, setActiveFactor }) {
    const glowRef = useRef();
    const sunMesh = useRef();
    const sunTex = useMemo(() => generateSunTexture(), []);

    useFrame((s) => {
        if (glowRef.current) {
            const p = 1 + Math.sin(s.clock.elapsedTime * 1.3) * (isReversed ? 0.02 : 0.07);
            glowRef.current.scale.setScalar(p);
        }
        // Медленное вращение поверхности (пятна двигаются)
        if (sunMesh.current) {
            sunMesh.current.rotation.y += 0.0008;
            sunMesh.current.rotation.z += 0.0003;
        }
    });

    return (
        <group
            onClick={(e) => { e.stopPropagation(); setActiveFactor('sun'); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            {/* Ядро с текстурой пятен */}
            <mesh ref={sunMesh}>
                <sphereGeometry args={[4, 64, 64]} />
                <meshBasicMaterial map={sunTex} />
            </mesh>

            {/* Внутренняя корона */}
            <mesh ref={glowRef}>
                <sphereGeometry args={[5.2, 32, 32]} />
                <meshBasicMaterial color={isReversed ? '#661100' : '#ff9900'} transparent opacity={0.18} />
            </mesh>

            {/* Внешняя корона */}
            <mesh>
                <sphereGeometry args={[7.0, 32, 32]} />
                <meshBasicMaterial color={isReversed ? '#330800' : '#ff5500'} transparent opacity={0.07} />
            </mesh>

            {/* Большой ореол */}
            <mesh>
                <sphereGeometry args={[10, 24, 24]} />
                <meshBasicMaterial color={isReversed ? '#220500' : '#ff8800'} transparent opacity={0.025} />
            </mesh>

            {/* Лучи излучения */}
            <SunCorona isReversed={isReversed} />

            <Text font="/Roboto-Regular.ttf" position={[0, 7, 0]} fontSize={1.2} color={isReversed ? '#dd6633' : '#ffcc00'}
                anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.05}>
                {isReversed ? 'УГАСАНИЕ' : 'СОЛНЦЕ'}
            </Text>
            <pointLight intensity={isReversed ? 0.6 : 4.0} color={isReversed ? '#ff5500' : '#fff4cc'} distance={400} />
        </group>
    );
}

// ─── Комета ───────────────────────────────────────────────
function Comet({ isReversed, setActiveFactor }) {
    const groupRef = useRef();
    const angle = useRef(0);
    const tex = useMemo(() => createCircleTexture(), []);
    const tailCount = 200;
    const tailPos = useMemo(() => new Float32Array(tailCount * 3), []);
    const history = useMemo(() => { const h = []; for (let i = 0; i < tailCount; i++) h.push(new THREE.Vector3()); return h; }, []);
    const tailRef = useRef();

    useFrame((_, delta) => {
        const speed = isReversed ? 0.06 : 0.42;
        angle.current += delta * speed;
        const a = angle.current;
        const x = Math.cos(a) * 70, rawZ = Math.sin(a) * 45;
        const tilt = 0.35;
        const y = rawZ * Math.sin(tilt), z = rawZ * Math.cos(tilt);
        if (groupRef.current) groupRef.current.position.set(x, y, z);
        history.unshift(new THREE.Vector3(x, y, z));
        if (history.length > tailCount) history.pop();
        for (let i = 0; i < tailCount; i++) {
            if (i < history.length) { tailPos[i * 3] = history[i].x; tailPos[i * 3 + 1] = history[i].y; tailPos[i * 3 + 2] = history[i].z; }
        }
        if (tailRef.current) tailRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <>
            <points ref={tailRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={tailCount} array={tailPos} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial size={0.55} color={isReversed ? '#4466aa' : '#aaddff'}
                    transparent opacity={0.65} depthWrite={false} blending={THREE.AdditiveBlending}
                    sizeAttenuation map={tex} alphaMap={tex} alphaTest={0.001} />
            </points>
            <group ref={groupRef}
                onClick={(e) => { e.stopPropagation(); setActiveFactor('acceleration'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
                <mesh><sphereGeometry args={[0.7, 20, 20]} /><meshBasicMaterial color="#ffffff" /></mesh>
                <mesh><sphereGeometry args={[1.5, 16, 16]} /><meshBasicMaterial color={isReversed ? '#2244aa' : '#88ccff'} transparent opacity={0.2} /></mesh>
                <Text font="/Roboto-Regular.ttf" position={[0, 2.5, 0]} fontSize={1.1} color={isReversed ? '#aaddff' : '#ffffff'}
                    anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.05}>
                    {isReversed ? 'ЗАМЕДЛЕНИЕ' : 'УСКОРЕНИЕ'}
                </Text>
            </group>
        </>
    );
}

// ─── Плавающий фактор ─────────────────────────────────────
function FloatingFactor({ position, factorId, label, reverseLabel, color, reverseColor, isReversed, setActiveFactor, shape = 'octahedron' }) {
    const groupRef = useRef();
    const meshRef = useRef();
    useFrame((s, delta) => {
        if (!groupRef.current) return;
        groupRef.current.position.y = position[1] + Math.sin(s.clock.elapsedTime * 0.6 + position[0]) * 2;
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * 0.4;
            meshRef.current.rotation.y += delta * 0.6;
        }
    });
    const col = isReversed ? reverseColor : color;
    return (
        <group ref={groupRef} position={position}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}>
            <mesh><sphereGeometry args={[3.5, 16, 16]} /><meshBasicMaterial color={col} transparent opacity={0.04} /></mesh>
            <mesh ref={meshRef}>
                {shape === 'octahedron' && <octahedronGeometry args={[1.5, 0]} />}
                {shape === 'tetrahedron' && <tetrahedronGeometry args={[1.5, 0]} />}
                {shape === 'icosahedron' && <icosahedronGeometry args={[1.5, 0]} />}
                <meshBasicMaterial color={col} wireframe />
            </mesh>
            <Text font="/Roboto-Regular.ttf" position={[0, 3, 0]} fontSize={1.1} color={col}
                anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.05}>
                {isReversed ? reverseLabel : label}
            </Text>
            <Text font="/Roboto-Regular.ttf" position={[0, 1.8, 0]} fontSize={0.6} color="#ffffff" fillOpacity={0.4}
                anchorX="center" anchorY="bottom" outlineColor="black" outlineWidth={0.03}>▶ кликни</Text>
        </group>
    );
}

function Nebula({ position, color, size }) {
    return (
        <mesh position={position}>
            <sphereGeometry args={[size, 16, 16]} />
            <meshBasicMaterial color={color} transparent opacity={0.025} side={THREE.BackSide} />
        </mesh>
    );
}

// ═══════════════════════════════════════════════════════════
// ГЛАВНАЯ СЦЕНА
// ═══════════════════════════════════════════════════════════
export default function Cosmos() {
    const { reversedFactors, setActiveFactor } = useStore();

    return (
        <group>
            <StarField />
            <Nebula position={[-60, 20, -40]} color="#4422ff" size={35} />
            <Nebula position={[80, -15, 30]} color="#ff3300" size={28} />
            <Nebula position={[10, 40, -80]} color="#00aaff" size={40} />

            <ambientLight intensity={0.28} />

            <Sun isReversed={!!reversedFactors['sun']} setActiveFactor={setActiveFactor} />

            <OrbitRing rx={13} rz={9} color="#aaaaaa" opacity={0.15} />
            <OrbitRing rx={22} rz={16} color="#4488ff" opacity={0.13} />
            <OrbitRing rx={33} rz={24} color="#cc4422" opacity={0.13} />

            <Mercury reversedFactors={reversedFactors} setActiveFactor={setActiveFactor} />
            <EarthSystem reversedFactors={reversedFactors} setActiveFactor={setActiveFactor} />
            <Mars reversedFactors={reversedFactors} setActiveFactor={setActiveFactor} />
            <Comet isReversed={!!reversedFactors['acceleration']} setActiveFactor={setActiveFactor} />

            <FloatingFactor position={[-75, 12, -20]} factorId="void"
                label="ПУСТОТА" reverseLabel="ИЗБЫТОК"
                color="#6644ff" reverseColor="#ffaa00"
                isReversed={!!reversedFactors['void']} setActiveFactor={setActiveFactor} shape="octahedron" />

            <FloatingFactor position={[85, -8, 25]} factorId="infinity"
                label="БЕСКОНЕЧНОСТЬ" reverseLabel="ОГРАНИЧЕННОСТЬ"
                color="#00ccff" reverseColor="#ff4488"
                isReversed={!!reversedFactors['infinity']} setActiveFactor={setActiveFactor} shape="icosahedron" />



            <FloatingFactor position={[-30, 22, -55]} factorId="symbiosis"
                label="СИМБИОЗ" reverseLabel="ПАРАЗИТИЗМ"
                color="#33ff99" reverseColor="#88bb33"
                isReversed={!!reversedFactors['symbiosis']} setActiveFactor={setActiveFactor} shape="octahedron" />
        </group>
    );
}
