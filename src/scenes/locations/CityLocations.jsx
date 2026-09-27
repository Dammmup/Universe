import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { fbm } from '../../lib/noise';
import {
    Atmosphere,
    FadeMesh,
    Flow,
    GlowLight,
    InstancedSet,
    Marker,
    Particles,
    Terrain,
    Tweened,
    Water,
    lerp,
    mergeParts,
    scatter,
    seededRandom,
    smoothstep,
    useBaseBox,
    useReversed,
    useVertexMaterial,
    useWindowMaterial,
} from './kit';

/**
 * Города мезо-уровня 2. Каждый отличается не цветом, а устройством:
 * Токио — плотная ночная сетка с неоном и эстакадой, Нью-Йорк — остров-скайлайн
 * между реками, Дубай — редкие сверхбашни в пустыне у моря, Мумбаи — башни над
 * трущобами, Амстердам — кольца каналов и узкие дома, Шэньчжэнь — порт и цеха,
 * Каир — плоские крыши вдоль Нила и пирамиды на горизонте.
 */

const LAND_Y = 0.3;
const damp = THREE.MathUtils.damp;

/** Высота городской земли из «знакового расстояния» до берега: > 0 — суша. */
const groundFrom = (sdf) => (x, z) => lerp(-1.8, LAND_Y, smoothstep(-0.5, 0.5, sdf(x, z)));

/**
 * Квартальная сетка: кварталы там, где accept разрешает, и улицы по их краям.
 * Возвращает кварталы, полосы асфальта и линии улиц для потоков машин.
 */
function buildGrid({ x: [x0, x1], z: [z0, z1], block = [6, 6], street = 1.4, accept }) {
    const blocks = [];
    const roads = [];
    const rows = new Map();
    const cols = new Map();
    for (let x = x0; x < x1; x += block[0] + street) {
        for (let z = z0; z < z1; z += block[1] + street) {
            const cx = x + block[0] / 2;
            const cz = z + block[1] / 2;
            if (!accept(cx, cz)) continue;
            blocks.push({ cx, cz, w: block[0], d: block[1] });
            const rz = z + block[1] + street / 2;
            const cxl = x + block[0] + street / 2;
            roads.push({ p: [cx, LAND_Y - 0.02, rz], s: [block[0] + street, 0.05, street], c: '#2b2d31' });
            roads.push({ p: [cxl, LAND_Y - 0.02, cz], s: [street, 0.05, block[1] + street], c: '#2b2d31' });
            const row = rows.get(rz) ?? [Infinity, -Infinity];
            rows.set(rz, [Math.min(row[0], x), Math.max(row[1], x + block[0] + street)]);
            const col = cols.get(cxl) ?? [Infinity, -Infinity];
            cols.set(cxl, [Math.min(col[0], z), Math.max(col[1], z + block[1] + street)]);
        }
    }
    const lanes = [];
    rows.forEach(([a, b], z) => { if (b - a > 10) lanes.push([[a, LAND_Y + 0.15, z], [b, LAND_Y + 0.15, z]]); });
    cols.forEach(([a, b], x) => { if (b - a > 10) lanes.push([[x, LAND_Y + 0.15, a], [x, LAND_Y + 0.15, b]]); });
    return { blocks, roads, lanes };
}

/** Делит квартал на участки и ставит на каждый здание. */
function fillBlocks(blocks, rand, { lots = [1, 3], gap = 0.5, height, color, extra }) {
    const out = [];
    blocks.forEach((b) => {
        const nx = lots[0] + Math.floor(rand() * (lots[1] - lots[0] + 1));
        const nz = lots[0] + Math.floor(rand() * (lots[1] - lots[0] + 1));
        const lw = b.w / nx;
        const ld = b.d / nz;
        for (let i = 0; i < nx; i += 1) {
            for (let j = 0; j < nz; j += 1) {
                const x = b.cx - b.w / 2 + lw * (i + 0.5);
                const z = b.cz - b.d / 2 + ld * (j + 0.5);
                const h = height(x, z, rand);
                if (h <= 0) continue;
                const item = {
                    p: [x, LAND_Y, z],
                    s: [lw - gap, h, ld - gap],
                    c: color(x, z, h, rand),
                    d: rand(),
                };
                if (extra) extra(item, rand);
                out.push(item);
            }
        }
    });
    return out;
}

/** Предметы, едущие по замкнутой кривой друг за другом: поезд, корабли, фелуки. */
function Movers({ points, closed = true, count = 6, spacing = 1.6, geometry, material, speed = 3, offset = 0, castShadow = true }) {
    const ref = useRef();
    const curve = useMemo(() => new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed), [points, closed]);
    const length = useMemo(() => curve.getLength(), [curve]);
    const st = useRef({ t: offset, v: speed });
    const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), tan: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) }), []);
    useFrame((_, delta) => {
        const mesh = ref.current;
        if (!mesh) return;
        const dt = Math.min(delta, 0.1);
        st.current.v = damp(st.current.v, speed, 0.8, dt);
        st.current.t += (st.current.v * dt) / length;
        for (let i = 0; i < count; i += 1) {
            const u = (((st.current.t - (i * spacing) / length) % 1) + 1) % 1;
            curve.getPointAt(u, tmp.p);
            curve.getTangentAt(u, tmp.tan);
            tmp.e.set(0, Math.atan2(-tmp.tan.z, tmp.tan.x), 0);
            tmp.q.setFromEuler(tmp.e);
            tmp.m.compose(tmp.p, tmp.q, tmp.s);
            mesh.setMatrixAt(i, tmp.m);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });
    return <instancedMesh ref={ref} args={[geometry, material, count]} castShadow={castShadow} frustumCulled={false} raycast={() => null} />;
}

/** Расходящиеся кольца сигнала — вышки связи и сирены. */
function PulseRings({ points, color = '#7fe0ff', on = true, size = 4 }) {
    const group = useRef();
    const level = useRef(on ? 1 : 0);
    useFrame((state, delta) => {
        const g = group.current;
        if (!g) return;
        level.current = damp(level.current, on ? 1 : 0, 1.2, Math.min(delta, 0.1));
        g.visible = level.current > 0.01;
        const t = state.clock.elapsedTime;
        g.children.forEach((ring, i) => {
            const phase = ((t * 0.6 + i * 0.37) % 1);
            ring.scale.setScalar(0.2 + phase * size);
            ring.material.opacity = (1 - phase) * 0.8 * level.current;
        });
    });
    return (
        <group ref={group}>
            {points.map((p, i) => (
                <mesh key={i} position={p} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                    <ringGeometry args={[0.9, 1, 32]} />
                    <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
                </mesh>
            ))}
        </group>
    );
}

/** Светящиеся вывески и экраны. palette — разные цвета, mono — все одинаковые (пропаганда). */
function Screens({ items, on = true, mono = null, cycle = 0.15 }) {
    const ref = useRef();
    const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1), []);
    const st = useRef({ level: on ? 1 : 0, mono: mono ? 1 : 0 });
    const colors = useMemo(() => items.map((it) => new THREE.Color(it.c)), [items]);
    const monoColor = useMemo(() => new THREE.Color(mono ?? '#ff2020'), [mono]);
    const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(), c: new THREE.Color(), hsl: {} }), []);

    useFrame((state, delta) => {
        const mesh = ref.current;
        if (!mesh) return;
        const dt = Math.min(delta, 0.1);
        const k = st.current;
        k.level = damp(k.level, on ? 1 : 0, 1.2, dt);
        k.mono = damp(k.mono, mono ? 1 : 0, 1.2, dt);
        const t = state.clock.elapsedTime;
        items.forEach((it, i) => {
            tmp.e.set(0, it.r ?? 0, 0);
            tmp.q.setFromEuler(tmp.e);
            tmp.p.set(...it.p);
            tmp.s.set(it.s[0], it.s[1], 1);
            tmp.m.compose(tmp.p, tmp.q, tmp.s);
            mesh.setMatrixAt(i, tmp.m);
            colors[i].getHSL(tmp.hsl);
            const hue = (tmp.hsl.h + t * cycle * (i % 3 === 0 ? 1 : 0)) % 1;
            tmp.c.setHSL(hue, tmp.hsl.s, tmp.hsl.l);
            const pulse = 0.75 + 0.25 * Math.sin(t * 3 + i * 1.7);
            const monoPulse = 0.7 + 0.3 * Math.sin(t * 4);
            tmp.c.lerp(monoColor, k.mono).multiplyScalar(k.level * lerp(pulse, monoPulse, k.mono) * 1.6);
            mesh.setColorAt(i, tmp.c);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });

    return (
        <instancedMesh ref={ref} args={[geometry, undefined, items.length]} frustumCulled={false} raycast={() => null}>
            <meshBasicMaterial toneMapped={false} side={THREE.DoubleSide} />
        </instancedMesh>
    );
}

function useCityGround(sdf) {
    return useMemo(() => groundFrom(sdf), [sdf]);
}

// ═══════════════════════════════════════════════════════════════════════════
// ТОКИО — ночь, неон, эстакада, храм между башнями
// ═══════════════════════════════════════════════════════════════════════════

const tokyoSdf = (x, z) => 17 - z + Math.sin(x * 0.12) * 2;
const TEMPLE = [-20, 0, 6];
const LOOP = [[-30, 4.4, 12], [10, 4.4, 12], [26, 4.4, 4], [26, 4.4, -26], [0, 4.4, -34], [-32, 4.4, -26], [-36, 4.4, 0]];

export function Tokyo() {
    const stagnant = useReversed('progress');
    const collapsed = useReversed('transit');
    const boom = useReversed('aging');
    const forgotten = useReversed('tradition');

    const box = useBaseBox();
    const height = useCityGround(tokyoSdf);
    const facade = useWindowMaterial({
        windowColor: stagnant ? '#c9b890' : '#dfeaff',
        lights: stagnant ? 0.3 : 1.1,
        lit: boom ? 0.85 : 0.42,
        flicker: stagnant ? 0.6 : 0,
    });
    const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 }), []);
    const vmat = useVertexMaterial({ roughness: 0.7 });
    const neonMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);

    const { buildings, roads, lanes, signs } = useMemo(() => {
        const rand = seededRandom(0x70c10);
        const grid = buildGrid({
            x: [-46, 44], z: [-60, 14], block: [5, 5], street: 1.3,
            accept: (x, z) => tokyoSdf(x, z) > 2 && Math.hypot(x - TEMPLE[0], z - TEMPLE[2]) > 7,
        });
        const buildings = fillBlocks(grid.blocks, rand, {
            lots: [1, 2],
            gap: 0.45,
            height: (x, z, r) => {
                const shinjuku = Math.exp(-(((x + 6) ** 2) + ((z + 26) ** 2)) / 260);
                return 2 + r() * 5 + shinjuku * (10 + r() * 16);
            },
            color: (x, z, h, r) => new THREE.Color().setHSL(0.6 + r() * 0.05, 0.08 + r() * 0.08, 0.28 + r() * 0.2),
            extra: (item, r) => {
                item.c2 = new THREE.Color().setHSL(0.25, 0.25, 0.22 + r() * 0.08);
            },
        });
        const palette = ['#ff3fa4', '#3fe8ff', '#ffe23f', '#ff6a3f', '#b36bff', '#5fff9a'];
        const signs = [];
        buildings.forEach((b) => {
            if (b.s[1] < 4 || rand() > 0.7) return;
            const h = Math.min(b.s[1] * 0.5, 3 + rand() * 3);
            signs.push({
                p: [b.p[0] + (rand() - 0.5) * b.s[0] * 0.6, LAND_Y + b.s[1] * 0.35 + rand() * b.s[1] * 0.3, b.p[2] + b.s[2] / 2 + 0.06],
                s: [0.28, h, 0.1],
                c: palette[Math.floor(rand() * palette.length)],
                d: rand(),
            });
        });
        return { buildings, roads: grid.roads, lanes: grid.lanes, signs };
    }, []);

    const trackGeo = useMemo(() => {
        const curve = new THREE.CatmullRomCurve3(LOOP.map((p) => new THREE.Vector3(...p)), true);
        return new THREE.TubeGeometry(curve, 220, 0.28, 6, true);
    }, []);
    const pillars = useMemo(() => {
        const curve = new THREE.CatmullRomCurve3(LOOP.map((p) => new THREE.Vector3(...p)), true);
        return Array.from({ length: 40 }, (_, i) => {
            const p = curve.getPointAt(i / 40);
            return { p: [p.x, LAND_Y, p.z], s: [0.35, 4.1, 0.35], c: '#6a6e78' };
        });
    }, []);
    const carGeo = useMemo(() => new THREE.BoxGeometry(1.5, 0.55, 0.6), []);
    const trainMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e8eef5', emissive: '#6fb8ff', emissiveIntensity: 0.6, roughness: 0.3 }), []);

    const pagoda = useMemo(() => {
        const parts = [];
        for (let i = 0; i < 5; i += 1) {
            const w = 2.6 - i * 0.38;
            const y = i * 1.25;
            parts.push({ geo: new THREE.BoxGeometry(w, 1, w), color: '#b8352a', pos: [0, y + 0.5, 0] });
            parts.push({ geo: new THREE.ConeGeometry(w * 0.95, 0.55, 4), color: '#2a2a33', pos: [0, y + 1.2, 0], rot: [0, Math.PI / 4, 0] });
        }
        parts.push({ geo: new THREE.CylinderGeometry(0.06, 0.1, 2.4, 6), color: '#c9a24a', pos: [0, 7.6, 0] });
        parts.push({ geo: new THREE.CylinderGeometry(0.16, 0.16, 3, 8), color: '#d23a2a', pos: [-1.6, 1.5, 5] });
        parts.push({ geo: new THREE.CylinderGeometry(0.16, 0.16, 3, 8), color: '#d23a2a', pos: [1.6, 1.5, 5] });
        parts.push({ geo: new THREE.BoxGeometry(4.6, 0.28, 0.4), color: '#d23a2a', pos: [0, 3.1, 5] });
        parts.push({ geo: new THREE.BoxGeometry(3.8, 0.2, 0.3), color: '#2a2a2a', pos: [0, 2.6, 5] });
        return mergeParts(parts);
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.3, z * 0.3, 2, 3);
        c.base.setHSL(0.62, 0.05, 0.1 + n * 0.02);
        if (Math.hypot(x - TEMPLE[0], z - TEMPLE[2]) < 7) c.base.setHSL(0.3, 0.35, 0.14 + n * 0.03);
        c.region.setHSL(0.6, 0.02, 0.32);
        return Math.hypot(x - TEMPLE[0], z - TEMPLE[2]) < 7 ? 1 : 0;
    };

    return (
        <group>
            <Atmosphere
                sky={{ top: '#04040c', horizon: stagnant ? '#1a1620' : '#3a1e48', bottom: '#050508', sunColor: '#6a78a0', sunDir: [0.5, 0.25, -0.8], sunSize: 0.6, stars: stagnant ? 0.5 : 0.12, haze: 0.8 }}
                fog={{ color: stagnant ? '#16141a' : '#241632', near: 30, far: 150 }}
                sun={{ position: [30, 30, -30], color: '#8a9ac8', intensity: 0.45 }}
                hemi={{ sky: '#5a4a8a', ground: '#1a1420', intensity: 0.5 }}
            />
            <Terrain height={height} paint={paint} blend2={forgotten ? 1 : 0} segments={120} />
            <Water level={-0.2} color="#0a0f22" amp={0.08} choppy={0.4} opacity={0.95} roughness={0.05} />

            <InstancedSet geometry={box} material={roadMat} items={roads} castShadow={false} />
            <InstancedSet geometry={box} material={facade} items={buildings} blend={stagnant ? 1 : 0} speed={0.5} />
            <InstancedSet geometry={box} material={neonMat} items={signs} hidden={stagnant} castShadow={false} receiveShadow={false} speed={1.2} />

            {/* Эстакада и поезд: встал — и улицы забиты машинами */}
            <mesh geometry={trackGeo} castShadow raycast={() => null}>
                <meshStandardMaterial color="#8a8e98" roughness={0.6} />
            </mesh>
            <InstancedSet geometry={box} material={roadMat} items={pillars} />
            <Movers points={LOOP.map(([x, y, z]) => [x, y + 0.55, z])} count={7} spacing={1.65} geometry={carGeo} material={trainMat} speed={collapsed ? 0 : 9} />
            <Flow paths={lanes} count={collapsed ? 700 : 380} speed={collapsed ? 0.004 : 0.09} color={collapsed ? '#ff3a2a' : '#fff2d0'} size={0.32} spread={0.35} seed={51} />
            <Particles mode="float" count={500} area={[80, 0.6, 70]} center={[-2, LAND_Y + 0.5, -22]} size={0.16} speed={0.4} color="#ffd9b0" amount={boom ? 1 : 0.25} opacity={0.9} seed={52} />

            <Tweened position={[TEMPLE[0], forgotten ? -9 : LAND_Y, TEMPLE[2]]} speed={0.35}>
                <mesh geometry={pagoda} material={vmat} castShadow receiveShadow raycast={() => null} />
            </Tweened>
            <Particles mode="float" count={40} area={[10, 2, 10]} center={[TEMPLE[0], 1.6, TEMPLE[2] + 2]} size={0.4} speed={0.3} color="#ffae4a" amount={forgotten ? 0 : 1} opacity={0.95} seed={53} />
            <GlowLight position={[TEMPLE[0], 3, TEMPLE[2] + 3]} color="#ff9a4a" intensity={30} distance={16} on={!forgotten} />
            <GlowLight position={[-6, 18, -26]} color="#ff3fa4" intensity={120} distance={60} on={!stagnant} />

            <Marker id="progress" position={[-6, 32, -26]} color="#8cd0ff" reverseColor="#b0a080" />
            <Marker id="transit" position={[18, 8, 2]} color="#6fb8ff" reverseColor="#ff5a3a" />
            <Marker id="aging" position={[12, 12, -34]} color="#c0c0d0" reverseColor="#ffd08a" />
            <Marker id="tradition" position={[TEMPLE[0], 12, TEMPLE[2]]} color="#ff7a5a" reverseColor="#8a8a9a" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// НЬЮ-ЙОРК — остров между реками, два кластера башен, золотой час
// ═══════════════════════════════════════════════════════════════════════════

const manhattanSdf = (x, z) => {
    const halfWidth = 13 + Math.sin(z * 0.05) * 1.5 - Math.max(0, z - 10) * 0.35;
    return Math.min(halfWidth - Math.abs(x + z * 0.12), 24 - z);
};
const boroughSdf = (x, z) => Math.max(manhattanSdf(x, z), Math.abs(x + z * 0.12) - 24);
const PARK = { x0: -6, x1: 6, z0: -60, z1: -44 };
const inPark = (x, z) => x + z * 0.12 > PARK.x0 && x + z * 0.12 < PARK.x1 && z > PARK.z0 && z < PARK.z1;

export function NewYork() {
    const ruined = useReversed('skyline');
    const isolated = useReversed('trade');
    const segregated = useReversed('diversity');
    const propaganda = useReversed('media');

    const box = useBaseBox();
    const height = useCityGround(boroughSdf);
    const facade = useWindowMaterial({ windowColor: '#ffd9a0', lights: ruined ? 0.1 : 0.9, lit: 0.5 });
    const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
    const shipGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(3.2, 0.6, 0.9), color: '#3a3a44', pos: [0, 0.3, 0] },
        { geo: new THREE.BoxGeometry(2.2, 0.5, 0.8), color: '#c0502a', pos: [-0.2, 0.85, 0] },
        { geo: new THREE.BoxGeometry(0.5, 0.8, 0.7), color: '#f0f0f0', pos: [1.2, 0.9, 0] },
    ]), []);
    const vmat = useVertexMaterial({ roughness: 0.6 });

    const { buildings, roads, lanes, screens } = useMemo(() => {
        const rand = seededRandom(0x4e77);
        const grid = buildGrid({
            x: [-40, 40], z: [-90, 22], block: [4, 7], street: 1.2,
            accept: (x, z) => boroughSdf(x, z) > 1.5 && !inPark(x, z),
        });
        const buildings = fillBlocks(grid.blocks, rand, {
            lots: [1, 2],
            gap: 0.35,
            height: (x, z, r) => {
                if (manhattanSdf(x, z) < 0) return 1.5 + r() * 3;
                const downtown = Math.exp(-((z - 10) ** 2) / 90);
                const midtown = Math.exp(-((z + 28) ** 2) / 140);
                return 2.5 + r() * 4 + downtown * (7 + r() * 14) + midtown * (9 + r() * 18);
            },
            color: (x, z, h, r) => (h > 14
                ? new THREE.Color().setHSL(0.58, 0.18, 0.35 + r() * 0.2)
                : new THREE.Color().setHSL(0.07 + r() * 0.03, 0.3, 0.3 + r() * 0.15)),
            extra: (item, r) => {
                if (item.s[1] > 12) {
                    item.s2 = [item.s[0] * 0.9, item.s[1] * (0.18 + r() * 0.25), item.s[2] * 0.9];
                    item.c2 = new THREE.Color().setHSL(0.08, 0.1, 0.18);
                    item.tilt2 = [(r() - 0.5) * 0.1, (r() - 0.5) * 0.1];
                }
            },
        });
        // Таймс-сквер: экраны на фасадах мидтауна
        const palette = ['#ff4fa8', '#4fd8ff', '#ffe04f', '#8a5cff', '#5fff9a', '#ff8a3f'];
        const screens = [];
        buildings.forEach((b) => {
            if (Math.abs(b.p[2] + 22) > 7 || Math.abs(b.p[0] + b.p[2] * 0.12) > 9 || rand() > 0.8) return;
            screens.push({
                p: [b.p[0], LAND_Y + 1.5 + rand() * 3, b.p[2] + b.s[2] / 2 + 0.05],
                s: [b.s[0] * 0.85, 1.2 + rand() * 1.5],
                c: palette[Math.floor(rand() * palette.length)],
            });
        });
        return { buildings, roads: grid.roads, lanes: grid.lanes, screens };
    }, []);

    const crowdA = segregated ? [-10, 0.6, -6] : [0, 0.6, -20];
    const crowdB = segregated ? [8, 0.6, -6] : [0, 0.6, -20];
    const crowdC = segregated ? [-8, 0.6, -40] : [0, 0.6, -20];
    const crowdD = segregated ? [8, 0.6, -40] : [0, 0.6, -20];
    const crowdScale = segregated ? [0.22, 1, 0.2] : [1, 1, 1];

    const harbor = useMemo(() => [[-34, 0.2, 30], [0, 0.2, 38], [34, 0.2, 30], [30, 0.2, 18], [-30, 0.2, 18]], []);
    const hudson = useMemo(() => [[-30, 0.2, 26], [-24, 0.2, -30], [-28, 0.2, -80], [-36, 0.2, -30], [-38, 0.2, 20]], []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.3, z * 0.3, 2, 5);
        c.base.setHSL(0.08, 0.08, 0.26 + n * 0.03);
        if (inPark(x, z)) c.base.setHSL(0.28, 0.45, 0.22 + n * 0.05);
        if (y < 0) c.base.setHSL(0.55, 0.2, 0.15);
        return 0;
    };

    return (
        <group>
            <Atmosphere
                sky={{ top: '#3a5a8a', horizon: '#e89868', bottom: '#2a2a38', sunColor: '#c87a40', sunDir: [-0.7, 0.14, -0.7], sunSize: 1.1, haze: 1.2 }}
                fog={{ color: '#d49070', near: 45, far: 190 }}
                sun={{ position: [-40, 16, -40], color: '#ffb070', intensity: 2.6 }}
                hemi={{ sky: '#8aa6d0', ground: '#3a2a22', intensity: 0.6 }}
            />
            <Terrain height={height} paint={paint} segments={140} />
            <Water level={0} color="#2a4a6a" amp={0.14} choppy={0.7} opacity={0.93} roughness={0.08} />

            <InstancedSet geometry={box} material={roadMat} items={roads} castShadow={false} />
            <InstancedSet geometry={box} material={facade} items={buildings} blend={ruined ? 1 : 0} speed={0.45} />
            <Screens items={screens} mono={propaganda ? '#ff2a2a' : null} />
            <Flow paths={lanes} count={420} speed={0.08} color="#ffd24a" size={0.3} spread={0.3} amount={ruined ? 0.2 : 1} seed={61} />

            <Movers points={harbor} count={4} spacing={14} geometry={shipGeo} material={vmat} speed={isolated ? 0 : 2.2} />
            <Movers points={hudson} count={3} spacing={22} geometry={shipGeo} material={vmat} speed={isolated ? 0 : 1.8} offset={0.4} />
            <Flow paths={[harbor, hudson]} count={120} speed={isolated ? 0 : 0.05} color="#9fe0ff" size={0.4} spread={0.6} amount={isolated ? 0.1 : 0.7} seed={62} />

            {/* Толпа: смешанные цвета — плавильный котёл; при сегрегации расходятся по углам */}
            {[['#ff8a6a', crowdA], ['#6ac8ff', crowdB], ['#ffe070', crowdC], ['#a07aff', crowdD]].map(([color, pos], i) => (
                <Tweened key={color} position={pos} scale={crowdScale} speed={0.6}>
                    <Particles mode="float" count={260} area={[22, 0.5, 90]} center={[0, 0, 0]} size={0.3} speed={0.5} color={color} opacity={0.95} seed={70 + i} />
                </Tweened>
            ))}
            <FadeMesh on={segregated} opacity={0.8} color="#ff4a3a" additive toneMapped={false} position={[-1, 0.9, -23]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[34, 0.25]} />
            </FadeMesh>
            <FadeMesh on={segregated} opacity={0.8} color="#ff4a3a" additive toneMapped={false} position={[-1, 0.9, -23]} rotation={[-Math.PI / 2, 0, Math.PI / 2 - 0.12]}>
                <planeGeometry args={[70, 0.25]} />
            </FadeMesh>

            <Marker id="skyline" position={[-4, 42, -28]} color="#cfe4ff" reverseColor="#8a8070" />
            <Marker id="trade" position={[22, 5, 26]} color="#ffcf55" reverseColor="#8a9aa8" />
            <Marker id="diversity" position={[-14, 6, -6]} color="#ffb0e0" reverseColor="#ff5a4a" />
            <Marker id="media" position={[8, 14, -20]} color="#9fe8ff" reverseColor="#ff3a3a" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ДУБАЙ — сверхбашни, остров-пальма, закат над пустыней
// ═══════════════════════════════════════════════════════════════════════════

const BURJ = [6, 0, -18];
const palmSdf = (x, z) => {
    const cx = -14;
    const cz = 30;
    const trunk = Math.min(1.4 - Math.abs(x - cx), Math.min(z - 12, cz - z + 2));
    let fronds = -Infinity;
    for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI * 0.95 + (i / 9) * Math.PI * 0.9;
        const dx = x - cx;
        const dz = z - cz;
        const along = dx * Math.cos(a) + dz * Math.sin(a);
        const across = -dx * Math.sin(a) + dz * Math.cos(a);
        fronds = Math.max(fronds, Math.min(0.9 - Math.abs(across), along, 9 - along));
    }
    const r = Math.hypot(x - cx, (z - cz) * 1.1);
    const crescent = Math.min(1 - Math.abs(r - 12), -(z - cz) + 6);
    return Math.max(trunk, fronds, crescent);
};
const dubaiSdf = (x, z) => Math.max(12 - z + Math.sin(x * 0.08) * 1.5, palmSdf(x, z));

export function Dubai() {
    const blackout = useReversed('energy');
    const thirst = useReversed('desalination');
    const equality = useReversed('luxury');
    const heat = useReversed('aircon');

    const box = useBaseBox();
    const height = useCityGround(dubaiSdf);
    const facade = useWindowMaterial({ windowColor: '#ffe2b0', lights: blackout ? 0 : 1.2, lit: heat ? 0.25 : 0.6, roughness: 0.25, metalness: 0.6 });
    const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
    const plantMat = useVertexMaterial({ roughness: 0.6 });

    const burjGeo = useMemo(() => {
        const parts = [];
        const tiers = [[3.4, 14], [2.8, 11], [2.2, 9], [1.6, 8], [1.1, 7], [0.7, 5]];
        let y = 0;
        tiers.forEach(([w, h]) => {
            parts.push({ geo: new THREE.CylinderGeometry(w * 0.55, w * 0.62, h, 6), color: '#c8d4e0', pos: [0, y + h / 2, 0] });
            y += h;
        });
        parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.3, 9, 6), color: '#dfe6ee', pos: [0, y + 4.5, 0] });
        return mergeParts(parts);
    }, []);
    const burjMat = useWindowMaterial({ windowColor: '#bfe0ff', lights: blackout ? 0 : 1.6, lit: 0.7, cell: [0.3, 0.5], roughness: 0.2, metalness: 0.7 });
    const plantGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(5, 2, 3), color: '#d8d8d0', pos: [0, 1, 0] },
        { geo: new THREE.CylinderGeometry(0.4, 0.5, 6, 8), color: '#e8e8e0', pos: [1.6, 3, 0.8] },
        { geo: new THREE.CylinderGeometry(0.4, 0.5, 6, 8), color: '#e8e8e0', pos: [0.4, 3, 0.8] },
        { geo: new THREE.CylinderGeometry(1.2, 1.2, 0.6, 16), color: '#8ab8d0', pos: [-3.5, 0.3, 0] },
    ]), []);

    const { towers, roads, lanes, villas } = useMemo(() => {
        const rand = seededRandom(0xd0ba1);
        const towers = [];
        for (let x = -44; x < 44; x += 3.4) {
            [-7, -2].forEach((z) => {
                if (Math.abs(x - BURJ[0]) < 6 && z < -1) return;
                if (rand() < 0.2) return;
                const h = 8 + rand() * 20 + (Math.abs(x) < 18 ? 8 : 0);
                const w = 1.6 + rand() * 1.1;
                towers.push({
                    p: [x + (rand() - 0.5), LAND_Y, z + (rand() - 0.5) * 1.5],
                    s: [w, h, w * (0.8 + rand() * 0.4)],
                    s2: [w * 1.6, 7 + rand() * 1.5, w * 1.6],
                    r: rand() < 0.3 ? 0.4 : 0,
                    c: new THREE.Color().setHSL(0.56 + rand() * 0.06, 0.25, 0.45 + rand() * 0.2),
                    c2: new THREE.Color().setHSL(0.09, 0.2, 0.6),
                    d: rand(),
                });
            });
        }
        const villas = scatter(rand, 160, [-26, 0], [14, 42], (x, z) => palmSdf(x, z) > 0.4).map(([x, z]) => ({
            p: [x, LAND_Y, z], s: [0.9, 0.6 + rand() * 0.5, 0.9], s2: [0.9, 0.9, 0.9], c: '#efe2c8', c2: '#d8ccb4', d: rand(),
        }));
        const roads = [
            { p: [0, LAND_Y - 0.02, -4.5], s: [100, 0.05, 2.4], c: '#2e2e32' },
            { p: [0, LAND_Y - 0.02, 4], s: [100, 0.05, 1.2], c: '#2e2e32' },
            { p: [-14, LAND_Y - 0.02, 15], s: [1, 0.05, 8], c: '#2e2e32' },
        ];
        const lanes = [
            [[-50, LAND_Y + 0.15, -5], [50, LAND_Y + 0.15, -5]],
            [[50, LAND_Y + 0.15, -4], [-50, LAND_Y + 0.15, -4]],
            [[-50, LAND_Y + 0.15, 4], [50, LAND_Y + 0.15, 4]],
        ];
        return { towers, roads, lanes, villas };
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.15, z * 0.15, 3, 7);
        c.base.setHSL(0.09, 0.45, 0.6 + n * 0.06);
        if (y < 0) c.base.setHSL(0.5, 0.35, 0.35);
        const lawn = (Math.hypot(x - BURJ[0], z - BURJ[2]) < 11 && y > 0) || (palmSdf(x, z) > 0 && y > 0);
        if (lawn) c.base.setHSL(0.27, 0.45, 0.3 + n * 0.04);
        c.region.setHSL(0.09, 0.4, 0.56 + n * 0.05);
        return lawn ? 1 : 0;
    };

    return (
        <group>
            <Atmosphere
                sky={{
                    top: heat ? '#a08a70' : '#35507a',
                    horizon: heat ? '#f0c890' : '#f2a878',
                    bottom: '#5a4a3a',
                    sunColor: heat ? '#fff0c0' : '#ff9a5a',
                    sunDir: [0.75, 0.12, -0.65],
                    sunSize: heat ? 3 : 2,
                    haze: heat ? 3 : 1.6,
                }}
                fog={{ color: heat ? '#e8c89a' : '#e0a888', near: heat ? 18 : 55, far: heat ? 110 : 210 }}
                sun={{ position: [48, 14, -40], color: heat ? '#fff0c8' : '#ffb080', intensity: heat ? 3.2 : 2.4 }}
                hemi={{ sky: '#a0b8e0', ground: '#8a6a4a', intensity: 0.7 }}
            />
            <Terrain height={height} paint={paint} blend2={thirst ? 1 : 0} segments={170} />
            <Water level={0} color="#1f7a8a" amp={0.1} choppy={0.5} opacity={0.9} roughness={0.06} />

            <InstancedSet geometry={box} material={roadMat} items={roads} castShadow={false} />
            <InstancedSet geometry={box} material={facade} items={towers} blend={equality ? 1 : 0} speed={0.45} />
            <InstancedSet geometry={box} material={facade} items={villas} blend={equality ? 1 : 0} />
            <Tweened position={BURJ} scale={equality ? [1.4, 0.16, 1.4] : [1, 1, 1]} speed={0.4}>
                <mesh geometry={burjGeo} material={burjMat} castShadow raycast={() => null} />
            </Tweened>
            <Flow paths={lanes} count={300} speed={heat ? 0.02 : 0.12} color="#ffe6b0" size={0.3} spread={0.3} amount={heat ? 0.2 : (blackout ? 0.4 : 1)} seed={81} />

            {/* Опреснительная станция и поющий фонтан у подножия башни */}
            <mesh geometry={plantGeo} material={plantMat} position={[26, LAND_Y, 9]} castShadow raycast={() => null} />
            <Particles mode="rise" count={120} area={[3, 10, 3]} center={[27, 10, 9.8]} size={2.6} speed={2} wind={-2} color="#f4f4f4" opacity={0.25} additive={false} amount={thirst ? 0 : 1} seed={82} />
            <Water level={thirst ? -1.6 : 0.42} position={[BURJ[0] + 7, 0, BURJ[2] + 4]} size={8} segments={20} color="#4ac0e0" amp={0.03} opacity={thirst ? 0 : 0.95} roughness={0.05} />
            <Particles mode="rise" count={300} area={[6, 6, 2]} center={[BURJ[0] + 7, 3.3, BURJ[2] + 4]} size={0.3} speed={5} color="#dff6ff" opacity={0.9} amount={thirst || blackout ? 0 : 1} seed={83} />

            <Particles mode="float" count={120} area={[110, 6, 70]} center={[0, 3, -10]} size={10} speed={0.6} color="#fff0d0" additive={false} opacity={0.08} amount={heat ? 1 : 0} seed={84} />

            <Marker id="energy" position={[-20, 24, -8]} color="#ffb870" reverseColor="#6a6a7a" />
            <Marker id="desalination" position={[26, 9, 9]} color="#6fe0ff" reverseColor="#d9a060" />
            <Marker id="luxury" position={[BURJ[0], equality ? 16 : 64, BURJ[2]]} color="#ffd98a" reverseColor="#9fe0c8" />
            <Marker id="aircon" position={[-6, 9, 5]} color="#bfe8ff" reverseColor="#ff9a4a" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// МУМБАИ — башни над трущобами, «Ожерелье королевы», прожекторы Болливуда
// ═══════════════════════════════════════════════════════════════════════════

const bayArc = (z) => -24 + Math.pow(Math.max(0, z + 10) / 30, 2) * 10;
const mumbaiSdf = (x, z) => x - bayArc(z);
const DHARAVI = { x0: 6, x1: 38, z0: -34, z1: 2 };
const inDharavi = (x, z) => x > DHARAVI.x0 && x < DHARAVI.x1 && z > DHARAVI.z0 && z < DHARAVI.z1;

export function Mumbai() {
    const decline = useReversed('urbanization');
    const epidemic = useReversed('medicine');
    const dark = useReversed('cinema');
    const solidarity = useReversed('inequality');

    const box = useBaseBox();
    const height = useCityGround(mumbaiSdf);
    const facade = useWindowMaterial({ windowColor: '#ffd08a', lights: 1, lit: decline ? 0.2 : 0.55 });
    const hutMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9 }), []);
    const roadMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
    const vmat = useVertexMaterial({ roughness: 0.5 });

    const { towers, huts, mids, roads, lanes, necklace } = useMemo(() => {
        const rand = seededRandom(0x3b0);
        const grid = buildGrid({
            x: [-30, 46], z: [-64, 18], block: [5, 5], street: 1.2,
            accept: (x, z) => mumbaiSdf(x, z) > 2 && !inDharavi(x, z),
        });
        const all = fillBlocks(grid.blocks, rand, {
            lots: [1, 3],
            gap: 0.4,
            height: (x, z, r) => {
                const parel = Math.exp(-(((x + 4) ** 2) + ((z + 26) ** 2)) / 120);
                return 1.8 + r() * 3 + parel * (14 + r() * 18);
            },
            color: (x, z, h, r) => (h > 12
                ? new THREE.Color().setHSL(0.55, 0.15, 0.55 + r() * 0.15)
                : new THREE.Color().setHSL(r(), 0.35, 0.55 + r() * 0.15)),
        });
        const towers = all.filter((b) => b.s[1] > 12).map((b) => ({ ...b, s2: [b.s[0] * 1.3, 8 + b.d * 2, b.s[2] * 1.3] }));
        const mids = all.filter((b) => b.s[1] <= 12).map((b) => ({ ...b, sprawl: mumbaiSdf(b.p[0], b.p[2]) > 22 || b.p[2] < -44 }));
        const hutColors = ['#3a7ad0', '#b85a3a', '#8a8a8a', '#c9a25a', '#5a9ad8', '#a04a4a', '#d8d0c0'];
        const huts = [];
        for (let x = DHARAVI.x0; x < DHARAVI.x1; x += 0.95) {
            for (let z = DHARAVI.z0; z < DHARAVI.z1; z += 0.95) {
                if (rand() < 0.12) continue;
                const w = 0.6 + rand() * 0.35;
                huts.push({
                    p: [x + (rand() - 0.5) * 0.3, LAND_Y, z + (rand() - 0.5) * 0.3],
                    s: [w, 0.5 + rand() * 0.9, w],
                    s2: [0.9, 1.6 + (Math.floor(x / 3) % 2) * 0.6, 0.9],
                    r: (rand() - 0.5) * 0.4,
                    c: hutColors[Math.floor(rand() * hutColors.length)],
                    c2: new THREE.Color().setHSL(0.08 + (Math.floor(z / 4) % 3) * 0.12, 0.35, 0.72),
                    d: rand(),
                });
            }
        }
        const necklace = [];
        for (let z = -10; z < 22; z += 0.5) necklace.push([bayArc(z) + 0.8, LAND_Y + 0.3, z]);
        return { towers, huts, mids, roads: grid.roads, lanes: grid.lanes, necklace };
    }, []);

    const beamRefs = useRef([]);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        beamRefs.current.forEach((b, i) => {
            if (!b) return;
            b.rotation.z = Math.sin(t * 0.5 + i * 2.1) * 0.5;
            b.rotation.x = Math.cos(t * 0.37 + i) * 0.3;
        });
    });

    const crossGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(4, 5, 4), color: '#f0f0f0', pos: [0, 2.5, 0] },
        { geo: new THREE.BoxGeometry(6, 3, 3), color: '#e8e8e8', pos: [0, 1.5, 0] },
    ]), []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.2, z * 0.2, 2, 11);
        c.base.setHSL(0.07, 0.25, 0.3 + n * 0.04);
        if (inDharavi(x, z)) c.base.setHSL(0.05, 0.3, 0.24);
        c.alt.setHSL(0.28, 0.45, 0.24 + n * 0.05);
        if (y < 0) {
            c.base.setHSL(0.55, 0.2, 0.15);
            c.alt.copy(c.base);
        }
        return 0;
    };

    return (
        <group>
            <Atmosphere
                sky={{ top: '#2a2a4a', horizon: epidemic ? '#9a8a6a' : '#e08a6a', bottom: '#2a2030', sunColor: '#ff8a5a', sunDir: [-0.9, 0.08, -0.4], sunSize: 2.2, haze: 1.8, stars: 0.1 }}
                fog={{ color: epidemic ? '#8a8060' : '#b88070', near: 40, far: 170 }}
                sun={{ position: [-50, 10, -20], color: '#ff9a6a', intensity: 1.6 }}
                hemi={{ sky: '#8a7ab0', ground: '#3a2a22', intensity: 0.65 }}
            />
            <Terrain height={height} paint={paint} blend={decline ? 1 : 0} segments={140} />
            <Water level={0} color="#2a4a5a" amp={0.2} choppy={0.8} opacity={0.93} roughness={0.08} />

            <InstancedSet geometry={box} material={roadMat} items={roads} castShadow={false} />
            <InstancedSet geometry={box} material={facade} items={towers} blend={solidarity ? 1 : 0} speed={0.45} />
            <InstancedSet geometry={box} material={facade} items={mids} hidden={decline} hideFilter={(b) => b.sprawl} />
            <InstancedSet geometry={box} material={hutMat} items={huts} blend={solidarity ? 1 : 0} hidden={decline} hideFilter={(h) => h.d > 0.45} speed={0.5} />
            <Flow paths={lanes} count={decline ? 120 : 460} speed={0.06} color="#ffcf8a" size={0.3} spread={0.3} seed={91} />
            {/* «Ожерелье королевы» — фонари набережной дугой вдоль залива */}
            <Flow paths={[necklace]} count={120} speed={0.005} color="#ffe7a0" size={0.45} spread={0} seed={92} />

            {/* Больница: зелёный крест, при эпидемии — красная тревога над трущобами */}
            <mesh geometry={crossGeo} material={vmat} position={[20, LAND_Y, 12]} castShadow raycast={() => null} />
            <mesh position={[20, 6.2, 12]} raycast={() => null}>
                <boxGeometry args={[0.6, 2, 0.2]} />
                <meshBasicMaterial color={epidemic ? '#ff2a2a' : '#3aff7a'} toneMapped={false} />
            </mesh>
            <mesh position={[20, 6.2, 12]} raycast={() => null}>
                <boxGeometry args={[2, 0.6, 0.2]} />
                <meshBasicMaterial color={epidemic ? '#ff2a2a' : '#3aff7a'} toneMapped={false} />
            </mesh>
            <Particles mode="float" count={90} area={[36, 3, 38]} center={[22, 3, -16]} size={5} speed={0.3} color="#c03a2a" opacity={0.18} amount={epidemic ? 1 : 0} seed={93} />
            <GlowLight position={[22, 8, -16]} color="#ff3a2a" intensity={80} distance={45} on={epidemic} flicker={0.6} />

            {/* Болливуд: прожекторы премьеры шарят по небу */}
            {[0, 1, 2].map((i) => (
                <group key={i} position={[-12 + i * 3, LAND_Y, 4]}>
                    <group ref={(el) => { beamRefs.current[i] = el; }}>
                        <FadeMesh on={!dark} opacity={0.12} color={['#ffe0a0', '#ff9ad0', '#9ad8ff'][i]} additive toneMapped={false} position={[0, 14, 0]}>
                            <coneGeometry args={[2.2, 28, 16, 1, true]} />
                        </FadeMesh>
                    </group>
                </group>
            ))}
            <Particles mode="float" count={70} area={[9, 1.5, 4]} center={[-9, 2, 4]} size={0.35} speed={2} color="#ffd060" opacity={1} amount={dark ? 0 : 1} seed={94} />

            <Marker id="urbanization" position={[24, 8, -44]} color="#aeaecf" reverseColor="#7dff9a" />
            <Marker id="medicine" position={[20, 10, 12]} color="#7dffb0" reverseColor="#ff4a3a" />
            <Marker id="cinema" position={[-9, 11, 4]} color="#ffd06a" reverseColor="#6a6a7a" />
            <Marker id="inequality" position={[-4, 36, -26]} color="#ff9a6a" reverseColor="#9dffd0" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// АМСТЕРДАМ — кольца каналов, узкие дома, дамба ниже уровня моря
// ═══════════════════════════════════════════════════════════════════════════

const AMS = { x: 0, z: 18 };
const CANAL_R = [10, 16, 22, 28];
const amsterdamSdf = (x, z) => {
    if (z > 21) return 21 - z;
    const r = Math.hypot(x - AMS.x, (z - AMS.z) * 1.15);
    let d = Infinity;
    CANAL_R.forEach((cr) => { d = Math.min(d, Math.abs(r - cr)); });
    const radial = Math.abs(x) < 1.1 && z < 8 ? 1.1 - Math.abs(x) : -Infinity;
    return Math.min(d - 1.1, radial > 0 ? -radial : Infinity);
};
const amsHeight = (x, z) => lerp(-1.4, 0.4, smoothstep(-0.4, 0.4, amsterdamSdf(x, z)));

export function Amsterdam() {
    const cars = useReversed('cycling');
    const flood = useReversed('dikes');
    const ignorance = useReversed('education');
    const lawless = useReversed('law');

    const houseGeo = useMemo(() => {
        const tri = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 0.55)]);
        const roof = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false }).translate(0, 1, -0.5);
        return mergeParts([
            { geo: new THREE.BoxGeometry(1, 1, 1), color: '#ffffff', pos: [0, 0.5, 0] },
            { geo: roof, color: '#5a4a44' },
        ]);
    }, []);
    const facade = useWindowMaterial({ windowColor: '#ffe0a8', lights: 0.8, lit: 0.45, cell: [0.3, 0.5] });
    const houseMat = useMemo(() => {
        const m = facade.clone();
        m.vertexColors = true;
        m.onBeforeCompile = facade.onBeforeCompile;
        m.customProgramCacheKey = () => 'facade-windows-vc';
        return m;
    }, [facade]);
    const uniMat = useWindowMaterial({ windowColor: '#ffd070', lights: ignorance ? 0.05 : 2.2, lit: ignorance ? 0.1 : 0.9, cell: [0.4, 0.6] });
    const vmat = useVertexMaterial({ roughness: 0.8 });

    const { houses, bikeLanes } = useMemo(() => {
        const rand = seededRandom(0xa35);
        const houses = [];
        const brick = ['#6a2e24', '#3a2a24', '#8a4a34', '#e8dcc8', '#2a3a3a', '#7a5a3a', '#4a2a2a'];
        [13, 19, 25, 31].forEach((r) => {
            [r - 0.95, r + 0.95].forEach((rr) => {
                if (rr < 8) return;
                const step = 1.15 / rr;
                for (let a = Math.PI * 1.02; a < Math.PI * 1.98; a += step) {
                    if (rand() < 0.06) continue;
                    const x = AMS.x + Math.cos(a) * rr;
                    const z = AMS.z + (Math.sin(a) * rr) / 1.15;
                    if (amsterdamSdf(x, z) < 0.6) continue;
                    const h = 2.4 + rand() * 1.8;
                    houses.push({ p: [x, 0.4, z], s: [1.05, h, 1.8], r: -a + Math.PI / 2, c: brick[Math.floor(rand() * brick.length)], d: rand() });
                }
            });
        });
        const bikeLanes = [11.6, 17.6, 23.6, 29.6].map((r) => Array.from({ length: 50 }, (_, i) => {
            const a = Math.PI * 1.02 + (i / 49) * Math.PI * 0.96;
            return [AMS.x + Math.cos(a) * r, 0.6, AMS.z + (Math.sin(a) * r) / 1.15];
        }));
        return { houses, bikeLanes };
    }, []);

    const universityGeo = useMemo(() => new THREE.BoxGeometry(8, 5, 5).translate(0, 2.5, 0), []);
    const courtGeo = useMemo(() => {
        const parts = [{ geo: new THREE.BoxGeometry(8, 1, 5), color: '#d8d0c0', pos: [0, 0.5, 0] }];
        for (let i = 0; i < 6; i += 1) parts.push({ geo: new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8), color: '#eee8dc', pos: [-3 + i * 1.2, 2.75, 2.2] });
        parts.push({ geo: new THREE.BoxGeometry(8.4, 0.6, 5.4), color: '#d8d0c0', pos: [0, 4.8, 0] });
        parts.push({ geo: new THREE.ConeGeometry(4.3, 1.6, 4), color: '#6a5a4a', pos: [0, 5.9, 0], rot: [0, Math.PI / 4, 0], scale: [1, 1, 0.65] });
        return mergeParts(parts);
    }, []);
    const millGeo = useMemo(() => mergeParts([
        { geo: new THREE.CylinderGeometry(0.8, 1.4, 5, 8), color: '#3a3a3a', pos: [0, 2.5, 0] },
        { geo: new THREE.ConeGeometry(1, 1.4, 8), color: '#2a2a2a', pos: [0, 5.7, 0] },
    ]), []);
    const bladesRef = useRef([]);
    useFrame((_, delta) => {
        bladesRef.current.forEach((b) => { if (b) b.rotation.z += delta * 0.8; });
    });

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.3, z * 0.3, 2, 13);
        c.base.setHSL(0.08, 0.12, 0.34 + n * 0.04);
        if (Math.hypot(x, z * 1.15) > 36) c.base.setHSL(0.26, 0.4, 0.3 + n * 0.05);
        if (y < 0) c.base.setHSL(0.5, 0.15, 0.2);
        return 0;
    };

    const lawPoints = [[-6, 1, -8], [8, 1, -2], [-18, 1, 4], [16, 1, -12], [0, 1, -18]];

    return (
        <group>
            <Atmosphere
                sky={{ top: '#6a7a8e', horizon: cars ? '#a8a090' : '#c8d0d6', bottom: '#4a5058', sunColor: '#fff0dc', sunDir: [0.3, 0.4, -0.8], haze: cars ? 1.8 : 1.2 }}
                fog={{ color: cars ? '#a09a8a' : '#bcc6cc', near: cars ? 24 : 40, far: cars ? 120 : 170 }}
                sun={{ position: [24, 36, -40], color: '#fff2e0', intensity: 1.9 }}
                hemi={{ sky: '#dfe8f0', ground: '#4a4a40', intensity: 0.9 }}
            />
            <Terrain height={amsHeight} paint={paint} segments={230} />
            <Water level={flood ? 1.6 : 0} color="#3a5a64" amp={flood ? 0.12 : 0.03} choppy={flood ? 0.6 : 0.2} opacity={0.9} roughness={0.08} speed={0.35} />

            <InstancedSet geometry={houseGeo} material={houseMat} items={houses} />
            <mesh geometry={universityGeo} material={uniMat} position={[-15, 0.4, -20]} castShadow receiveShadow raycast={() => null} />
            <mesh geometry={courtGeo} material={vmat} position={[15, 0.4, -24]} castShadow receiveShadow raycast={() => null} />
            <Particles mode="float" count={80} area={[12, 6, 8]} center={[-15, 7, -20]} size={0.35} speed={0.5} color="#ffd070" opacity={1} amount={ignorance ? 0 : 1} seed={101} />

            {/* Дамба на берегу IJ: прорыв — вода поднимается по фасадам */}
            <Tweened position={[0, flood ? -1.6 : 0, 0]} speed={0.4}>
                <mesh position={[0, 0.4, 21.6]} castShadow raycast={() => null}>
                    <boxGeometry args={[110, 1.8, 1.2]} />
                    <meshStandardMaterial color="#5a5a52" roughness={0.9} />
                </mesh>
            </Tweened>

            {[[-40, -30], [40, -24], [-44, 6]].map(([x, z], i) => (
                <group key={i} position={[x, 0.4, z]}>
                    <mesh geometry={millGeo} material={vmat} castShadow raycast={() => null} />
                    <group position={[0, 4.6, 1.3]} ref={(el) => { bladesRef.current[i] = el; }}>
                        {[0, 1, 2, 3].map((k) => (
                            <mesh key={k} rotation={[0, 0, (k * Math.PI) / 2]} position={[0, 0, 0]} raycast={() => null}>
                                <boxGeometry args={[0.5, 7, 0.05]} />
                                <meshStandardMaterial color="#e8e0d0" />
                            </mesh>
                        ))}
                    </group>
                </group>
            ))}

            <Flow paths={bikeLanes} count={cars ? 90 : 360} speed={cars ? 0.01 : 0.05} color={cars ? '#ff3a2a' : '#ffffff'} size={cars ? 0.55 : 0.22} spread={0.4} seed={102} />
            <Particles mode="float" count={50} area={[90, 6, 60]} center={[0, 4, -10]} size={12} speed={0.3} color="#8a8070" additive={false} opacity={0.1} amount={cars ? 1 : 0} seed={103} />

            {/* Произвол: пожары и мигалки на улицах */}
            {lawPoints.map((p, i) => (
                <Particles key={i} mode="rise" count={40} area={[1.2, 3, 1.2]} center={[p[0], 2, p[2]]} size={0.5} speed={2.5} color="#ff7a2a" amount={lawless ? 1 : 0} seed={110 + i} />
            ))}
            <PoliceLights on={lawless} />

            <Marker id="cycling" position={[4, 5, 6]} color="#9fe8ff" reverseColor="#ff6a4a" />
            <Marker id="dikes" position={[-22, 5, 21]} color="#7fd8ff" reverseColor="#3a8aff" />
            <Marker id="education" position={[-15, 11, -20]} color="#ffe38a" reverseColor="#7a7a8a" />
            <Marker id="law" position={[15, 12, -24]} color="#9ad7ff" reverseColor="#ff4a3a" />
        </group>
    );
}

function PoliceLights({ on }) {
    const red = useRef();
    const blue = useRef();
    const level = useRef(0);
    useFrame((state, delta) => {
        level.current = damp(level.current, on ? 1 : 0, 1.2, Math.min(delta, 0.1));
        const t = state.clock.elapsedTime * 6;
        const phase = Math.sin(t) > 0;
        if (red.current) red.current.intensity = phase ? 60 * level.current : 0;
        if (blue.current) blue.current.intensity = phase ? 0 : 60 * level.current;
    });
    return (
        <>
            <pointLight ref={red} position={[4, 2, -8]} color="#ff2020" distance={24} intensity={0} />
            <pointLight ref={blue} position={[-8, 2, -4]} color="#2040ff" distance={24} intensity={0} />
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ШЭНЬЧЖЭНЬ — порт, цеха, деловой центр, смог
// ═══════════════════════════════════════════════════════════════════════════

const shenzhenSdf = (x, z) => Math.min(20 - z, x < 8 ? 40 : 6 - z + (x - 8) * 0.05);
const STACKS = [[-32, 2], [-24, 8], [-16, -2], [-30, 12], [-10, 10]];
const CRANES = [12, 20, 28, 36];

export function Shenzhen() {
    const eco = useReversed('ecology');
    const deind = useReversed('manufacturing');
    const manual = useReversed('automation');
    const offline = useReversed('connectivity');

    const box = useBaseBox();
    const height = useCityGround(shenzhenSdf);
    const facade = useWindowMaterial({ windowColor: '#cfe6ff', lights: offline ? 0.3 : 1, lit: 0.55, roughness: 0.3, metalness: 0.5 });
    const factoryMat = useWindowMaterial({ windowColor: '#ffcf8a', lights: deind ? 0 : 1.2, lit: 0.8, cell: [0.8, 0.9] });
    const plain = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.8 }), []);
    const vmat = useVertexMaterial({ roughness: 0.6 });
    const stackGeo = useMemo(() => new THREE.CylinderGeometry(0.45, 0.7, 9, 10).translate(0, 4.5, 0), []);

    const { towers, factories, containers, panels, stacks, hubs, links } = useMemo(() => {
        const rand = seededRandom(0x5e2);
        const grid = buildGrid({ x: [-30, 34], z: [-62, -14], block: [5, 5], street: 1.4, accept: () => true });
        const towers = fillBlocks(grid.blocks, rand, {
            lots: [1, 2],
            gap: 0.6,
            height: (x, z, r) => 3 + r() * 7 + Math.exp(-((x - 4) ** 2 + (z + 38) ** 2) / 160) * (14 + r() * 18),
            color: (x, z, h, r) => new THREE.Color().setHSL(0.55, 0.15, 0.45 + r() * 0.2),
        });
        const factories = [];
        const panels = [];
        for (let x = -40; x < 0; x += 7) {
            for (let z = -10; z < 18; z += 6) {
                if (rand() < 0.15) continue;
                const w = 5 + rand();
                const d = 4 + rand();
                const h = 2 + rand() * 1.4;
                factories.push({
                    p: [x, LAND_Y, z], s: [w, h, d], c: new THREE.Color().setHSL(0.1, 0.05, 0.55 + rand() * 0.1),
                    c2: new THREE.Color().setHSL(0.05, 0.45, 0.3), d: rand(),
                });
                panels.push({ p: [x, LAND_Y + h + 0.05, z], s: [w * 0.85, 0.1, d * 0.85], c: '#1a3a7a', d: rand() });
            }
        }
        const palette = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#d35400', '#16a085'];
        const containers = [];
        for (let x = 10; x < 44; x += 1.4) {
            for (let z = 8; z < 17; z += 3.2) {
                const stack = 1 + Math.floor(rand() * 4);
                for (let k = 0; k < stack; k += 1) {
                    containers.push({ p: [x, LAND_Y + k * 0.62, z], s: [1.25, 0.6, 3], c: palette[Math.floor(rand() * palette.length)], d: rand() });
                }
            }
        }
        const stacks = STACKS.map(([x, z]) => ({ p: [x, LAND_Y, z], s: [1, 1, 1], c: '#8a8278' }));
        // Вышки связи на самых высоких башнях и дуги данных между ними
        const tall = towers.filter((t) => t.s[1] > 16).slice(0, 10);
        const hubs = tall.map((t) => [t.p[0], LAND_Y + t.s[1] + 0.4, t.p[2]]);
        const links = hubs.slice(0, 8).map((a, i, arr) => {
            const b = arr[(i + 1) % arr.length];
            return [a, [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 6, (a[2] + b[2]) / 2], b];
        });
        return { towers, factories, containers, panels, stacks, hubs, links };
    }, []);

    const craneGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(0.4, 9, 0.4), color: '#e0a020', pos: [-1.8, 4.5, 0] },
        { geo: new THREE.BoxGeometry(0.4, 9, 0.4), color: '#e0a020', pos: [1.8, 4.5, 0] },
        { geo: new THREE.BoxGeometry(4.4, 0.5, 0.6), color: '#e0a020', pos: [0, 9, 0] },
        { geo: new THREE.BoxGeometry(0.6, 0.5, 16), color: '#e0a020', pos: [0, 9.5, 5] },
    ]), []);
    const trolleyRefs = useRef([]);
    const craneState = useRef(manual ? 0 : 1);
    useFrame((state, delta) => {
        craneState.current = damp(craneState.current, manual || deind ? 0 : 1, 1, Math.min(delta, 0.1));
        const t = state.clock.elapsedTime;
        trolleyRefs.current.forEach((tr, i) => {
            if (!tr) return;
            const travel = Math.sin(t * 0.5 + i * 1.7) * 6 * craneState.current;
            tr.position.z = 5 + travel;
        });
    });

    const turbineRefs = useRef([]);
    useFrame((_, delta) => {
        turbineRefs.current.forEach((b) => { if (b) b.rotation.z += delta * 1.4; });
    });

    const smoky = !eco && !deind;
    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.2, z * 0.2, 2, 17);
        c.base.setHSL(0.12, 0.06, 0.3 + n * 0.04);
        if (z < -60) c.base.setHSL(0.28, 0.35, 0.22 + n * 0.05);
        c.alt.copy(c.base).lerp(new THREE.Color().setHSL(0.28, 0.4, 0.3), 0.55);
        if (y < 0) {
            c.base.setHSL(0.2, 0.15, 0.2);
            c.alt.setHSL(0.52, 0.3, 0.24);
        }
        return 0;
    };
    const hills = (x, z) => {
        const base = height(x, z);
        return base + smoothstep(-62, -80, z) * (10 + fbm(x * 0.05, z * 0.05, 3, 9) * 8);
    };

    return (
        <group>
            <Atmosphere
                sky={{ top: smoky ? '#8a8a7a' : '#3a7ac8', horizon: smoky ? '#b0a88a' : '#c8dcea', bottom: '#4a4a44', sunColor: smoky ? '#e8c890' : '#fff2d8', sunDir: [0.4, 0.5, -0.8], haze: smoky ? 2.4 : 1 }}
                fog={{ color: smoky ? '#a8a080' : '#c0d4e2', near: smoky ? 14 : 50, far: smoky ? 95 : 200 }}
                sun={{ position: [24, 40, -40], color: smoky ? '#e8d0a0' : '#fff2e0', intensity: smoky ? 1.5 : 2.7 }}
                hemi={{ sky: smoky ? '#b0a890' : '#cfe0ff', ground: '#3a3a30', intensity: 0.75 }}
            />
            <Terrain height={hills} paint={paint} blend={eco ? 1 : 0} segments={150} />
            <Water level={0} color={eco ? '#2a6a8a' : '#3a4a3a'} amp={0.1} choppy={0.5} opacity={0.93} roughness={0.1} />

            <InstancedSet geometry={box} material={facade} items={towers} />
            <InstancedSet geometry={box} material={factoryMat} items={factories} blend={deind ? 1 : 0} speed={0.5} />
            <InstancedSet geometry={box} material={plain} items={panels} hidden={!eco} castShadow={false} />
            <InstancedSet geometry={box} material={plain} items={containers} hidden={deind} hideFilter={(c) => c.d > 0.35} speed={0.6} />
            <InstancedSet geometry={stackGeo} material={plain} items={stacks} />
            {STACKS.map(([x, z], i) => (
                <Particles key={i} mode="rise" count={70} area={[2, 18, 2]} center={[x, 19, z]} size={4.5} speed={2.2} wind={4} color="#5a554a" additive={false} opacity={0.3} amount={smoky ? 1 : 0} seed={120 + i} />
            ))}

            {CRANES.map((x, i) => (
                <group key={x} position={[x, LAND_Y, 17.5]}>
                    <mesh geometry={craneGeo} material={vmat} castShadow raycast={() => null} />
                    <mesh ref={(el) => { trolleyRefs.current[i] = el; }} position={[0, 8.9, 5]} raycast={() => null}>
                        <boxGeometry args={[1, 0.7, 1.2]} />
                        <meshStandardMaterial color="#3a3a3a" />
                    </mesh>
                </group>
            ))}
            <Particles mode="float" count={60} area={[40, 8, 40]} center={[10, 16, -10]} size={0.35} speed={1.2} color="#ff4040" amount={manual || offline ? 0 : 1} opacity={1} seed={130} />
            <Particles mode="float" count={500} area={[40, 0.4, 16]} center={[-6, LAND_Y + 0.4, 6]} size={0.18} speed={0.6} color="#ffe0b0" amount={manual && !deind ? 1 : 0} opacity={0.9} seed={131} />

            {/* Ветряки на холмах появляются вместе с экобалансом */}
            {[[-30, -72], [-18, -70], [-6, -74], [8, -71], [22, -73]].map(([x, z], i) => (
                <Tweened key={i} position={[x, hills(x, z), z]} scale={eco ? [1, 1, 1] : [1, 0.001, 1]} speed={0.6}>
                    <mesh position={[0, 5, 0]} castShadow raycast={() => null}>
                        <cylinderGeometry args={[0.15, 0.3, 10, 8]} />
                        <meshStandardMaterial color="#f0f0f0" />
                    </mesh>
                    <group position={[0, 10, 0.4]} ref={(el) => { turbineRefs.current[i] = el; }}>
                        {[0, 1, 2].map((k) => (
                            <mesh key={k} rotation={[0, 0, (k * Math.PI * 2) / 3]} position={[0, 0, 0]} raycast={() => null}>
                                <boxGeometry args={[0.3, 8, 0.08]} />
                                <meshStandardMaterial color="#f4f4f4" />
                            </mesh>
                        ))}
                    </group>
                </Tweened>
            ))}

            <PulseRings points={hubs} on={!offline} color="#7fe0ff" size={5} />
            <Flow
                paths={links}
                count={200}
                speed={0.1}
                amount={offline ? 0 : 1}
                color="#9fefff"
                size={0.35}
                spread={0}
                seed={132}
            />

            <Marker id="ecology" position={[-24, 20, 4]} color="#ffb070" reverseColor="#8dffab" />
            <Marker id="manufacturing" position={[-14, 7, 14]} color="#ffcf8a" reverseColor="#b06a4a" />
            <Marker id="automation" position={[28, 13, 14]} color="#ff8a5a" reverseColor="#ffe0b0" />
            <Marker id="connectivity" position={[4, 40, -38]} color="#7fe0ff" reverseColor="#6a6a7a" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// КАИР — Нил, плоские крыши, минареты, пирамиды на горизонте
// ═══════════════════════════════════════════════════════════════════════════

const nileX = (z) => 6 + Math.sin(z * 0.05) * 6 - z * 0.12;
const cairoSdf = (x, z) => Math.abs(x - nileX(z)) - 3.2;
const PYRAMIDS = [[-40, -52, 14], [-30, -60, 12], [-24, -48, 7]];
const WORDS = ['слово', 'λόγος', 'word', 'verbum', 'palabra', 'Wort', 'mot', 'parola', 'слава', 'logos', 'kalima', 'смысл'];

function FloatingWords({ scrambled }) {
    const refs = useRef([]);
    const [items] = React.useState(() => WORDS.map((w, i) => ({
        text: w,
        pos: [-22 + (i % 6) * 9, 12 + Math.floor(i / 6) * 4 + (i % 2), -10 - Math.floor(i / 6) * 10],
        phase: i * 1.3,
    })));
    const tick = useRef(0);
    useFrame((state, delta) => {
        tick.current += delta;
        const t = state.clock.elapsedTime;
        refs.current.forEach((txt, i) => {
            if (!txt) return;
            txt.position.y = Math.sin(t * 0.6 + items[i].phase) * 0.6;
            if (scrambled && tick.current > 0.12) {
                txt.text = Array.from(items[i].text, () => String.fromCharCode(0x0410 + Math.floor(Math.random() * 60))).join('');
                txt.sync();
            }
            txt.fillOpacity = scrambled ? 0.35 + Math.random() * 0.2 : 0.85;
            txt.color = scrambled ? '#ff6a5a' : '#ffe6b0';
        });
        if (tick.current > 0.12) tick.current = 0;
        if (!scrambled) {
            refs.current.forEach((txt, i) => {
                if (txt && txt.text !== items[i].text) {
                    txt.text = items[i].text;
                    txt.sync();
                }
            });
        }
    });
    return (
        <group>
            {items.map((it, i) => (
                <Billboard key={it.text} position={it.pos}>
                    <Text
                        ref={(el) => { refs.current[i] = el; }}
                        font="/Roboto-Regular.ttf"
                        fontSize={0.9}
                        color="#ffe6b0"
                        anchorX="center"
                        anchorY="middle"
                        outlineColor="#3a1a0a"
                        outlineWidth={0.02}
                        raycast={() => null}
                    >
                        {it.text}
                    </Text>
                </Billboard>
            ))}
        </group>
    );
}

export function Cairo() {
    const barbarism = useReversed('culture');
    const noise = useReversed('language');
    const dried = useReversed('nile');
    const buried = useReversed('heritage');

    const box = useBaseBox();
    const facade = useWindowMaterial({ windowColor: '#ffcf8a', lights: barbarism ? 0.2 : 1, lit: 0.45, cell: [0.4, 0.5] });
    const vmat = useVertexMaterial({ roughness: 0.85 });
    const stone = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8b07a', roughness: 0.95, flatShading: true }), []);

    const height = (x, z) => {
        const bank = lerp(-1.6, LAND_Y, smoothstep(-0.5, 0.6, cairoSdf(x, z)));
        const plateau = smoothstep(-26, -36, x) * smoothstep(-30, -44, z) * 3.5;
        return bank + plateau;
    };

    const minaretGeo = useMemo(() => mergeParts([
        { geo: new THREE.CylinderGeometry(0.22, 0.3, 7, 8), color: '#e8dcc4', pos: [0, 3.5, 0] },
        { geo: new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10), color: '#d8c8a8', pos: [0, 5.6, 0] },
        { geo: new THREE.ConeGeometry(0.25, 1.1, 8), color: '#6a8a6a', pos: [0, 7.5, 0] },
    ]), []);
    const mosqueGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(8, 3, 8), color: '#e8dcc4', pos: [0, 1.5, 0] },
        { geo: new THREE.SphereGeometry(2.6, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), color: '#8a9aa0', pos: [0, 3.6, 0] },
        { geo: new THREE.CylinderGeometry(2.6, 2.6, 0.6, 20), color: '#e8dcc4', pos: [0, 3.3, 0] },
        { geo: new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), color: '#8a9aa0', pos: [2.8, 3, 2.8] },
        { geo: new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), color: '#8a9aa0', pos: [-2.8, 3, 2.8] },
        { geo: new THREE.CylinderGeometry(0.25, 0.3, 11, 8), color: '#e8dcc4', pos: [3.8, 5.5, -3.8] },
        { geo: new THREE.CylinderGeometry(0.25, 0.3, 11, 8), color: '#e8dcc4', pos: [-3.8, 5.5, -3.8] },
    ]), []);
    const pyramidGeo = useMemo(() => new THREE.ConeGeometry(0.7071, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0), []);
    const sailGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(1.8, 0.3, 0.6), color: '#6a4a2a', pos: [0, 0.15, 0] },
        { geo: new THREE.ConeGeometry(0.9, 2.6, 3), color: '#f4ece0', pos: [0, 1.6, 0], scale: [1, 1, 0.15] },
    ]), []);

    const { houses, minarets } = useMemo(() => {
        const rand = seededRandom(0xca1);
        const houses = scatter(rand, 1500, [-24, 46], [-60, 22], (x, z) => cairoSdf(x, z) > 2.2 && Math.hypot(x + 18, z + 10) > 6 && !(x < -22 && z < -30))
            .map(([x, z]) => {
                const w = 1.2 + rand() * 1.4;
                return {
                    p: [x, LAND_Y, z], s: [w, 1.2 + rand() * 3.2 + Math.max(0, 8 - Math.abs(x - nileX(z))) * 0.35 * rand(), w * (0.8 + rand() * 0.5)],
                    r: Math.floor(rand() * 4) * 0.12, c: new THREE.Color().setHSL(0.08 + rand() * 0.03, 0.3, 0.55 + rand() * 0.15), d: rand(),
                };
            });
        const minarets = scatter(rand, 26, [-20, 44], [-56, 20], (x, z) => cairoSdf(x, z) > 3)
            .map(([x, z]) => ({ p: [x, LAND_Y, z], s: [1, 0.8 + rand() * 0.5, 1], c: '#ffffff', d: rand() }));
        return { houses, minarets };
    }, []);

    const nilePath = useMemo(() => Array.from({ length: 12 }, (_, i) => {
        const z = 22 - i * 7;
        return [nileX(z) + 1, 0.1, z];
    }).concat(Array.from({ length: 12 }, (_, i) => {
        const z = -55 + i * 7;
        return [nileX(z) - 1, 0.1, z];
    })), []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.2, z * 0.2, 2, 19);
        const bankD = Math.abs(x - nileX(z));
        c.base.setHSL(0.09, 0.4, 0.55 + n * 0.05);
        const green = smoothstep(9, 4, bankD);
        c.region.setHSL(0.11, 0.45, 0.6);
        if (green > 0) c.base.lerp(new THREE.Color().setHSL(0.26, 0.45, 0.28), green);
        if (y < 0) c.base.setHSL(0.12, 0.3, 0.3);
        return green;
    };

    return (
        <group>
            <Atmosphere
                sky={{ top: '#3a4a7a', horizon: barbarism ? '#a0705a' : '#f0a868', bottom: '#4a3a30', sunColor: '#ffb070', sunDir: [-0.8, 0.12, -0.6], sunSize: 2.4, haze: 1.8, stars: 0.1 }}
                fog={{ color: barbarism ? '#8a6a5a' : '#e0a878', near: 45, far: 190 }}
                sun={{ position: [-44, 14, -34], color: '#ffb880', intensity: 2.3 }}
                hemi={{ sky: '#9aa8d0', ground: '#6a4a2a', intensity: 0.7 }}
            />
            <Terrain height={height} paint={paint} blend2={dried ? 1 : 0} segments={170} />
            <Water level={dried ? -1.3 : 0} color={dried ? '#6a5a3a' : '#2a5a6a'} amp={0.05} choppy={0.3} opacity={0.93} roughness={0.08} />

            <InstancedSet geometry={box} material={facade} items={houses} />
            <InstancedSet geometry={minaretGeo} material={vmat} items={minarets} />
            <mesh geometry={mosqueGeo} material={vmat} position={[-18, LAND_Y, -10]} castShadow receiveShadow raycast={() => null} />
            <GlowLight position={[-18, 8, -10]} color="#ffcf7a" intensity={60} distance={30} on={!barbarism} />
            <Particles mode="float" count={120} area={[16, 2, 10]} center={[4, 2.4, -2]} size={0.35} speed={0.4} color="#ffc060" opacity={1} amount={barbarism ? 0 : 1} seed={141} />
            {[[-8, 2], [18, -20], [2, -34]].map(([x, z], i) => (
                <Particles key={i} mode="rise" count={60} area={[2, 12, 2]} center={[x, 7, z]} size={3} speed={2} wind={2} color="#3a2a22" additive={false} opacity={0.3} amount={barbarism ? 1 : 0} seed={150 + i} />
            ))}

            <Movers points={nilePath} count={5} spacing={16} geometry={sailGeo} material={vmat} speed={dried ? 0 : 1.6} />

            {/* Пирамиды: при забвении песок заносит их по самую вершину */}
            {PYRAMIDS.map(([x, z, s], i) => (
                <Tweened key={i} position={[x, buried ? height(x, z) - s * 0.72 : height(x, z) - 0.2, z]} speed={0.25}>
                    <mesh geometry={pyramidGeo} material={stone} scale={[s * 1.55, s, s * 1.55]} castShadow receiveShadow raycast={() => null} />
                </Tweened>
            ))}
            <Particles mode="drift" count={600} area={[40, 8, 30]} center={[-32, 6, -52]} size={0.4} speed={10} color="#d8a870" additive={false} opacity={0.6} amount={buried ? 1 : 0} seed={160} />

            <FloatingWords scrambled={noise} />

            <Marker id="culture" position={[-18, 12, -10]} color="#ffaaff" reverseColor="#a0705a" />
            <Marker id="language" position={[4, 20, -4]} color="#ffe6b0" reverseColor="#ff5a4a" />
            <Marker id="nile" position={[8, 4, 8]} color="#6fd0ff" reverseColor="#c8a060" />
            <Marker id="heritage" position={[-30, 20, -52]} color="#ffd08a" reverseColor="#b08050" />
        </group>
    );
}
