import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { seededRandom } from '../lib/geo';
import { circleSprite, starSprite } from '../lib/sprites';
import { SCALES, reversedInScale } from '../data/scales';

/**
 * Итог пути.
 *
 * Все пройденные масштабы — одной нитью света, от сингулярности до клетки, —
 * и по ней бежит импульс. У каждого узла кружат искры по числу факторов,
 * перевёрнутых на этом масштабе: видно, где зритель изменил мир сильнее всего.
 */

/** Точки нити: пологая дуга из верхнего левого угла в нижний правый. */
const NODES = SCALES.map((scale, i) => ({
    ...scale,
    position: [
        -4.6 + i * 1.32,
        2.55 - i * 0.44 + Math.sin(i * 1.7) * 0.16,
        -1.1 + i * 0.3,
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
            {/* Подписи через одну сверху и снизу: у соседних узлов они иначе сталкивались */}
            <Billboard position={[0, index % 2 ? 0.5 : -0.62, 0]}>
                <Text
                    font="/Roboto-Regular.ttf"
                    fontSize={0.23}
                    letterSpacing={0.16}
                    color={node.tone}
                    fillOpacity={0.85}
                    anchorX="center"
                    anchorY={index % 2 ? 'bottom' : 'top'}
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
 * Искры перевёрнутых факторов: у каждого узла — по числу реверсов на его
 * масштабе. Узел без искр — масштаб, который зритель оставил как был.
 */
function ReversalSparks({ node, count }) {
    const groupRef = useRef();
    const tex = useMemo(() => circleSprite(), []);

    const sparks = useMemo(() => {
        const rand = seededRandom(0x2b1e + node.title.length * 31);
        return Array.from({ length: count }, () => ({
            radius: 0.28 + rand() * 0.34,
            speed: 0.5 + rand() * 0.9,
            phase: rand() * Math.PI * 2,
            tilt: (rand() - 0.5) * 1.4,
            size: 0.12 + rand() * 0.1,
        }));
    }, [count, node.title]);

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
                Math.sin(angle) * spark.radius * spark.tilt,
                Math.sin(angle) * spark.radius,
            );
        });
    });

    if (count === 0) return null;

    return (
        <group ref={groupRef} position={node.position}>
            {sparks.map((spark, i) => (
                <sprite key={i} scale={[spark.size, spark.size, 1]}>
                    <spriteMaterial
                        map={tex}
                        color={node.tone}
                        transparent
                        opacity={0.9}
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
                {NODES.map((node) => (
                    <ReversalSparks key={`s${node.title}`} node={node} count={Math.min(reversedInScale(node, reversedFactors), 24)} />
                ))}
            </group>
        </group>
    );
}
