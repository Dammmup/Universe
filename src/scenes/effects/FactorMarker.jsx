import React, { useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../../store';
import { circleSprite } from '../../lib/sprites';

/**
 * Метка фактора.
 *
 * Раньше это был проволочный октаэдр в полупрозрачном шаре — форма из отладки
 * сцены, которая в кадре читается как служебный гизмо. Здесь метка сделана как
 * оптическое явление: точечное ядро, гало и тонкое кольце-визир. Ядро и гало
 * не тонмапятся, поэтому их подхватывает свечение и они выглядят источником
 * света, а не куском геометрии.
 */
export default function FactorMarker({
    position,
    factorId,
    label,
    reverseLabel,
    color = '#cfe6ff',
    reverseColor = '#7fd4ff',
    scale = 1,
    labelOffset = -0.72,
    hitRadius = 2.45,
    theme = 'dark',
}) {
    const reversed = useStore((s) => !!s.reversedFactors[factorId]);
    const setActiveFactor = useStore((s) => s.setActiveFactor);
    const [hovered, setHovered] = useState(false);

    const haloRef = useRef();
    const ringRef = useRef();
    const outerRingRef = useRef();
    const coreRef = useRef();

    const tex = useMemo(() => circleSprite(), []);
    const tone = reversed ? reverseColor : color;
    const seed = useMemo(() => Math.random() * Math.PI * 2, []);
    // На светлом фоне аддитивное смешивание не даёт ничего: прибавка к почти
    // белому остаётся белой, и метка пропадает. Там метка рисуется краской.
    const light = theme === 'light';
    const blending = light ? THREE.NormalBlending : THREE.AdditiveBlending;

    useFrame((state, delta) => {
        const t = state.clock.elapsedTime;
        const pulse = 0.5 + Math.sin(t * 1.6 + seed) * 0.5;
        const target = hovered ? 1.35 : 1;

        if (haloRef.current) {
            const s = (1.15 + pulse * 0.22) * scale * target;
            haloRef.current.scale.set(s, s, s);
            haloRef.current.material.opacity = (light ? 0.1 + pulse * 0.1 : 0.16 + pulse * 0.14) * (hovered ? 1.8 : 1);
        }
        if (coreRef.current) {
            coreRef.current.material.opacity = 0.75 + pulse * 0.25;
        }
        if (ringRef.current) {
            ringRef.current.rotation.z += delta * 0.35;
            const s = THREE.MathUtils.lerp(ringRef.current.scale.x, target, Math.min(1, delta * 6));
            ringRef.current.scale.setScalar(s);
            ringRef.current.material.opacity = (light ? 0.6 : 0.32) + pulse * 0.16;
        }
        if (outerRingRef.current) {
            outerRingRef.current.rotation.z -= delta * 0.18;
            outerRingRef.current.material.opacity = (hovered ? 0.45 : (light ? 0.28 : 0.12)) + pulse * 0.06;
        }
    });

    const onOver = (e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = 'pointer';
    };
    const onOut = () => {
        setHovered(false);
        document.body.style.cursor = 'auto';
    };

    return (
        <group
            position={position}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setActiveFactor(factorId); }}
            onPointerOver={onOver}
            onPointerOut={onOut}
        >
            {/* Ядро: маленькое и очень яркое — его подхватывает свечение */}
            <mesh ref={coreRef} scale={scale}>
                <sphereGeometry args={[0.085, 12, 10]} />
                <meshBasicMaterial color={tone} transparent opacity={0.9} toneMapped={false} depthWrite={false} />
            </mesh>

            <sprite ref={haloRef} scale={scale}>
                <spriteMaterial
                    map={tex}
                    color={tone}
                    transparent
                    opacity={0.35}
                    depthWrite={false}
                    toneMapped={false}
                    blending={blending}
                />
            </sprite>

            {/* Визир: два тонких кольца, повёрнутых к камере */}
            <Billboard>
                <mesh ref={ringRef} scale={scale} raycast={() => null}>
                    <ringGeometry args={[0.38 * scale, 0.405 * scale, 64]} />
                    <meshBasicMaterial
                        color={tone}
                        transparent
                        opacity={0.4}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        toneMapped={false}
                        blending={blending}
                    />
                </mesh>
                <mesh ref={outerRingRef} scale={scale} raycast={() => null}>
                    <ringGeometry args={[0.62 * scale, 0.632 * scale, 64, 1, 0, Math.PI * 1.35]} />
                    <meshBasicMaterial
                        color={tone}
                        transparent
                        opacity={0.16}
                        side={THREE.DoubleSide}
                        depthWrite={false}
                        toneMapped={false}
                        blending={blending}
                    />
                </mesh>
            </Billboard>

            {/* Зона клика: с орбиты сама метка занимает единицы пикселей */}
            <mesh>
                <sphereGeometry args={[hitRadius, 8, 6]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>

            {/* Планета вращается вместе с метками: без Billboard подписи на
                дальнем полушарии читались бы зеркально */}
            <Billboard position={[0, labelOffset * scale, 0]}>
                <Text
                    font="/Roboto-Regular.ttf"
                    fontSize={0.3 * scale}
                    letterSpacing={0.14}
                    color={theme === 'light' ? '#1c2533' : tone}
                    fillOpacity={hovered ? 1 : 0.82}
                    anchorX="center"
                    anchorY="top"
                    outlineColor={theme === 'light' ? '#ffffff' : '#000000'}
                    outlineWidth={0.014 * scale}
                    outlineOpacity={0.6}
                    raycast={() => null}
                >
                    {reversed ? (reverseLabel || label) : label}
                </Text>
            </Billboard>
        </group>
    );
}
