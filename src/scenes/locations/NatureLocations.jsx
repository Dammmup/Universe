import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm, noise2, ridged } from '../../lib/noise';
import { auroraFragment, auroraVertex } from '../../lib/shaders/aurora';
import {
    Atmosphere,
    FadeMesh,
    Flock,
    Flow,
    GlowLight,
    InstancedSet,
    Marker,
    Particles,
    PathLine,
    Rain,
    Terrain,
    Water,
    mergeParts,
    lerp,
    scatter,
    seededRandom,
    smoothstep,
    useReversed,
    useVertexMaterial,
} from './kit';

/**
 * Природные локации мезо-уровня 1. Каждая — отдельная местность в своём
 * масштабе: десятки километров джунглей, пустыни или ледника, а не пятно на
 * глобусе. Все объекты стоят на рельефе, который строится той же функцией
 * высоты, что и расстановка — деревья не висят в воздухе и не тонут в склоне.
 */

// ═══════════════════════════════════════════════════════════════════════════
// ДЖУНГЛИ
// ═══════════════════════════════════════════════════════════════════════════

const riverZ = (x) => 7 + Math.sin(x * 0.07) * 7 + Math.sin(x * 0.19 + 1) * 1.6;

function jungleHeight(x, z) {
    let y = 1.6 + fbm(x * 0.035, z * 0.035, 4, 11) * 4.5 + Math.max(0, -z - 25) * 0.14;
    const d = Math.abs(z - riverZ(x));
    y = lerp(y, -2.4, smoothstep(6.5, 1.8, d));
    return y;
}

/** Вырубка «рыбьей костью»: дорога и поперечные просеки — так выглядит Амазония со спутника. */
function clearingMask(x, z) {
    if (x < 4 || x > 46 || z < -46 || z > -1) return 0;
    const road = Math.abs(x - 15) < 1.6 ? 1 : 0;
    const strip = ((z + 46) / 7) % 1 < 0.5 && x > 15 ? 1 : 0;
    return Math.max(road, strip);
}

export function Jungle() {
    const withered = useReversed('photosynthesis');
    const drought = useReversed('tropicalRain');
    const logged = useReversed('canopy');
    const extinct = useReversed('wildlife');

    const treeGeo = useMemo(() => mergeParts([
        { geo: new THREE.CylinderGeometry(0.16, 0.3, 5, 6), color: '#5a4630', pos: [0, 2.5, 0] },
        { geo: new THREE.IcosahedronGeometry(1.9, 1), color: '#ffffff', pos: [0, 5.4, 0], scale: [1, 0.55, 1] },
        { geo: new THREE.IcosahedronGeometry(1.2, 1), color: '#e8ffe8', pos: [0.9, 5.9, 0.4], scale: [1, 0.6, 1] },
    ]), []);
    const bushGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
    const stumpGeo = useMemo(() => new THREE.CylinderGeometry(0.3, 0.36, 0.5, 6).translate(0, 0.25, 0), []);
    const mat = useVertexMaterial({}, { sway: 1 });
    const plainMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), []);

    const { trees, bushes, stumps } = useMemo(() => {
        const rand = seededRandom(0x1a6e);
        const trees = [];
        const stumps = [];
        scatter(rand, 950, [-68, 68], [-68, 26], (x, z) => Math.abs(z - riverZ(x)) > 5.2).forEach(([x, z]) => {
            const emergent = rand() < 0.06;
            const k = emergent ? 1.7 + rand() * 0.5 : 0.75 + rand() * 0.55;
            const color = new THREE.Color().setHSL(0.27 + rand() * 0.1, 0.55 + rand() * 0.2, 0.2 + rand() * 0.12);
            const dead = new THREE.Color().setHSL(0.07 + rand() * 0.05, 0.45, 0.28 + rand() * 0.1);
            const clearing = clearingMask(x, z) > 0.5;
            const y = jungleHeight(x, z) - 0.2;
            const d = rand();
            trees.push({
                p: [x, y, z], s: [k, k, k], s2: [k * 0.92, k * 0.9, k * 0.92], r: rand() * 6.28,
                c: color, c2: dead, d, clearing,
            });
            if (clearing) stumps.push({ p: [x, y, z], s: [k, k, k], r: rand() * 6.28, c: '#6b5234', d });
        });
        const bushes = scatter(rand, 700, [-66, 66], [-66, 28], (x, z) => Math.abs(z - riverZ(x)) > 4.4).map(([x, z]) => {
            const k = 0.5 + rand() * 0.8;
            return {
                p: [x, jungleHeight(x, z), z], s: [k * 1.4, k, k * 1.4], r: rand() * 6.28,
                c: new THREE.Color().setHSL(0.29 + rand() * 0.08, 0.6, 0.17 + rand() * 0.1),
                c2: new THREE.Color().setHSL(0.08, 0.4, 0.3 + rand() * 0.08),
                d: rand(), clearing: clearingMask(x, z) > 0.5,
            };
        });
        return { trees, bushes, stumps };
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.18, z * 0.18, 2, 5);
        const d = Math.abs(z - riverZ(x));
        if (d < 3.4 || y < -0.4) {
            c.base.set('#5d4c34');
            c.alt.set('#8d7a5a');
        } else {
            c.base.setHSL(0.3 + n * 0.03, 0.5, 0.13 + n * 0.04);
            c.alt.setHSL(0.09 + n * 0.02, 0.42, 0.24 + n * 0.04);
        }
        c.region.setHSL(0.04, 0.5, 0.3 + n * 0.05);
        return clearingMask(x, z);
    };

    const dim = withered ? 0.6 : 1;

    return (
        <group>
            <Atmosphere
                sky={{
                    top: withered ? '#7c8790' : '#4f86bd',
                    horizon: withered ? '#b8a98c' : (drought ? '#d7cfb6' : '#bdd3c6'),
                    bottom: '#3d4b3a',
                    sunColor: withered ? '#e0b070' : '#fff0cc',
                    sunDir: [0.45, 0.5, -0.75],
                    haze: drought ? 1.6 : 1,
                }}
                fog={{
                    color: withered ? '#a89a7e' : (drought ? '#cfc5a8' : '#b4c9bd'),
                    near: drought ? 55 : 32,
                    far: drought ? 190 : 140,
                }}
                sun={{ position: [30, 42, -36], color: withered ? '#e8c28a' : '#fff1d6', intensity: 2.5 * dim }}
                hemi={{ sky: '#cfe6ff', ground: withered ? '#5a4a30' : '#24401e', intensity: 0.75 * dim }}
            />

            <Terrain height={jungleHeight} paint={paint} blend={withered ? 1 : 0} blend2={logged ? 1 : 0} />
            <Water level={drought ? -1.9 : 0.05} color={drought ? '#7a6848' : '#4e5c38'} amp={0.06} choppy={0.3} opacity={0.92} roughness={0.08} />

            <InstancedSet
                geometry={treeGeo}
                material={mat}
                items={trees}
                blend={withered ? 1 : 0}
                hidden={logged}
                hideFilter={(t) => t.clearing}
                speed={0.7}
            />
            <InstancedSet
                geometry={bushGeo}
                material={plainMat}
                items={bushes}
                blend={withered ? 1 : 0}
                hidden={logged}
                hideFilter={(t) => t.clearing}
                castShadow={false}
            />
            <InstancedSet geometry={stumpGeo} material={plainMat} items={stumps} hidden={!logged} castShadow={false} />

            {/* Влажность: ливень и туман над кронами — лес сам делает свой дождь */}
            <Rain amount={drought ? 0 : 0.75} count={1300} />
            <Particles
                mode="float" count={70} area={[110, 5, 80]} center={[0, 9, -20]} size={9}
                color="#e8f2ea" opacity={0.09} additive={false} amount={drought ? 0 : 1} speed={0.25} seed={2}
            />
            {/* Жизнь: светлячки под пологом, бабочки и стая ара над кронами */}
            <Particles
                mode="float" count={160} area={[80, 5, 60]} center={[0, 4.5, -8]} size={0.28}
                color="#d8ff7a" opacity={0.9} amount={extinct ? 0 : 1} speed={0.7} seed={4}
            />
            <Particles
                mode="float" count={50} area={[60, 4, 40]} center={[-10, 7.5, 0]} size={0.45}
                color="#4fb6ff" opacity={0.85} amount={extinct ? 0 : 1} speed={0.9} seed={6}
            />
            <Flock count={14} formation="swarm" center={[-6, 13, -14]} radius={[20, 10]} color="#e0322a" size={0.55} gone={extinct} seed={3} />
            <Flock count={9} formation="swarm" center={[14, 11, -24]} radius={[14, 9]} color="#2a7de0" size={0.5} gone={extinct} seed={8} speed={0.12} />

            <Marker id="photosynthesis" position={[-12, 16, -8]} color="#6dff7a" reverseColor="#e0a060" />
            <Marker id="tropicalRain" position={[4, 21, -22]} color="#9fd4ff" reverseColor="#ffcc70" />
            <Marker id="canopy" position={[18, 14, -16]} color="#8dffa0" reverseColor="#ff8a5a" />
            <Marker id="wildlife" position={[-18, 13, 8]} color="#ffd36b" reverseColor="#9aa0aa" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ТАЙГА
// ═══════════════════════════════════════════════════════════════════════════

const LAKE = { x: -12, z: -6, r: 13 };
const FIRE = { x: 20, z: -14, r: 15 };

function taigaHeight(x, z) {
    let y = 1.2 + fbm(x * 0.04, z * 0.04, 4, 21) * 3.5;
    y += Math.max(0, -z - 30) * 0.35 * (0.6 + ridged(x * 0.03, z * 0.03, 3, 4));
    const d = Math.hypot((x - LAKE.x) * 0.8, z - LAKE.z);
    y = lerp(y, -2.2, smoothstep(LAKE.r, LAKE.r * 0.55, d));
    return y;
}

const fireMask = (x, z) => smoothstep(FIRE.r, FIRE.r * 0.45, Math.hypot(x - FIRE.x, (z - FIRE.z) * 1.2) + noise2(x * 0.2, z * 0.2, 7) * 3);

export function Taiga() {
    const winter = useReversed('seasons');
    const severed = useReversed('mycelium');
    const scattered = useReversed('migration');
    const burning = useReversed('fireCycle');

    const pineGeo = useMemo(() => mergeParts([
        { geo: new THREE.CylinderGeometry(0.1, 0.18, 1.6, 5), color: '#4a3524', pos: [0, 0.8, 0] },
        { geo: new THREE.ConeGeometry(1.25, 2.4, 7), color: '#ffffff', pos: [0, 2.3, 0] },
        { geo: new THREE.ConeGeometry(0.95, 2.0, 7), color: '#f2fff2', pos: [0, 3.5, 0] },
        { geo: new THREE.ConeGeometry(0.6, 1.7, 7), color: '#e6f8e6', pos: [0, 4.6, 0] },
    ]), []);
    const charredGeo = useMemo(() => mergeParts([
        { geo: new THREE.CylinderGeometry(0.06, 0.16, 4.2, 5), color: '#ffffff', pos: [0, 2.1, 0] },
        { geo: new THREE.CylinderGeometry(0.02, 0.05, 1.4, 4), color: '#ffffff', pos: [0.35, 3.1, 0], rot: [0, 0, -0.9] },
    ]), []);
    const mat = useVertexMaterial({ roughness: 0.9 }, { sway: 0.8 });

    const { pines, charred, roots } = useMemo(() => {
        const rand = seededRandom(0x7a16a);
        const pines = [];
        const charred = [];
        scatter(rand, 1100, [-68, 68], [-68, 26], (x, z) => taigaHeight(x, z) > 0.4).forEach(([x, z]) => {
            const k = 0.7 + rand() * 0.7;
            const y = taigaHeight(x, z) - 0.1;
            const green = new THREE.Color().setHSL(0.36 + rand() * 0.06, 0.4 + rand() * 0.15, 0.14 + rand() * 0.08);
            const snowy = new THREE.Color().setHSL(0.55, 0.12, 0.72 + rand() * 0.12);
            const inFire = fireMask(x, z) > 0.35;
            const d = inFire ? 1 - fireMask(x, z) : rand();
            pines.push({ p: [x, y, z], s: [k, k * (0.9 + rand() * 0.3), k], r: rand() * 6.28, c: green, c2: snowy, d, inFire });
            if (inFire) charred.push({ p: [x, y, z], s: [k, k, k], r: rand() * 6.28, c: '#1c1814', d });
        });
        // Грибница: связи между соседними деревьями у земли
        const nodes = pines.filter((_, i) => i % 3 === 0 && Math.abs(pines[i].p[0]) < 34 && pines[i].p[2] > -30);
        const roots = [];
        nodes.forEach((a, i) => {
            for (let j = i + 1; j < nodes.length; j += 1) {
                const b = nodes[j];
                const dist = Math.hypot(a.p[0] - b.p[0], a.p[2] - b.p[2]);
                if (dist < 5.5) {
                    roots.push([a.p[0], a.p[1] + 0.25, a.p[2]], [b.p[0], b.p[1] + 0.25, b.p[2]]);
                }
            }
        });
        return { pines, charred, roots };
    }, []);

    const rootGeo = useMemo(() => new THREE.BufferGeometry().setFromPoints(roots.map((p) => new THREE.Vector3(...p))), [roots]);
    const rootPaths = useMemo(() => {
        const paths = [];
        for (let i = 0; i < roots.length; i += 6) paths.push([roots[i], roots[i + 1]]);
        return paths;
    }, [roots]);
    const rootMat = useRef();
    const rootColor = useMemo(() => new THREE.Color(), []);
    useFrame((state, delta) => {
        const m = rootMat.current;
        if (!m) return;
        const k = 1 - Math.exp(-Math.min(delta, 0.1) * 1.2);
        rootColor.set(severed ? '#5a2020' : '#7dffcf');
        m.color.lerp(rootColor, k);
        const target = severed ? 0.12 : 0.32 + Math.sin(state.clock.elapsedTime * 1.6) * 0.1;
        m.opacity += (target - m.opacity) * k;
    });

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.2, z * 0.2, 2, 3);
        if (y < -0.3) {
            c.base.set('#4a4a3c');
            c.alt.set('#dfe8f0');
        } else if (slope > 0.9) {
            c.base.setHSL(0.1, 0.1, 0.3 + n * 0.05);
            c.alt.setHSL(0.58, 0.1, 0.72);
        } else {
            c.base.setHSL(0.2 + n * 0.05, 0.35, 0.18 + n * 0.05);
            c.alt.setHSL(0.58, 0.14, 0.86 + n * 0.05);
        }
        c.region.setHSL(0.05, 0.15, 0.07 + n * 0.03);
        return fireMask(x, z);
    };

    return (
        <group>
            <Atmosphere
                sky={{
                    top: winter ? '#8a9bb0' : '#5f8fc0',
                    horizon: burning ? '#d09a6c' : (winter ? '#d6dde6' : '#c9d6df'),
                    bottom: '#4a5058',
                    sunColor: burning ? '#ff9a4a' : '#ffe6c2',
                    sunDir: [-0.5, 0.32, -0.8],
                    haze: burning ? 2 : 1,
                }}
                fog={{
                    color: burning ? '#b88a66' : (winter ? '#d2d9e2' : '#bccad4'),
                    near: winter ? 20 : 34,
                    far: burning ? 110 : (winter ? 100 : 150),
                }}
                sun={{ position: [-32, 30, -40], color: burning ? '#ffb070' : (winter ? '#dfe8ff' : '#ffe8cc'), intensity: winter ? 1.6 : 2.3 }}
                hemi={{ sky: winter ? '#e6eeff' : '#cfe0ff', ground: winter ? '#9aa4b0' : '#2e3a22', intensity: winter ? 1.0 : 0.7 }}
            />

            <Terrain height={taigaHeight} paint={paint} blend={winter ? 1 : 0} blend2={burning ? 1 : 0} speed={0.7} />
            <Water level={0} color={winter ? '#e4edf5' : '#2c4a5a'} amp={winter ? 0 : 0.08} choppy={winter ? 0 : 0.4} opacity={winter ? 1 : 0.9} roughness={winter ? 0.5 : 0.06} />

            <InstancedSet geometry={pineGeo} material={mat} items={pines} blend={winter ? 1 : 0} hidden={burning} hideFilter={(t) => t.inFire} speed={0.6} />
            <InstancedSet geometry={charredGeo} material={mat} items={charred} hidden={!burning} speed={0.6} />

            {/* Грибница: светящаяся сеть под подстилкой, по ней бегут импульсы */}
            <lineSegments geometry={rootGeo} raycast={() => null}>
                <lineBasicMaterial ref={rootMat} color="#7dffcf" transparent opacity={0.3} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </lineSegments>
            <Flow paths={rootPaths} count={140} speed={severed ? 0 : 0.05} amount={severed ? 0 : 1} color="#b8ffe6" size={0.32} spread={0} loop={false} seed={11} />

            <Flock count={17} formation="v" center={[-4, 19, -14]} radius={[34, 16]} scattered={scattered} color="#2b2d30" size={0.75} seed={4} />

            <Particles mode="fall" count={1600} area={[90, 30, 70]} center={[0, 14, -10]} size={0.22} speed={2.2} wind={1.2} color="#ffffff" amount={winter ? 1 : 0} additive={false} opacity={0.9} />

            {/* Верховой пожар: пламя, дым и оранжевый свет на склонах */}
            <Particles mode="rise" count={500} area={[26, 9, 22]} center={[FIRE.x, 5, FIRE.z]} size={0.55} speed={3.5} color="#ff8a2a" amount={burning ? 1 : 0} opacity={0.9} seed={7} />
            <Particles mode="rise" count={160} area={[34, 26, 30]} center={[FIRE.x - 4, 16, FIRE.z - 6]} size={7} speed={2} wind={-3} color="#4a4038" amount={burning ? 1 : 0} opacity={0.22} additive={false} seed={9} />
            <GlowLight position={[FIRE.x, 5, FIRE.z]} color="#ff7a2a" intensity={180} distance={50} on={burning} flicker={1} />

            <Marker id="seasons" position={[-8, 14, -22]} color="#cfe6ff" reverseColor="#ffffff" />
            <Marker id="mycelium" position={[3, 3, 10]} color="#7dffcf" reverseColor="#ff6a5a" />
            <Marker id="migration" position={[-16, 19, -4]} color="#b8dcff" reverseColor="#ffb870" />
            <Marker id="fireCycle" position={[20, 10, -10]} color="#9dffb4" reverseColor="#ff7a3a" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ПУСТЫНЯ
// ═══════════════════════════════════════════════════════════════════════════

const OASIS = { x: -8, z: 3, r: 8 };

function desertHeight(x, z) {
    const warp = fbm(x * 0.02, z * 0.02, 3, 31) * 3;
    const dune = Math.pow(Math.sin(x * 0.11 + z * 0.045 + warp) * 0.5 + 0.5, 2.2);
    let y = 0.8 + dune * 4.2 * (0.6 + fbm(x * 0.03, z * 0.03, 2, 8) * 0.7) + Math.max(0, -z - 35) * 0.2;
    // Столовые горы на горизонте
    const mesa = smoothstep(0.35, 0.42, noise2(x * 0.03, z * 0.03, 44)) * (z < -45 ? 9 : 0);
    y += mesa;
    const d = Math.hypot(x - OASIS.x, (z - OASIS.z) * 1.3);
    y = lerp(y, -1.2, smoothstep(OASIS.r, OASIS.r * 0.4, d));
    return y;
}

const CARAVAN = [[-50, 0, 18], [-30, 0, 16], [-14, 0, 13], [0, 0, 16], [16, 0, 20], [40, 0, 22]]
    .map(([x, , z]) => [x, desertHeight(x, z) + 0.9, z]);

export function Desert() {
    const night = useReversed('dayNight');
    const storm = useReversed('sandstorm');
    const dried = useReversed('oasis');
    const bloom = useReversed('desertBloom');

    const palmGeo = useMemo(() => {
        const parts = [
            { geo: new THREE.CylinderGeometry(0.14, 0.24, 5.5, 6), color: '#9a7650', pos: [0, 2.75, 0], rot: [0, 0, 0.12] },
        ];
        for (let i = 0; i < 8; i += 1) {
            const a = (i / 8) * Math.PI * 2;
            parts.push({
                geo: new THREE.ConeGeometry(0.35, 3.2, 4),
                color: '#5f9a3c',
                scale: [1, 1, 0.25],
                rot: [Math.PI / 2 + 0.55, a, 0],
                pos: [Math.sin(a) * 1.2 - 0.66, 5.4, Math.cos(a) * 1.2],
            });
        }
        return mergeParts(parts);
    }, []);
    const flowerGeo = useMemo(() => new THREE.IcosahedronGeometry(0.22, 0), []);
    const camelGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(1.3, 0.55, 0.45), color: '#c49a6a', pos: [0, 1.3, 0] },
        { geo: new THREE.SphereGeometry(0.3, 6, 5), color: '#b88a5a', pos: [0, 1.7, 0] },
        { geo: new THREE.BoxGeometry(0.2, 0.8, 0.2), color: '#c49a6a', pos: [0.75, 1.75, 0], rot: [0, 0, -0.4] },
        { geo: new THREE.BoxGeometry(0.12, 1.1, 0.12), color: '#a07a50', pos: [0.45, 0.55, 0.15] },
        { geo: new THREE.BoxGeometry(0.12, 1.1, 0.12), color: '#a07a50', pos: [-0.45, 0.55, -0.15] },
    ]), []);
    const mat = useVertexMaterial({ roughness: 0.8 }, { sway: 1.2 });
    const camelMat = useVertexMaterial({ roughness: 0.8 });
    const flowerMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.6, flatShading: true, emissive: '#221111' }), []);

    const { palms, flowers, camels } = useMemo(() => {
        const rand = seededRandom(0xde5e);
        const palms = [];
        for (let i = 0; i < 26; i += 1) {
            const a = rand() * Math.PI * 2;
            const r = OASIS.r * (0.7 + rand() * 0.55);
            const x = OASIS.x + Math.cos(a) * r;
            const z = OASIS.z + Math.sin(a) * r / 1.3;
            const k = 0.7 + rand() * 0.45;
            palms.push({
                p: [x, desertHeight(x, z) - 0.2, z], s: [k, k, k], s2: [k, k * 0.85, k], r: rand() * 6.28,
                tilt: [0, 0], tilt2: [(rand() - 0.5) * 0.5, (rand() - 0.5) * 0.5],
                c: new THREE.Color().setHSL(0.15 + rand() * 0.08, 0.25, 0.85), c2: '#d8a060', d: rand(),
            });
        }
        const palette = ['#ff5fa8', '#ffd84a', '#b36bff', '#ff8a3a', '#ffffff'];
        const flowers = scatter(rand, 1400, [-60, 60], [-55, 26], (x, z) => noise2(x * 0.08, z * 0.08, 3) > -0.1 && desertHeight(x, z) > 0.2)
            .map(([x, z]) => {
                const k = 0.6 + rand() * 0.9;
                return { p: [x, desertHeight(x, z) + 0.1, z], s: [k, k * 0.6, k], c: palette[Math.floor(rand() * palette.length)], d: rand() };
            });
        const camels = Array.from({ length: 6 }, (_, i) => ({ offset: i * 0.02 }));
        return { palms, flowers, camels };
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.25, z * 0.25, 2, 9);
        const crest = smoothstep(2, 5, y);
        c.base.setHSL(0.085 + n * 0.01, 0.55, 0.52 + crest * 0.1 + n * 0.04 - slope * 0.05);
        const d = Math.hypot(x - OASIS.x, (z - OASIS.z) * 1.3);
        const grass = smoothstep(OASIS.r * 1.5, OASIS.r * 0.9, d);
        if (grass > 0) c.base.lerp(new THREE.Color().setHSL(0.24, 0.45, 0.28), grass);
        c.alt.copy(c.base).lerp(new THREE.Color().setHSL(0.22, 0.4, 0.4), 0.35 * smoothstep(-0.1, 0.4, noise2(x * 0.08, z * 0.08, 3)));
        c.region.setHSL(0.1, 0.18, 0.78 + n * 0.05);
        return grass;
    };

    const caravanRef = useRef();
    const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), e: new THREE.Euler(), p: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) }), []);
    const caravanPath = useMemo(() => {
        const pts = CARAVAN.map((p) => new THREE.Vector3(...p));
        return new THREE.CatmullRomCurve3(pts);
    }, []);
    useFrame((state) => {
        const mesh = caravanRef.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime * 0.006;
        camels.forEach((c, i) => {
            const u = ((t - c.offset) % 1 + 1) % 1;
            caravanPath.getPointAt(u, tmp.p);
            const ahead = caravanPath.getPointAt(Math.min(0.999, u + 0.002));
            tmp.e.set(0, Math.atan2(-(ahead.z - tmp.p.z), ahead.x - tmp.p.x), Math.sin(state.clock.elapsedTime * 3 + i) * 0.04);
            tmp.q.setFromEuler(tmp.e);
            tmp.p.y = desertHeight(tmp.p.x, tmp.p.z) - 0.1;
            tmp.m.compose(tmp.p, tmp.q, tmp.s);
            mesh.setMatrixAt(i, tmp.m);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            <Atmosphere
                sky={night
                    ? { top: '#040917', horizon: storm ? '#3a2a1c' : '#1b2640', bottom: '#0a0c12', sunColor: '#8aa6ff', sunDir: [0.3, 0.45, -0.8], sunSize: 0.8, stars: storm ? 0.1 : 1, haze: 0.4 }
                    : { top: storm ? '#b0875a' : '#2f7fcf', horizon: storm ? '#d9a468' : '#f1d7aa', bottom: '#b08a5a', sunColor: storm ? '#ffb070' : '#fff2d4', sunDir: [0.3, 0.6, -0.75], sunSize: storm ? 2.5 : 1.2, haze: storm ? 2.5 : 1.3 }}
                fog={{
                    color: storm ? (night ? '#3a2a1c' : '#c99258') : (night ? '#1b2640' : '#ecd2a6'),
                    near: storm ? 4 : 50,
                    far: storm ? 60 : 200,
                }}
                sun={{
                    position: night ? [20, 30, -50] : [24, 46, -40],
                    color: night ? '#9ab4ff' : (storm ? '#ffc080' : '#fff2dc'),
                    intensity: night ? 0.55 : (storm ? 1.4 : 3.1),
                }}
                hemi={{ sky: night ? '#34466e' : '#ffe9c8', ground: night ? '#1a1a22' : '#b88a5a', intensity: night ? 0.35 : 0.8 }}
            />

            <Terrain height={desertHeight} paint={paint} blend={bloom ? 1 : 0} blend2={dried ? 1 : 0} roughness={1} />
            <Water level={dried ? -2.6 : 0.1} position={[OASIS.x, 0, OASIS.z]} size={24} segments={40} color="#2f8f9a" amp={0.03} choppy={0.2} opacity={dried ? 0 : 0.92} roughness={0.05} />

            <InstancedSet geometry={palmGeo} material={mat} items={palms} blend={dried ? 1 : 0} />
            <InstancedSet geometry={flowerGeo} material={flowerMat} items={flowers} hidden={!bloom} castShadow={false} speed={0.8} />

            <instancedMesh ref={caravanRef} args={[camelGeo, camelMat, camels.length]} castShadow frustumCulled={false} raycast={() => null} />
            {/* Ночной костёр каравана и горячее марево днём */}
            <GlowLight position={[-14, desertHeight(-14, 11) + 1, 11]} color="#ff9a4a" intensity={40} distance={22} on={night && !storm} flicker={1} />
            <Particles mode="rise" count={40} area={[0.8, 2, 0.8]} center={[-14, desertHeight(-14, 11) + 1.4, 11]} size={0.3} speed={1.5} color="#ffb060" amount={night && !storm ? 1 : 0} seed={12} />

            <Particles mode="drift" count={2600} area={[120, 18, 90]} center={[0, 7, -10]} size={0.42} speed={18} color={night ? '#6a5540' : '#d9a066'} amount={storm ? 1 : 0} additive={false} opacity={0.7} seed={13} />
            <Particles mode="drift" count={200} area={[120, 20, 90]} center={[0, 8, -10]} size={9} speed={10} color={night ? '#3a2a1c' : '#c48a50'} amount={storm ? 1 : 0} additive={false} opacity={0.12} seed={14} />

            <Marker id="dayNight" position={[12, 15, -18]} color="#ffd36b" reverseColor="#8fb0ff" />
            <Marker id="sandstorm" position={[-18, 11, -14]} color="#bfe4ff" reverseColor="#ffb060" />
            <Marker id="oasis" position={[-8, 6, 2]} color="#6fe0ff" reverseColor="#d9b98a" />
            <Marker id="desertBloom" position={[12, 5, 4]} color="#e0d0a0" reverseColor="#ff7ac0" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// АРКТИКА
// ═══════════════════════════════════════════════════════════════════════════

const TUNDRA_X = -14;

function arcticHeight(x, z) {
    const n = fbm(x * 0.05, z * 0.05, 4, 51);
    // Ледник у горизонта: отвесный фронт над водой
    const shelf = smoothstep(-12, -16, z) * (5 + n * 2.5 + Math.max(0, -z - 30) * 0.15);
    // Тундра слева — низкий берег
    const land = smoothstep(TUNDRA_X + 2, TUNDRA_X - 3, x) * (1.3 + n * 1.2);
    const sea = -3.5 + n;
    return Math.max(sea, shelf, land);
}

const tundraMask = (x, z) => smoothstep(TUNDRA_X + 1, TUNDRA_X - 4, x) * smoothstep(-10, -6, z);

function AuroraRibbon({ faded }) {
    const matRef = useRef();
    const uniforms = useMemo(() => ({
        uColorLow: { value: new THREE.Color('#38ffb0') },
        uColorHigh: { value: new THREE.Color('#9b5cff') },
        uTime: { value: 0 },
        uIntensity: { value: 0.8 },
        uWave: { value: 2.2 },
    }), []);
    useFrame((state, delta) => {
        const u = matRef.current?.uniforms;
        if (!u) return;
        u.uTime.value = state.clock.elapsedTime * 0.6;
        u.uIntensity.value += ((faded ? 0.0 : 1.1) - u.uIntensity.value) * Math.min(1, delta * 0.9);
    });
    return (
        <group position={[0, 12, -30]} rotation={[0.08, 0, 0]}>
            <mesh raycast={() => null} scale={[1, 1, 0.6]}>
                <cylinderGeometry args={[110, 110, 46, 128, 1, true, Math.PI * 0.62, Math.PI * 0.76]} />
                <shaderMaterial
                    ref={matRef}
                    vertexShader={auroraVertex}
                    fragmentShader={auroraFragment}
                    uniforms={uniforms}
                    transparent
                    depthWrite={false}
                    side={THREE.DoubleSide}
                    blending={THREE.AdditiveBlending}
                    fog={false}
                />
            </mesh>
        </group>
    );
}

export function Arctic() {
    const melting = useReversed('glaciers');
    // Полярный день: солнце кружит над горизонтом, сияние тонет в свете
    const polarDay = useReversed('polarNight');
    const faded = polarDay;
    const thawing = useReversed('permafrost');
    const hazed = useReversed('starField');

    const floeGeo = useMemo(() => new THREE.CylinderGeometry(1, 1.08, 0.5, 7).translate(0, 0.1, 0), []);
    const bergGeo = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
    const hutGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(1.8, 1.1, 1.3), color: '#8a3a2a', pos: [0, 0.55, 0] },
        { geo: new THREE.ConeGeometry(1.35, 0.7, 4), color: '#3a3a44', pos: [0, 1.45, 0], rot: [0, Math.PI / 4, 0] },
        { geo: new THREE.BoxGeometry(0.3, 0.3, 0.05), color: '#ffd98a', pos: [0.4, 0.65, 0.66] },
    ]), []);
    const iceMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05, flatShading: true }), []);
    const mat = useVertexMaterial();

    const { floes, bergs, huts } = useMemo(() => {
        const rand = seededRandom(0xa1c7);
        const floes = scatter(rand, 90, [-10, 60], [-12, 26], (x, z) => arcticHeight(x, z) < -1).map(([x, z]) => {
            const k = 0.8 + rand() * 2.4;
            return { p: [x, 0, z], s: [k, 1, k * (0.6 + rand() * 0.5)], s2: [k * 0.25, 0.4, k * 0.15], r: rand() * 6.28, c: '#eef6ff', c2: '#9fc2d6', d: rand() };
        });
        const bergs = scatter(rand, 12, [-4, 50], [-11, 0], (x, z) => arcticHeight(x, z) < -1).map(([x, z]) => {
            const k = 1.2 + rand() * 2.2;
            return { p: [x, 0.3, z], s: [k, k * 1.3, k * 0.9], s2: [k * 0.35, k * 0.3, k * 0.3], r: rand() * 6.28, c: '#dff2ff', c2: '#8fb8d0', d: rand() };
        });
        const huts = [[-24, 6], [-21, 10], [-27, 12], [-19, 3]].map(([x, z]) => ({
            p: [x, arcticHeight(x, z) - 0.1, z], s: [1, 1, 1], r: rand() * 6.28,
            tilt: [0, 0], tilt2: [(rand() - 0.5) * 0.45, (rand() - 0.5) * 0.45], s2: [1, 0.85, 1], c: '#ffffff', d: rand(),
        }));
        return { floes, bergs, huts };
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.2, z * 0.2, 2, 7);
        const tundra = tundraMask(x, z);
        if (z < -11 && y > 1) {
            c.base.setHSL(0.56, 0.35, 0.8 + n * 0.05 - slope * 0.08);
            c.alt.setHSL(0.56, 0.3, 0.55 + n * 0.05);
        } else if (y > -0.5) {
            c.base.setHSL(0.58, 0.12, 0.78 + n * 0.06);
            c.alt.copy(c.base);
        } else {
            c.base.setHSL(0.58, 0.3, 0.12);
            c.alt.copy(c.base);
        }
        c.region.setHSL(0.07, 0.35, 0.16 + n * 0.05);
        return tundra;
    };

    return (
        <group>
            <Atmosphere
                sky={polarDay
                    ? { top: '#5a82b8', horizon: hazed ? '#d8b090' : '#f0d8c0', bottom: '#8aa0b8', sunColor: '#ffd8a0', sunDir: [0.55, 0.07, -0.8], sunSize: 1.6, stars: 0, haze: 1.6 }
                    : {
                        top: '#02050e',
                        horizon: hazed ? '#6a4a3a' : '#16233c',
                        bottom: '#070a12',
                        sunColor: '#5a6a90',
                        sunDir: [-0.4, 0.3, -0.85],
                        sunSize: 0.5,
                        stars: hazed ? 0.08 : 1,
                        haze: hazed ? 2.5 : 0.35,
                    }}
                fog={{
                    color: polarDay ? (hazed ? '#c8a888' : '#dfd6cc') : (hazed ? '#4a3a34' : '#16233c'),
                    near: 40,
                    far: hazed ? 120 : 190,
                }}
                sun={{ position: polarDay ? [40, 8, -50] : [-28, 26, -40], color: polarDay ? '#ffd8b0' : '#b8ccff', intensity: polarDay ? 2.4 : 0.9 }}
                hemi={{ sky: polarDay ? '#c8dcf0' : '#5a7ab0', ground: polarDay ? '#8a9aaa' : '#1a2030', intensity: polarDay ? 0.9 : 0.55 }}
            />

            <Terrain height={arcticHeight} paint={paint} blend={melting ? 1 : 0} blend2={thawing ? 1 : 0} roughness={0.7} />
            <Water level={melting ? 0.9 : 0} color="#0f2a44" amp={0.12} choppy={0.5} opacity={0.93} roughness={0.12} />

            <InstancedSet geometry={floeGeo} material={iceMat} items={floes} blend={melting ? 1 : 0} speed={0.5} />
            <InstancedSet geometry={bergGeo} material={iceMat} items={bergs} blend={melting ? 1 : 0} speed={0.4} />
            <InstancedSet geometry={hutGeo} material={mat} items={huts} blend={thawing ? 1 : 0} speed={0.6} />

            <AuroraRibbon faded={faded} />

            {/* Метан из оттаявшей мерзлоты и лужи на раскисшей тундре */}
            <Particles mode="rise" count={180} area={[20, 6, 26]} center={[-26, 3, 6]} size={0.32} speed={1.4} color="#bfe6c8" amount={thawing ? 1 : 0} opacity={0.6} seed={21} />
            {/* Засветка: оранжевое марево у горизонта съедает звёзды */}
            <Particles mode="float" count={60} area={[160, 10, 40]} center={[0, 6, -70]} size={26} speed={0.2} color="#c98a50" amount={hazed ? 1 : 0} opacity={0.08} additive seed={22} />
            <Particles mode="fall" count={500} area={[80, 25, 60]} center={[0, 12, -6]} size={0.14} speed={1.2} wind={2} color="#ffffff" amount={melting ? 0.2 : 0.8} opacity={0.7} seed={23} />

            <Marker id="glaciers" position={[10, 7, -13]} color="#dff2ff" reverseColor="#6fb6e0" />
            <Marker id="polarNight" position={[-2, 21, -34]} color="#5cffc0" reverseColor="#ffd08a" />
            <Marker id="permafrost" position={[-22, 5.5, 6]} color="#c9e6ff" reverseColor="#c08a5a" />
            <Marker id="starField" position={[20, 19, -30]} color="#ffffff" reverseColor="#ffaa66" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ОКЕАН
// ═══════════════════════════════════════════════════════════════════════════

const ATOLL = { x: 12, z: -4, r: 9 };

function oceanHeight(x, z) {
    const n = fbm(x * 0.04, z * 0.04, 4, 61);
    const d = Math.hypot(x - ATOLL.x, z - ATOLL.z);
    // Кольцо атолла: риф по краю, лагуна внутри, глубина снаружи
    const ring = Math.exp(-Math.pow((d - ATOLL.r) / 2.2, 2));
    const shelf = smoothstep(ATOLL.r * 2.3, ATOLL.r * 1.1, d);
    let y = -11 + n * 3 + shelf * 8.5 + ring * 3.6;
    if (d < ATOLL.r - 2.5) y = Math.min(y, -1.6 + n);
    // Материковый склон слева уходит в бездну
    y -= smoothstep(-5, -45, x) * 6;
    return y;
}

const CURRENTS = [0, 1, 2, 3].map((k) => Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    const x = -60 + t * 120;
    return [x, 0.5, -30 + k * 11 + Math.sin(t * Math.PI * 2 + k) * 5 - t * 8];
}));

export function Ocean() {
    const calm = useReversed('waves');
    const drained = useReversed('ocean');
    const bleached = useReversed('coral');
    // Мёртвая зона: светящийся планктон гаснет, вода мутнеет
    const stagnant = useReversed('plankton');

    const coralGeo = useMemo(() => mergeParts([
        { geo: new THREE.CylinderGeometry(0.08, 0.14, 1.1, 5), color: '#ffffff', pos: [0, 0.55, 0] },
        { geo: new THREE.CylinderGeometry(0.06, 0.1, 0.8, 5), color: '#ffffff', pos: [0.28, 0.75, 0], rot: [0, 0, -0.6] },
        { geo: new THREE.CylinderGeometry(0.06, 0.1, 0.8, 5), color: '#ffffff', pos: [-0.25, 0.7, 0.1], rot: [0.3, 0, 0.7] },
        { geo: new THREE.IcosahedronGeometry(0.4, 1), color: '#ffffff', pos: [0.5, 0.2, 0.4], scale: [1, 0.6, 1] },
    ]), []);
    const palmGeo = useMemo(() => {
        const parts = [{ geo: new THREE.CylinderGeometry(0.1, 0.18, 4, 5), color: '#7a5a3a', pos: [0, 2, 0], rot: [0, 0, 0.2] }];
        for (let i = 0; i < 7; i += 1) {
            const a = (i / 7) * Math.PI * 2;
            parts.push({ geo: new THREE.ConeGeometry(0.28, 2.4, 4), color: '#5f9a3c', scale: [1, 1, 0.25], rot: [Math.PI / 2 + 0.5, a, 0], pos: [Math.sin(a) * 0.9 - 0.8, 4, Math.cos(a) * 0.9] });
        }
        return mergeParts(parts);
    }, []);
    const mat = useVertexMaterial({ roughness: 0.7 }, { sway: 0.9 });

    const { corals, palms } = useMemo(() => {
        const rand = seededRandom(0x0cea);
        const palette = ['#ff5f7a', '#ff9a4a', '#b46bff', '#3fe0c8', '#ffd84a', '#ff6ad5'];
        const corals = scatter(rand, 420, [-6, 34], [-24, 16], (x, z) => {
            const y = oceanHeight(x, z);
            return y > -4.5 && y < -0.5;
        }).map(([x, z]) => {
            const k = 0.6 + rand() * 1.1;
            return { p: [x, oceanHeight(x, z) - 0.1, z], s: [k, k, k], r: rand() * 6.28, c: palette[Math.floor(rand() * palette.length)], c2: '#e8e4dc', d: rand() };
        });
        const palms = scatter(rand, 18, [0, 24], [-16, 8], (x, z) => oceanHeight(x, z) > 0.4).map(([x, z]) => {
            const k = 0.7 + rand() * 0.4;
            return { p: [x, oceanHeight(x, z) - 0.1, z], s: [k, k, k], r: rand() * 6.28, c: new THREE.Color().setHSL(0.14, 0.2, 0.88), d: rand() };
        });
        return { corals, palms };
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.2, z * 0.2, 2, 13);
        if (y > 0.3) c.base.setHSL(0.12, 0.45, 0.72 + n * 0.05);
        else if (y > -4) c.base.setHSL(0.11, 0.35, 0.62 + n * 0.06);
        else c.base.setHSL(0.55, 0.25, 0.18 + n * 0.04 + (y + 14) * 0.012);
        c.alt.setHSL(0.09, 0.12, 0.62 + n * 0.08 + Math.max(0, y + 12) * 0.008);
        return 0;
    };

    return (
        <group>
            <Atmosphere
                sky={{
                    top: drained ? '#8a8676' : '#2d7cc9',
                    horizon: drained ? '#d6c4a0' : '#bfe0ef',
                    bottom: '#1a4a66',
                    sunColor: '#fff4d8',
                    sunDir: [0.3, 0.55, -0.8],
                    haze: drained ? 2 : 1,
                }}
                fog={{ color: drained ? '#d2c09c' : '#b8dcea', near: 50, far: 210 }}
                sun={{ position: [20, 44, -40], color: '#fff3dc', intensity: 2.8 }}
                hemi={{ sky: '#cfeaff', ground: '#1a4a60', intensity: 0.8 }}
            />

            <Terrain height={oceanHeight} paint={paint} blend={drained ? 1 : 0} segments={170} />
            <Water
                level={drained ? -9 : 0}
                size={200}
                segments={140}
                color={stagnant ? '#2a5a4a' : '#1b6f9e'}
                amp={calm ? 0.02 : 0.55}
                choppy={calm ? 0 : 1.1}
                opacity={drained ? 0 : 0.78}
                roughness={calm ? 0.03 : 0.16}
                speed={0.5}
            />

            <InstancedSet geometry={coralGeo} material={mat} items={corals} blend={bleached ? 1 : 0} castShadow={false} speed={0.5} />
            <InstancedSet geometry={palmGeo} material={mat} items={palms} />

            <Particles mode="float" count={260} area={[34, 3, 30]} center={[14, -2.2, -4]} size={0.3} speed={1.3} color="#ffcf6a" amount={bleached || drained ? 0 : 1} opacity={0.9} seed={31} />
            <Particles mode="float" count={120} area={[40, 3, 34]} center={[12, -2.6, -2]} size={0.28} speed={1.6} color="#5fd4ff" amount={bleached || drained ? 0 : 1} opacity={0.9} seed={32} />

            {CURRENTS.map((path, i) => (
                <PathLine key={i} points={path} color={stagnant ? '#6a6a50' : '#7fe8ff'} opacity={drained ? 0 : 0.18} />
            ))}
            <Flow paths={CURRENTS} count={420} speed={stagnant ? 0 : 0.12} amount={drained ? 0 : (stagnant ? 0.25 : 1)} color={stagnant ? '#8a8a60' : '#9ff0ff'} size={0.42} spread={1.4} seed={33} />

            <Flock count={10} formation="swarm" center={[8, 10, -6]} radius={[12, 9]} color="#f2f2f2" size={0.6} seed={9} speed={0.15} />

            <Marker id="waves" position={[-15, 4, 8]} color="#8ce0ff" reverseColor="#cfd8e0" />
            <Marker id="ocean" position={[-6, 9, -20]} color="#4ab5ff" reverseColor="#e0c080" />
            <Marker id="coral" position={[14, 3.5, 4]} color="#ff7aa8" reverseColor="#e8e4dc" />
            <Marker id="plankton" position={[-24, 3.5, -8]} color="#7fe8ff" reverseColor="#9a9a70" />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// ГОРЫ
// ═══════════════════════════════════════════════════════════════════════════

const VOLCANO = { x: 6, z: -34, h: 30, r: 26 };
const valleyRiver = (x) => 9 + Math.sin(x * 0.06) * 5;

function mountainHeight(x, z) {
    const back = smoothstep(4, -30, z);
    let y = 1 + fbm(x * 0.05, z * 0.05, 3, 71) * 1.6;
    y += ridged(x * 0.028, z * 0.028, 5, 72) * 26 * back;
    const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    const cone = Math.max(0, 1 - d / VOLCANO.r);
    y = Math.max(y, Math.pow(cone, 1.25) * VOLCANO.h + fbm(x * 0.1, z * 0.1, 2, 73) * 1.2);
    if (d < 3) y -= (1 - d / 3) * 3.5;
    const rd = Math.abs(z - valleyRiver(x));
    y = lerp(y, -1.2, smoothstep(4, 1.2, rd));
    return y;
}

const meadowMask = (x, z, y, slope) => smoothstep(0.7, 0.4, slope) * smoothstep(9, 4, y) * smoothstep(-0.5, 0.8, y);

export function Mountains() {
    // Лавина: склон трясёт, по долине идёт снежная пыль и камнепад
    const quake = useReversed('avalanche');
    const erupting = useReversed('volcano');
    const bare = useReversed('snowcap');
    const scree = useReversed('highlands');

    const tuftGeo = useMemo(() => new THREE.ConeGeometry(0.35, 0.8, 5).translate(0, 0.4, 0), []);
    const rockGeo = useMemo(() => new THREE.DodecahedronGeometry(0.6, 0), []);
    const llamaGeo = useMemo(() => mergeParts([
        { geo: new THREE.BoxGeometry(0.9, 0.5, 0.4), color: '#f2ece0', pos: [0, 1, 0] },
        { geo: new THREE.BoxGeometry(0.2, 0.8, 0.2), color: '#f2ece0', pos: [0.45, 1.5, 0] },
        { geo: new THREE.BoxGeometry(0.1, 0.8, 0.1), color: '#d8cfc0', pos: [0.3, 0.4, 0.12] },
        { geo: new THREE.BoxGeometry(0.1, 0.8, 0.1), color: '#d8cfc0', pos: [-0.3, 0.4, -0.12] },
    ]), []);
    const plainMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), []);
    const mat = useVertexMaterial();

    const { tufts, rocks, llamas } = useMemo(() => {
        const rand = seededRandom(0x3a7);
        const e = 0.6;
        const slopeAt = (x, z) => Math.hypot(
            mountainHeight(x + e, z) - mountainHeight(x - e, z),
            mountainHeight(x, z + e) - mountainHeight(x, z - e),
        ) / (2 * e);
        const tufts = scatter(rand, 900, [-60, 60], [-30, 28], (x, z) => meadowMask(x, z, mountainHeight(x, z), slopeAt(x, z)) > 0.5 && Math.abs(z - valleyRiver(x)) > 3.5)
            .map(([x, z]) => {
                const k = 0.6 + rand() * 0.8;
                const flower = rand() < 0.25;
                return { p: [x, mountainHeight(x, z) - 0.05, z], s: [k, k, k], r: rand() * 6.28, c: flower ? ['#ffd84a', '#b36bff', '#ff6a8a'][Math.floor(rand() * 3)] : new THREE.Color().setHSL(0.24 + rand() * 0.06, 0.5, 0.3), d: rand() };
            });
        const rocks = scatter(rand, 500, [-60, 60], [-30, 28], (x, z) => meadowMask(x, z, mountainHeight(x, z), slopeAt(x, z)) > 0.3)
            .map(([x, z]) => {
                const k = 0.4 + rand() * 1.1;
                return { p: [x, mountainHeight(x, z), z], s: [k, k * 0.7, k], r: rand() * 6.28, c: new THREE.Color().setHSL(0.08, 0.06, 0.42 + rand() * 0.15), d: rand() };
            });
        const llamas = scatter(rand, 9, [4, 26], [-2, 20], (x, z) => meadowMask(x, z, mountainHeight(x, z), slopeAt(x, z)) > 0.5)
            .map(([x, z]) => ({ p: [x, mountainHeight(x, z), z], s: [1, 1, 1], r: rand() * 6.28, c: '#ffffff', d: rand() }));
        return { tufts, rocks, llamas };
    }, []);

    const paint = (x, z, y, slope, c) => {
        const n = fbm(x * 0.15, z * 0.15, 3, 74);
        const rock = new THREE.Color().setHSL(0.07 + n * 0.02, 0.12, 0.3 + n * 0.08);
        const meadow = new THREE.Color().setHSL(0.22 + n * 0.04, 0.45, 0.28 + n * 0.05);
        const snow = new THREE.Color().setHSL(0.58, 0.15, 0.9);
        const m = meadowMask(x, z, y, slope);
        c.base.copy(rock).lerp(meadow, m);
        c.alt.copy(c.base);
        // Снеговая линия: 13 в обычном климате, 25 — когда ледники ушли
        const snowLine = smoothstep(12 + n * 3, 15 + n * 3, y) * smoothstep(1.6, 0.9, slope);
        const highSnow = smoothstep(25 + n * 2, 28, y) * smoothstep(1.6, 0.9, slope);
        c.base.lerp(snow, snowLine);
        c.alt.lerp(snow, highSnow);
        c.region.setHSL(0.08, 0.05, 0.48 + n * 0.1);
        return m * 0.95;
    };

    const shakeRef = useRef();
    const shake = useRef(0);
    useFrame((state, delta) => {
        shake.current = THREE.MathUtils.damp(shake.current, quake ? 1 : 0, 1.5, Math.min(delta, 0.1));
        const g = shakeRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;
        const burst = 0.5 + 0.5 * Math.sin(t * 0.9);
        const a = shake.current * 0.14 * burst;
        g.position.set(Math.sin(t * 37) * a, Math.sin(t * 29) * a * 0.6, Math.cos(t * 41) * a);
    });

    const lavaPaths = useMemo(() => [[-1, 1], [0.6, 1], [1, -0.2], [-0.8, -0.6]].map(([dx, dz]) => {
        const pts = [];
        for (let i = 0; i <= 24; i += 1) {
            const r = 2 + i * 0.75;
            const x = VOLCANO.x + dx * r + Math.sin(i * 0.7) * 0.8;
            const z = VOLCANO.z + dz * r + 0.3 * i;
            pts.push([x, mountainHeight(x, z) + 0.3, z]);
        }
        return pts;
    }), []);

    return (
        <group>
            <Atmosphere
                sky={{
                    top: erupting ? '#4a3a3a' : '#2f6fb8',
                    horizon: erupting ? '#b0785a' : '#c6d6e6',
                    bottom: '#5a6470',
                    sunColor: erupting ? '#ff9a5a' : '#fff0d6',
                    sunDir: [-0.4, 0.55, -0.75],
                    haze: erupting ? 2.2 : 1,
                }}
                fog={{ color: erupting ? '#8a6a5a' : '#c3d2e2', near: 45, far: erupting ? 130 : 210 }}
                sun={{ position: [-30, 46, -30], color: erupting ? '#ffb080' : '#fff2e0', intensity: erupting ? 1.8 : 2.8 }}
                hemi={{ sky: '#d6e6ff', ground: '#4a4032', intensity: 0.7 }}
            />

            <group ref={shakeRef}>
                <Terrain height={mountainHeight} paint={paint} blend={bare ? 1 : 0} blend2={scree ? 1 : 0} segments={180} speed={0.6} flatShading />
                <Water level={bare ? -1.1 : 0} color={bare ? '#6a7a70' : '#4fa8c8'} amp={0.05} choppy={0.8} opacity={0.9} roughness={0.1} />
                <InstancedSet geometry={tuftGeo} material={plainMat} items={tufts} hidden={scree} castShadow={false} speed={0.8} />
                <InstancedSet geometry={rockGeo} material={plainMat} items={rocks} hidden={!scree} speed={0.8} />
                <InstancedSet geometry={llamaGeo} material={mat} items={llamas} hidden={scree} />

                {/* Кратер и лава */}
                <FadeMesh on={erupting} opacity={1} color="#ff5a1a" toneMapped={false} position={[VOLCANO.x, mountainHeight(VOLCANO.x, VOLCANO.z) + 0.6, VOLCANO.z]} rotation={[-Math.PI / 2, 0, 0]}>
                    <circleGeometry args={[2.6, 24]} />
                </FadeMesh>
                <Flow paths={lavaPaths} count={260} speed={0.012} amount={erupting ? 1 : 0} color="#ff6a1a" size={0.9} spread={0.6} seed={41} />

            </group>

            <GlowLight position={[VOLCANO.x, VOLCANO.h + 3, VOLCANO.z]} color="#ff6a2a" intensity={500} distance={90} on={erupting} flicker={1} />
            <Particles mode="rise" count={400} area={[5, 16, 5]} center={[VOLCANO.x, VOLCANO.h + 8, VOLCANO.z]} size={0.5} speed={7} color="#ffae4a" amount={erupting ? 1 : 0} opacity={0.95} seed={42} />
            <Particles mode="rise" count={220} area={[14, 40, 14]} center={[VOLCANO.x - 4, VOLCANO.h + 22, VOLCANO.z]} size={10} speed={3} wind={-6} color="#3a3230" amount={erupting ? 1 : 0} opacity={0.3} additive={false} seed={43} />
            <Particles mode="fall" count={600} area={[80, 30, 60]} center={[0, 14, -6]} size={0.18} speed={1.5} wind={-1} color="#6a5a50" amount={erupting ? 0.8 : 0} opacity={0.8} additive={false} seed={44} />
            <Particles mode="fall" count={300} area={[70, 16, 40]} center={[0, 10, -10]} size={0.35} speed={9} color="#8a7a6a" amount={quake ? 1 : 0} opacity={0.8} additive={false} seed={45} />
            {/* Снежная пыль лавины стекает со склонов в долину */}
            <Particles mode="drift" count={260} area={[60, 10, 30]} center={[-4, 7, -8]} size={6} speed={6} color="#f4f6fa" amount={quake ? 1 : 0} opacity={0.22} additive={false} seed={46} />
            <Flock count={3} formation="swarm" center={[-10, 22, -12]} radius={[18, 12]} color="#1e1e20" size={1.4} seed={12} speed={0.05} />

            <Marker id="avalanche" position={[-14, 12, -6]} color="#e8f0ff" reverseColor="#ff8a5a" />
            <Marker id="volcano" position={[VOLCANO.x, VOLCANO.h + 6, VOLCANO.z + 4]} color="#ffb070" reverseColor="#ff4a1a" />
            <Marker id="snowcap" position={[-20, 22, -24]} color="#ffffff" reverseColor="#c8a080" />
            <Marker id="highlands" position={[14, 5, 8]} color="#9dff8a" reverseColor="#b0a090" />
        </group>
    );
}
