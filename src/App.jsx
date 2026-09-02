import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { FACTORS_DATA } from './data/factors';
import { SHOTS, earthWorld } from './lib/journey';
import gsap from 'gsap';

const BigBang = lazy(() => import('./scenes/BigBang'));
const Cosmos = lazy(() => import('./scenes/Cosmos'));
const Planet = lazy(() => import('./scenes/Planet'));
const MicroCosmos = lazy(() => import('./scenes/MicroCosmos'));
const HumanBody = lazy(() => import('./scenes/HumanBody'));

/**
 * Ограничивает разрешение рендера на слабых машинах и следит за потерей
 * контекста WebGL: без восстановления сцена оставалась бы чёрным экраном.
 */
function RendererGuard() {
    const { gl, scene, invalidate } = useThree();

    useEffect(() => {
        // В разработке отдаём рендерер наружу: так видно draw calls, число
        // треугольников и объём текстур без ручного инструментирования сцены.
        if (import.meta.env.DEV) {
            window.realityRenderer = { gl, scene };
        }
    }, [gl, scene]);

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
 * Киношный путь камеры.
 * 1→2: пролёт к Земле в Солнечной системе, затем наезд на природу.
 * 2→3: боковой сдвиг кадра к городам, планета не крутится.
 */
function JourneyCamera() {
    const stage = useStore((s) => s.stage);
    const approaching = useStore((s) => s.approachingEarth);
    const finishEarthApproach = useStore((s) => s.finishEarthApproach);
    const { camera } = useThree();
    const prevStage = useRef(stage);
    const prevApproach = useRef(approaching);
    const look = useRef(new THREE.Vector3(0, 0, 0));
    const aimLookAt = useRef(true);

    useEffect(() => {
        const from = prevStage.current;
        const wasApproaching = prevApproach.current;
        prevStage.current = stage;
        prevApproach.current = approaching;

        const tweenTo = (shot, duration, ease = 'power2.inOut', keepAim = true) => {
            gsap.killTweensOf(camera.position);
            gsap.killTweensOf(camera);
            gsap.killTweensOf(look.current);
            aimLookAt.current = true;
            camera.fov = camera.fov || 60;
            gsap.to(camera.position, {
                x: shot.pos[0],
                y: shot.pos[1],
                z: shot.pos[2],
                duration,
                ease,
                onComplete: () => {
                    if (!keepAim) aimLookAt.current = false;
                },
            });
            gsap.to(look.current, { x: shot.look[0], y: shot.look[1], z: shot.look[2], duration, ease });
            gsap.to(camera, {
                fov: shot.fov,
                duration,
                ease,
                onUpdate: () => camera.updateProjectionMatrix(),
            });
        };

        // Пролёт к живой Земле, пока ещё видна Солнечная система
        if (approaching && !wasApproaching) {
            const earth = earthWorld.clone();
            const dir = earth.clone().normalize();
            const end = earth.clone().add(dir.multiplyScalar(3.4)).add(new THREE.Vector3(0, 1.15, 0));
            gsap.killTweensOf(camera.position);
            gsap.killTweensOf(look.current);
            gsap.killTweensOf(camera);
            aimLookAt.current = true;
            gsap.to(camera.position, {
                x: end.x,
                y: end.y,
                z: end.z,
                duration: 2.35,
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
                fov: 42,
                duration: 2.35,
                ease: 'power2.in',
                onUpdate: () => camera.updateProjectionMatrix(),
                onComplete: () => {
                    camera.position.set(...SHOTS.fromSpace.pos);
                    look.current.set(...SHOTS.fromSpace.look);
                    camera.fov = SHOTS.fromSpace.fov;
                    camera.updateProjectionMatrix();
                    finishEarthApproach();
                },
            });
            return undefined;
        }

        // Смена сцены: космос → детальная Земля. Кадр уже заполнен планетой,
        // поэтому стартуем с близкого ракурса «из космоса» и сразу наезжаем на природу.
        if (wasApproaching && !approaching && stage === 2) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            camera.fov = SHOTS.fromSpace.fov;
            camera.updateProjectionMatrix();
            tweenTo(SHOTS.nature, 2.6, 'power2.out');
            return undefined;
        }

        if (stage === from && approaching === wasApproaching) return undefined;

        if (stage === 2 && from === 3) {
            tweenTo(SHOTS.nature, 2.35);
            return undefined;
        }
        if (stage === 3 && from === 2) {
            tweenTo(SHOTS.city, 2.45);
            return undefined;
        }

        if (stage === 2 && from !== 2 && !approaching) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            tweenTo(SHOTS.nature, 2.2, 'power2.out');
            return undefined;
        }
        if (stage === 3 && from !== 3 && from !== 2) {
            camera.position.set(...SHOTS.city.pos);
            look.current.set(...SHOTS.city.look);
            camera.fov = SHOTS.city.fov;
            camera.updateProjectionMatrix();
            return undefined;
        }

        const fallback = {
            0: { pos: [0, 0, 5], look: [0, 0, 0], fov: 60 },
            1: SHOTS.cosmos,
            4: { pos: [0, 1.4, 9], look: [0, 0, 0], fov: 60 },
            5: { pos: [0, 0.35, 8.5], look: [0, 0, 0], fov: 60 },
        };
        const shot = fallback[stage];
        if (!shot) return undefined;

        if (stage === 4 && from === 3) camera.position.set(0, 0, 35);
        else if (stage === 4 && from === 5) camera.position.set(0, 0, 18);
        else if (stage === 5 && from === 4) camera.position.set(0, 0, 12);

        tweenTo(shot, stage === 4 || from === 4 ? 1.5 : 1.3, 'power2.inOut', false);
        return undefined;
    }, [stage, approaching, camera, finishEarthApproach]);

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
    const nextStage = useStore((s) => s.nextStage);

    const [humanLayer, setHumanLayer] = useState('organs');
    const activeFactor = activeFactorId ? FACTORS_DATA[activeFactorId] : null;

    const onCanvasCreated = useCallback(({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
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
            const threshold = state.stage === 4 ? 320 : (state.stage >= 1 ? 40 : 5);
            if (Math.abs(e.deltaY) < threshold) return;

            e.preventDefault();
            e.stopPropagation();

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

                const to = useStore.getState().stage;
                // 2↔3 крутят одну планету ~2.2с: без паузы следующий жест уносит в микромир
                const holdMs = (from === 1 && to === 2)
                    ? 5000
                    : ((from === 2 || from === 3 || to === 2 || to === 3) ? 2600 : 1300);
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
        <div className={`relative w-screen h-screen overflow-hidden font-sans transition-colors duration-500 ${stage === 5 ? 'bg-white text-slate-950' : 'bg-black text-white'}`}>

            {/* 3D Canvas */}
            <div className="absolute inset-0">
                <Canvas
                    camera={{ position: [0, 0, 5], fov: 60, near: 0.1, far: 1400 }}
                    dpr={[1, 1.75]}
                    gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
                    onCreated={onCanvasCreated}
                >
                    <color attach="background" args={[stage === 5 ? '#ffffff' : '#000000']} />

                    <RendererGuard />
                    <JourneyCamera />

                    {/* На природе и в городе кадр держит режиссёрская камера,
                        иначе OrbitControls сбивает наезд и боковой сдвиг */}
                    {isExploded && stage >= 1 && stage !== 2 && stage !== 3 && !approachingEarth && (
                        <OrbitControls
                            key={stage}
                            enableZoom={true}
                            enablePan={false}
                            zoomSpeed={stage === 4 ? 1.05 : 0.6}
                            minDistance={stage === 4 ? 1.4 : 5}
                            maxDistance={stage === 4 ? 80 : 200}
                            dampingFactor={0.08}
                            enableDamping
                            target={[0, 0, 0]}
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
                        {stage === 4 && <MicroCosmos />}
                        {stage === 5 && <HumanBody mode={humanLayer} />}
                    </Suspense>

                </Canvas>
            </div>

            {/* UI Overlay */}
            <div className="absolute bottom-10 w-full text-center pointer-events-none data-ui">
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
                        <p className="text-xs text-white/40">Горы, леса, облака. Скролль дальше — сдвиг к городам.</p>
                    </div>
                )}
                {stage === 3 && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2 text-yellow-500">
                            Мезо-уровень 2: Общество и Цивилизация
                        </p>
                        <p className="text-xs text-white/40">Улицы и небоскрёбы. Взгляд смещён вдоль планеты.</p>
                    </div>
                )}
                {stage === 4 && (
                    <div className="text-white/70 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-sm mb-2 text-fuchsia-400">
                            Микро-уровень: Рождение Сознания
                        </p>
                        <p className="text-xs text-white/40 mb-4 font-light">
                            Внутри клеток и синапсов. Колесо мыши приближает факторы.
                        </p>
                        <button
                            onClick={nextStage}
                            className="px-5 py-2 border border-fuchsia-300/40 rounded-full text-xs uppercase tracking-wider text-fuchsia-100 hover:bg-fuchsia-300 hover:text-black transition-colors"
                        >
                            К человеку
                        </button>
                    </div>
                )}
                {stage === 5 && (
                    <div className="text-slate-700 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-sm mb-2 text-rose-600">
                            Антропо-уровень: Тело, Эмоции, Личность
                        </p>
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
                        <button
                            onClick={resetJourney}
                            className="px-6 py-2 border border-slate-300 rounded-full text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-950 hover:text-white transition-colors"
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
