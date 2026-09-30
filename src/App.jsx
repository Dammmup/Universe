import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, PerformanceMonitor } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from './store';
import { locationById } from './data/locations';
import { STAGE, STAGE_TITLES, isEarthStage } from './lib/stages';
import { SHOTS, earthWorld } from './lib/journey';
import { BODY_OVERVIEW } from './data/bodyLayers';
import Onboarding from './components/Onboarding';
import FactorModal from './components/FactorModal';
import Echoes from './components/Echoes';
import FinaleSummary from './components/FinaleSummary';
import { SoundController } from './components/Sound';
import MesoPanel from './components/MesoPanel';
import { HumanPanel, MindPanel } from './components/HumanPanel';
import { ScenarioJournal, ScenarioModal } from './components/Scenarios';
import SceneVeil from './scenes/effects/SceneVeil';
import PostFX from './scenes/effects/PostFX';
import { veilPreset } from './lib/veilPresets';
import { watchReducedMotion } from './lib/motion';
import gsap from 'gsap';

const loadBigBang = () => import('./scenes/BigBang');
const loadCosmos = () => import('./scenes/Cosmos');
const loadPlanet = () => import('./scenes/Planet');
const loadMicroCosmos = () => import('./scenes/MicroCosmos');
const loadHumanBody = () => import('./scenes/HumanBody');
const loadMind = () => import('./scenes/Mind');
const loadFinale = () => import('./scenes/Finale');
const loadLocation = () => import('./scenes/Location');

const BigBang = lazy(loadBigBang);
const Cosmos = lazy(loadCosmos);
const Planet = lazy(loadPlanet);
const MicroCosmos = lazy(loadMicroCosmos);
const HumanBody = lazy(loadHumanBody);
const Mind = lazy(loadMind);
const Finale = lazy(loadFinale);
const Location = lazy(loadLocation);

/**
 * Порядок слоёв — в lib/stages.js. Человек стоит перед клеткой: масштаб
 * убывает монотонно. Заголовки слоёв (STAGE_TITLES) всплывают в момент
 * перехода, пока кадр залит вуалью.
 */
const HUMAN_STAGE = STAGE.HUMAN;
const CELL_STAGE = STAGE.CELL;
const MIND_STAGE = STAGE.MIND;
const FINALE_STAGE = STAGE.FINALE;

/**
 * Ограничивает разрешение рендера на слабых машинах и следит за потерей
 * контекста WebGL: без восстановления сцена оставалась бы чёрным экраном.
 */
function RendererGuard() {
    const { gl, scene, camera, invalidate, get } = useThree();

    useEffect(() => {
        // В разработке отдаём рендерер наружу: так видно draw calls, число
        // треугольников и объём текстур без ручного инструментирования сцены.
        if (import.meta.env.DEV) {
            window.realityRenderer = { gl, scene, camera, get controls() { return get().controls; } };
        }
    }, [gl, scene, camera, get]);

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
    const location = useStore((s) => s.location);
    const { scene } = useThree();
    const target = useRef(new THREE.Color('#000000'));
    const current = useRef(new THREE.Color('#000000'));

    useEffect(() => {
        // В диораме фон совпадает с горизонтом неба: под вуалью стык незаметен
        const horizon = locationById(location)?.horizon;
        target.current.set(horizon ?? (stage === HUMAN_STAGE ? '#e9edf4' : '#000000'));
        // У разума свой фон-сфера, который красит режим сети; здесь — только тьма под ним
    }, [stage, location]);

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
    [STAGE.SINGULARITY]: { pos: [0, 0, 5], look: [0, 0, 0], fov: 60 },
    [STAGE.COSMOS]: SHOTS.cosmos,
    [HUMAN_STAGE]: BODY_OVERVIEW,
    // Разум: вся сеть нейронов в кадре, чуть сверху
    [MIND_STAGE]: { pos: [0, 1.4, 15.5], look: [0, 0, 0], fov: 50 },
    // Точка взгляда опущена ниже центра клетки: так она сидит выше в кадре,
    // и нижние подписи не наезжают на строку интерфейса
    [CELL_STAGE]: { pos: [0, 0.6, 12.4], look: [0, -1.45, 0], fov: 58 },
    // Финал: вся нить масштабов целиком в кадре
    [FINALE_STAGE]: { pos: [0, -0.1, 9.6], look: [0, 0.1, 0], fov: 46 },
};

/**
 * Откуда начинается въезд в слой. Кадр открывается уже в движении: камера
 * подъезжает к финальной точке, пока вуаль сходит, — из-за этого переход
 * читается как продолжение полёта, а не как появление новой картинки.
 */
const STAGE_ENTRIES = {
    [STAGE.SINGULARITY]: [0, 0, 16],
    [STAGE.COSMOS]: [0, 34, 120],
    [HUMAN_STAGE]: [0, 1.4, 24],
    [CELL_STAGE]: [0, 3.4, 30],
    [MIND_STAGE]: [0, 2.5, 3],
    [FINALE_STAGE]: [0, 1.2, 26],
};

/**
 * Кадры сняты под широкий экран. На вертикальном телефоне тот же угол по
 * вертикали даёт втрое меньший охват по горизонтали: планета, подписи слоёв и
 * фигура целиком уходили за края. Поле зрения расширяется так, чтобы
 * горизонтальный охват остался прежним, с потолком против рыбьего глаза.
 */
const DESIGN_ASPECT = 1.6;
const MAX_FOV = 84;

function fovForAspect(fov, aspect) {
    if (!aspect || aspect >= DESIGN_ASPECT) return fov;
    const half = THREE.MathUtils.degToRad(fov * 0.5);
    // Компенсируем не всю разницу, а её корень. Полная компенсация сохраняет
    // горизонтальный охват буквально — и раздувает угол так, что фигура
    // съёживается в точку посреди пустого вертикального кадра.
    const widened = Math.atan(Math.tan(half) * Math.sqrt(DESIGN_ASPECT / aspect));
    return Math.min(MAX_FOV, THREE.MathUtils.radToDeg(widened) * 2);
}

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
    const location = useStore((s) => s.location);
    const calm = useStore((s) => s.calm);
    const finishEarthApproach = useStore((s) => s.finishEarthApproach);
    const setFreeLook = useStore((s) => s.setFreeLook);
    const { camera } = useThree();
    const prevStage = useRef(stage);
    const prevApproach = useRef(approaching);
    const prevLocation = useRef(location);
    const look = useRef(new THREE.Vector3(0, 0, 0));
    const aimLookAt = useRef(true);
    const unlockTimer = useRef(null);

    const shotFov = useRef(60);

    const tweenTo = useCallback((shot, duration, ease = 'power2.inOut', keepAim = true) => {
        shotFov.current = shot.fov;
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
            fov: fovForAspect(shot.fov, camera.aspect),
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
        // В спокойном режиме разгона нет вовсе: именно бросок камеры внутрь
        // кадра под вспышкой и укачивает сильнее всего
        if (calm) return undefined;
        const preset = veilPreset(shift.kind);
        // Вниз по масштабу камера падает внутрь кадра, наверх — отрывается
        // назад. Направление берём из самого перехода, а не из типа вуали:
        // одна и та же вуаль обслуживает оба направления между телом и
        // клеткой. Взрыв — исключение, он сам расталкивает камеру от центра.
        const commit = shift.commit;
        const target = commit?.type === 'stage' ? commit.to : null;
        let inward;
        if (shift.kind === 'bang') inward = false;
        // Нырок в локацию — вниз к земле, выход на карту — отрыв назад
        else if (commit?.type === 'location') inward = !!commit.id;
        else inward = target === null || target > prevStage.current;

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
        const veil = shift ? veilPreset(shift.kind, calm) : null;
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
                fov: fovForAspect(40, camera.aspect),
                duration: 2.6,
                ease: 'power2.in',
                onUpdate: () => camera.updateProjectionMatrix(),
                onComplete: () => finishEarthApproach(),
            });
            return undefined;
        }

        // Космос → детальная Земля. Подмена сцены уже накрыта вуалью, поэтому
        // камеру можно поставить в стартовую точку и продолжить наезд.
        if (wasApproaching && !approaching && stage === STAGE.PLANET) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            camera.fov = fovForAspect(SHOTS.fromSpace.fov, camera.aspect);
            camera.updateProjectionMatrix();
            tweenTo(SHOTS.earth, Math.max(arrival, 2.0), 'power2.out', false);
            return undefined;
        }

        if (stage === from && approaching === wasApproaching) return undefined;

        // Между слоями планеты камера стоит, крутится сам глобус
        if (isEarthStage(stage) && isEarthStage(from)) {
            return undefined;
        }

        if (isEarthStage(stage) && !approaching) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            camera.fov = fovForAspect(SHOTS.fromSpace.fov, camera.aspect);
            camera.updateProjectionMatrix();
            tweenTo(SHOTS.earth, Math.max(arrival, 2.0), 'power2.out', false);
            return undefined;
        }

        const shot = STAGE_SHOTS[stage];
        if (!shot) return undefined;

        // В спокойном режиме въезда нет: камера появляется почти на месте.
        // Сокращать время пролёта тут нельзя — от этого он стал бы резче, а не
        // спокойнее; убираем саму дистанцию.
        const entry = calm ? null : STAGE_ENTRIES[stage];
        if (entry && shift) {
            // Под вуалью ставим камеру в точку въезда — зритель этого не видит
            camera.position.set(...entry);
            look.current.set(...shot.look);
            camera.fov = fovForAspect(Math.min(shot.fov + 12, 85), camera.aspect);
            camera.updateProjectionMatrix();
        } else if (shift) {
            camera.position.set(...shot.pos);
            look.current.set(...shot.look);
            camera.fov = fovForAspect(shot.fov, camera.aspect);
            camera.updateProjectionMatrix();
        }

        tweenTo(shot, arrival, 'power2.out', false);
        return undefined;
        // shift читаем как «есть ли активная вуаль», перезапуск от него не нужен
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stage, approaching, camera, finishEarthApproach, setFreeLook, tweenTo]);

    // Локации мезо-уровней: под вуалью камера ставится высоко над местностью
    // и опускается к кадру диорамы; при выходе — снова портрет планеты.
    useEffect(() => {
        const before = prevLocation.current;
        prevLocation.current = location;
        if (before === location) return undefined;

        const veil = shift ? veilPreset(shift.kind, calm) : null;
        const arrival = veil ? veil.hold + veil.reveal + 0.35 : 1.4;
        const place = locationById(location);

        if (place) {
            const { shot } = place;
            camera.position.set(shot.pos[0] * 1.2, shot.pos[1] + 22, shot.pos[2] + 26);
            look.current.set(...shot.look);
            camera.fov = fovForAspect(Math.min(shot.fov + 12, 80), camera.aspect);
            camera.updateProjectionMatrix();
            tweenTo(shot, Math.max(arrival, 2.3), 'power2.out', false);
            return undefined;
        }

        if (isEarthStage(stage)) {
            camera.position.set(...SHOTS.fromSpace.pos);
            look.current.set(...SHOTS.fromSpace.look);
            camera.fov = fovForAspect(SHOTS.fromSpace.fov, camera.aspect);
            camera.updateProjectionMatrix();
            tweenTo(SHOTS.earth, Math.max(arrival, 2.0), 'power2.out', false);
        }
        return undefined;
        // shift читаем как «есть ли активная вуаль», перезапуск от него не нужен
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location, stage, camera, tweenTo]);

    // Поворот телефона меняет соотношение сторон, а значит и нужный угол
    const viewport = useThree((s) => s.size);
    useEffect(() => {
        camera.fov = fovForAspect(shotFov.current, camera.aspect);
        camera.updateProjectionMatrix();
    }, [viewport, camera]);

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
    const location = useStore((s) => s.location);
    const scenarioOpen = useStore((s) => s.scenarioQueue.length > 0);
    const approachingEarth = useStore((s) => s.approachingEarth);
    const freeLook = useStore((s) => s.freeLook);
    const shift = useStore((s) => s.shift);
    const nextStage = useStore((s) => s.nextStage);

    // Сенсорный экран меняет и управление, и формулировки подсказок: «скролль»
    // и «наведи курсор» на телефоне ничего не значат
    // Режим качества: высокий по умолчанию, низкий — если кадры проседают
    // (PerformanceMonitor ниже) или задан вручную: ?quality=low
    const [quality, setQuality] = useState(() => (
        typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('quality') === 'low' ? 'low' : 'high'
    ));
    const lowQuality = quality === 'low';

    const [isTouch] = useState(() => (typeof window === 'undefined'
        ? false
        : (window.matchMedia?.('(pointer: coarse)').matches ?? 'ontouchstart' in window)));

    const shifting = !!shift;
    const activePlace = locationById(location);
    const bodyLook = BODY_OVERVIEW.look;

    // Заголовок слоя, в который идёт переход. Нырок в локацию титруется её именем.
    const incomingStage = shift?.commit?.type === 'stage' ? shift.commit.to : stage;
    const incomingPlace = shift?.commit?.type === 'location' ? locationById(shift.commit.id) : null;
    const title = incomingPlace
        ? { kicker: incomingPlace.place, title: incomingPlace.title }
        : (shift?.commit?.type === 'location' ? { kicker: STAGE_TITLES[stage].kicker, title: 'Карта планеты' } : STAGE_TITLES[incomingStage]);

    const onCanvasCreated = useCallback(({ gl }) => {
        // Подуровни тела снимаются плоскостью отсечения — её нужно разрешить
        gl.localClippingEnabled = true;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
    }, []);

    const onPointerMissed = useCallback(() => {
        const state = useStore.getState();
        if (state.activeFactorId) state.clearFactor();
    }, []);

    // Системную настройку «меньше движения» меняют на ходу — путь не должен
    // требовать перезагрузки, чтобы её заметить
    useEffect(() => watchReducedMotion(useStore.getState().setCalm), []);

    // Сцены подгружаем заранее: иначе чанк грузится в момент перехода и вместо
    // кинематографичной стыковки зритель видит спиннер Suspense.
    useEffect(() => {
        const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 400));
        const handle = idle(() => {
            loadCosmos();
            loadPlanet();
            loadMicroCosmos();
            loadHumanBody();
            loadMind();
            // Тело строится в фоновом потоке заранее — к антропо-уровню оно готово
            import('./lib/bodyMesh').then(({ requestBodyMesh }) => {
                requestBodyMesh('skin');
                requestBodyMesh('muscle');
            });
            loadFinale();
            loadLocation();
        });
        return () => {
            if (window.cancelIdleCallback) window.cancelIdleCallback(handle);
        };
    }, []);

    useEffect(() => {
        // Один жест колеса/тачпада/свайпа = одна стадия. Инерция тачпада иначе
        // проскакивает слой цивилизации: природа и общество делят одну планету,
        // а через 1.2с лок отпускался, пока пальцы ещё едут.
        let gestureLocked = false;
        let idleTimer = null;
        let holdUntil = 0;

        const relock = () => {
            const remaining = Math.max(0, holdUntil - performance.now());
            clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
                gestureLocked = false;
            }, Math.max(remaining, 420));
        };

        /** Общий шаг по пути: колесо и свайп делают ровно одно и то же. */
        const step = (forward) => {
            const state = useStore.getState();
            // Пока идёт переход, жесты не копятся в очередь
            if (state.shift) return;

            if (!gestureLocked) {
                gestureLocked = true;
                const from = state.stage;

                if (forward) {
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
                    const preset = veilPreset(after.shift.kind, after.calm);
                    holdMs = (preset.cover + preset.hold + preset.reveal) * 1000 + 250;
                } else if (!after.location && (isEarthStage(from) || isEarthStage(to))) {
                    // 2↔3 крутят одну планету ~2.4с
                    holdMs = 2600;
                } else {
                    holdMs = 1300;
                }
                holdUntil = performance.now() + holdMs;
            }

            relock();
        };

        const handleWheel = (e) => {
            // Ctrl/Cmd + колесо и pinch оставляем OrbitControls как зум
            if (e.ctrlKey || e.metaKey) return;

            // Единый порог на всех слоях. Отдельный порог 320 на микро-уровне
            // отдавал колесо зуму, но реальная мышь шлёт 120 — из клетки нельзя
            // было уйти ни вперёд, ни назад, и микромир «вылезал» второй раз
            // при возврате с антропо-уровня. Зум остался на Ctrl + колесо.
            const threshold = useStore.getState().stage >= STAGE.COSMOS ? 40 : 5;
            if (Math.abs(e.deltaY) < threshold) return;

            e.preventDefault();
            e.stopPropagation();
            step(e.deltaY > 0);
        };

        // ─── Касания ──────────────────────────────────────────────────────
        // На телефоне колеса нет, и без этого пройти путь было невозможно:
        // зритель застревал на первом же слое. Одним пальцем — шаг по пути,
        // двумя — облёт и зум (OrbitControls, см. проп touches).
        let touch = null;

        const onTouchStart = (e) => {
            // Жест по кнопке интерфейса навигацией не считается
            if (e.touches.length !== 1 || e.target?.closest?.('button')) {
                touch = null;
                return;
            }
            const point = e.touches[0];
            touch = { x: point.clientX, y: point.clientY, at: performance.now(), moved: false };
        };

        const onTouchMove = (e) => {
            if (!touch || e.touches.length !== 1) return;
            const point = e.touches[0];
            if (Math.abs(point.clientY - touch.y) > 12 || Math.abs(point.clientX - touch.x) > 12) {
                touch.moved = true;
            }
        };

        const onTouchEnd = (e) => {
            const start = touch;
            touch = null;
            // Касание без движения — это тап по фактору, а не свайп
            if (!start || !start.moved) return;

            const point = e.changedTouches[0];
            const dy = point.clientY - start.y;
            const dx = point.clientX - start.x;
            const elapsed = performance.now() - start.at;

            // Вертикальный и решительный: медленное поперечное ведение —
            // это разглядывание сцены, а не переход на следующий слой
            if (Math.abs(dy) < 70 || Math.abs(dy) < Math.abs(dx) * 1.4 || elapsed > 900) return;

            step(dy < 0);
        };

        // ─── Клавиатура ───────────────────────────────────────────────────
        // Путь проходился только колесом и свайпом: с клавиатуры добраться
        // дальше первого слоя было нельзя вообще.
        const FORWARD_KEYS = new Set(['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Spacebar']);
        const BACK_KEYS = new Set(['ArrowUp', 'ArrowLeft', 'PageUp']);

        const onKeyDown = (e) => {
            // Модификаторы отданы браузеру и зуму, автоповтор от зажатой
            // клавиши не должен проматывать путь насквозь
            if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;

            // Пока фокус в поле или на кнопке, клавиши принадлежат им
            const tag = e.target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter')) return;

            const forward = FORWARD_KEYS.has(e.key);
            const back = BACK_KEYS.has(e.key);
            if (!forward && !back) return;

            e.preventDefault();
            step(forward);
        };

        window.addEventListener('wheel', handleWheel, { passive: false, capture: true });
        window.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('wheel', handleWheel, { capture: true });
            window.removeEventListener('touchstart', onTouchStart);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('keydown', onKeyDown);
            if (idleTimer) clearTimeout(idleTimer);
        };
    }, []);

    return (
        <div className={`relative w-screen h-screen overflow-hidden touch-none font-sans transition-colors duration-[1200ms] ${stage === HUMAN_STAGE ? 'bg-[#e9edf4] text-slate-950' : 'bg-black text-white'}`}>

            {/* 3D Canvas */}
            <div className="absolute inset-0">
                <Canvas
                    /* Тени нужны только диорамам локаций. PCFSoft в three 0.183
                       объявлен устаревшим — берём обычный PCF */
                    shadows={lowQuality ? false : 'percentage'}
                    camera={{ position: [0, 0, 5], fov: 60, near: 0.1, far: 1400 }}
                    dpr={lowQuality ? [0.75, 1] : [1, 1.75]}
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
                    {isExploded && stage >= 1 && !approachingEarth && freeLook && !shifting && activePlace && (
                        /* В диораме облёт вокруг центра местности и не ниже земли */
                        <OrbitControls
                            key={`loc-${activePlace.id}`}
                            enableZoom
                            enablePan={false}
                            zoomSpeed={0.7}
                            minDistance={10}
                            maxDistance={110}
                            maxPolarAngle={Math.PI * 0.46}
                            touches={isTouch
                                ? { ONE: THREE.TOUCH.NONE, TWO: THREE.TOUCH.DOLLY_ROTATE }
                                : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
                            dampingFactor={0.08}
                            enableDamping
                            target={activePlace.shot.look}
                            makeDefault
                        />
                    )}
                    {isExploded && stage >= 1 && !approachingEarth && freeLook && !shifting && !activePlace && (
                        <OrbitControls
                            /* На теле облёт должен крутиться вокруг выбранной области.
                               С общей точкой [0,0,0] управление, перехватив камеру
                               после наезда, рывком уводило взгляд с головы в центр фигуры. */
                            key={isEarthStage(stage) ? 'planet' : stage}
                            enableZoom
                            enablePan={false}
                            zoomSpeed={stage === CELL_STAGE ? 1.05 : (isEarthStage(stage) ? 0.75 : 0.6)}
                            minDistance={isEarthStage(stage) ? 18 : stage === CELL_STAGE ? 1.4 : (stage === HUMAN_STAGE ? 1.6 : (stage === MIND_STAGE ? 3 : 5))}
                            maxDistance={isEarthStage(stage) ? 90 : stage === CELL_STAGE ? 80 : (stage === HUMAN_STAGE ? 26 : (stage === MIND_STAGE ? 40 : 200))}
                            /* Один палец отдан навигации по пути, иначе свайп
                               одновременно листал бы слой и крутил камеру */
                            touches={isTouch
                                ? { ONE: THREE.TOUCH.NONE, TWO: THREE.TOUCH.DOLLY_ROTATE }
                                : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
                            dampingFactor={0.08}
                            enableDamping
                            target={isEarthStage(stage) ? [0, 0.4, 0] : (stage === HUMAN_STAGE ? bodyLook : [0, 0, 0])}
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
                        {stage === STAGE.SINGULARITY && <BigBang />}
                        {(stage === STAGE.COSMOS || approachingEarth) && <Cosmos />}
                        {isEarthStage(stage) && !approachingEarth && !location && <Planet />}
                        {isEarthStage(stage) && location && <Location />}
                        {stage === HUMAN_STAGE && <HumanBody />}
                        {stage === MIND_STAGE && <Mind />}
                        {stage === CELL_STAGE && <MicroCosmos />}
                        {stage === FINALE_STAGE && <Finale />}
                    </Suspense>

                    {/* Вуаль рисуется последней и накрывает стык слоёв */}
                    <SceneVeil />

                    {/* На светлом антропо-уровне порог свечения поднят: иначе
                        сам фон проходит порог и размывает тело в молоко */}
                    {/* В дневных диорамах небо само по себе яркое: порог выше,
                        чтобы светились огни и лава, а не весь горизонт */}
                    {/* Слабая машина: если кадров стабильно мало, падают
                        разрешение, тени и свечение — сцена остаётся плавной */}
                    <PerformanceMonitor flipflops={2} onDecline={() => setQuality('low')} onFallback={() => setQuality('low')} />
                    <PostFX
                        bloomStrength={lowQuality ? 0 : (stage === HUMAN_STAGE ? 0.32 : (location ? 0.42 : 0.5))}
                        bloomThreshold={stage === HUMAN_STAGE ? 1.15 : (location ? 0.95 : 0.85)}
                        vignette={stage === HUMAN_STAGE ? 0.16 : (location ? 0.36 : 0.44)}
                    />

                </Canvas>
            </div>

            {/* Титр слоя: живёт ровно столько, сколько кадр залит вуалью */}
            <div
                className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center transition-opacity duration-700 ${shifting ? 'opacity-100' : 'opacity-0'}`}
            >
                {title && (
                    <>
                        <p className={`text-[11px] tracking-[0.55em] uppercase mb-3 transition-transform duration-1000 ${shifting ? 'translate-y-0' : 'translate-y-3'} ${incomingStage === HUMAN_STAGE ? 'text-slate-900/70' : 'text-white/60'}`}>
                            {title.kicker}
                        </p>
                        <h2 className={`text-3xl md:text-5xl font-light tracking-[0.22em] uppercase transition-transform duration-1000 ${shifting ? 'translate-y-0 scale-100' : 'translate-y-4 scale-95'} ${incomingStage === HUMAN_STAGE ? 'text-slate-900' : 'text-white'}`}>
                            {title.title}
                        </h2>
                    </>
                )}
            </div>

            <Onboarding stage={stage} hidden={shifting || !!activeFactorId || scenarioOpen} light={stage === HUMAN_STAGE} touch={isTouch} />
            <ScenarioJournal light={stage === HUMAN_STAGE} hidden={stage === 0 || shifting} />

            {/* Подложка под нижней панелью: на песке, снегу и небе без неё текст теряется */}
            <div className={`pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/75 via-black/30 to-transparent transition-opacity duration-700 ${location && !shifting ? 'opacity-100' : 'opacity-0'}`} />

            {/* UI Overlay */}
            <div className={`absolute bottom-4 sm:bottom-10 w-full px-4 text-center pointer-events-none data-ui transition-opacity duration-500 ${shifting ? 'opacity-0' : 'opacity-100'}`}>
                {!isExploded && (
                    <p className="text-white/50 tracking-[0.3em] uppercase text-xs animate-pulse">
                        {isTouch ? 'Свайп вверх для старта' : 'Скролль вниз для старта'}
                    </p>
                )}
                {stage === STAGE.COSMOS && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-[11px] sm:text-sm mb-1.5 sm:mb-2">Макрокосмос</p>
                        <p className="text-xs text-white/50">{isTouch ? 'Двумя пальцами — облёт, касание — объект. Свайп дальше.' : 'Вращай камеру, кликай на объекты. Скролль дальше.'}</p>
                    </div>
                )}
                {stage === STAGE.PLANET && approachingEarth && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-[11px] sm:text-sm mb-1.5 sm:mb-2">Приближение к Земле</p>
                        <p className="text-xs text-white/40">Камера входит в систему. Планета растёт в кадре.</p>
                    </div>
                )}
                {isEarthStage(stage) && !approachingEarth && (
                    <MesoPanel stage={stage} touch={isTouch} />
                )}
                {stage === CELL_STAGE && (
                    <div className="text-white/70 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-[11px] sm:text-sm mb-1.5 sm:mb-2 text-fuchsia-400">
                            Микро-уровень: клетка
                        </p>
                        <p className="text-xs text-white/40 mb-4 font-light">
                            Внутри одной клетки: мембрана, ДНК, энергия, синапс. {isTouch ? 'Свайп дальше — к итогу пути. Двумя пальцами — зум.' : 'Скролль дальше — к итогу пути. Ctrl + колесо приближает.'}
                        </p>
                        <button
                            onClick={nextStage}
                            className="px-5 py-2 border border-fuchsia-300/40 rounded-full text-xs uppercase tracking-wider text-fuchsia-100 hover:bg-fuchsia-300 hover:text-black transition-colors"
                        >
                            К итогу
                        </button>
                    </div>
                )}
                {stage === HUMAN_STAGE && <HumanPanel touch={isTouch} />}
                {stage === MIND_STAGE && <MindPanel touch={isTouch} />}
                {stage === FINALE_STAGE && <FinaleSummary />}
            </div>

            <SoundController />
            <FactorModal />
            <Echoes />
            <ScenarioModal />

        </div>
    );
}
