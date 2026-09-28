import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../store';
import { latLonToArray, latLonToVec3, seededRandom, sunDirection, surfaceQuaternion } from '../lib/geo';
import { locationsForStage } from '../data/locations';
import { STAGE } from '../lib/stages';
import { circleSprite, starSprite } from '../lib/sprites';
import { auroraFragment, auroraVertex } from '../lib/shaders/aurora';
import FactorMarker from './effects/FactorMarker';
import EarthGlobe, { PlanetAtmosphere } from './earth/EarthGlobe';
import NatureLayer from './earth/NatureLayer';
import CityLayer from './earth/CityLayer';
import {
    Emissions,
    Evaporation,
    OceanCurrents,
    OzoneShell,
    PlateBoundaries,
    PressureSystems,
} from './earth/PlanetProcesses';

const R = 10;

/** Доворот планеты к городскому полушарию: центр диска приходится на ~65° в.д. */
const CITY_SPIN = THREE.MathUtils.degToRad(205);

/**
 * Природная карта смотрит серединой на ~35° з.д.: в диске одновременно
 * Амазония, Анды, Сахара, Гренландия, Атлантика и канадская тайга — все шесть
 * локаций без облёта.
 */
// Центр диска = −90° − поворот: 305° (то же, что −55°) выводит в центр 35° з.д.
// и оставляет до городского доворота короткие 100°, а не полный круг.
const NATURE_SPIN = THREE.MathUtils.degToRad(305);

/**
 * Слой «Планета» смотрит чуть восточнее — на 20° з.д.: в диске Атлантика со
 * стыками плит и течениями, промышленные Европа и восток США и циклоны.
 */
const PLANET_SPIN = THREE.MathUtils.degToRad(290);

const SPIN = {
    [STAGE.PLANET]: PLANET_SPIN,
    [STAGE.NATURE]: NATURE_SPIN,
    [STAGE.SOCIETY]: CITY_SPIN,
};

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
        <mesh position={[0, y, 0]} rotation={[pole === 'north' ? 0 : Math.PI, 0, 0]} raycast={() => {}}>
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

// ─── Интерактивные факторы ───────────────────────────────────────────────────

function FactorTrigger({ position, factorId, label, color = '#ffffaa', warn = false }) {
    const [primary, secondary] = label.split(' / ');

    return (
        <FactorMarker
            position={position}
            factorId={factorId}
            label={primary}
            reverseLabel={secondary || primary}
            color={warn ? '#ff5a3c' : color}
            reverseColor={warn ? '#9dffb4' : '#7fd4ff'}
            scale={1.25}
            labelOffset={-0.85}
        />
    );
}

// На карте остаются только факторы масштаба планеты. Всё местное живёт в
// локациях (data/locations.js) — с орбиты лес и пустыня одинаково выглядят
// цветным пятном, и факторы там были бы привязаны к пятну, а не к месту.
const PLANET_FACTORS = [
    { id: 'atmosphere', label: 'АТМОСФЕРА / ОПУСТЫНИВАНИЕ', color: '#dcdcff', lat: 47, lon: -42, lift: 2.4 },
    { id: 'aurora', label: 'ПОЛЯРНОЕ СИЯНИЕ / ЗАТУХАНИЕ', color: '#3fffcc', lat: 75, lon: -40, lift: 2.3 },
    { id: 'tectonics', label: 'ДРЕЙФ ПЛИТ / ЗЕМЛЕТРЯСЕНИЯ', color: '#ffb070', lat: -14, lon: -13, lift: 1.5 },
    { id: 'currents', label: 'ТЕЧЕНИЯ / ЗАСТОЙ', color: '#7fd4ff', lat: 37, lon: -64, lift: 1.4 },
    { id: 'waterCycle', label: 'КРУГОВОРОТ ВОДЫ / ИССУШЕНИЕ', color: '#9fe0ff', lat: 6, lon: -32, lift: 1.5 },
    { id: 'pressure', label: 'ЦИКЛОНЫ / БЛОКАДА', color: '#e8f0ff', lat: 21, lon: -58, lift: 2.2 },
    { id: 'emissions', label: 'ВЫБРОСЫ / ЧИСТОЕ НЕБО', warn: true, lat: 52, lon: 12, lift: 1.8 },
    { id: 'ozone', label: 'ОЗОНОВЫЙ СЛОЙ / ДЫРА', color: '#9a8cff', lat: -36, lon: 2, lift: 2.2 },
];

const CIVILISATION_FACTORS = [
    { id: 'war', label: 'ВОЙНА / МИР', warn: true, lat: 46, lon: 46, lift: 1.5 },
];

/**
 * Точка локации на глобусе: игла от поверхности и подпись. Клик ныряет в
 * диораму. Счётчик показывает, сколько факторов места уже перевёрнуто.
 */
function LocationPin({ location, radius }) {
    const enterLocation = useStore((s) => s.enterLocation);
    const reversed = useStore((s) => location.factors.filter((f) => s.reversedFactors[f]).length);
    const [hovered, setHovered] = useState(false);
    const groupRef = useRef();
    const scaleRef = useRef();
    const worldPos = useMemo(() => new THREE.Vector3(), []);
    const toCamera = useMemo(() => new THREE.Vector3(), []);

    const { position, quaternion } = useMemo(() => {
        const pos = latLonToVec3(location.lat, location.lon, radius + 0.9);
        return { position: pos.toArray(), quaternion: surfaceQuaternion(pos, new THREE.Quaternion()) };
    }, [location, radius]);

    useFrame((state, delta) => {
        const group = groupRef.current;
        if (!group) return;
        // На обратной стороне планеты подпись прячется, как и город за горизонтом
        group.getWorldPosition(worldPos);
        toCamera.copy(state.camera.position).sub(worldPos);
        group.visible = worldPos.dot(toCamera) > -radius * 0.2;
        const s = scaleRef.current;
        if (s) {
            const target = hovered ? 1.25 : 1;
            s.scale.setScalar(THREE.MathUtils.damp(s.scale.x, target, 8, delta));
        }
    });

    const onOver = (e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
    };
    const onOut = () => {
        setHovered(false);
        document.body.style.cursor = 'auto';
    };

    return (
        <group ref={groupRef} position={position} quaternion={quaternion}>
            <mesh raycast={() => null}>
                <cylinderGeometry args={[0.012, 0.012, 1.7, 6]} />
                <meshBasicMaterial color={location.accent} transparent opacity={0.55} toneMapped={false} />
            </mesh>
            <mesh position={[0, -0.84, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
                <ringGeometry args={[0.16, 0.22, 32]} />
                <meshBasicMaterial color={location.accent} transparent opacity={0.8} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            <Billboard position={[0, 0.95, 0]}>
                <group
                    ref={scaleRef}
                    onClick={(e) => { e.stopPropagation(); enterLocation(location.id); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerOver={onOver}
                    onPointerOut={onOut}
                >
                    <mesh>
                        <planeGeometry args={[3.3, 1.05]} />
                        <meshBasicMaterial color="#000000" transparent opacity={hovered ? 0.72 : 0.5} depthWrite={false} />
                    </mesh>
                    <mesh position={[-1.58, 0, 0.001]} raycast={() => null}>
                        <planeGeometry args={[0.06, 1.05]} />
                        <meshBasicMaterial color={location.accent} toneMapped={false} />
                    </mesh>
                    <Text
                        font="/Roboto-Regular.ttf"
                        position={[-1.4, 0.16, 0.01]}
                        fontSize={0.34}
                        letterSpacing={0.12}
                        color="#ffffff"
                        anchorX="left"
                        anchorY="middle"
                        raycast={() => null}
                    >
                        {location.title.toUpperCase()}
                    </Text>
                    <Text
                        font="/Roboto-Regular.ttf"
                        position={[-1.4, -0.23, 0.01]}
                        fontSize={0.2}
                        color={location.accent}
                        fillOpacity={0.85}
                        anchorX="left"
                        anchorY="middle"
                        raycast={() => null}
                    >
                        {`${location.place} · ${reversed}/${location.factors.length}`}
                    </Text>
                </group>
            </Billboard>
        </group>
    );
}

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
    const enterLocation = useStore((s) => s.enterLocation);
    // Ледники на карте — вход в Арктику: сам фактор живёт в локации
    const openArctic = useCallback(() => enterLocation('arctic'), [enterLocation]);

    const planetGroup = useRef();
    const sunDir = useRef(new THREE.Vector3(1, 0.32, 0).normalize());

    const isPlanet = stage === STAGE.PLANET;
    const isNature = stage === STAGE.NATURE;
    const isSociety = stage === STAGE.SOCIETY;

    // Камера не облетает шар: природа — Америки к объективу, цивилизация — Азия.
    const firstSpin = useRef(true);
    useEffect(() => {
        if (!planetGroup.current) return;
        // Поворот на ровные 180° выводил в центр кадра 90° в.д., и вся Европа
        // с Ближним Востоком оказывалась у самого лимба, где проекция сжимает
        // точки в кучу. Доворот до 205° ставит в центр ~65° в.д. — материки
        // от Рима до Токио умещаются в диске без давки.
        const targetY = SPIN[stage] ?? NATURE_SPIN;

        if (firstSpin.current) {
            firstSpin.current = false;
            planetGroup.current.rotation.y = targetY;
            return undefined;
        }

        const tween = gsap.to(planetGroup.current.rotation, {
            y: targetY,
            duration: 2.4,
            ease: 'power2.inOut',
        });
        return () => tween.kill();
    }, [stage]);

    const globeTuning = useMemo(() => ({
        drought: reversedFactors.ocean || reversedFactors.waterCycle ? 1 : 0,
        desert: reversedFactors.atmosphere ? 1 : 0,
        waveStrength: reversedFactors.waves ? 0.004 : 0.055,
        waveAmp: reversedFactors.waves ? 0.001 : 0.014,
        nightGlow: reversedFactors.urbanization ? 0.35 : 1.7,
        foam: reversedFactors.waves ? 0.15 : 1,
    }), [reversedFactors]);

    const cloudOpacity = reversedFactors.atmosphere ? 0.22 : (reversedFactors.waterCycle ? 0.4 : 0.85);
    const smoggy = isSociety && !reversedFactors.ecology;

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
                        setActiveFactor={openArctic}
                        active={isNature}
                    />

                    <CityLayer radius={R} reversedFactors={reversedFactors} />

                    {isPlanet && (
                        <>
                            <AuroraCurtain pole="north" faded={!!reversedFactors.aurora} />
                            <AuroraCurtain pole="south" faded={!!reversedFactors.aurora} />
                            <PlateBoundaries radius={R} quaking={!!reversedFactors.tectonics} />
                            <OceanCurrents radius={R} stagnant={!!reversedFactors.currents} />
                            <Evaporation radius={R} dry={!!reversedFactors.waterCycle} />
                            <PressureSystems radius={R} blocked={!!reversedFactors.pressure} />
                            <Emissions radius={R} clean={!!reversedFactors.emissions} />
                            <OzoneShell radius={R} depleted={!!reversedFactors.ozone} />
                            {!reversedFactors.emissions && (
                                <PlanetAtmosphere
                                    radius={R}
                                    sunDir={sunDir}
                                    color="#8a7a58"
                                    sunsetColor="#8a6a3a"
                                    intensity={0.55}
                                    power={1.8}
                                    scale={1.075}
                                />
                            )}
                        </>
                    )}

                    {isSociety && (
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

                    <FactorField factors={isPlanet ? PLANET_FACTORS : (isSociety ? CIVILISATION_FACTORS : [])} />
                    {locationsForStage(stage).map((location) => (
                        <LocationPin key={location.id} location={location} radius={R} />
                    ))}
                </group>
            </group>
        </group>
    );
}
