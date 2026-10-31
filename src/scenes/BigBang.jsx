import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { useStore } from '../store';
import { circleSprite } from '../lib/sprites';

const PARTICLES = 32000;
// Скоплений, из которых потом «вырастут» галактики, и нитей между ними
const CLUSTERS = 36;
const FILAMENTS = 28;
// Разлёт тормозит экспоненциально: v·e^(-k·t), путь — v·(1 − e^(-k·t))/k
const DRAG = 1.2;
const REACH = 15 / DRAG;

/**
 * Движение целиком в вершинном шейдере: раньше процессор каждый кадр
 * переписывал 20 000 позиций и отправлял буфер на видеокарту заново. Здесь
 * позиция — функция времени, и кадр стоит одну запись uniform.
 *
 * Цвет — температура: в первые доли секунды вещество белое, затем
 * желтеет, краснеет и остывает до холодного сине-фиолетового фона.
 * Горячие частицы крупнее, поэтому вспышку подхватывает свечение.
 */
const particleVertex = /* glsl */ `
    uniform float uTime;
    uniform float uScale;
    uniform float uSize;
    attribute vec3 aDir;
    attribute vec4 aRnd;   // скорость, яркость, фаза, жар
    attribute vec3 aCold;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        float t = uTime;
        float travel = aRnd.x * ${REACH.toFixed(3)} * (1.0 - exp(-${DRAG.toFixed(2)} * t));
        vec3 p = aDir * travel;
        // Неоднородность: вещество чуть закручивается, а не летит по лучам
        float swirl = 1.0 - exp(-t * 0.9);
        p += sin(p.yzx * 0.21 + aRnd.z * 6.283) * 0.9 * swirl;

        float heat = exp(-t * 1.25 * aRnd.w);
        vec3 hot = mix(vec3(1.0, 0.42, 0.12), vec3(1.0, 0.96, 0.88), smoothstep(0.35, 0.95, heat));
        vColor = mix(aCold, hot, smoothstep(0.04, 0.55, heat)) * (0.8 + heat * 2.6);
        vAlpha = 0.35 + 0.65 * aRnd.y;

        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = uSize * (0.55 + aRnd.y * 0.9) * (1.0 + heat * 1.8);
        float px = size * uScale / max(0.001, -mv.z);
        // Мельче полутора пикселей точка мерцает при движении — вместо
        // уменьшения гасим её яркость
        vAlpha *= clamp(px / 1.5, 0.0, 1.0);
        gl_PointSize = max(px, 1.5);
    }
`;

const particleFragment = /* glsl */ `
    uniform float uFade;
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        float a = exp(-d * d * 3.5) * (1.0 - d);
        gl_FragColor = vec4(vColor * a * vAlpha * uFade, 1.0);
    }
`;

// Ударная волна: тонкое кольцо, которое обгоняет вещество и тает
const ringVertex = /* glsl */ `
    varying vec2 vPos;
    void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const ringFragment = /* glsl */ `
    uniform float uRadius;
    uniform float uWidth;
    uniform float uAlpha;
    varying vec2 vPos;
    void main() {
        float d = length(vPos);
        float x = (d - uRadius) / uWidth;
        // Резкий передний фронт и длинный остывающий шлейф внутрь
        float ring = x > 0.0 ? exp(-x * x * 6.0) : exp(x * 1.3);
        vec3 col = mix(vec3(0.55, 0.7, 1.0), vec3(1.0, 0.93, 0.85), exp(-x * x * 4.0));
        gl_FragColor = vec4(col * ring * uAlpha, 1.0);
    }
`;

function gauss() {
    return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
}

function randomDir(out) {
    const theta = Math.random() * Math.PI * 2;
    const z = Math.random() * 2 - 1;
    const r = Math.sqrt(1 - z * z);
    return out.set(r * Math.cos(theta), r * Math.sin(theta), z);
}

/**
 * Начальные направления: половина вещества собирается в сгустки, часть
 * вытягивается нитями между ними, остальное — однородный фон. Через пару
 * секунд разлёта это читается как зародыш крупномасштабной структуры —
 * узлы и нити, из которых в следующем слое вырастают галактики.
 */
function buildParticles() {
    const dir = new Float32Array(PARTICLES * 3);
    const rnd = new Float32Array(PARTICLES * 4);
    const cold = new Float32Array(PARTICLES * 3);

    const centers = [];
    const v = new THREE.Vector3();
    for (let c = 0; c < CLUSTERS; c++) {
        centers.push(randomDir(new THREE.Vector3()).multiplyScalar(1.4 + Math.random() * 2.1));
    }
    const links = [];
    for (let f = 0; f < FILAMENTS; f++) {
        const a = centers[f % CLUSTERS];
        let best = null;
        let bestD = Infinity;
        for (const b of centers) {
            if (b === a) continue;
            const d = a.distanceTo(b) * (0.7 + Math.random() * 0.6);
            if (d < bestD) { bestD = d; best = b; }
        }
        links.push([a, best]);
    }

    const color = new THREE.Color();
    for (let i = 0; i < PARTICLES; i++) {
        const roll = Math.random();
        let brightness = Math.random();
        if (roll < 0.42) {
            const c = centers[(Math.random() * CLUSTERS) | 0];
            v.set(c.x + gauss() * 0.22, c.y + gauss() * 0.22, c.z + gauss() * 0.22);
            brightness = 0.4 + brightness * 0.6;
        } else if (roll < 0.6) {
            const [a, b] = links[(Math.random() * FILAMENTS) | 0];
            v.lerpVectors(a, b, Math.random());
            v.x += gauss() * 0.09;
            v.y += gauss() * 0.09;
            v.z += gauss() * 0.09;
        } else {
            randomDir(v).multiplyScalar(0.5 + Math.random() * 3.2);
            brightness *= 0.7;
        }
        const speed = v.length();
        v.divideScalar(speed);
        dir[i * 3] = v.x;
        dir[i * 3 + 1] = v.y;
        dir[i * 3 + 2] = v.z;

        rnd[i * 4] = speed;
        rnd[i * 4 + 1] = brightness;
        rnd[i * 4 + 2] = Math.random();
        // Быстрые частицы остывают быстрее: внешний фронт синеет первым
        rnd[i * 4 + 3] = 0.7 + speed * 0.18 + Math.random() * 0.3;

        // Остывшее вещество: холодный синий с примесью фиолетового и
        // редкими тёплыми искрами — будущими звёздами
        if (Math.random() < 0.06) color.setHSL(0.08 + Math.random() * 0.05, 0.9, 0.62);
        else color.setHSL(0.58 + Math.random() * 0.17, 0.7, 0.55 + Math.random() * 0.25);
        cold[i * 3] = color.r;
        cold[i * 3 + 1] = color.g;
        cold[i * 3 + 2] = color.b;
    }
    return { dir, rnd, cold };
}

export default function BigBang() {
    const isExploded = useStore((s) => s.isExploded);
    const triggerBang = useStore((s) => s.triggerBang);
    const beginShift = useStore((s) => s.beginShift);
    const { camera } = useThree();

    const pointsRef = useRef();
    const seedRef = useRef();
    const haloRef = useRef();
    const fireRef = useRef();
    const flash = useRef(0);
    const bangAt = useRef(null);
    const halo = useMemo(() => circleSprite(), []);

    const { dir, rnd, cold } = useMemo(() => buildParticles(), []);
    // Позиции не используются шейдером, но нужны three для границ и drawRange
    const positions = useMemo(() => new Float32Array(PARTICLES * 3), []);

    const particleUniforms = useMemo(() => ({
        uTime: { value: 0 },
        uScale: { value: 400 },
        uSize: { value: 0.22 },
        uFade: { value: 1 },
    }), []);
    const ringUniforms = useMemo(() => ({
        uRadius: { value: 0 },
        uWidth: { value: 1 },
        uAlpha: { value: 0 },
    }), []);

    // До взрыва облака частиц нет вовсе: сингулярность — одна маленькая
    // белая точка (seedRef)
    useEffect(() => {
        const geometry = pointsRef.current?.geometry;
        if (!geometry) return;
        geometry.setDrawRange(0, isExploded ? PARTICLES : 0);
        // Шейдер уносит точки далеко от нуля: без широкой сферы границ
        // three отсекал бы облако целиком, пока камера смотрит в центр
        geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 80);
    }, [isExploded]);

    const hasExploded = useRef(false);
    const bangTween = useRef(null);

    useEffect(() => {
        if (isExploded && !hasExploded.current) {
            hasExploded.current = true;
            // Камера отлетает назад вместе с фронтом вещества
            bangTween.current = gsap.to(camera.position, {
                z: 50,
                duration: 3.4,
                ease: 'power3.out',
                onComplete: () => {
                    // Ударная волна выбеливает кадр, и уже под вспышкой сцена
                    // сменяется на макро-уровень
                    if (useStore.getState().stage === 0) {
                        beginShift('bang', { type: 'stage', to: 1 });
                    }
                },
            });
        }
        // Гасим только свой твин. killTweensOf(camera.position) при размонтаже
        // убивал бы и въезд в следующий слой: сцены снимаются с задержкой
        // Suspense, уже после того, как камера получила новую траекторию.
        return () => { bangTween.current?.kill(); };
    }, [isExploded, camera, beginShift]);

    // Клик по точке — на случай, если пользователь кликнул вместо скролла
    const handlePointerDown = () => {
        if (!isExploded) triggerBang();
    };

    useFrame((state, delta) => {
        const t = state.clock.elapsedTime;
        if (isExploded && bangAt.current === null) bangAt.current = t;
        const since = bangAt.current === null ? 0 : t - bangAt.current;

        // Точка едва заметно дышит: живая, но не мигает и не зовёт к себе
        // громче подсказки внизу. В момент взрыва её ореол вспыхивает и тает.
        if (isExploded) flash.current = Math.min(1, flash.current + delta * 4);
        const f = flash.current;
        const breathe = Math.sin(t * 1.6);
        if (seedRef.current) seedRef.current.scale.setScalar((1 + 0.08 * breathe) * (1 - f));
        if (haloRef.current) {
            haloRef.current.scale.setScalar(0.15 + 0.02 * breathe + f * f * 6);
            haloRef.current.material.opacity = (0.55 + 0.1 * breathe) * (f > 0 ? Math.max(0, 1 - f) * 1.6 : 1);
        }

        // Огненный шар: раздувается быстрее вещества и гаснет за секунду
        if (fireRef.current) {
            const k = 1 - Math.exp(-since * 2.4);
            fireRef.current.visible = isExploded && since < 2.2;
            fireRef.current.scale.setScalar(1 + k * 34);
            fireRef.current.material.opacity = isExploded ? Math.exp(-since * 2.1) * 0.9 : 0;
        }

        if (!isExploded) return;

        const fov = THREE.MathUtils.degToRad(camera.fov ?? 50);
        particleUniforms.uTime.value = since;
        particleUniforms.uScale.value = (state.size.height * state.gl.getPixelRatio()) / (2 * Math.tan(fov / 2));
        // Ближе к концу облако тускнеет, чтобы вспышка перехода не была
        // наложением двух ярких кадров
        particleUniforms.uFade.value = 1 - THREE.MathUtils.smoothstep(since, 2.4, 3.6) * 0.5;

        // Фронт уходит за край кадра: кольцо, застывшее по рамке, читалось
        // как виньетка объектива, а не как волна
        const rk = 1 - Math.exp(-since * 1.1);
        ringUniforms.uRadius.value = rk * 95;
        ringUniforms.uWidth.value = 0.6 + rk * 4;
        ringUniforms.uAlpha.value = Math.exp(-since * 1.7) * Math.min(1, since * 8) * 0.9;
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
            <sprite ref={fireRef} visible={false} raycast={() => null}>
                <spriteMaterial map={halo} color="#ffe6c4" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
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

            {isExploded && (
                <mesh raycast={() => null} renderOrder={-1}>
                    <planeGeometry args={[220, 220]} />
                    <shaderMaterial
                        vertexShader={ringVertex}
                        fragmentShader={ringFragment}
                        uniforms={ringUniforms}
                        transparent
                        depthWrite={false}
                        blending={THREE.AdditiveBlending}
                        toneMapped={false}
                    />
                </mesh>
            )}

            <points ref={pointsRef} raycast={() => null} frustumCulled={false}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={PARTICLES} array={positions} itemSize={3} />
                    <bufferAttribute attach="attributes-aDir" count={PARTICLES} array={dir} itemSize={3} />
                    <bufferAttribute attach="attributes-aRnd" count={PARTICLES} array={rnd} itemSize={4} />
                    <bufferAttribute attach="attributes-aCold" count={PARTICLES} array={cold} itemSize={3} />
                </bufferGeometry>
                <shaderMaterial
                    vertexShader={particleVertex}
                    fragmentShader={particleFragment}
                    uniforms={particleUniforms}
                    transparent
                    depthWrite={false}
                    blending={THREE.AdditiveBlending}
                    toneMapped={false}
                />
            </points>
        </group>
    );
}
