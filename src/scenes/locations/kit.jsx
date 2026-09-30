/* eslint-disable react-refresh/only-export-components -- набор деталей диорам: компоненты и хуки живут вместе намеренно */
import React, { forwardRef, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useStore } from '../../store';
import { FACTORS_DATA } from '../../data/factors';
import { isEffectivelyReversed } from '../../data/consequences';
import { circleSprite } from '../../lib/sprites';
import { seededRandom } from '../../lib/geo';
import FactorMarker from '../effects/FactorMarker';

/**
 * Общие детали диорам: небо, рельеф, вода, инстансы, частицы.
 *
 * Все переходы здесь плавные. Реверс фактора не переключает картинку, а
 * перетекает в неё: цвета, масштабы и прозрачности демпфируются к цели. Резкая
 * подмена читалась бы как баг, а не как следствие решения зрителя.
 */

const damp = THREE.MathUtils.damp;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
    const t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
};

// ─── Хуки ───────────────────────────────────────────────────────────────────

/**
 * Действующее состояние фактора для картинки: перевёрнут сам или пришло эхо
 * с другого слоя (data/consequences.js).
 */
export const useReversed = (id) => useStore((s) => isEffectivelyReversed(s.reversedFactors, id));

/** Плавное значение 0↔1 вслед за флагом. Читается в useFrame через .current. */
export function useBlend(on, speed = 1.2) {
    const ref = useRef(on ? 1 : 0);
    useFrame((_, dt) => {
        ref.current = damp(ref.current, on ? 1 : 0, speed, Math.min(dt, 0.1));
    });
    return ref;
}

/**
 * Туман сцены. Ставится прямо на scene: fog внутри группы R3F повесил бы на
 * группу, где его никто не читает. Цвет и плотность меняются в кадре —
 * песчаная буря и пожар гасят дальний план.
 */
export function useSceneFog(color, near, far) {
    const scene = useThree((s) => s.scene);
    const fog = useMemo(() => new THREE.Fog(color, near, far), []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        const before = scene.fog;
        scene.fog = fog;
        return () => { scene.fog = before; };
    }, [scene, fog]);
    return fog;
}

// ─── Небо ───────────────────────────────────────────────────────────────────

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const skyFragment = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uSunSize;
uniform float uStars;
uniform float uHaze;
uniform float uTime;
varying vec3 vDir;

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = h > 0.0
        ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5))
        : mix(uHorizon, uBottom, pow(clamp(-h * 4.0, 0.0, 1.0), 0.7));

    // Солнце: диск, ореол и широкая дымка вокруг
    float s = max(dot(d, normalize(uSunDir)), 0.0);
    col += uSunColor * (pow(s, 1400.0 / uSunSize) * 5.0 + pow(s, 24.0) * 0.4 + pow(s, 3.0) * 0.18 * uHaze);

    // Звёзды гаснут к горизонту, где их съедает дымка
    vec3 cell = floor(d * 720.0);
    float st = hash(cell);
    float star = step(0.9982, st) * smoothstep(0.02, 0.3, h) * uStars;
    star *= 0.55 + 0.45 * sin(uTime * 1.7 + st * 90.0);
    col += vec3(0.9, 0.95, 1.0) * star * 1.6;

    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
}
`;

/**
 * Небесный купол с градиентом, солнцем и звёздами. Цели задаются пропсами,
 * uniform-ы тянутся к ним сами — смена дня на ночь занимает пару секунд.
 */
export function SkyDome({
    top = '#3f7fc4',
    horizon = '#bcd6ea',
    bottom = '#6a7a88',
    sunColor = '#ffe2b0',
    sunDir = [0.4, 0.35, -0.8],
    sunSize = 1,
    stars = 0,
    haze = 1,
    speed = 1.1,
}) {
    const matRef = useRef();
    const uniforms = useMemo(() => ({
        uTop: { value: new THREE.Color(top) },
        uHorizon: { value: new THREE.Color(horizon) },
        uBottom: { value: new THREE.Color(bottom) },
        uSunColor: { value: new THREE.Color(sunColor) },
        uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
        uSunSize: { value: sunSize },
        uStars: { value: stars },
        uHaze: { value: haze },
        uTime: { value: 0 },
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const targets = useMemo(() => ({
        top: new THREE.Color(), horizon: new THREE.Color(), bottom: new THREE.Color(),
        sun: new THREE.Color(), dir: new THREE.Vector3(),
    }), []);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        const k = 1 - Math.exp(-speed * dt);
        targets.top.set(top);
        targets.horizon.set(horizon);
        targets.bottom.set(bottom);
        targets.sun.set(sunColor);
        targets.dir.set(...sunDir).normalize();
        uniforms.uTop.value.lerp(targets.top, k);
        uniforms.uHorizon.value.lerp(targets.horizon, k);
        uniforms.uBottom.value.lerp(targets.bottom, k);
        uniforms.uSunColor.value.lerp(targets.sun, k);
        uniforms.uSunDir.value.lerp(targets.dir, k).normalize();
        uniforms.uSunSize.value = damp(uniforms.uSunSize.value, sunSize, speed, dt);
        uniforms.uStars.value = damp(uniforms.uStars.value, stars, speed, dt);
        uniforms.uHaze.value = damp(uniforms.uHaze.value, haze, speed, dt);
        uniforms.uTime.value = state.clock.elapsedTime;
    });

    return (
        <mesh frustumCulled={false} renderOrder={-10} raycast={() => null}>
            <sphereGeometry args={[520, 48, 24]} />
            <shaderMaterial
                ref={matRef}
                vertexShader={skyVertex}
                fragmentShader={skyFragment}
                uniforms={uniforms}
                side={THREE.BackSide}
                depthWrite={false}
                fog={false}
            />
        </mesh>
    );
}

/**
 * Небо как карта окружения: вода, стекло башен и мокрые листья отражают то
 * же небо, что видно в кадре. Без неё гладкая вода отражала пустоту и
 * выглядела пластиком. Карта пересобирается, когда небо меняет цвета
 * (ночь, буря, смог) — с задержкой, пока идёт перетекание.
 */
function SkyEnvironment({ top = '#3f7fc4', horizon = '#bcd6ea', bottom = '#6a7a88', sunColor = '#ffe2b0', sunDir = [0.4, 0.35, -0.8] }) {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const key = `${top}|${horizon}|${bottom}|${sunColor}|${sunDir.join(',')}`;
    useEffect(() => {
        let target = null;
        const timer = setTimeout(() => {
            const envScene = new THREE.Scene();
            const material = new THREE.ShaderMaterial({
                vertexShader: skyVertex,
                fragmentShader: skyFragment,
                side: THREE.BackSide,
                uniforms: {
                    uTop: { value: new THREE.Color(top) },
                    uHorizon: { value: new THREE.Color(horizon) },
                    uBottom: { value: new THREE.Color(bottom) },
                    uSunColor: { value: new THREE.Color(sunColor) },
                    uSunDir: { value: new THREE.Vector3(...sunDir).normalize() },
                    uSunSize: { value: 3 },
                    uStars: { value: 0 },
                    uHaze: { value: 1 },
                    uTime: { value: 0 },
                },
            });
            envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), material));
            const pmrem = new THREE.PMREMGenerator(gl);
            target = pmrem.fromScene(envScene, 0.02);
            scene.environment = target.texture;
            scene.environmentIntensity = 0.55;
            pmrem.dispose();
            material.dispose();
        }, 900);
        return () => {
            clearTimeout(timer);
            if (target) {
                if (scene.environment === target.texture) scene.environment = null;
                target.dispose();
            }
        };
        // Пересобираем только когда меняются цвета неба
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, gl, scene]);
    return null;
}

/** Солнечный свет с мягкими тенями на всю диораму. */
export const SunLight = forwardRef(function SunLight(
    { position = [30, 40, 20], color = '#fff1dc', intensity = 2.4, size = 44 },
    ref,
) {
    return (
        <directionalLight
            ref={ref}
            position={position}
            color={color}
            intensity={intensity}
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-size}
            shadow-camera-right={size}
            shadow-camera-top={size}
            shadow-camera-bottom={-size}
            shadow-camera-near={1}
            shadow-camera-far={160}
            shadow-bias={-0.0004}
            shadow-normalBias={0.05}
        />
    );
});

/**
 * Плавная подстройка света к цели: цвет и интенсивность. Свет в диорамах —
 * главный носитель настроения, и его смена (ночь, буря, пожар) должна
 * перетекать, а не щёлкать.
 */
export function useLightTween(ref, { color, intensity }, speed = 1.2) {
    const target = useMemo(() => new THREE.Color(), []);
    useFrame((_, delta) => {
        const light = ref.current;
        if (!light) return;
        const dt = Math.min(delta, 0.1);
        if (color) {
            target.set(color);
            light.color.lerp(target, 1 - Math.exp(-speed * dt));
        }
        if (intensity !== undefined) light.intensity = damp(light.intensity, intensity, speed, dt);
    });
}

// ─── Рельеф ─────────────────────────────────────────────────────────────────

/**
 * Патч стандартного материала: вершинный цвет перетекает между тремя
 * раскрасками. color2 — полная альтернативная палитра (засуха, снег),
 * color3 с маской в альфе — локальная (гарь, вырубка, лава).
 */
function patchTerrainMaterial(material, uniforms) {
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                '#include <common>\nattribute vec3 color2;\nattribute vec4 color3;\nuniform float uBlend;\nuniform float uBlend2;',
            )
            .replace(
                '#include <color_vertex>',
                '#include <color_vertex>\n\tvColor.rgb = mix(mix(color.rgb, color2, uBlend), color3.rgb, uBlend2 * color3.a);',
            );
    };
    material.customProgramCacheKey = () => 'terrain-blend';
}

/**
 * Рельеф диорамы.
 * height(x, z) — высота, paint(x, z, y, slope, c) — раскраска: c.base, c.alt
 * и c.region (THREE.Color). Возвращаемое число — маска региона 0..1.
 */
export function Terrain({
    size = 140,
    segments = 150,
    height,
    paint,
    blend = 0,
    blend2 = 0,
    speed = 0.9,
    roughness = 0.95,
    flatShading = false,
}) {
    const geometry = useMemo(() => {
        const geo = new THREE.PlaneGeometry(size, size, segments, segments);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        const n = pos.count;
        const base = new Float32Array(n * 3);
        const alt = new Float32Array(n * 3);
        const region = new Float32Array(n * 4);
        const c = { base: new THREE.Color(), alt: new THREE.Color(), region: new THREE.Color() };
        const e = 0.6;

        for (let i = 0; i < n; i += 1) {
            const x = pos.getX(i);
            const z = pos.getZ(i);
            const y = height(x, z);
            pos.setY(i, y);
            const slope = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e);

            c.alt.r = -1;
            c.region.r = -1;
            const mask = paint(x, z, y, slope, c) ?? 0;
            if (c.alt.r < 0) c.alt.copy(c.base);
            if (c.region.r < 0) c.region.copy(c.base);

            base[i * 3] = c.base.r; base[i * 3 + 1] = c.base.g; base[i * 3 + 2] = c.base.b;
            alt[i * 3] = c.alt.r; alt[i * 3 + 1] = c.alt.g; alt[i * 3 + 2] = c.alt.b;
            region[i * 4] = c.region.r; region[i * 4 + 1] = c.region.g; region[i * 4 + 2] = c.region.b;
            region[i * 4 + 3] = mask;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(base, 3));
        geo.setAttribute('color2', new THREE.BufferAttribute(alt, 3));
        geo.setAttribute('color3', new THREE.BufferAttribute(region, 4));
        geo.computeVertexNormals();
        return geo;
        // Рельеф строится один раз: функции высоты и раскраски статичны
    }, [size, segments]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => () => geometry.dispose(), [geometry]);

    const uniforms = useMemo(() => ({ uBlend: { value: blend }, uBlend2: { value: blend2 } }), []); // eslint-disable-line react-hooks/exhaustive-deps
    const material = useMemo(() => {
        const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, flatShading });
        patchTerrainMaterial(mat, uniforms);
        return mat;
    }, [uniforms, roughness, flatShading]);

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.1);
        uniforms.uBlend.value = damp(uniforms.uBlend.value, blend, speed, dt);
        uniforms.uBlend2.value = damp(uniforms.uBlend2.value, blend2, speed, dt);
    });

    return <mesh geometry={geometry} material={material} receiveShadow raycast={() => null} />;
}

// ─── Вода ───────────────────────────────────────────────────────────────────

/**
 * Водная гладь с волнами в вершинном шейдере. Нормаль считается из той же
 * функции волны — иначе блики стоят на месте, пока поверхность колышется.
 */
export function Water({
    size = 160,
    segments = 120,
    level = 0,
    color = '#1f6f9a',
    opacity = 0.86,
    amp = 0.25,
    choppy = 1,
    roughness = 0.18,
    speed = 0.8,
    position = [0, 0, 0],
    shape = null,
}) {
    const meshRef = useRef();
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uAmp: { value: amp }, uChop: { value: choppy } }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const material = useMemo(() => {
        const mat = new THREE.MeshStandardMaterial({
            color,
            roughness,
            metalness: 0.15,
            transparent: true,
            opacity,
        });
        mat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            const wave = /* glsl */ `
                uniform float uTime;
                uniform float uAmp;
                uniform float uChop;
                float waveH(vec2 p) {
                    return sin(p.x * 0.32 + uTime * 1.1) * 0.5
                        + sin(p.y * 0.41 - uTime * 0.85) * 0.35
                        + sin((p.x + p.y) * 0.9 + uTime * 2.0) * 0.18 * uChop
                        + sin((p.x - p.y * 1.3) * 1.7 + uTime * 2.7) * 0.08 * uChop;
                }
            `;
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', `#include <common>\n${wave}`)
                .replace(
                    '#include <beginnormal_vertex>',
                    `vec2 wp = position.xy;
                     float e = 0.35;
                     float dx = (waveH(wp + vec2(e, 0.0)) - waveH(wp - vec2(e, 0.0))) / (2.0 * e);
                     float dy = (waveH(wp + vec2(0.0, e)) - waveH(wp - vec2(0.0, e))) / (2.0 * e);
                     vec3 objectNormal = normalize(vec3(-dx * uAmp, -dy * uAmp, 1.0));
                     #ifdef USE_TANGENT
                     vec3 objectTangent = vec3(1.0, 0.0, 0.0);
                     #endif`,
                )
                .replace(
                    '#include <begin_vertex>',
                    'vec3 transformed = vec3(position.xy, position.z + waveH(position.xy) * uAmp);',
                );
        };
        mat.customProgramCacheKey = () => 'water-waves';
        return mat;
    }, [uniforms]); // eslint-disable-line react-hooks/exhaustive-deps

    const target = useMemo(() => new THREE.Color(), []);
    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uAmp.value = damp(uniforms.uAmp.value, amp, speed, dt);
        uniforms.uChop.value = damp(uniforms.uChop.value, choppy, speed, dt);
        target.set(color);
        material.color.lerp(target, 1 - Math.exp(-speed * dt));
        material.opacity = damp(material.opacity, opacity, speed, dt);
        const mesh = meshRef.current;
        if (mesh) {
            mesh.position.y = damp(mesh.position.y, position[1] + level, speed * 0.6, dt);
            mesh.visible = material.opacity > 0.01;
        }
    });

    return (
        <mesh
            ref={meshRef}
            position={[position[0], position[1] + level, position[2]]}
            rotation={[-Math.PI / 2, 0, 0]}
            material={material}
            receiveShadow
            raycast={() => null}
        >
            {shape ?? <planeGeometry args={[size, size, segments, segments]} />}
        </mesh>
    );
}

// ─── Инстансы ───────────────────────────────────────────────────────────────

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const P = new THREE.Vector3();
const S = new THREE.Vector3();
const C = new THREE.Color();

function toColor(value, fallback) {
    if (value instanceof THREE.Color) return value.clone();
    if (value === undefined || value === null) return fallback ? fallback.clone() : new THREE.Color('#ffffff');
    return new THREE.Color(value);
}

/**
 * Набор одинаковых объектов одним draw call.
 *
 * item: { p: [x,y,z], s: [sx,sy,sz], s2?, r?: yaw, tilt?: [x,z], c, c2?, d?: 0..1 }
 * blend — переход от s/c к s2/c2, hidden + hideFilter — исчезновение части
 * набора. d — задержка элемента: переходы идут волной, а не все разом.
 */
export function InstancedSet({
    geometry,
    material,
    items,
    blend = 0,
    hidden = false,
    hideFilter = null,
    speed = 0.9,
    castShadow = true,
    receiveShadow = true,
    onClick,
}) {
    const ref = useRef();
    const prepared = useMemo(() => items.map((it) => {
        const c = toColor(it.c);
        return {
            p: it.p,
            s: it.s ?? [1, 1, 1],
            s2: it.s2 ?? it.s ?? [1, 1, 1],
            r: it.r ?? 0,
            tilt: it.tilt ?? [0, 0],
            tilt2: it.tilt2 ?? it.tilt ?? [0, 0],
            c,
            c2: toColor(it.c2, c),
            d: it.d ?? 0,
            hideable: hideFilter ? hideFilter(it) : true,
        };
    }), [items]); // eslint-disable-line react-hooks/exhaustive-deps

    const progress = useRef({ b: blend, h: hidden ? 1 : 0, dirty: true });

    const write = () => {
        const mesh = ref.current;
        if (!mesh) return;
        const { b, h } = progress.current;
        for (let i = 0; i < prepared.length; i += 1) {
            const it = prepared[i];
            const bi = smooth(it.d * 0.55, it.d * 0.55 + 0.45, b);
            const vis = it.hideable ? 1 - smooth(it.d * 0.6, it.d * 0.6 + 0.4, h) : 1;
            E.set(
                it.tilt[0] + (it.tilt2[0] - it.tilt[0]) * bi,
                it.r,
                it.tilt[1] + (it.tilt2[1] - it.tilt[1]) * bi,
            );
            Q.setFromEuler(E);
            P.set(it.p[0], it.p[1], it.p[2]);
            S.set(
                (it.s[0] + (it.s2[0] - it.s[0]) * bi) * Math.max(vis, 0.0001),
                (it.s[1] + (it.s2[1] - it.s[1]) * bi) * Math.max(vis, 0.0001),
                (it.s[2] + (it.s2[2] - it.s[2]) * bi) * Math.max(vis, 0.0001),
            );
            M4.compose(P, Q, S);
            mesh.setMatrixAt(i, M4);
            C.copy(it.c).lerp(it.c2, bi);
            mesh.setColorAt(i, C);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
    };

    useLayoutEffect(() => {
        progress.current.dirty = true;
        write();
    }, [prepared]); // eslint-disable-line react-hooks/exhaustive-deps

    useFrame((_, delta) => {
        const dt = Math.min(delta, 0.1);
        const pr = progress.current;
        const nb = damp(pr.b, blend, speed, dt);
        const nh = damp(pr.h, hidden ? 1 : 0, speed, dt);
        if (Math.abs(nb - pr.b) > 1e-4 || Math.abs(nh - pr.h) > 1e-4 || pr.dirty) {
            pr.b = Math.abs(nb - blend) < 1e-3 ? blend : nb;
            pr.h = Math.abs(nh - (hidden ? 1 : 0)) < 1e-3 ? (hidden ? 1 : 0) : nh;
            pr.dirty = false;
            write();
        }
    });

    return (
        <instancedMesh
            ref={ref}
            args={[geometry, material, prepared.length]}
            castShadow={castShadow}
            receiveShadow={receiveShadow}
            raycast={onClick ? undefined : () => null}
            onClick={onClick}
            frustumCulled={false}
        />
    );
}

// ─── Окна зданий ────────────────────────────────────────────────────────────

/**
 * Материал фасада: сетка окон считается в шейдере по мировым координатам, так
 * что одна коробка даёт небоскрёб с тысячей окон без единой лишней вершины.
 * uLights гасит весь город (энергия), uLit — долю горящих окон (население).
 */
export function useWindowMaterial({
    windowColor = '#ffd9a0',
    lights = 1,
    lit = 0.55,
    cell = [0.24, 0.34],
    roughness = 0.62,
    metalness = 0.1,
    speed = 0.8,
    altColor = '#ff3b3b',
    alt = 0,
    flicker = 0,
}) {
    const uniforms = useMemo(() => ({
        uLights: { value: lights },
        uLit: { value: lit },
        uWinColor: { value: new THREE.Color(windowColor) },
        uAltColor: { value: new THREE.Color(altColor) },
        uAlt: { value: alt },
        uFlicker: { value: flicker },
        uCell: { value: new THREE.Vector2(...cell) },
        uTime: { value: 0 },
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

    const material = useMemo(() => {
        const mat = new THREE.MeshStandardMaterial({ roughness, metalness });
        mat.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
                .replace(
                    '#include <project_vertex>',
                    `#include <project_vertex>
                     #ifdef USE_INSTANCING
                        mat4 wm = modelMatrix * instanceMatrix;
                     #else
                        mat4 wm = modelMatrix;
                     #endif
                     vWPos = (wm * vec4(transformed, 1.0)).xyz;
                     vWNorm = normalize(mat3(wm) * objectNormal);`,
                );
            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    `#include <common>
                     varying vec3 vWPos;
                     varying vec3 vWNorm;
                     uniform float uLights;
                     uniform float uLit;
                     uniform vec3 uWinColor;
                     uniform vec3 uAltColor;
                     uniform float uAlt;
                     uniform float uFlicker;
                     uniform vec2 uCell;
                     uniform float uTime;
                     float winHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`,
                )
                .replace(
                    '#include <emissivemap_fragment>',
                    `#include <emissivemap_fragment>
                     {
                        float wall = 1.0 - step(0.6, abs(vWNorm.y));
                        vec2 facet = abs(vWNorm.x) > abs(vWNorm.z) ? vWPos.zy : vWPos.xy;
                        vec2 cellId = floor(facet / uCell);
                        vec2 f = fract(facet / uCell);
                        float frame = step(0.2, f.x) * step(f.x, 0.8) * step(0.24, f.y) * step(f.y, 0.76);
                        float h = winHash(cellId + floor(vWPos.xz * 0.37));
                        float on = step(1.0 - uLit, h);
                        float flick = 1.0 - uFlicker * step(0.6, fract(sin(uTime * 7.0 + h * 40.0) * 13.0));
                        float glass = frame * wall;
                        diffuseColor.rgb *= mix(1.0, 0.45, glass);
                        vec3 tone = mix(uWinColor, uAltColor, uAlt);
                        totalEmissiveRadiance += tone * glass * on * uLights * flick * (0.3 + 0.5 * winHash(cellId * 1.7));
                     }`,
                );
        };
        mat.customProgramCacheKey = () => 'facade-windows';
        return mat;
    }, [uniforms, roughness, metalness]);

    useEffect(() => () => material.dispose(), [material]);

    const tmp = useMemo(() => new THREE.Color(), []);
    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        uniforms.uLights.value = damp(uniforms.uLights.value, lights, speed, dt);
        uniforms.uLit.value = damp(uniforms.uLit.value, lit, speed, dt);
        uniforms.uAlt.value = damp(uniforms.uAlt.value, alt, speed, dt);
        uniforms.uFlicker.value = damp(uniforms.uFlicker.value, flicker, speed, dt);
        uniforms.uTime.value = state.clock.elapsedTime;
        tmp.set(windowColor);
        uniforms.uWinColor.value.lerp(tmp, 1 - Math.exp(-speed * dt));
    });

    return material;
}

// ─── Частицы ────────────────────────────────────────────────────────────────

/**
 * Облако частиц в объёме: дождь, снег, пыль, искры, светлячки, пузыри.
 * mode: fall | rise | drift | float. amount — видимость 0..1 (плавно).
 */
export function Particles({
    count = 400,
    area = [60, 20, 60],
    center = [0, 10, 0],
    mode = 'fall',
    speed = 4,
    wind = 0,
    color = '#ffffff',
    size = 0.25,
    amount = 1,
    opacity = 0.8,
    additive = true,
    seed = 1,
    fade = 0.9,
}) {
    const ref = useRef();
    const data = useMemo(() => {
        const rand = seededRandom(0x51ab + seed * 977);
        const pos = new Float32Array(count * 3);
        const base = new Float32Array(count * 3);
        const phase = new Float32Array(count);
        for (let i = 0; i < count; i += 1) {
            base[i * 3] = (rand() - 0.5) * area[0];
            base[i * 3 + 1] = (rand() - 0.5) * area[1];
            base[i * 3 + 2] = (rand() - 0.5) * area[2];
            pos[i * 3] = base[i * 3];
            pos[i * 3 + 1] = base[i * 3 + 1];
            pos[i * 3 + 2] = base[i * 3 + 2];
            phase[i] = rand() * Math.PI * 2;
        }
        return { pos, base, phase };
    }, [count, seed]); // eslint-disable-line react-hooks/exhaustive-deps

    const tex = useMemo(() => circleSprite(), []);
    const level = useRef(amount);
    const tint = useMemo(() => new THREE.Color(), []);

    useFrame((state, delta) => {
        const pts = ref.current;
        if (!pts) return;
        const dt = Math.min(delta, 0.05);
        level.current = damp(level.current, amount, fade, dt);
        pts.visible = level.current > 0.01;
        pts.material.opacity = level.current * opacity;
        tint.set(color);
        pts.material.color.lerp(tint, 1 - Math.exp(-dt * 1.5));
        if (!pts.visible) return;

        const t = state.clock.elapsedTime;
        const { pos, base, phase } = data;
        const hx = area[0] / 2;
        const hy = area[1] / 2;
        const hz = area[2] / 2;
        for (let i = 0; i < count; i += 1) {
            const k = i * 3;
            if (mode === 'fall') {
                pos[k + 1] -= speed * dt * (0.7 + (phase[i] % 1) * 0.6);
                pos[k] += wind * dt;
                if (pos[k + 1] < -hy) pos[k + 1] += area[1];
            } else if (mode === 'rise') {
                pos[k + 1] += speed * dt * (0.6 + (phase[i] % 1) * 0.8);
                pos[k] = base[k] + Math.sin(t * 0.8 + phase[i]) * 0.6 + wind * ((pos[k + 1] + hy) / area[1]) * 4;
                if (pos[k + 1] > hy) pos[k + 1] -= area[1];
            } else if (mode === 'drift') {
                pos[k] += speed * dt * (0.6 + (phase[i] % 1) * 0.8);
                pos[k + 1] = base[k + 1] + Math.sin(t * 1.3 + phase[i]) * 0.8;
                if (pos[k] > hx) pos[k] -= area[0];
            } else {
                pos[k] = base[k] + Math.sin(t * 0.5 * speed + phase[i]) * 1.4;
                pos[k + 1] = base[k + 1] + Math.sin(t * 0.7 * speed + phase[i] * 1.7) * 0.8;
                pos[k + 2] = base[k + 2] + Math.cos(t * 0.45 * speed + phase[i]) * 1.4;
            }
            if (pos[k] > hx) pos[k] -= area[0];
            if (pos[k] < -hx) pos[k] += area[0];
            if (pos[k + 2] > hz) pos[k + 2] -= area[2];
        }
        pts.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={ref} position={center} frustumCulled={false} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
            </bufferGeometry>
            <pointsMaterial
                color={color}
                size={size}
                map={tex}
                alphaMap={tex}
                transparent
                opacity={opacity * amount}
                depthWrite={false}
                sizeAttenuation
                blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
        </points>
    );
}

/** Косые штрихи ливня — точками дождь читается как снег. */
export function Rain({ count = 1400, area = [70, 30, 60], center = [0, 14, 0], amount = 1, color = '#cfe3ff', length = 0.9, speed = 26, wind = 3 }) {
    const ref = useRef();
    const data = useMemo(() => {
        const rand = seededRandom(0x7a17);
        const heads = new Float32Array(count * 3);
        const pos = new Float32Array(count * 6);
        for (let i = 0; i < count; i += 1) {
            heads[i * 3] = (rand() - 0.5) * area[0];
            heads[i * 3 + 1] = (rand() - 0.5) * area[1];
            heads[i * 3 + 2] = (rand() - 0.5) * area[2];
        }
        return { heads, pos };
    }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
    const level = useRef(amount);

    useFrame((_, delta) => {
        const seg = ref.current;
        if (!seg) return;
        const dt = Math.min(delta, 0.05);
        level.current = damp(level.current, amount, 0.9, dt);
        seg.visible = level.current > 0.01;
        seg.material.opacity = level.current * 0.45;
        if (!seg.visible) return;
        const { heads, pos } = data;
        const hy = area[1] / 2;
        const hx = area[0] / 2;
        const dx = (wind / speed) * length;
        for (let i = 0; i < count; i += 1) {
            const k = i * 3;
            heads[k + 1] -= speed * dt;
            heads[k] += wind * dt;
            if (heads[k + 1] < -hy) heads[k + 1] += area[1];
            if (heads[k] > hx) heads[k] -= area[0];
            const j = i * 6;
            pos[j] = heads[k]; pos[j + 1] = heads[k + 1]; pos[j + 2] = heads[k + 2];
            pos[j + 3] = heads[k] - dx; pos[j + 4] = heads[k + 1] + length; pos[j + 5] = heads[k + 2];
        }
        seg.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <lineSegments ref={ref} position={center} frustumCulled={false} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[data.pos, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={color} transparent opacity={0.4} depthWrite={false} />
        </lineSegments>
    );
}

// ─── Потоки по маршрутам ────────────────────────────────────────────────────

function preparePath(points) {
    const pts = points.map((p) => new THREE.Vector3(...p));
    const lengths = [0];
    for (let i = 1; i < pts.length; i += 1) lengths.push(lengths[i - 1] + pts[i].distanceTo(pts[i - 1]));
    return { pts, lengths, total: lengths[lengths.length - 1] };
}

function samplePath(path, t, out) {
    const d = (((t % 1) + 1) % 1) * path.total;
    let i = 1;
    while (i < path.lengths.length - 1 && path.lengths[i] < d) i += 1;
    const a = path.pts[i - 1];
    const b = path.pts[i];
    const seg = path.lengths[i] - path.lengths[i - 1] || 1;
    return out.copy(a).lerp(b, (d - path.lengths[i - 1]) / seg);
}

/**
 * Светящиеся точки, бегущие по маршрутам: машины, велосипеды, корабли,
 * течения. speed — целевая скорость (0 — пробка/застой), amount — видимость.
 */
export function Flow({
    paths,
    count = 200,
    speed = 0.04,
    color = '#ffe0a0',
    size = 0.35,
    amount = 1,
    spread = 0.25,
    seed = 3,
    loop = true,
    opacity = 0.95,
}) {
    const ref = useRef();
    const prepared = useMemo(() => paths.map(preparePath), [paths]);
    const data = useMemo(() => {
        const rand = seededRandom(0xf10e + seed * 131);
        return Array.from({ length: count }, () => ({
            path: Math.floor(rand() * prepared.length),
            t: rand(),
            v: 0.7 + rand() * 0.6,
            dir: loop || rand() > 0.5 ? 1 : -1,
            off: [(rand() - 0.5) * spread, (rand() - 0.5) * spread * 0.4, (rand() - 0.5) * spread],
        }));
    }, [count, prepared, spread, seed, loop]);
    const positions = useMemo(() => new Float32Array(count * 3), [count]);
    const tex = useMemo(() => circleSprite(), []);
    const state = useRef({ speed, amount });
    const tint = useMemo(() => new THREE.Color(), []);
    const tmp = useMemo(() => new THREE.Vector3(), []);

    useFrame((_, delta) => {
        const pts = ref.current;
        if (!pts || !prepared.length) return;
        const dt = Math.min(delta, 0.05);
        const st = state.current;
        st.speed = damp(st.speed, speed, 1.2, dt);
        st.amount = damp(st.amount, amount, 1.0, dt);
        pts.visible = st.amount > 0.01;
        pts.material.opacity = st.amount * opacity;
        tint.set(color);
        pts.material.color.lerp(tint, 1 - Math.exp(-dt * 1.5));
        if (!pts.visible) return;
        data.forEach((p, i) => {
            const path = prepared[p.path];
            p.t += (st.speed * p.v * p.dir * dt * 40) / Math.max(path.total, 1);
            samplePath(path, p.t, tmp);
            positions[i * 3] = tmp.x + p.off[0];
            positions[i * 3 + 1] = tmp.y + p.off[1];
            positions[i * 3 + 2] = tmp.z + p.off[2];
        });
        pts.geometry.attributes.position.needsUpdate = true;
    });

    if (!prepared.length) return null;

    return (
        <points ref={ref} frustumCulled={false} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial
                color={color}
                size={size}
                map={tex}
                alphaMap={tex}
                transparent
                depthWrite={false}
                sizeAttenuation
                toneMapped={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}

/** Тонкая светящаяся линия маршрута — дороги, пути, течения. */
export function PathLine({ points, color = '#ffffff', opacity = 0.25 }) {
    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
        return geo;
    }, [points]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return (
        <line geometry={geometry} raycast={() => null}>
            <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
        </line>
    );
}

/** Точечный источник, плавно разгорающийся и гаснущий (огонь, лава, неон). */
export function GlowLight({ position, color = '#ff7a2a', intensity = 30, on = true, distance = 30, flicker = 0 }) {
    const ref = useRef();
    const level = useRef(on ? 1 : 0);
    useFrame((state, delta) => {
        const light = ref.current;
        if (!light) return;
        level.current = damp(level.current, on ? 1 : 0, 1.1, Math.min(delta, 0.1));
        const f = flicker ? 1 + Math.sin(state.clock.elapsedTime * 13) * 0.12 * flicker + Math.sin(state.clock.elapsedTime * 29) * 0.08 * flicker : 1;
        light.intensity = intensity * level.current * f;
        light.visible = level.current > 0.01;
    });
    return <pointLight ref={ref} position={position} color={color} intensity={0} distance={distance} decay={1.6} />;
}

/**
 * Плоскость, плавно проявляющаяся и исчезающая: пятна гари, трещины, дымка.
 * Базовый материал — без освещения, чтобы свечение читалось само по себе.
 */
export function FadeMesh({ on, opacity = 1, speed = 1, children, additive = false, color = '#ffffff', toneMapped = true, ...props }) {
    const ref = useRef();
    const level = useRef(on ? 1 : 0);
    useFrame((_, delta) => {
        const mesh = ref.current;
        if (!mesh) return;
        level.current = damp(level.current, on ? 1 : 0, speed, Math.min(delta, 0.1));
        mesh.material.opacity = level.current * opacity;
        mesh.visible = level.current > 0.01;
    });
    return (
        <mesh ref={ref} raycast={() => null} {...props}>
            {children}
            <meshBasicMaterial
                color={color}
                transparent
                opacity={0}
                depthWrite={false}
                toneMapped={toneMapped}
                blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
            />
        </mesh>
    );
}

// ─── Метки факторов ─────────────────────────────────────────────────────────

/**
 * Метка фактора в диораме: подпись берётся из текстов фактора. Размер
 * подстраивается под расстояние до камеры — городские кадры сняты втрое
 * дальше лесных, и метка с постоянным размером превращалась в точку.
 */
export function Marker({ id, position, color = '#cfe6ff', reverseColor = '#7fd4ff', scale = 1.5 }) {
    const factor = FACTORS_DATA[id];
    const ref = useRef();
    const world = useMemo(() => new THREE.Vector3(), []);
    useFrame((state) => {
        const g = ref.current;
        if (!g) return;
        g.getWorldPosition(world);
        const k = THREE.MathUtils.clamp(world.distanceTo(state.camera.position) / 34, 0.8, 2.6);
        g.scale.setScalar(k);
    });
    if (!factor) return null;
    return (
        <group ref={ref} position={position}>
            <FactorMarker
                position={[0, 0, 0]}
                factorId={id}
                label={factor.name.toUpperCase()}
                reverseLabel={factor.reverseName.toUpperCase()}
                color={color}
                reverseColor={reverseColor}
                scale={scale}
                labelOffset={-0.8}
                hitRadius={1.6}
                onTop
            />
        </group>
    );
}

// ─── Геометрии ──────────────────────────────────────────────────────────────

/** Коробка с основанием в нуле: масштаб по Y растит здание вверх, а не в обе стороны. */
export function useBaseBox() {
    return useMemo(() => new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
}

/**
 * Склеивает части в одну геометрию с вершинным цветом: ствол и крона, башня
 * и шпиль. Цвет инстанса потом умножается на цвет части — крона перекрашивается
 * целиком, а ствол остаётся тёмным.
 * part: { geo, color, pos?: [x,y,z], rot?: [x,y,z], scale?: [x,y,z] }
 */
export function mergeParts(parts) {
    const geos = parts.map(({ geo, color = '#ffffff', pos, rot, scale }) => {
        let g = geo.index ? geo.toNonIndexed() : geo.clone();
        if (scale) g.scale(...scale);
        if (rot) {
            g.rotateX(rot[0]);
            g.rotateY(rot[1]);
            g.rotateZ(rot[2]);
        }
        if (pos) g.translate(...pos);
        const tint = new THREE.Color(color);
        const n = g.attributes.position.count;
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i += 1) {
            col[i * 3] = tint.r;
            col[i * 3 + 1] = tint.g;
            col[i * 3 + 2] = tint.b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        // Оставляем только общие атрибуты — иначе склейка откажется работать
        Object.keys(g.attributes).forEach((key) => {
            if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
        });
        return g;
    });
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    merged.computeBoundingSphere();
    return merged;
}

// ─── Стаи ───────────────────────────────────────────────────────────────────

/**
 * Стая птиц. Вожак идёт по эллипсу, остальные держат строй клином
 * (formation='v') или роем. scattered — строй распадается, каждая птица
 * уходит в свою сторону; gone — стая исчезает.
 */
export function Flock({
    count = 18,
    center = [0, 18, 0],
    radius = [30, 14],
    speed = 0.09,
    formation = 'v',
    scattered = false,
    gone = false,
    color = '#2a2a2a',
    size = 0.7,
    seed = 5,
    emissive = false,
}) {
    const ref = useRef();
    const geometry = useMemo(() => {
        // Два крыла, приподнятые галочкой: при взмахе масштаб по Y даёт движение
        const geo = new THREE.BufferGeometry();
        const v = new Float32Array([
            0, 0, 0.35, -1, 0.35, -0.1, 0, 0, -0.35,
            0, 0, 0.35, 0, 0, -0.35, 1, 0.35, -0.1,
        ]);
        geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
        geo.computeVertexNormals();
        return geo;
    }, []);
    const birds = useMemo(() => {
        const rand = seededRandom(0xb1e5 + seed * 71);
        return Array.from({ length: count }, (_, i) => {
            const row = Math.ceil(i / 2);
            const side = i === 0 ? 0 : (i % 2 ? 1 : -1);
            const swarm = [(rand() - 0.5) * 6, (rand() - 0.5) * 2.5, (rand() - 0.5) * 6];
            return {
                form: formation === 'v' ? [side * row * 1.2, 0, -row * 1.1] : swarm,
                wander: rand() * Math.PI * 2,
                wanderSpeed: 0.3 + rand() * 0.5,
                phase: rand() * 10,
                climb: (rand() - 0.5) * 10,
            };
        });
    }, [count, formation, seed]);
    const st = useRef({ t: seed * 1.3, scatter: scattered ? 1 : 0, life: gone ? 0 : 1 });
    const m = useMemo(() => new THREE.Matrix4(), []);
    const q = useMemo(() => new THREE.Quaternion(), []);
    const e = useMemo(() => new THREE.Euler(), []);
    const p = useMemo(() => new THREE.Vector3(), []);
    const s = useMemo(() => new THREE.Vector3(), []);

    useFrame((state, delta) => {
        const mesh = ref.current;
        if (!mesh) return;
        const dt = Math.min(delta, 0.05);
        const k = st.current;
        k.t += speed * dt;
        k.scatter = damp(k.scatter, scattered ? 1 : 0, 0.5, dt);
        k.life = damp(k.life, gone ? 0 : 1, 0.8, dt);
        mesh.visible = k.life > 0.01;
        if (!mesh.visible) return;
        const time = state.clock.elapsedTime;
        const lx = center[0] + Math.cos(k.t) * radius[0];
        const lz = center[2] + Math.sin(k.t) * radius[1];
        const ly = center[1] + Math.sin(k.t * 2) * 1.5;
        const heading = Math.atan2(-Math.sin(k.t) * radius[0], Math.cos(k.t) * radius[1]);
        const ch = Math.cos(heading);
        const sh = Math.sin(heading);

        birds.forEach((b, i) => {
            const fx = b.form[0] * ch + b.form[2] * sh;
            const fz = -b.form[0] * sh + b.form[2] * ch;
            const wa = b.wander + time * b.wanderSpeed;
            const spread = k.scatter * 22;
            p.set(
                lx + fx + Math.cos(wa) * spread,
                ly + b.form[1] + k.scatter * b.climb + Math.sin(wa * 1.3) * spread * 0.2,
                lz + fz + Math.sin(wa) * spread,
            );
            const yaw = heading + k.scatter * (wa - heading) * 0.8;
            e.set(0, yaw, 0);
            q.setFromEuler(e);
            const flap = 0.25 + 0.75 * Math.abs(Math.sin(time * 7 + b.phase));
            s.set(size * k.life, size * flap * k.life, size * k.life);
            m.compose(p, q, s);
            mesh.setMatrixAt(i, m);
        });
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={ref} args={[geometry, undefined, count]} frustumCulled={false} raycast={() => null}>
            {emissive
                ? <meshBasicMaterial color={color} side={THREE.DoubleSide} toneMapped={false} />
                : <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.8} />}
        </instancedMesh>
    );
}

/** Плавная подстройка тумана сцены к цели. */
export function useFogTween(fog, { color, near, far }, speed = 0.9) {
    const target = useMemo(() => new THREE.Color(), []);
    useFrame((_, delta) => {
        if (!fog) return;
        const dt = Math.min(delta, 0.1);
        target.set(color);
        fog.color.lerp(target, 1 - Math.exp(-speed * dt));
        fog.near = damp(fog.near, near, speed, dt);
        fog.far = damp(fog.far, far, speed, dt);
    });
}

/** Детерминированный ГПСЧ для раскладки объектов сцены. */
export { seededRandom };

// ─── Рамка диорамы ──────────────────────────────────────────────────────────

export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
    const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/** Общее время ветра для всех диорам — его ведёт Atmosphere. */
const WIND = { uWind: { value: 0 } };

/**
 * Материал с вершинным цветом. sway — сила ветра: крона качается тем
 * сильнее, чем выше вершина над основанием, у каждого экземпляра — своя фаза.
 * Без ветра лес стоял как макет из пластика.
 */
export function useVertexMaterial(props = {}, { sway = 0 } = {}) {
    return useMemo(() => {
        const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.85,
            flatShading: true,
            ...props,
        });
        if (sway > 0) {
            material.onBeforeCompile = (shader) => {
                shader.uniforms.uWind = WIND.uWind;
                shader.vertexShader = shader.vertexShader
                    .replace('#include <common>', '#include <common>\nuniform float uWind;')
                    .replace('#include <begin_vertex>', `#include <begin_vertex>
                        #ifdef USE_INSTANCING
                            vec2 seed = instanceMatrix[3].xz;
                        #else
                            vec2 seed = vec2(0.0);
                        #endif
                        float bend = max(0.0, transformed.y) * max(0.0, transformed.y) * ${(0.004 * sway).toFixed(4)};
                        float gust = sin(uWind * 1.3 + seed.x * 0.31 + seed.y * 0.17) + 0.4 * sin(uWind * 3.1 + seed.x * 0.9);
                        transformed.x += gust * bend;
                        transformed.z += cos(uWind * 1.1 + seed.y * 0.29) * bend * 0.6;`);
            };
            material.customProgramCacheKey = () => `vertex-sway-${sway}`;
        }
        return material;
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Разбрасывает точки по прямоугольнику, отбраковывая неподходящие места. */
export function scatter(rand, count, [x0, x1], [z0, z1], accept, tries = 8) {
    const out = [];
    for (let i = 0; i < count; i += 1) {
        for (let k = 0; k < tries; k += 1) {
            const x = lerp(x0, x1, rand());
            const z = lerp(z0, z1, rand());
            if (!accept || accept(x, z)) {
                out.push([x, z]);
                break;
            }
        }
    }
    return out;
}

export function Hemisphere({ sky, ground, intensity }) {
    const ref = useRef();
    const skyC = useMemo(() => new THREE.Color(), []);
    const groundC = useMemo(() => new THREE.Color(), []);
    useFrame((_, delta) => {
        const light = ref.current;
        if (!light) return;
        const k = 1 - Math.exp(-Math.min(delta, 0.1) * 1.1);
        skyC.set(sky);
        groundC.set(ground);
        light.color.lerp(skyC, k);
        light.groundColor.lerp(groundC, k);
        light.intensity += (intensity - light.intensity) * k;
    });
    return <hemisphereLight ref={ref} args={[sky, ground, intensity]} />;
}

/**
 * Общая рамка диорамы: небо, туман, солнце и заполняющий свет. Сцена
 * описывает только цели — перетекание делают хуки.
 */
export function Atmosphere({ sky, fog, sun, hemi }) {
    const fogObj = useSceneFog(fog.color, fog.near, fog.far);
    useFogTween(fogObj, fog);
    const sunRef = useRef();
    useLightTween(sunRef, { color: sun.color, intensity: sun.intensity });
    useFrame((state) => { WIND.uWind.value = state.clock.elapsedTime; });
    return (
        <>
            <SkyEnvironment top={sky.top} horizon={sky.horizon} bottom={sky.bottom} sunColor={sky.sunColor} sunDir={sky.sunDir} />
            <SkyDome {...sky} />
            <SunLight ref={sunRef} position={sun.position} color={sun.color} intensity={sun.intensity} />
            <Hemisphere {...hemi} />
        </>
    );
}

/**
 * Группа, плавно перетекающая к целевой позиции и масштабу. Нужна там, где
 * фактор двигает целый объект: толпа расходится по гетто, пирамиды уходят в песок.
 */
export function Tweened({ position = [0, 0, 0], scale = [1, 1, 1], speed = 0.8, children, ...props }) {
    const ref = useRef();
    const first = useRef(true);
    useFrame((_, delta) => {
        const g = ref.current;
        if (!g) return;
        if (first.current) {
            first.current = false;
            g.position.set(...position);
            g.scale.set(...scale);
            return;
        }
        const dt = Math.min(delta, 0.1);
        g.position.set(
            damp(g.position.x, position[0], speed, dt),
            damp(g.position.y, position[1], speed, dt),
            damp(g.position.z, position[2], speed, dt),
        );
        g.scale.set(
            Math.max(1e-4, damp(g.scale.x, scale[0], speed, dt)),
            Math.max(1e-4, damp(g.scale.y, scale[1], speed, dt)),
            Math.max(1e-4, damp(g.scale.z, scale[2], speed, dt)),
        );
    });
    return <group ref={ref} {...props}>{children}</group>;
}
