import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../../store';
import { veilFragment, veilVertex } from '../../lib/shaders/veil';
import { veilPreset } from '../../lib/veilPresets';


const FORWARD = new THREE.Vector3();

/**
 * Полноэкранная вуаль. Плоскость не висит в сцене, а каждый кадр
 * переставляется вплотную к камере: так она накрывает кадр при любом ракурсе,
 * а depthTest = false держит её поверх всей геометрии.
 */
export default function SceneVeil() {
    const shift = useStore((s) => s.shift);
    const commitShift = useStore((s) => s.commitShift);
    const endShift = useStore((s) => s.endShift);
    const meshRef = useRef();
    const { camera, invalidate } = useThree();

    const uniforms = useMemo(() => ({
        uProgress: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1.6 },
        uStreaks: { value: 0.8 },
        uGrain: { value: 0.025 },
        uCoreColor: { value: new THREE.Color('#ffffff') },
        uEdgeColor: { value: new THREE.Color('#101820') },
    }), []);

    useEffect(() => {
        if (!shift) return undefined;

        const preset = veilPreset(shift.kind);
        uniforms.uCoreColor.value.set(preset.core);
        uniforms.uEdgeColor.value.set(preset.edge);
        uniforms.uStreaks.value = preset.streaks;
        uniforms.uGrain.value = preset.grain;

        const tl = gsap.timeline();
        tl.to(uniforms.uProgress, {
            value: 1,
            duration: preset.cover,
            ease: preset.coverEase,
            onUpdate: invalidate,
        });
        // Подмена содержимого кадра происходит под непрозрачной заливкой
        tl.call(() => commitShift());
        tl.to(uniforms.uProgress, {
            value: 0,
            duration: preset.reveal,
            ease: preset.revealEase,
            delay: preset.hold,
            onUpdate: invalidate,
        });
        tl.call(() => endShift());

        return () => {
            tl.kill();
        };
    }, [shift, uniforms, commitShift, endShift, invalidate]);

    useFrame((state) => {
        const mesh = meshRef.current;
        if (!mesh) return;

        const visible = uniforms.uProgress.value > 0.001;
        mesh.visible = visible;
        if (!visible) return;

        uniforms.uTime.value = state.clock.elapsedTime;
        uniforms.uAspect.value = camera.aspect || 1.6;

        // Плоскость ровно по фрустуму на ближней дистанции
        const dist = camera.near * 2.5 + 0.05;
        const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * dist;
        camera.getWorldDirection(FORWARD);
        mesh.position.copy(camera.position).addScaledVector(FORWARD, dist);
        mesh.quaternion.copy(camera.quaternion);
        mesh.scale.set(height * (camera.aspect || 1.6) * 1.12, height * 1.12, 1);
    });

    return (
        <mesh ref={meshRef} renderOrder={9999} frustumCulled={false} visible={false} raycast={() => null}>
            <planeGeometry args={[1, 1]} />
            <shaderMaterial
                vertexShader={veilVertex}
                fragmentShader={veilFragment}
                uniforms={uniforms}
                transparent
                depthTest={false}
                depthWrite={false}
                toneMapped={false}
            />
        </mesh>
    );
}
