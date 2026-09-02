import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { CITIES, LABELLED_CITIES, TRADE_ROUTES, findCity } from '../../data/geography';
import { greatCircleArc, latLonToVec3, seededRandom, surfaceQuaternion } from '../../lib/geo';

const DEG = Math.PI / 180;

/** Освобождает геометрию, созданную вручную, при размонтировании слоя. */
function useDisposable(resource) {
    useLayoutEffect(() => () => resource?.dispose?.(), [resource]);
}

const TIER_COUNT = { 3: 34, 2: 22, 1: 14 };
const TIER_SPREAD = { 3: 2.1, 2: 1.6, 1: 1.15 };
// Высоты в долях радиуса планеты: даже мегабашни остаются штрихами на сфере,
// а не мегаструктурами размером с континент
const TIER_HEIGHT = { 3: 0.3, 2: 0.2, 1: 0.13 };
const BUILDING_PALETTE = ['#8fa6c4', '#7d90ab', '#9fb4cc', '#6f7f96', '#aab9cc'];

/**
 * Раскладывает кварталы вокруг центра каждого мегаполиса. Плотность падает от
 * центра к периферии, а высота — наоборот, поэтому силуэт читается как реальный
 * город: башни в деловом ядре и низкая застройка на окраинах.
 */
function buildCityBlocks(radius) {
    const rand = seededRandom(0x5eed1a);
    const blocks = [];

    CITIES.forEach((city) => {
        const count = TIER_COUNT[city.tier];
        const spread = TIER_SPREAD[city.tier];
        const maxHeight = TIER_HEIGHT[city.tier];
        // Ближе к полюсам меридианы сходятся, поэтому смещение по долготе растягиваем
        const lonStretch = 1 / Math.max(0.22, Math.cos(city.lat * DEG));

        for (let i = 0; i < count; i += 1) {
            const angle = rand() * Math.PI * 2;
            const distance = Math.pow(rand(), 0.62) * spread;
            const lat = city.lat + Math.sin(angle) * distance;
            const lon = city.lon + Math.cos(angle) * distance * lonStretch;

            const core = 1 - distance / spread;
            const height = (0.035 + Math.pow(core, 1.7) * maxHeight) * (0.55 + rand() * 0.75);
            const width = 0.02 + rand() * 0.026 + (city.tier === 3 ? 0.008 : 0);

            const dir = latLonToVec3(lat, lon, 1);
            blocks.push({
                dir,
                quaternion: surfaceQuaternion(dir, new THREE.Quaternion()),
                height,
                width,
                depth: width * (0.75 + rand() * 0.5),
                color: BUILDING_PALETTE[Math.floor(rand() * BUILDING_PALETTE.length)],
                tier: city.tier,
                radius,
            });
        }
    });

    return blocks;
}

/** Небоскрёбы и кварталы всех мегаполисов — два инстансированных меша на всю планету. */
function CityBlocks({ radius, decayed, ruined, nightLights }) {
    const bodyRef = useRef();
    const glowRef = useRef();
    const dummy = useMemo(() => new THREE.Object3D(), []);
    const blocks = useMemo(() => buildCityBlocks(radius), [radius]);

    const baseColors = useMemo(
        () => blocks.map((b) => new THREE.Color(b.color)),
        [blocks],
    );
    const ruinColor = useMemo(() => new THREE.Color('#4a4a44'), []);

    // Рост города анимируется один раз при входе на стадию; пока анимация активна,
    // матрицы инстансов пересчитываются, потом буфер остаётся неизменным.
    const growth = useRef(0.001);
    const settled = useRef(false);

    const writeMatrices = (value, heightScale) => {
        const body = bodyRef.current;
        const glow = glowRef.current;
        if (!body) return;

        for (let i = 0; i < blocks.length; i += 1) {
            const b = blocks[i];
            const h = Math.max(0.001, b.height * value * heightScale);
            dummy.position.copy(b.dir).multiplyScalar(radius + h / 2);
            dummy.quaternion.copy(b.quaternion);
            dummy.scale.set(b.width, h, b.depth);
            dummy.updateMatrix();
            body.setMatrixAt(i, dummy.matrix);

            if (glow) {
                dummy.scale.set(b.width * 1.12, h * 0.98, b.depth * 1.12);
                dummy.updateMatrix();
                glow.setMatrixAt(i, dummy.matrix);
            }
        }
        body.instanceMatrix.needsUpdate = true;
        if (glow) glow.instanceMatrix.needsUpdate = true;
    };

    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        blocks.forEach((_, i) => body.setColorAt(i, baseColors[i]));
        if (body.instanceColor) body.instanceColor.needsUpdate = true;
        writeMatrices(growth.current, 1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blocks, baseColors]);

    // Перекраска в цвет руин — разовая операция при переключении фактора
    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (!body) return;
        blocks.forEach((_, i) => body.setColorAt(i, ruined ? ruinColor : baseColors[i]));
        if (body.instanceColor) body.instanceColor.needsUpdate = true;
        settled.current = false;
    }, [ruined, blocks, baseColors, ruinColor]);

    useFrame((state, delta) => {
        const target = ruined ? 0.32 : 1;
        const heightScale = decayed ? 0.55 : 1;

        const diff = target - growth.current;
        if (Math.abs(diff) > 0.002 || !settled.current) {
            growth.current += diff * Math.min(1, delta * 1.4);
            writeMatrices(growth.current, heightScale);
            settled.current = Math.abs(diff) <= 0.002;
        }

        const glowMat = glowRef.current?.material;
        if (glowMat) {
            const glowTarget = ruined || decayed ? 0.03 : nightLights * 0.3;
            glowMat.opacity += (glowTarget - glowMat.opacity) * Math.min(1, delta * 2);
        }
    });

    return (
        <group>
            <instancedMesh ref={bodyRef} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial roughness={0.55} metalness={0.35} />
            </instancedMesh>
            <instancedMesh ref={glowRef} args={[undefined, undefined, blocks.length]} frustumCulled={false}>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial
                    color="#ffd9a0"
                    transparent
                    opacity={0.2}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                />
            </instancedMesh>
        </group>
    );
}

/** Торговые маршруты — дуги большого круга между реальными городами. */
function TradeRoutes({ radius, isolated }) {
    const materialRef = useRef();

    const geometry = useMemo(() => {
        const positions = [];
        TRADE_ROUTES.forEach(([fromName, toName]) => {
            const from = findCity(fromName);
            const to = findCity(toName);
            if (!from || !to) return;
            const arc = greatCircleArc(from, to, radius + 0.05, radius * 0.055, 20);
            for (let i = 0; i < arc.length - 1; i += 1) {
                positions.push(arc[i].x, arc[i].y, arc[i].z);
                positions.push(arc[i + 1].x, arc[i + 1].y, arc[i + 1].z);
            }
        });
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        return geo;
    }, [radius]);

    useDisposable(geometry);

    useFrame((state) => {
        const mat = materialRef.current;
        if (!mat) return;
        const pulse = 0.35 + Math.sin(state.clock.elapsedTime * 1.6) * 0.12;
        mat.opacity = isolated ? 0.06 : pulse;
        mat.color.set(isolated ? '#5d5346' : '#ffcf7d');
    });

    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial
                ref={materialRef}
                transparent
                opacity={0.35}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </lineSegments>
    );
}

/** Подписи мегаполисов, скрывающиеся за горизонтом планеты. */
function CityLabels({ radius, onSelect }) {
    const groupRef = useRef();
    const cameraDir = useMemo(() => new THREE.Vector3(), []);
    const worldPos = useMemo(() => new THREE.Vector3(), []);

    const labels = useMemo(
        () => LABELLED_CITIES.map((name) => findCity(name)).filter(Boolean),
        [],
    );

    useFrame((state) => {
        const group = groupRef.current;
        if (!group) return;
        group.children.forEach((child) => {
            child.getWorldPosition(worldPos);
            cameraDir.copy(state.camera.position).sub(worldPos);
            // Подпись видна, только если её точка обращена к камере
            child.visible = worldPos.dot(cameraDir) > -radius * 0.15;
        });
    });

    return (
        <group ref={groupRef}>
            {labels.map((city) => {
                const pos = latLonToVec3(city.lat, city.lon, radius + 0.75);
                return (
                    <group
                        key={city.name}
                        position={[pos.x, pos.y, pos.z]}
                        onClick={(e) => { e.stopPropagation(); onSelect('urbanization'); }}
                        onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                        onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                    >
                        <mesh>
                            <sphereGeometry args={[0.06, 10, 8]} />
                            <meshBasicMaterial color="#ffe9b8" />
                        </mesh>
                        {/* Billboard: слой вращается вместе с планетой, подпись всегда лицом к камере */}
                        <Billboard position={[0, 0.26, 0]}>
                            <Text
                                font="/Roboto-Regular.ttf"
                                fontSize={0.3}
                                color="#ffeecc"
                                anchorX="center"
                                anchorY="bottom"
                                outlineColor="black"
                                outlineWidth={0.045}
                            >
                                {city.name}
                            </Text>
                        </Billboard>
                    </group>
                );
            })}
        </group>
    );
}

/**
 * Цивилизационный слой планеты: застройка мегаполисов, ночное свечение,
 * торговые маршруты и подписи городов.
 */
export default function CityLayer({ radius, reversedFactors, setActiveFactor, active }) {
    const decayed = !!reversedFactors.urbanization;
    const ruined = !!reversedFactors.progress || !!reversedFactors.skyline;
    const isolated = !!reversedFactors.trade;
    const nightLights = decayed ? 0.15 : 1;

    return (
        <group>
            <CityBlocks
                radius={radius}
                decayed={decayed}
                ruined={ruined}
                nightLights={nightLights}
            />
            <TradeRoutes radius={radius} isolated={isolated} />
            {active && <CityLabels radius={radius} onSelect={setActiveFactor} />}
        </group>
    );
}
