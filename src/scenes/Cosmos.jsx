import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { seededRandom } from '../lib/geo';
import { earthWorld } from '../lib/journey';
import { circleSprite, nebulaSprite, starSprite } from '../lib/sprites';
import {
    jupiterTexture,
    marsTexture,
    mercuryTexture,
    saturnRingsTexture,
    saturnTexture,
    venusTexture,
} from '../lib/planetTextures';
import {
    cometFragment,
    cometVertex,
    coronaFragment,
    coronaVertex,
    glowPointFragment,
    rimFragment,
    rimVertex,
    sunFragment,
    sunVertex,
    windVertex,
} from '../lib/shaders/cosmos';
import EarthGlobe from './earth/EarthGlobe';
import FactorMarker from './effects/FactorMarker';

const MOON_TEXTURE = '/textures/planets/moon_1024.jpg';

/**
 * Подпись, всегда повёрнутая к камере. Свободное вращение OrbitControls
 * позволяет зайти «за» объект — обычный Text там читается зеркально.
 */
function BillboardText({ position, children, ...textProps }) {
    return (
        <Billboard position={position}>
            <Text font="/Roboto-Regular.ttf" outlineColor="black" {...textProps}>
                {children}
            </Text>
        </Billboard>
    );
}

/** Пикселей на единицу размера на единичной дистанции — для точек в шейдере. */
function pointScale(state) {
    const fov = THREE.MathUtils.degToRad(state.camera.fov ?? 50);
    return (state.size.height * state.gl.getPixelRatio()) / (2 * Math.tan(fov / 2));
}

/** Ободок атмосферы: светится по краю шара, на дневной стороне. */
function rimUniforms(color, intensity, power, sunlit) {
    return {
        uColor: { value: new THREE.Color(color) },
        uIntensity: { value: intensity },
        uPower: { value: power },
        uSunlit: { value: sunlit },
    };
}

function Rim({ radius, color, intensity = 1.2, power = 3, sunlit = 1, scale = 1.04 }) {
    const uniforms = useMemo(
        () => rimUniforms(color, intensity, power, sunlit),
        [color, intensity, power, sunlit],
    );
    return (
        <mesh scale={scale} raycast={() => null}>
            <sphereGeometry args={[radius, 48, 32]} />
            <shaderMaterial
                vertexShader={rimVertex}
                fragmentShader={rimFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

// ═══════════════════════════════════════════════════════════
// ЗВЁЗДНОЕ НЕБО
// ═══════════════════════════════════════════════════════════

function StarShell({ count, seed, size, radiusRange, saturation, tex }) {
    const ref = useRef();

    const [positions, colors] = useMemo(() => {
        const rand = seededRandom(seed);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const color = new THREE.Color();

        for (let i = 0; i < count; i += 1) {
            const r = radiusRange[0] + rand() * (radiusRange[1] - radiusRange[0]);
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2 * rand() - 1);
            pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            pos[i * 3 + 2] = r * Math.cos(phi);

            const roll = rand();
            const hue = roll < 0.2 ? 0.58 : roll < 0.8 ? 0.12 : 0.03;
            color.setHSL(hue, saturation, 0.7 + rand() * 0.3);
            col[i * 3] = color.r;
            col[i * 3 + 1] = color.g;
            col[i * 3 + 2] = color.b;
        }
        return [pos, col];
    }, [count, seed, radiusRange, saturation]);

    useFrame((_, delta) => {
        if (ref.current) ref.current.rotation.y += delta * 0.003;
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                <bufferAttribute attach="attributes-color" args={[colors, 3]} />
            </bufferGeometry>
            <pointsMaterial
                size={size}
                vertexColors
                transparent
                opacity={0.95}
                depthWrite={false}
                sizeAttenuation
                blending={THREE.AdditiveBlending}
                map={tex}
                alphaMap={tex}
                alphaTest={0.01}
            />
        </points>
    );
}

/**
 * Млечный Путь: звёзды сгущаются в наклонный диск, как в настоящей галактике,
 * где Солнце сидит на краю одного из спиральных рукавов.
 */
function MilkyWay({ scattered, onSelect }) {
    const groupRef = useRef();
    const pointsRef = useRef();
    const tex = useMemo(() => starSprite(), []);

    const [positions, colors] = useMemo(() => {
        const count = 6000;
        const rand = seededRandom(0x9a1a);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const color = new THREE.Color();

        for (let i = 0; i < count; i += 1) {
            // Плотность падает от центра диска, толщина — по нормальному распределению
            const armSeed = rand();
            const radius = 60 + Math.pow(armSeed, 0.55) * 230;
            const spiral = radius * 0.018 + (rand() < 0.5 ? 0 : Math.PI);
            const angle = spiral + (rand() - 0.5) * 1.1;
            const thickness = (rand() + rand() + rand() - 1.5) * 18;

            pos[i * 3] = Math.cos(angle) * radius;
            pos[i * 3 + 1] = thickness;
            pos[i * 3 + 2] = Math.sin(angle) * radius;

            const roll = rand();
            color.setHSL(roll < 0.3 ? 0.6 : 0.1, 0.3, 0.55 + rand() * 0.35);
            col[i * 3] = color.r;
            col[i * 3 + 1] = color.g;
            col[i * 3 + 2] = color.b;
        }
        return [pos, col];
    }, []);

    useFrame((state, delta) => {
        if (groupRef.current) groupRef.current.rotation.y += delta * 0.004;
        const mat = pointsRef.current?.material;
        if (mat) {
            const target = scattered ? 0.12 : 0.6;
            mat.opacity += (target - mat.opacity) * Math.min(1, delta * 1.5);
            mat.size = scattered ? 2.6 : 1.5;
        }
    });

    return (
        <group ref={groupRef} rotation={[0.42, 0, 0.28]}>
            <points
                ref={pointsRef}
                onClick={(e) => { e.stopPropagation(); onSelect('galaxy'); }}
            >
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    <bufferAttribute attach="attributes-color" args={[colors, 3]} />
                </bufferGeometry>
                <pointsMaterial
                    size={1.5}
                    vertexColors
                    transparent
                    opacity={0.6}
                    depthWrite={false}
                    sizeAttenuation
                    blending={THREE.AdditiveBlending}
                    map={tex}
                    alphaMap={tex}
                    alphaTest={0.01}
                />
            </points>
        </group>
    );
}

/** Туманность как billboard-спрайт: газовое облако без стоимости прозрачной сферы. */
function Nebula({ position, color, size, rotation = 0 }) {
    const tex = useMemo(() => nebulaSprite(), []);
    return (
        <sprite position={position} scale={[size, size, 1]} rotation={[0, 0, rotation]}>
            <spriteMaterial
                map={tex}
                color={color}
                transparent
                opacity={0.7}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </sprite>
    );
}

// ═══════════════════════════════════════════════════════════
// СОЛНЦЕ
// ═══════════════════════════════════════════════════════════

/** Протуберанцы: петли плазмы, выгибающиеся над лимбом звезды. */
function SolarProminences({ dimmed }) {
    const groupRef = useRef();

    const loops = useMemo(() => {
        const rand = seededRandom(0x5011);
        return Array.from({ length: 7 }, () => ({
            angle: rand() * Math.PI * 2,
            tilt: (rand() - 0.5) * 1.2,
            scale: 0.7 + rand() * 0.8,
            speed: 0.15 + rand() * 0.25,
        }));
    }, []);

    useFrame((state) => {
        const group = groupRef.current;
        if (!group) return;
        const t = state.clock.elapsedTime;
        group.children.forEach((child, i) => {
            const loop = loops[i];
            const breathe = 1 + Math.sin(t * loop.speed * 3 + i) * 0.12;
            child.scale.setScalar(loop.scale * breathe * (dimmed ? 0.4 : 1));
            child.material.opacity = dimmed ? 0.1 : 0.32 + Math.sin(t * 2 + i) * 0.12;
        });
    });

    return (
        <group ref={groupRef}>
            {loops.map((loop, i) => (
                <mesh
                    key={i}
                    position={[
                        Math.cos(loop.angle) * 4.1,
                        Math.sin(loop.angle) * 4.1,
                        0,
                    ]}
                    rotation={[loop.tilt, 0, loop.angle + Math.PI / 2]}
                >
                    <torusGeometry args={[0.85, 0.1, 8, 28, Math.PI]} />
                    <meshBasicMaterial
                        color={dimmed ? '#8a2200' : '#ffb347'}
                        transparent
                        opacity={0.7}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            ))}
        </group>
    );
}

/** Плавный переход «живое ↔ угасшее» для шейдерных uniform-ов звезды. */
function useDim(dimmed) {
    const dim = useRef(dimmed ? 1 : 0);
    return (delta) => {
        dim.current += ((dimmed ? 1 : 0) - dim.current) * Math.min(1, delta * 1.5);
        return dim.current;
    };
}

function SunCorona({ dimmed }) {
    const step = useDim(dimmed);
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uRadius: { value: 4 },
        uDim: { value: 0 },
        uColor: { value: new THREE.Color('#ff9a3c') },
    }), []);

    useFrame((state, delta) => {
        const d = step(delta);
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uDim.value = d;
        uniforms.uRadius.value = 4 * (1 - 0.28 * d);
        uniforms.uColor.value.setRGB(1, 0.6 - d * 0.32, 0.24 - d * 0.18);
    });

    return (
        <Billboard>
            <mesh raycast={() => null}>
                <planeGeometry args={[36, 36]} />
                <shaderMaterial
                    vertexShader={coronaVertex}
                    fragmentShader={coronaFragment}
                    uniforms={uniforms}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
        </Billboard>
    );
}

function Sun({ dimmed, onSelect }) {
    const surfaceRef = useRef();
    const glowTex = useMemo(() => circleSprite(), []);
    const step = useDim(dimmed);
    const uniforms = useMemo(() => ({ uTime: { value: 0 }, uDim: { value: 0 } }), []);

    useFrame((state, delta) => {
        const d = step(delta);
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uDim.value = d;
        if (surfaceRef.current) {
            surfaceRef.current.rotation.y += delta * 0.03;
            surfaceRef.current.scale.setScalar(1 - 0.28 * d);
        }
    });

    return (
        <group
            onClick={(e) => { e.stopPropagation(); onSelect('sun'); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh ref={surfaceRef}>
                <sphereGeometry args={[4, 96, 64]} />
                <shaderMaterial vertexShader={sunVertex} fragmentShader={sunFragment} uniforms={uniforms} />
            </mesh>

            {/* Рассеянный свет вокруг короны: широкий и едва заметный */}
            <sprite scale={[22, 22, 1]} raycast={() => null}>
                <spriteMaterial
                    map={glowTex}
                    color={dimmed ? '#4a1200' : '#ff7a1e'}
                    transparent
                    opacity={dimmed ? 0.04 : 0.08}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>
            <sprite scale={[46, 46, 1]} raycast={() => null}>
                <spriteMaterial
                    map={glowTex}
                    color={dimmed ? '#2a0a00' : '#ff5a10'}
                    transparent
                    opacity={dimmed ? 0.015 : 0.04}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>

            <SunCorona dimmed={dimmed} />
            <SolarProminences dimmed={dimmed} />

            <BillboardText
                position={[0, 7.2, 0]}
                fontSize={0.7}
                color={dimmed ? '#dd6633' : '#ffcc00'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.05}
            >
                {dimmed ? 'УГАСАНИЕ' : 'СОЛНЦЕ'}
            </BillboardText>

            <pointLight
                intensity={dimmed ? 0.5 : 3.4}
                color={dimmed ? '#ff5500' : '#fff4cc'}
                distance={420}
                decay={1.1}
            />
        </group>
    );
}

const WIND_COUNT = 1500;
const WIND_SUN = new THREE.Color('#ffe2a0');
const WIND_SHIELD = new THREE.Color('#7c93b8');

/**
 * Солнечный ветер — поток частиц от звезды наружу. Раньше это были 42
 * неподвижных отрезка и кольцо точек, которое просто вращалось. При
 * экранировании поток замедляется, остывает и упирается в близкую границу.
 */
function SolarWind({ shielded, onSelect }) {
    const clock = useRef(0);
    const { dir, seed } = useMemo(() => {
        const rand = seededRandom(0x3a1d);
        const d = new Float32Array(WIND_COUNT * 3);
        const sd = new Float32Array(WIND_COUNT * 2);
        for (let i = 0; i < WIND_COUNT; i += 1) {
            const theta = rand() * Math.PI * 2;
            // Плотнее у экватора звезды: так поток читается диском вокруг
            // Солнца, а не ежом во все стороны
            const z = (rand() * 2 - 1) * (rand() < 0.7 ? 0.35 : 1);
            const r = Math.sqrt(1 - z * z);
            d[i * 3] = r * Math.cos(theta);
            d[i * 3 + 1] = z;
            d[i * 3 + 2] = r * Math.sin(theta);
            sd[i * 2] = rand();
            sd[i * 2 + 1] = rand();
        }
        return { dir: d, seed: sd };
    }, []);
    const positions = useMemo(() => new Float32Array(WIND_COUNT * 3), []);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uSpeed: { value: 0.14 },
        uScale: { value: 400 },
        uInner: { value: 4.6 },
        uLength: { value: 15 },
        uColor: { value: WIND_SUN.clone() },
        uOpacity: { value: 0.9 },
    }), []);

    useFrame((state, delta) => {
        const k = Math.min(1, delta * 1.6);
        clock.current += delta * (shielded ? 0.25 : 1);
        uniforms.uTime.value = clock.current;
        uniforms.uScale.value = pointScale(state);
        uniforms.uLength.value += ((shielded ? 4.5 : 15) - uniforms.uLength.value) * k;
        uniforms.uOpacity.value += ((shielded ? 0.45 : 0.9) - uniforms.uOpacity.value) * k;
        uniforms.uColor.value.lerp(shielded ? WIND_SHIELD : WIND_SUN, k);
    });

    return (
        <group>
            <points raycast={() => null} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    <bufferAttribute attach="attributes-aDir" args={[dir, 3]} />
                    <bufferAttribute attach="attributes-aSeed" args={[seed, 2]} />
                </bufferGeometry>
                <shaderMaterial
                    vertexShader={windVertex}
                    fragmentShader={glowPointFragment}
                    uniforms={uniforms}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </points>
            {/* Попасть по отдельной частице нельзя: зона клика — кольцо
                вокруг звезды, с дырой под само Солнце */}
            <Billboard>
                <mesh
                    visible={false}
                    onClick={(e) => { e.stopPropagation(); onSelect('radiation'); }}
                    onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                    onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                >
                    <ringGeometry args={[8.5, 12.5, 32]} />
                    <meshBasicMaterial side={THREE.DoubleSide} />
                </mesh>
            </Billboard>
            <BillboardText
                position={[0, -10.4, 0]}
                fontSize={0.5}
                color={shielded ? '#9bb0cc' : '#fff1a0'}
                anchorX="center"
                anchorY="top"
                outlineWidth={0.05}
            >
                {shielded ? 'ЭКРАНИРОВАНИЕ' : 'ИЗЛУЧЕНИЕ'}
            </BillboardText>
        </group>
    );
}

// ═══════════════════════════════════════════════════════════
// ПЛАНЕТЫ
// ═══════════════════════════════════════════════════════════

const ARCS_PER_RING = 16;
const STEPS_PER_ARC = 9;
const INTACT_COLOR = new THREE.Color();
const BROKEN_COLOR = new THREE.Color('#ff5a33');

/**
 * Орбита. Кольцо нарезано на дуги, которые в целом состоянии стыкуются
 * концами и читаются непрерывной линией.
 *
 * При реверсе гравитации орбита не просто гаснет: дуги отрываются одна за
 * другой, уходят наружу и кувыркаются вокруг собственного центра. Порядок
 * отрыва задан лагом на каждую дугу, поэтому кольцо рвётся, а не расходится
 * целиком — держать материю больше нечему.
 */
function OrbitRing({ rx, rz, color = '#ffffff', opacity = 0.12, broken = false }) {
    const geometryRef = useRef();
    const materialRef = useRef();
    const progress = useRef(0);

    // Пары точек для lineSegments: каждая дуга — своя цепочка отрезков
    const { positions, arcs } = useMemo(() => {
        const rand = seededRandom(Math.round(rx * 977) ^ 0x51ce);
        const pairs = ARCS_PER_RING * (STEPS_PER_ARC - 1) * 2;
        const buffer = new Float32Array(pairs * 3);
        const list = [];
        let cursor = 0;

        for (let a = 0; a < ARCS_PER_RING; a += 1) {
            const from = (a / ARCS_PER_RING) * Math.PI * 2;
            const to = ((a + 1) / ARCS_PER_RING) * Math.PI * 2;
            const points = [];
            for (let s = 0; s < STEPS_PER_ARC; s += 1) {
                const angle = from + (to - from) * (s / (STEPS_PER_ARC - 1));
                points.push(new THREE.Vector3(Math.cos(angle) * rx, 0, Math.sin(angle) * rz));
            }

            const mid = (from + to) * 0.5;
            const centre = new THREE.Vector3(Math.cos(mid) * rx, 0, Math.sin(mid) * rz);
            list.push({
                points,
                centre,
                start: cursor,
                // Наружу от центра системы плюс вертикальный увод
                drift: new THREE.Vector3(Math.cos(mid), (rand() - 0.5) * 1.2, Math.sin(mid))
                    .normalize()
                    .multiplyScalar(rx * (0.16 + rand() * 0.4)),
                axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
                spin: (rand() - 0.5) * 3.2,
                lag: rand() * 0.55,
            });
            cursor += (STEPS_PER_ARC - 1) * 2;
        }

        return { positions: buffer, arcs: list };
    }, [rx, rz]);

    const scratch = useMemo(() => new THREE.Vector3(), []);

    useFrame((_, delta) => {
        const target = broken ? 1 : 0;
        const ease = Math.min(1, delta * (broken ? 0.55 : 1.3));
        progress.current += (target - progress.current) * ease;
        const p = progress.current;

        const attribute = geometryRef.current?.attributes.position;
        if (!attribute) return;

        // Целое кольцо не пересчитываем каждый кадр: оно неподвижно
        if (p < 0.0005 && attribute.__settled) return;
        attribute.__settled = p < 0.0005;

        const array = attribute.array;
        for (let a = 0; a < arcs.length; a += 1) {
            const arc = arcs[a];
            const local = Math.max(0, (p - arc.lag) / Math.max(0.05, 1 - arc.lag));
            const angle = local * arc.spin;
            let write = arc.start * 3;

            for (let s = 0; s < STEPS_PER_ARC - 1; s += 1) {
                for (let end = 0; end < 2; end += 1) {
                    const point = arc.points[s + end];
                    scratch.subVectors(point, arc.centre);
                    if (local > 0) scratch.applyAxisAngle(arc.axis, angle);
                    array[write] = arc.centre.x + scratch.x + arc.drift.x * local;
                    array[write + 1] = arc.centre.y + scratch.y + arc.drift.y * local;
                    array[write + 2] = arc.centre.z + scratch.z + arc.drift.z * local;
                    write += 3;
                }
            }
        }
        attribute.needsUpdate = true;

        const material = materialRef.current;
        if (material) {
            // Осколки ярче целой орбиты: это высвободившаяся материя,
            // а прежнее затухание делало распад почти невидимым
            material.opacity = opacity * (1 + p * 1.6);
            INTACT_COLOR.set(color);
            material.color.copy(INTACT_COLOR).lerp(BROKEN_COLOR, p * 0.8);
        }
    });

    return (
        <lineSegments raycast={() => null}>
            <bufferGeometry ref={geometryRef}>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <lineBasicMaterial ref={materialRef} color={color} transparent opacity={opacity} depthWrite={false} />
        </lineSegments>
    );
}

/**
 * Планета на орбите. Наклон оси, скорость вращения и период обращения заданы
 * по своим настоящим соотношениям, поэтому Юпитер ползёт по орбите медленно,
 * но крутится вокруг оси быстрее всех.
 */
const LABEL_POS = new THREE.Vector3();

function OrbitingPlanet({
    factorId,
    label,
    subtitle,
    reverseSubtitle,
    reversed,
    radius,
    orbit,
    orbitSpeed,
    spinSpeed,
    axialTilt = 0,
    texture,
    emissive = '#000000',
    emissiveIntensity = 0,
    atmosphere,
    labelColor = '#ffffff',
    onSelect,
    startAngle = 0,
    children,
}) {
    const groupRef = useRef();
    const bodyRef = useRef();
    const labelRef = useRef();
    const angle = useRef(startAngle);

    useFrame(({ camera }, delta) => {
        // Планета на вытянутой орбите проходит у самой камеры, и её подпись
        // разрасталась на полэкрана поверх подсказок. Вблизи подпись тает:
        // планету и так видно, а прочитать гигантские буквы всё равно нельзя.
        const labels = labelRef.current;
        if (labels && groupRef.current) {
            const d = camera.position.distanceTo(groupRef.current.getWorldPosition(LABEL_POS));
            const k = THREE.MathUtils.clamp((d - radius * 6 - 14) / 10, 0, 1);
            labels.visible = k > 0.01;
            labels.traverse((o) => {
                if ('fillOpacity' in o) {
                    o.fillOpacity = k;
                    o.outlineOpacity = k;
                }
            });
        }
        angle.current += delta * orbitSpeed;
        if (groupRef.current) {
            groupRef.current.position.set(
                Math.cos(angle.current) * orbit[0],
                0,
                Math.sin(angle.current) * orbit[1],
            );
        }
        if (bodyRef.current) bodyRef.current.rotation.y += delta * spinSpeed;
    });

    return (
        <group ref={groupRef}>
            <group
                rotation={[0, 0, axialTilt]}
                onClick={(e) => { e.stopPropagation(); onSelect(factorId); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh ref={bodyRef}>
                    <sphereGeometry args={[radius, 48, 32]} />
                    <meshStandardMaterial
                        map={texture}
                        roughness={0.78}
                        metalness={0}
                        emissive={emissive}
                        emissiveIntensity={emissiveIntensity}
                    />
                </mesh>
                {atmosphere && (
                    <Rim radius={radius} color={atmosphere} intensity={1.6} power={3.2} scale={1.035} />
                )}
                {children}
            </group>

            <group ref={labelRef}>
            <BillboardText
                position={[0, radius + 1.2, 0]}
                fontSize={Math.min(1.3, Math.max(0.95, radius * 0.4))}
                color={labelColor}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.04}
            >
                {label}
            </BillboardText>
            <BillboardText
                position={[0, radius + 0.25, 0]}
                fontSize={Math.min(0.9, Math.max(0.62, radius * 0.28))}
                color={reversed ? '#8fd0ff' : '#ffb066'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.035}
            >
                {reversed ? reverseSubtitle : subtitle}
            </BillboardText>
            </group>
        </group>
    );
}

function SaturnRings({ radius, decaying }) {
    const meshRef = useRef();
    const tex = useMemo(() => saturnRingsTexture(), []);

    useFrame((_, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        mesh.rotation.z += delta * 0.06;
        const target = decaying ? 0.22 : 0.95;
        mesh.material.opacity += (target - mesh.material.opacity) * Math.min(1, delta * 1.2);
        const scaleTarget = decaying ? 1.25 : 1;
        mesh.scale.x += (scaleTarget - mesh.scale.x) * Math.min(1, delta);
        mesh.scale.y = mesh.scale.x;
    });

    return (
        <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[radius * 1.35, radius * 2.35, 96]} />
            <meshBasicMaterial
                map={tex}
                transparent
                opacity={0.95}
                side={THREE.DoubleSide}
                depthWrite={false}
            />
        </mesh>
    );
}

function Moon({ reversed, onSelect }) {
    const groupRef = useRef();
    const bodyRef = useRef();
    const angle = useRef(1.2);
    const texture = useTexture(MOON_TEXTURE);
    const ORBIT = 3.1;

    useFrame((_, delta) => {
        angle.current += delta * 0.85;
        if (groupRef.current) {
            groupRef.current.position.set(
                Math.cos(angle.current) * ORBIT,
                Math.sin(angle.current * 0.35) * 0.45,
                Math.sin(angle.current) * ORBIT,
            );
        }
        // Луна в приливном захвате: сутки равны месяцу, к планете всегда одна сторона
        if (bodyRef.current) bodyRef.current.rotation.y = -angle.current;
    });

    return (
        <group
            ref={groupRef}
            onClick={(e) => { e.stopPropagation(); onSelect('moonlight'); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh ref={bodyRef}>
                <sphereGeometry args={[0.38, 32, 24]} />
                <meshStandardMaterial
                    map={texture}
                    roughness={0.95}
                    metalness={0}
                    color={reversed ? '#5a5a60' : '#ffffff'}
                />
            </mesh>
            <BillboardText
                position={[0, 0.62, 0]}
                fontSize={0.34}
                color={reversed ? '#88aacc' : '#ffffaa'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.035}
            >
                {reversed ? 'ПОГЛОЩЕНИЕ' : 'ОТРАЖЕНИЕ'}
            </BillboardText>
        </group>
    );
}

/** Земля с настоящими материками, живым океаном, облаками и Луной. */
function EarthSystem({ reversedFactors, onSelect }) {
    const groupRef = useRef();
    const spinRef = useRef();
    const angle = useRef(2.1);
    const sunDir = useRef(new THREE.Vector3(1, 0, 0));
    const worldPos = useMemo(() => new THREE.Vector3(), []);

    const ORBIT = [25, 18];
    const RADIUS = 1.45;

    const antigravity = !!reversedFactors.gravity;
    const lowTide = !!reversedFactors.tides;

    const freeze = useStore((s) => s.approachingEarth);

    useFrame((_, delta) => {
        if (!freeze) angle.current += delta * 0.3;
        if (groupRef.current) {
            groupRef.current.position.set(
                Math.cos(angle.current) * ORBIT[0],
                0,
                Math.sin(angle.current) * ORBIT[1],
            );
            groupRef.current.getWorldPosition(worldPos);
            earthWorld.copy(worldPos);
            sunDir.current.copy(worldPos).negate().normalize();
        }
        if (spinRef.current) spinRef.current.rotation.y += delta * 0.5;
    });

    return (
        <group ref={groupRef}>
            <group
                rotation={[0, 0, 0.41]}
                onClick={(e) => { e.stopPropagation(); onSelect('gravity'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <group ref={spinRef}>
                    <EarthGlobe
                        radius={RADIUS}
                        segments={96}
                        sunDir={sunDir}
                        cloudOpacity={0.8}
                        cloudDrift={0.006}
                        atmosphereIntensity={1.15}
                        tuning={{ nightGlow: 2.2, waveStrength: 0.05, waveAmp: 0.004, foam: 0.7, ambient: 0.16 }}
                    />
                </group>
            </group>

            {/* Гравитационное поле: сфера сжимается к планете или разлетается прочь */}
            <GravityShell reversed={antigravity} radius={RADIUS} />

            {/* Приливная волна, вытянутая вдоль линии на Луну */}
            <group
                onClick={(e) => { e.stopPropagation(); onSelect('tides'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[RADIUS * 1.3, RADIUS * 1.42, 64]} />
                    <meshBasicMaterial
                        color={lowTide ? '#2a5f8a' : '#8ce0ff'}
                        transparent
                        opacity={0.28}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
                <BillboardText
                    position={[0, -RADIUS - 0.5, 0]}
                    fontSize={0.85}
                    color={lowTide ? '#88aacc' : '#aaddff'}
                    anchorX="center"
                    anchorY="top"
                    outlineWidth={0.04}
                >
                    {lowTide ? 'ОТЛИВЫ' : 'ПРИЛИВЫ'}
                </BillboardText>
            </group>

            <Moon reversed={!!reversedFactors.moonlight} onSelect={onSelect} />

            <BillboardText
                position={[0, RADIUS + 2.05, 0]}
                fontSize={0.9}
                color="#ffffff"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.045}
            >
                Земля
            </BillboardText>
            <BillboardText
                position={[0, RADIUS + 1.15, 0]}
                fontSize={0.7}
                color={antigravity ? '#ff6644' : '#54b6ff'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.04}
            >
                {antigravity ? 'РАСПАД' : 'ГРАВИТАЦИЯ'}
            </BillboardText>
        </group>
    );
}

/**
 * Гравитационное поле: светящиеся по краю оболочки стягиваются к планете
 * (или разлетаются прочь при реверсе). Проволочная сфера выглядела
 * отладочной сеткой — ободок читается полем, а не геометрией.
 */
function GravityShell({ reversed, radius }) {
    const groupRef = useRef();
    const shells = useMemo(() => [0, 1].map(() => rimUniforms('#5d8cff', 0, 2.4, 0)), []);

    useFrame((state) => {
        const group = groupRef.current;
        if (!group) return;
        const t = state.clock.elapsedTime;
        shells.forEach((u, i) => {
            const phase = (t * 0.6 + i * 0.5) % 1;
            const k = reversed ? phase : 1 - phase;
            group.children[i].scale.setScalar(1 + k * 1.6);
            u.uIntensity.value = Math.sin(phase * Math.PI) * 0.55;
            u.uColor.value.set(reversed ? '#ff4422' : '#5d8cff');
        });
    });

    return (
        <group ref={groupRef}>
            {shells.map((u, i) => (
                <mesh key={i} raycast={() => null}>
                    <sphereGeometry args={[radius * 1.12, 48, 32]} />
                    <shaderMaterial
                        vertexShader={rimVertex}
                        fragmentShader={rimFragment}
                        uniforms={u}
                        transparent
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            ))}
        </group>
    );
}

// ═══════════════════════════════════════════════════════════
// КОМЕТА И МЕТАФИЗИЧЕСКИЕ ФАКТОРЫ
// ═══════════════════════════════════════════════════════════

const COMET_COUNT = 1800;
const COMET_ION = 800;
const COMET_POS = new THREE.Vector3();
const COMET_VEL = new THREE.Vector3();
const COMET_SIDE = new THREE.Vector3();

/**
 * Комета. Хвост раньше был следом из 220 точек вдоль пути: на быстрой
 * орбите он растягивался пунктиром через полсистемы. Настоящий хвост
 * всегда смотрит от Солнца и длиннее у перигелия.
 */
function Comet({ slowed, onSelect }) {
    const groupRef = useRef();
    const angle = useRef(0);
    const clock = useRef(0);
    const tex = useMemo(() => circleSprite(), []);

    const seeds = useMemo(() => {
        const rand = seededRandom(0xc0e7);
        const g = () => (rand() + rand() + rand() - 1.5) * 0.9;
        const a = new Float32Array(COMET_COUNT * 4);
        for (let i = 0; i < COMET_COUNT; i += 1) {
            a[i * 4] = rand();
            a[i * 4 + 1] = g();
            a[i * 4 + 2] = g();
            a[i * 4 + 3] = i < COMET_ION ? 1 : 0;
        }
        return a;
    }, []);
    const positions = useMemo(() => new Float32Array(COMET_COUNT * 3), []);

    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uScale: { value: 400 },
        uLength: { value: 18 },
        uHead: { value: new THREE.Vector3() },
        uAnti: { value: new THREE.Vector3(1, 0, 0) },
        uBack: { value: new THREE.Vector3(0, 0, 1) },
        uSide: { value: new THREE.Vector3(0, 1, 0) },
        uIon: { value: new THREE.Color('#9fd8ff').multiplyScalar(1.6) },
        uDust: { value: new THREE.Color('#ffe6b8') },
        uOpacity: { value: 1 },
    }), []);

    useFrame((state, delta) => {
        angle.current += delta * (slowed ? 0.06 : 0.4);
        clock.current += delta * (slowed ? 0.3 : 1);
        const a = angle.current;
        const tilt = 0.35;
        const rawZ = Math.sin(a) * 52;
        COMET_POS.set(Math.cos(a) * 78, rawZ * Math.sin(tilt), rawZ * Math.cos(tilt));
        const vz = Math.cos(a) * 52;
        COMET_VEL.set(-Math.sin(a) * 78, vz * Math.sin(tilt), vz * Math.cos(tilt)).normalize();

        if (groupRef.current) groupRef.current.position.copy(COMET_POS);

        const dist = COMET_POS.length();
        uniforms.uTime.value = clock.current;
        uniforms.uScale.value = pointScale(state);
        uniforms.uHead.value.copy(COMET_POS);
        uniforms.uAnti.value.copy(COMET_POS).normalize();
        uniforms.uBack.value.copy(COMET_VEL).negate();
        COMET_SIDE.crossVectors(uniforms.uAnti.value, uniforms.uBack.value);
        if (COMET_SIDE.lengthSq() < 1e-4) COMET_SIDE.set(0, 1, 0);
        uniforms.uSide.value.copy(COMET_SIDE.normalize());
        // У Солнца хвост вырастает: лёд испаряется сильнее
        uniforms.uLength.value = 40 * Math.pow(52 / dist, 1.5) * (slowed ? 0.6 : 1);
        uniforms.uOpacity.value += ((slowed ? 0.45 : 1) - uniforms.uOpacity.value) * Math.min(1, delta * 2);
    });

    return (
        <>
            <points raycast={() => null} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    <bufferAttribute attach="attributes-aSeed" args={[seeds, 4]} />
                </bufferGeometry>
                <shaderMaterial
                    vertexShader={cometVertex}
                    fragmentShader={cometFragment}
                    uniforms={uniforms}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </points>
            <group
                ref={groupRef}
                onClick={(e) => { e.stopPropagation(); onSelect('acceleration'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh>
                    <sphereGeometry args={[0.32, 20, 16]} />
                    <meshBasicMaterial color="#ffffff" toneMapped={false} />
                </mesh>
                {/* Кома — облако газа вокруг ядра */}
                <sprite scale={[4.2, 4.2, 1]}>
                    <spriteMaterial
                        map={tex}
                        color={slowed ? '#3355aa' : '#b8e4ff'}
                        transparent
                        opacity={0.55}
                        depthWrite={false}
                        toneMapped={false}
                        blending={THREE.AdditiveBlending}
                    />
                </sprite>
                <BillboardText
                    position={[0, 2.4, 0]}
                    fontSize={0.62}
                    color={slowed ? '#aaddff' : '#ffffff'}
                    anchorX="center"
                    anchorY="bottom"
                    outlineWidth={0.05}
                >
                    {slowed ? 'ЗАМЕДЛЕНИЕ' : 'УСКОРЕНИЕ'}
                </BillboardText>
            </group>
        </>
    );
}

/**
 * Метафизический фактор в глубоком космосе. Прежде это был проволочный
 * многогранник в прозрачном шаре — форма из отладки, выпадавшая из общего
 * языка меток. Теперь та же метка, что везде, только крупнее под масштаб
 * Солнечной системы.
 */
function FloatingFactor({ position, factorId, label, reverseLabel, color, reverseColor }) {
    const groupRef = useRef();
    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 0.6 + position[0]) * 2;
        }
    });
    return (
        <group ref={groupRef} position={position}>
            <FactorMarker
                position={[0, 0, 0]}
                factorId={factorId}
                label={label}
                reverseLabel={reverseLabel}
                color={color}
                reverseColor={reverseColor}
                scale={4.2}
                labelOffset={-0.8}
                hitRadius={4}
            />
        </group>
    );
}

// ═══════════════════════════════════════════════════════════
// ГЛАВНАЯ СЦЕНА
// ═══════════════════════════════════════════════════════════

export default function Cosmos() {
    const reversedFactors = useStore((s) => s.reversedFactors);
    const setActiveFactor = useStore((s) => s.setActiveFactor);

    // Реверс гравитации рвёт орбиты всей системы, а не только земную
    const antigravity = !!reversedFactors.gravity;

    const starTex = useMemo(() => starSprite(), []);
    const mercuryTex = useMemo(() => mercuryTexture(), []);
    const venusTex = useMemo(() => venusTexture(), []);
    const marsTex = useMemo(() => marsTexture(), []);
    const jupiterTex = useMemo(() => jupiterTexture(), []);
    const saturnTex = useMemo(() => saturnTexture(), []);

    const starRadius = useMemo(() => [150, 320], []);
    const dustRadius = useMemo(() => [120, 260], []);

    return (
        <group>
            <StarShell count={2600} seed={0x571} size={1.2} radiusRange={starRadius} saturation={0.25} tex={starTex} />
            <StarShell count={320} seed={0x572} size={3.2} radiusRange={dustRadius} saturation={0.4} tex={starTex} />
            <MilkyWay scattered={!!reversedFactors.galaxy} onSelect={setActiveFactor} />

            <Nebula position={[-120, 40, -90]} color="#6a4bff" size={95} />
            <Nebula position={[140, -30, 60]} color="#ff4a3c" size={78} rotation={0.7} />
            <Nebula position={[20, 80, -150]} color="#28b8ff" size={110} rotation={-0.4} />

            <ambientLight intensity={0.16} />

            <Sun dimmed={!!reversedFactors.sun} onSelect={setActiveFactor} />
            <SolarWind shielded={!!reversedFactors.radiation} onSelect={setActiveFactor} />

            <OrbitRing rx={13} rz={9.5} color="#aaaaaa" opacity={0.14} broken={antigravity} />
            <OrbitRing rx={18} rz={13} color="#e8c98a" opacity={0.13} broken={antigravity} />
            <OrbitRing rx={25} rz={18} color="#4488ff" opacity={0.14} broken={antigravity} />
            <OrbitRing rx={33} rz={24} color="#cc4422" opacity={0.13} broken={antigravity} />
            <OrbitRing rx={48} rz={35} color="#c9a06a" opacity={0.11} broken={antigravity} />
            <OrbitRing rx={64} rz={46} color="#e0d0a0" opacity={0.1} broken={antigravity} />

            <OrbitingPlanet
                factorId="heating"
                label="Меркурий"
                subtitle="нагревание"
                reverseSubtitle="остывание"
                reversed={!!reversedFactors.heating}
                radius={0.62}
                orbit={[13, 9.5]}
                orbitSpeed={0.55}
                spinSpeed={0.04}
                texture={mercuryTex}
                emissive="#552200"
                emissiveIntensity={reversedFactors.heating ? 0.08 : 0.28}
                labelColor="#cfcfcf"
                onSelect={setActiveFactor}
                startAngle={0.5}
            />

            <OrbitingPlanet
                factorId="venusHeat"
                label="Венера"
                subtitle="парниковый эффект"
                reverseSubtitle="остывание"
                reversed={!!reversedFactors.venusHeat}
                radius={0.95}
                orbit={[18, 13]}
                orbitSpeed={0.42}
                // Венера вращается в обратную сторону — единственная такая планета
                spinSpeed={-0.02}
                axialTilt={3.09}
                texture={venusTex}
                emissive={reversedFactors.venusHeat ? '#221a10' : '#6b4a12'}
                emissiveIntensity={reversedFactors.venusHeat ? 0.1 : 0.4}
                atmosphere="#ffd89a"
                labelColor="#ffe1a8"
                onSelect={setActiveFactor}
                startAngle={3.4}
            />

            <EarthSystem reversedFactors={reversedFactors} onSelect={setActiveFactor} />

            <OrbitingPlanet
                factorId="freezing"
                label="Марс"
                subtitle="замерзание"
                reverseSubtitle="оттепель"
                reversed={!!reversedFactors.freezing}
                radius={0.78}
                orbit={[33, 24]}
                orbitSpeed={0.22}
                spinSpeed={0.48}
                axialTilt={0.44}
                texture={marsTex}
                emissive={reversedFactors.freezing ? '#00223f' : '#3a1c0d'}
                emissiveIntensity={reversedFactors.freezing ? 0.16 : 0.24}
                atmosphere="#cc6633"
                labelColor="#ff9c7a"
                onSelect={setActiveFactor}
                startAngle={4.2}
            />

            <OrbitingPlanet
                factorId="jupiterStorm"
                label="Юпитер"
                subtitle="великое пятно"
                reverseSubtitle="затишье"
                reversed={!!reversedFactors.jupiterStorm}
                radius={2.6}
                orbit={[48, 35]}
                orbitSpeed={0.11}
                spinSpeed={0.85}
                axialTilt={0.05}
                texture={jupiterTex}
                labelColor="#f0d6b0"
                onSelect={setActiveFactor}
                startAngle={1.1}
            />

            <OrbitingPlanet
                factorId="saturnRings"
                label="Сатурн"
                subtitle="кольца"
                reverseSubtitle="распад колец"
                reversed={!!reversedFactors.saturnRings}
                radius={2.15}
                orbit={[64, 46]}
                orbitSpeed={0.075}
                spinSpeed={0.78}
                axialTilt={0.47}
                texture={saturnTex}
                labelColor="#f2e4bd"
                onSelect={setActiveFactor}
                startAngle={5.6}
            >
                <SaturnRings radius={2.15} decaying={!!reversedFactors.saturnRings} />
            </OrbitingPlanet>

            <Comet slowed={!!reversedFactors.acceleration} onSelect={setActiveFactor} />

            <FloatingFactor
                position={[-95, 14, -28]}
                factorId="void"
                label="ПУСТОТА"
                reverseLabel="ИЗБЫТОК"
                color="#6644ff"
                reverseColor="#ffaa00"
            />
            <FloatingFactor
                position={[100, -10, 30]}
                factorId="infinity"
                label="БЕСКОНЕЧНОСТЬ"
                reverseLabel="ОГРАНИЧЕННОСТЬ"
                color="#00ccff"
                reverseColor="#ff4488"
            />
            <FloatingFactor
                position={[-40, 26, -70]}
                factorId="symbiosis"
                label="СИМБИОЗ"
                reverseLabel="ПАРАЗИТИЗМ"
                color="#33ff99"
                reverseColor="#88bb33"
            />
        </group>
    );
}

useTexture.preload(MOON_TEXTURE);
