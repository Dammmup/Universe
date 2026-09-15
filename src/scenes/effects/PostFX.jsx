import { useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Финальный проход: виньетка, лёгкое расхождение каналов к краям и зерно.
 * Всё вместе даёт след настоящей оптики — без него кадр выглядит как рендер
 * без камеры: равномерно резкий и равномерно чистый до самых углов.
 */
const FilmShader = {
    uniforms: {
        tDiffuse: { value: null },
        uVignette: { value: 0.44 },
        uAberration: { value: 0.0016 },
        uGrain: { value: 0.028 },
        uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform float uVignette;
        uniform float uAberration;
        uniform float uGrain;
        uniform float uTime;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }

        void main() {
            vec2 centered = vUv - 0.5;
            float r2 = dot(centered, centered);

            // Хроматическая аберрация растёт к краям, как у реального объектива
            vec2 shift = centered * r2 * uAberration * 4.0;
            vec4 color;
            color.r = texture2D(tDiffuse, vUv + shift).r;
            color.g = texture2D(tDiffuse, vUv).g;
            color.b = texture2D(tDiffuse, vUv - shift).b;
            color.a = 1.0;

            // Виньетка
            color.rgb *= 1.0 - uVignette * smoothstep(0.18, 0.75, r2);

            // Зерно: снимает банды на градиентах неба и атмосферы
            float grain = (hash(vUv * 1024.0 + uTime) - 0.5) * uGrain;
            color.rgb += grain * (0.35 + 0.65 * (1.0 - r2));

            gl_FragColor = color;
        }
    `,
};

/**
 * Постобработка на родных проходах three.
 *
 * Свечение — единственное, что отличает «модель с эмиссивным материалом» от
 * источника света в кадре: без него солнце, огни городов, полярное сияние и
 * синапсы читаются как плоские цветные пятна.
 *
 * @react-three/postprocessing 2.16 здесь не годится: он импортирует
 * WebGLMultipleRenderTargets, которого в three 0.183 уже нет.
 */
export default function PostFX({
    bloomStrength = 0.5,
    bloomRadius = 0.58,
    bloomThreshold = 0.85,
    vignette = 0.44,
}) {
    const gl = useThree((s) => s.gl);
    const scene = useThree((s) => s.scene);
    const camera = useThree((s) => s.camera);
    const size = useThree((s) => s.size);
    const [enabled, setEnabled] = useState(true);

    // Восстановленный контекст с чужими буферами даёт чёрный экран: цепочку
    // проходов после потери контекста не поднимаем, картинка важнее эффекта.
    useEffect(() => {
        const canvas = gl.domElement;
        const onLost = () => setEnabled(false);
        canvas.addEventListener('webglcontextlost', onLost, false);
        return () => canvas.removeEventListener('webglcontextlost', onLost);
    }, [gl]);

    // Композер собирается один раз: пересборка цепочки проходов при каждой
    // смене настроек свечения роняла бы буферы посреди перехода между слоями.
    const composer = useMemo(() => {
        if (!enabled) return null;

        const instance = new EffectComposer(gl);
        instance.addPass(new RenderPass(scene, camera));

        const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.58, 0.85);
        instance.addPass(bloom);

        const film = new ShaderPass(FilmShader);
        instance.addPass(film);

        // OutputPass приводит линейный кадр к sRGB и накладывает тонмаппинг
        instance.addPass(new OutputPass());

        instance.filmPass = film;
        instance.bloomPass = bloom;
        return instance;
    }, [enabled, gl, scene, camera]);

    useEffect(() => {
        const bloom = composer?.bloomPass;
        if (!bloom) return;
        bloom.strength = bloomStrength;
        bloom.radius = bloomRadius;
        bloom.threshold = bloomThreshold;
    }, [composer, bloomStrength, bloomRadius, bloomThreshold]);

    useEffect(() => () => composer?.dispose(), [composer]);

    // Счётчики рендера сбрасываются перед каждым проходом, и наружу попадала
    // статистика последнего полноэкранного квада — один draw call на всю сцену.
    // Берём сброс на себя: тогда в gl.info копится сумма по всем проходам.
    useEffect(() => {
        if (!composer) return undefined;
        gl.info.autoReset = false;
        return () => { gl.info.autoReset = true; };
    }, [composer, gl]);

    useEffect(() => {
        if (!composer) return;
        composer.setPixelRatio(Math.min(gl.getPixelRatio(), 1.75));
        composer.setSize(size.width, size.height);
    }, [composer, gl, size]);

    // priority > 0 отключает собственный рендер R3F — кадр идёт через композер
    useFrame((state, delta) => {
        if (!composer) return;
        const film = composer.filmPass;
        if (film) {
            film.uniforms.uTime.value = state.clock.elapsedTime;
            // Виньетку ведём плавно: на светлом слое затемнение по краям
            // читается кольцом, и мгновенное переключение бросается в глаза
            const v = film.uniforms.uVignette;
            v.value += (vignette - v.value) * Math.min(1, delta * 2);
        }
        gl.info.reset();
        composer.render(delta);
    }, 1);

    return null;
}
