import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export default function ParticleBackground({ accentColor }) {
    const pointsRef = useRef();
    const particleCount = 150;

    // Генерируем случайные позиции частиц один раз
    const positions = useMemo(() => {
        const pos = new Float32Array(particleCount * 3);
        for (let i = 0; i < particleCount; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 15; // x
            pos[i * 3 + 1] = (Math.random() - 0.5) * 15; // y
            pos[i * 3 + 2] = (Math.random() - 0.5) * 10 - 2; // z
        }
        return pos;
    }, [particleCount]);

    // Сохраняем целевой цвет и текущий цвет
    const targetColor = useMemo(() => new THREE.Color(), []);
    const currentColor = useMemo(() => new THREE.Color('#444444'), []);
    const materialRef = useRef();

    useFrame((state, delta) => {
        // Вращаем поле частиц медленно
        if (pointsRef.current) {
            pointsRef.current.rotation.y += delta * 0.05;
            pointsRef.current.rotation.x += delta * 0.02;
        }

        // Плавно меняем цвет
        if (materialRef.current) {
            targetColor.set(accentColor || '#ffffff');
            currentColor.lerp(targetColor, delta * 2.0); // скорость смены цвета
            materialRef.current.color.copy(currentColor);
        }
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={particleCount}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                ref={materialRef}
                size={0.05}
                transparent
                opacity={0.6}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}
