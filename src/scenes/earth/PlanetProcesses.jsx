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

/**
 * Поднимающиеся частицы — пар над океаном и дым над городами. Позиция и
 * размер считаются в вершинном шейдере: клуб растёт и бледнеет с высотой,
 * а процессору не нужно каждый кадр переписывать буфер.
 */
const riseVertex = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uRise;
uniform float uScale;
uniform vec2 uSize;
attribute vec3 aNormal;
attribute vec3 aDrift;
attribute vec3 aSeed;   // фаза, скорость, разброс
varying float vAlpha;
varying float vH;
void main() {
    float h = fract(aSeed.x + uTime * aSeed.y);
    vec3 side = normalize(cross(aNormal, aDrift + vec3(0.0001)));
    vec3 p = aNormal * (uRadius + 0.05 + h * uRise) + aDrift * h + side * aSeed.z * (0.3 + h);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vH = h;
    vAlpha = smoothstep(0.0, 0.12, h) * pow(1.0 - h, 1.4);
    float px = mix(uSize.x, uSize.y, h) * uScale / max(0.001, -mv.z);
    vAlpha *= clamp(px / 1.5, 0.0, 1.0);
    gl_PointSize = max(px, 1.5);
}
`;

const riseFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uTop;
uniform float uOpacity;
varying float vAlpha;
varying float vH;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 2.6) * (1.0 - d) * vAlpha * uOpacity;
    gl_FragColor = vec4(mix(uColor, uTop, vH), a);
}
`;

function pointScale(state) {
    const fov = THREE.MathUtils.degToRad(state.camera.fov ?? 50);
    return (state.size.height * state.gl.getPixelRatio()) / (2 * Math.tan(fov / 2));
}

/** Облако поднимающихся частиц над списком точек поверхности. */
function Rising({ sites, perSite, radius, rise, size, color, top, opacity, speed, spread, on, seed, blending = THREE.NormalBlending }) {
    const level = useRef(on ? 1 : 0);
    const { normals, drifts, seeds, positions } = useMemo(() => {
        const rand = seededRandom(seed);
        const count = sites.length * perSite;
        const n = new Float32Array(count * 3);
        const d = new Float32Array(count * 3);
        const sd = new Float32Array(count * 3);
        let i = 0;
        sites.forEach((site) => {
            for (let k = 0; k < perSite; k += 1) {
                n.set([site.n.x, site.n.y, site.n.z], i * 3);
                d.set([site.drift.x, site.drift.y, site.drift.z], i * 3);
                sd.set([rand(), speed * (0.75 + rand() * 0.5), (rand() - 0.5) * spread], i * 3);
                i += 1;
            }
        });
        return { normals: n, drifts: d, seeds: sd, positions: new Float32Array(count * 3) };
    }, [sites, perSite, speed, spread, seed]);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uRadius: { value: radius },
        uRise: { value: rise },
        uScale: { value: 400 },
        uSize: { value: new THREE.Vector2(size[0], size[1]) },
        uColor: { value: new THREE.Color(color) },
        uTop: { value: new THREE.Color(top) },
        uOpacity: { value: opacity },
    }), [radius, rise, size, color, top, opacity]);

    const ref = useRef();
    useFrame((state, delta) => {
        level.current = damp(level.current, on ? 1 : 0, 0.9, Math.min(delta, 0.1));
        if (ref.current) ref.current.visible = level.current > 0.01;
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uScale.value = pointScale(state);
        uniforms.uOpacity.value = opacity * level.current;
    });

    return (
        <points ref={ref} raycast={() => null} frustumCulled={false}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                <bufferAttribute attach="attributes-aNormal" args={[normals, 3]} />
                <bufferAttribute attach="attributes-aDrift" args={[drifts, 3]} />
                <bufferAttribute attach="attributes-aSeed" args={[seeds, 3]} />
            </bufferGeometry>
            <shaderMaterial
                vertexShader={riseVertex}
                fragmentShader={riseFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={blending}
            />
        </points>
    );
}

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
    const sites = useMemo(() => {
        const rand = seededRandom(0xe7a9);
        return Array.from({ length: 140 }, () => {
            const lat = -32 + rand() * 64;
            const lon = -46 + rand() * 20 + (lat < -5 ? 12 : 0);
            return { n: latLonToVec3(lat, lon, 1), drift: new THREE.Vector3() };
        });
    }, []);
    return (
        <Rising
            sites={sites}
            perSite={3}
            radius={radius}
            rise={1.1}
            size={[0.08, 0.32]}
            color="#d8f1ff"
            top="#ffffff"
            opacity={0.35}
            speed={0.15}
            spread={0.15}
            on={!dry}
            seed={0xe7aa}
            blending={THREE.AdditiveBlending}
        />
    );
}

// ─── Давление: циклоны и блокада ────────────────────────────────────────────

const CYCLONES = [
    { lat: 19, lon: -56, size: 1.5, dir: 1 },   // ураган у Антильских островов
    { lat: 56, lon: -28, size: 1.9, dir: 1 },   // исландский минимум
    { lat: -46, lon: -22, size: 1.7, dir: -1 }, // в южном полушарии вращение обратное
];

const spiralVertex = /* glsl */ `
varying vec2 vUv;
void main() {
    vUv = uv * 2.0 - 1.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * Облачная спираль циклона: рукава закручиваются к глазу по
 * логарифмической спирали, шум рвёт их на клочья. Прежде это были 210
 * точек вдоль трёх линий — в кадре читалось как узор из бусин.
 */
const spiralFragment = /* glsl */ `
uniform float uTime;
uniform float uDir;
uniform float uLevel;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
    float r = length(vUv);
    if (r > 1.0) discard;
    float a = atan(vUv.y, vUv.x) * uDir;
    // Вращение быстрее у центра — как у настоящего вихря
    float swirl = a + log(r + 0.04) * 2.6 + uTime * (0.35 + 0.6 * (1.0 - r));
    float arms = 0.5 + 0.5 * cos(swirl * 3.0);
    vec2 q = vec2(cos(swirl), sin(swirl)) * r * 4.0;
    float n = vnoise(q * 1.8 + uTime * 0.1) * 0.6 + vnoise(q * 4.3) * 0.4;
    float cloud = smoothstep(0.3, 1.0, arms * 0.6 + n * 0.65);
    // Сплошная облачность вокруг глаза и ясный глаз в центре
    cloud = max(cloud, smoothstep(0.4, 0.12, r) * 0.8);
    cloud *= smoothstep(0.03, 0.09, r);
    cloud *= smoothstep(1.0, 0.35, r);
    gl_FragColor = vec4(vec3(0.96, 0.98, 1.0), cloud * 0.7 * uLevel);
}
`;

function Spiral({ radius, lat, lon, size, dir, fading }) {
    const meshRef = useRef();
    const { position, quaternion } = useMemo(() => {
        const p = latLonToVec3(lat, lon, radius + 0.12);
        return { position: p.toArray(), quaternion: surfaceQuaternion(p, new THREE.Quaternion()) };
    }, [radius, lat, lon]);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uDir: { value: dir },
        uLevel: { value: 1 },
    }), [dir]);
    const clock = useRef(0);
    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.1);
        const level = damp(uniforms.uLevel.value, fading ? 0 : 1, 1, dt);
        uniforms.uLevel.value = level;
        // При блокаде вихрь замедляется и рассеивается
        clock.current += dt * (0.2 + level);
        uniforms.uTime.value = clock.current;
        if (meshRef.current) meshRef.current.visible = level > 0.01;
    });
    return (
        <group position={position} quaternion={quaternion}>
            <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <planeGeometry args={[size * 2.6, size * 2.6]} />
                <shaderMaterial
                    vertexShader={spiralVertex}
                    fragmentShader={spiralFragment}
                    uniforms={uniforms}
                    transparent
                    depthWrite={false}
                />
            </mesh>
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
    const sites = useMemo(() => EMITTERS.map(([lat, lon]) => {
        const n = latLonToVec3(lat, lon, 1);
        // Ветер сносит шлейф на восток
        const drift = new THREE.Vector3(0, 1, 0).cross(n).normalize().multiplyScalar(1.3);
        return { n, drift };
    }), []);
    return (
        <Rising
            sites={sites}
            perSite={40}
            radius={radius}
            rise={0.9}
            size={[0.18, 0.95]}
            color="#6b5a46"
            top="#a39886"
            opacity={0.5}
            speed={0.12}
            spread={0.35}
            on={!clean}
            seed={0xd1e5}
        />
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
