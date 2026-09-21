import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { BODY_REGIONS } from '../data/body';
import { buildFigure, disposeFigure } from '../lib/anatomy';
import {
    buildBrainstem,
    buildCerebellum,
    buildColon,
    buildHeart,
    buildHemisphere,
    buildLiver,
    buildLung,
    buildSmallIntestine,
    buildStomach,
} from '../lib/organs';
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

/**
 * Где органы стоят в теле. Координаты — пространство фигуры из `lib/anatomy.js`:
 * грудная клетка около y = 2, талия около 1.1, таз около 0.3.
 */
const ORGAN_AT = {
    brain: [0, 3.34, 0.0],
    heart: [-0.10, 1.90, 0.10],
    lungLeft: [-0.36, 1.99, 0.02],
    lungRight: [0.36, 1.99, 0.02],
    liver: [0.20, 1.34, 0.06],
    stomach: [-0.22, 1.30, 0.10],
    gut: [0, 0.82, 0.06],
};

function Heart({ reversed }) {
    const pulse = useRef();
    const body = useMemo(() => buildHeart(), []);
    const atrium = useMemo(() => new THREE.SphereGeometry(0.11, 20, 14), []);

    useEffect(() => () => {
        body.dispose();
        atrium.dispose();
    }, [body, atrium]);

    // Дуга аорты живёт в координатах фигуры: она уходит из сердца вниз вдоль
    // позвоночника и не принадлежит локальной геометрии органа
    const aorta = useMemo(() => makeCurve([
        [-0.04, 2.00, 0.06],
        [0.02, 2.22, 0.02],
        [0.11, 2.32, -0.06],
        [0.02, 2.24, -0.14],
        [-0.02, 1.80, -0.13],
        [-0.02, 1.10, -0.11],
        [-0.02, 0.40, -0.07],
        [-0.02, 0.05, -0.05],
    ]), []);

    useFrame((state) => {
        if (!pulse.current) return;
        const beat = reversed
            ? 0.9 + Math.sin(state.clock.elapsedTime * 1.3) * 0.025
            : 1 + Math.pow(Math.max(0, Math.sin(state.clock.elapsedTime * 6.2)), 8) * 0.11;
        pulse.current.scale.setScalar(beat);
    });

    const color = reversed ? '#5a1e22' : '#d8253c';
    const crease = reversed ? '#3a1014' : '#87101f';

    return (
        <group>
            <group ref={pulse} position={ORGAN_AT.heart}>
                <TissueOrgan
                    geometry={body}
                    color={color}
                    crease={crease}
                    emissive={reversed ? '#190407' : '#6e0f1c'}
                    glow={reversed ? 0.12 : 0.45}
                    fold={0.012}
                />
                {/* Предсердия: два мешка на основании желудочков */}
                <mesh geometry={atrium} position={[0.10, 0.15, -0.01]} scale={[1, 0.78, 0.92]}>
                    <meshStandardMaterial color={reversed ? '#5a1e22' : '#e8697a'} emissive="#33050a" emissiveIntensity={0.3} roughness={0.5} />
                </mesh>
                <mesh geometry={atrium} position={[-0.13, 0.13, 0.02]} scale={[0.88, 0.72, 0.88]}>
                    <meshStandardMaterial color={reversed ? '#5a1e22' : '#e8697a'} emissive="#33050a" emissiveIntensity={0.3} roughness={0.5} />
                </mesh>
            </group>
            <mesh raycast={() => null}>
                <tubeGeometry args={[aorta, 56, reversed ? 0.022 : 0.033, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#773333' : '#e0273c'}
                    emissive={reversed ? '#200808' : '#5c0f18'}
                    emissiveIntensity={0.4}
                    roughness={0.45}
                />
            </mesh>
        </group>
    );
}

function Lungs({ reversed }) {
    const ref = useRef();
    // Левая доля поджата сердечной вырезкой — она заметно меньше правой
    const left = useMemo(() => buildLung(1), []);
    const right = useMemo(() => buildLung(0), []);

    useEffect(() => () => {
        left.dispose();
        right.dispose();
    }, [left, right]);

    const trachea = useMemo(() => makeCurve([
        [0, 2.66, -0.02],
        [0, 2.46, -0.01],
        [0, 2.26, 0.00],
    ]), []);
    const leftBronchus = useMemo(() => makeCurve([
        [0, 2.26, 0.00],
        [-0.14, 2.16, 0.01],
        [-0.28, 2.04, 0.02],
    ]), []);
    const rightBronchus = useMemo(() => makeCurve([
        [0, 2.26, 0.00],
        [0.14, 2.16, 0.01],
        [0.28, 2.04, 0.02],
    ]), []);

    useFrame((state) => {
        if (!ref.current) return;
        const t = state.clock.elapsedTime;
        const breath = reversed
            ? 0.93 + Math.sin(t * 1.05) * 0.012
            : 1 + Math.sin(t * 1.55) * 0.045;
        ref.current.scale.set(breath, breath, breath);
    });

    const color = reversed ? '#3f5a66' : '#89c2d8';
    const crease = reversed ? '#22333c' : '#5b96b0';

    return (
        <group>
            <group ref={ref}>
                <TissueOrgan
                    geometry={left}
                    color={color}
                    crease={crease}
                    emissive={reversed ? '#101418' : '#1a5068'}
                    glow={reversed ? 0.08 : 0.24}
                    fold={0.013}
                    alpha={0.88}
                    position={ORGAN_AT.lungLeft}
                    rotation={[0, 0, 0.06]}
                />
                <TissueOrgan
                    geometry={right}
                    color={color}
                    crease={crease}
                    emissive={reversed ? '#101418' : '#1a5068'}
                    glow={reversed ? 0.08 : 0.24}
                    fold={0.013}
                    alpha={0.88}
                    position={ORGAN_AT.lungRight}
                    rotation={[0, 0, -0.06]}
                />
            </group>
            <mesh raycast={() => null}>
                <tubeGeometry args={[trachea, 16, 0.035, 8, false]} />
                <meshStandardMaterial color="#d7f2ff" transparent opacity={0.7} roughness={0.45} />
            </mesh>
            <mesh raycast={() => null}>
                <tubeGeometry args={[leftBronchus, 12, 0.022, 6, false]} />
                <meshStandardMaterial color="#c5e8f6" transparent opacity={0.65} />
            </mesh>
            <mesh raycast={() => null}>
                <tubeGeometry args={[rightBronchus, 12, 0.022, 6, false]} />
                <meshStandardMaterial color="#c5e8f6" transparent opacity={0.65} />
            </mesh>
        </group>
    );
}

function Brain({ reversed }) {
    const hemisphere = useMemo(() => buildHemisphere(), []);
    const cerebellum = useMemo(() => buildCerebellum(), []);
    const stem = useMemo(() => buildBrainstem(), []);

    useEffect(() => () => {
        hemisphere.dispose();
        cerebellum.dispose();
        stem.dispose();
    }, [hemisphere, cerebellum, stem]);

    const glow = reversed ? 0.12 : 0.4;
    const color = reversed ? '#8a6680' : '#e8a0c8';
    const crease = reversed ? '#4a3048' : '#a8578c';

    return (
        <group position={ORGAN_AT.brain}>
            {/* Два полушария с продольной щелью между ними */}
            <TissueOrgan
                geometry={hemisphere}
                color={color}
                crease={crease}
                emissive={reversed ? '#201020' : '#7a1457'}
                glow={glow}
                fold={0.026}
                position={[-0.19, 0, 0.02]}
            />
            <TissueOrgan
                geometry={hemisphere}
                color={color}
                crease={crease}
                emissive={reversed ? '#201020' : '#7a1457'}
                glow={glow}
                fold={0.026}
                position={[0.19, 0, 0.02]}
            />
            <TissueOrgan
                geometry={cerebellum}
                color={reversed ? '#6a5068' : '#d183b2'}
                crease={reversed ? '#3a2438' : '#9c4c7e'}
                emissive="#4a1438"
                glow={glow * 0.7}
                fold={0.014}
                position={[0, -0.23, -0.22]}
            />
            <mesh geometry={stem} position={[0, -0.18, -0.06]} raycast={() => null}>
                <meshStandardMaterial color={reversed ? '#665577' : '#dd99ff'} roughness={0.5} />
            </mesh>
        </group>
    );
}

function DigestiveSystem({ reversed }) {
    const gutRef = useRef();
    const liver = useMemo(() => buildLiver(), []);
    const stomach = useMemo(() => buildStomach(), []);
    const colon = useMemo(() => buildColon(), []);
    const smallGut = useMemo(() => buildSmallIntestine(), []);

    useEffect(() => () => {
        liver.dispose();
        stomach.dispose();
        colon.dispose();
        smallGut.dispose();
    }, [liver, stomach, colon, smallGut]);

    useFrame((state) => {
        if (!gutRef.current) return;
        // Перистальтика: кишечник слегка переминается, а не крутится
        gutRef.current.rotation.z = Math.sin(state.clock.elapsedTime * (reversed ? 0.5 : 1.1)) * 0.025;
    });

    return (
        <group>
            <TissueOrgan
                geometry={liver}
                color={reversed ? '#4a2a22' : '#8f3a2c'}
                crease={reversed ? '#2a1610' : '#5e2118'}
                emissive={reversed ? '#150806' : '#33100a'}
                glow={0.18}
                fold={0.016}
                position={ORGAN_AT.liver}
                rotation={[0, 0, -0.12]}
            />
            <TissueOrgan
                geometry={stomach}
                color={reversed ? '#5b4a2a' : '#d4a056'}
                crease={reversed ? '#2a2010' : '#8a6030'}
                emissive={reversed ? '#191000' : '#3d2104'}
                glow={0.2}
                fold={0.018}
                position={ORGAN_AT.stomach}
            />
            <group ref={gutRef} position={ORGAN_AT.gut}>
                <TissueOrgan
                    geometry={colon}
                    color={reversed ? '#5b4a2a' : '#c9945a'}
                    crease={reversed ? '#2a2010' : '#8a6030'}
                    emissive={reversed ? '#191000' : '#3d2104'}
                    glow={0.16}
                    fold={0.01}
                />
                <TissueOrgan
                    geometry={smallGut}
                    color={reversed ? '#54452a' : '#d8a06a'}
                    crease={reversed ? '#261d10' : '#95653a'}
                    emissive={reversed ? '#150d00' : '#33200a'}
                    glow={0.14}
                    fold={0.008}
                />
            </group>
        </group>
    );
}


/**
 * Сосуды. Прежние кривые были написаны под старую модель и пересчитывались
 * общим множителем — на новой фигуре они выходили за обводы: артерии рук шли
 * по воздуху рядом с рукой, а не внутри неё. Здесь всё задано сразу в
 * координатах фигуры и лежит внутри туловища и конечностей.
 */
function Circulation({ reversed }) {
    const arterial = useMemo(() => makeCurve([
        [-0.02, 1.70, -0.12],
        [-0.02, 2.05, -0.08],
        [0.00, 2.38, -0.04],
        [0.00, 2.66, -0.02],
    ]), []);
    // Точек намеренно много: на редкой сетке сплайн выносило за обвод плеча,
    // и артерия шла по воздуху рядом с рукой
    const leftArm = useMemo(() => makeCurve([
        [-0.10, 2.28, -0.02],
        [-0.45, 2.22, 0.00],
        [-0.72, 2.06, 0.01],
        [-0.90, 1.72, 0.02],
        [-1.00, 1.22, 0.02],
        [-1.09, 0.62, 0.02],
        [-1.15, 0.08, 0.03],
        [-1.18, -0.30, 0.03],
    ]), []);
    const rightArm = useMemo(() => makeCurve([
        [0.10, 2.28, -0.02],
        [0.45, 2.22, 0.00],
        [0.72, 2.06, 0.01],
        [0.90, 1.72, 0.02],
        [1.00, 1.22, 0.02],
        [1.09, 0.62, 0.02],
        [1.15, 0.08, 0.03],
        [1.18, -0.30, 0.03],
    ]), []);
    const leftLeg = useMemo(() => makeCurve([
        [-0.02, 0.30, -0.04],
        [-0.22, 0.05, -0.02],
        [-0.34, -0.80, 0.00],
        [-0.37, -1.70, 0.00],
        [-0.36, -2.60, 0.00],
        [-0.36, -3.30, -0.01],
    ]), []);
    const rightLeg = useMemo(() => makeCurve([
        [0.02, 0.30, -0.04],
        [0.22, 0.05, -0.02],
        [0.34, -0.80, 0.00],
        [0.37, -1.70, 0.00],
        [0.36, -2.60, 0.00],
        [0.36, -3.30, -0.01],
    ]), []);
    // Венозный возврат: от таза к сердцу, чуть правее и спереди от аорты
    const venous = useMemo(() => makeCurve([
        [0.10, 0.20, 0.02],
        [0.12, 0.80, 0.02],
        [0.10, 1.40, 0.02],
        [0.04, 1.78, 0.06],
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
 * Позвоночник: область «Позвоночник» была, а столба в теле не было — камера
 * заходила со спины и показывала пустую оболочку.
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
            {/* Все органы построены сразу в координатах фигуры: пересчёт
                общими множителями раздувал их до размера туловища и уводил
                мозг выше макушки */}
            <Spine reversed={!!reversedFactors.posture} />
            <Circulation reversed={circulationReversed} />
            <Heart reversed={circulationReversed} />
            <Lungs reversed={breathingReversed} />
            <Brain reversed={cognitionReversed} />
            <DigestiveSystem reversed={digestionReversed} />

            {/* Подписи вынесены из самих органов: подпись внутри органа
                уезжала вместе с ним — «ЛЁГКИЕ» оказывались над кишечником */}
            <Label position={[0, 3.62, 0.5]} region="head">МОЗГ</Label>
            <Label position={[0.62, 2.28, 0.5]} region="chest">СЕРДЦЕ</Label>
            <Label position={[-0.72, 2.12, 0.5]} region="chest">ЛЁГКИЕ</Label>
            <Label position={[0, 0.5, 0.62]} region="abdomen">ПИЩЕВАРЕНИЕ</Label>
        </group>
    );
}

/**
 * Слой эмоций писался под прежнюю модель ростом ≈ 6 единиц: кольцо факторов и
 * аура разом подгоняются под новый рост фигуры одним преобразованием.
 */
function EmotionLayer({ reversedFactors }) {
    const emotionsReversed = !!reversedFactors.emotion;

    return (
        <group scale={1.2} position={[0, 0.45, 0]}>
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
