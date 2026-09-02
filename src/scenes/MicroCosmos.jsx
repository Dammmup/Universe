import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { circleSprite } from '../lib/sprites';
import { fresnelFragment, fresnelVertex, tissueFragment, tissueVertex } from '../lib/shaders/life';

const _dummy = new THREE.Object3D();

function Label({ position, children, color = '#e8fbff', size = 0.22 }) {
    return (
        <Billboard position={position}>
            <Text
                font="/Roboto-Regular.ttf"
                fontSize={size}
                color={color}
                anchorX="center"
                anchorY="middle"
                outlineColor="#04080c"
                outlineWidth={0.04}
            >
                {children}
            </Text>
        </Billboard>
    );
}

function FactorOrb({ position, factorId, label, reverseLabel, color, reverseColor }) {
    const reversed = useStore((s) => !!s.reversedFactors[factorId]);
    const setActiveFactor = useStore((s) => s.setActiveFactor);
    const core = useRef();
    const tone = reversed ? reverseColor : color;

    useFrame((state, delta) => {
        if (!core.current) return;
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.6 + position[0]) * (reversed ? 0.03 : 0.1);
        core.current.scale.setScalar(pulse);
        core.current.rotation.y += delta * 0.7;
    });

    return (
        <group
            position={position}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh>
                <sphereGeometry args={[0.42, 16, 12]} />
                <meshBasicMaterial color={tone} transparent opacity={0.09} depthWrite={false} />
            </mesh>
            <mesh ref={core}>
                <icosahedronGeometry args={[0.16, 0]} />
                <meshStandardMaterial
                    color={tone}
                    emissive={tone}
                    emissiveIntensity={reversed ? 0.25 : 0.85}
                    roughness={0.35}
                />
            </mesh>
            <Label position={[0, -0.48, 0]} color={tone} size={0.16}>
                {reversed ? reverseLabel : label}
            </Label>
        </group>
    );
}

function FresnelShell({ args, scale, color, rim, power = 2.8, alpha = 0.12, gain = 1, side = THREE.FrontSide }) {
    const uniforms = useMemo(() => ({
        uColor: { value: new THREE.Color(color) },
        uRim: { value: new THREE.Color(rim) },
        uPower: { value: power },
        uAlpha: { value: alpha },
        uGain: { value: gain },
    }), [alpha, color, gain, power, rim]);

    useEffect(() => {
        uniforms.uColor.value.set(color);
        uniforms.uRim.value.set(rim);
        uniforms.uPower.value = power;
        uniforms.uAlpha.value = alpha;
        uniforms.uGain.value = gain;
    }, [alpha, color, gain, power, rim, uniforms]);

    return (
        <mesh scale={scale}>
            <sphereGeometry args={args} />
            <shaderMaterial
                vertexShader={fresnelVertex}
                fragmentShader={fresnelFragment}
                uniforms={uniforms}
                transparent
                depthWrite={false}
                side={side}
                blending={THREE.AdditiveBlending}
            />
        </mesh>
    );
}

function Cytoplasm({ reversed }) {
    const pointsRef = useRef();
    const { geometry, speeds } = useMemo(() => {
        const count = 520;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const speedsArr = new Float32Array(count);
        const warm = new THREE.Color('#9ff7e8');
        const gold = new THREE.Color('#ffe29a');
        for (let i = 0; i < count; i += 1) {
            const u = Math.random();
            const v = Math.random();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(2 * v - 1);
            const r = (0.4 + Math.random() * 3.6) * (0.72 + Math.random() * 0.28);
            positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
            positions[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * r * 0.78;
            positions[i * 3 + 2] = Math.cos(phi) * r * 0.7;
            const c = warm.clone().lerp(gold, Math.random() * 0.55);
            colors[i * 3] = c.r;
            colors[i * 3 + 1] = c.g;
            colors[i * 3 + 2] = c.b;
            speedsArr[i] = 0.08 + Math.random() * 0.18;
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        return { geometry: geom, speeds: speedsArr };
    }, []);

    useEffect(() => () => geometry.dispose(), [geometry]);

    useFrame((state) => {
        const pos = pointsRef.current?.geometry.attributes.position;
        if (!pos) return;
        const arr = pos.array;
        const t = reversed ? 0.12 : 1;
        for (let i = 0; i < speeds.length; i += 1) {
            const ix = i * 3;
            arr[ix + 1] += Math.sin(state.clock.elapsedTime * speeds[i] + i) * 0.004 * t;
            arr[ix] += Math.cos(state.clock.elapsedTime * speeds[i] * 0.7 + i) * 0.002 * t;
        }
        pos.needsUpdate = true;
    });

    return (
        <points ref={pointsRef} geometry={geometry}>
            <pointsMaterial
                map={circleSprite()}
                vertexColors
                transparent
                opacity={reversed ? 0.22 : 0.7}
                size={0.13}
                sizeAttenuation
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}

function CellMembrane({ reversed }) {
    const group = useRef();
    const pores = useMemo(() => {
        const items = [];
        for (let i = 0; i < 22; i += 1) {
            const phi = Math.acos(1 - (2 * (i + 0.5)) / 22);
            const theta = Math.PI * (1 + Math.sqrt(5)) * i;
            items.push({
                x: Math.sin(phi) * Math.cos(theta) * 4.55,
                y: Math.sin(phi) * Math.sin(theta) * 3.45,
                z: Math.cos(phi) * 3.15,
                phi,
                theta,
            });
        }
        return items;
    }, []);

    useFrame((state) => {
        if (!group.current) return;
        const breath = 1 + Math.sin(state.clock.elapsedTime * 0.85) * (reversed ? 0.012 : 0.028);
        group.current.scale.set(breath, breath * 0.92, breath * 0.88);
    });

    return (
        <group ref={group}>
            <FresnelShell
                args={[4.7, 64, 40]}
                color={reversed ? '#243038' : '#0b3d48'}
                rim={reversed ? '#6d8894' : '#7cf4ff'}
                power={2.2}
                alpha={reversed ? 0.08 : 0.16}
                gain={reversed ? 0.55 : 1}
                side={THREE.BackSide}
            />
            <mesh>
                <sphereGeometry args={[4.45, 48, 32]} />
                <meshBasicMaterial
                    color={reversed ? '#0a1014' : '#071820'}
                    transparent
                    opacity={reversed ? 0.22 : 0.38}
                    depthWrite={false}
                    side={THREE.BackSide}
                />
            </mesh>
            <FresnelShell
                args={[4.62, 64, 40]}
                color={reversed ? '#1c2a30' : '#123a44'}
                rim={reversed ? '#8aa0aa' : '#c8fff8'}
                power={3.1}
                alpha={reversed ? 0.06 : 0.14}
            />
            {pores.map((p, i) => (
                <mesh
                    key={i}
                    position={[p.x, p.y, p.z]}
                    lookAt={[0, 0, 0]}
                >
                    <torusGeometry args={[reversed ? 0.22 : 0.13, 0.028, 8, 18]} />
                    <meshBasicMaterial
                        color={reversed ? '#8a9aa3' : '#b8fff4'}
                        transparent
                        opacity={0.7}
                    />
                </mesh>
            ))}
            <Label position={[0, -4.05, 0]} color={reversed ? '#8ba0aa' : '#9befff'} size={0.24}>
                {reversed ? 'ПРОТЕЧКА МЕМБРАНЫ' : 'КЛЕТОЧНАЯ МЕМБРАНА'}
            </Label>
        </group>
    );
}

function DNAHelix({ reversed }) {
    const group = useRef();
    const { leftCurve, rightCurve, bases } = useMemo(() => {
        const left = [];
        const right = [];
        const basePairs = [];
        const turns = 7;
        const height = 2.35;
        const radius = 0.38;
        const steps = 90;
        for (let i = 0; i <= steps; i += 1) {
            const t = i / steps;
            const angle = t * Math.PI * 2 * turns;
            const y = (t - 0.5) * height;
            left.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
            right.push(new THREE.Vector3(Math.cos(angle + Math.PI) * radius, y, Math.sin(angle + Math.PI) * radius));
            if (i % 5 === 0 && i !== 0 && i !== steps) {
                basePairs.push({
                    position: new THREE.Vector3(0, y, 0),
                    rotation: [0, -angle, 0],
                    kind: (i / 5) % 4,
                });
            }
        }
        return {
            leftCurve: new THREE.CatmullRomCurve3(left),
            rightCurve: new THREE.CatmullRomCurve3(right),
            bases: basePairs,
        };
    }, []);

    useFrame((_, delta) => {
        if (!group.current) return;
        group.current.rotation.y += delta * (reversed ? 0.04 : 0.28);
    });

    const baseColors = ['#62ff9f', '#ff66cf', '#ffe76d', '#7cf7ff'];

    return (
        <group ref={group}>
            <mesh>
                <tubeGeometry args={[leftCurve, 80, reversed ? 0.018 : 0.032, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#6a6670' : '#62ff9f'}
                    emissive={reversed ? '#111' : '#0d4a28'}
                    emissiveIntensity={reversed ? 0.1 : 0.7}
                    roughness={0.4}
                />
            </mesh>
            <mesh>
                <tubeGeometry args={[rightCurve, 80, reversed ? 0.018 : 0.032, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#6a6670' : '#ff66cf'}
                    emissive={reversed ? '#111' : '#4a0d32'}
                    emissiveIntensity={reversed ? 0.1 : 0.7}
                    roughness={0.4}
                />
            </mesh>
            {bases.map((b, i) => (
                <mesh key={i} position={b.position} rotation={b.rotation}>
                    <boxGeometry args={[0.72, 0.045, 0.05]} />
                    <meshStandardMaterial
                        color={reversed ? '#555' : baseColors[b.kind]}
                        emissive={reversed ? '#000' : baseColors[b.kind]}
                        emissiveIntensity={reversed ? 0 : 0.35}
                        transparent
                        opacity={reversed ? 0.25 : 0.9}
                    />
                </mesh>
            ))}
        </group>
    );
}

function Nucleus({ reversed }) {
    return (
        <group position={[-0.15, 0.15, 0]}>
            <FresnelShell
                args={[1.55, 48, 32]}
                color={reversed ? '#2a2430' : '#2a1040'}
                rim={reversed ? '#8a8090' : '#e9b4ff'}
                power={2.6}
                alpha={reversed ? 0.1 : 0.2}
            />
            <mesh>
                <sphereGeometry args={[0.42, 24, 18]} />
                <meshStandardMaterial
                    color={reversed ? '#5a5060' : '#ff9ee8'}
                    emissive={reversed ? '#1a1018' : '#6a1457'}
                    emissiveIntensity={reversed ? 0.15 : 0.55}
                    transparent
                    opacity={0.85}
                    roughness={0.5}
                />
            </mesh>
            <group position={[0, 0, 0]} scale={0.92}>
                <DNAHelix reversed={reversed} />
            </group>
            <Label position={[0, 1.95, 0]} color={reversed ? '#aaa0aa' : '#f3d0ff'} size={0.2}>
                {reversed ? 'ОШИБКИ ДНК' : 'ЯДРО / ДНК'}
            </Label>
        </group>
    );
}

function beanGeometry() {
    const pts = [];
    for (let i = 0; i <= 24; i += 1) {
        const t = i / 24;
        const y = (t - 0.5) * 1.28;
        const r = 0.1 + Math.sin(t * Math.PI) * 0.3 - Math.sin(t * Math.PI * 2) * 0.05;
        pts.push(new THREE.Vector2(Math.max(0.05, r), y));
    }
    return new THREE.LatheGeometry(pts, 28);
}

function Mitochondria({ reversed }) {
    const group = useRef();
    const geom = useMemo(() => beanGeometry(), []);
    useEffect(() => () => geom.dispose(), [geom]);

    const items = useMemo(() => ([
        { pos: [-2.55, 1.35, 0.55], rot: [0.4, 0.5, -0.4], scale: 0.95 },
        { pos: [2.35, 1.05, -0.55], rot: [-0.3, -0.4, 0.5], scale: 0.82 },
        { pos: [1.85, -1.55, 0.7], rot: [0.5, 0.2, 0.3], scale: 0.7 },
    ]), []);

    useFrame((state, delta) => {
        if (!group.current) return;
        group.current.children.forEach((child, i) => {
            child.rotation.z += delta * (reversed ? 0.05 : 0.18) * (i % 2 ? -1 : 1);
            const s = items[i].scale * (1 + Math.sin(state.clock.elapsedTime * 2.1 + i) * (reversed ? 0.02 : 0.06));
            child.scale.setScalar(s);
        });
    });

    return (
        <group>
            <group ref={group}>
                {items.map((item, i) => (
                    <group key={i} position={item.pos} rotation={item.rot}>
                        <mesh geometry={geom}>
                            <meshStandardMaterial
                                color={reversed ? '#5f4f32' : '#e8942a'}
                                emissive={reversed ? '#151005' : '#6a3200'}
                                emissiveIntensity={reversed ? 0.12 : 0.55}
                                roughness={0.55}
                                transparent
                                opacity={0.92}
                            />
                        </mesh>
                        {[0, 1, 2, 3, 4].map((ridge) => (
                            <mesh key={ridge} position={[0, -0.4 + ridge * 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
                                <torusGeometry args={[0.16 - Math.abs(ridge - 2) * 0.02, 0.012, 6, 18]} />
                                <meshBasicMaterial
                                    color={reversed ? '#8a7450' : '#ffe08a'}
                                    transparent
                                    opacity={0.75}
                                />
                            </mesh>
                        ))}
                    </group>
                ))}
            </group>
            <Label position={[2.35, 1.85, -0.55]} color={reversed ? '#9b8a6c' : '#ffd179'} size={0.18}>
                {reversed ? 'ЭНЕРГЕТИЧЕСКИЙ ПРОВАЛ' : 'МИТОХОНДРИИ'}
            </Label>
        </group>
    );
}

function Ribosome({ reversed }) {
    const ref = useRef();
    const chain = useMemo(() => {
        const pts = [];
        for (let i = 0; i <= 40; i += 1) {
            const t = i / 40;
            pts.push(new THREE.Vector3(
                Math.sin(t * Math.PI * 6) * 0.22,
                -0.15 - t * 1.15,
                Math.cos(t * Math.PI * 5) * 0.16,
            ));
        }
        return new THREE.CatmullRomCurve3(pts);
    }, []);

    useFrame((_, delta) => {
        if (!ref.current) return;
        ref.current.rotation.y += delta * (reversed ? 0.05 : 0.35);
    });

    return (
        <group ref={ref} position={[2.15, 0.15, 0.85]}>
            <mesh position={[0, 0.16, 0]}>
                <sphereGeometry args={[0.28, 20, 16]} />
                <meshStandardMaterial
                    color={reversed ? '#4f5661' : '#7cf7ff'}
                    emissive={reversed ? '#101315' : '#135a66'}
                    emissiveIntensity={0.4}
                    roughness={0.55}
                />
            </mesh>
            <mesh position={[0, -0.12, 0.04]}>
                <sphereGeometry args={[0.2, 18, 14]} />
                <meshStandardMaterial
                    color={reversed ? '#3a4048' : '#5ad0dc'}
                    emissive={reversed ? '#101315' : '#0d3a40'}
                    emissiveIntensity={0.3}
                    roughness={0.55}
                />
            </mesh>
            <mesh>
                <tubeGeometry args={[chain, 40, reversed ? 0.018 : 0.028, 6, false]} />
                <meshStandardMaterial
                    color={reversed ? '#777' : '#ffb7f0'}
                    emissive={reversed ? '#000' : '#5a2048'}
                    emissiveIntensity={0.4}
                    transparent
                    opacity={reversed ? 0.3 : 0.9}
                />
            </mesh>
            <Label position={[0, -1.45, 0]} color={reversed ? '#889096' : '#bdfaff'} size={0.17}>
                {reversed ? 'ДЕФЕКТ БЕЛКА' : 'РИБОСОМА'}
            </Label>
        </group>
    );
}

function SynapseBridge({ reversed }) {
    const vesRef = useRef();
    const { axon, dendrite, count } = useMemo(() => {
        const a = new THREE.CatmullRomCurve3([
            new THREE.Vector3(-4.4, -1.55, 0.2),
            new THREE.Vector3(-2.4, -1.9, 0.15),
            new THREE.Vector3(-0.55, -1.35, 0.05),
        ]);
        const d = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.55, -1.35, 0.05),
            new THREE.Vector3(2.4, -1.9, 0.15),
            new THREE.Vector3(4.4, -1.55, 0.2),
        ]);
        return { axon: a, dendrite: d, count: 22 };
    }, []);

    useFrame((state) => {
        const mesh = vesRef.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime;
        for (let i = 0; i < count; i += 1) {
            const u = reversed
                ? 0.5 + Math.sin(t * 1.2 + i) * 0.08
                : ((t * 0.22 + i / count) % 1);
            const y = -1.35 + Math.sin(t * 4 + i) * 0.04;
            _dummy.position.set(-0.42 + u * 0.84, y, Math.cos(i) * 0.08);
            _dummy.scale.setScalar(reversed ? 0.55 : 1);
            _dummy.updateMatrix();
            mesh.setMatrixAt(i, _dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            <mesh>
                <tubeGeometry args={[axon, 32, 0.055, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#67607a' : '#b78cff'}
                    emissive={reversed ? '#111' : '#3a1860'}
                    emissiveIntensity={0.45}
                    roughness={0.4}
                />
            </mesh>
            <mesh>
                <tubeGeometry args={[dendrite, 32, 0.055, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#67607a' : '#77d7ff'}
                    emissive={reversed ? '#111' : '#123850'}
                    emissiveIntensity={0.45}
                    roughness={0.4}
                />
            </mesh>
            <mesh position={[-0.55, -1.35, 0.05]}>
                <sphereGeometry args={[0.16, 16, 12]} />
                <meshStandardMaterial color={reversed ? '#555' : '#d8b4ff'} emissive="#4a2080" emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0.55, -1.35, 0.05]}>
                <sphereGeometry args={[0.14, 16, 12]} />
                <meshStandardMaterial color={reversed ? '#555' : '#9ae2ff'} emissive="#145068" emissiveIntensity={0.4} />
            </mesh>
            <instancedMesh ref={vesRef} args={[undefined, undefined, count]} frustumCulled={false}>
                <sphereGeometry args={[0.045, 8, 8]} />
                <meshBasicMaterial
                    color={reversed ? '#777' : '#fff36d'}
                    transparent
                    opacity={reversed ? 0.3 : 1}
                />
            </instancedMesh>
            <Label position={[0, -2.15, 0.2]} color={reversed ? '#999' : '#ffe96d'} size={0.18}>
                {reversed ? 'РАЗРЫВ СИНАПСА' : 'СИНАПС'}
            </Label>
        </group>
    );
}

function MyelinAxon({ reversed }) {
    const curve = useMemo(() => {
        const pts = [];
        for (let i = 0; i < 10; i += 1) {
            pts.push(new THREE.Vector3(-3.4 + i * 0.76, 2.55 + Math.sin(i * 0.7) * 0.12, -0.45));
        }
        return new THREE.CatmullRomCurve3(pts);
    }, []);

    return (
        <group>
            <mesh>
                <tubeGeometry args={[curve, 40, 0.045, 8, false]} />
                <meshStandardMaterial
                    color={reversed ? '#5d6670' : '#c8f0ff'}
                    emissive={reversed ? '#111' : '#1a4050'}
                    emissiveIntensity={0.35}
                />
            </mesh>
            {Array.from({ length: 8 }, (_, i) => {
                const u = (i + 0.5) / 8;
                const p = curve.getPointAt(u);
                const damaged = reversed && i % 3 === 0;
                return (
                    <mesh key={i} position={p} rotation={[0, 0, Math.PI / 2]}>
                        <capsuleGeometry args={[damaged ? 0.07 : 0.12, 0.28, 6, 10]} />
                        <meshStandardMaterial
                            color={damaged ? '#3d3f43' : '#f6fbff'}
                            transparent
                            opacity={damaged ? 0.25 : 0.82}
                            roughness={0.35}
                        />
                    </mesh>
                );
            })}
            <Label position={[0, 3.15, -0.3]} color={reversed ? '#8c9299' : '#dff7ff'} size={0.18}>
                {reversed ? 'ДЕМИЕЛИНИЗАЦИЯ' : 'МИЕЛИН'}
            </Label>
        </group>
    );
}

const FACTORS = [
    { id: 'cellMembrane', label: 'МЕМБРАНА', reverse: 'ПРОТЕЧКА', color: '#62e9ff', reverseColor: '#647885', pos: [0, -3.55, 1.4] },
    { id: 'dnaRepair', label: 'РЕМОНТ ДНК', reverse: 'ОШИБКИ', color: '#7dff91', reverseColor: '#8a6a72', pos: [-1.85, 1.85, 1.55] },
    { id: 'mutation', label: 'МУТАЦИЯ', reverse: 'СТАГНАЦИЯ', color: '#ff9346', reverseColor: '#6b6b6b', pos: [-2.6, -2.15, 1.35] },
    { id: 'synapse', label: 'СИНАПС', reverse: 'РАЗРЫВ', color: '#ffe76d', reverseColor: '#777777', pos: [-1.15, -2.55, 1.2] },
    { id: 'neurotransmitter', label: 'МЕДИАТОР', reverse: 'ШУМ', color: '#fff7a8', reverseColor: '#8a8060', pos: [1.15, -2.55, 1.2] },
    { id: 'proteinSynthesis', label: 'БЕЛОК', reverse: 'ДЕФЕКТ', color: '#ff9fe7', reverseColor: '#80677b', pos: [2.55, -2.05, 1.25] },
    { id: 'mitochondria', label: 'АТФ', reverse: 'ПРОВАЛ', color: '#ffc65a', reverseColor: '#786547', pos: [3.35, 1.85, 0.95] },
    { id: 'myelin', label: 'МИЕЛИН', reverse: 'РАЗОБЩЕНИЕ', color: '#e8fbff', reverseColor: '#808a92', pos: [0, 3.55, 1.05] },
    { id: 'dominanta', label: 'ДОМИНАНТА', reverse: 'РАССЕЯННОСТЬ', color: '#ff4e9c', reverseColor: '#707070', pos: [3.7, -0.35, 1.1] },
    { id: 'abstraction', label: 'АБСТРАКЦИЯ', reverse: 'БУКВАЛЬНОСТЬ', color: '#32ffc7', reverseColor: '#868686', pos: [-3.7, 0.55, 1.1] },
    { id: 'attention', label: 'ВНИМАНИЕ', reverse: 'РАСФОКУС', color: '#ffffff', reverseColor: '#8f8f8f', pos: [1.7, 2.85, 1.2] },
    { id: 'dreaming', label: 'СОН-ОБРАЗ', reverse: 'ПУСТОТА', color: '#9ba7ff', reverseColor: '#6b6b82', pos: [-3.15, -2.35, 1.35] },
];

export default function MicroCosmos() {
    const reversedFactors = useStore((s) => s.reversedFactors);
    const groupRef = useRef();

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        groupRef.current.rotation.y += delta * 0.018;
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.45) * 0.06;
    });

    const membraneReversed = !!reversedFactors.cellMembrane;
    const dnaReversed = !!reversedFactors.mutation || !!reversedFactors.dnaRepair;
    const mitoReversed = !!reversedFactors.mitochondria;
    const synapseReversed = !!reversedFactors.synapse || !!reversedFactors.neurotransmitter;
    const proteinReversed = !!reversedFactors.proteinSynthesis;
    const myelinReversed = !!reversedFactors.myelin;

    return (
        <group ref={groupRef}>
            <ambientLight intensity={0.28} />
            <pointLight position={[0, 0.2, 0]} intensity={1.8} color="#e9b4ff" distance={8} />
            <pointLight position={[2.3, 1.1, 1]} intensity={1.6} color="#ffb13b" distance={7} />
            <pointLight position={[-3, -1, 3]} intensity={1.2} color="#62e9ff" distance={10} />
            <pointLight position={[0, 4, 6]} intensity={1.4} color="#b7f7ff" />

            <Cytoplasm reversed={membraneReversed} />
            <CellMembrane reversed={membraneReversed} />
            <Nucleus reversed={dnaReversed} />
            <Mitochondria reversed={mitoReversed} />
            <Ribosome reversed={proteinReversed} />
            <SynapseBridge reversed={synapseReversed} />
            <MyelinAxon reversed={myelinReversed} />

            {FACTORS.map((f) => (
                <FactorOrb
                    key={f.id}
                    position={f.pos}
                    factorId={f.id}
                    label={f.label}
                    reverseLabel={f.reverse}
                    color={f.color}
                    reverseColor={f.reverseColor}
                />
            ))}
        </group>
    );
}
