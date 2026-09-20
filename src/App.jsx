import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { FACTORS_DATA } from './data/factors';
import { SHOTS, earthWorld } from './lib/journey';
import { BODY_OVERVIEW, BODY_REGIONS, bodyRegionById } from './data/body';
import Onboarding from './components/Onboarding';
import SceneVeil from './scenes/effects/SceneVeil';
import PostFX from './scenes/effects/PostFX';
import { veilPreset } from './lib/veilPresets';
import gsap from 'gsap';

const loadBigBang = () => import('./scenes/BigBang');
const loadCosmos = () => import('./scenes/Cosmos');
const loadPlanet = () => import('./scenes/Planet');
const loadMicroCosmos = () => import('./scenes/MicroCosmos');
const loadHumanBody = () => import('./scenes/HumanBody');
const loadFinale = () => import('./scenes/Finale');

const BigBang = lazy(loadBigBang);
const Cosmos = lazy(loadCosmos);
const Planet = lazy(loadPlanet);
const MicroCosmos = lazy(loadMicroCosmos);
const HumanBody = lazy(loadHumanBody);
const Finale = lazy(loadFinale);

/**
 * Порядок слоёв. Человек стоит перед клеткой: масштаб должен убывать
 * монотонно, а прежний порядок «общество → клетка → человек» проваливал
 * зрителя в микромир и возвращал обратно к телу.
 */
export const HUMAN_STAGE = 4;
export const CELL_STAGE = 5;
const FINALE_STAGE = 6;

/** Заголовки слоёв: всплывают в момент перехода, пока кадр залит вуалью. */
const STAGE_TITLES = {
    0: { kicker: 'Начало', title: 'Сингулярность' },
    1: { kicker: 'Макро-уровень', title: 'Космос' },
    2: { kicker: 'Мезо-уровень 1', title: 'Природа и стихии' },
    3: { kicker: 'Мезо-уровень 2', title: 'Общество' },
    [HUMAN_STAGE]: { kicker: 'Антропо-уровень', title: 'Человек' },
    [CELL_STAGE]: { kicker: 'Микро-уровень', title: 'Клетка и сознание' },
    [FINALE_STAGE]: { kicker: 'Путь пройден', title: 'Итог' },
};

/**
 * Ограничивает разрешение рендера на слабых машинах и следит за потерей
 * контекста WebGL: без восстановления сцена оставалась бы чёрным экраном.
 */
function RendererGuard() {
    const { gl, scene, camera, invalidate } = useThree();

    useEffect(() => {
        // В разработке отдаём рендерер наружу: так видно draw calls, число
        // треугольников и объём текстур без ручного инструментирования сцены.
        if (import.meta.env.DEV) {
            window.realityRenderer = { gl, scene, camera };
        }
    }, [gl, scene, camera]);

    useEffect(() => {
        const canvas = gl.domElement;

        const onLost = (event) => {
            // Обязательно отменяем событие, иначе браузер не станет восстанавливать контекст
            event.preventDefault();
            console.warn('WebGL-контекст потерян, ожидаем восстановления');
        };
        const onRestored = () => {
            console.warn('WebGL-контекст восстановлен');
            invalidate();
        };

        canvas.addEventListener('webglcontextlost', onLost, false);
        canvas.addEventListener('webglcontextrestored', onRestored, false);
        return () => {
            canvas.removeEventListener('webglcontextlost', onLost);
            canvas.removeEventListener('webglcontextrestored', onRestored);
        };
    }, [gl, invalidate]);

    return null;
}

/**
 * Фон сцены меняется не переключателем, а плавным переходом цвета: иначе
 * чёрный микромир и белый антропо-уровень стыкуются вспышкой на один кадр.
 */
function SceneBackground() {
    const stage = useStore((s) => s.stage);
    const { scene } = useThree();
    const target = useRef(new THREE.Color('#000000'));
    const current = useRef(new THREE.Color('#000000'));

    useEffect(() => {
        target.current.set(stage === HUMAN_STAGE ? '#e9edf4' : '#000000');
    }, [stage]);

    useEffect(() => {
        scene.background = current.current;
        return () => { scene.background = null; };
    }, [scene]);

    useFrame((_, delta) => {
        current.current.lerp(target.current, Math.min(1, delta * 1.6));
    });

    return null;
}

/** Точка, к которой камера летит на каждом слое — центр композиции кадра. */
const STAGE_SHOTS = {
    0: { pos: [0, 0, 5], look: [0, 0, 0], fov: 60 },
    1: SHOTS.cosmos,
    [HUMAN_STAGE]: BODY_OVERVIEW,
    // Точка взгляда опущена ниже центра клетки: так она сидит выше в кадре,
    // и нижние подписи не наезжают на строку интерфейса
    [CELL_STAGE]: { pos: [0, 1.2, 11.2], look: [0, -0.75, 0], fov: 58 },
    // Финал: вся нить масштабов целиком в кадре
    6: { pos: [0, -0.1, 9.6], look: [0, 0.1, 0], fov: 46 },
};

/**
 * Откуда начинается въезд в слой. Кадр открывается уже в движении: камера
 * подъезжает к финальной точке, пока вуаль сходит, — из-за этого переход
 * читается как продолжение полёта, а не как появление новой картинки.
 */
const STAGE_ENTRIES = {
    0: [0, 0, 16],
    1: [0, 34, 120],
    [HUMAN_STAGE]: [0, 1.4, 24],
    [CELL_STAGE]: [0, 3.4, 30],
    6: [0, 1.2, 26],
};

/**
 * Киношный путь камеры.
 * 1→2: пролёт к Земле в Солнечной системе, затем наезд до портрета планеты.
 * 2→3: камера стоит, Земля поворачивается к городам.
 * Остальные стыки накрыты вуалью, и камера продолжает движение сквозь неё.
 */
function JourneyCamera() {
    const stage = useStore((s) => s.stage);
    const approaching = useStore((s) => s.approachingEarth);
    const shift = useStore((s) => s.shift);
    const bodyRegion = useStore((s) => s.bodyRegion);
    const finishEarthApproach = useStore((s) => s.finishEarthApproach);
    const setFreeLook = useStore((s) => s.setFreeLook);
    const { camera } = useThree();
    const prevStage = useRef(stage);
    const prevApproach = useRef(approaching);
    const prevRegion = useRef(bodyRegion);
    const look = useRef(new THREE.Vector3(0, 0, 0));
    const aimLookAt = useRef(true);
    const unlockTimer = useRef(null);

    const tweenTo = useCallback((shot, duration, ease = 'power2.inOut', keepAim = true) => {
        gsap.killTweensOf(camera.position);
        gsap.killTweensOf(camera);
        gsap.killTweensOf(look.current);
        if (unlockTimer.current) unlockTimer.current.kill();
        aimLookAt.current = true;
        setFreeLook(false);
        camera.fov = camera.fov || 60;

        const release = () => {
            if (!keepAim) {
                aimLookAt.current = false;
                setFreeLook(true);
            }
        };

        gsap.to(camera.position, {
            x: shot.pos[0],
            y: shot.pos[1],
            z: shot.pos[2],
            duration,
            ease,
            onComplete: release,
        });
        gsap.to(look.current, { x: shot.look[0], y: shot.look[1], z: shot.look[2], duration, ease });
        gsap.to(camera, {
            fov: shot.fov,
            duration,
            ease,
            onUpdate: () => camera.updateProjectionMatrix(),
        });
        // Если позицию камеры перебьёт другой твин, onComplete мог не прийти —
        // таймер всё равно отдаёт мышь.
        unlockTimer.current = gsap.delayedCall(duration + 0.12, release);
    }, [camera, setFreeLook]);

    // Разгон в момент заливки кадра: вниз по масштабу камера ускоряется
    // «внутрь», вверх — отрывается назад. Вспышка перестаёт быть статичной.
    useEffect(() => {
        if (!shift) return undefined;
        const preset = veilPreset(shift.kind);
        // Вниз по масштабу камера падает внутрь кадра, наверх — отрывается
        // назад. Направление берём из самого перехода, а не из типа вуали:
        // одна и та же вуаль обслуживает оба направления между телом и
        // клеткой. Взрыв — исключение, он сам расталкивает камеру от центра.
        const target = shift.commit?.type === 'stage' ? shift.commit.to : null;
        const inward = shift.kind === 'bang'
            ? false
            : (target === null || target > prevStage.current);

        const dir = new THREE.Vector3().subVectors(look.current, camera.position);
        const dist = dir.length();
        if (dist < 0.001) return undefined;
        dir.normalize();

        const travel = inward ? dist * 0.55 : -dist * 0.5;
        const end = camera.position.clone().addScaledVector(dir, travel);

        gsap.killTweensOf(camera.position);
        gsap.to(camera.position, {
            x: end.x,
            y: end.y,
            z: end.z,
            duration: preset.cover,
            ease: inward ? 'power3.in' : 'power2.in',
        });
        return undefined;
        // Реагируем только на запуск нового перехода
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [shift?.token]);

    useEffect(() => {
        const from = prevStage.current;
        const wasApproaching = prevApproach.current;
        prevStage.current = stage;
        prevApproach.current = approaching;

        // Длительность въезда: пока вуаль сходит, камера должна ещё ехать
        const veil = shift ? veilPreset(shift.kind) : null;
        const arrival = veil ? veil.hold + veil.reveal + 0.35 : 1.4;

        // Пролёт к живой Земле, пока ещё видна Солнечная система
        if (approaching && !wasApproaching) {
            const earth = earthWorld.clone();
            const dir = earth.clone().normalize();
            const end = earth.clone().add(dir.multiplyScalar(3.4)).add(new THREE.Vector3(0, 1.15, 0));
            gsap.killTweensOf(camera.position);
            gsap.killTweensOf(look.current);
            gsap.killTweensOf(camera);
            if (unlockTimer.current) unlockTimer.current.kill();
            aimLookAt.current = true;
            setFreeLook(false);
            gsap.to(camera.position, {
                x: end.x,
                y: end.y,
                z: end.z,
                duration: 2.6,
                ease: 'power3.in',
            });
            gsap.to(look.current, {
                x: earth.x,
                y: earth.y,
                z: earth.z,
                duration: 1.6,
                ease: 'power2.inOut',
            });
            gsap.to(camera, {
                fov: 40,
                duration: 2.6,
                ease: 'power2.in',
                onUpdate: () => camera.updateProjectionMatrix(),
                onComplete: () => finishEarthApproach(),
            });
            return undefined;
        }

        // Космос → детальная Земля. Подмена сцены уже накрыта вуалью, поэтому
        // камеру можно поставить в стартовую точку и продолжить наезд.
        if (wasApproaching && !approaching && stage === 2) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            camera.fov = SHOTS.fromSpace.fov;
            camera.updateProjectionMatrix();
            tweenTo(SHOTS.earth, Math.max(arrival, 2.0), 'power2.out', false);
            return undefined;
        }

        if (stage === from && approaching === wasApproaching) return undefined;

        // Природа ↔ город: камера стоит, крутится планета
        if ((stage === 2 && from === 3) || (stage === 3 && from === 2)) {
            return undefined;
        }

        if ((stage === 2 || stage === 3) && from !== 2 && from !== 3 && !approaching) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            camera.fov = SHOTS.fromSpace.fov;
            camera.updateProjectionMatrix();
            tweenTo(SHOTS.earth, Math.max(arrival, 2.0), 'power2.out', false);
            return undefined;
        }

        const shot = STAGE_SHOTS[stage];
        if (!shot) return undefined;

        const entry = STAGE_ENTRIES[stage];
        if (entry && shift) {
            // Под вуалью ставим камеру в точку въезда — зритель этого не видит
            camera.position.set(...entry);
            look.current.set(...shot.look);
            camera.fov = Math.min(shot.fov + 12, 85);
            camera.updateProjectionMatrix();
        }

        tweenTo(shot, arrival, 'power2.out', false);
        return undefined;
        // shift читаем как «есть ли активная вуаль», перезапуск от него не нужен
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, approaching, camera, finishEarthApproach, setFreeLook, tweenTo]);

    // Антропо-уровень: выбор области подводит камеру к ней, сброс — возвращает
    // фигуру целиком. Отдельный эффект, потому что стадия при этом не меняется.
    useEffect(() => {
        const before = prevRegion.current;
        prevRegion.current = bodyRegion;
        if (stage !== 5 || before === bodyRegion) return undefined;

        const region = bodyRegionById(bodyRegion);
        tweenTo(region ? region.shot : BODY_OVERVIEW, region ? 1.5 : 1.7, 'power2.inOut', false);
        return undefined;
    }, [bodyRegion, stage, tweenTo]);

    useFrame(() => {
        if (aimLookAt.current) camera.lookAt(look.current);
    });

    return null;
}

export default function App() {
    // Отдельные селекторы вместо всего стора: клик по фактору больше не
    // перерисовывает дерево сцены целиком.
    const stage = useStore((s) => s.stage);
    const isExploded = useStore((s) => s.isExploded);
    const activeFactorId = useStore((s) => s.activeFactorId);
    const isReversed = useStore((s) => !!s.reversedFactors[s.activeFactorId]);
    const toggleReverse = useStore((s) => s.toggleReverse);
    const clearFactor = useStore((s) => s.clearFactor);
    const resetJourney = useStore((s) => s.resetJourney);
    const approachingEarth = useStore((s) => s.approachingEarth);
    const freeLook = useStore((s) => s.freeLook);
    const shift = useStore((s) => s.shift);
    const bodyRegion = useStore((s) => s.bodyRegion);
    const setBodyRegion = useStore((s) => s.setBodyRegion);
    const nextStage = useStore((s) => s.nextStage);

    // Сколько факторов зритель перевернул за путь — это итог, который
    // показывает финальный экран
    const reversedCount = useStore(
        (s) => Object.values(s.reversedFactors).filter(Boolean).length,
    );

    const [humanLayer, setHumanLayer] = useState('organs');
    const activeFactor = activeFactorId ? FACTORS_DATA[activeFactorId] : null;
    const shifting = !!shift;
    const activeRegion = bodyRegionById(bodyRegion);
    const bodyLook = (activeRegion?.shot ?? BODY_OVERVIEW).look;

    // Заголовок слоя, в который идёт переход
    const incomingStage = shift?.commit?.type === 'stage' ? shift.commit.to : stage;
    const title = STAGE_TITLES[incomingStage];

    const onCanvasCreated = useCallback(({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
    }, []);

    const onPointerMissed = useCallback(() => {
        const state = useStore.getState();
        if (state.activeFactorId) state.clearFactor();
        else if (state.bodyRegion) state.setBodyRegion(null);
    }, []);

    // Сцены подгружаем заранее: иначе чанк грузится в момент перехода и вместо
    // кинематографичной стыковки зритель видит спиннер Suspense.
    useEffect(() => {
        const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 400));
        const handle = idle(() => {
            loadCosmos();
            loadPlanet();
            loadMicroCosmos();
            loadHumanBody();
            loadFinale();
        });
        return () => {
            if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
        };
    }, []);

    useEffect(() => {
        // Один жест колеса/тачпада = одна стадия. Инерция тачпада иначе
        // проскакивает слой цивилизации: природа и общество делят одну планету,
        // а через 1.2с лок отпускался, пока пальцы ещё едут.
        let gestureLocked = false;
        let idleTimer = null;
        let holdUntil = 0;

        const handleWheel = (e) => {
            // Ctrl/Cmd + колесо и pinch оставляем OrbitControls как зум
            if (e.ctrlKey || e.metaKey) return;

            const state = useStore.getState();
            // Единый порог на всех слоях. Отдельный порог 320 на микро-уровне
            // отдавал колесо зуму, но реальная мышь шлёт 120 — из клетки нельзя
            // было уйти ни вперёд, ни назад, и микромир «вылезал» второй раз
            // при возврате с антропо-уровня. Зум остался на Ctrl + колесо.
            const threshold = state.stage >= 1 ? 40 : 5;
            if (Math.abs(e.deltaY) < threshold) return;

            e.preventDefault();
            e.stopPropagation();

            // Пока идёт переход, колесо не копится в очередь
            if (state.shift) return;

            if (!gestureLocked) {
                gestureLocked = true;
                const from = state.stage;

                if (e.deltaY > 0) {
                    if (from === 0 && !state.isExploded) {
                        state.triggerBang();
                    } else {
                        state.nextStage();
                    }
                } else {
                    state.prevStage();
                }

                const after = useStore.getState();
                const to = after.stage;
                let holdMs;
                if (after.approachingEarth) {
                    // Пролёт сквозь систему + вспышка атмосферы
                    holdMs = 5200;
                } else if (after.shift) {
                    const preset = veilPreset(after.shift.kind);
                    holdMs = (preset.cover + preset.hold + preset.reveal) * 1000 + 250;
                } else if (from === 2 || from === 3 || to === 2 || to === 3) {
                    // 2↔3 крутят одну планету ~2.4с
                    holdMs = 2600;
                } else {
                    holdMs = 1300;
                }
                holdUntil = performance.now() + holdMs;
            }

            const remaining = Math.max(0, holdUntil - performance.now());
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                gestureLocked = false;
            }, Math.max(remaining, 420));
        };

        window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
        return () => {
            window.removeEventListener('wheel', handleWheel, { capture: true });
            if (idleTimer) clearTimeout(idleTimer);
        };
    }, []);

    return (
        <div className={`relative w-screen h-screen overflow-hidden font-sans transition-colors duration-[1200ms] ${stage === HUMAN_STAGE ? 'bg-[#e9edf4] text-slate-950' : 'bg-black text-white'}`}>

            {/* 3D Canvas */}
            <div className="absolute inset-0">
                <Canvas
                    camera={{ position: [0, 0, 5], fov: 60, near: 0.1, far: 1400 }}
                    dpr={[1, 1.75]}
                    gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
                    onCreated={onCanvasCreated}
                    /* Клик мимо всего — выход из области тела обратно к фигуре */
                    onPointerMissed={onPointerMissed}
                >
                    <RendererGuard />
                    <SceneBackground />
                    <JourneyCamera />

                    {/* Во время киношного наезда мышь не крутит камеру.
                        На природе и в городе после кадра — тот же облёт, чтобы
                        дотянуться до факторов на краях и обратной стороне. */}
                    {isExploded && stage >= 1 && !approachingEarth && freeLook && !shifting && (
                        <OrbitControls
                            /* На теле облёт должен крутиться вокруг выбранной области.
                               С общей точкой [0,0,0] управление, перехватив камеру
                               после наезда, рывком уводило взгляд с головы в центр фигуры. */
                            key={stage === 2 || stage === 3 ? 'planet' : (stage === HUMAN_STAGE ? `body-${bodyRegion ?? 'all'}` : stage)}
                            enableZoom
                            enablePan={false}
                            zoomSpeed={stage === CELL_STAGE ? 1.05 : (stage === 2 || stage === 3 ? 0.75 : 0.6)}
                            minDistance={stage === 2 || stage === 3 ? 18 : stage === CELL_STAGE ? 1.4 : (stage === HUMAN_STAGE ? 1.6 : 5)}
                            maxDistance={stage === 2 || stage === 3 ? 90 : stage === CELL_STAGE ? 80 : (stage === HUMAN_STAGE ? 26 : 200)}
                            dampingFactor={0.08}
                            enableDamping
                            target={stage === 2 || stage === 3 ? [0, 0.4, 0] : (stage === HUMAN_STAGE ? bodyLook : [0, 0, 0])}
                            makeDefault
                        />
                    )}

                    <Suspense fallback={
                        <Html center>
                            <div className="flex flex-col items-center justify-center text-white">
                                <div className="w-8 h-8 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="tracking-[0.2em] uppercase text-xs animate-pulse text-white/70">Загрузка материи...</p>
                            </div>
                        </Html>
                    }>
                        {stage === 0 && <BigBang />}
                        {(stage === 1 || approachingEarth) && <Cosmos />}
                        {(stage === 2 || stage === 3) && !approachingEarth && <Planet />}
                        {stage === HUMAN_STAGE && <HumanBody mode={humanLayer} />}
                        {stage === CELL_STAGE && <MicroCosmos />}
                        {stage === 6 && <Finale />}
                    </Suspense>

                    {/* Вуаль рисуется последней и накрывает стык слоёв */}
                    <SceneVeil />

                    {/* На светлом антропо-уровне порог свечения поднят: иначе
                        сам фон проходит порог и размывает тело в молоко */}
                    <PostFX
                        bloomStrength={stage === HUMAN_STAGE ? 0.32 : 0.5}
                        bloomThreshold={stage === HUMAN_STAGE ? 1.15 : 0.85}
                        vignette={stage === HUMAN_STAGE ? 0.16 : 0.44}
                    />

                </Canvas>
            </div>

            {/* Титр слоя: живёт ровно столько, сколько кадр залит вуалью */}
            <div
                className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-700 ${shifting ? 'opacity-100' : 'opacity-0'}`}
            >
                {title && (
                    <>
                        <p className={`text-[11px] tracking-[0.55em] uppercase mb-3 transition-transform duration-1000 ${shifting ? 'translate-y-0' : 'translate-y-3'} ${incomingStage === 5 ? 'text-slate-900/70' : 'text-white/60'}`}>
                            {title.kicker}
                        </p>
                        <h2 className={`text-3xl md:text-5xl font-light tracking-[0.22em] uppercase transition-transform duration-1000 ${shifting ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'} ${incomingStage === 5 ? 'text-slate-900' : 'text-white'}`}>
                            {title.title}
                        </h2>
                    </>
                )}
            </div>

            <Onboarding stage={stage} hidden={shifting || !!activeFactor} light={stage === HUMAN_STAGE} />

            {/* UI Overlay */}
            <div className={`absolute bottom-10 w-full text-center pointer-events-none data-ui transition-opacity duration-500 ${shifting ? 'opacity-0' : 'opacity-100'}`}>
                {!isExploded && (
                    <p className="text-white/50 tracking-[0.3em] uppercase text-xs animate-pulse">
                        Скролль вниз для старта
                    </p>
                )}
                {stage === 1 && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2">Макрокосмос</p>
                        <p className="text-xs text-white/50">Вращай камеру, кликай на объекты. Скролль дальше.</p>
                    </div>
                )}
                {stage === 2 && approachingEarth && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2">Приближение к Земле</p>
                        <p className="text-xs text-white/40">Камера входит в систему. Планета растёт в кадре.</p>
                    </div>
                )}
                {stage === 2 && !approachingEarth && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2">
                            Мезо-уровень 1: Природа и Стихии
                        </p>
                        <p className="text-xs text-white/40">Вращай планету, кликай на факторы. Скролль дальше — Земля повернётся к городам.</p>
                    </div>
                )}
                {stage === 3 && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2 text-yellow-500">
                            Мезо-уровень 2: Общество и Цивилизация
                        </p>
                        <p className="text-xs text-white/40">Вращай планету, кликай на факторы. Скролль дальше — к человеку.</p>
                    </div>
                )}
                {stage === CELL_STAGE && (
                    <div className="text-white/70 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-sm mb-2 text-fuchsia-400">
                            Микро-уровень: Рождение Сознания
                        </p>
                        <p className="text-xs text-white/40 mb-4 font-light">
                            Внутри клеток и синапсов. Скролль дальше — к итогу пути. Ctrl + колесо приближает.
                        </p>
                        <button
                            onClick={nextStage}
                            className="px-5 py-2 border border-fuchsia-300/40 rounded-full text-xs uppercase tracking-wider text-fuchsia-100 hover:bg-fuchsia-300 hover:text-black transition-colors"
                        >
                            К итогу
                        </button>
                    </div>
                )}
                {stage === HUMAN_STAGE && (
                    <div className="text-slate-700 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-sm mb-2 text-rose-600">
                            {activeRegion
                                ? `Антропо-уровень: ${activeRegion.title}`
                                : 'Антропо-уровень: Тело, Эмоции, Личность'}
                        </p>
                        {humanLayer === 'organs' && (
                            <p className="text-xs text-slate-500 mb-3">
                                {activeRegion
                                    ? 'Кликай по факторам области. Пустое место — назад к фигуре.'
                                    : 'Наведи курсор на часть тела и кликни — раскроются её факторы.'}
                            </p>
                        )}
                        {humanLayer === 'organs' && (
                            <div className="inline-flex flex-wrap items-center justify-center gap-1 mb-3">
                                {BODY_REGIONS.map((region) => (
                                    <button
                                        key={region.id}
                                        onClick={() => setBodyRegion(bodyRegion === region.id ? null : region.id)}
                                        className={`px-3 py-1 rounded-full border text-[11px] uppercase tracking-wider transition-colors ${bodyRegion === region.id
                                            ? 'border-cyan-500 bg-cyan-500 text-white'
                                            : 'border-slate-300 bg-white/70 text-slate-500 hover:text-slate-950'}`}
                                    >
                                        {region.title}
                                    </button>
                                ))}
                                {bodyRegion && (
                                    <button
                                        onClick={() => setBodyRegion(null)}
                                        className="px-3 py-1 rounded-full border border-slate-300 bg-white/70 text-[11px] uppercase tracking-wider text-slate-500 hover:text-slate-950 transition-colors"
                                    >
                                        ← Всё тело
                                    </button>
                                )}
                            </div>
                        )}
                        <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-full border border-slate-300 bg-white/75 shadow-sm backdrop-blur-md">
                            <button
                                onClick={() => setHumanLayer('organs')}
                                className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider transition-colors ${humanLayer === 'organs' ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:text-slate-950'}`}
                            >
                                Органы
                            </button>
                            <button
                                onClick={() => setHumanLayer('emotions')}
                                className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider transition-colors ${humanLayer === 'emotions' ? 'bg-rose-500 text-white' : 'text-slate-500 hover:text-slate-950'}`}
                            >
                                Эмоции
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">Скролль дальше — в клетку.</p>
                    </div>
                )}
                {stage === FINALE_STAGE && (
                    <div className="animate-fade-in relative z-50 pointer-events-auto max-w-xl mx-auto px-6">
                        <p className="tracking-[0.45em] uppercase text-[10px] mb-4 text-white/35">
                            Путь пройден
                        </p>
                        <p className="text-sm text-white/65 leading-relaxed mb-3">
                            Шесть масштабов — от сингулярности до собственного тела.
                            Везде работали одни и те же факторы, только под разными именами.
                        </p>
                        <p className="text-sm text-cyan-200/80 mb-5">
                            {reversedCount > 0
                                ? `Ты перевернул факторов: ${reversedCount}. Реальность осталась собранной.`
                                : 'Ты не перевернул ни одного фактора. Пройди снова и попробуй — мир соберётся иначе.'}
                        </p>
                        <p className="text-base text-white/90 italic mb-6">
                            «Я не просто изучаю вселенную. Я её активирую.»
                        </p>
                        <button
                            onClick={resetJourney}
                            className="px-6 py-2 border border-white/30 rounded-full text-xs uppercase tracking-wider text-white/70 hover:bg-white hover:text-black transition-colors"
                        >
                            Пройти путь снова
                        </button>
                    </div>
                )}
            </div>

            {/* Factor Tooltip Modal */}
            {activeFactor && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/85 border border-white/20 p-8 rounded-2xl max-w-lg z-[100] text-left pointer-events-auto backdrop-blur-md shadow-[0_0_50px_rgba(255,255,255,0.1)] transition-all animate-fade-in flex flex-col gap-4">

                    <h3 className={`text-2xl font-bold uppercase tracking-widest ${isReversed ? 'text-cyan-400' : 'text-fuchsia-400'}`}>
                        {isReversed ? activeFactor.reverseName : activeFactor.name}
                    </h3>

                    <p className="text-base text-white/90 leading-relaxed">
                        {isReversed ? activeFactor.reverseDescription : activeFactor.description}
                    </p>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10 mt-2">
                        <span className="text-xs text-white/50 uppercase tracking-wider block mb-1">Природа фактора:</span>
                        <p className="text-sm text-yellow-100/80 italic">
                            {activeFactor.influence}
                        </p>
                    </div>

                    <div className="flex justify-between items-center border-t border-white/20 pt-5 mt-2">
                        <button
                            onClick={toggleReverse}
                            className={`text-sm font-bold uppercase tracking-widest transition-colors px-4 py-2 rounded border ${isReversed ? 'border-fuchsia-400 text-fuchsia-400 hover:bg-fuchsia-400 hover:text-black' : 'border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black'}`}
                        >
                            Включить {isReversed ? activeFactor.name : activeFactor.reverseName}
                        </button>
                        <button
                            onClick={clearFactor}
                            className="text-sm text-white/50 hover:text-white uppercase tracking-widest transition-colors px-4 py-2"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
