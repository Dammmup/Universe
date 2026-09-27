import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { seededRandom } from '../lib/geo';
import { circleSprite, starSprite } from '../lib/sprites';

/**
 * Итог пути.
 *
 * Раньше путь просто упирался в антропо-уровень: дальше скролла не было, и
 * шесть пройденных масштабов нигде не сходились вместе. Здесь они показаны
 * одной нитью света — от сингулярности до тела, — по которой бежит импульс.
 * Вокруг нити вращаются искры по числу перевёрнутых факторов: финал говорит
 * не «конец», а «вот что ты сделал с реальностью».
 */

const SCALES = [
    { title: 'Сингулярность', tone: '#ffd9a0' },
    { title: 'Космос', tone: '#9ec8ff' },
    { title: 'Природа', tone: '#7fe6b0' },
    { title: 'Общество', tone: '#ffd166' },
    { title: 'Клетка', tone: '#d9a0ff' },
    { title: 'Человек', tone: '#ff9aa8' },
];

/** Точки нити: пологая дуга из верхнего левого угла в нижний правый. */
const NODES = SCALES.map((scale, i) => ({
    ...scale,
    position: [
        -4.15 + i * 1.66,
        2.40 - i * 0.58 + Math.sin(i * 1.7) * 0.16,
        -1.1 + i * 0.42,
    ],
}));

function StarField() {
    const ref = useRef();
    const tex = useMemo(() => starSprite(), []);

    const positions = useMemo(() => {
        const rand = seededRandom(0x5f1a);
        const count = 1400;
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
            const radius = 26 + rand() * 55;
            const theta = rand() * Math.PI * 2;
            const phi = Math.acos(2 * rand() - 1);
            arr[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
            arr[i * 3 + 1] = radius * Math.cos(phi);
            arr[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
        }
        return arr;
    }, []);

    useFrame((_, delta) => {
        if (ref.current) ref.current.rotation.y += delta * 0.006;
    });

    return (
        <points ref={ref} raycast={() => null}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial
                size={0.9}
                color="#cfe0ff"
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
    );
}

/** Узел масштаба: ядро, гало и подпись. */
function ScaleNode({ node, index }) {
    const haloRef = useRef();
    const tex = useMemo(() => circleSprite(), []);

    useFrame((state) => {
        if (!haloRef.current) return;
        // Узлы дышат вразнобой: синхронный пульс читался бы как индикатор
        const pulse = 0.5 + Math.sin(state.clock.elapsedTime * 0.9 + index * 1.1) * 0.5;
        const size = 0.88 + pulse * 0.26;
        haloRef.current.scale.set(size, size, 1);
        haloRef.current.material.opacity = 0.24 + pulse * 0.2;
    });

    return (
        <group position={node.position}>
            <mesh raycast={() => null}>
                <sphereGeometry args={[0.1, 16, 12]} />
                <meshBasicMaterial color={node.tone} toneMapped={false} />
            </mesh>
            <sprite ref={haloRef}>
                <spriteMaterial
                    map={tex}
                    color={node.tone}
                    transparent
                    opacity={0.4}
                    depthWrite={false}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                />
            </sprite>
            <Billboard position={[0, -0.62, 0]}>
                <Text
                    font="/Roboto-Regular.ttf"
                    fontSize={0.23}
                    letterSpacing={0.16}
                    color={node.tone}
                    fillOpacity={0.85}
                    anchorX="center"
                    anchorY="top"
                    outlineColor="#000000"
                    outlineWidth={0.012}
                    outlineOpacity={0.6}
                    raycast={() => null}
                >
                    {node.title.toUpperCase()}
                </Text>
            </Billboard>
        </group>
    );
}

/** Нить между узлами и бегущий по ней импульс. */
function Thread() {
    const pulseRef = useRef();
    const curve = useMemo(() => new THREE.CatmullRomCurve3(
        NODES.map((node) => new THREE.Vector3(...node.position)),
    ), []);

    const geometry = useMemo(() => new THREE.TubeGeometry(curve, 160, 0.012, 6, false), [curve]);
    useEffect(() => () => geometry.dispose(), [geometry]);

    useFrame((state) => {
        if (!pulseRef.current) return;
        // Импульс пробегает путь целиком примерно за девять секунд
        const t = (state.clock.elapsedTime % 9) / 9;
        curve.getPointAt(t, pulseRef.current.position);
        const fade = Math.sin(t * Math.PI);
        pulseRef.current.scale.setScalar(0.5 + fade * 0.8);
    });

    return (
        <group>
            <mesh geometry={geometry} raycast={() => null}>
                <meshBasicMaterial
                    color="#8fb4ff"
                    transparent
                    opacity={0.55}
                    toneMapped={false}
                    blending={THREE.AdditiveBlending}
                    depthWrite={false}
                />
            </mesh>
            <mesh ref={pulseRef} raycast={() => null}>
                <sphereGeometry args={[0.07, 12, 10]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
        </group>
    );
}

/**
 * Искры перевёрнутых факторов: по одной на каждый реверс, который зритель
 * включил за путь. Ноль реверсов — нить остаётся голой, и это тоже ответ.
 */
function ReversalSparks({ count }) {
    const groupRef = useRef();
    const tex = useMemo(() => circleSprite(), []);

    const sparks = useMemo(() => {
        const rand = seededRandom(0x2b1e);
        return Array.from({ length: count }, () => ({
            radius: 1.6 + rand() * 3.4,
            speed: 0.12 + rand() * 0.22,
            phase: rand() * Math.PI * 2,
            height: 0.6 + (rand() - 0.5) * 3.0,
            size: 0.3 + rand() * 0.25,
        }));
    }, [count]);

    useFrame((state) => {
        const group = groupRef.current;
        if (!group) return;
        const t = state.clock.elapsedTime;
        group.children.forEach((child, i) => {
            const spark = sparks[i];
            if (!spark) return;
            const angle = spark.phase + t * spark.speed;
            child.position.set(
                Math.cos(angle) * spark.radius,
                spark.height + Math.sin(t * 0.5 + spark.phase) * 0.22,
                Math.sin(angle) * spark.radius * 0.5,
            );
        });
    });

    if (count === 0) return null;

    return (
        <group ref={groupRef}>
            {sparks.map((spark, i) => (
                <sprite key={i} scale={[spark.size, spark.size, 1]}>
                    <spriteMaterial
                        map={tex}
                        color="#9ff0ff"
                        transparent
                        opacity={0.75}
                        depthWrite={false}
                        toneMapped={false}
                        blending={THREE.AdditiveBlending}
                    />
                </sprite>
            ))}
        </group>
    );
}

export default function Finale() {
    const reversedFactors = useStore((s) => s.reversedFactors);
    const groupRef = useRef();

    const reversedCount = useMemo(
        () => Object.values(reversedFactors).filter(Boolean).length,
        [reversedFactors],
    );

    useFrame((state) => {
        if (!groupRef.current) return;
        // Едва заметный дрейф: кадр не застывает, но и не уезжает от зрителя
        groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.05;
    });

    return (
        <group>
            <ambientLight intensity={0.4} />
            <StarField />
            <group ref={groupRef}>
                <Thread />
                {NODES.map((node, i) => (
                    <ScaleNode key={node.title} node={node} index={i} />
                ))}
                <ReversalSparks count={Math.min(reversedCount, 48)} />
            </group>
        </group>
    );
}
