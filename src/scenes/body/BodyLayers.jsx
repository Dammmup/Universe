/* eslint-disable react-refresh/only-export-components -- подуровни тела и их общий хук отсечения живут вместе */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MUSCLE_GROUPS } from '../../lib/bodySdf';
import { createMuscleMaterial, createSkinMaterial, dampUniforms, makeGroupUniform, makeUniforms } from '../../lib/shaders/body';

/**
 * Подуровни тела: кожа, мышцы, кости, нервы и полупрозрачная оболочка для
 * внутренних слоёв. Органы живут в HumanBody.jsx — там их собственная анатомия.
 *
 * Переход между подуровнями — «снятие»: плоскость отсечения идёт сверху вниз,
 * уходящий слой исчезает над ней, появляющийся — проявляется. Так и выглядит
 * анатомический атлас, когда переворачиваешь прозрачную плёнку.
 */

export const BODY_TOP = 4.1;
export const BODY_BOTTOM = -3.9;
const damp = THREE.MathUtils.damp;

/**
 * Плоскость отсечения слоя. present — должен ли слой быть виден.
 * Появление и исчезновение идут одинаково сверху вниз.
 */
export function useClipPlane(present, speed = 1.3) {
    const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), BODY_TOP), []);
    const state = useRef({ p: present ? 1 : 0 });
    useFrame((_, delta) => {
        const k = state.current;
        k.p = damp(k.p, present ? 1 : 0, speed, Math.min(delta, 0.1));
        if (Math.abs(k.p - (present ? 1 : 0)) < 0.002) k.p = present ? 1 : 0;
        if (present) {
            // Проявление: видно всё выше линии, а линия идёт сверху вниз
            const c = THREE.MathUtils.lerp(BODY_TOP, BODY_BOTTOM, k.p);
            plane.normal.set(0, 1, 0);
            plane.constant = -c;
        } else {
            // Снятие: видно всё ниже линии, и она тоже идёт сверху вниз
            const c = THREE.MathUtils.lerp(BODY_BOTTOM, BODY_TOP, k.p);
            plane.normal.set(0, -1, 0);
            plane.constant = c;
        }
    });
    return { plane, state };
}

/** Светящееся кольцо на линии снятия — видно, где сейчас проходит граница слоёв. */
export function ScanRing({ sources, color = '#7fe0ff' }) {
    const ref = useRef();
    const tint = useMemo(() => new THREE.Color(), []);
    useFrame((state) => {
        const ring = ref.current;
        if (!ring) return;
        // Берём любой слой в движении — они всегда идут одной линией
        const moving = sources.find((s) => s.state.current.p > 0.01 && s.state.current.p < 0.99);
        ring.visible = !!moving;
        if (!moving) return;
        const y = moving.plane.normal.y > 0 ? -moving.plane.constant : moving.plane.constant;
        ring.position.y = y;
        tint.set(color);
        ring.material.color.copy(tint);
        ring.material.opacity = 0.55 + Math.sin(state.clock.elapsedTime * 20) * 0.1;
        const width = y > 2.6 ? 0.55 : (y > -0.1 ? 1.45 : 0.95);
        ring.scale.set(width, 1, 0.6);
    });
    return (
        <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={() => null}>
            <ringGeometry args={[0.92, 1, 64]} />
            <meshBasicMaterial transparent opacity={0.6} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} side={THREE.DoubleSide} />
        </mesh>
    );
}

// ─── Оболочка-призрак ───────────────────────────────────────────────────────

/**
 * Полупрозрачная кожа внутренних подуровней: силуэт остаётся, а органы,
 * кости и нервы видны насквозь. Смешивание минимумом — стыки частей фигуры
 * не темнеют полосами (см. README, «Калибровка тела»).
 */
export function GhostSkin({ geometry, present }) {
    const uniforms = useMemo(() => ({ uBackdrop: { value: new THREE.Color('#e9edf4') }, uSkinAlpha: { value: 0 } }), []);
    const material = useMemo(() => {
        const m = new THREE.MeshStandardMaterial({
            color: '#e8c3ab',
            emissive: '#553220',
            emissiveIntensity: 0.1,
            roughness: 0.34,
            transparent: true,
            depthWrite: false,
            blending: THREE.CustomBlending,
            blendEquation: THREE.MinEquation,
            blendSrc: THREE.OneFactor,
            blendDst: THREE.OneFactor,
        });
        m.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, uniforms);
            shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform vec3 uBackdrop;\nuniform float uSkinAlpha;')
                .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n\tgl_FragColor = vec4(mix(uBackdrop, gl_FragColor.rgb, uSkinAlpha), 1.0);');
        };
        m.customProgramCacheKey = () => 'ghost-skin';
        return m;
    }, [uniforms]);
    useEffect(() => () => material.dispose(), [material]);
    const groupRef = useRef();
    useFrame((_, delta) => {
        uniforms.uSkinAlpha.value = damp(uniforms.uSkinAlpha.value, present ? 0.3 : 0, 2, Math.min(delta, 0.1));
        if (groupRef.current) groupRef.current.visible = uniforms.uSkinAlpha.value > 0.01;
    });
    return (
        <group ref={groupRef}>
            <mesh geometry={geometry} material={material} raycast={() => null} />
        </group>
    );
}

// ─── Анимация мышц ──────────────────────────────────────────────────────────

const GI = Object.fromEntries(MUSCLE_GROUPS.map((g, i) => [g, i]));

/**
 * Состояние мышц → uniform групп (радиальный масштаб, масштаб вдоль оси,
 * дрожь). Один объект на кожу и мышцы: бицепс растёт и под кожей тоже.
 */
export function useMuscleGroups(rev) {
    const uniform = useMemo(() => makeGroupUniform(), []);
    const a = useRef({ size: 1, stretch: 1, flex: 1, cramp: 0 });
    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        const t = state.clock.elapsedTime;
        const k = a.current;
        k.size = damp(k.size, rev.hypertrophy ? 0.76 : 1.1, 1.2, dt);
        k.stretch = damp(k.stretch, rev.stretch ? 0.86 : 1.04, 1.1, dt);
        // Окостеневшая или парализованная мышца не сокращается
        k.flex = damp(k.flex, rev.movement || rev.ossification ? 0 : 1, 1.4, dt);
        k.cramp = damp(k.cramp, rev.cramp ? 1 : 0, 2, dt);
        const lift = Math.max(0, Math.sin(t * 2.2)) * k.flex;
        const tone = (phase) => 1 + Math.sin(t * 1.3 + phase) * 0.012 * k.flex;
        const g = uniform.value;
        g.forEach((v, i) => v.set(tone(i), 1, 0));
        // Бицепс: сокращение — короче и толще, как при подъёме гантели
        g[GI.biceps].set(k.size * (1 + lift * 0.2), 1 - lift * 0.1, 0);
        g[GI.thigh].set(2 - k.stretch, k.stretch, 0);
        g[GI.calf].set(1 + k.cramp * 0.1, 1 - k.cramp * 0.1, k.cramp);
    });
    return uniform;
}

// ─── Кожа ───────────────────────────────────────────────────────────────────

export function SkinLayer({ geometry, present, rev, clip, groups }) {
    const uniforms = useMemo(() => ({
        ...makeUniforms({ uBurn: 0, uHeat: 0, uWrinkle: 0, uScales: 0, uWound: 0, uScar: 0, uTouch: 1, uNumb: 0, uTime: 0 }),
        uGroup: groups,
    }), [groups]);
    const material = useMemo(() => createSkinMaterial(uniforms, { clippingPlanes: [clip.plane] }), [uniforms, clip.plane]);
    useEffect(() => () => material.dispose(), [material]);

    const groupRef = useRef();
    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        const t = state.clock.elapsedTime;
        uniforms.uTime.value = t;
        dampUniforms(uniforms, {
            uBurn: rev.uvShield ? 1 : 0,
            uHeat: rev.thermoregulation ? 1 : 0,
            uWrinkle: rev.elasticity ? 1 : 0,
            uScales: rev.ichthyosis ? 1 : 0,
            uScar: rev.healing ? 1 : 0,
            uTouch: rev.touch ? 0 : 1,
            uNumb: rev.touch ? 1 : 0,
        }, 1.2, dt);
        // Рана открывается и затягивается по кругу; при рубцевании остаётся грубый след
        const cycle = (t * 0.14) % 1;
        uniforms.uWound.value = rev.healing ? 0 : Math.max(0, 1 - cycle * 1.4);
        if (groupRef.current) groupRef.current.visible = clip.state.current.p > 0.001;
    });

    return (
        <group ref={groupRef}>
            <mesh geometry={geometry} material={material} castShadow receiveShadow raycast={() => null} />
            <Eyes clip={clip} />
            <SkinSteam on={!!rev.thermoregulation} visible={present} />
        </group>
    );
}

/** Глаза: белок, радужка и зрачок в глазницах — без них лицо было маской. */
function Eyes({ clip }) {
    const white = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#f4f1ec', roughness: 0.15, clearcoat: 1, clippingPlanes: [clip.plane] }), [clip.plane]);
    const iris = useMemo(() => new THREE.MeshStandardMaterial({ color: '#4a6a8a', roughness: 0.3, clippingPlanes: [clip.plane] }), [clip.plane]);
    const pupil = useMemo(() => new THREE.MeshBasicMaterial({ color: '#0a0a0c', clippingPlanes: [clip.plane] }), [clip.plane]);
    useEffect(() => () => [white, iris, pupil].forEach((m) => m.dispose()), [white, iris, pupil]);
    return (
        <group>
            {[-1, 1].map((s) => (
                <group key={s} position={[s * 0.12, 3.28, 0.3]}>
                    <mesh material={white} raycast={() => null}><sphereGeometry args={[0.047, 28, 20]} /></mesh>
                    <mesh material={iris} position={[0, 0, 0.038]} scale={[1, 1, 0.45]} raycast={() => null}><sphereGeometry args={[0.022, 24, 16]} /></mesh>
                    <mesh material={pupil} position={[0, 0, 0.046]} scale={[1, 1, 0.3]} raycast={() => null}><sphereGeometry args={[0.009, 12, 10]} /></mesh>
                </group>
            ))}
        </group>
    );
}

/** Жар от перегретого тела: пар поднимается с плеч и головы. */
function SkinSteam({ on, visible }) {
    const ref = useRef();
    const COUNT = 90;
    const data = useMemo(() => Array.from({ length: COUNT }, (_, i) => ({
        x: (Math.random() - 0.5) * 1.8,
        z: (Math.random() - 0.5) * 0.6,
        phase: i / COUNT,
    })), []);
    const positions = useMemo(() => new Float32Array(COUNT * 3), []);
    const level = useRef(0);
    useFrame((state, delta) => {
        const pts = ref.current;
        if (!pts) return;
        level.current = damp(level.current, on && visible ? 1 : 0, 1.2, Math.min(delta, 0.1));
        pts.visible = level.current > 0.01;
        pts.material.opacity = 0.35 * level.current;
        if (!pts.visible) return;
        const t = state.clock.elapsedTime;
        data.forEach((d, i) => {
            const h = (t * 0.25 + d.phase) % 1;
            positions[i * 3] = d.x * (1 - h * 0.3) + Math.sin(t + i) * 0.05;
            positions[i * 3 + 1] = 2.3 + h * 2.2;
            positions[i * 3 + 2] = d.z;
        });
        pts.geometry.attributes.position.needsUpdate = true;
    });
    return (
        <points ref={ref} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#ffffff" size={0.18} transparent depthWrite={false} />
        </points>
    );
}

// ─── Мышцы ──────────────────────────────────────────────────────────────────

export function MuscleLayer({ geometry, rev, clip, cover, groups }) {
    const uniforms = useMemo(() => ({
        ...makeUniforms({ uOssify: 0, uCramp: 0, uFatigue: 0, uPower: 1, uTime: 0 }),
        uGroup: groups,
    }), [groups]);
    const material = useMemo(() => createMuscleMaterial(uniforms, { clippingPlanes: [clip.plane] }), [uniforms, clip.plane]);
    useEffect(() => () => material.dispose(), [material]);
    const groupRef = useRef();

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        uniforms.uTime.value = state.clock.elapsedTime;
        dampUniforms(uniforms, {
            uOssify: rev.ossification ? 1 : 0,
            uCramp: rev.cramp ? 1 : 0,
            uFatigue: rev.endurance ? 1 : 0,
            uPower: rev.endurance || rev.movement ? 0 : 1,
        }, 0.9, dt);
        // Под целой кожей мышцы не видны — и не рисуются
        if (groupRef.current) groupRef.current.visible = clip.state.current.p > 0.001 && (!cover || cover.state.current.p < 0.999);
    });

    return (
        <group ref={groupRef}>
            <mesh geometry={geometry} material={material} castShadow raycast={() => null} />
        </group>
    );
}

// ─── Кости ──────────────────────────────────────────────────────────────────

const _up = new THREE.Vector3(0, 1, 0);

/** Капсула кости между двумя точками. */
function Bone({ a, b, r = 0.035, material, knobs = true }) {
    const { position, quaternion, length } = useMemo(() => {
        const va = new THREE.Vector3(...a);
        const vb = new THREE.Vector3(...b);
        const dir = vb.clone().sub(va);
        const len = dir.length();
        return {
            position: va.clone().add(vb).multiplyScalar(0.5).toArray(),
            quaternion: new THREE.Quaternion().setFromUnitVectors(_up, dir.normalize()),
            length: len,
        };
    }, [a, b]);
    return (
        <group position={position} quaternion={quaternion}>
            <mesh material={material} castShadow raycast={() => null}>
                <capsuleGeometry args={[r, Math.max(0.01, length - r * 2), 6, 14]} />
            </mesh>
            {knobs && (
                <>
                    <mesh material={material} position={[0, length / 2 - r * 0.6, 0]} scale={[1.7, 1.1, 1.4]} raycast={() => null}>
                        <sphereGeometry args={[r, 14, 10]} />
                    </mesh>
                    <mesh material={material} position={[0, -length / 2 + r * 0.6, 0]} scale={[1.7, 1.1, 1.4]} raycast={() => null}>
                        <sphereGeometry args={[r, 14, 10]} />
                    </mesh>
                </>
            )}
        </group>
    );
}

const TEETH = (() => {
    const list = [];
    [[3.03, 1], [2.97, -1]].forEach(([y, row]) => {
        for (let i = 0; i < 14; i += 1) {
            const a = ((i + 0.5) / 14 - 0.5) * Math.PI * 0.95;
            list.push({ pos: [Math.sin(a) * 0.19, y, 0.13 + Math.cos(a) * 0.17], row, delay: (i % 7) * 0.35 + (row < 0 ? 0.15 : 0) });
        }
    });
    return list;
})();

function spinePoint(t, scoliosis) {
    // t 0 — крестец, 1 — шея; естественные изгибы плюс боковая S-дуга сколиоза
    const y = 0.05 + t * 2.82;
    const z = -0.1 - Math.sin(t * Math.PI) * 0.2 + Math.sin(t * Math.PI * 2) * 0.04;
    const x = Math.sin(t * Math.PI * 2) * 0.16 * scoliosis;
    return new THREE.Vector3(x, y, z);
}

export function SkeletonLayer({ rev, clip }) {
    const boneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ece3cf', roughness: 0.55, clippingPlanes: [clip.plane] }), [clip.plane]);
    // Трубчатые кости полупрозрачны: сквозь них виден красный костный мозг
    const hollowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ece3cf', roughness: 0.55, transparent: true, opacity: 0.7, clippingPlanes: [clip.plane] }), [clip.plane]);
    const darkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a3430', roughness: 0.9, clippingPlanes: [clip.plane] }), [clip.plane]);
    const jointMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d8e6ee', roughness: 0.3, emissive: '#ff2a10', emissiveIntensity: 0, transparent: true, opacity: 0.85, clippingPlanes: [clip.plane] }), [clip.plane]);
    const marrowMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#b01828', emissive: '#a00a18', emissiveIntensity: 0.6, clippingPlanes: [clip.plane] }), [clip.plane]);
    const toothMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fbf7ec', roughness: 0.25, clippingPlanes: [clip.plane] }), [clip.plane]);
    const crackMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ff3a1a', transparent: true, opacity: 0, toneMapped: false, clippingPlanes: [clip.plane] }), [clip.plane]);
    useEffect(() => () => [boneMat, hollowMat, darkMat, jointMat, marrowMat, toothMat, crackMat].forEach((m) => m.dispose()), [boneMat, hollowMat, darkMat, jointMat, marrowMat, toothMat, crackMat]);

    const groupRef = useRef();
    const vertebraRefs = useRef([]);
    const toothRefs = useRef([]);
    const lowerTibia = useRef();
    const anim = useRef({ scol: 0, giant: 1, brittle: 0, arth: 0, frac: 0, anemia: 0, teeth: TEETH.map(() => ({ drop: 0, v: 0 })), teethT: 0 });
    const tints = useMemo(() => ({ bone: new THREE.Color('#ece3cf'), brittle: new THREE.Color('#a9a8a2'), marrow: new THREE.Color('#b01828'), pale: new THREE.Color('#d8c8c0') }), []);

    const ribs = useMemo(() => {
        const curves = [];
        const widths = [0.42, 0.52, 0.59, 0.64, 0.67, 0.68, 0.67, 0.64, 0.59, 0.52];
        widths.forEach((rx, i) => {
            const y = 2.3 - i * 0.085;
            const reach = i < 7 ? 0.86 : 0.7 - (i - 7) * 0.08;
            [-1, 1].forEach((side) => {
                const pts = [];
                for (let k = 0; k <= 14; k += 1) {
                    const phi = (k / 14) * Math.PI * reach;
                    pts.push(new THREE.Vector3(side * rx * Math.sin(phi), y - 0.16 * (k / 14), -0.3 * Math.cos(phi) + 0.02));
                }
                curves.push(new THREE.CatmullRomCurve3(pts));
            });
        });
        return curves;
    }, []);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        const a = anim.current;
        const t = state.clock.elapsedTime;
        a.scol = damp(a.scol, rev.posture ? 1 : 0, 1, dt);
        a.giant = damp(a.giant, rev.gigantism ? 1.12 : 1, 0.8, dt);
        a.brittle = damp(a.brittle, rev.skeleton ? 1 : 0, 1, dt);
        a.arth = damp(a.arth, rev.joints ? 1 : 0, 1.2, dt);
        a.frac = damp(a.frac, rev.fracture ? 1 : 0, 2.2, dt);
        a.anemia = damp(a.anemia, rev.marrow ? 1 : 0, 1, dt);

        const g = groupRef.current;
        if (g) {
            g.visible = clip.state.current.p > 0.001;
            // Гигантизм тянет скелет вверх от подошв
            g.scale.set(1 + (a.giant - 1) * 0.3, a.giant, 1 + (a.giant - 1) * 0.3);
            g.position.y = BODY_BOTTOM * (1 - a.giant) + 0.18 * (1 - a.giant);
        }
        boneMat.color.copy(tints.bone).lerp(tints.brittle, a.brittle);
        hollowMat.color.copy(boneMat.color);
        hollowMat.opacity = 0.7 - a.brittle * 0.2;
        jointMat.emissiveIntensity = a.arth * (1.2 + Math.sin(t * 3) * 0.6);
        marrowMat.color.copy(tints.marrow).lerp(tints.pale, a.anemia);
        marrowMat.emissiveIntensity = 0.6 * (1 - a.anemia) + Math.sin(t * 2) * 0.1 * (1 - a.anemia);
        crackMat.opacity = a.frac * (0.6 + Math.sin(t * 8) * 0.3);

        vertebraRefs.current.forEach((v, i) => {
            if (!v) return;
            const p = spinePoint(i / 23, a.scol);
            v.position.copy(p);
            const next = spinePoint(Math.min(1, (i + 1) / 23), a.scol);
            const prev = spinePoint(Math.max(0, (i - 1) / 23), a.scol);
            v.quaternion.setFromUnitVectors(_up, next.sub(prev).normalize());
        });

        // Зубы: при выпадении один за другим отделяются и падают вниз
        a.teethT = rev.teeth ? a.teethT + dt : 0;
        TEETH.forEach((tooth, i) => {
            const mesh = toothRefs.current[i];
            if (!mesh) return;
            const st = a.teeth[i];
            if (rev.teeth && a.teethT > tooth.delay) {
                st.v += 6 * dt;
                st.drop = Math.min(st.drop + st.v * dt, 7);
            } else if (!rev.teeth) {
                st.v = 0;
                st.drop = damp(st.drop, 0, 3, dt);
            }
            mesh.position.set(tooth.pos[0], tooth.pos[1] - st.drop, tooth.pos[2] + st.drop * 0.08);
            mesh.rotation.set(st.drop * 1.3, 0, st.drop * 0.9 * (i % 2 ? 1 : -1));
            mesh.visible = st.drop < 6.8;
        });

        if (lowerTibia.current) {
            lowerTibia.current.position.set(a.frac * 0.07, -a.frac * 0.05, a.frac * 0.03);
            lowerTibia.current.rotation.z = a.frac * 0.14;
        }
    });

    const R = -1; // правая сторона тела — −X

    return (
        <group ref={groupRef}>
            {/* Череп, глазницы, челюсть */}
            <mesh material={boneMat} position={[0, 3.42, -0.03]} scale={[0.4, 0.43, 0.47]} castShadow raycast={() => null}>
                <sphereGeometry args={[1, 40, 30]} />
            </mesh>
            {[-1, 1].map((s) => (
                <mesh key={s} material={darkMat} position={[s * 0.14, 3.3, 0.36]} scale={[0.085, 0.07, 0.05]} raycast={() => null}>
                    <sphereGeometry args={[1, 18, 12]} />
                </mesh>
            ))}
            <mesh material={darkMat} position={[0, 3.17, 0.41]} scale={[0.035, 0.06, 0.03]} raycast={() => null}>
                <sphereGeometry args={[1, 12, 10]} />
            </mesh>
            <mesh material={boneMat} position={[0, 2.99, 0.08]} rotation={[Math.PI / 2 + 0.2, 0, Math.PI]} scale={[1, 1.1, 1]} raycast={() => null}>
                <torusGeometry args={[0.2, 0.045, 10, 30, Math.PI]} />
            </mesh>
            {TEETH.map((tooth, i) => (
                <mesh key={i} ref={(el) => { toothRefs.current[i] = el; }} material={toothMat} position={tooth.pos} raycast={() => null}>
                    <boxGeometry args={[0.032, 0.05, 0.03]} />
                </mesh>
            ))}

            {/* Позвоночник: 24 позвонка, при искривлении — S-дуга сколиоза */}
            {Array.from({ length: 24 }, (_, i) => {
                const r = 0.11 - (i / 23) * 0.045;
                return (
                    <mesh key={i} ref={(el) => { vertebraRefs.current[i] = el; }} material={boneMat} raycast={() => null}>
                        <cylinderGeometry args={[r, r, 0.07, 14]} />
                    </mesh>
                );
            })}

            {/* Рёбра, грудина, ключицы, лопатки */}
            {ribs.map((curve, i) => (
                <mesh key={`rib${i}`} material={boneMat} raycast={() => null}>
                    <tubeGeometry args={[curve, 24, 0.02, 6, false]} />
                </mesh>
            ))}
            <mesh material={boneMat} position={[0, 2.02, 0.33]} rotation={[0.12, 0, 0]} raycast={() => null}>
                <boxGeometry args={[0.09, 0.62, 0.035]} />
            </mesh>
            {[-1, 1].map((s) => (
                <group key={`cl${s}`}>
                    <Bone a={[s * 0.07, 2.43, 0.17]} b={[s * 0.74, 2.37, -0.02]} r={0.022} material={boneMat} knobs={false} />
                    <mesh material={boneMat} position={[s * 0.46, 2.08, -0.34]} rotation={[0, s * -0.4, s * 0.15]} scale={[0.2, 0.27, 0.025]} raycast={() => null}>
                        <sphereGeometry args={[1, 16, 12]} />
                    </mesh>
                </group>
            ))}

            {/* Таз: крылья подвздошных костей, крестец, лобковый мост */}
            {/* Подвздошные кости — плоские крылья, раскрытые вперёд, как чаша */}
            {[-1, 1].map((s) => (
                <mesh key={`il${s}`} material={boneMat} position={[s * 0.3, 0.5, -0.06]} rotation={[0.35, s * 1.0, s * -0.35]} scale={[0.27, 0.22, 0.035]} raycast={() => null}>
                    <sphereGeometry args={[1, 28, 18]} />
                </mesh>
            ))}
            {/* Вертлужные впадины и седалищные бугры */}
            {[-1, 1].map((s) => (
                <mesh key={`ac${s}`} material={boneMat} position={[s * 0.26, 0.22, 0.02]} scale={[0.09, 0.14, 0.08]} raycast={() => null}>
                    <sphereGeometry args={[1, 16, 12]} />
                </mesh>
            ))}
            <mesh material={boneMat} position={[0, 0.3, -0.24]} scale={[0.12, 0.2, 0.07]} raycast={() => null}>
                <sphereGeometry args={[1, 16, 12]} />
            </mesh>
            <Bone a={[-0.2, 0.1, 0.16]} b={[0.2, 0.1, 0.16]} r={0.04} material={boneMat} />

            {/* Руки */}
            {[-1, 1].map((s) => (
                <group key={`arm${s}`}>
                    <Bone a={[s * 0.88, 2.22, 0]} b={[s * 1.05, 1.06, 0]} r={0.045} material={hollowMat} />
                    <mesh material={marrowMat} position={[s * 0.965, 1.64, 0]} rotation={[0, 0, s * 0.14]} raycast={() => null}>
                        <capsuleGeometry args={[0.018, 0.9, 4, 8]} />
                    </mesh>
                    <Bone a={[s * 1.07, 0.96, 0.02]} b={[s * 1.15, 0.1, 0.05]} r={0.025} material={boneMat} />
                    <Bone a={[s * 1.1, 0.95, -0.03]} b={[s * 1.18, 0.1, 0.0]} r={0.022} material={boneMat} />
                    {[-0.05, 0, 0.05, 0.1].map((dz, k) => (
                        <Bone key={k} a={[s * 1.18, -0.02, 0.02 + dz]} b={[s * 1.18, -0.55 + Math.abs(dz - 0.03) * 0.8, 0.04 + dz]} r={0.011} material={boneMat} knobs={false} />
                    ))}
                </group>
            ))}

            {/* Ноги: бедро с костным мозгом, голень — правая может сломаться */}
            {[-1, 1].map((s) => (
                <group key={`leg${s}`}>
                    <Bone a={[s * 0.3, 0.28, 0]} b={[s * 0.38, -1.52, 0.02]} r={0.055} material={hollowMat} />
                    <mesh material={marrowMat} position={[s * 0.34, -0.62, 0.01]} rotation={[0, 0, s * 0.045]} raycast={() => null}>
                        <capsuleGeometry args={[0.024, 1.4, 4, 8]} />
                    </mesh>
                    <mesh material={boneMat} position={[s * 0.38, -1.62, 0.12]} scale={[0.07, 0.07, 0.04]} raycast={() => null}>
                        <sphereGeometry args={[1, 14, 10]} />
                    </mesh>
                    {s === R ? (
                        <>
                            <Bone a={[s * 0.39, -1.72, 0.02]} b={[s * 0.38, -2.5, 0.01]} r={0.042} material={boneMat} />
                            <group ref={lowerTibia}>
                                <Bone a={[s * 0.38, -2.54, 0.01]} b={[s * 0.37, -3.38, -0.02]} r={0.042} material={boneMat} />
                            </group>
                            <mesh material={crackMat} position={[s * 0.385, -2.52, 0.02]} raycast={() => null}>
                                <sphereGeometry args={[0.09, 14, 10]} />
                            </mesh>
                        </>
                    ) : (
                        <Bone a={[s * 0.39, -1.72, 0.02]} b={[s * 0.37, -3.38, -0.02]} r={0.042} material={boneMat} />
                    )}
                    <Bone a={[s * 0.46, -1.76, -0.03]} b={[s * 0.44, -3.36, -0.05]} r={0.018} material={boneMat} />
                    <mesh material={boneMat} position={[s * 0.37, -3.62, 0.18]} scale={[0.09, 0.05, 0.3]} raycast={() => null}>
                        <sphereGeometry args={[1, 14, 10]} />
                    </mesh>
                </group>
            ))}

            {/* Суставы: при артрите воспаляются и пульсируют красным */}
            {[[0.88, 2.24, 0], [1.06, 1.0, 0], [1.16, 0.06, 0.03], [0.31, 0.3, 0], [0.38, -1.62, 0.02], [0.37, -3.42, -0.02]].flatMap(([x, y, z]) => [-1, 1].map((s) => (
                <mesh key={`j${x}${y}${s}`} material={jointMat} position={[s * x, y, z]} raycast={() => null}>
                    <sphereGeometry args={[0.07, 16, 12]} />
                </mesh>
            )))}
        </group>
    );
}

// ─── Нервы ──────────────────────────────────────────────────────────────────

const NERVE_PATHS = (() => {
    const L = [];
    [-1, 1].forEach((s) => {
        L.push({ id: `arm${s}`, kind: 'arm', side: s, pts: [[s * 0.1, 2.45, -0.18], [s * 0.6, 2.28, -0.02], [s * 0.95, 1.8, 0.04], [s * 1.04, 1.1, 0.05], [s * 1.12, 0.5, 0.06], [s * 1.17, 0.02, 0.06], [s * 1.18, -0.5, 0.07]] });
        L.push({ id: `leg${s}`, kind: 'leg', side: s, pts: [[s * 0.08, 0.35, -0.2], [s * 0.3, -0.1, -0.12], [s * 0.37, -0.9, -0.06], [s * 0.38, -1.6, -0.08], [s * 0.37, -2.5, -0.05], [s * 0.36, -3.3, -0.02], [s * 0.4, -3.62, 0.35]] });
        for (let i = 0; i < 5; i += 1) {
            const y = 2.2 - i * 0.16;
            L.push({ id: `ic${s}${i}`, kind: 'torso', side: s, pts: [[s * 0.04, y, -0.24], [s * 0.4, y - 0.04, -0.1], [s * 0.55, y - 0.08, 0.16], [s * 0.3, y - 0.12, 0.34]] });
        }
        L.push({ id: `eye${s}`, kind: 'eye', side: s, pts: [[s * 0.14, 3.3, 0.36], [s * 0.08, 3.3, 0.15], [0, 3.32, -0.05]] });
        L.push({ id: `ear${s}`, kind: 'ear', side: s, pts: [[s * 0.42, 3.22, 0], [s * 0.2, 3.25, -0.02]] });
    });
    return L.map((p) => ({ ...p, curve: new THREE.CatmullRomCurve3(p.pts.map((q) => new THREE.Vector3(...q))) }));
})();

const SPINAL = new THREE.CatmullRomCurve3([
    [0, 3.12, -0.08], [0, 2.86, -0.12], [0, 2.4, -0.26], [0, 1.9, -0.3], [0, 1.3, -0.3], [0, 0.7, -0.24], [0, 0.3, -0.18],
].map((q) => new THREE.Vector3(...q)));

/** Импульсы бегут по нервам; при блоке застревают, при синестезии переливаются всеми цветами. */
function Impulses({ curve, count = 6, speed = 0.4, color = '#1fa8ff', rainbow = false, reverse = false, stopAt = 1, size = 0.045 }) {
    const ref = useRef();
    const tmp = useMemo(() => new THREE.Object3D(), []);
    const c = useMemo(() => new THREE.Color(), []);
    useFrame((state) => {
        const mesh = ref.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < count; i += 1) {
            let u = (i / count + t * speed) % 1;
            u = Math.min(u, stopAt);
            const pos = curve.getPointAt(reverse ? 1 - u : u);
            tmp.position.copy(pos);
            tmp.scale.setScalar(u >= stopAt ? 0.4 : 1);
            tmp.updateMatrix();
            mesh.setMatrixAt(i, tmp.matrix);
            if (rainbow) c.setHSL((u + i * 0.13 + t * 0.2) % 1, 0.9, 0.6);
            else c.set(color);
            mesh.setColorAt(i, c);
        }
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
    return (
        <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false} raycast={() => null}>
            <sphereGeometry args={[size, 8, 6]} />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    );
}

/** Звуковые волны у ушей — слух работает. */
function SoundRings({ on }) {
    const refs = useRef([]);
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        refs.current.forEach((r, i) => {
            if (!r) return;
            const ph = (t * 0.8 + (i % 3) / 3) % 1;
            r.scale.setScalar(0.3 + ph * 1.4);
            r.material.opacity = on ? (1 - ph) * 0.6 : 0;
            r.visible = on;
        });
    });
    return (
        <group>
            {[-1, 1].flatMap((s) => [0, 1, 2].map((k) => (
                <mesh key={`${s}${k}`} ref={(el) => { refs.current[(s + 1) * 2 + k] = el; }} position={[s * 0.62, 3.22, 0]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
                    <ringGeometry args={[0.1, 0.115, 32]} />
                    <meshBasicMaterial color="#b89aff" transparent opacity={0} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
                </mesh>
            )))}
        </group>
    );
}

export function NerveLayer({ present, rev, clip, children }) {
    // На светлом фоне антропо-уровня бледно-жёлтые нервы терялись — насыщеннее и толще
    const nerveMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f0a020', emissive: '#e08a10', emissiveIntensity: 0.5, roughness: 0.4, clippingPlanes: [clip.plane] }), [clip.plane]);
    const cordMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#fff1c8', emissive: '#d0a040', emissiveIntensity: 0.5, roughness: 0.4, clippingPlanes: [clip.plane] }), [clip.plane]);
    const eyeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f4f8ff', emissive: '#3aa0ff', emissiveIntensity: 1, roughness: 0.2, clippingPlanes: [clip.plane] }), [clip.plane]);
    useEffect(() => () => [nerveMat, cordMat, eyeMat].forEach((m) => m.dispose()), [nerveMat, cordMat, eyeMat]);
    const groupRef = useRef();
    const blocked = !!rev.nerve;
    const rainbow = !!rev.synesthesia;

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.1);
        if (groupRef.current) groupRef.current.visible = clip.state.current.p > 0.001;
        nerveMat.emissiveIntensity = damp(nerveMat.emissiveIntensity, blocked ? 0.05 : 0.5, 1.2, dt);
        eyeMat.emissiveIntensity = damp(eyeMat.emissiveIntensity, rev.vision ? 0 : 1.1 + Math.sin(state.clock.elapsedTime * 2) * 0.2, 1.5, dt);
    });

    return (
        <group ref={groupRef}>
            {children}
            <mesh material={cordMat} raycast={() => null}>
                <tubeGeometry args={[SPINAL, 60, 0.035, 8, false]} />
            </mesh>
            <Impulses curve={SPINAL} count={10} speed={blocked ? 0.05 : (rev.reflex ? 0.12 : 0.45)} rainbow={rainbow} reverse />
            {NERVE_PATHS.map((p) => (
                <group key={p.id}>
                    <mesh material={nerveMat} raycast={() => null}>
                        <tubeGeometry args={[p.curve, 40, p.kind === 'torso' ? 0.012 : 0.022, 6, false]} />
                    </mesh>
                    {p.kind === 'arm' && p.side === -1 && !rev.pain ? (
                        // Боль: красные импульсы бегут из правой кисти к спинному мозгу
                        <Impulses curve={p.curve} count={7} speed={0.7} color="#ff3a2a" reverse rainbow={rainbow} size={0.036} />
                    ) : null}
                    {p.kind === 'arm' && !(p.side === -1 && !rev.pain) && (
                        <Impulses curve={p.curve} count={6} speed={blocked ? 0.04 : 0.35} stopAt={blocked ? 0.35 : 1} rainbow={rainbow} />
                    )}
                    {p.kind === 'leg' && p.side === 1 && (
                        // Коленный рефлекс: дуга колено → спинной мозг → мышца бедра
                        <Impulses curve={p.curve} count={8} speed={rev.reflex ? 0.1 : 0.9} color="#ff8a5a" rainbow={rainbow} stopAt={blocked ? 0.35 : 1} />
                    )}
                    {p.kind === 'leg' && p.side === -1 && (
                        <Impulses curve={p.curve} count={6} speed={blocked ? 0.04 : 0.3} stopAt={blocked ? 0.35 : 1} rainbow={rainbow} />
                    )}
                    {p.kind === 'torso' && <Impulses curve={p.curve} count={2} speed={blocked ? 0.02 : 0.25} rainbow={rainbow} size={0.02} />}
                    {p.kind === 'eye' && !rev.vision && <Impulses curve={p.curve} count={4} speed={0.8} color="#5fd4ff" rainbow={rainbow} size={0.024} />}
                    {p.kind === 'ear' && !rev.hearing && <Impulses curve={p.curve} count={3} speed={0.6} color="#b89aff" rainbow={rainbow} size={0.022} />}
                </group>
            ))}
            {[-1, 1].map((s) => (
                <mesh key={s} material={eyeMat} position={[s * 0.14, 3.3, 0.33]} raycast={() => null}>
                    <sphereGeometry args={[0.06, 20, 14]} />
                </mesh>
            ))}
            <SoundRings on={!rev.hearing && present} />
            {/* Вестибулярный аппарат — два светящихся завитка во внутреннем ухе */}
            {[-1, 1].map((s) => (
                <mesh key={`v${s}`} position={[s * 0.3, 3.24, -0.02]} rotation={[0, s * 0.6, 0]} raycast={() => null}>
                    <torusGeometry args={[0.04, 0.01, 8, 20]} />
                    <meshBasicMaterial color={rev.balance ? '#ff5a3a' : '#7fffd0'} toneMapped={false} />
                </mesh>
            ))}
        </group>
    );
}

/** Кликабельная обёртка: наведение подсвечивает, клик ведёт внутрь. */
export function Portal({ children, onEnter, label }) {
    const [hover, setHover] = useState(false);
    return (
        <group
            onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
            onClick={(e) => { e.stopPropagation(); onEnter(); }}
        >
            {children}
            {label ? label(hover) : null}
        </group>
    );
}
