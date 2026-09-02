import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { tissueFragment, tissueVertex } from '../lib/shaders/life';

const _dummy = new THREE.Object3D();

function Label({ position, children, color = '#ffffff', size = 0.22 }) {
    return (
        <Billboard position={position}>
            <Text
                font="/Roboto-Regular.ttf"
                fontSize={size}
                color={color}
                anchorX="center"
                anchorY="middle"
                outlineColor="#1a1020"
                outlineWidth={0.03}
            >
                {children}
            </Text>
        </Billboard>
    );
}

function FactorOrb({ position, factorId, label, reverseLabel, color, reverseColor, size = 0.9 }) {
    const reversed = useStore((s) => !!s.reversedFactors[factorId]);
    const setActiveFactor = useStore((s) => s.setActiveFactor);
    const ref = useRef();
    const tone = reversed ? reverseColor : color;

    useFrame((state, delta) => {
        if (!ref.current) return;
        ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 2.4 + position[0]) * 0.05);
        ref.current.rotation.y += delta * 0.5;
    });

    return (
        <group
            position={position}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh>
                <sphereGeometry args={[0.38 * size, 14, 12]} />
                <meshBasicMaterial color={tone} transparent opacity={0.07} depthWrite={false} />
            </mesh>
            <mesh ref={ref}>
                <icosahedronGeometry args={[0.16 * size, 0]} />
                <meshStandardMaterial color={tone} emissive={tone} emissiveIntensity={0.7} roughness={0.4} />
            </mesh>
            <Label position={[0, -0.42 * size, 0]} color={tone} size={0.16}>
                {reversed ? reverseLabel : label}
            </Label>
        </group>
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
            <Label position={[0.15, 1.55, 0.7]} color={reversed ? '#996666' : '#ff9aa6'} size={0.2}>
                СЕРДЦЕ
            </Label>
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
            <Label position={[0, 0.42, 0.7]} color={reversed ? '#8aa0aa' : '#bcecff'} size={0.2}>
                ЛЁГКИЕ
            </Label>
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
            <Label position={[0, 0.62, 0.35]} color={reversed ? '#bd9abc' : '#ffb7ec'} size={0.2}>
                МОЗГ
            </Label>
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
            <Label position={[0, -1.55, 0.55]} color={reversed ? '#928460' : '#f2ca65'} size={0.2}>
                ПИЩЕВАРЕНИЕ
            </Label>
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
        <group position={[0, 0.2, -1.35]}>
            <mesh>
                <ringGeometry args={[3.55, 4.35, 72]} />
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

function HumanSilhouette({ reversedFactors, mode }) {
    const stressReversed = !!reversedFactors.stress;
    const modelGroupRef = useRef();
    const { scene } = useGLTF('/model.gltf');

    const modelScene = useMemo(() => {
        const cloned = scene.clone(true);
        const prepareMaterial = (material) => {
            const nextMaterial = material.clone();
            const skin = mode === 'emotions'
                ? (stressReversed ? '#c45a78' : '#e08ab0')
                : (stressReversed ? '#c2744c' : '#c99578');
            nextMaterial.color = new THREE.Color(skin);
            nextMaterial.transparent = true;
            nextMaterial.opacity = mode === 'emotions' ? 0.58 : 0.5;
            nextMaterial.depthWrite = false;
            nextMaterial.side = THREE.FrontSide;
            if ('emissive' in nextMaterial) {
                nextMaterial.emissive = new THREE.Color(mode === 'emotions' ? '#3a1028' : '#3a2010');
                nextMaterial.emissiveIntensity = 0.18;
            }
            if ('roughness' in nextMaterial) nextMaterial.roughness = 0.62;
            if ('metalness' in nextMaterial) nextMaterial.metalness = 0.04;
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

    const breathRef = useRef();
    useFrame((state) => {
        if (!breathRef.current) return;
        const b = 1 + Math.sin(state.clock.elapsedTime * 1.35) * 0.012;
        breathRef.current.scale.set(1, b, 1);
    });

    return (
        <group position={[0, 0.15, -0.18]} ref={breathRef}>
            <HumanBackdrop mode={mode} />
            <group ref={modelGroupRef}>
                <primitive object={modelScene} />
            </group>
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
            <Circulation reversed={circulationReversed} />
            <Heart reversed={circulationReversed} />
            <Lungs reversed={breathingReversed} />
            <Brain reversed={cognitionReversed} />
            <DigestiveSystem reversed={digestionReversed} />

            <FactorOrb position={[1.55, 1.05, 1.05]} factorId="circulation" label="КРОВЬ" reverseLabel="ИШЕМИЯ" color="#ff344d" reverseColor="#7f3444" />
            <FactorOrb position={[-1.55, 1.05, 1.05]} factorId="breathing" label="ДЫХАНИЕ" reverseLabel="ГИПОКСИЯ" color="#8fe6ff" reverseColor="#66808d" />
            <FactorOrb position={[0, 2.95, 1.05]} factorId="memory" label="МОЗГ" reverseLabel="АМНЕЗИЯ" color="#ff9ee8" reverseColor="#8b6f95" />
            <FactorOrb position={[1.55, -1.15, 0.95]} factorId="immunity" label="ИММУНИТЕТ" reverseLabel="АУТОИММУННОСТЬ" color="#b8ff66" reverseColor="#ff77aa" />
            <FactorOrb position={[-1.55, -1.15, 0.95]} factorId="digestion" label="ОБМЕН" reverseLabel="ТОКСИЧНОСТЬ" color="#f2c86d" reverseColor="#8b6e3d" />
            <FactorOrb position={[-0.75, -2.75, 0.9]} factorId="movement" label="ДВИЖЕНИЕ" reverseLabel="ПАРАЛИЧ" color="#334155" reverseColor="#777777" />
            <FactorOrb position={[0.75, -2.75, 0.9]} factorId="thermoregulation" label="ТЕПЛО" reverseLabel="СБОЙ ТЕМП." color="#ffb866" reverseColor="#73c8ff" />
        </group>
    );
}

function EmotionLayer({ reversedFactors }) {
    const emotionsReversed = !!reversedFactors.emotion;

    return (
        <group>
            <EmotionalAura reversed={emotionsReversed} />
            <FactorOrb position={[1.85, 1.85, 1.05]} factorId="emotion" label="ЭМОЦИЯ" reverseLabel="ОНЕМЕНИЕ" color="#ffcc55" reverseColor="#8a8a8a" />
            <FactorOrb position={[-1.85, 1.85, 1.05]} factorId="stress" label="СТРЕСС" reverseLabel="ВОССТАНОВЛЕНИЕ" color="#ff5544" reverseColor="#66ffbb" />
            <FactorOrb position={[1.9, 0.25, 1.05]} factorId="empathy" label="ЭМПАТИЯ" reverseLabel="ОТЧУЖДЕНИЕ" color="#ff8fd2" reverseColor="#6680aa" />
            <FactorOrb position={[-1.9, 0.25, 1.05]} factorId="pain" label="БОЛЬ" reverseLabel="АНЕСТЕЗИЯ" color="#ff6b35" reverseColor="#7890aa" />
            <FactorOrb position={[1.85, -1.2, 1.05]} factorId="hormones" label="ГОРМОНЫ" reverseLabel="СБОЙ" color="#d6ff66" reverseColor="#aa7766" />
            <FactorOrb position={[-1.85, -1.2, 1.05]} factorId="sleep" label="СОН" reverseLabel="БЕССОННИЦА" color="#8aa8ff" reverseColor="#ffad66" />
            <FactorOrb position={[0, 3.15, 1.1]} factorId="identity" label="Я" reverseLabel="РАЗРЫВ Я" color="#ffffff" reverseColor="#a8a8c8" size={1} />
        </group>
    );
}

export default function HumanBody({ mode = 'organs' }) {
    const reversedFactors = useStore((s) => s.reversedFactors);
    const groupRef = useRef();

    useFrame((state, delta) => {
        if (!groupRef.current) return;
        groupRef.current.rotation.y += delta * 0.028;
        groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.55) * 0.04;
    });

    return (
        <group ref={groupRef} position={[0, -0.2, 0]}>
            <ambientLight intensity={0.55} />
            <hemisphereLight
                args={[mode === 'emotions' ? '#ffd7f4' : '#dff7ff', '#120818', 0.7]}
            />
            <spotLight position={[2.5, 6, 5]} angle={0.55} penumbra={0.6} intensity={2.2} color="#ffe8d4" />
            <pointLight position={[-3.5, 1.5, 3]} intensity={1.4} color={mode === 'emotions' ? '#ff80d8' : '#7fcfff'} />
            <pointLight position={[0.15, 0.95, 1.2]} intensity={mode === 'organs' ? 1.1 : 0.4} color="#ff6a7a" distance={4} />
            <pointLight position={[0, 2.2, 1]} intensity={0.7} color="#ffb7ec" distance={3.5} />

            <HumanSilhouette reversedFactors={reversedFactors} mode={mode} />
            {mode === 'organs' ? <OrganLayer reversedFactors={reversedFactors} /> : <EmotionLayer reversedFactors={reversedFactors} />}
        </group>
    );
}

useGLTF.preload('/model.gltf');
