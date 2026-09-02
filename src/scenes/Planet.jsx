import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { latLonToArray, latLonToVec3, seededRandom, sunDirection } from '../lib/geo';
import { circleSprite, starSprite } from '../lib/sprites';
import { auroraFragment, auroraVertex } from '../lib/shaders/aurora';
import EarthGlobe, { PlanetAtmosphere } from './earth/EarthGlobe';
import NatureLayer from './earth/NatureLayer';
import CityLayer from './earth/CityLayer';

const R = 10;

// ─── Небо: звёзды, солнце, луна ──────────────────────────────────────────────

// ─── Небо: звёзды, солнце, луна ──────────────────────────────────────────────

/**
 * Звёздное небо в двух слоях: россыпь слабых звёзд и отдельные яркие светила.
 * Разделение нужно потому, что pointsMaterial задаёт один размер точки на весь
 * буфер — двумя слоями получаем разброс величин без кастомного шейдера.
 */
function StarLayer({ count, seed, size, minRadius, bright, dimmed, tex }) {
    const pointsRef = useRef();

    const [positions, colors] = useMemo(() => {
        const rand = seededRandom(seed);
        const pos = new Float32Array(count * 3);
        const col = new Float32Array(count * 3);
        const color = new THREE.Color();

        for (let i = 0; i < count; i += 1) {
            const radius = minRadius + rand() * 90;
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2 * rand() - 1);
            pos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            pos[i * 3 + 1] = radius * Math.cos(phi);
            pos[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

            // Разброс спектральных классов: голубые, белые и красные звёзды
            const roll = rand();
            const hue = roll < 0.18 ? 0.58 : roll < 0.78 ? 0.12 : 0.04;
            color.setHSL(hue, roll < 0.18 ? 0.4 : 0.22, (bright ? 0.82 : 0.7) + rand() * 0.18);
            col[i * 3] = color.r;
            col[i * 3 + 1] = color.g;
            col[i * 3 + 2] = color.b;
        }
        return [pos, col];
    }, [count, seed, minRadius, bright]);

    useFrame((state, delta) => {
        const points = pointsRef.current;
        if (!points) return;
        points.rotation.y += delta * 0.004;
        const twinkle = bright ? 0.85 + Math.sin(state.clock.elapsedTime * 1.7) * 0.12 : 0.8;
        points.material.opacity = dimmed ? 0.14 : twinkle;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                <bufferAttribute attach="attributes-color" args={[colors, 3]} />
            </bufferGeometry>
            <pointsMaterial
                size={size}
                vertexColors
                transparent
                opacity={0.85}
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

function StarDome({ dimmed }) {
    const tex = useMemo(() => starSprite(), []);
    return (
        <group>
            <StarLayer count={2200} seed={0x57a25} size={1.1} minRadius={130} dimmed={dimmed} tex={tex} />
            <StarLayer count={260} seed={0xb214e} size={3.4} minRadius={125} bright dimmed={dimmed} tex={tex} />
        </group>
    );
}

/**
 * Солнце и его свет. Направление считается единой функцией времени, тот же
 * вектор уходит в шейдеры Земли, облаков и атмосферы — поэтому терминатор,
 * блики на воде и тени зданий всегда согласованы.
 */
function SunSystem({ sunDir, nightMode, dimmed, onSelect }) {
    const lightRef = useRef();
    const sunRef = useRef();
    const phase = useRef(0);
    const targetPhase = nightMode ? Math.PI : 0;

    useFrame((state, delta) => {
        phase.current += (targetPhase - phase.current) * Math.min(1, delta * 1.1);
        sunDirection(state.clock.elapsedTime + phase.current / 0.055, sunDir.current);

        if (lightRef.current) {
            lightRef.current.position.copy(sunDir.current).multiplyScalar(70);
            lightRef.current.intensity = dimmed ? 0.35 : 2.6;
        }
        if (sunRef.current) {
            sunRef.current.position.copy(sunDir.current).multiplyScalar(105);
            const pulse = 1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.02;
            sunRef.current.scale.setScalar(dimmed ? pulse * 0.55 : pulse);
        }
    });

    return (
        <group>
            <directionalLight ref={lightRef} color="#fff6e8" intensity={2.6} />
            <group
                ref={sunRef}
                onClick={(e) => { e.stopPropagation(); onSelect('sunEnergy'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
            >
                <mesh>
                    <sphereGeometry args={[3.4, 24, 16]} />
                    <meshBasicMaterial color={dimmed ? '#c25a2a' : '#fff3c4'} />
                </mesh>
                <mesh>
                    <sphereGeometry args={[5.6, 20, 14]} />
                    <meshBasicMaterial
                        color={dimmed ? '#8a2f10' : '#ffb64a'}
                        transparent
                        opacity={0.24}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
                <mesh>
                    <sphereGeometry args={[9.5, 16, 12]} />
                    <meshBasicMaterial
                        color={dimmed ? '#5c1c08' : '#ff8c2a'}
                        transparent
                        opacity={0.06}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
            </group>
        </group>
    );
}

function MoonInSky({ darkened, onSelect }) {
    const groupRef = useRef();
    const meshRef = useRef();

    useFrame((state, delta) => {
        const t = state.clock.elapsedTime * 0.05 + 2.2;
        if (groupRef.current) {
            groupRef.current.position.set(
                Math.cos(t) * 46,
                Math.sin(t * 0.6) * 12 + 6,
                Math.sin(t) * 46,
            );
        }
        if (meshRef.current) meshRef.current.rotation.y += delta * 0.02;
    });

    return (
        <group
            ref={groupRef}
            onClick={(e) => { e.stopPropagation(); onSelect('moonPhase'); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh ref={meshRef}>
                <sphereGeometry args={[2.2, 32, 24]} />
                <meshStandardMaterial
                    color={darkened ? '#2a2d33' : '#cfd2d6'}
                    roughness={0.95}
                    metalness={0}
                />
            </mesh>
            {!darkened && (
                <mesh>
                    <sphereGeometry args={[3.0, 16, 12]} />
                    <meshBasicMaterial
                        color="#dce8ff"
                        transparent
                        opacity={0.09}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
            )}
            <pointLight intensity={darkened ? 0 : 0.35} distance={90} color="#bcd4ff" />
        </group>
    );
}

// ─── Полярное сияние ─────────────────────────────────────────────────────────

function AuroraCurtain({ pole, faded }) {
    const materialRef = useRef();

    const uniforms = useMemo(() => ({
        uColorLow: { value: new THREE.Color('#38ffb0') },
        uColorHigh: { value: new THREE.Color('#7b5cff') },
        uTime: { value: 0 },
        uIntensity: { value: 0.5 },
        uWave: { value: 0.5 },
    }), []);

    useFrame((state, delta) => {
        const u = materialRef.current?.uniforms;
        if (!u) return;
        u.uTime.value = state.clock.elapsedTime;
        const target = faded ? 0.05 : 0.55;
        u.uIntensity.value += (target - u.uIntensity.value) * Math.min(1, delta * 1.5);
    });

    const y = pole === 'north' ? R * 0.9 : -R * 0.9;

    return (
        <mesh position={[0, y, 0]} rotation={[pole === 'north' ? 0 : Math.PI, 0, 0]}>
            <cylinderGeometry args={[R * 0.4, R * 0.47, 2.2, 72, 1, true]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={auroraVertex}
                fragmentShader={auroraFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

// ─── Локальные явления цивилизации ───────────────────────────────────────────

/** Вспышки конфликтов в реальных горячих точках. */
function WarFlashes({ radius, atPeace }) {
    const pointsRef = useRef();
    const HOTSPOTS = useMemo(() => [
        { lat: 33.3, lon: 44.4 }, { lat: 34.8, lon: 38.9 }, { lat: 48.4, lon: 37.8 },
        { lat: 15.3, lon: 44.2 }, { lat: 12.6, lon: 30.2 }, { lat: 34.5, lon: 69.2 },
    ], []);

    const positions = useMemo(() => {
        const rand = seededRandom(0xc0ffee);
        const arr = new Float32Array(HOTSPOTS.length * 4 * 3);
        let i = 0;
        HOTSPOTS.forEach((spot) => {
            for (let k = 0; k < 4; k += 1) {
                const v = latLonToVec3(
                    spot.lat + (rand() - 0.5) * 3,
                    spot.lon + (rand() - 0.5) * 3,
                    radius + 0.12 + rand() * 0.25,
                );
                arr[i * 3] = v.x;
                arr[i * 3 + 1] = v.y;
                arr[i * 3 + 2] = v.z;
                i += 1;
            }
        });
        return arr;
    }, [HOTSPOTS, radius]);

    const tex = useMemo(() => circleSprite(), []);

    useFrame((state) => {
        const mat = pointsRef.current?.material;
        if (!mat) return;
        const t = state.clock.elapsedTime;
        mat.opacity = atPeace ? 0 : 0.55 + Math.sin(t * 6) * 0.35;
        mat.size = atPeace ? 0.1 : 0.42 + Math.sin(t * 9) * 0.16;
        mat.color.set(atPeace ? '#7dffb0' : '#ff5a1e');
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial
                color="#ff5a1e"
                size={0.42}
                transparent
                opacity={0.8}
                sizeAttenuation
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                map={tex}
                alphaMap={tex}
                alphaTest={0.01}
            />
        </points>
    );
}

/** Волновые кольца интерференции вокруг планеты. */
function InterferenceRings({ isolated }) {
    const groupRef = useRef();

    useFrame((state, delta) => {
        const group = groupRef.current;
        if (!group) return;
        const t = state.clock.elapsedTime;
        group.children.forEach((ring, i) => {
            if (isolated) {
                ring.scale.setScalar(Math.max(0.15, ring.scale.x - delta * 0.35));
                ring.material.opacity = Math.max(0, ring.material.opacity - delta * 0.25);
            } else {
                ring.scale.setScalar(1 + Math.sin(t * 1.4 + i * 1.3) * 0.06);
                ring.material.opacity = 0.2 + Math.sin(t * 2 + i * 1.5) * 0.09;
            }
        });
    });

    return (
        <group ref={groupRef}>
            {[R + 1.6, R + 2.7, R + 3.9].map((rad, i) => (
                <mesh key={rad} rotation={[Math.PI / 2, 0, i * 0.2]}>
                    <torusGeometry args={[rad, 0.05, 6, 96]} />
                    <meshBasicMaterial
                        color="#ff8cf0"
                        transparent
                        opacity={0.22}
                        side={THREE.DoubleSide}
                        blending={THREE.AdditiveBlending}
                        depthWrite={false}
                    />
                </mesh>
            ))}
        </group>
    );
}

// ─── Интерактивные факторы ───────────────────────────────────────────────────

function FactorTrigger({ position, factorId, label, color = '#ffffaa', warn = false }) {
    const reversed = useStore((s) => !!s.reversedFactors[factorId]);
    const setActiveFactor = useStore((s) => s.setActiveFactor);
    const meshRef = useRef();

    useFrame((state, delta) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        mesh.rotation.y += delta * 0.9;
        mesh.rotation.x += delta * 0.45;
        mesh.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.09);
    });

    const tone = warn ? (reversed ? '#9dffb4' : '#ff4433') : (reversed ? '#7fd4ff' : color);
    const [primary, secondary] = label.split(' / ');

    return (
        <group
            position={position}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh ref={meshRef}>
                <octahedronGeometry args={[0.5, 0]} />
                <meshBasicMaterial color={tone} wireframe />
            </mesh>
            <mesh>
                <sphereGeometry args={[0.95, 10, 8]} />
                <meshBasicMaterial color={tone} transparent opacity={0.06} depthWrite={false} />
            </mesh>
            {/* Billboard: планета вращается вместе с факторами, без него подписи
                на дальнем полушарии читались бы зеркально */}
            <Billboard position={[0, -0.95, 0]}>
                <Text
                    font="/Roboto-Regular.ttf"
                    fontSize={0.33}
                    color={tone}
                    anchorX="center"
                    anchorY="top"
                    outlineColor="black"
                    outlineWidth={0.055}
                >
                    {reversed ? (secondary || primary) : primary}
                </Text>
            </Billboard>
        </group>
    );
}

// lift подобран так, чтобы маркеры в центре видимого диска не подлетали
// вплотную к камере: чем ближе точка к центру полушария, тем меньше подъём.
const NATURE_FACTORS = [
    { id: 'ocean', label: 'ОКЕАН / ЗАСУХА', color: '#4ab5ff', lat: 12, lon: -145, lift: 1.9 },
    { id: 'waves', label: 'ВОЛНЫ / ШТИЛЬ', color: '#8ce0ff', lat: -26, lon: -112, lift: 1.7 },
    { id: 'tectonics', label: 'ТЕКТОНИКА / ЗЕМЛЕТРЯСЕНИЯ', color: '#d99a4a', lat: -20, lon: -68, lift: 2.4 },
    { id: 'photosynthesis', label: 'ФОТОСИНТЕЗ / УВЯДАНИЕ', color: '#4ecb4e', lat: -4, lon: -62, lift: 1.6 },
    { id: 'wildlife', label: 'БИОСФЕРА / ВЫМИРАНИЕ', color: '#d8a05a', lat: 44, lon: -101, lift: 1.7 },
    { id: 'migration', label: 'МИГРАЦИЯ / РАССЕИВАНИЕ', color: '#a9dcff', lat: 62, lon: -118, lift: 2.4 },
    { id: 'atmosphere', label: 'АТМОСФЕРА / ОПУСТЫНИВАНИЕ', color: '#dcdcff', lat: 22, lon: -46, lift: 2.8 },
    { id: 'aurora', label: 'ПОЛЯРНОЕ СИЯНИЕ / ЗАТУХАНИЕ', color: '#3fffcc', lat: 74, lon: -70, lift: 2.4 },
    { id: 'glaciers', label: 'ЛЕДНИКИ / ТАЯНИЕ', color: '#dff2ff', lat: -66, lon: -80, lift: 2.0 },
    { id: 'dayNight', label: 'ДЕНЬ / НОЧЬ', color: '#ffdd88', lat: 36, lon: -78, lift: 3.2 },
    { id: 'interference', label: 'ИНТЕРФЕРЕНЦИЯ / ИЗОЛЯЦИЯ', color: '#ff8cf0', lat: -44, lon: -38, lift: 2.4 },
    { id: 'starField', label: 'ЗВЁЗДНОЕ НЕБО / ТУМАН', color: '#ffffff', lat: 8, lon: -20, lift: 4.2 },
];

const CIVILISATION_FACTORS = [
    { id: 'war', label: 'ВОЙНА / МИР', warn: true, lat: 33, lon: 44, lift: 1.9 },
    { id: 'progress', label: 'ПРОГРЕСС / СТАГНАЦИЯ', color: '#8cd0ff', lat: 35.7, lon: 139.7, lift: 2.1 },
    { id: 'skyline', label: 'НЕБОСКРЁБЫ / РУИНЫ', color: '#cfe4ff', lat: 25.2, lon: 55.3, lift: 1.7 },
    { id: 'ecology', label: 'ИНДУСТРИЯ / ЭКОБАЛАНС', color: '#8dffab', lat: 31, lon: 114, lift: 2.3 },
    { id: 'urbanization', label: 'УРБАНИЗАЦИЯ / УПАДОК', color: '#aeaecf', lat: 28.6, lon: 77.2, lift: 1.5 },
    { id: 'trade', label: 'ТОРГОВЛЯ / ИЗОЛЯЦИЯ', color: '#ffcf55', lat: 4, lon: 80, lift: 2.2 },
    { id: 'culture', label: 'КУЛЬТУРА / ВАРВАРСТВО', color: '#ffaaff', lat: 41.9, lon: 12.5, lift: 2.1 },
    { id: 'energy', label: 'ЭНЕРГИЯ / ИСТОЩЕНИЕ', color: '#ff9147', lat: 24, lon: 52, lift: 2.8 },
    { id: 'language', label: 'ЯЗЫК / ШУМ', color: '#ffffff', lat: 52.5, lon: 13.4, lift: 1.9 },
    { id: 'law', label: 'ПРАВО / ПРОИЗВОЛ', color: '#9ad7ff', lat: 52, lon: 4.3, lift: 2.7 },
    { id: 'education', label: 'ОБРАЗОВАНИЕ / НЕВЕЖЕСТВО', color: '#ffe38a', lat: 55.8, lon: 37.6, lift: 2.2 },
    { id: 'medicine', label: 'МЕДИЦИНА / ЭПИДЕМИЯ', color: '#7dffb0', lat: 46.2, lon: 6.1, lift: 3.4 },
    { id: 'sunEnergy', label: 'СОЛНЦЕ / УГАСАНИЕ', color: '#ffaa00', lat: -20, lon: 120, lift: 3.0 },
];

function FactorField({ factors }) {
    return (
        <group>
            {factors.map((factor) => (
                <FactorTrigger
                    key={factor.id}
                    factorId={factor.id}
                    label={factor.label}
                    color={factor.color}
                    warn={factor.warn}
                    position={latLonToArray(factor.lat, factor.lon, R + factor.lift)}
                />
            ))}
        </group>
    );
}

// ─── Главная сцена ───────────────────────────────────────────────────────────

export default function Planet() {
    const stage = useStore((s) => s.stage);
    const reversedFactors = useStore((s) => s.reversedFactors);
    const setActiveFactor = useStore((s) => s.setActiveFactor);

    const planetGroup = useRef();
    const sunDir = useRef(new THREE.Vector3(1, 0.32, 0).normalize());

    const isNature = stage === 2;

    const globeTuning = useMemo(() => ({
        drought: reversedFactors.ocean ? 1 : 0,
        desert: reversedFactors.atmosphere ? 1 : 0,
        waveStrength: reversedFactors.waves ? 0.004 : 0.055,
        waveAmp: reversedFactors.waves ? 0.001 : 0.014,
        nightGlow: reversedFactors.urbanization ? 0.35 : 1.7,
        foam: reversedFactors.waves ? 0.15 : 1,
    }), [reversedFactors]);

    const cloudOpacity = reversedFactors.atmosphere ? 0.22 : 0.85;
    const smoggy = isNature ? false : !reversedFactors.ecology;

    return (
        <group>
            <ambientLight intensity={0.32} />

            <group>
                <StarDome dimmed={!!reversedFactors.starField} />
                <SunSystem
                    sunDir={sunDir}
                    nightMode={!!reversedFactors.dayNight}
                    dimmed={!!reversedFactors.sunEnergy}
                    onSelect={setActiveFactor}
                />
                <MoonInSky darkened={!!reversedFactors.moonPhase} onSelect={setActiveFactor} />

                <group ref={planetGroup}>
                    <EarthGlobe
                        radius={R}
                        segments={128}
                        sunDir={sunDir}
                        cloudOpacity={cloudOpacity}
                        atmosphereIntensity={reversedFactors.atmosphere ? 0.45 : 1.0}
                        tuning={globeTuning}
                    />

                    <NatureLayer
                        radius={R}
                        reversedFactors={reversedFactors}
                        setActiveFactor={setActiveFactor}
                        active={isNature}
                    />

                    <CityLayer
                        radius={R}
                        reversedFactors={reversedFactors}
                        setActiveFactor={setActiveFactor}
                        active={!isNature}
                    />

                    {isNature && (
                        <>
                            <AuroraCurtain pole="north" faded={!!reversedFactors.aurora} />
                            <AuroraCurtain pole="south" faded={!!reversedFactors.aurora} />
                            <InterferenceRings isolated={!!reversedFactors.interference} />
                        </>
                    )}

                    {!isNature && (
                        <>
                            <WarFlashes radius={R} atPeace={!!reversedFactors.war} />
                            {smoggy && (
                                <PlanetAtmosphere
                                    radius={R}
                                    sunDir={sunDir}
                                    color="#7c7a4e"
                                    sunsetColor="#8a6a3a"
                                    intensity={1.3}
                                    power={1.5}
                                    scale={1.09}
                                />
                            )}
                        </>
                    )}

                    <FactorField factors={isNature ? NATURE_FACTORS : CIVILISATION_FACTORS} />
                </group>
            </group>
        </group>
    );
}
