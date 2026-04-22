import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Sphere, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';

function MicroLabel({ position, children, color = '#ffffff', size = 0.38 }) {
    return (
        <Text
            font="/Roboto-Regular.ttf"
            position={position}
            fontSize={size}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineColor="black"
            outlineWidth={0.035}
        >
            {children}
        </Text>
    );
}

function MicroFactor({ position, factorId, label, reverseLabel, color, reverseColor, shape = 'sphere' }) {
    const { reversedFactors, setActiveFactor } = useStore();
    const ref = useRef();
    const isReversed = !!reversedFactors[factorId];
    const displayColor = isReversed ? reverseColor : color;

    useFrame((state, delta) => {
        if (!ref.current) return;
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.8 + position[0] * 0.7) * (isReversed ? 0.025 : 0.09);
        ref.current.scale.setScalar(pulse);
        ref.current.rotation.x += delta * (isReversed ? 0.18 : 0.5);
        ref.current.rotation.y += delta * (isReversed ? 0.25 : 0.8);
    });

    return (
        <group
            position={position}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh>
                <sphereGeometry args={[0.8, 18, 18]} />
                <meshBasicMaterial color={displayColor} transparent opacity={0.08} />
            </mesh>
            <mesh ref={ref}>
                {shape === 'sphere' && <sphereGeometry args={[0.28, 18, 18]} />}
                {shape === 'torus' && <torusGeometry args={[0.28, 0.06, 10, 30]} />}
                {shape === 'octahedron' && <octahedronGeometry args={[0.36, 0]} />}
                {shape === 'icosahedron' && <icosahedronGeometry args={[0.36, 1]} />}
                {shape === 'box' && <boxGeometry args={[0.48, 0.48, 0.48]} />}
                <meshBasicMaterial color={displayColor} wireframe={shape !== 'sphere'} transparent opacity={0.95} />
            </mesh>
            <MicroLabel position={[0, -0.72, 0]} color={displayColor} size={0.22}>
                {isReversed ? reverseLabel : label}
            </MicroLabel>
        </group>
    );
}

function CellMembrane({ reversed }) {
    const ref = useRef();

    useFrame((state) => {
        if (!ref.current) return;
        const breath = 1 + Math.sin(state.clock.elapsedTime * 0.9) * (reversed ? 0.015 : 0.04);
        ref.current.scale.set(breath, breath * 0.78, breath);
    });

    const pores = useMemo(() => {
        const items = [];
        for (let i = 0; i < 18; i += 1) {
            const angle = (i / 18) * Math.PI * 2;
            items.push([Math.cos(angle) * 5.2, Math.sin(angle) * 3.1, Math.sin(angle * 2) * 0.35, angle]);
        }
        return items;
    }, []);

    return (
        <group ref={ref}>
            <Sphere args={[5.65, 48, 24]} scale={[1, 0.62, 0.45]}>
                <meshBasicMaterial color={reversed ? '#42545f' : '#48d8ff'} wireframe transparent opacity={reversed ? 0.13 : 0.22} />
            </Sphere>
            {pores.map(([x, y, z, angle], index) => (
                <mesh key={index} position={[x, y, z]} rotation={[Math.PI / 2, 0, angle]}>
                    <torusGeometry args={[0.18, 0.025, 8, 18]} />
                    <meshBasicMaterial color={reversed ? '#687985' : '#a9f3ff'} transparent opacity={0.7} />
                </mesh>
            ))}
            <MicroLabel position={[0, -3.95, 0.2]} color={reversed ? '#8ba0aa' : '#9befff'} size={0.28}>
                КЛЕТОЧНАЯ МЕМБРАНА: ГРАНИЦА И ОБМЕН
            </MicroLabel>
        </group>
    );
}

function DNAHelix({ reversed }) {
    const ref = useRef();
    const strands = useMemo(() => {
        const left = [];
        const right = [];
        const rungs = [];
        for (let i = 0; i <= 84; i += 1) {
            const t = i / 84;
            const angle = t * Math.PI * 9;
            const y = (t - 0.5) * 5.3;
            left.push(new THREE.Vector3(Math.cos(angle) * 0.55, y, Math.sin(angle) * 0.55));
            right.push(new THREE.Vector3(Math.cos(angle + Math.PI) * 0.55, y, Math.sin(angle + Math.PI) * 0.55));
            if (i % 6 === 0) {
                rungs.push([
                    new THREE.Vector3(Math.cos(angle) * 0.55, y, Math.sin(angle) * 0.55),
                    new THREE.Vector3(Math.cos(angle + Math.PI) * 0.55, y, Math.sin(angle + Math.PI) * 0.55),
                ]);
            }
        }
        return { left, right, rungs };
    }, []);

    useFrame((state, delta) => {
        if (!ref.current) return;
        ref.current.rotation.y += delta * (reversed ? 0.05 : 0.22);
        ref.current.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.12;
    });

    return (
        <group ref={ref} position={[-2.25, 0.2, 0]} rotation={[0.2, 0, 0.08]}>
            <Line points={strands.left} color={reversed ? '#6a6670' : '#62ff9f'} lineWidth={2.2} transparent opacity={reversed ? 0.45 : 0.95} />
            <Line points={strands.right} color={reversed ? '#6a6670' : '#ff66cf'} lineWidth={2.2} transparent opacity={reversed ? 0.45 : 0.95} />
            {strands.rungs.map((rung, index) => (
                <Line key={index} points={rung} color={reversed ? '#555555' : '#ffffff'} lineWidth={1.1} transparent opacity={reversed ? 0.25 : 0.55} />
            ))}
            <MicroLabel position={[0, 3.15, 0]} color={reversed ? '#aaa0aa' : '#d7ffd8'} size={0.28}>
                ДНК / НАСЛЕДСТВЕННОСТЬ
            </MicroLabel>
        </group>
    );
}

function Mitochondria({ reversed }) {
    const groupRef = useRef();
    const items = [
        [-4.25, 1.85, 0.8, 0.15],
        [3.75, 1.65, -0.45, -0.35],
        [2.7, -2.05, 0.9, 0.35],
    ];

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        groupRef.current.rotation.y += delta * 0.05;
        groupRef.current.children.forEach((child, index) => {
            child.rotation.z += delta * (reversed ? 0.08 : 0.24) * (index % 2 ? -1 : 1);
            child.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2 + index) * (reversed ? 0.015 : 0.05));
        });
    });

    return (
        <group ref={groupRef}>
            {items.map(([x, y, z, rot], index) => (
                <group key={index} position={[x, y, z]} rotation={[0.2, 0, rot]}>
                    <mesh scale={[0.95, 0.46, 0.28]}>
                        <sphereGeometry args={[0.65, 24, 18]} />
                        <meshStandardMaterial color={reversed ? '#5f4f32' : '#ffb13b'} emissive={reversed ? '#151005' : '#663600'} emissiveIntensity={reversed ? 0.15 : 0.7} roughness={0.65} />
                    </mesh>
                    {[...Array(4)].map((_, ridge) => (
                        <mesh key={ridge} position={[-0.32 + ridge * 0.22, 0, 0.16]} rotation={[Math.PI / 2, 0, 0]}>
                            <torusGeometry args={[0.15, 0.012, 6, 16]} />
                            <meshBasicMaterial color={reversed ? '#8a7450' : '#ffe08a'} transparent opacity={0.8} />
                        </mesh>
                    ))}
                </group>
            ))}
            <MicroLabel position={[3.75, 2.42, -0.45]} color={reversed ? '#9b8a6c' : '#ffd179'} size={0.24}>
                МИТОХОНДРИИ / ЭНЕРГИЯ
            </MicroLabel>
        </group>
    );
}

function SynapseBridge({ reversed }) {
    const ref = useRef();
    const axon = useMemo(() => [
        new THREE.Vector3(-4.6, -0.7, 0.15),
        new THREE.Vector3(-2.1, -1.35, 0.1),
        new THREE.Vector3(-0.75, -0.85, 0.05),
    ], []);
    const dendrite = useMemo(() => [
        new THREE.Vector3(0.75, -0.85, 0.05),
        new THREE.Vector3(2.1, -1.35, 0.1),
        new THREE.Vector3(4.6, -0.7, 0.15),
    ], []);
    const vesicles = useMemo(() => {
        const arr = [];
        for (let i = 0; i < 18; i += 1) {
            arr.push({ offset: i / 18, y: -0.95 + Math.sin(i * 1.7) * 0.22, z: Math.cos(i) * 0.18 });
        }
        return arr;
    }, []);

    useFrame((state) => {
        if (!ref.current) return;
        ref.current.children.forEach((child, index) => {
            const travel = reversed ? 0.5 + Math.sin(state.clock.elapsedTime * 1.5 + index) * 0.07 : (state.clock.elapsedTime * 0.28 + index * 0.075) % 1;
            child.position.x = -0.45 + travel * 0.9;
            child.position.y = vesicles[index].y + Math.sin(state.clock.elapsedTime * 5 + index) * 0.035;
        });
    });

    return (
        <group>
            <Line points={axon} color={reversed ? '#67607a' : '#b78cff'} lineWidth={3} transparent opacity={reversed ? 0.35 : 0.8} />
            <Line points={dendrite} color={reversed ? '#67607a' : '#77d7ff'} lineWidth={3} transparent opacity={reversed ? 0.35 : 0.8} />
            <group ref={ref}>
                {vesicles.map(({ y, z }, index) => (
                    <mesh key={index} position={[0, y, z]}>
                        <sphereGeometry args={[0.075, 10, 10]} />
                        <meshBasicMaterial color={reversed ? '#777777' : '#fff36d'} transparent opacity={reversed ? 0.35 : 0.95} />
                    </mesh>
                ))}
            </group>
            <MicroLabel position={[0, -1.75, 0.25]} color={reversed ? '#999999' : '#ffe96d'} size={0.25}>
                СИНАПС: ПЕРЕДАЧА СИГНАЛА
            </MicroLabel>
        </group>
    );
}

function ProteinFactory({ reversed }) {
    const ref = useRef();
    const chain = useMemo(() => {
        const pts = [];
        for (let i = 0; i <= 54; i += 1) {
            const t = i / 54;
            pts.push(new THREE.Vector3(
                Math.sin(t * Math.PI * 5) * 0.55,
                (t - 0.5) * 2.2,
                Math.cos(t * Math.PI * 4) * 0.28,
            ));
        }
        return pts;
    }, []);

    useFrame((state, delta) => {
        if (!ref.current) return;
        ref.current.rotation.y += delta * (reversed ? 0.08 : 0.32);
        ref.current.position.y = 0.2 + Math.sin(state.clock.elapsedTime * 1.2) * 0.08;
    });

    return (
        <group ref={ref} position={[2.05, 0.35, 0.25]}>
            <mesh>
                <torusGeometry args={[0.72, 0.15, 16, 42]} />
                <meshStandardMaterial color={reversed ? '#4f5661' : '#7cf7ff'} emissive={reversed ? '#101315' : '#135a66'} emissiveIntensity={0.35} roughness={0.7} />
            </mesh>
            <Line points={chain} color={reversed ? '#777777' : '#ffb7f0'} lineWidth={1.8} transparent opacity={reversed ? 0.35 : 0.85} />
            <MicroLabel position={[0, -1.58, 0]} color={reversed ? '#889096' : '#bdfaff'} size={0.23}>
                РИБОСОМА / БЕЛОК
            </MicroLabel>
        </group>
    );
}

function MyelinAxon({ reversed }) {
    const segments = useMemo(() => {
        const result = [];
        for (let i = 0; i < 8; i += 1) {
            result.push([-3.2 + i * 0.9, 2.88 + Math.sin(i) * 0.12, -0.35]);
        }
        return result;
    }, []);

    return (
        <group>
            <Line
                points={segments.map(([x, y, z]) => new THREE.Vector3(x, y, z))}
                color={reversed ? '#5d6670' : '#9bdcff'}
                lineWidth={2.4}
                transparent
                opacity={reversed ? 0.35 : 0.75}
            />
            {segments.map(([x, y, z], index) => (
                <mesh key={index} position={[x, y, z]} rotation={[0, 0, Math.PI / 2]}>
                    <capsuleGeometry args={[0.16, 0.34, 6, 12]} />
                    <meshStandardMaterial color={reversed && index % 3 === 0 ? '#3d3f43' : '#f6fbff'} transparent opacity={reversed ? 0.38 : 0.8} roughness={0.5} />
                </mesh>
            ))}
            <MicroLabel position={[0, 3.45, -0.2]} color={reversed ? '#8c9299' : '#dff7ff'} size={0.24}>
                МИЕЛИН: ИЗОЛЯЦИЯ И СКОРОСТЬ
            </MicroLabel>
        </group>
    );
}

export default function MicroCosmos() {
    const { reversedFactors } = useStore();
    const groupRef = useRef();

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        groupRef.current.rotation.y += delta * 0.035;
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.08;
    });

    const membraneReversed = !!reversedFactors.cellMembrane;
    const dnaReversed = !!reversedFactors.mutation || !!reversedFactors.dnaRepair;
    const mitoReversed = !!reversedFactors.mitochondria;
    const synapseReversed = !!reversedFactors.synapse || !!reversedFactors.neurotransmitter;
    const proteinReversed = !!reversedFactors.proteinSynthesis;
    const myelinReversed = !!reversedFactors.myelin;

    return (
        <group ref={groupRef} position={[0, 0, 0]}>
            <ambientLight intensity={0.65} />
            <pointLight position={[0, 4, 5]} intensity={2.4} color="#b7f7ff" />
            <pointLight position={[-5, -2, 3]} intensity={1.3} color="#ff76d8" />

            <CellMembrane reversed={membraneReversed} />
            <DNAHelix reversed={dnaReversed} />
            <Mitochondria reversed={mitoReversed} />
            <SynapseBridge reversed={synapseReversed} />
            <ProteinFactory reversed={proteinReversed} />
            <MyelinAxon reversed={myelinReversed} />

            <MicroFactor
                position={[-5.35, -2.35, 0.55]}
                factorId="cellMembrane"
                label="МЕМБРАНА"
                reverseLabel="ПРОТЕЧКА"
                color="#62e9ff"
                reverseColor="#647885"
                shape="torus"
            />
            <MicroFactor
                position={[-3.9, 0.15, 1.1]}
                factorId="dnaRepair"
                label="РЕМОНТ ДНК"
                reverseLabel="ОШИБКИ"
                color="#7dff91"
                reverseColor="#8a6a72"
                shape="icosahedron"
            />
            <MicroFactor
                position={[-2.25, -2.5, 1.15]}
                factorId="mutation"
                label="МУТАЦИЯ"
                reverseLabel="СТАГНАЦИЯ"
                color="#ff9346"
                reverseColor="#6b6b6b"
                shape="octahedron"
            />
            <MicroFactor
                position={[-0.82, -0.22, 1.25]}
                factorId="synapse"
                label="СИНАПС"
                reverseLabel="РАЗРЫВ"
                color="#ffe76d"
                reverseColor="#777777"
                shape="sphere"
            />
            <MicroFactor
                position={[0.82, -0.22, 1.25]}
                factorId="neurotransmitter"
                label="МЕДИАТОР"
                reverseLabel="ШУМ"
                color="#fff7a8"
                reverseColor="#8a8060"
                shape="sphere"
            />
            <MicroFactor
                position={[2.2, -2.45, 1.05]}
                factorId="proteinSynthesis"
                label="БЕЛОК"
                reverseLabel="ДЕФЕКТ"
                color="#ff9fe7"
                reverseColor="#80677b"
                shape="box"
            />
            <MicroFactor
                position={[4.85, 1.85, 0.9]}
                factorId="mitochondria"
                label="АТФ"
                reverseLabel="ПРОВАЛ"
                color="#ffc65a"
                reverseColor="#786547"
                shape="torus"
            />
            <MicroFactor
                position={[0.0, 2.72, 0.9]}
                factorId="myelin"
                label="МИЕЛИН"
                reverseLabel="РАЗОБЩЕНИЕ"
                color="#e8fbff"
                reverseColor="#808a92"
                shape="torus"
            />
            <MicroFactor
                position={[4.85, -0.55, 0.72]}
                factorId="dominanta"
                label="ДОМИНАНТА"
                reverseLabel="РАССЕЯННОСТЬ"
                color="#ff4e9c"
                reverseColor="#707070"
                shape="icosahedron"
            />
            <MicroFactor
                position={[-4.85, 1.25, 0.78]}
                factorId="abstraction"
                label="АБСТРАКЦИЯ"
                reverseLabel="БУКВАЛЬНОСТЬ"
                color="#32ffc7"
                reverseColor="#868686"
                shape="octahedron"
            />
            <MicroFactor
                position={[0, 4.35, 0.45]}
                factorId="attention"
                label="ВНИМАНИЕ"
                reverseLabel="РАСФОКУС"
                color="#ffffff"
                reverseColor="#8f8f8f"
                shape="sphere"
            />
            <MicroFactor
                position={[0, -3.65, 0.55]}
                factorId="dreaming"
                label="СОН-ОБРАЗ"
                reverseLabel="ПУСТОТА"
                color="#9ba7ff"
                reverseColor="#6b6b82"
                shape="icosahedron"
            />

            <MicroLabel position={[0, 4.9, 0.15]} color="#ffffff" size={0.36}>
                МИКРО-УРОВЕНЬ: КЛЕТКА, ГЕНЫ, СИНАПСЫ
            </MicroLabel>
        </group>
    );
}
