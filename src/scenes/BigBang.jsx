import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../store';

export default function BigBang() {
    const { isExploded, triggerBang, setStage } = useStore();
    const particleCount = 20000;
    const pointsRef = useRef();
    const materialRef = useRef();
    const { camera } = useThree();

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

    useEffect(() => {
        if (isExploded && !hasExploded.current) {
            hasExploded.current = true;
            // Анимация камеры при Большом Взрыве (отлет назад)
            gsap.to(camera.position, {
                z: 50,
                duration: 4,
                ease: "power3.out",
                onComplete: () => {
                    // Переход на макро-уровень (Космос) только если мы все еще на 0
                    if (useStore.getState().stage === 0) {
                        setStage(1);
                    }
                }
            });
        }
    }, [isExploded, camera]);

    // Обработка клика по изначальной точке (на случай если пользователь кликнул вместо скролла)
    const handlePointerDown = () => {
        if (!isExploded) {
            triggerBang();
        }
    };

    useFrame((state, delta) => {
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
            <points
                ref={pointsRef}
                onClick={handlePointerDown}
                onPointerOver={() => { if (!isExploded) document.body.style.cursor = 'pointer' }}
                onPointerOut={() => { document.body.style.cursor = 'auto' }}
            >
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={particleCount} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-color" count={particleCount} array={colors} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial
                    ref={materialRef}
                    size={isExploded ? 0.3 : 2.5}
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

            {!isExploded && (
                <ambientLight intensity={10} />
            )}
        </group>
    );
}
