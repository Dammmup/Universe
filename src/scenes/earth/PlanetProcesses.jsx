import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { greatCircleArc, latLonToVec3, seededRandom, surfaceQuaternion } from '../../lib/geo';
import { circleSprite } from '../../lib/sprites';
import { Flow, PathLine } from '../locations/kit';

/**
 * Процессы масштаба всей планеты — слой «Мезо-уровень 1: Планета».
 * Всё, что здесь нарисовано, живёт на реальных координатах: стыки плит идут
 * по Срединно-Атлантическому хребту и Андам, течения — по Гольфстриму и
 * Бенгельскому течению, дымы поднимаются над промышленными регионами.
 */

const damp = THREE.MathUtils.damp;

/** Ломаная из координат → точки на сфере, дуги большого круга между узлами. */
function sphericalPath(nodes, radius, segments = 6) {
    const out = [];
    for (let i = 0; i < nodes.length - 1; i += 1) {
        const arc = greatCircleArc(
            { lat: nodes[i][0], lon: nodes[i][1] },
            { lat: nodes[i + 1][0], lon: nodes[i + 1][1] },
            radius,
            0,
            segments,
        );
        (i === 0 ? arc : arc.slice(1)).forEach((v) => out.push([v.x, v.y, v.z]));
    }
    return out;
}

// ─── Тектоника ──────────────────────────────────────────────────────────────

const PLATE_BOUNDARIES = [
    // Срединно-Атлантический хребет: Атлантика раздвигается на 2,5 см в год
    [[72, -8], [64, -20], [55, -30], [45, -28], [35, -35], [25, -45], [15, -46], [5, -32], [0, -18], [-10, -13], [-22, -13], [-35, -16], [-47, -14], [-54, 0]],
    // Анды: океаническая плита Наска ныряет под Южную Америку
    [[10, -80], [0, -82], [-10, -80], [-20, -72], [-30, -73], [-40, -75], [-52, -76]],
    // Карибская плита
    [[19, -88], [17, -78], [19, -66], [15, -61], [11, -62]],
    // Альпийско-Гималайский пояс
    [[36, -10], [37, 5], [38, 15], [36, 26], [38, 40], [35, 55], [31, 70], [28, 85]],
    // Восточно-Африканский разлом: континент медленно рвётся надвое
    [[13, 42], [5, 38], [-5, 35], [-15, 34]],
    // Западное побережье Северной Америки — Тихоокеанское кольцо
    [[60, -148], [52, -132], [42, -126], [32, -117], [22, -107], [14, -95]],
];

export function PlateBoundaries({ radius, quaking }) {
    const paths = useMemo(() => PLATE_BOUNDARIES.map((b) => sphericalPath(b, radius + 0.06, 5)), [radius]);
    const all = useMemo(() => paths.flat(), [paths]);
    const lineMats = useRef([]);
    const pointsRef = useRef();
    const tex = useMemo(() => circleSprite(), []);
    const flash = useMemo(() => new Float32Array(36 * 3), []);
    const rand = useMemo(() => seededRandom(0x7ec7), []);
    const st = useRef({ level: quaking ? 1 : 0, next: 0 });
    const calm = useMemo(() => new THREE.Color('#ff9a4a'), []);
    const hot = useMemo(() => new THREE.Color('#ff3a1a'), []);

    useFrame((state, delta) => {
        const k = st.current;
        k.level = damp(k.level, quaking ? 1 : 0, 1.4, Math.min(delta, 0.1));
        const t = state.clock.elapsedTime;
        lineMats.current.forEach((m) => {
            if (!m) return;
            m.color.copy(calm).lerp(hot, k.level);
            m.opacity = 0.35 + k.level * (0.35 + Math.sin(t * 9) * 0.2);
        });
        const pts = pointsRef.current;
        if (!pts) return;
        pts.visible = k.level > 0.02;
        if (!pts.visible) return;
        // Толчки перескакивают по разломам: эпицентры меняются каждые 0,35 с
        if (t > k.next) {
            k.next = t + 0.35;
            for (let i = 0; i < 36; i += 1) {
                const p = all[Math.floor(rand() * all.length)];
                flash[i * 3] = p[0] * 1.004;
                flash[i * 3 + 1] = p[1] * 1.004;
                flash[i * 3 + 2] = p[2] * 1.004;
            }
            pts.geometry.attributes.position.needsUpdate = true;
        }
        pts.material.opacity = k.level * (0.5 + 0.5 * Math.abs(Math.sin(t * 14)));
    });

    return (
        <group>
            {paths.map((path, i) => (
                <line key={i} raycast={() => null}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[new Float32Array(path.flat()), 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial
                        ref={(el) => { lineMats.current[i] = el; }}
                        color="#ff9a4a"
                        transparent
                        opacity={0.4}
                        depthWrite={false}
                        toneMapped={false}
                        blending={THREE.AdditiveBlending}
                    />
                </line>
            ))}
            <points ref={pointsRef} raycast={() => null}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[flash, 3]} />
                </bufferGeometry>
                <pointsMaterial color="#ffb070" size={0.7} map={tex} alphaMap={tex} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
            </points>
        </group>
    );
}

// ─── Течения ────────────────────────────────────────────────────────────────

const WARM_CURRENTS = [
    // Гольфстрим и Северо-Атлантическое течение — отопление Европы
    [[24, -81], [30, -79], [36, -72], [40, -62], [45, -45], [50, -30], [56, -17], [63, -4], [69, 10]],
    // Бразильское течение
    [[-5, -34], [-15, -37], [-25, -44], [-35, -52], [-40, -52]],
    // Игольное течение у юга Африки
    [[-22, 38], [-30, 32], [-36, 24], [-39, 18]],
];

const COLD_CURRENTS = [
    // Канарское → Северное Пассатное: холодная вода уходит к Карибам
    [[43, -13], [33, -16], [24, -20], [16, -25], [12, -40], [14, -58], [18, -76]],
    // Бенгельское → Южное Пассатное
    [[-35, 16], [-26, 12], [-17, 9], [-6, 4], [-2, -12], [-4, -30]],
    // Лабрадорское
    [[64, -58], [56, -53], [48, -48], [42, -50]],
    // Антарктическое циркумполярное — самое мощное течение планеты
    [[-56, -100], [-57, -70], [-56, -40], [-54, -10], [-52, 20], [-50, 50]],
];

export function OceanCurrents({ radius, stagnant }) {
    const warm = useMemo(() => WARM_CURRENTS.map((c) => sphericalPath(c, radius + 0.07, 8)), [radius]);
    const cold = useMemo(() => COLD_CURRENTS.map((c) => sphericalPath(c, radius + 0.07, 8)), [radius]);
    return (
        <group>
            {warm.map((p, i) => <PathLine key={`w${i}`} points={p} color={stagnant ? '#6a6a5a' : '#ff7a4a'} opacity={0.22} />)}
            {cold.map((p, i) => <PathLine key={`c${i}`} points={p} color={stagnant ? '#6a6a5a' : '#4ab8ff'} opacity={0.22} />)}
            <Flow paths={warm} count={260} speed={stagnant ? 0 : 0.05} amount={stagnant ? 0.3 : 1} color={stagnant ? '#8a8474' : '#ff9a5a'} size={0.16} spread={0.12} seed={201} />
            <Flow paths={cold} count={320} speed={stagnant ? 0 : 0.05} amount={stagnant ? 0.3 : 1} color={stagnant ? '#8a8474' : '#7fd4ff'} size={0.16} spread={0.12} seed={202} />
        </group>
    );
}

// ─── Круговорот воды ────────────────────────────────────────────────────────

/**
 * Испарение: над Атлантикой поднимаются струйки пара и тают на высоте
 * облаков. Точки — на самой воде: коробка координат лежит между Америками
 * и Африкой, где на этих широтах суши нет.
 */
export function Evaporation({ radius, dry }) {
    const COUNT = 420;
    const ref = useRef();
    const tex = useMemo(() => circleSprite(), []);
    const data = useMemo(() => {
        const rand = seededRandom(0xe7a9);
        return Array.from({ length: COUNT }, () => {
            const lat = -32 + rand() * 64;
            const lon = -46 + rand() * 20 + (lat < -5 ? 12 : 0);
            return { dir: latLonToVec3(lat, lon, 1), phase: rand(), speed: 0.12 + rand() * 0.1 };
        });
    }, []);
    const positions = useMemo(() => new Float32Array(COUNT * 3), []);
    const level = useRef(dry ? 0 : 1);

    useFrame((state, delta) => {
        const pts = ref.current;
        if (!pts) return;
        level.current = damp(level.current, dry ? 0 : 1, 1, Math.min(delta, 0.1));
        pts.visible = level.current > 0.01;
        pts.material.opacity = 0.55 * level.current;
        if (!pts.visible) return;
        const t = state.clock.elapsedTime;
        data.forEach((p, i) => {
            const h = ((t * p.speed + p.phase) % 1) * 1.1;
            const r = radius + 0.05 + h;
            positions[i * 3] = p.dir.x * r;
            positions[i * 3 + 1] = p.dir.y * r;
            positions[i * 3 + 2] = p.dir.z * r;
        });
        pts.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#bfe8ff" size={0.12} map={tex} alphaMap={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </points>
    );
}

// ─── Давление: циклоны и блокада ────────────────────────────────────────────

const CYCLONES = [
    { lat: 19, lon: -56, size: 1.5, dir: 1 },   // ураган у Антильских островов
    { lat: 56, lon: -28, size: 1.9, dir: 1 },   // исландский минимум
    { lat: -46, lon: -22, size: 1.7, dir: -1 }, // в южном полушарии вращение обратное
];

function Spiral({ radius, lat, lon, size, dir, fading }) {
    const spinRef = useRef();
    const matRef = useRef();
    const tex = useMemo(() => circleSprite(), []);
    const { position, quaternion } = useMemo(() => {
        const p = latLonToVec3(lat, lon, radius + 0.22);
        return { position: p.toArray(), quaternion: surfaceQuaternion(p, new THREE.Quaternion()) };
    }, [radius, lat, lon]);
    const points = useMemo(() => {
        const arr = [];
        const rand = seededRandom(Math.floor((lat + 90) * 97 + lon));
        for (let arm = 0; arm < 3; arm += 1) {
            for (let i = 0; i < 70; i += 1) {
                const t = i / 70;
                const a = t * Math.PI * 3.2 + (arm * Math.PI * 2) / 3;
                const r = (0.12 + t) * size;
                const j = (rand() - 0.5) * 0.18 * size;
                arr.push(Math.cos(a) * r + j, 0, Math.sin(a) * r * dir + j);
            }
        }
        return new Float32Array(arr);
    }, [size, dir, lat, lon]);
    const level = useRef(fading ? 0 : 1);
    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.1);
        level.current = damp(level.current, fading ? 0 : 1, 1, dt);
        if (spinRef.current) spinRef.current.rotation.y -= dt * 0.6 * dir * (0.2 + level.current);
        if (matRef.current) matRef.current.opacity = 0.75 * level.current;
        if (spinRef.current) spinRef.current.visible = level.current > 0.01;
    });
    return (
        <group position={position} quaternion={quaternion}>
            <group ref={spinRef}>
                <points raycast={() => null}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[points, 3]} />
                    </bufferGeometry>
                    <pointsMaterial ref={matRef} color="#f4f8ff" size={0.22} map={tex} alphaMap={tex} transparent depthWrite={false} />
                </points>
            </group>
        </group>
    );
}

/** Купол жары над Европой — застрявший антициклон при блокаде. */
function HeatDome({ radius, on }) {
    const ref = useRef();
    const level = useRef(on ? 1 : 0);
    const { position, quaternion } = useMemo(() => {
        const p = latLonToVec3(47, 12, radius + 0.1);
        return { position: p.toArray(), quaternion: surfaceQuaternion(p, new THREE.Quaternion()) };
    }, [radius]);
    useFrame((state, delta) => {
        const m = ref.current;
        if (!m) return;
        level.current = damp(level.current, on ? 1 : 0, 1, Math.min(delta, 0.1));
        m.visible = level.current > 0.01;
        m.material.opacity = level.current * (0.35 + Math.sin(state.clock.elapsedTime * 1.8) * 0.1);
    });
    return (
        <group position={position} quaternion={quaternion}>
            <mesh ref={ref} scale={[1, 0.35, 1]} raycast={() => null}>
                <sphereGeometry args={[2.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
                <meshBasicMaterial color="#ff6a2a" transparent opacity={0} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
}

export function PressureSystems({ radius, blocked }) {
    return (
        <group>
            {CYCLONES.map((c) => <Spiral key={`${c.lat}:${c.lon}`} radius={radius} {...c} fading={blocked} />)}
            <HeatDome radius={radius} on={blocked} />
        </group>
    );
}

// ─── Выбросы ────────────────────────────────────────────────────────────────

const EMITTERS = [
    [40.7, -74], [41.9, -87.6], [29.8, -95.4], [51.4, 7], [52.2, 21], [50.1, 14.4],
    [53.5, -2.2], [30, 31.2], [6.5, 3.4], [-26.2, 28], [-23.5, -46.6], [19.4, -99.1],
];

/**
 * Дымовые шлейфы: каждая точка поднимается по нормали и сносится ветром
 * на восток — так выглядят шлейфы на спутниковых снимках.
 */
export function Emissions({ radius, clean }) {
    const PER = 34;
    const ref = useRef();
    const tex = useMemo(() => circleSprite(), []);
    const sites = useMemo(() => EMITTERS.map(([lat, lon]) => {
        const n = latLonToVec3(lat, lon, 1);
        const east = new THREE.Vector3(0, 1, 0).cross(n).normalize();
        return { n, east };
    }), []);
    const data = useMemo(() => {
        const rand = seededRandom(0xd1e5);
        return sites.flatMap((_, si) => Array.from({ length: PER }, () => ({ si, phase: rand(), jitter: (rand() - 0.5) * 0.3 })));
    }, [sites]);
    const positions = useMemo(() => new Float32Array(data.length * 3), [data]);
    const level = useRef(clean ? 0 : 1);
    const tmp = useMemo(() => new THREE.Vector3(), []);

    useFrame((state, delta) => {
        const pts = ref.current;
        if (!pts) return;
        level.current = damp(level.current, clean ? 0 : 1, 0.9, Math.min(delta, 0.1));
        pts.visible = level.current > 0.01;
        pts.material.opacity = 0.6 * level.current;
        if (!pts.visible) return;
        const t = state.clock.elapsedTime;
        data.forEach((p, i) => {
            const s = sites[p.si];
            const h = (t * 0.12 + p.phase) % 1;
            tmp.copy(s.n).multiplyScalar(radius + 0.05 + h * 0.9).addScaledVector(s.east, h * 1.3 + p.jitter);
            positions[i * 3] = tmp.x;
            positions[i * 3 + 1] = tmp.y;
            positions[i * 3 + 2] = tmp.z;
        });
        pts.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#c2b49a" size={0.5} map={tex} alphaMap={tex} transparent depthWrite={false} />
        </points>
    );
}

// ─── Озоновый слой ──────────────────────────────────────────────────────────

const ozoneVertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
    vObj = normalize(position);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormalV = normalize(normalMatrix * normal);
    vViewV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
}
`;

const ozoneFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uDamageColor;
uniform float uHoleS;
uniform float uHoleN;
uniform float uDamage;
uniform float uTime;
varying vec3 vObj;
varying vec3 vNormalV;
varying vec3 vViewV;
void main() {
    float lat = vObj.y;
    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewV))), 2.4);
    // Дыры — полярные шапки, где слоя нет; по краю дыры светится ультрафиолет
    float edgeS = -1.0 + uHoleS;
    float edgeN = 1.0 - uHoleN;
    float keep = smoothstep(edgeS, edgeS + 0.12, lat) * (1.0 - smoothstep(edgeN - 0.12, edgeN, lat));
    float rim = exp(-pow((lat - edgeS) * 16.0, 2.0)) + exp(-pow((lat - edgeN) * 16.0, 2.0)) * step(0.02, uHoleN);
    float shimmer = 0.85 + 0.15 * sin(uTime * 1.3 + vObj.x * 9.0 + vObj.z * 7.0);
    vec3 col = mix(uColor, uDamageColor, uDamage);
    float a = (0.05 + fres * 0.5) * keep * shimmer;
    vec3 outCol = col * a + uDamageColor * rim * (0.25 + 0.6 * uDamage);
    gl_FragColor = vec4(outCol, a + rim * 0.3);
    #include <colorspace_fragment>
}
`;

export function OzoneShell({ radius, depleted }) {
    const matRef = useRef();
    const uniforms = useMemo(() => ({
        uColor: { value: new THREE.Color('#6f86ff') },
        uDamageColor: { value: new THREE.Color('#ff4fd8') },
        uHoleS: { value: 0.12 },
        uHoleN: { value: 0 },
        uDamage: { value: 0 },
        uTime: { value: 0 },
    }), []);
    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uHoleS.value = damp(uniforms.uHoleS.value, depleted ? 0.62 : 0.12, 0.7, dt);
        uniforms.uHoleN.value = damp(uniforms.uHoleN.value, depleted ? 0.3 : 0, 0.7, dt);
        uniforms.uDamage.value = damp(uniforms.uDamage.value, depleted ? 1 : 0, 0.7, dt);
    });
    return (
        <mesh raycast={() => null} scale={radius * 1.07}>
            <sphereGeometry args={[1, 96, 64]} />
            <shaderMaterial
                ref={matRef}
                vertexShader={ozoneVertex}
                fragmentShader={ozoneFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.FrontSide}
            />
        </mesh>
    );
}
