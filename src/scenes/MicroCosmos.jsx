import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sphere, Text, Line } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';

export default function MicroCosmos() {
    const { reversedFactors, setActiveFactor } = useStore();
    const networkGroup = useRef();
    const dominantaRef = useRef();
    const abstractionRef = useRef();
    const mutationRef = useRef();

    // Нейронная сеть
    const { neurons, connections } = useMemo(() => {
        const nodes = [];
        const links = [];
        for (let i = 0; i < 80; i++) {
            nodes.push([
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20,
                (Math.random() - 0.5) * 20
            ]);
        }
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dist = new THREE.Vector3(...nodes[i]).distanceTo(new THREE.Vector3(...nodes[j]));
                if (dist < 6) {
                    links.push([nodes[i], nodes[j]]);
                }
            }
        }
        return { neurons: nodes, connections: links };
    }, []);

    useFrame((state, delta) => {
        const { reversedFactors } = useStore.getState();

        // Дыхание/пульсация мозга
        if (networkGroup.current) {
            networkGroup.current.rotation.y += delta * 0.05;
            networkGroup.current.rotation.x += delta * 0.05;
            const scale = 1 + Math.sin(state.clock.elapsedTime) * 0.05;
            networkGroup.current.scale.set(scale, scale, scale);
        }

        // Доминанта
        if (dominantaRef.current) {
            const reverse = !!reversedFactors['dominanta'];
            if (reverse) {
                const weakNoise = 1 + (Math.random() - 0.5) * 0.05;
                dominantaRef.current.scale.set(weakNoise, weakNoise, weakNoise);
            } else {
                const beat = 1 + Math.sin(state.clock.elapsedTime * 8) * 0.15;
                dominantaRef.current.scale.set(beat, beat, beat);
            }
        }

        // Абстракция
        if (abstractionRef.current) {
            const reverse = !!reversedFactors['abstraction'];
            if (reverse) {
                abstractionRef.current.position.y -= delta * 0.5;
                if (abstractionRef.current.position.y < -10) abstractionRef.current.position.y = 10;
                abstractionRef.current.rotation.z = 0;
            } else {
                abstractionRef.current.position.y += delta * 0.3;
                if (abstractionRef.current.position.y > 10) abstractionRef.current.position.y = -10;
                abstractionRef.current.rotation.z += delta * 0.2;
            }
        }

        // Мутация (деформация)
        if (mutationRef.current) {
            const reverse = !!reversedFactors['mutation'];
            if (reverse) {
                // Стагнация: застывает
                mutationRef.current.rotation.x = 0;
                mutationRef.current.rotation.y = 0;
                mutationRef.current.scale.set(1, 1, 1);
            } else {
                // Мутация: деформируется и вращается хаотично
                mutationRef.current.rotation.x += delta * 1.5;
                mutationRef.current.rotation.y += delta * 0.7;
                mutationRef.current.rotation.z += delta * 0.3;
                const deform = 1 + Math.sin(state.clock.elapsedTime * 4) * 0.3;
                const deform2 = 1 + Math.cos(state.clock.elapsedTime * 3) * 0.2;
                mutationRef.current.scale.set(deform, deform2, deform);
            }
        }
    });

    const domReversed = !!reversedFactors['dominanta'];
    const absReversed = !!reversedFactors['abstraction'];
    const mutReversed = !!reversedFactors['mutation'];

    return (
        <group ref={networkGroup} position={[0, 0, 0]}>
            {/* Синапсы */}
            {connections.map((link, idx) => (
                <Line
                    key={idx}
                    points={link}
                    color="#aa00ff"
                    lineWidth={1}
                    transparent
                    opacity={0.3}
                />
            ))}

            {/* Нейроны */}
            {neurons.map((pos, idx) => (
                <mesh key={idx} position={pos}>
                    <sphereGeometry args={[0.2, 16, 16]} />
                    <meshBasicMaterial color={idx % 5 === 0 ? "#00ffff" : "#ffffff"} transparent opacity={0.8} />
                </mesh>
            ))}

            {/* ДОМИНАНТА */}
            <group
                ref={dominantaRef}
                position={[0, 5, 5]}
                onClick={(e) => { e.stopPropagation(); setActiveFactor('dominanta'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { document.body.style.cursor = 'auto' }}
            >
                <Sphere args={[1.2, 32, 32]}>
                    <meshBasicMaterial color={domReversed ? '#555555' : '#ff0055'} wireframe />
                </Sphere>
                <Text font="/Roboto-Regular.ttf" position={[0, -2, 0]} fontSize={0.8} color="#ffffff" outlineColor="black" outlineWidth={0.05}>
                    {domReversed ? 'РАССЕЯННОСТЬ' : 'ДОМИНАНТА'}
                </Text>
            </group>

            {/* АБСТРАКЦИЯ */}
            <group
                ref={abstractionRef}
                position={[5, -5, -5]}
                onClick={(e) => { e.stopPropagation(); setActiveFactor('abstraction'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { document.body.style.cursor = 'auto' }}
            >
                <Sphere args={[1, 16, 16]}>
                    <meshBasicMaterial color={absReversed ? '#888888' : '#00ffbb'} wireframe />
                </Sphere>
                <Text font="/Roboto-Regular.ttf" position={[0, -2, 0]} fontSize={0.8} color="#ffffff" outlineColor="black" outlineWidth={0.05}>
                    {absReversed ? 'БУКВАЛЬНОСТЬ' : 'АБСТРАКЦИЯ'}
                </Text>
            </group>

            {/* МУТАЦИЯ */}
            <group
                ref={mutationRef}
                position={[-5, -3, 3]}
                onClick={(e) => { e.stopPropagation(); setActiveFactor('mutation'); }}
                onPointerOver={() => { document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { document.body.style.cursor = 'auto' }}
            >
                <mesh>
                    <icosahedronGeometry args={[1.3, 1]} />
                    <meshBasicMaterial color={mutReversed ? '#666666' : '#ff8800'} wireframe />
                </mesh>
                <Text font="/Roboto-Regular.ttf" position={[0, -2.5, 0]} fontSize={0.8} color="#ffffff" outlineColor="black" outlineWidth={0.05}>
                    {mutReversed ? 'СТАГНАЦИЯ' : 'МУТАЦИЯ'}
                </Text>
            </group>
        </group>
    );
}
