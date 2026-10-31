import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../store';
import { circleSprite } from '../lib/sprites';

export default function BigBang() {
    const isExploded = useStore((s) => s.isExploded);
    const triggerBang = useStore((s) => s.triggerBang);
    const beginShift = useStore((s) => s.beginShift);
    const particleCount = 20000;
    const pointsRef = useRef();
    const materialRef = useRef();
    const { camera } = useThree();

    const seedRef = useRef();
    const haloRef = useRef();
    const flash = useRef(0);
    const halo = useMemo(() => circleSprite(), []);

    // До взрыва облака частиц нет вовсе: сингулярность — одна маленькая
    // белая точка (seedRef). Сорок восемь цветных спрайтов размером 2.5
    // сливались в кадре в большое сиреневое пятно, а не в точку.
    useEffect(() => {
        const geometry = pointsRef.current?.geometry;
        if (!geometry) return;
        geometry.setDrawRange(0, isExploded ? particleCount : 0);
    }, [isExploded, particleCount]);

    // Генератор круглой текстуры для частиц (мягкий круг)
    const circleTexture = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.beginPath();
        ctx.arc(32, 32, 32, 0, 2 * Math.PI);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        return new THREE.CanvasTexture(canvas);
    }, []);

    useEffect(() => () => circleTexture.dispose(), [circleTexture]);

    // Исходная позиция: все частицы в одной точке [0,0,0]
    const [positions, velocities, colors] = useMemo(() => {
        const pos = new Float32Array(particleCount * 3);
        const vel = new Float32Array(particleCount * 3);
        const col = new Float32Array(particleCount * 3);
        const colorGen = new THREE.Color();

        for (let i = 0; i < particleCount; i++) {
            // Разлет (сферический хаос)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(Math.random() * 2 - 1);
            const speed = Math.random() * 3 + 0.5;

            vel[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
            vel[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
            vel[i * 3 + 2] = Math.cos(phi) * speed;

            // Цвет: от горячего белого до оранжевого/фиолетового
            colorGen.setHSL(Math.random() * 0.15 + 0.6, 0.8, Math.random() * 0.5 + 0.5);
            col[i * 3] = colorGen.r;
            col[i * 3 + 1] = colorGen.g;
            col[i * 3 + 2] = colorGen.b;
        }
        return [pos, vel, col];
    }, [particleCount]);

    const hasExploded = useRef(false);
    const bangTween = useRef(null);

    useEffect(() => {
        if (isExploded && !hasExploded.current) {
            hasExploded.current = true;
            // Анимация камеры при Большом Взрыве (отлет назад)
            bangTween.current = gsap.to(camera.position, {
                z: 50,
                duration: 3.4,
                ease: "power3.out",
                onComplete: () => {
                    // Ударная волна выбеливает кадр, и уже под вспышкой сцена
                    // сменяется на макро-уровень
                    if (useStore.getState().stage === 0) {
                        beginShift('bang', { type: 'stage', to: 1 });
                    }
                }
            });
        }
        // Гасим только свой твин. killTweensOf(camera.position) при размонтаже
        // убивал бы и въезд в следующий слой: сцены снимаются с задержкой
        // Suspense, уже после того, как камера получила новую траекторию.
        return () => { bangTween.current?.kill(); };
    }, [isExploded, camera, beginShift]);

    // Обработка клика по изначальной точке (на случай если пользователь кликнул вместо скролла)
    const handlePointerDown = () => {
        if (!isExploded) {
            triggerBang();
        }
    };

    useFrame((state, delta) => {
        // Точка едва заметно дышит: живая, но не мигает и не зовёт к себе
        // громче подсказки внизу. В момент взрыва её ореол вспыхивает и тает.
        const t = state.clock.elapsedTime;
        if (isExploded) flash.current = Math.min(1, flash.current + delta * 4);
        const f = flash.current;
        if (seedRef.current) {
            seedRef.current.scale.setScalar((1 + 0.08 * Math.sin(t * 1.6)) * (1 - f));
        }
        if (haloRef.current) {
            haloRef.current.scale.setScalar(0.15 + 0.02 * Math.sin(t * 1.6) + f * f * 6);
            haloRef.current.material.opacity = (0.55 + 0.1 * Math.sin(t * 1.6)) * (f > 0 ? Math.max(0, 1 - f) * 1.6 : 1);
        }

        if (isExploded && pointsRef.current) {
            const positionsAttr = pointsRef.current.geometry.attributes.position;
            const posArray = positionsAttr.array;

            for (let i = 0; i < particleCount; i++) {
                posArray[i * 3] += velocities[i * 3] * delta * 15;
                posArray[i * 3 + 1] += velocities[i * 3 + 1] * delta * 15;
                posArray[i * 3 + 2] += velocities[i * 3 + 2] * delta * 15;

                // Постепенно замедляем разлет (сопротивление среды/гравитация)
                velocities[i * 3] *= 0.98;
                velocities[i * 3 + 1] *= 0.98;
                velocities[i * 3 + 2] *= 0.98;
            }
            positionsAttr.needsUpdate = true;

            // Блеск точки спадает
            if (materialRef.current.opacity > 0) {
                materialRef.current.opacity -= delta * 0.2;
            }
        }
    });

    return (
        <group>
            {/* Сингулярность: крошечное белое ядро и мягкий ореол вокруг */}
            <mesh ref={seedRef} raycast={() => null}>
                <sphereGeometry args={[0.014, 16, 12]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
            </mesh>
            <sprite ref={haloRef} scale={0.15} raycast={() => null}>
                <spriteMaterial map={halo} color="#ffffff" transparent opacity={0.6} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
            </sprite>
            {/* Попасть по точке в два пикселя нельзя — зона клика шире её */}
            {!isExploded && (
                <mesh
                    visible={false}
                    onClick={handlePointerDown}
                    onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                    onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                >
                    <sphereGeometry args={[0.45, 12, 8]} />
                    <meshBasicMaterial />
                </mesh>
            )}
            <points ref={pointsRef} raycast={() => null}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial
                    ref={materialRef}
                    size={0.3}
                    vertexColors
                    transparent
                    opacity={1}
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    map={circleTexture}
                    alphaMap={circleTexture}
                    alphaTest={0.001}
                />
            </points>

        </group>
    );
}
