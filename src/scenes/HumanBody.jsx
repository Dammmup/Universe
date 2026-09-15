import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { BODY_REGIONS } from '../data/body';
import { buildFigure, disposeFigure } from '../lib/anatomy';
import { fresnelFragment, fresnelVertex, tissueFragment, tissueVertex } from '../lib/shaders/life';
import FactorMarker from './effects/FactorMarker';

const _dummy = new THREE.Object3D();

/**
 * Подпись органа. Слой светлый, поэтому текст тёмный с белой обводкой:
 * прежняя белая надпись в чёрном канте читалась как врезка из другого макета.
 *
 * В общем плане названия органов молчат: там кадр принадлежит областям тела, и
 * четыре анатомических подписи поверх шести названий областей — каша. Органы
 * подписываются, когда область выбрана и камера уже стоит рядом.
 */
function Label({ position, children, region, size = 0.16 }) {
    const bodyRegion = useStore((s) => s.bodyRegion);
    if (bodyRegion !== region) return null;

    return (
        <Billboard position={position}>
            <Text
                font="/Roboto-Regular.ttf"
                fontSize={size}
                letterSpacing={0.12}
                color="#243043"
                fillOpacity={0.85}
                anchorX="center"
                anchorY="middle"
                outlineColor="#ffffff"
                outlineWidth={0.014}
                outlineOpacity={0.85}
            >
                {children}
            </Text>
        </Billboard>
    );
}

function FactorOrb({ position, factorId, label, reverseLabel, color, reverseColor, size = 0.9 }) {
    return (
        <FactorMarker
            position={position}
            factorId={factorId}
            label={label}
            reverseLabel={reverseLabel}
            color={color}
            reverseColor={reverseColor}
            scale={0.62 * size}
            labelOffset={-0.85}
            hitRadius={0.48 * size}
            theme="light"
        />
    );
}

function TissueOrgan({ geometry, color, crease, emissive, glow = 0.35, fold = 0.045, alpha = 0.92, scale, position, rotation }) {
    const uniforms = useMemo(() => ({
        uTime: { value: 0 },
        uFold: { value: fold },
        uColor: { value: new THREE.Color(color) },
        uCrease: { value: new THREE.Color(crease) },
        uEmissive: { value: new THREE.Color(emissive) },
        uGlow: { value: glow },
        uAlpha: { value: alpha },
    }), [alpha, color, crease, emissive, fold, glow]);

    useFrame((state) => {
        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uGlow.value = glow;
        uniforms.uFold.value = fold;
        uniforms.uColor.value.set(color);
        uniforms.uCrease.value.set(crease);
        uniforms.uEmissive.value.set(emissive);
        uniforms.uAlpha.value = alpha;
    });

    return (
        <mesh geometry={geometry} position={position} rotation={rotation} scale={scale}>
            <shaderMaterial
                vertexShader={tissueVertex}
                fragmentShader={tissueFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
            />
        </mesh>
    );
}

function makeCurve(pts) {
    return new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
}

function FlowCells({ curve, count, color, speed, reversed, radius = 0.035 }) {
    const meshRef = useRef();

    useFrame((state) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime * (reversed ? speed * 0.18 : speed);
        for (let i = 0; i < count; i += 1) {
            const u = (i / count + t) % 1;
            curve.getPointAt(u, _dummy.position);
            _dummy.scale.setScalar(reversed ? 0.55 : 1);
            _dummy.updateMatrix();
            mesh.setMatrixAt(i, _dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <sphereGeometry args={[radius, 8, 8]} />
            <meshBasicMaterial color={color} transparent opacity={reversed ? 0.3 : 0.95} />
        </instancedMesh>
    );
}

function Heart({ reversed }) {
    const pulse = useRef();
    const ventricle = useMemo(() => new THREE.SphereGeometry(0.28, 28, 20), []);
    const atrium = useMemo(() => new THREE.SphereGeometry(0.16, 20, 16), []);
    const aorta = useMemo(() => makeCurve([
        [0.02, 1.05, 0.42],
        [0.05, 1.38, 0.38],
        [0.22, 1.52, 0.28],
        [0.05, 1.48, 0.12],
        [-0.05, 0.55, 0.18],
        [-0.02, -0.85, 0.12],
        [-0.04, -2.15, 0.08],
    ]), []);

    useFrame((state) => {
        if (!pulse.current) return;
        const beat = reversed
            ? 0.88 + Math.sin(state.clock.elapsedTime * 1.3) * 0.03
            : 1 + Math.pow(Math.max(0, Math.sin(state.clock.elapsedTime * 6.2)), 8) * 0.16;
        pulse.current.scale.setScalar(beat);
    });

    const color = reversed ? '#5a1e22' : '#e0233a';
    const crease = reversed ? '#3a1014' : '#8a1020';

    return (
        <group>
            <group ref={pulse} position={[0.08, 0.92, 0.42]} scale={1.18}>
                <TissueOrgan
                    geometry={ventricle}
                    color={color}
                    crease={crease}
                    emissive={reversed ? '#190407' : '#7a1020'}
                    glow={reversed ? 0.12 : 0.55}
                    fold={0.03}
                    scale={[1.05, 1.2, 0.9]}
                    position={[0.06, -0.04, 0]}
                />
                <TissueOrgan
                    geometry={ventricle}
                    color={reversed ? '#4a1820' : '#c41e38'}
                    crease={crease}
                    emissive="#4a0810"
                    glow={reversed ? 0.1 : 0.4}
                    fold={0.025}
                    scale={[0.78, 0.95, 0.82]}
                    position={[-0.16, -0.06, 0.08]}
                />
                <mesh geometry={atrium} position={[0.16, 0.22, 0.02]} scale={[1.05, 0.8, 0.9]}>
                    <meshStandardMaterial color={reversed ? '#5a1e22' : '#ff6677'} emissive="#33050a" emissiveIntensity={0.35} roughness={0.5} />
                </mesh>
                <mesh geometry={atrium} position={[-0.14, 0.2, 0.08]} scale={[0.95, 0.75, 0.85]}>
                    <meshStandardMaterial color={reversed ? '#5a1e22' : '#ff6677'} emissive="#33050a" emissiveIntensity={0.35} roughness={0.5} />
                </mesh>
            </group>
            <mesh>
                <tubeGeometry args={[aorta, 48, reversed ? 0.028 : 0.045, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#773333' : '#ff243f'}
                    emissive={reversed ? '#200808' : '#66111a'}
                    emissiveIntensity={0.45}
                    roughness={0.4}
                />
            </mesh>
        </group>
    );
}

function Lungs({ reversed }) {
    const ref = useRef();
    const lobe = useMemo(() => new THREE.SphereGeometry(0.42, 28, 22), []);
    const trachea = useMemo(() => makeCurve([
        [0, 1.72, 0.22],
        [0, 1.42, 0.24],
        [0, 1.22, 0.26],
    ]), []);
    const leftBronchus = useMemo(() => makeCurve([
        [0, 1.22, 0.26],
        [-0.22, 1.12, 0.24],
        [-0.42, 0.95, 0.2],
    ]), []);
    const rightBronchus = useMemo(() => makeCurve([
        [0, 1.22, 0.26],
        [0.24, 1.12, 0.24],
        [0.46, 0.95, 0.2],
    ]), []);

    useFrame((state) => {
        if (!ref.current) return;
        const breath = reversed
            ? 0.9 + Math.sin(state.clock.elapsedTime * 1.05) * 0.02
            : 1 + Math.sin(state.clock.elapsedTime * 1.7) * 0.07;
        ref.current.scale.set(1, breath, 1);
    });

    const color = reversed ? '#51606a' : '#7ec8e8';
    const crease = reversed ? '#2d3840' : '#3d7a96';

    return (
        <group ref={ref}>
            <TissueOrgan
                geometry={lobe}
                color={color}
                crease={crease}
                emissive={reversed ? '#101418' : '#1a5068'}
                glow={reversed ? 0.08 : 0.28}
                fold={0.1}
                alpha={0.72}
                scale={[0.85, 1.25, 0.62]}
                position={[-0.52, 1.02, 0.18]}
                rotation={[0.12, 0.2, 0.08]}
            />
            <TissueOrgan
                geometry={lobe}
                color={color}
                crease={crease}
                emissive={reversed ? '#101418' : '#1a5068'}
                glow={reversed ? 0.08 : 0.28}
                fold={0.1}
                alpha={0.72}
                scale={[0.92, 1.32, 0.66]}
                position={[0.55, 1.0, 0.18]}
                rotation={[0.12, -0.2, -0.08]}
            />
            <mesh>
                <tubeGeometry args={[trachea, 12, 0.045, 8, false]} />
                <meshStandardMaterial color="#d7f2ff" transparent opacity={0.7} roughness={0.45} />
            </mesh>
            <mesh>
                <tubeGeometry args={[leftBronchus, 10, 0.028, 6, false]} />
                <meshStandardMaterial color="#c5e8f6" transparent opacity={0.65} />
            </mesh>
            <mesh>
                <tubeGeometry args={[rightBronchus, 10, 0.028, 6, false]} />
                <meshStandardMaterial color="#c5e8f6" transparent opacity={0.65} />
            </mesh>
        </group>
    );
}

function Brain({ reversed }) {
    const hemi = useMemo(() => new THREE.SphereGeometry(0.48, 40, 28), []);
    const glow = reversed ? 0.12 : 0.42;

    return (
        <group position={[0, 2.18, 0.12]}>
            <TissueOrgan
                geometry={hemi}
                color={reversed ? '#8a6680' : '#e8a0c8'}
                crease={reversed ? '#4a3048' : '#b06090'}
                emissive={reversed ? '#201020' : '#7a1457'}
                glow={glow}
                fold={0.055}
                scale={[0.78, 0.62, 0.7]}
                position={[-0.22, 0, 0]}
            />
            <TissueOrgan
                geometry={hemi}
                color={reversed ? '#8a6680' : '#e8a0c8'}
                crease={reversed ? '#4a3048' : '#b06090'}
                emissive={reversed ? '#201020' : '#7a1457'}
                glow={glow}
                fold={0.055}
                scale={[0.78, 0.62, 0.7]}
                position={[0.22, 0, 0]}
            />
            <mesh position={[0, -0.32, 0.05]} scale={[0.55, 0.32, 0.48]}>
                <sphereGeometry args={[0.28, 18, 14]} />
                <meshStandardMaterial
                    color={reversed ? '#6a5068' : '#d080b0'}
                    emissive="#4a1438"
                    emissiveIntensity={reversed ? 0.1 : 0.3}
                    roughness={0.6}
                />
            </mesh>
            <mesh position={[0, -0.55, 0.04]}>
                <cylinderGeometry args={[0.07, 0.1, 0.45, 10]} />
                <meshStandardMaterial color={reversed ? '#665577' : '#dd99ff'} roughness={0.5} />
            </mesh>
        </group>
    );
}

function DigestiveSystem({ reversed }) {
    const gutRef = useRef();
    const gut = useMemo(() => {
        const pts = [];
        for (let i = 0; i <= 48; i += 1) {
            const t = i / 48;
            const a = t * Math.PI * 5.5;
            pts.push(new THREE.Vector3(
                Math.cos(a) * (0.32 + t * 0.12),
                -0.35 - t * 0.95,
                0.28 + Math.sin(a) * 0.16,
            ));
        }
        return new THREE.CatmullRomCurve3(pts);
    }, []);
    const stomach = useMemo(() => new THREE.SphereGeometry(0.26, 22, 16), []);

    useFrame((state) => {
        if (!gutRef.current) return;
        gutRef.current.rotation.z = Math.sin(state.clock.elapsedTime * (reversed ? 0.5 : 1.2)) * 0.04;
    });

    return (
        <group ref={gutRef}>
            <TissueOrgan
                geometry={stomach}
                color={reversed ? '#5b4a2a' : '#d4a056'}
                crease={reversed ? '#2a2010' : '#8a6030'}
                emissive={reversed ? '#191000' : '#3d2104'}
                glow={0.2}
                fold={0.04}
                scale={[1.15, 0.72, 0.7]}
                position={[0.22, -0.12, 0.32]}
                rotation={[0.1, 0, -0.35]}
            />
            <mesh>
                <tubeGeometry args={[gut, 64, reversed ? 0.04 : 0.055, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#5b4a2a' : '#c48a3a'}
                    emissive={reversed ? '#191000' : '#3d2104'}
                    emissiveIntensity={0.2}
                    roughness={0.7}
                />
            </mesh>
        </group>
    );
}

function Circulation({ reversed }) {
    const arterial = useMemo(() => makeCurve([
        [0.08, 0.95, 0.42],
        [0.05, 1.45, 0.22],
        [0, 2.05, 0.12],
        [0, 2.35, 0.1],
    ]), []);
    const leftArm = useMemo(() => makeCurve([
        [0.05, 1.35, 0.22],
        [-0.55, 1.15, 0.18],
        [-1.15, 0.35, 0.08],
        [-1.35, -0.55, 0.02],
    ]), []);
    const rightArm = useMemo(() => makeCurve([
        [0.05, 1.35, 0.22],
        [0.55, 1.15, 0.18],
        [1.15, 0.35, 0.08],
        [1.35, -0.55, 0.02],
    ]), []);
    const leftLeg = useMemo(() => makeCurve([
        [-0.04, -0.85, 0.12],
        [-0.22, -1.55, 0.08],
        [-0.32, -2.45, 0.04],
        [-0.28, -3.15, 0.02],
    ]), []);
    const rightLeg = useMemo(() => makeCurve([
        [-0.04, -0.85, 0.12],
        [0.22, -1.55, 0.08],
        [0.32, -2.45, 0.04],
        [0.28, -3.15, 0.02],
    ]), []);
    const venous = useMemo(() => makeCurve([
        [0.18, -0.2, 0.35],
        [0.28, 0.55, 0.3],
        [0.12, 1.15, 0.32],
        [0.08, 0.95, 0.42],
    ]), []);

    const vesselColor = reversed ? '#773333' : '#ff243f';
    const veinColor = reversed ? '#223355' : '#3f7cff';

    return (
        <group>
            {[arterial, leftArm, rightArm, leftLeg, rightLeg].map((curve, i) => (
                <mesh key={`a${i}`}>
                    <tubeGeometry args={[curve, 28, 0.028, 6, false]} />
                    <meshStandardMaterial
                        color={vesselColor}
                        emissive={vesselColor}
                        emissiveIntensity={reversed ? 0.1 : 0.35}
                        roughness={0.45}
                        transparent
                        opacity={reversed ? 0.4 : 0.85}
                    />
                </mesh>
            ))}
            <mesh>
                <tubeGeometry args={[venous, 20, 0.024, 6, false]} />
                <meshStandardMaterial
                    color={veinColor}
                    emissive={veinColor}
                    emissiveIntensity={reversed ? 0.08 : 0.3}
                    transparent
                    opacity={reversed ? 0.35 : 0.75}
                />
            </mesh>
            <FlowCells curve={arterial} count={10} color="#ff6a7a" speed={0.22} reversed={reversed} />
            <FlowCells curve={leftArm} count={8} color="#ff6a7a" speed={0.18} reversed={reversed} />
            <FlowCells curve={rightArm} count={8} color="#ff6a7a" speed={0.18} reversed={reversed} />
            <FlowCells curve={leftLeg} count={8} color="#ff6a7a" speed={0.16} reversed={reversed} />
            <FlowCells curve={rightLeg} count={8} color="#ff6a7a" speed={0.16} reversed={reversed} />
            <FlowCells curve={venous} count={8} color="#7aa6ff" speed={0.14} reversed={reversed} radius={0.03} />
        </group>
    );
}

function AuraSwarm({ reversed, color, seed, count = 72 }) {
    const meshRef = useRef();
    const tint = useMemo(() => new THREE.Color(color), [color]);
    const seeds = useMemo(() => {
        const arr = [];
        const rand = (n) => {
            const x = Math.sin(seed * 999 + n * 17.13) * 43758.5453;
            return x - Math.floor(x);
        };
        for (let i = 0; i < count; i += 1) {
            arr.push({
                theta: rand(i) * Math.PI * 2,
                phi: Math.acos(2 * rand(i + 40) - 1),
                r: 1.25 + rand(i + 80) * 1.15,
                speed: 0.1 + rand(i + 120) * 0.22,
            });
        }
        return arr;
    }, [count, seed]);

    useFrame((state) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < seeds.length; i += 1) {
            const s = seeds[i];
            const a = s.theta + t * s.speed * (reversed ? 0.15 : 1);
            _dummy.position.set(
                Math.sin(s.phi) * Math.cos(a) * s.r * 1.2,
                Math.cos(s.phi) * s.r * 2.25 + Math.sin(t * 0.7 + i) * 0.08,
                Math.sin(s.phi) * Math.sin(a) * s.r * 0.55 - 0.12,
            );
            _dummy.scale.setScalar(reversed ? 0.4 : 0.75 + Math.sin(t * 2 + i) * 0.18);
            _dummy.updateMatrix();
            mesh.setMatrixAt(i, _dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshBasicMaterial
                color={reversed ? '#8a93a0' : tint}
                transparent
                opacity={reversed ? 0.22 : 0.7}
                depthWrite={false}
            />
        </instancedMesh>
    );
}

function EmotionalAura({ reversed }) {
    return (
        <group>
            <AuraSwarm reversed={reversed} color="#ffdc62" seed={1} />
            <AuraSwarm reversed={reversed} color="#ff8fd2" seed={2} />
            <AuraSwarm reversed={reversed} color="#8fd2ff" seed={3} />
        </group>
    );
}

function HumanBackdrop({ mode }) {
    return (
        <group position={[0, 0.1, -1.8]}>
            <mesh raycast={() => null}>
                <ringGeometry args={[4.6, 5.5, 72]} />
                <meshBasicMaterial
                    color={mode === 'emotions' ? '#ff8fd2' : '#75cfff'}
                    transparent
                    opacity={0.16}
                    depthWrite={false}
                />
            </mesh>
        </group>
    );
}

/**
 * Фигура человека.
 *
 * Модель `/model.gltf` заменена на процедурную анатомию (`lib/anatomy.js`):
 * прежний манекен с прямоугольным торсом и палками вместо рук не спасал
 * никакой материал — силуэт задаётся геометрией, а не шейдером.
 *
 * Тело не перехватывает лучи: клики должны доходить до зон наведения областей,
 * которые лежат внутри оболочки.
 */
function AnatomyFigure({ reversedFactors, mode }) {
    const stressReversed = !!reversedFactors.stress;
    const breathRef = useRef();
    const figure = useMemo(() => buildFigure(), []);

    useEffect(() => () => disposeFigure(figure), [figure]);

    const skinMaterial = useMemo(() => new THREE.MeshStandardMaterial({
        color: new THREE.Color(mode === 'emotions'
            ? (stressReversed ? '#d98aa6' : '#f0b6cd')
            : (stressReversed ? '#d9a186' : '#e8c3ab')),
        emissive: new THREE.Color(mode === 'emotions' ? '#5a2038' : '#553220'),
        emissiveIntensity: 0.1,
        roughness: 0.34,
        metalness: 0,
        transparent: true,
        opacity: mode === 'emotions' ? 0.42 : 0.36,
        depthWrite: false,
        side: THREE.FrontSide,
    }), [mode, stressReversed]);

    // Контурная оболочка: полупрозрачное тело на светлом фоне теряет силуэт,
    // френель по краю возвращает объём, не закрывая органы внутри
    const rimMaterial = useMemo(() => new THREE.ShaderMaterial({
        vertexShader: fresnelVertex,
        fragmentShader: fresnelFragment,
        uniforms: {
            uColor: { value: new THREE.Color(mode === 'emotions' ? '#f3d3e2' : '#eadcd0') },
            uRim: { value: new THREE.Color(mode === 'emotions' ? '#8c4a6b' : '#55657c') },
            uPower: { value: 2.4 },
            uAlpha: { value: 0.03 },
            uGain: { value: 1 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
    }), [mode]);

    useEffect(() => () => {
        skinMaterial.dispose();
        rimMaterial.dispose();
    }, [skinMaterial, rimMaterial]);

    useFrame((state) => {
        if (!breathRef.current) return;
        const b = 1 + Math.sin(state.clock.elapsedTime * 1.25) * 0.008;
        breathRef.current.scale.set(1 + (b - 1) * 0.6, b, 1 + (b - 1) * 0.6);
    });

    const parts = Object.entries(figure);

    return (
        <group ref={breathRef}>
            <HumanBackdrop mode={mode} />
            {parts.map(([key, geometry]) => (
                <group key={key}>
                    <mesh geometry={geometry} material={skinMaterial} raycast={() => null} />
                    <mesh geometry={geometry} material={rimMaterial} scale={1.012} raycast={() => null} />
                </group>
            ))}
        </group>
    );
}

/**
 * Области тела: невидимые зоны наведения внутри оболочки. По самой поверхности
 * тела грудь от живота не отличить — это одна непрерывная оболочка, поэтому
 * прицел даёт отдельная геометрия.
 *
 * Пока область не выбрана, в кадре только названия областей. Выбор области
 * подводит камеру и раскрывает её факторы — иначе два десятка подписей висели
 * бы поверх фигуры одновременно.
 */
function BodyRegions() {
    const bodyRegion = useStore((s) => s.bodyRegion);
    const setBodyRegion = useStore((s) => s.setBodyRegion);
    const [hovered, setHovered] = useState(null);

    return (
        <group>
            {BODY_REGIONS.map((region) => {
                const active = bodyRegion === region.id;
                const isHovered = hovered === region.id;
                const muted = bodyRegion && !active;

                return (
                    <group key={region.id}>
                        {region.hotspots.map((spot, index) => (
                            <mesh
                                key={index}
                                position={spot.pos}
                                rotation={[0, 0, spot.tilt ?? 0]}
                                onPointerOver={(e) => {
                                    e.stopPropagation();
                                    setHovered(region.id);
                                    document.body.style.cursor = 'pointer';
                                }}
                                onPointerOut={() => {
                                    setHovered((current) => (current === region.id ? null : current));
                                    document.body.style.cursor = 'auto';
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setBodyRegion(active ? null : region.id);
                                }}
                            >
                                {spot.shape === 'sphere'
                                    ? <sphereGeometry args={[spot.radius, 20, 16]} />
                                    : <capsuleGeometry args={[spot.radius, spot.height, 6, 18]} />}
                                <meshBasicMaterial
                                    color={active ? '#2ec5d6' : '#5b7fa6'}
                                    transparent
                                    opacity={active ? 0.16 : (isHovered ? 0.12 : 0)}
                                    depthWrite={false}
                                />
                            </mesh>
                        ))}

                        {!bodyRegion && (
                            <Billboard position={region.labelAt}>
                                <Text
                                    font="/Roboto-Regular.ttf"
                                    fontSize={0.26}
                                    letterSpacing={0.16}
                                    color={isHovered ? '#0f766e' : '#3d4a5c'}
                                    fillOpacity={isHovered ? 1 : 0.78}
                                    anchorX="center"
                                    anchorY="middle"
                                    outlineColor="#ffffff"
                                    outlineWidth={0.012}
                                    outlineOpacity={0.9}
                                    raycast={() => null}
                                >
                                    {region.title.toUpperCase()}
                                </Text>
                            </Billboard>
                        )}

                        {active && region.factors.map((factor) => (
                            <FactorMarker
                                key={factor.id}
                                position={factor.pos}
                                factorId={factor.id}
                                label={factor.label}
                                reverseLabel={factor.reverse}
                                color={factor.color}
                                reverseColor="#8b93a3"
                                scale={0.42}
                                labelOffset={-0.62}
                                hitRadius={0.4}
                                theme="light"
                            />
                        ))}

                        {muted && null}
                    </group>
                );
            })}
        </group>
    );
}

/**
 * Органы авторились под прежнюю модель ростом ≈ 6 единиц (стопы на -3.15) и
 * пересчитываются под новую фигуру двумя разными преобразованиями.
 *
 * Сосуды тянутся от шеи до стоп, поэтому их растягивают по росту. Отдельные
 * органы по той же шкале раздувались до размера туловища: у них своя, меньшая
 * шкала и свой сдвиг — чтобы мозг попал в череп, а не повис над макушкой.
 */
const VESSEL_FIT = { scale: 1.23, offsetY: 0.22 };
const ORGAN_FIT = { scale: 0.97, offsetY: 1.13 };

/**
 * Позвоночник. Единственный орган, построенный сразу в координатах фигуры:
 * область «Позвоночник» была, а столба в теле не было — камера заходила со
 * спины и показывала пустую оболочку.
 */
function Spine({ reversed }) {
    const curve = useMemo(() => makeCurve([
        [0, 0.05, -0.10],
        [0, 0.55, -0.20],
        [0, 1.05, -0.26],   // поясничный лордоз
        [0, 1.60, -0.30],
        [0, 2.10, -0.28],   // грудной кифоз
        [0, 2.50, -0.20],
        [0, 2.86, -0.10],   // шейный отдел
    ]), []);

    const vertebrae = useMemo(() => {
        const items = [];
        const up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i < 20; i += 1) {
            const u = i / 19;
            const point = curve.getPointAt(u);
            const tangent = curve.getTangentAt(u);
            const quat = new THREE.Quaternion().setFromUnitVectors(up, tangent);
            // Позвонки крупнее в пояснице и мельче к шее — там меньше нагрузка
            const radius = 0.115 - u * 0.045;
            items.push({ pos: point.toArray(), quat: [quat.x, quat.y, quat.z, quat.w], radius });
        }
        return items;
    }, [curve]);

    const tone = reversed ? '#8a8f98' : '#dcd3c4';

    return (
        <group>
            <mesh raycast={() => null}>
                <tubeGeometry args={[curve, 48, 0.045, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#6c727c' : '#c9bfae'}
                    roughness={0.6}
                    metalness={0}
                    transparent
                    opacity={0.9}
                />
            </mesh>
            {vertebrae.map((item, index) => (
                <mesh key={index} position={item.pos} quaternion={item.quat} raycast={() => null}>
                    <cylinderGeometry args={[item.radius, item.radius, 0.055, 14]} />
                    <meshStandardMaterial color={tone} roughness={0.55} metalness={0} />
                </mesh>
            ))}
        </group>
    );
}

function OrganLayer({ reversedFactors }) {
    const circulationReversed = !!reversedFactors.circulation;
    const breathingReversed = !!reversedFactors.breathing;
    const digestionReversed = !!reversedFactors.digestion;
    const cognitionReversed = !!reversedFactors.memory;

    return (
        <group>
            <Spine reversed={!!reversedFactors.posture} />
            <group scale={VESSEL_FIT.scale} position={[0, VESSEL_FIT.offsetY, 0]}>
                <Circulation reversed={circulationReversed} />
            </group>
            <group scale={ORGAN_FIT.scale} position={[0, ORGAN_FIT.offsetY, 0]}>
                {/* Доводка по органам: общий пересчёт ставит их в правильную
                    треть тела, но каждый был нарисован «крупным планом» и
                    внутри грудной клетки выглядел больше самой клетки */}
                <group position={[0, 0.2, 0]} scale={0.84}>
                    <Heart reversed={circulationReversed} />
                </group>
                <group position={[0, 0.03, 0]} scale={0.8}>
                    <Lungs reversed={breathingReversed} />
                </group>
                <group position={[0, 0.42, 0]} scale={0.86}>
                    <Brain reversed={cognitionReversed} />
                </group>
                <group position={[0, 0.5, 0]} scale={0.9}>
                    <DigestiveSystem reversed={digestionReversed} />
                </group>
            </group>

            {/* Подписи органов вынесены из самих органов: каждый орган ещё и
                масштабируется под фигуру, и подпись внутри него уезжала вместе
                с ним — «ЛЁГКИЕ» оказывались над кишечником */}
            <Label position={[0, 3.62, 0.5]} region="head">МОЗГ</Label>
            <Label position={[0.62, 2.28, 0.5]} region="chest">СЕРДЦЕ</Label>
            <Label position={[-0.72, 2.12, 0.5]} region="chest">ЛЁГКИЕ</Label>
            <Label position={[0, 0.5, 0.62]} region="abdomen">ПИЩЕВАРЕНИЕ</Label>
        </group>
    );
}

function EmotionLayer({ reversedFactors }) {
    const emotionsReversed = !!reversedFactors.emotion;

    return (
        <group scale={ORGAN_FIT.scale} position={[0, ORGAN_FIT.offsetY, 0]}>
            <EmotionalAura reversed={emotionsReversed} />
            <FactorOrb position={[1.85, 1.85, 1.05]} factorId="emotion" label="ЭМОЦИЯ" reverseLabel="ОНЕМЕНИЕ" color="#d59a10" reverseColor="#8a8a8a" />
            <FactorOrb position={[-1.85, 1.85, 1.05]} factorId="stress" label="СТРЕСС" reverseLabel="ВОССТАНОВЛЕНИЕ" color="#d92d1c" reverseColor="#149c6c" />
            <FactorOrb position={[1.9, 0.25, 1.05]} factorId="empathy" label="ЭМПАТИЯ" reverseLabel="ОТЧУЖДЕНИЕ" color="#d9539f" reverseColor="#6680aa" />
            <FactorOrb position={[-1.9, 0.25, 1.05]} factorId="pain" label="БОЛЬ" reverseLabel="АНЕСТЕЗИЯ" color="#d94f16" reverseColor="#7890aa" />
            <FactorOrb position={[1.85, -1.2, 1.05]} factorId="hormones" label="ГОРМОНЫ" reverseLabel="СБОЙ" color="#8a9c1e" reverseColor="#aa7766" />
            <FactorOrb position={[-1.85, -1.2, 1.05]} factorId="sleep" label="СОН" reverseLabel="БЕССОННИЦА" color="#4a63c9" reverseColor="#d1831a" />
            <FactorOrb position={[0, 3.15, 1.1]} factorId="identity" label="Я" reverseLabel="РАЗРЫВ Я" color="#3a4256" reverseColor="#8a8aa8" size={1} />
        </group>
    );
}

export default function HumanBody({ mode = 'organs' }) {
    const reversedFactors = useStore((s) => s.reversedFactors);
    const groupRef = useRef();

    // Фигура больше не вращается сама: по областям надо прицеливаться, а
    // уезжающая из-под курсора мишень делает это пыткой. Остаётся лёгкое
    // покачивание — тело живое, но стоит на месте.
    useFrame((state) => {
        if (!groupRef.current) return;
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.03;
    });

    return (
        <group ref={groupRef}>
            <ambientLight intensity={0.55} />
            <hemisphereLight
                args={[mode === 'emotions' ? '#ffd7f4' : '#dff7ff', '#120818', 0.7]}
            />
            <spotLight position={[3, 8, 6.5]} angle={0.55} penumbra={0.6} intensity={2.2} color="#ffe8d4" />
            <pointLight position={[-4.5, 2, 4]} intensity={1.4} color={mode === 'emotions' ? '#ff80d8' : '#7fcfff'} />
            <pointLight position={[0.2, 1.9, 1.6]} intensity={mode === 'organs' ? 1.2 : 0.4} color="#ff6a7a" distance={5} />
            <pointLight position={[0, 3.3, 1.4]} intensity={0.7} color="#ffb7ec" distance={4.5} />

            <AnatomyFigure reversedFactors={reversedFactors} mode={mode} />
            {mode === 'organs' ? (
                <>
                    <OrganLayer reversedFactors={reversedFactors} />
                    <BodyRegions />
                </>
            ) : (
                <EmotionLayer reversedFactors={reversedFactors} />
            )}
        </group>
    );
}
