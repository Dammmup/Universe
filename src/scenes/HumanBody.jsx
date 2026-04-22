import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';

function BodyLabel({ position, children, color = '#ffffff', size = 0.45 }) {
    return (
        <Text
            font="/Roboto-Regular.ttf"
            position={position}
            fontSize={size}
            color={color}
            anchorX="center"
            anchorY="middle"
            outlineColor="black"
            outlineWidth={0.025}
        >
            {children}
        </Text>
    );
}

function BodyFactor({ position, factorId, label, reverseLabel, color, reverseColor, shape = 'sphere', size = 1 }) {
    const { reversedFactors, setActiveFactor } = useStore();
    const ref = useRef();
    const isReversed = !!reversedFactors[factorId];
    const displayColor = isReversed ? reverseColor : color;

    useFrame((state, delta) => {
        if (!ref.current) return;
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 2.4 + position[0]) * 0.045;
        ref.current.scale.setScalar(pulse);
        ref.current.rotation.y += delta * 0.55;
        ref.current.rotation.x += delta * 0.25;
    });

    return (
        <group
            position={position}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh>
                <sphereGeometry args={[0.42 * size, 18, 18]} />
                <meshBasicMaterial color={displayColor} transparent opacity={0.045} />
            </mesh>
            <mesh ref={ref}>
                {shape === 'sphere' && <sphereGeometry args={[0.2 * size, 18, 18]} />}
                {shape === 'octahedron' && <octahedronGeometry args={[0.27 * size, 0]} />}
                {shape === 'torus' && <torusGeometry args={[0.24 * size, 0.045 * size, 10, 28]} />}
                {shape === 'icosahedron' && <icosahedronGeometry args={[0.27 * size, 1]} />}
                <meshBasicMaterial color={displayColor} wireframe={shape !== 'sphere'} transparent opacity={0.92} />
            </mesh>
            <BodyLabel position={[0, -0.52 * size, 0]} color={displayColor} size={0.2}>
                {isReversed ? reverseLabel : label}
            </BodyLabel>
        </group>
    );
}

function BloodCirculation({ reversed }) {
    const groupRef = useRef();
    const heartPulseRef = useRef();

    const arterialLoop = useMemo(() => {
        const pts = [];
        for (let i = 0; i <= 120; i++) {
            const t = (i / 120) * Math.PI * 2;
            pts.push(new THREE.Vector3(
                Math.sin(t) * (1.25 + Math.cos(t * 2) * 0.12),
                Math.cos(t) * 2.15 - 0.2,
                0.22 + Math.sin(t * 2) * 0.12,
            ));
        }
        return pts;
    }, []);

    const venousLoop = useMemo(() => {
        const pts = [];
        for (let i = 0; i <= 120; i++) {
            const t = (i / 120) * Math.PI * 2;
            pts.push(new THREE.Vector3(
                -Math.sin(t) * (1.0 + Math.cos(t * 2) * 0.1),
                Math.cos(t) * 1.95 - 0.25,
                -0.22 + Math.sin(t * 2) * 0.12,
            ));
        }
        return pts;
    }, []);

    useFrame((state) => {
        if (groupRef.current) {
            groupRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.7) * 0.025;
        }
        if (heartPulseRef.current) {
            const beat = reversed ? 0.8 + Math.sin(state.clock.elapsedTime * 1.2) * 0.03 : 1 + Math.sin(state.clock.elapsedTime * 6.5) * 0.12;
            heartPulseRef.current.scale.set(beat, beat, beat);
        }
    });

    return (
        <group ref={groupRef}>
            <Line points={arterialLoop} color={reversed ? '#773333' : '#ff243f'} lineWidth={2.5} transparent opacity={reversed ? 0.35 : 0.9} />
            <Line points={venousLoop} color={reversed ? '#223355' : '#3f7cff'} lineWidth={2.5} transparent opacity={reversed ? 0.35 : 0.82} />
            <mesh ref={heartPulseRef} position={[0, 0.95, 0.48]} rotation={[0.2, 0, -0.25]}>
                <sphereGeometry args={[0.34, 24, 24]} />
                <meshStandardMaterial color={reversed ? '#5a1e22' : '#ff334d'} emissive={reversed ? '#190407' : '#66111a'} emissiveIntensity={0.6} roughness={0.45} />
            </mesh>
            <mesh position={[-0.21, 1.05, 0.5]} rotation={[0.1, 0, -0.15]}>
                <sphereGeometry args={[0.22, 18, 18]} />
                <meshStandardMaterial color={reversed ? '#5a1e22' : '#ff6677'} emissive="#33050a" emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0.22, 1.02, 0.49]} rotation={[0.1, 0, 0.15]}>
                <sphereGeometry args={[0.2, 18, 18]} />
                <meshStandardMaterial color={reversed ? '#5a1e22' : '#ff6677'} emissive="#33050a" emissiveIntensity={0.35} />
            </mesh>
            <BodyLabel position={[0, 1.62, 0.6]} color={reversed ? '#996666' : '#ff9aa6'} size={0.28}>
                СЕРДЦЕ
            </BodyLabel>
        </group>
    );
}

function Lungs({ reversed }) {
    const ref = useRef();
    useFrame((state) => {
        if (!ref.current) return;
        const breath = reversed ? 0.86 + Math.sin(state.clock.elapsedTime * 1.1) * 0.02 : 1 + Math.sin(state.clock.elapsedTime * 1.8) * 0.08;
        ref.current.scale.set(1, breath, 1);
    });

    return (
        <group ref={ref}>
            <mesh position={[-0.55, 1.15, 0.24]} rotation={[0.15, 0.25, 0.1]}>
                <sphereGeometry args={[0.42, 24, 24]} />
                <meshStandardMaterial color={reversed ? '#51606a' : '#8fd7ff'} transparent opacity={0.5} roughness={0.8} />
            </mesh>
            <mesh position={[0.55, 1.15, 0.24]} rotation={[0.15, -0.25, -0.1]}>
                <sphereGeometry args={[0.42, 24, 24]} />
                <meshStandardMaterial color={reversed ? '#51606a' : '#8fd7ff'} transparent opacity={0.5} roughness={0.8} />
            </mesh>
            <mesh position={[0, 1.35, 0.25]}>
                <cylinderGeometry args={[0.055, 0.08, 0.75, 12]} />
                <meshStandardMaterial color="#d7f2ff" transparent opacity={0.65} />
            </mesh>
            <BodyLabel position={[0, 0.52, 0.6]} color={reversed ? '#8aa0aa' : '#bcecff'} size={0.28}>
                ЛЁГКИЕ
            </BodyLabel>
        </group>
    );
}

function BrainAndNerves({ reversed }) {
    const brainRef = useRef();
    const nervePoints = useMemo(() => [
        [new THREE.Vector3(0, 3.08, 0.1), new THREE.Vector3(0, 1.65, 0.08), new THREE.Vector3(0, -1.9, 0.05)],
        [new THREE.Vector3(0, 1.1, 0.08), new THREE.Vector3(-1.45, 0.1, 0.04), new THREE.Vector3(-2.2, -1.55, 0.02)],
        [new THREE.Vector3(0, 1.1, 0.08), new THREE.Vector3(1.45, 0.1, 0.04), new THREE.Vector3(2.2, -1.55, 0.02)],
    ], []);

    useFrame((state) => {
        if (!brainRef.current) return;
        const glow = reversed ? 0.18 + Math.sin(state.clock.elapsedTime * 3) * 0.04 : 0.52 + Math.sin(state.clock.elapsedTime * 6) * 0.15;
        brainRef.current.material.emissiveIntensity = glow;
    });

    return (
        <group>
            <mesh ref={brainRef} position={[0, 3.25, 0.1]} scale={[0.75, 0.45, 0.48]}>
                <sphereGeometry args={[0.62, 32, 20]} />
                <meshStandardMaterial color={reversed ? '#8a6680' : '#ff93d6'} emissive={reversed ? '#201020' : '#7a1457'} emissiveIntensity={0.5} roughness={0.65} />
            </mesh>
            {nervePoints.map((pts, index) => (
                <Line key={index} points={pts} color={reversed ? '#665577' : '#dd99ff'} lineWidth={1.4} transparent opacity={reversed ? 0.35 : 0.75} />
            ))}
            <BodyLabel position={[0, 3.88, 0.25]} color={reversed ? '#bd9abc' : '#ffb7ec'} size={0.3}>
                МОЗГ
            </BodyLabel>
        </group>
    );
}

function DigestiveSystem({ reversed }) {
    const gutRef = useRef();
    useFrame((state) => {
        if (!gutRef.current) return;
        gutRef.current.rotation.z = Math.sin(state.clock.elapsedTime * (reversed ? 0.6 : 1.3)) * 0.08;
    });

    return (
        <group ref={gutRef}>
            <mesh position={[0, -0.72, 0.35]} scale={[0.9, 0.55, 0.18]}>
                <torusGeometry args={[0.5, 0.12, 12, 48]} />
                <meshStandardMaterial color={reversed ? '#5b4a2a' : '#d89a42'} emissive={reversed ? '#191000' : '#3d2104'} emissiveIntensity={0.25} roughness={0.75} />
            </mesh>
            <mesh position={[0.38, -0.22, 0.36]} rotation={[0, 0, -0.4]}>
                <sphereGeometry args={[0.28, 18, 14]} />
                <meshStandardMaterial color={reversed ? '#525531' : '#c5a23f'} roughness={0.6} />
            </mesh>
            <BodyLabel position={[0, -1.45, 0.55]} color={reversed ? '#928460' : '#f2ca65'} size={0.28}>
                ПИЩЕВАРЕНИЕ
            </BodyLabel>
        </group>
    );
}

function EmotionalField({ reversed }) {
    const ringRef = useRef();
    const nodes = [
        { position: [4.45, 2.95, -0.18], label: 'РАДОСТЬ', color: '#ffdc62' },
        { position: [-4.45, 2.95, -0.18], label: 'СТРАХ', color: '#8fd2ff' },
        { position: [-4.45, -2.85, -0.18], label: 'ГНЕВ', color: '#ff5a48' },
        { position: [4.45, -2.85, -0.18], label: 'ПЕЧАЛЬ', color: '#8a8dff' },
    ];

    useFrame((state) => {
        if (!ringRef.current) return;
        ringRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.35) * 0.015;
        ringRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.2) * (reversed ? 0.005 : 0.018));
        ringRef.current.children.forEach((child, index) => {
            child.position.z = -0.18 + Math.sin(state.clock.elapsedTime * 1.8 + index) * 0.035;
        });
    });

    return (
        <group ref={ringRef}>
            <mesh position={[0, 0.05, -0.22]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[5.15, 0.012, 8, 128]} />
                <meshBasicMaterial color={reversed ? '#555566' : '#ffffff'} transparent opacity={reversed ? 0.12 : 0.26} />
            </mesh>
            {nodes.map(({ position, label, color }) => (
                <group key={label} position={position}>
                    <mesh>
                        <sphereGeometry args={[0.18, 12, 12]} />
                        <meshBasicMaterial color={reversed ? '#777777' : color} />
                    </mesh>
                    <BodyLabel position={[0, 0.42, 0]} color={reversed ? '#999999' : color} size={0.22}>
                        {label}
                    </BodyLabel>
                </group>
            ))}
        </group>
    );
}

function HumanBackdrop({ mode }) {
    const ref = useRef();

    useFrame((state) => {
        if (!ref.current) return;
        const pulse = 1 + Math.sin(state.clock.elapsedTime * 0.7) * 0.025;
        ref.current.scale.set(pulse, pulse, 1);
    });

    return (
        <group ref={ref} position={[0, 0.25, -0.72]}>
            <mesh>
                <circleGeometry args={[4.75, 96]} />
                <meshBasicMaterial color={mode === 'emotions' ? '#fff2fb' : '#eef8ff'} transparent opacity={0.68} depthWrite={false} />
            </mesh>
            <mesh>
                <ringGeometry args={[4.75, 5.05, 96]} />
                <meshBasicMaterial color={mode === 'emotions' ? '#ff8fd2' : '#75cfff'} transparent opacity={0.22} depthWrite={false} />
            </mesh>
        </group>
    );
}

function HumanSilhouette({ reversedFactors, mode }) {
    const stressReversed = !!reversedFactors['stress'];
    const modelGroupRef = useRef();
    const { scene } = useGLTF('/model.gltf');

    const modelScene = useMemo(() => {
        const cloned = scene.clone(true);
        const prepareMaterial = (material) => {
            const nextMaterial = material.clone();
            nextMaterial.color = new THREE.Color(mode === 'emotions' ? '#df6fab' : (stressReversed ? '#c2744c' : '#b87948'));
            nextMaterial.transparent = true;
            nextMaterial.opacity = mode === 'emotions' ? 0.74 : 0.78;
            nextMaterial.depthWrite = false;
            if ('emissive' in nextMaterial) {
                nextMaterial.emissive = new THREE.Color(mode === 'emotions' ? '#ffe2f4' : '#ffe0c4');
                nextMaterial.emissiveIntensity = mode === 'emotions' ? 0.14 : 0.1;
            }
            if ('roughness' in nextMaterial) nextMaterial.roughness = 0.82;
            return nextMaterial;
        };

        cloned.traverse((object) => {
            if (!object.isMesh) return;
            object.castShadow = false;
            object.receiveShadow = false;
            if (object.material) {
                object.material = Array.isArray(object.material)
                    ? object.material.map(prepareMaterial)
                    : prepareMaterial(object.material);
            }
        });
        return cloned;
    }, [scene, stressReversed, mode]);

    useLayoutEffect(() => {
        if (!modelGroupRef.current) return;
        modelGroupRef.current.position.set(0, 0, 0);
        modelGroupRef.current.scale.set(1, 1, 1);

        const box = new THREE.Box3().setFromObject(modelGroupRef.current);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);

        const maxDim = Math.max(size.x, size.y, size.z);
        if (!Number.isFinite(maxDim) || maxDim === 0) return;

        modelGroupRef.current.position.sub(center);
        modelGroupRef.current.scale.setScalar(5.65 / maxDim);
    }, [modelScene]);

    return (
        <group position={[0, 0.28, -0.22]}>
            <HumanBackdrop mode={mode} />
            <group ref={modelGroupRef}>
                <primitive object={modelScene} />
            </group>
        </group>
    );
}

function OrganLayer({ reversedFactors }) {
    const circulationReversed = !!reversedFactors['circulation'];
    const breathingReversed = !!reversedFactors['breathing'];
    const digestionReversed = !!reversedFactors['digestion'];
    const cognitionReversed = !!reversedFactors['memory'];

    return (
        <group>
            <BloodCirculation reversed={circulationReversed} />
            <Lungs reversed={breathingReversed} />
            <BrainAndNerves reversed={cognitionReversed} />
            <DigestiveSystem reversed={digestionReversed} />

            <BodyFactor
                position={[1.75, 1.12, 0.95]}
                factorId="circulation"
                label="КРОВЬ"
                reverseLabel="ИШЕМИЯ"
                color="#ff344d"
                reverseColor="#7f3444"
                shape="torus"
                size={0.9}
            />
            <BodyFactor
                position={[-1.75, 1.12, 0.95]}
                factorId="breathing"
                label="ДЫХАНИЕ"
                reverseLabel="ГИПОКСИЯ"
                color="#8fe6ff"
                reverseColor="#66808d"
                shape="sphere"
                size={0.9}
            />
            <BodyFactor
                position={[0, 3.95, 0.95]}
                factorId="memory"
                label="МОЗГ"
                reverseLabel="АМНЕЗИЯ"
                color="#ff9ee8"
                reverseColor="#8b6f95"
                shape="icosahedron"
                size={0.9}
            />
            <BodyFactor
                position={[1.75, -1.35, 0.88]}
                factorId="immunity"
                label="ИММУНИТЕТ"
                reverseLabel="АУТОИММУННОСТЬ"
                color="#b8ff66"
                reverseColor="#ff77aa"
                shape="icosahedron"
                size={0.9}
            />
            <BodyFactor
                position={[-1.75, -1.35, 0.88]}
                factorId="digestion"
                label="ОБМЕН"
                reverseLabel="ТОКСИЧНОСТЬ"
                color="#f2c86d"
                reverseColor="#8b6e3d"
                shape="torus"
                size={0.9}
            />
            <BodyFactor
                position={[-0.85, -3.55, 0.75]}
                factorId="movement"
                label="ДВИЖЕНИЕ"
                reverseLabel="ПАРАЛИЧ"
                color="#ffffff"
                reverseColor="#777777"
                shape="sphere"
                size={0.9}
            />
            <BodyFactor
                position={[0.85, -3.55, 0.75]}
                factorId="thermoregulation"
                label="ТЕПЛО"
                reverseLabel="СБОЙ ТЕМП."
                color="#ffb866"
                reverseColor="#73c8ff"
                shape="sphere"
                size={0.9}
            />
            <BodyLabel position={[0, -4.55, 0.25]} color="#dff7ff" size={0.42}>
                ЧЕЛОВЕК: ОРГАНЫ И ФИЗИОЛОГИЯ
            </BodyLabel>
        </group>
    );
}

function EmotionLayer({ reversedFactors }) {
    const emotionsReversed = !!reversedFactors['emotion'];

    return (
        <group>
            <EmotionalField reversed={emotionsReversed} />
            <BodyFactor
                position={[4.1, 1.9, 0.95]}
                factorId="emotion"
                label="ЭМОЦИЯ"
                reverseLabel="ОНЕМЕНИЕ"
                color="#ffcc55"
                reverseColor="#8a8a8a"
                shape="octahedron"
                size={0.95}
            />
            <BodyFactor
                position={[-4.1, 1.9, 0.95]}
                factorId="stress"
                label="СТРЕСС"
                reverseLabel="ВОССТАНОВЛЕНИЕ"
                color="#ff5544"
                reverseColor="#66ffbb"
                shape="octahedron"
                size={0.95}
            />
            <BodyFactor
                position={[4.15, 0.3, 0.95]}
                factorId="empathy"
                label="ЭМПАТИЯ"
                reverseLabel="ОТЧУЖДЕНИЕ"
                color="#ff8fd2"
                reverseColor="#6680aa"
                shape="icosahedron"
                size={0.95}
            />
            <BodyFactor
                position={[-4.15, 0.3, 0.95]}
                factorId="pain"
                label="БОЛЬ"
                reverseLabel="АНЕСТЕЗИЯ"
                color="#ff6b35"
                reverseColor="#7890aa"
                shape="octahedron"
                size={0.95}
            />
            <BodyFactor
                position={[4.1, -1.35, 0.95]}
                factorId="hormones"
                label="ГОРМОНЫ"
                reverseLabel="СБОЙ"
                color="#d6ff66"
                reverseColor="#aa7766"
                shape="sphere"
                size={0.95}
            />
            <BodyFactor
                position={[-4.1, -1.35, 0.95]}
                factorId="sleep"
                label="СОН"
                reverseLabel="БЕССОННИЦА"
                color="#8aa8ff"
                reverseColor="#ffad66"
                shape="torus"
                size={0.95}
            />
            <BodyFactor
                position={[0, 4.6, 0.95]}
                factorId="identity"
                label="Я"
                reverseLabel="РАЗРЫВ Я"
                color="#ffffff"
                reverseColor="#a8a8c8"
                shape="icosahedron"
                size={0.98}
            />
            <BodyLabel position={[0, -4.55, 0.25]} color="#ffd8f4" size={0.42}>
                ЧЕЛОВЕК: ЭМОЦИИ, ЧУВСТВА, ЛИЧНОСТЬ
            </BodyLabel>
        </group>
    );
}

export default function HumanBody({ mode = 'organs' }) {
    const { reversedFactors } = useStore();
    const groupRef = useRef();

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        groupRef.current.rotation.y += delta * 0.04;
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.05;
    });

    return (
        <group ref={groupRef} position={[0, -0.35, 0]}>
            <ambientLight intensity={1.1} />
            <hemisphereLight skyColor={mode === 'emotions' ? '#ffd7f4' : '#dff7ff'} groundColor="#1a1028" intensity={1.8} />
            <pointLight position={[0, 5, 6]} intensity={3.4} color="#ffe2cc" />
            <pointLight position={[-4, 1, -3]} intensity={2.4} color={mode === 'emotions' ? '#ff80d8' : '#7fcfff'} />
            <pointLight position={[4, -2, 4]} intensity={1.8} color="#ffffff" />

            <HumanSilhouette reversedFactors={reversedFactors} mode={mode} />
            {mode === 'organs' ? <OrganLayer reversedFactors={reversedFactors} /> : <EmotionLayer reversedFactors={reversedFactors} />}
        </group>
    );
}

useGLTF.preload('/model.gltf');
