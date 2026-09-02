import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { seededRandom } from '../lib/geo';
import { circleSprite, nebulaSprite, starSprite } from '../lib/sprites';
import {
    jupiterTexture,
    marsTexture,
    mercuryTexture,
    saturnRingsTexture,
    saturnTexture,
    sunTexture,
    venusTexture,
} from '../lib/planetTextures';
import EarthGlobe from './earth/EarthGlobe';

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
                opacity={0.55}
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
                        opacity={0.32}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            ))}
        </group>
    );
}

function SunCorona({ dimmed }) {
    const innerRef = useRef();
    const outerRef = useRef();

    const makeRays = (count, innerR, outerR, seed) => {
        const rand = seededRandom(seed);
        const pos = new Float32Array(count * 2 * 3);
        for (let i = 0; i < count; i += 1) {
            const angle = (i / count) * Math.PI * 2;
            const lenVar = 0.7 + rand() * 0.6;
            pos[i * 6] = Math.cos(angle) * innerR;
            pos[i * 6 + 1] = Math.sin(angle) * innerR;
            pos[i * 6 + 2] = 0;
            pos[i * 6 + 3] = Math.cos(angle) * (outerR * lenVar);
            pos[i * 6 + 4] = Math.sin(angle) * (outerR * lenVar);
            pos[i * 6 + 5] = 0;
        }
        return pos;
    };

    const rays1 = useMemo(() => makeRays(28, 4.3, 7.4, 0xc01), []);
    const rays2 = useMemo(() => makeRays(18, 4.6, 9.4, 0xc02), []);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (innerRef.current) {
            innerRef.current.rotation.z = t * 0.12;
            innerRef.current.material.opacity = (dimmed ? 0.08 : 0.3) + Math.sin(t * 2.1) * 0.08;
        }
        if (outerRef.current) {
            outerRef.current.rotation.z = -t * 0.07;
            outerRef.current.material.opacity = (dimmed ? 0.03 : 0.15) + Math.sin(t * 1.4 + 1) * 0.05;
        }
    });

    const rayColor = dimmed ? '#ff5500' : '#ffdd66';

    return (
        <group>
            <lineSegments ref={innerRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[rays1, 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={rayColor} transparent opacity={0.45} depthWrite={false} blending={THREE.AdditiveBlending} />
            </lineSegments>
            <lineSegments ref={outerRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[rays2, 3]} />
                </bufferGeometry>
                <lineBasicMaterial color={rayColor} transparent opacity={0.22} depthWrite={false} blending={THREE.AdditiveBlending} />
            </lineSegments>
        </group>
    );
}

function Sun({ dimmed, onSelect }) {
    const glowRef = useRef();
    const surfaceRef = useRef();
    const tex = useMemo(() => sunTexture(), []);

    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (glowRef.current) {
            glowRef.current.scale.setScalar(1 + Math.sin(t * 1.3) * (dimmed ? 0.02 : 0.06));
        }
        if (surfaceRef.current) {
            surfaceRef.current.rotation.y += 0.0008;
            surfaceRef.current.rotation.z += 0.0003;
        }
    });

    return (
        <group
            onClick={(e) => { e.stopPropagation(); onSelect('sun'); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh ref={surfaceRef} scale={dimmed ? 0.72 : 1}>
                <sphereGeometry args={[4, 64, 48]} />
                <meshBasicMaterial map={tex} color={dimmed ? '#b04a12' : '#ffffff'} />
            </mesh>

            <mesh ref={glowRef}>
                <sphereGeometry args={[5.2, 32, 24]} />
                <meshBasicMaterial
                    color={dimmed ? '#661100' : '#ff9900'}
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>
            <mesh>
                <sphereGeometry args={[7.4, 24, 18]} />
                <meshBasicMaterial
                    color={dimmed ? '#330800' : '#ff5500'}
                    transparent
                    opacity={0.07}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </mesh>

            <SolarProminences dimmed={dimmed} />
            <SunCorona dimmed={dimmed} />

            <BillboardText
                position={[0, 7.2, 0]}
                fontSize={1.2}
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

function SolarWind({ shielded, onSelect }) {
    const rayRef = useRef();
    const particleRef = useRef();
    const rayCount = 42;
    const particleCount = 180;
    const tex = useMemo(() => circleSprite(), []);

    const rays = useMemo(() => {
        const pos = new Float32Array(rayCount * 2 * 3);
        for (let i = 0; i < rayCount; i += 1) {
            const angle = (i / rayCount) * Math.PI * 2;
            const wobble = 1 + Math.sin(i * 2.17) * 0.14;
            pos[i * 6] = Math.cos(angle) * 8.3;
            pos[i * 6 + 1] = Math.sin(angle) * 8.3;
            pos[i * 6 + 2] = 0;
            pos[i * 6 + 3] = Math.cos(angle) * 12.5 * wobble;
            pos[i * 6 + 4] = Math.sin(angle) * 12.5 * wobble;
            pos[i * 6 + 5] = 0;
        }
        return pos;
    }, []);

    const particles = useMemo(() => {
        const pos = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i += 1) {
            const angle = (i / particleCount) * Math.PI * 2;
            const radius = 9 + (i % 23) * 0.55;
            pos[i * 3] = Math.cos(angle) * radius;
            pos[i * 3 + 1] = Math.sin(angle) * radius;
            pos[i * 3 + 2] = Math.sin(i * 1.7) * 0.65;
        }
        return pos;
    }, []);

    useFrame((state, delta) => {
        if (rayRef.current) {
            rayRef.current.rotation.z += delta * (shielded ? 0.025 : 0.12);
            rayRef.current.material.opacity = shielded
                ? 0.06
                : 0.18 + Math.sin(state.clock.elapsedTime * 1.8) * 0.05;
        }
        if (particleRef.current) {
            particleRef.current.rotation.z -= delta * (shielded ? 0.04 : 0.35);
            particleRef.current.material.opacity = shielded ? 0.1 : 0.7;
        }
    });

    return (
        <group
            onClick={(e) => { e.stopPropagation(); onSelect('radiation'); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <lineSegments ref={rayRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[rays, 3]} />
                </bufferGeometry>
                <lineBasicMaterial
                    color={shielded ? '#556677' : '#fff0a0'}
                    transparent
                    opacity={0.26}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </lineSegments>
            <points ref={particleRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[particles, 3]} />
                </bufferGeometry>
                <pointsMaterial
                    color={shielded ? '#7790aa' : '#fff4aa'}
                    size={0.5}
                    transparent
                    opacity={0.7}
                    depthWrite={false}
                    sizeAttenuation
                    blending={THREE.AdditiveBlending}
                    map={tex}
                    alphaMap={tex}
                    alphaTest={0.01}
                />
            </points>
            <BillboardText
                position={[0, -10.4, 0]}
                fontSize={0.8}
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

function OrbitRing({ rx, rz, color = '#ffffff', opacity = 0.12 }) {
    const points = useMemo(() => {
        const arr = new Float32Array(129 * 3);
        for (let i = 0; i <= 128; i += 1) {
            const angle = (i / 128) * Math.PI * 2;
            arr[i * 3] = Math.cos(angle) * rx;
            arr[i * 3 + 1] = 0;
            arr[i * 3 + 2] = Math.sin(angle) * rz;
        }
        return arr;
    }, [rx, rz]);

    return (
        <line>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[points, 3]} />
            </bufferGeometry>
            <lineBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
        </line>
    );
}

/**
 * Планета на орбите. Наклон оси, скорость вращения и период обращения заданы
 * по своим настоящим соотношениям, поэтому Юпитер ползёт по орбите медленно,
 * но крутится вокруг оси быстрее всех.
 */
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
    const angle = useRef(startAngle);

    useFrame((_, delta) => {
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
                    <mesh scale={1.06}>
                        <sphereGeometry args={[radius, 24, 16]} />
                        <meshBasicMaterial
                            color={atmosphere}
                            transparent
                            opacity={0.12}
                            side={THREE.BackSide}
                            depthWrite={false}
                            blending={THREE.AdditiveBlending}
                        />
                    </mesh>
                )}
                {children}
            </group>

            <BillboardText
                position={[0, radius + 0.85, 0]}
                fontSize={Math.max(0.5, radius * 0.5)}
                color={labelColor}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.04}
            >
                {label}
            </BillboardText>
            <BillboardText
                position={[0, radius + 0.35, 0]}
                fontSize={Math.max(0.38, radius * 0.34)}
                color={reversed ? '#8fd0ff' : '#ffb066'}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.035}
            >
                {reversed ? reverseSubtitle : subtitle}
            </BillboardText>
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

    useFrame((_, delta) => {
        angle.current += delta * 0.3;
        if (groupRef.current) {
            groupRef.current.position.set(
                Math.cos(angle.current) * ORBIT[0],
                0,
                Math.sin(angle.current) * ORBIT[1],
            );
            // Солнце в центре системы, поэтому направление на свет — это минус радиус-вектор
            groupRef.current.getWorldPosition(worldPos);
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
                    fontSize={0.42}
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
                position={[0, RADIUS + 1.5, 0]}
                fontSize={0.75}
                color="#ffffff"
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.045}
            >
                Земля
            </BillboardText>
            <BillboardText
                position={[0, RADIUS + 1.05, 0]}
                fontSize={0.5}
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

function GravityShell({ reversed, radius }) {
    const meshRef = useRef();

    useFrame((_, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const speed = reversed ? 1.0 : -1.0;
        const next = mesh.scale.x + delta * speed;
        const wrapped = reversed
            ? (next > 2.6 ? 1.0 : next)
            : (next < 1.0 ? 2.6 : next);
        mesh.scale.setScalar(wrapped);

        const alpha = reversed ? (2.6 - wrapped) / 1.6 : (wrapped - 1.0) / 1.6;
        mesh.material.opacity = Math.max(0, Math.min(0.1, alpha * 0.1));
    });

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[radius * 1.12, 16, 10]} />
            <meshBasicMaterial
                color={reversed ? '#ff4422' : '#3a6fd8'}
                wireframe
                transparent
                opacity={0.1}
                depthWrite={false}
            />
        </mesh>
    );
}

// ═══════════════════════════════════════════════════════════
// КОМЕТА И МЕТАФИЗИЧЕСКИЕ ФАКТОРЫ
// ═══════════════════════════════════════════════════════════

function Comet({ slowed, onSelect }) {
    const groupRef = useRef();
    const tailRef = useRef();
    const angle = useRef(0);
    const tex = useMemo(() => circleSprite(), []);
    const tailCount = 220;

    const tailPositions = useMemo(() => new Float32Array(tailCount * 3), []);
    const history = useMemo(
        () => Array.from({ length: tailCount }, () => new THREE.Vector3()),
        [],
    );
    const cursor = useRef(0);
    const initialised = useRef(false);

    useFrame((_, delta) => {
        angle.current += delta * (slowed ? 0.06 : 0.4);
        const a = angle.current;
        const x = Math.cos(a) * 78;
        const rawZ = Math.sin(a) * 52;
        const tilt = 0.35;
        const y = rawZ * Math.sin(tilt);
        const z = rawZ * Math.cos(tilt);

        if (groupRef.current) groupRef.current.position.set(x, y, z);

        // При первом кадре хвост стягивается в текущую точку, иначе он тянется из центра
        if (!initialised.current) {
            history.forEach((v) => v.set(x, y, z));
            initialised.current = true;
        }

        cursor.current = (cursor.current - 1 + tailCount) % tailCount;
        history[cursor.current].set(x, y, z);

        for (let i = 0; i < tailCount; i += 1) {
            const item = history[(cursor.current + i) % tailCount];
            tailPositions[i * 3] = item.x;
            tailPositions[i * 3 + 1] = item.y;
            tailPositions[i * 3 + 2] = item.z;
        }
        if (tailRef.current) tailRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <>
            <points ref={tailRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[tailPositions, 3]} />
                </bufferGeometry>
                <pointsMaterial
                    size={0.6}
                    color={slowed ? '#4466aa' : '#aaddff'}
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
            <group
                ref={groupRef}
                onClick={(e) => { e.stopPropagation(); onSelect('acceleration'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh>
                    <sphereGeometry args={[0.62, 20, 16]} />
                    <meshBasicMaterial color="#ffffff" />
                </mesh>
                <mesh>
                    <sphereGeometry args={[1.5, 16, 12]} />
                    <meshBasicMaterial
                        color={slowed ? '#2244aa' : '#88ccff'}
                        transparent
                        opacity={0.18}
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
                <BillboardText
                    position={[0, 2.4, 0]}
                    fontSize={1.05}
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

function FloatingFactor({
    position, factorId, label, reverseLabel, color, reverseColor, reversed, onSelect, shape = 'octahedron',
}) {
    const groupRef = useRef();
    const meshRef = useRef();

    useFrame((state, delta) => {
        if (groupRef.current) {
            groupRef.current.position.y = position[1]
                + Math.sin(state.clock.elapsedTime * 0.6 + position[0]) * 2;
        }
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * 0.4;
            meshRef.current.rotation.y += delta * 0.6;
        }
    });

    const tone = reversed ? reverseColor : color;

    return (
        <group
            ref={groupRef}
            position={position}
            onClick={(e) => { e.stopPropagation(); onSelect(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh>
                <sphereGeometry args={[3.5, 12, 10]} />
                <meshBasicMaterial color={tone} transparent opacity={0.04} depthWrite={false} />
            </mesh>
            <mesh ref={meshRef}>
                {shape === 'octahedron' && <octahedronGeometry args={[1.5, 0]} />}
                {shape === 'tetrahedron' && <tetrahedronGeometry args={[1.5, 0]} />}
                {shape === 'icosahedron' && <icosahedronGeometry args={[1.5, 0]} />}
                <meshBasicMaterial color={tone} wireframe />
            </mesh>
            <BillboardText
                position={[0, 3, 0]}
                fontSize={1.05}
                color={tone}
                anchorX="center"
                anchorY="bottom"
                outlineWidth={0.05}
            >
                {reversed ? reverseLabel : label}
            </BillboardText>
        </group>
    );
}

// ═══════════════════════════════════════════════════════════
// ГЛАВНАЯ СЦЕНА
// ═══════════════════════════════════════════════════════════

export default function Cosmos() {
    const reversedFactors = useStore((s) => s.reversedFactors);
    const setActiveFactor = useStore((s) => s.setActiveFactor);

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

            <OrbitRing rx={13} rz={9.5} color="#aaaaaa" opacity={0.14} />
            <OrbitRing rx={18} rz={13} color="#e8c98a" opacity={0.13} />
            <OrbitRing rx={25} rz={18} color="#4488ff" opacity={0.14} />
            <OrbitRing rx={33} rz={24} color="#cc4422" opacity={0.13} />
            <OrbitRing rx={48} rz={35} color="#c9a06a" opacity={0.11} />
            <OrbitRing rx={64} rz={46} color="#e0d0a0" opacity={0.1} />

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
                reversed={!!reversedFactors.void}
                onSelect={setActiveFactor}
            />
            <FloatingFactor
                position={[100, -10, 30]}
                factorId="infinity"
                label="БЕСКОНЕЧНОСТЬ"
                reverseLabel="ОГРАНИЧЕННОСТЬ"
                color="#00ccff"
                reverseColor="#ff4488"
                reversed={!!reversedFactors.infinity}
                onSelect={setActiveFactor}
                shape="icosahedron"
            />
            <FloatingFactor
                position={[-40, 26, -70]}
                factorId="symbiosis"
                label="СИМБИОЗ"
                reverseLabel="ПАРАЗИТИЗМ"
                color="#33ff99"
                reverseColor="#88bb33"
                reversed={!!reversedFactors.symbiosis}
                onSelect={setActiveFactor}
            />
        </group>
    );
}

useTexture.preload(MOON_TEXTURE);
