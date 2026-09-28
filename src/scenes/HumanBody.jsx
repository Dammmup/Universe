import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useStore } from '../store';
import { BODY_LAYERS } from '../data/bodyLayers';
import { withEchoes } from '../data/consequences';
import { buildFigure, disposeFigure } from '../lib/anatomy';
import {
    GhostSkin,
    MuscleLayer,
    NerveLayer,
    Portal,
    ScanRing,
    SkeletonLayer,
    SkinLayer,
    useClipPlane,
    useMuscleGroups,
} from './body/BodyLayers';
import { useBodyGeometry } from '../lib/bodyMesh';
import {
    buildBladder,
    buildBrainstem,
    buildCerebellum,
    buildColon,
    buildHeart,
    buildHemisphere,
    buildKidney,
    buildLiver,
    buildLung,
    buildSmallIntestine,
    buildStomach,
} from '../lib/organs';
import { tissueFragment, tissueVertex } from '../lib/shaders/life';
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
function Label({ position, children, size = 0.11 }) {
    const bodyLayer = useStore((s) => s.bodyLayer);
    if (BODY_LAYERS[bodyLayer]?.id !== 'organs') return null;

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
 *
 * Фигура смотрит на зрителя (+Z), поэтому правая сторона тела — это −X,
 * левая — +X. Прежде органы стояли зеркально: печень и полая вена слева
 * от тела, желудок и верхушка сердца справа.
 */
const BODY_LEFT = 1;
const BODY_RIGHT = -1;

const ORGAN_AT = {
    brain: [0, 3.34, 0.0],
    heart: [BODY_LEFT * 0.10, 1.90, 0.10],
    lungLeft: [BODY_LEFT * 0.36, 1.99, 0.02],
    lungRight: [BODY_RIGHT * 0.36, 1.99, 0.02],
    liver: [BODY_RIGHT * 0.20, 1.34, 0.06],
    stomach: [BODY_LEFT * 0.22, 1.30, 0.10],
    gut: [0, 0.82, 0.06],
    // Почки лежат за кишечником по бокам от позвоночника, правая чуть ниже —
    // её поджимает печень
    kidneyLeft: [BODY_LEFT * 0.25, 1.2, -0.2],
    kidneyRight: [BODY_RIGHT * 0.25, 1.14, -0.2],
    bladder: [0, 0.22, 0.1],
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
        [0.06, 2.00, 0.06],
        [0.02, 2.22, 0.02],
        [0.11, 2.32, -0.06],
        [0.05, 2.24, -0.14],
        [0.04, 1.80, -0.13],
        [0.03, 1.10, -0.11],
        [0.02, 0.40, -0.07],
        [0.02, 0.05, -0.05],
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
                {/* Геометрия сердца собрана с верхушкой к −X: зеркало разворачивает
                    её к левой стороне тела, как в настоящей грудной клетке */}
                <group scale={[-1, 1, 1]}>
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
        // Калибровка по грудной клетке: доли от ключицы до диафрагмы и
        // почти до боковых рёбер — прежде они занимали её треть
        ref.current.scale.set(breath * 1.28, breath * 1.08, breath * 1.2);
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
                    position={[ORGAN_AT.lungLeft[0] / 1.28, ORGAN_AT.lungLeft[1] / 1.08, ORGAN_AT.lungLeft[2]]}
                    rotation={[0, 0, -0.06]}
                />
                <TissueOrgan
                    geometry={right}
                    color={color}
                    crease={crease}
                    emissive={reversed ? '#101418' : '#1a5068'}
                    glow={reversed ? 0.08 : 0.24}
                    fold={0.013}
                    alpha={0.88}
                    position={[ORGAN_AT.lungRight[0] / 1.28, ORGAN_AT.lungRight[1] / 1.08, ORGAN_AT.lungRight[2]]}
                    rotation={[0, 0, 0.06]}
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
        // Масштаб подогнан под череп фигуры: прежний мозг занимал половину головы
        <group position={ORGAN_AT.brain} scale={1.14}>
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
                rotation={[0, 0, 0.12]}
                scale={[-1, 1, 1]}
            />
            <TissueOrgan
                geometry={stomach}
                scale={[-1, 1, 1]}
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


/** Почки и мочевой пузырь — органы «Фильтрации», которой прежде нечем было показаться. */
function Kidneys({ reversed }) {
    // Выпуклая сторона почки смотрит наружу, вогнутая — на позвоночник
    const left = useMemo(() => buildKidney(BODY_LEFT), []);
    const right = useMemo(() => buildKidney(BODY_RIGHT), []);
    const bladder = useMemo(() => buildBladder(), []);
    useEffect(() => () => {
        left.dispose();
        right.dispose();
        bladder.dispose();
    }, [left, right, bladder]);

    const color = reversed ? '#4a3026' : '#a4383c';
    const crease = reversed ? '#2a1a14' : '#6a1a20';
    return (
        <group>
            <TissueOrgan geometry={left} color={color} crease={crease} emissive={reversed ? '#100806' : '#3a0a10'} glow={0.22} fold={0.012} position={ORGAN_AT.kidneyLeft} rotation={[0, 0, 0.18]} />
            <TissueOrgan geometry={right} color={color} crease={crease} emissive={reversed ? '#100806' : '#3a0a10'} glow={0.22} fold={0.012} position={ORGAN_AT.kidneyRight} rotation={[0, 0, -0.18]} />
            <TissueOrgan
                geometry={bladder}
                color={reversed ? '#6a5a2a' : '#e8c062'}
                crease={reversed ? '#3a3010' : '#a88030'}
                emissive={reversed ? '#100c00' : '#3a2a04'}
                glow={0.2}
                fold={0.008}
                alpha={0.8}
                position={ORGAN_AT.bladder}
            />
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
        [-0.10, 0.20, 0.02],
        [-0.12, 0.80, 0.02],
        [-0.10, 1.40, 0.02],
        [-0.02, 1.78, 0.06],
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

function OrganLayer({ reversedFactors }) {
    const circulationReversed = !!reversedFactors.circulation;
    const breathingReversed = !!reversedFactors.breathing;
    const digestionReversed = !!reversedFactors.digestion;
    const mirrorRef = useRef();

    // Зеркальные органы: карта тела переворачивается по X, как в situs inversus.
    // Масштаб проходит через ноль — органы будто поворачиваются вокруг оси тела.
    useFrame((_, delta) => {
        const g = mirrorRef.current;
        if (!g) return;
        const target = reversedFactors.situs ? -1 : 1;
        g.scale.x = THREE.MathUtils.damp(g.scale.x, target, 1.6, Math.min(delta, 0.1));
    });

    return (
        <group>
            <Circulation reversed={circulationReversed} />
            <group ref={mirrorRef}>
                {/* Органы подогнаны под рост фигуры ≈ 1,75 м: прежние были на
                    треть крупнее, кишечник занимал весь живот */}
                <Heart reversed={circulationReversed || !!reversedFactors.heartRhythm} />
                <Lungs reversed={breathingReversed} />
                <group position={[0, 1.0, 0]} scale={0.86}>
                    <group position={[0, -1.0, 0]}>
                        <DigestiveSystem reversed={digestionReversed} />
                    </group>
                </group>
                <Kidneys reversed={!!reversedFactors.filtration} />
            </group>

            <Label position={[0.3, 1.6, 0.5]}>СЕРДЦЕ</Label>
            <Label position={[-0.58, 2.46, 0.4]}>ЛЁГКИЕ</Label>
            <Label position={[-0.34, 1.08, 0.5]}>ПЕЧЕНЬ</Label>
            <Label position={[0.46, 1.12, 0.5]}>ЖЕЛУДОК</Label>
            <Label position={[0, 0.5, 0.62]}>КИШЕЧНИК</Label>
            <Label position={[0.6, 0.7, -0.1]} size={0.09}>ПОЧКИ</Label>
            <Label position={[0, 0.02, 0.45]} size={0.09}>МОЧЕВОЙ ПУЗЫРЬ</Label>
        </group>
    );
}

/** Круглый мраморный постамент под ногами статуи. */
function Pedestal() {
    const material = useMemo(() => new THREE.MeshPhysicalMaterial({ color: '#d9d3cb', roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.25 }), []);
    useEffect(() => () => material.dispose(), [material]);
    return (
        <group position={[0, -3.72, 0]}>
            <mesh material={material} position={[0, -0.12, 0]} receiveShadow raycast={() => null}><cylinderGeometry args={[1.05, 1.1, 0.24, 64]} /></mesh>
            <mesh material={material} position={[0, -0.33, 0]} receiveShadow raycast={() => null}><cylinderGeometry args={[1.2, 1.25, 0.18, 64]} /></mesh>
        </group>
    );
}

/**
 * Антропо-уровень: фигура и её подуровни.
 *
 * Подуровень выбирает стор (bodyLayer): колесо снимает слои по одному —
 * кожа, мышцы, органы, кости, нервы. Все слои живут в сцене одновременно, но
 * видны только нужные: внешние снимаются плоскостью сверху вниз и открывают
 * то, что под ними. Мозг на подуровнях органов и нервов — вход в «Разум».
 */
export default function HumanBody() {
    const rawReversed = useStore((s) => s.reversedFactors);
    const reversedFactors = useMemo(() => withEchoes(rawReversed), [rawReversed]);
    const bodyLayer = useStore((s) => s.bodyLayer);
    const enterMind = useStore((s) => s.enterMind);
    const layer = BODY_LAYERS[bodyLayer];
    const groupRef = useRef();
    const organRef = useRef();
    // Тело строится в фоне из поля расстояний (lib/bodySdf.js). Пока оно
    // считается, стоит прежняя фигура из протяжек — пустого кадра не бывает
    const fallback = useMemo(() => {
        const figure = buildFigure();
        const merged = mergeGeometries(Object.values(figure));
        disposeFigure(figure);
        return merged;
    }, []);
    useEffect(() => () => fallback.dispose(), [fallback]);
    const skinGeometry = useBodyGeometry('skin') ?? fallback;
    const muscleGeometry = useBodyGeometry('muscle') ?? fallback;
    const groups = useMuscleGroups(reversedFactors);

    const skinClip = useClipPlane(bodyLayer === 0);
    const muscleClip = useClipPlane(bodyLayer <= 1);
    const organClip = useClipPlane(bodyLayer >= 1 && bodyLayer <= 2);
    const boneClip = useClipPlane(bodyLayer === 3);
    const nerveClip = useClipPlane(bodyLayer === 4);

    // Фигура не вращается сама: по меткам надо прицеливаться. Остаётся лёгкое
    // покачивание, а при потере равновесия — заметный крен.
    useFrame((state) => {
        const g = groupRef.current;
        if (!g) return;
        const t = state.clock.elapsedTime;
        g.rotation.z = reversedFactors.balance ? Math.sin(t * 1.3) * 0.06 + Math.sin(t * 3.1) * 0.02 : 0;
        // Органы не умеют отсекаться плоскостью — они появляются, когда линия
        // снятия прошла середину тела
        if (organRef.current) organRef.current.visible = organClip.state.current.p > 0.5 && muscleClip.state.current.p < 0.999;
    });

    const brain = <Brain reversed={!!reversedFactors.memory} />;

    return (
        <group ref={groupRef}>
            <ambientLight intensity={0.5} />
            <hemisphereLight args={['#fff4ec', '#6a7890', 0.8]} />
            <directionalLight position={[3, 7, 6]} intensity={2.2} color="#fff0e2" castShadow />
            <directionalLight position={[-5, 3, -4]} intensity={1.1} color="#9fc8ff" />
            <pointLight position={[0.2, 1.9, 1.6]} intensity={bodyLayer === 2 ? 1.2 : 0.3} color="#ff6a7a" distance={5} />

            {/* Постамент: фигура — скульптура, ей нужна опора */}
            <Pedestal />
            <SkinLayer geometry={skinGeometry} present={bodyLayer === 0} rev={reversedFactors} clip={skinClip} groups={groups} />
            <MuscleLayer geometry={muscleGeometry} rev={reversedFactors} clip={muscleClip} cover={skinClip} groups={groups} />
            <GhostSkin geometry={skinGeometry} present={bodyLayer >= 2} />

            <group ref={organRef}>
                <OrganLayer reversedFactors={reversedFactors} />
                {bodyLayer === 2 && <Portal onEnter={enterMind}>{brain}</Portal>}
            </group>

            <SkeletonLayer rev={reversedFactors} clip={boneClip} />
            <NerveLayer present={bodyLayer === 4} rev={reversedFactors} clip={nerveClip}>
                <Portal
                    onEnter={enterMind}
                    label={(hover) => (hover ? (
                        <Billboard position={[0, 3.95, 0.3]}>
                            <Text font="/Roboto-Regular.ttf" fontSize={0.13} letterSpacing={0.14} color="#243043" outlineColor="#ffffff" outlineWidth={0.012} anchorX="center">
                                ВОЙТИ В РАЗУМ
                            </Text>
                        </Billboard>
                    ) : null)}
                >
                    {brain}
                </Portal>
            </NerveLayer>

            <ScanRing sources={[skinClip, muscleClip, boneClip, nerveClip]} color={layer.accent} />

            {layer.factors.map((factor) => (
                <FactorMarker
                    key={factor.id}
                    position={factor.pos}
                    factorId={factor.id}
                    label={factor.anomaly ? `◆ ${factor.label}` : factor.label}
                    reverseLabel={factor.anomaly ? `◆ ${factor.reverse}` : factor.reverse}
                    color={factor.color}
                    reverseColor="#8b93a3"
                    scale={0.42}
                    labelOffset={-0.62}
                    hitRadius={0.4}
                    theme="light"
                />
            ))}
        </group>
    );
}
