import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
    FOREST_ZONES,
    ICE_REGIONS,
    MIGRATION_PATHS,
    MOUNTAIN_RANGES,
    WILDLIFE_ZONES,
} from '../../data/geography';
import { greatCircleArc, latLonToVec3, seededRandom, surfaceQuaternion } from '../../lib/geo';

const DEG = Math.PI / 180;

function lonStretchAt(lat) {
    return 1 / Math.max(0.2, Math.cos(lat * DEG));
}

/**
 * Расставляет вершины вдоль ломаной реального хребта: точка выбирается на
 * случайном отрезке пути, поэтому цепь получается непрерывной, а не облаком пиков.
 */
function buildMountains() {
    const rand = seededRandom(0xa17e5);
    const peaks = [];

    MOUNTAIN_RANGES.forEach((range) => {
        const legs = range.path.length - 1;
        for (let i = 0; i < range.peaks; i += 1) {
            const t = (i + rand() * 0.6) / range.peaks;
            const legIndex = Math.min(legs - 1, Math.floor(t * legs));
            const legT = t * legs - legIndex;
            const a = range.path[legIndex];
            const b = range.path[legIndex + 1];

            const jitter = 1.1;
            const lat = a.lat + (b.lat - a.lat) * legT + (rand() - 0.5) * jitter;
            const lon = a.lon + (b.lon - a.lon) * legT + (rand() - 0.5) * jitter * lonStretchAt(a.lat);

            const height = range.height[0] + rand() * (range.height[1] - range.height[0]);
            const dir = latLonToVec3(lat, lon, 1);
            peaks.push({
                dir,
                quaternion: surfaceQuaternion(dir, new THREE.Quaternion()),
                height,
                radiusXZ: (0.32 + rand() * 0.26) * height,
                color: range.color,
                snow: height > 0.22,
            });
        }
    });

    return peaks;
}

function buildForests() {
    const rand = seededRandom(0xf07e57);
    const trees = [];

    FOREST_ZONES.forEach((zone) => {
        for (let i = 0; i < zone.count; i += 1) {
            const lat = zone.lat + (rand() - 0.5) * 2 * zone.spread[0];
            const lon = zone.lon + (rand() - 0.5) * 2 * zone.spread[1] * lonStretchAt(zone.lat);
            const dir = latLonToVec3(lat, lon, 1);
            trees.push({
                dir,
                quaternion: surfaceQuaternion(dir, new THREE.Quaternion()),
                scale: 0.55 + rand() * 0.75,
                hue: zone.hue + (rand() - 0.5) * 0.03,
                lightness: 0.26 + rand() * 0.12,
            });
        }
    });

    return trees;
}

function buildWildlife() {
    const rand = seededRandom(0xa11a1);
    const animals = [];

    WILDLIFE_ZONES.forEach((zone) => {
        for (let i = 0; i < zone.count; i += 1) {
            const lat = zone.lat + (rand() - 0.5) * 2 * zone.spread[0];
            const lon = zone.lon + (rand() - 0.5) * 2 * zone.spread[1] * lonStretchAt(zone.lat);
            animals.push({
                lat,
                lon,
                kind: zone.kind,
                phase: rand() * Math.PI * 2,
                speed: 0.35 + rand() * 0.5,
            });
        }
    });

    return animals;
}

/** Горные системы: конус породы и снежная вершина, оба инстансированы. */
function Mountains({ radius, quaking }) {
    const rockRef = useRef();
    const snowRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const peaks = useMemo(() => buildMountains(), []);
    const snowPeaks = useMemo(() => peaks.filter((p) => p.snow), [peaks]);

    const writeMatrices = (shake) => {
        const rock = rockRef.current;
        const snow = snowRef.current;
        if (!rock) return;

        let snowIndex = 0;
        for (let i = 0; i < peaks.length; i += 1) {
            const p = peaks[i];
            const wobble = shake ? 1 + Math.sin(shake * 9 + i) * 0.14 : 1;
            const h = p.height * wobble;

            dummy.position.copy(p.dir).multiplyScalar(radius + h / 2 - 0.02);
            dummy.quaternion.copy(p.quaternion);
            dummy.scale.set(p.radiusXZ, h, p.radiusXZ);
            dummy.updateMatrix();
            rock.setMatrixAt(i, dummy.matrix);

            if (snow && p.snow) {
                dummy.position.copy(p.dir).multiplyScalar(radius + h * 0.86);
                dummy.scale.set(p.radiusXZ * 0.42, h * 0.26, p.radiusXZ * 0.42);
                dummy.updateMatrix();
                snow.setMatrixAt(snowIndex, dummy.matrix);
                snowIndex += 1;
            }
        }
        rock.instanceMatrix.needsUpdate = true;
        if (snow) snow.instanceMatrix.needsUpdate = true;
    };

    useLayoutEffect(() => {
        const rock = rockRef.current;
        if (!rock) return;
        const color = new THREE.Color();
        peaks.forEach((p, i) => rock.setColorAt(i, color.set(p.color)));
        if (rock.instanceColor) rock.instanceColor.needsUpdate = true;
        writeMatrices(0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [peaks, radius]);

    // Матрицы пересчитываются только во время землетрясения, иначе буфер статичен
    const wasQuaking = useRef(false);
    useFrame((state) => {
        if (quaking) {
            writeMatrices(state.clock.elapsedTime);
            wasQuaking.current = true;
        } else if (wasQuaking.current) {
            writeMatrices(0);
            wasQuaking.current = false;
        }
    });

    return (
        <group>
            <instancedMesh ref={rockRef} args={[undefined, undefined, peaks.length]} frustumCulled={false}>
                <coneGeometry args={[1, 1, 6]} />
                <meshStandardMaterial roughness={0.92} metalness={0.05} flatShading />
            </instancedMesh>
            <instancedMesh ref={snowRef} args={[undefined, undefined, Math.max(1, snowPeaks.length)]} frustumCulled={false}>
                <coneGeometry args={[1, 1, 6]} />
                <meshStandardMaterial color="#eaf4ff" roughness={0.35} metalness={0} flatShading />
            </instancedMesh>
        </group>
    );
}

/** Леса мира. Цвет крон переходит в бурый при увядании — один раз, не каждый кадр. */
function Forests({ radius, withering }) {
    const crownRef = useRef();
    const trunkRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const trees = useMemo(() => buildForests(), []);
    const wither = useRef(0);

    useLayoutEffect(() => {
        const crown = crownRef.current;
        const trunk = trunkRef.current;
        if (!crown || !trunk) return;
        const color = new THREE.Color();

        for (let i = 0; i < trees.length; i += 1) {
            const t = trees[i];
            const h = 0.09 * t.scale;

            dummy.position.copy(t.dir).multiplyScalar(radius + h * 0.35);
            dummy.quaternion.copy(t.quaternion);
            dummy.scale.setScalar(t.scale);
            dummy.updateMatrix();
            trunk.setMatrixAt(i, dummy.matrix);

            dummy.position.copy(t.dir).multiplyScalar(radius + h * 1.5);
            dummy.updateMatrix();
            crown.setMatrixAt(i, dummy.matrix);

            color.setHSL(t.hue, 0.55, t.lightness);
            crown.setColorAt(i, color);
        }

        crown.instanceMatrix.needsUpdate = true;
        trunk.instanceMatrix.needsUpdate = true;
        if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [trees, radius]);

    useFrame((_, delta) => {
        const crown = crownRef.current;
        if (!crown) return;
        const target = withering ? 1 : 0;
        const diff = target - wither.current;
        if (Math.abs(diff) < 0.004) return;

        wither.current += diff * Math.min(1, delta * 1.2);
        const color = new THREE.Color();
        for (let i = 0; i < trees.length; i += 1) {
            const t = trees[i];
            const hue = THREE.MathUtils.lerp(t.hue, 0.09, wither.current);
            const sat = THREE.MathUtils.lerp(0.55, 0.35, wither.current);
            const light = THREE.MathUtils.lerp(t.lightness, 0.22, wither.current);
            color.setHSL(hue, sat, light);
            crown.setColorAt(i, color);
        }
        if (crown.instanceColor) crown.instanceColor.needsUpdate = true;
    });

    return (
        <group>
            <instancedMesh ref={crownRef} args={[undefined, undefined, trees.length]} frustumCulled={false}>
                <coneGeometry args={[0.04, 0.115, 5]} />
                <meshStandardMaterial roughness={0.85} flatShading />
            </instancedMesh>
            <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]} frustumCulled={false}>
                <cylinderGeometry args={[0.008, 0.012, 0.055, 4]} />
                <meshStandardMaterial color="#5a4227" roughness={0.95} />
            </instancedMesh>
        </group>
    );
}

/** Стада животных бродят по своим биомам, при вымирании — мерцают и исчезают. */
function Wildlife({ radius, extinct }) {
    const meshRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const animals = useMemo(() => buildWildlife(), []);
    const scratchDir = useMemo(() => new THREE.Vector3(), []);
    const scratchQuat = useMemo(() => new THREE.Quaternion(), []);

    useLayoutEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const palette = ['#d8a05a', '#9b7b52', '#c9c2b0'];
        const color = new THREE.Color();
        animals.forEach((a, i) => mesh.setColorAt(i, color.set(palette[a.kind])));
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }, [animals]);

    useFrame((state) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime;

        for (let i = 0; i < animals.length; i += 1) {
            const a = animals[i];
            const lat = a.lat + Math.sin(t * a.speed + a.phase) * 0.8;
            const lon = a.lon + Math.cos(t * a.speed * 0.7 + a.phase) * 0.8 * lonStretchAt(a.lat);
            latLonToVec3(lat, lon, 1, scratchDir);

            const scale = extinct
                ? Math.max(0, Math.sin(t * 3 + a.phase)) * 0.055
                : 0.055 + Math.sin(t * 6 + a.phase) * 0.008;

            dummy.position.copy(scratchDir).multiplyScalar(radius + 0.03);
            dummy.quaternion.copy(surfaceQuaternion(scratchDir, scratchQuat));
            dummy.scale.setScalar(scale);
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        }
        mesh.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, animals.length]} frustumCulled={false}>
            <sphereGeometry args={[1, 8, 6]} />
            <meshStandardMaterial roughness={0.8} />
        </instancedMesh>
    );
}

/** Птичьи стаи летят по реальным пролётным путям; при рассеивании теряют строй. */
function Migration({ radius, scattered }) {
    const meshRef = useRef();
    const lineRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const scratch = useMemo(() => new THREE.Vector3(), []);

    const flocks = useMemo(
        () => MIGRATION_PATHS.map((path, index) => ({
            points: greatCircleArc(path.from, path.to, radius + 0.55, radius * 0.045, 48),
            offset: index * 0.33,
        })),
        [radius],
    );

    const birdsPerFlock = 9;
    const total = flocks.length * birdsPerFlock;

    const routeGeometry = useMemo(() => {
        const positions = [];
        flocks.forEach(({ points }) => {
            for (let i = 0; i < points.length - 1; i += 1) {
                positions.push(points[i].x, points[i].y, points[i].z);
                positions.push(points[i + 1].x, points[i + 1].y, points[i + 1].z);
            }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return geo;
    }, [flocks]);

    useLayoutEffect(() => () => routeGeometry.dispose(), [routeGeometry]);

    useFrame((state) => {
        const mesh = meshRef.current;
        if (!mesh) return;
        const t = state.clock.elapsedTime;

        let index = 0;
        for (let f = 0; f < flocks.length; f += 1) {
            const { points, offset } = flocks[f];
            const head = (t * 0.045 + offset) % 1;

            for (let b = 0; b < birdsPerFlock; b += 1) {
                const spacing = scattered ? 0.09 : 0.022;
                const progress = (head - b * spacing + 1) % 1;
                const pointIndex = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));
                const p = points[pointIndex];

                const spreadAmount = scattered ? 0.55 : 0.14;
                scratch.set(
                    Math.sin(t * 1.4 + index) * spreadAmount,
                    Math.cos(t * 1.1 + index * 1.7) * spreadAmount * 0.6,
                    Math.sin(t * 0.9 + index * 2.3) * spreadAmount,
                );

                dummy.position.copy(p).add(scratch);
                dummy.scale.setScalar(0.04 + Math.sin(t * 9 + index) * 0.009);
                dummy.updateMatrix();
                mesh.setMatrixAt(index, dummy.matrix);
                index += 1;
            }
        }
        mesh.instanceMatrix.needsUpdate = true;

        const lineMat = lineRef.current;
        if (lineMat) lineMat.opacity = scattered ? 0.04 : 0.18;
    });

    return (
        <group>
            <lineSegments geometry={routeGeometry}>
                <lineBasicMaterial
                    ref={lineRef}
                    color="#bfe8ff"
                    transparent
                    opacity={0.18}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </lineSegments>
            <instancedMesh ref={meshRef} args={[undefined, undefined, total]} frustumCulled={false}>
                <sphereGeometry args={[1, 6, 4]} />
                <meshBasicMaterial color="#eef7ff" />
            </instancedMesh>
        </group>
    );
}

/** Ледяные щиты Гренландии и Антарктиды — тают при обратном факторе. */
function Glaciers({ radius, melting, onSelect }) {
    const groupRef = useRef();

    useFrame((state) => {
        const group = groupRef.current;
        if (!group) return;
        const shimmer = 1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.04;
        group.children.forEach((child) => {
            child.scale.setScalar(melting ? shimmer * 0.55 : shimmer);
        });
    });

    return (
        <group ref={groupRef}>
            {ICE_REGIONS.map((region) => {
                const pos = latLonToVec3(region.lat, region.lon, radius + 0.12);
                const quat = surfaceQuaternion(pos, new THREE.Quaternion());
                return (
                    <mesh
                        key={region.name}
                        position={[pos.x, pos.y, pos.z]}
                        quaternion={quat}
                        onClick={(e) => { e.stopPropagation(); onSelect('glaciers'); }}
                        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                    >
                        <icosahedronGeometry args={[0.3, 0]} />
                        <meshStandardMaterial
                            color={melting ? '#9fc4d8' : '#e8f6ff'}
                            roughness={0.25}
                            metalness={0.1}
                            transparent
                            opacity={melting ? 0.5 : 0.9}
                            flatShading
                        />
                    </mesh>
                );
            })}
        </group>
    );
}

/**
 * Природный слой планеты: горные системы, леса, стада, миграции и ледники —
 * всё на своих настоящих географических местах.
 */
export default function NatureLayer({ radius, reversedFactors, setActiveFactor, active }) {
    return (
        <group>
            <Mountains radius={radius} quaking={!!reversedFactors.tectonics} />
            <Forests radius={radius} withering={!!reversedFactors.photosynthesis} />
            {active && (
                <>
                    <Wildlife radius={radius} extinct={!!reversedFactors.wildlife} />
                    <Migration radius={radius} scattered={!!reversedFactors.migration} />
                    <Glaciers
                        radius={radius}
                        melting={!!reversedFactors.glaciers}
                        onSelect={setActiveFactor}
                    />
                </>
            )}
        </group>
    );
}
