import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useEarthTextures } from '../../lib/earthTextures';
import {
    atmosphereFragment,
    atmosphereVertex,
    cloudsFragment,
    cloudsVertex,
    earthSurfaceFragment,
    earthSurfaceVertex,
} from '../../lib/shaders/earth';

/** Поверхность планеты: континенты с рельефом, океан с волнами, прибой, огни городов. */
function EarthSurface({ radius, segments, textures, sunDir, quality, tuning }) {
    const materialRef = useRef();

    const uniforms = useMemo(() => ({
        uDayMap: { value: textures.day },
        uNightMap: { value: textures.night },
        uWaterMask: { value: textures.water },
        uBumpMap: { value: textures.bump },
        uSunDir: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
        uWaterTint: { value: new THREE.Color('#1d4f8f') },
        uTime: { value: 0 },
        uNightGlow: { value: tuning.nightGlow },
        uDrought: { value: 0 },
        uDesert: { value: 0 },
        uWaveStrength: { value: tuning.waveStrength },
        uWaveAmp: { value: tuning.waveAmp },
        uBumpStrength: { value: tuning.bumpStrength },
        uFoam: { value: quality === 'high' ? tuning.foam : 0 },
        uAmbient: { value: tuning.ambient },
    }), [textures, tuning, quality]);

    useFrame((state) => {
        const u = materialRef.current?.uniforms;
        if (!u) return;
        u.uTime.value = state.clock.elapsedTime;
        u.uSunDir.value.copy(sunDir.current);

        // Реверс-факторы влияют на воду и растительность плавно, без рывков
        u.uDrought.value = THREE.MathUtils.lerp(u.uDrought.value, tuning.drought, 0.04);
        u.uDesert.value = THREE.MathUtils.lerp(u.uDesert.value, tuning.desert, 0.04);
        u.uWaveStrength.value = THREE.MathUtils.lerp(u.uWaveStrength.value, tuning.waveStrength, 0.05);
        u.uWaveAmp.value = THREE.MathUtils.lerp(u.uWaveAmp.value, tuning.waveAmp, 0.05);
        u.uNightGlow.value = THREE.MathUtils.lerp(u.uNightGlow.value, tuning.nightGlow, 0.05);
    });

    return (
        <mesh>
            <sphereGeometry args={[radius, segments, segments / 2]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={earthSurfaceVertex}
                fragmentShader={earthSurfaceFragment}
                uniforms={uniforms}
            />
        </mesh>
    );
}

/** Облачный покров: два дрейфующих слоя, затенённые на ночной стороне. */
function EarthClouds({ radius, textures, sunDir, opacity, drift }) {
    const materialRef = useRef();
    const meshRef = useRef();

    const uniforms = useMemo(() => ({
        uCloudMap: { value: textures.clouds },
        uSunDir: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
        uTime: { value: 0 },
        uOpacity: { value: opacity },
        uDrift: { value: drift },
    }), [textures, opacity, drift]);

    useFrame((state, delta) => {
        const u = materialRef.current?.uniforms;
        if (!u) return;
        u.uTime.value = state.clock.elapsedTime;
        u.uSunDir.value.copy(sunDir.current);
        u.uOpacity.value = THREE.MathUtils.lerp(u.uOpacity.value, opacity, 0.05);
        if (meshRef.current) meshRef.current.rotation.y += delta * 0.008;
    });

    return (
        <mesh ref={meshRef}>
            <sphereGeometry args={[radius, 64, 32]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={cloudsVertex}
                fragmentShader={cloudsFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                side={THREE.FrontSide}
            />
        </mesh>
    );
}

/**
 * Атмосфера. Френель по краю диска планеты плюс покраснение у терминатора —
 * это даёт закатный ободок без единого дополнительного прохода рендера.
 */
export function PlanetAtmosphere({
    radius,
    sunDir,
    color = '#4a9eff',
    sunsetColor = '#ff7a3c',
    intensity = 1.0,
    power = 2.6,
    scale = 1.055,
}) {
    const materialRef = useRef();

    const uniforms = useMemo(() => ({
        uColor: { value: new THREE.Color(color) },
        uSunsetColor: { value: new THREE.Color(sunsetColor) },
        uSunDir: { value: new THREE.Vector3(1, 0.3, 0).normalize() },
        uIntensity: { value: intensity },
        uPower: { value: power },
    }), [color, sunsetColor, intensity, power]);

    useEffect(() => {
        const u = materialRef.current?.uniforms;
        if (!u) return;
        u.uColor.value.set(color);
        u.uIntensity.value = intensity;
    }, [color, intensity]);

    useFrame(() => {
        const u = materialRef.current?.uniforms;
        if (!u || !sunDir) return;
        u.uSunDir.value.copy(sunDir.current);
    });

    return (
        <mesh scale={scale}>
            <sphereGeometry args={[radius, 48, 24]} />
            <shaderMaterial
                ref={materialRef}
                vertexShader={atmosphereVertex}
                fragmentShader={atmosphereFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                side={THREE.BackSide}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

const DEFAULT_TUNING = {
    nightGlow: 1.6,
    waveStrength: 0.055,
    waveAmp: 0.012,
    bumpStrength: 0.5,
    foam: 1.0,
    ambient: 0.1,
    drought: 0,
    desert: 0,
};

/**
 * Земля целиком: поверхность, облака и атмосфера с единым источником света.
 * Радиус параметризован, поэтому один и тот же глобус работает и как планета
 * под ногами на мезо-уровне, и как небесное тело в космосе.
 */
export default function EarthGlobe({
    radius = 10,
    segments = 128,
    sunDir,
    quality = 'high',
    cloudOpacity = 0.85,
    cloudDrift = 0.0035,
    atmosphereIntensity = 1.0,
    tuning: tuningOverrides,
    children,
}) {
    const textures = useEarthTextures();
    const tuning = useMemo(() => ({ ...DEFAULT_TUNING, ...tuningOverrides }), [tuningOverrides]);

    return (
        <group>
            <EarthSurface
                radius={radius}
                segments={segments}
                textures={textures}
                sunDir={sunDir}
                quality={quality}
                tuning={tuning}
            />
            {cloudOpacity > 0.01 && (
                <EarthClouds
                    radius={radius * 1.012}
                    textures={textures}
                    sunDir={sunDir}
                    opacity={cloudOpacity}
                    drift={cloudDrift}
                />
            )}
            <PlanetAtmosphere
                radius={radius}
                sunDir={sunDir}
                intensity={atmosphereIntensity}
                scale={1.045}
            />
            {children}
        </group>
    );
}
