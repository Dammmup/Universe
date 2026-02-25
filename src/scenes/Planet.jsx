import React, { useRef, useMemo, useEffect, useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Torus } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import gsap from 'gsap';

// ─── Утилиты ────────────────────────────────────────────────────────────────

/** Преобразует сферические координаты (радиус, phi, theta) в XYZ */
function sph(r, phi, theta) {
    return [
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
    ];
}

/** Кватернион «смотреть от центра сферы» по нормали в точке XYZ */
function surfaceQuaternion(pos) {
    const up = new THREE.Vector3(0, 1, 0);
    const norm = new THREE.Vector3(...pos).normalize();
    return new THREE.Quaternion().setFromUnitVectors(up, norm);
}

/** Случайное число в диапазоне [a, b) */
function rnd(a, b) { return a + Math.random() * (b - a); }

// ─── Константы ───────────────────────────────────────────────────────────────

const R = 10;            // радиус планеты
const HALF = Math.PI / 2; // 90°

// ─── Генерация статичных данных (useMemo-safe) ────────────────────────────────

function usePlanetData() {
    return useMemo(() => {
        // Горы — передняя полусфера (theta ≈ 0±60°, phil ≈ 30-120°)
        const mountains = Array.from({ length: 18 }, (_, i) => {
            const phi = rnd(0.5, 2.2);
            const theta = rnd(-1.0, 1.0);
            return {
                pos: sph(R + 0.05, phi, theta),
                height: rnd(0.8, 2.8),
                radius: rnd(0.4, 1.0),
                color: i % 3 === 0 ? '#7a6a5a' : i % 3 === 1 ? '#8a8a9a' : '#5a7060',
            };
        });

        // Деревья
        const trees = Array.from({ length: 30 }, () => {
            const phi = rnd(0.6, 2.0);
            const theta = rnd(-0.9, 0.9);
            return { pos: sph(R + 0.1, phi, theta), scale: rnd(0.3, 0.8) };
        });

        // Животные (простые точки-метки)
        const animals = Array.from({ length: 12 }, () => {
            const phi = rnd(0.8, 1.8);
            const theta = rnd(-0.8, 0.8);
            return { pos: sph(R + 0.25, phi, theta), type: Math.floor(rnd(0, 3)) };
        });

        // Стая птиц — относительные офсеты от центра стаи
        const birdOffsets = Array.from({ length: 12 }, (_, i) => ({
            dx: rnd(-3, 3),
            dy: rnd(-1, 1),
            dz: rnd(-1.5, 1.5),
            phase: i * 0.5,
        }));

        // Звёзды
        const stars = Array.from({ length: 300 }, () => {
            const phi = Math.acos(rnd(-1, 1));
            const theta = rnd(0, Math.PI * 2);
            const r = rnd(30, 60);
            return sph(r, phi, theta);
        });

        // Здания цивилизации — задняя полусфера (theta ≈ PI±70°)
        const buildings = Array.from({ length: 50 }, () => {
            const phi = rnd(0.4, 2.4);
            const theta = Math.PI + rnd(-1.1, 1.1);
            const era = Math.floor(rnd(0, 4)); // 0=камень 1=средневековье 2=индустрия 3=футуризм
            const h = era === 0 ? rnd(0.3, 0.7) :
                era === 1 ? rnd(0.6, 1.5) :
                    era === 2 ? rnd(1.2, 3.5) : rnd(3.0, 6.0);
            const w = era === 3 ? rnd(0.15, 0.35) : rnd(0.2, 0.6);
            const color = era === 0 ? '#6b5a3a' :
                era === 1 ? '#7a6a5a' :
                    era === 2 ? '#444455' : '#88aacc';
            return { pos: sph(R + 0.05, phi, theta), height: h, width: w, color, era };
        });

        return { mountains, trees, animals, birdOffsets, stars, buildings };
    }, []);
}

// ─── Процедурная текстура Земли ──────────────────────────────────────────────
function useEarthTexture() {
    const [tex, setTex] = React.useState(null);

    React.useEffect(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 1024;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        // Градиент океана (глубокий синий)
        const grd = ctx.createLinearGradient(0, 0, 0, 512);
        grd.addColorStop(0, "#001133");
        grd.addColorStop(0.5, "#004488");
        grd.addColorStop(1, "#001133");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 1024, 512);

        let seed = 12345;
        const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

        // Генерация континентов (пятна зелени и пустынь)
        for (let i = 0; i < 400; i++) {
            const x = random() * 1024;
            const y = random() * 512;
            const r = random() * 60 + 20;

            const isDesert = (y > 100 && y < 220) || (y > 290 && y < 410) ? random() > 0.3 : false;
            const centerCol = isDesert ? '#d4b872' : '#2d6a2d';
            // Используем непрозрачный или полупрозрачный rgba вместо 8-значного hex для совместимости
            const edgeCol = isDesert ? 'rgba(212, 184, 114, 0)' : 'rgba(45, 106, 45, 0)';

            const drawCircle = (cx, cy) => {
                const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                bg.addColorStop(0, centerCol);
                bg.addColorStop(1, edgeCol);
                ctx.fillStyle = bg;
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fill();
            };

            drawCircle(x, y);
            if (x - r < 0) drawCircle(x + 1024, y);
            if (x + r > 1024) drawCircle(x - 1024, y);
        }

        // Полярные льды
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 1024, 40);
        ctx.fillRect(0, 512 - 40, 1024, 40);
        for (let i = 0; i < 200; i++) {
            ctx.beginPath(); ctx.arc(random() * 1024, 40, random() * 30, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(random() * 1024, 512 - 40, random() * 30, 0, Math.PI * 2); ctx.fill();
        }

        const newTex = new THREE.CanvasTexture(canvas);
        newTex.colorSpace = THREE.SRGBColorSpace;
        setTex(newTex);

        return () => newTex.dispose();
    }, []);

    return tex;
}

// ─── Восстановленные Компоненты Окружения ────────────────────────────────────
function SkySystem({ stars, reversedFactors }) {
    const starsRef = useRef();
    const sunRef = useRef();
    const moonRef = useRef();
    const starPositions = useMemo(() => {
        const arr = new Float32Array(stars.length * 3);
        stars.forEach((s, i) => {
            arr[i * 3] = s[0]; arr[i * 3 + 1] = s[1]; arr[i * 3 + 2] = s[2];
        });
        return arr;
    }, [stars]);

    useFrame((state) => {
        const t = state.clock.elapsedTime * 0.15;
        if (sunRef.current) sunRef.current.position.set(Math.cos(t) * 25, 5, Math.sin(t) * 25);
        if (moonRef.current) moonRef.current.position.set(Math.cos(t + Math.PI) * 20, -5, Math.sin(t + Math.PI) * 20);
        if (starsRef.current && reversedFactors['starField']) starsRef.current.rotation.y = t * 0.2;
    });

    return (
        <group>
            <points ref={starsRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[starPositions, 3]} count={stars.length} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial color="#ffffff" size={0.15} sizeAttenuation transparent opacity={0.6} />
            </points>
            <mesh ref={sunRef}>
                <sphereGeometry args={[2, 16, 16]} />
                <meshBasicMaterial color="#ffccaa" />
                <pointLight intensity={reversedFactors['sunEnergy'] ? 0.2 : 1.5} distance={100} decay={2} />
            </mesh>
            <mesh ref={moonRef}>
                <sphereGeometry args={[1.2, 16, 16]} />
                <meshStandardMaterial color="#888899" roughness={1} metalness={0} />
                <pointLight intensity={reversedFactors['moonPhase'] ? 0 : 0.2} distance={50} color="#aaddff" />
            </mesh>
        </group>
    );
}

function Ocean({ reversed }) {
    const ref = useRef();
    useFrame((state) => {
        if (!ref.current) return;
        const scale = 1.0 + Math.sin(state.clock.elapsedTime * 2) * 0.005;
        ref.current.scale.setScalar(scale);
    });
    return (
        <mesh ref={ref}>
            <sphereGeometry args={[10.02, 64, 64]} />
            <meshPhysicalMaterial color="#002244" transparent opacity={0.6} roughness={0.1} metalness={0.1} transmission={0.9} ior={1.33} />
        </mesh>
    );
}

function Atmosphere({ reversed }) {
    return (
        <mesh>
            <sphereGeometry args={[10.4, 64, 64]} />
            <meshPhysicalMaterial color={reversed ? "#ffaa88" : "#4488ff"} transparent opacity={reversed ? 0.15 : 0.35} roughness={1} depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} />
        </mesh>
    );
}

function Aurora({ reversed }) {
    const ref1 = useRef(), ref2 = useRef();
    useFrame((state) => {
        const t = state.clock.elapsedTime;
        if (ref1.current) { ref1.current.rotation.z = t * 0.5; ref1.current.scale.setScalar(1 + Math.sin(t) * 0.05); }
        if (ref2.current) { ref2.current.rotation.z = -t * 0.4; ref2.current.scale.setScalar(1 + Math.cos(t) * 0.05); }
    });
    if (reversed) return null;
    return (
        <group>
            <mesh ref={ref1} position={[0, 9.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[3, 0.5, 16, 64]} />
                <meshBasicMaterial color="#00ffcc" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
            <mesh ref={ref2} position={[0, -9.8, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[3, 0.5, 16, 64]} />
                <meshBasicMaterial color="#00ffcc" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
            </mesh>
        </group>
    );
}

// ─── Instanced Компоненты для оптимизации ────────────────────────────────────

function MountainsInstanced({ mountains, reversed }) {
    const mainRef = useRef();
    const snowRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colors = useMemo(() => mountains.map(m => new THREE.Color(m.color)), [mountains]);

    useEffect(() => {
        if (!mainRef.current) return;
        mountains.forEach((m, i) => {
            mainRef.current.setColorAt(i, colors[i]);
        });
        mainRef.current.instanceColor.needsUpdate = true;
    }, [mountains, colors]);

    useFrame(() => {
        if (!mainRef.current || !snowRef.current) return;

        mountains.forEach((m, i) => {
            let px = m.pos[0], py = m.pos[1], pz = m.pos[2];
            if (reversed) {
                px += (Math.random() - 0.5) * 0.08;
                py += (Math.random() - 0.5) * 0.08;
                pz += (Math.random() - 0.5) * 0.08;
            }
            dummy.position.set(px, py, pz);
            dummy.quaternion.copy(surfaceQuaternion([px, py, pz]));

            // Основа
            dummy.scale.set(1, 1, 1);
            dummy.translateY(m.height / 2);
            dummy.scale.set(m.radius, m.height, m.radius);
            dummy.updateMatrix();
            mainRef.current.setMatrixAt(i, dummy.matrix);

            // Снег
            dummy.position.set(px, py, pz);
            dummy.scale.set(1, 1, 1);
            dummy.translateY(m.height * 0.85);
            dummy.scale.set(m.radius * 0.35, m.height * 0.22, m.radius * 0.35);
            dummy.updateMatrix();
            snowRef.current.setMatrixAt(i, dummy.matrix);
        });

        mainRef.current.instanceMatrix.needsUpdate = true;
        snowRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            <instancedMesh ref={mainRef} args={[null, null, mountains.length]}>
                <coneGeometry args={[1, 1, 7]} />
                <meshStandardMaterial roughness={0.9} />
            </instancedMesh>
            <instancedMesh ref={snowRef} args={[null, null, mountains.length]}>
                <coneGeometry args={[1, 1, 6]} />
                <meshStandardMaterial color="#ddeeff" roughness={0.5} />
            </instancedMesh>
        </group>
    );
}

function TreesInstanced({ trees, reversed }) {
    const crownRef = useRef();
    const trunkRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const cCrown = useMemo(() => new THREE.Color(), []);
    const cTrunk = useMemo(() => new THREE.Color(), []);

    useFrame((state) => {
        if (!crownRef.current || !trunkRef.current) return;
        const t = state.clock.elapsedTime;

        cCrown.setHex(reversed ? 0x7a5a20 : 0x4a7a2a);
        cTrunk.setHex(reversed ? 0x885522 : 0x336622);

        trees.forEach((tree, i) => {
            const { pos, scale } = tree;
            let s = scale * (reversed ? (0.6 + Math.sin(t * 3) * 0.05) : (1.0 + Math.sin(t * 1.5 + pos[0]) * 0.04));

            // Ствол
            dummy.position.set(...pos);
            dummy.quaternion.copy(surfaceQuaternion(pos));
            dummy.scale.setScalar(s);
            dummy.translateY(0.2);
            dummy.updateMatrix();
            trunkRef.current.setMatrixAt(i, dummy.matrix);
            trunkRef.current.setColorAt(i, cTrunk);

            // Крона
            dummy.position.set(...pos);
            dummy.translateY(0.9);
            dummy.updateMatrix();
            crownRef.current.setMatrixAt(i, dummy.matrix);
            crownRef.current.setColorAt(i, cCrown);
        });

        trunkRef.current.instanceMatrix.needsUpdate = true;
        crownRef.current.instanceMatrix.needsUpdate = true;
        // Мы обновляем цвета в useLayoutEffect 1 раз, и затем каждый кадр. Это безопасно, так как буфер уже существует.
        trunkRef.current.instanceColor.needsUpdate = true;
        crownRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <group>
            <instancedMesh ref={crownRef} args={[null, null, trees.length]}>
                <coneGeometry args={[0.45, 1.1, 6]} />
                <meshStandardMaterial />
            </instancedMesh>
            <instancedMesh ref={trunkRef} args={[null, null, trees.length]}>
                <cylinderGeometry args={[0.1, 0.15, 0.5, 5]} />
                <meshStandardMaterial roughness={0.9} />
            </instancedMesh>
        </group>
    );
}

function AnimalsInstanced({ animals, reversed }) {
    const bodyRef = useRef();
    const headRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colors = useMemo(() => ['#cc8844', '#886644', '#aa9966'].map(c => new THREE.Color(c)), []);

    useLayoutEffect(() => {
        if (!bodyRef.current || !headRef.current) return;
        animals.forEach((a, i) => {
            bodyRef.current.setColorAt(i, colors[a.type]);
            headRef.current.setColorAt(i, colors[a.type]);
        });
        bodyRef.current.instanceColor.needsUpdate = true;
        headRef.current.instanceColor.needsUpdate = true;
    }, [animals, colors]);

    useFrame((state) => {
        if (!bodyRef.current || !headRef.current) return;
        const t = state.clock.elapsedTime;

        animals.forEach((a, i) => {
            let px = a.pos[0], py = a.pos[1], pz = a.pos[2];
            let s = 1.0;
            let visible = true;

            if (reversed) {
                visible = Math.sin(t * 4 + px * 10) > -0.3;
                s = 0.5 + Math.sin(t * 2) * 0.1;
            } else {
                px += Math.sin(t * 0.8 + a.type) * 0.15;
                py += Math.cos(t * 1.1 + a.type) * 0.05;
                pz += Math.cos(t * 0.9 + a.type) * 0.15;
            }

            if (!visible) s = 0; // Скрыть через масштаб (т.к. visible не работает для инстансов)

            dummy.position.set(px, py, pz);
            dummy.quaternion.copy(surfaceQuaternion([px, py, pz]));
            dummy.scale.setScalar(s);
            dummy.updateMatrix();
            bodyRef.current.setMatrixAt(i, dummy.matrix);

            dummy.position.set(px, py, pz);
            dummy.translateY(0.28);
            dummy.translateZ(0.12);
            dummy.updateMatrix();
            headRef.current.setMatrixAt(i, dummy.matrix);
        });

        bodyRef.current.instanceMatrix.needsUpdate = true;
        headRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <group>
            <instancedMesh ref={bodyRef} args={[null, null, animals.length]}>
                <sphereGeometry args={[0.22, 6, 5]} />
                <meshStandardMaterial roughness={0.8} />
            </instancedMesh>
            <instancedMesh ref={headRef} args={[null, null, animals.length]}>
                <sphereGeometry args={[0.13, 5, 4]} />
                <meshStandardMaterial roughness={0.8} />
            </instancedMesh>
        </group>
    );
}

function BirdFlockInstanced({ birdOffsets, reversed }) {
    const flockRef = useRef();
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);

    useFrame((state) => {
        if (!flockRef.current || !meshRef.current) return;
        const t = state.clock.elapsedTime;

        if (reversed) {
            flockRef.current.position.set(
                Math.sin(t * 0.3) * 2,
                12 + Math.sin(t * 0.5) * 0.5,
                Math.cos(t * 0.3) * 2
            );
            birdOffsets.forEach((off, i) => {
                dummy.position.set(
                    off.dx * 3 + Math.sin(t + off.phase) * 2,
                    off.dy * 2 + Math.cos(t * 1.5 + off.phase) * 1,
                    off.dz * 3
                );
                dummy.scale.setScalar(0.06 + Math.sin(t * 6 + off.phase) * 0.015);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
            });
        } else {
            flockRef.current.position.set(
                Math.sin(t * 0.4) * 5,
                12 + Math.sin(t * 0.7) * 1.5,
                Math.cos(t * 0.4) * 5
            );
            birdOffsets.forEach((off, i) => {
                dummy.position.set(
                    off.dx + Math.sin(t * 1.2 + off.phase) * 0.3,
                    off.dy + Math.sin(t * 2 + off.phase) * 0.2,
                    off.dz
                );
                dummy.scale.setScalar(0.07 + Math.sin(t * 8 + off.phase) * 0.02);
                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
            });
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <group ref={flockRef}>
            <instancedMesh ref={meshRef} args={[null, null, birdOffsets.length]}>
                <sphereGeometry args={[0.07, 4, 3]} />
                <meshBasicMaterial color="#dddddd" />
            </instancedMesh>
        </group>
    );
}

function CivBuildingsInstanced({ buildings, reversed }) {
    const ref = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const colors = useMemo(() => buildings.map(b => new THREE.Color(b.color)), [buildings]);

    // Хранение текущего scale Y для плавной анимации
    const currentScales = useRef(new Float32Array(buildings.length).fill(0.01));

    useLayoutEffect(() => {
        if (!ref.current) return;
        buildings.forEach((b, i) => {
            ref.current.setColorAt(i, colors[i]);
        });
        ref.current.instanceColor.needsUpdate = true;
    }, [buildings, colors]);

    useFrame((state, delta) => {
        if (!ref.current) return;

        const ruinsColor = new THREE.Color(0x333322);

        buildings.forEach((b, i) => {
            const curY = currentScales.current[i];
            let nextY = curY;

            if (reversed) {
                nextY = curY + (b.height * 0.3 - curY) * delta * 0.5;
                ref.current.setColorAt(i, ruinsColor);
            } else {
                nextY = Math.min(1.0, curY + delta * 0.3);
                ref.current.setColorAt(i, colors[i]);
            }
            currentScales.current[i] = nextY;

            dummy.position.set(...b.pos);
            dummy.quaternion.copy(surfaceQuaternion(b.pos));
            dummy.scale.set(1, 1, 1);
            dummy.translateY((b.height * nextY) / 2); // Центр бокса
            dummy.scale.set(b.width, b.height * nextY, b.width);
            dummy.updateMatrix();
            ref.current.setMatrixAt(i, dummy.matrix);
        });

        ref.current.instanceColor.needsUpdate = true;
        ref.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={ref} args={[null, null, buildings.length]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial roughness={0.5} metalness={0.5} />
        </instancedMesh>
    );
}
function Smog({ reversed }) {
    const ref = useRef();
    useFrame((state, delta) => {
        if (!ref.current) return;
        const t = state.clock.elapsedTime;
        ref.current.rotation.y -= delta * 0.05;
        if (reversed) {
            ref.current.material.opacity = Math.max(0.0, ref.current.material.opacity - delta * 0.2);
        } else {
            ref.current.material.opacity = Math.min(0.55, ref.current.material.opacity + delta * 0.1);
            ref.current.material.color.setHex(0x334433);
            ref.current.scale.setScalar(1.04 + Math.sin(t * 2) * 0.01);
        }
    });
    return (
        <mesh ref={ref}>
            <sphereGeometry args={[R + 0.65, 28, 28]} />
            <meshStandardMaterial color="#334433" transparent opacity={0.0} roughness={1} side={THREE.FrontSide} />
        </mesh>
    );
}

// ─── Компонент: Война (взрывы) ───────────────────────────────────────────────
function WarParticles({ reversed }) {
    const ref = useRef();
    const count = 40;

    const positions = useMemo(() => {
        const arr = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            const phi = rnd(0.4, 2.4);
            const theta = Math.PI + rnd(-1.1, 1.1);
            const [x, y, z] = sph(R + 0.5, phi, theta);
            arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
        }
        return arr;
    }, []);

    useFrame((state) => {
        if (!ref.current) return;
        const t = state.clock.elapsedTime;
        ref.current.visible = !reversed;
        if (!reversed) {
            ref.current.material.opacity = 0.6 + Math.sin(t * 5) * 0.3;
            ref.current.material.size = 0.15 + Math.sin(t * 7) * 0.08;
        }
    });

    return (
        <points ref={ref}>
            <bufferGeometry>
                <bufferAttribute attach="attributes-position" args={[positions, 3]} />
            </bufferGeometry>
            <pointsMaterial color="#ff4400" size={0.18} transparent opacity={0.8} sizeAttenuation blending={THREE.AdditiveBlending} />
        </points>
    );
}

// ─── FactorTrigger ────────────────────────────────────────────────────────────
function FactorTrigger({ pos, factorId, label, warn = false, color = '#ffffaa' }) {
    const { reversedFactors, setActiveFactor } = useStore();
    const isRev = !!reversedFactors[factorId];
    const meshRef = useRef();

    useFrame((state) => {
        if (!meshRef.current) return;
        meshRef.current.rotation.y += 0.02;
        meshRef.current.rotation.x += 0.01;
        const s = 1.0 + Math.sin(state.clock.elapsedTime * 2 + pos[0]) * 0.1;
        meshRef.current.scale.setScalar(s);
    });

    const c = warn ? (isRev ? '#aaffaa' : '#ff3333') : (isRev ? '#88ccff' : color);

    return (
        <group
            position={pos}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
            onPointerOut={() => { document.body.style.cursor = 'auto'; }}
        >
            <mesh ref={meshRef}>
                <octahedronGeometry args={[0.7, 0]} />
                <meshBasicMaterial color={c} wireframe />
            </mesh>
            <Text font="/Roboto-Regular.ttf" 
                position={[0, -1.3, 0]}
                fontSize={0.42}
                color="white"
                outlineColor="black"
                outlineWidth={0.06}
                anchorX="center"
            >
                {isRev
                    ? label.split(' / ')[1] || label
                    : label.split(' / ')[0] || label}
            </Text>
        </group>
    );
}

// ─── Главный компонент ────────────────────────────────────────────────────────
export default function Planet() {
    const { stage, reversedFactors } = useStore();
    const planetGroup = useRef();
    const { mountains, trees, animals, birdOffsets, stars, buildings } = usePlanetData();
    const earthTexture = useEarthTexture();

    // Поворот планеты: stage 2 = природная сторона (вперёд), stage 3 = цивилизация
    useEffect(() => {
        if (!planetGroup.current) return;
        gsap.to(planetGroup.current.rotation, {
            y: stage === 2 ? 0 : Math.PI,
            duration: 2.2,
            ease: 'power2.inOut',
        });
    }, [stage]);

    const rf = reversedFactors;

    return (
        <group>
            <ambientLight intensity={0.8} />

            {/* Небо: звёзды, солнце, луна */}
            <SkySystem stars={stars} reversedFactors={rf} />

            {/* Планета: смещена вниз для эффекта горизонта-полусферы на весь экран */}
            <group ref={planetGroup} position={[0, -7, 0]}>

                {/* ── Базовая сфера (Океаны и материки) ── */}
                <mesh>
                    <sphereGeometry args={[R, 64, 64]} />
                    <meshStandardMaterial map={earthTexture} roughness={0.6} metalness={0.1} />
                </mesh>

                {/* ── ПРИРОДНАЯ СТОРОНА (stage 2) ── */}

                {/* Океан */}
                <Ocean reversed={!!rf['ocean']} />

                {/* Атмосфера / Облака */}
                <Atmosphere reversed={!!rf['atmosphere']} />

                {/* Горы / Тектоника */}
                <MountainsInstanced mountains={mountains} reversed={!!rf['tectonics']} />

                {/* Растительность */}
                <TreesInstanced trees={trees} reversed={!!rf['photosynthesis']} />

                {/* Животные */}
                <AnimalsInstanced animals={animals} reversed={!!rf['wildlife']} />

                {/* Стая птиц */}
                <BirdFlockInstanced birdOffsets={birdOffsets} reversed={!!rf['migration']} />

                {/* Полярные сияния */}
                <Aurora reversed={!!rf['aurora']} />

                {/* ── ЦИВИЛИЗАЦИОННАЯ СТОРОНА (stage 3) ── */}

                <CivBuildingsInstanced buildings={buildings} reversed={!!rf['progress']} />

                {/* Смог */}
                <Smog reversed={!!rf['ecology']} />

                {/* Война — частицы */}
                <WarParticles reversed={!!rf['war']} />

                {/* Интерференция — волновые кольца */}
                <InterferenceRings reversed={!!rf['interference']} />

                {/* ── ФАКТОРЫ STAGE 2 ── */}
                {stage === 2 && (
                    <>
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF, 0)}
                            factorId="ocean"
                            label="ОКЕАН / ЗАСУХА"
                            color="#44aaff"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.6, 0.7)}
                            factorId="tectonics"
                            label="ТЕКТОНИКА / ЗЕМЛЕТРЯСЕНИЯ"
                            color="#cc9944"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.4, -0.7)}
                            factorId="photosynthesis"
                            label="ФОТОСИНТЕЗ / УВЯДАНИЕ"
                            color="#44cc44"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.5, -0.9)}
                            factorId="wildlife"
                            label="БИОСФЕРА / ВЫМИРАНИЕ"
                            color="#cc8844"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.5, 0.9)}
                            factorId="migration"
                            label="МИГРАЦИЯ / РАССЕИВАНИЕ"
                            color="#aaddff"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.8, 1.3)}
                            factorId="atmosphere"
                            label="АТМОСФЕРА / ОПУСТЫНИВАНИЕ"
                            color="#ddddff"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.2, -1.3)}
                            factorId="aurora"
                            label="ПОЛЯРНОЕ СИЯНИЕ / ЗАТУХАНИЕ"
                            color="#00ffcc"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.3, 0.2)}
                            factorId="dayNight"
                            label="ДЕНЬ / НОЧЬ"
                            color="#ffdd88"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.7, 0.3)}
                            factorId="sunEnergy"
                            label="СОЛНЦЕ / УГАСАНИЕ"
                            color="#ffaa00"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.0, 1.8)}
                            factorId="moonPhase"
                            label="ЛУНА / ТЬМА"
                            color="#aabbdd"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.7, -1.7)}
                            factorId="starField"
                            label="ЗВЁЗДНОЕ НЕБО / ТУМАН"
                            color="#ffffff"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.6, -1.8)}
                            factorId="interference"
                            label="ИНТЕРФЕРЕНЦИЯ / ИЗОЛЯЦИЯ"
                            color="#ff88ff"
                        />
                    </>
                )}

                {/* ── ФАКТОРЫ STAGE 3 ── */}
                {stage === 3 && (
                    <>
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF, Math.PI)}
                            factorId="war"
                            label="ВОЙНА / МИР"
                            warn
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.6, Math.PI + 0.7)}
                            factorId="progress"
                            label="ПРОГРЕСС / СТАГНАЦИЯ"
                            color="#88ccff"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.4, Math.PI - 0.7)}
                            factorId="ecology"
                            label="ЭКОЛОГИЯ / СМОГ"
                            color="#88ffaa"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.5, Math.PI - 0.9)}
                            factorId="urbanization"
                            label="УРБАНИЗАЦИЯ / УПАДОК"
                            color="#aaaacc"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.5, Math.PI + 0.9)}
                            factorId="trade"
                            label="ТОРГОВЛЯ / ИЗОЛЯЦИЯ"
                            color="#ffcc44"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 0.8, Math.PI + 1.5)}
                            factorId="culture"
                            label="КУЛЬТУРА / ВАРВАРСТВО"
                            color="#ffaaff"
                        />
                        <FactorTrigger
                            pos={sph(R + 2.5, HALF * 1.2, Math.PI - 1.5)}
                            factorId="energy"
                            label="ЭНЕРГИЯ / ИСТОЩЕНИЕ"
                            color="#ff8844"
                        />
                    </>
                )}

            </group>
        </group>
    );
}

// ─── Компонент: Интерференция ────────────────────────────────────────────────
function InterferenceRings({ reversed }) {
    const refs = [useRef(), useRef(), useRef()];
    useFrame((state, delta) => {
        refs.forEach((r, i) => {
            if (!r.current) return;
            const t = state.clock.elapsedTime;
            if (reversed) {
                r.current.scale.setScalar(Math.max(0.1, r.current.scale.x - delta * 0.3));
                r.current.material.opacity = Math.max(0, r.current.material.opacity - delta * 0.2);
            } else {
                const pulse = 1.0 + Math.sin(t * 1.5 + i * 1.2) * 0.08;
                r.current.scale.setScalar(pulse);
                r.current.material.opacity = 0.25 + Math.sin(t * 2 + i * 1.5) * 0.1;
            }
        });
    });
    const radii = [R + 1.5, R + 2.5, R + 3.5];
    return (
        <group>
            {radii.map((rad, i) => (
                <mesh key={i} ref={refs[i]} rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[rad, 0.08, 8, 80]} />
                    <meshBasicMaterial
                        color="#ff88ff"
                        transparent opacity={0.3}
                        side={THREE.DoubleSide}
                        blending={THREE.AdditiveBlending}
                    />
                </mesh>
            ))}
        </group>
    );
}
