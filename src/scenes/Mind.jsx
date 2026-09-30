import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { FACTORS_DATA } from '../data/factors';
import { withEchoes } from '../data/consequences';
import { FACTOR_NEURONS } from '../data/mind';
import { seededRandom } from '../lib/geo';
import { circleSprite } from '../lib/sprites';

/**
 * «Разум» — сеть нейронов внутри головы.
 *
 * Каждый подписанный нейрон — фактор психики. Клик по нейрону не только
 * открывает его карточку, но и переключает всю сеть в его режим: гнев
 * расходится волной от одного очага по связям, окрашивает фон и трясёт кадр;
 * концентрация синхронно разряжает все нейроны, и каждый вздрагивает, приняв
 * импульс. Переворот фактора включает антипод — свою картину активности.
 *
 * Движок один: импульсы бегут по рёбрам графа между текущими (живыми)
 * позициями нейронов, при приёме нейрон вспыхивает и толкается. Режимы
 * различаются правилами запуска импульсов и тем, как деформируется сеть.
 */

const NEURON_COUNT = 64;
const MAX_IMPULSES = 520;
/** Сколько отрезков в изогнутом аксоне. */
const EDGE_SEG = 7;
const MAX_SPARKS = 240;
const damp = THREE.MathUtils.damp;

const FACTOR_IDS = FACTOR_NEURONS.map((f) => f.id);

/**
 * Режимы сети. color — цвет импульсов и нейронов, bg — фон, shake — тряска,
 * rate — сколько запусков в секунду, speed — скорость импульса.
 * pattern — правило запуска; остальные поля деформируют сеть.
 */
const MODES = {
    idle: { color: '#9fb8ff', bg: '#05060d', shake: 0, rate: 5, speed: 1.1, pattern: 'random' },
    anger: [
        { color: '#ff3a2a', bg: '#2a0404', shake: 0.09, rate: 1.1, speed: 2.4, pattern: 'cascade', bump: 1.4 },
        { color: '#8fffc8', bg: '#04120c', shake: 0, rate: 0.35, speed: 0.6, pattern: 'cascade', bump: 0.5 },
    ],
    attention: [
        { color: '#3fb0ff', bg: '#020a1a', shake: 0, rate: 0.8, speed: 1.6, pattern: 'sync', bump: 1.2, pulse: 1 },
        { color: '#a08cc0', bg: '#0a0810', shake: 0, rate: 9, speed: 0.8, pattern: 'random', drift: 0.6, dim: 0.5 },
    ],
    fear: [
        { color: '#a060ff', bg: '#0c0418', shake: 0.03, rate: 7, speed: 2.2, pattern: 'random', contract: 1 },
        { color: '#ff9a3a', bg: '#1a0c02', shake: 0, rate: 1.4, speed: 2.6, pattern: 'cascade', expand: 1 },
    ],
    joy: [
        { color: '#ffd84a', bg: '#1a1202', shake: 0, rate: 1.6, speed: 2.2, pattern: 'cascade', bump: 1.6, sparkle: 1 },
        { color: '#6a6a70', bg: '#050506', shake: 0, rate: 0.6, speed: 0.5, pattern: 'random', dim: 0.7 },
    ],
    sadness: [
        { color: '#4a78d8', bg: '#030818', shake: 0, rate: 3, speed: 0.45, pattern: 'down', sag: 1 },
        { color: '#c0a8ff', bg: '#0c0a18', shake: 0, rate: 0.45, speed: 0.8, pattern: 'cascade' },
    ],
    empathy: [
        { color: '#ff7ac8', bg: '#16040e', shake: 0, rate: 3, speed: 1.2, pattern: 'mirror' },
        { color: '#8898a8', bg: '#05070a', shake: 0, rate: 1, speed: 0.7, pattern: 'random', dim: 0.8 },
    ],
    attachment: [
        { color: '#ff5f8a', bg: '#14040a', shake: 0, rate: 5, speed: 1.4, pattern: 'pair' },
        { color: '#7890aa', bg: '#04060a', shake: 0, rate: 1.5, speed: 0.8, pattern: 'random', isolate: 1 },
    ],
    motivation: [
        { color: '#ffb03a', bg: '#140a02', shake: 0, rate: 1.2, speed: 2.4, pattern: 'goal' },
        { color: '#8a8070', bg: '#060504', shake: 0, rate: 1.2, speed: 1.0, pattern: 'goal', stall: 0.45, dim: 0.5 },
    ],
    curiosity: [
        { color: '#5fff9a', bg: '#02120a', shake: 0, rate: 2.2, speed: 1.6, pattern: 'grow' },
        { color: '#607068', bg: '#040605', shake: 0, rate: 0.5, speed: 0.6, pattern: 'random', dim: 0.8 },
    ],
    memory: [
        { color: '#ffc870', bg: '#120a02', shake: 0, rate: 1.6, speed: 2, pattern: 'replay' },
        { color: '#7a6a5a', bg: '#060504', shake: 0, rate: 1.6, speed: 2, pattern: 'replay', stall: 0.5, fade: 1 },
    ],
    dreaming: [
        { color: '#b08cff', bg: '#0a0620', shake: 0, rate: 2.5, speed: 0.7, pattern: 'long', drift: 1.4 },
        { color: '#40405a', bg: '#020204', shake: 0, rate: 0.3, speed: 0.4, pattern: 'random', dim: 0.9 },
    ],
    abstraction: [
        { color: '#4ff0ff', bg: '#021216', shake: 0, rate: 4, speed: 1.8, pattern: 'long' },
        { color: '#90a0a0', bg: '#050808', shake: 0, rate: 5, speed: 1.2, pattern: 'short' },
    ],
    stress: [
        { color: '#ff7a2a', bg: '#1a0802', shake: 0.05, rate: 30, speed: 3.2, pattern: 'random' },
        { color: '#4fe0c8', bg: '#021210', shake: 0, rate: 0.5, speed: 0.6, pattern: 'sync', breathe: 1 },
    ],
    speech: [
        { color: '#fff06a', bg: '#121002', shake: 0, rate: 1.1, speed: 2.4, pattern: 'sequence' },
        { color: '#8a8660', bg: '#060604', shake: 0, rate: 1.1, speed: 2.4, pattern: 'sequence', stall: 0.4 },
    ],
    sleep: [
        { color: '#4a5ad8', bg: '#02030c', shake: 0, rate: 0.25, speed: 0.4, pattern: 'wave' },
        { color: '#e8f0ff', bg: '#0c0e14', shake: 0.01, rate: 16, speed: 2.4, pattern: 'random', drift: 0.4 },
    ],
    identity: [
        { color: '#ffffff', bg: '#08080c', shake: 0, rate: 2.5, speed: 1.6, pattern: 'converge' },
        { color: '#b0a0c8', bg: '#08060c', shake: 0, rate: 3, speed: 1.0, pattern: 'random', split: 1 },
    ],
    emotion: [
        { color: '#ff9ad0', bg: '#12040c', shake: 0, rate: 1.4, speed: 1.8, pattern: 'cascade', rainbow: 1, bump: 1.2 },
        { color: '#707078', bg: '#050506', shake: 0, rate: 0.6, speed: 0.6, pattern: 'random', dim: 0.8 },
    ],
};

function modeFor(id, reversed) {
    const m = MODES[id];
    if (!m || !Array.isArray(m)) return MODES.idle;
    return m[reversed ? 1 : 0];
}

/** Граф сети: нейроны в форме мозга, соседи — ближайшие, плюс редкие дальние связи. */
function buildNetwork() {
    const rand = seededRandom(0x6e7a);
    const nodes = FACTOR_NEURONS.map((f) => ({ base: new THREE.Vector3(...f.pos), factor: f.id }));
    while (nodes.length < NEURON_COUNT) {
        const p = new THREE.Vector3((rand() - 0.5) * 2, (rand() - 0.5) * 2, (rand() - 0.5) * 2);
        if (p.length() > 1) continue;
        p.multiply(new THREE.Vector3(5.2, 3.4, 3.4));
        if (nodes.some((n) => n.base.distanceTo(p) < 0.95)) continue;
        nodes.push({ base: p, factor: null });
    }
    nodes.forEach((n, i) => { n.index = i; n.phase = rand() * 10; });

    const edgeSet = new Set();
    const edges = [];
    const addEdge = (a, b) => {
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (a === b || edgeSet.has(key)) return;
        edgeSet.add(key);
        edges.push([a, b]);
    };
    nodes.forEach((n, i) => {
        const near = nodes
            .map((m, j) => ({ j, d: n.base.distanceTo(m.base) }))
            .filter((x) => x.j !== i)
            .sort((a, b) => a.d - b.d)
            .slice(0, n.factor ? 5 : 3);
        near.forEach((x) => addEdge(i, x.j));
    });
    for (let k = 0; k < 14; k += 1) addEdge(Math.floor(rand() * NEURON_COUNT), Math.floor(rand() * NEURON_COUNT));

    const neighbors = nodes.map(() => []);
    edges.forEach(([a, b], e) => {
        neighbors[a].push({ to: b, e });
        neighbors[b].push({ to: a, e });
    });
    const lengths = edges.map(([a, b]) => nodes[a].base.distanceTo(nodes[b].base));

    // Аксоны не прямые: у каждого свой изгиб, как у настоящего отростка
    const bends = edges.map(() => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9));
    const edgeIndex = new Map();
    edges.forEach(([a, b], e) => {
        edgeIndex.set(`${a}-${b}`, { e, dir: 1 });
        edgeIndex.set(`${b}-${a}`, { e, dir: -1 });
    });

    // Дендриты: дерево отростков вокруг тела нейрона — ствол, развилка и
    // веточки. Смещения хранятся относительно тела и едут вместе с ним.
    const unit = () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const dendrites = [];
    nodes.forEach((n, i) => {
        const branches = n.factor ? 8 : 4 + Math.floor(rand() * 3);
        const soma = n.factor ? 0.2 : 0.11;
        for (let k = 0; k < branches; k += 1) {
            const dir = unit();
            const len = (n.factor ? 0.85 : 0.55) * (0.6 + rand() * 0.6);
            const p0 = dir.clone().multiplyScalar(soma);
            const mid = dir.clone().multiplyScalar(len * 0.55).add(unit().multiplyScalar(len * 0.12));
            const end = dir.clone().multiplyScalar(len).add(unit().multiplyScalar(len * 0.18));
            dendrites.push({ node: i, a: p0, b: mid, w: 1 });
            dendrites.push({ node: i, a: mid, b: end, w: 0.8 });
            for (let s = 0; s < 2; s += 1) {
                const d2 = dir.clone().add(unit().multiplyScalar(0.9)).normalize();
                const tip = mid.clone().addScaledVector(d2, len * (0.3 + rand() * 0.25));
                dendrites.push({ node: i, a: mid, b: tip, w: 0.6 });
                const d3 = d2.clone().add(unit().multiplyScalar(0.8)).normalize();
                dendrites.push({ node: i, a: tip, b: tip.clone().addScaledVector(d3, len * 0.18), w: 0.4 });
            }
            const d4 = dir.clone().add(unit().multiplyScalar(0.7)).normalize();
            dendrites.push({ node: i, a: end, b: end.clone().addScaledVector(d4, len * 0.22), w: 0.5 });
        }
    });

    return { nodes, edges, neighbors, lengths, bends, edgeIndex, dendrites };
}

/** Точка на изогнутом аксоне ребра e при параметре u (0 — начало ребра). */
function axonPoint(net, pos, e, u, out) {
    const [a, b] = net.edges[e];
    const pa = pos[a];
    const pb = pos[b];
    const len = pa.distanceTo(pb);
    const bend = net.bends[e];
    const cx = (pa.x + pb.x) / 2 + bend.x * len * 0.35;
    const cy = (pa.y + pb.y) / 2 + bend.y * len * 0.35;
    const cz = (pa.z + pb.z) / 2 + bend.z * len * 0.35;
    const v = 1 - u;
    return out.set(
        v * v * pa.x + 2 * v * u * cx + u * u * pb.x,
        v * v * pa.y + 2 * v * u * cy + u * u * pb.y,
        v * v * pa.z + 2 * v * u * cz + u * u * pb.z,
    );
}

/** Путь в ширину от source к target по графу. */
function bfsPath(net, source, target) {
    const prev = new Array(net.nodes.length).fill(-1);
    const seen = new Set([source]);
    const queue = [source];
    while (queue.length) {
        const v = queue.shift();
        if (v === target) break;
        net.neighbors[v].forEach(({ to }) => {
            if (!seen.has(to)) {
                seen.add(to);
                prev[to] = v;
                queue.push(to);
            }
        });
    }
    const path = [];
    for (let v = target; v !== -1; v = prev[v]) path.unshift(v);
    return path[0] === source ? path : [source];
}

/** Дерево в ширину от корня: для каждого нейрона — сосед на шаг ближе к корню. */
function bfsParents(net, root) {
    const parent = new Array(net.nodes.length).fill(-1);
    const seen = new Set([root]);
    const queue = [root];
    while (queue.length) {
        const v = queue.shift();
        net.neighbors[v].forEach(({ to }) => {
            if (!seen.has(to)) {
                seen.add(to);
                parent[to] = v;
                queue.push(to);
            }
        });
    }
    return parent;
}

export default function Mind() {
    const setActiveFactor = useStore((s) => s.setActiveFactor);
    const rawReversed = useStore((s) => s.reversedFactors);
    const reversed = useMemo(() => withEchoes(rawReversed), [rawReversed]);

    const net = useMemo(() => buildNetwork(), []);
    // Режим живёт дольше карточки: закрыли окно — сеть остаётся в состоянии
    // выбранного нейрона, пока не выбран другой
    const focusId = useStore((s) => s.mindFocus);
    const setMindFocus = useStore((s) => s.setMindFocus);
    const focusIndex = focusId ? FACTOR_IDS.indexOf(focusId) : -1;
    const mode = focusId ? modeFor(focusId, !!reversed[focusId]) : MODES.idle;

    const groupRef = useRef();
    const somaRef = useRef();
    const impulseRef = useRef();
    const bgRef = useRef();
    const labelRefs = useRef([]);
    const hitRefs = useRef([]);

    // Живое состояние движка — меняется каждый кадр, React его не видит
    const sim = useMemo(() => ({
        pos: net.nodes.map((n) => n.base.clone()),
        bump: new Float32Array(NEURON_COUNT),
        glow: new Float32Array(NEURON_COUNT),
        impulses: Array.from({ length: MAX_IMPULSES }, () => ({ live: false, a: 0, b: 0, t: 0, dur: 1, wave: 0, color: new THREE.Color() })),
        timer: 0,
        wave: 0,
        visited: new Map(),
        replay: null,
        sequence: net.nodes.map((n, i) => i).sort((a, b) => net.nodes[a].base.x - net.nodes[b].base.x).filter((i) => Math.abs(net.nodes[i].base.y) < 1.8),
        grown: [],
        color: new THREE.Color('#9fb8ff'),
        bg: new THREE.Color('#05060d'),
        target: new THREE.Color(),
        tmp: new THREE.Object3D(),
        tmpColor: new THREE.Color(),
        shake: 0,
        axon: new THREE.Vector3(),
        sparks: Array.from({ length: MAX_SPARKS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3() })),
        params: { drift: 0, sag: 0, contract: 0, expand: 0, split: 0, isolate: 0, dim: 0, breathe: 0, fade: 0 },
    }), [net]);

    // Смена режима начинает всё с чистого листа: новая волна, новый путь памяти
    useEffect(() => {
        sim.visited.clear();
        sim.timer = 0;
        sim.replay = null;
        sim.grown = [];
    }, [focusId, reversed, sim]);

    const edgeGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = net.edges.length * EDGE_SEG * 6;
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n), 3));
        return g;
    }, [net]);
    const dendriteGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        const n = net.dendrites.length * 6;
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n), 3));
        return g;
    }, [net]);
    const haloGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NEURON_COUNT * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(NEURON_COUNT * 3), 3));
        return g;
    }, []);
    const sparkGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
        g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_SPARKS * 3), 3));
        return g;
    }, []);
    const tex = useMemo(() => circleSprite(), []);
    const grownGeometry = useMemo(() => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 6), 3));
        g.setDrawRange(0, 0);
        return g;
    }, []);
    useEffect(() => () => {
        [edgeGeometry, grownGeometry, dendriteGeometry, haloGeometry, sparkGeometry].forEach((g) => g.dispose());
    }, [edgeGeometry, grownGeometry, dendriteGeometry, haloGeometry, sparkGeometry]);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.05);
        const t = state.clock.elapsedTime;
        const m = mode;
        const P = sim.params;

        // Плавный переход параметров режима
        ['drift', 'sag', 'contract', 'expand', 'split', 'isolate', 'dim', 'breathe', 'fade'].forEach((k) => {
            P[k] = damp(P[k], m[k] ?? 0, 1.4, dt);
        });
        sim.color.lerp(sim.target.set(m.color), 1 - Math.exp(-dt * 3));
        sim.bg.lerp(sim.target.set(m.bg), 1 - Math.exp(-dt * 2));
        sim.shake = damp(sim.shake, m.shake ?? 0, 3, dt);

        // ─── Позиции нейронов: живые, с деформацией режима ────────────────
        const center = sim.pos[0];
        net.nodes.forEach((n, i) => {
            const p = sim.pos[i];
            const b = n.base;
            const wob = 0.06 + P.drift * 0.5;
            p.set(
                b.x + Math.sin(t * 0.7 + n.phase) * wob,
                b.y + Math.sin(t * 0.9 + n.phase * 1.3) * wob,
                b.z + Math.cos(t * 0.6 + n.phase) * wob,
            );
            // Грусть тянет сеть вниз, страх сжимает к центру, безрассудство расширяет
            p.y -= P.sag * (0.6 + 0.4 * Math.sin(n.phase)) * 0.7;
            const pulse = 1 - P.contract * (0.12 + 0.06 * Math.sin(t * 7)) + P.expand * 0.12;
            p.multiplyScalar(pulse);
            // Расщепление «я»: две половины расходятся в стороны
            p.x += Math.sign(b.x || 0.01) * P.split * 1.6;
            // Одиночество: нейрон привязанности уходит от сети
            if (n.factor === 'attachment') p.addScaledVector(b.clone().normalize(), P.isolate * 2.4);
            // Толчок при приёме импульса
            if (sim.bump[i] > 0.01) p.addScaledVector(p.clone().sub(center).normalize(), sim.bump[i] * 0.12);
            sim.bump[i] = damp(sim.bump[i], 0, 6, dt);
            sim.glow[i] = damp(sim.glow[i], 0, 3.2, dt);
        });

        // ─── Запуск импульсов по правилу режима ───────────────────────────
        const fire = (a, b, color, wave = 0) => {
            const imp = sim.impulses.find((x) => !x.live);
            if (!imp) return;
            imp.live = true;
            imp.a = a;
            imp.b = b;
            imp.t = 0;
            imp.wave = wave;
            const link = net.edgeIndex.get(`${a}-${b}`);
            imp.e = link ? link.e : -1;
            imp.dir = link ? link.dir : 1;
            imp.dur = Math.max(0.15, sim.pos[a].distanceTo(sim.pos[b]) / (2.2 * (m.speed ?? 1)));
            imp.color.copy(color ?? sim.color);
            sim.glow[a] = Math.max(sim.glow[a], 0.8);
        };
        const src = focusIndex >= 0 ? focusIndex : 0;
        const randomEdge = (filter) => {
            for (let k = 0; k < 8; k += 1) {
                const [a, b] = net.edges[Math.floor(Math.random() * net.edges.length)];
                const pair = Math.random() < 0.5 ? [a, b] : [b, a];
                if (!filter || filter(pair[0], pair[1])) return pair;
            }
            return null;
        };

        sim.timer += dt;
        const period = 1 / Math.max(0.05, m.rate ?? 1);
        while (sim.timer > period) {
            sim.timer -= period;
            switch (m.pattern) {
                case 'cascade': {
                    // Новая волна из одного очага: дальше её разнесут соседи
                    sim.wave += 1;
                    sim.visited.set(sim.wave, new Set([src]));
                    const color = m.rainbow ? new THREE.Color().setHSL(Math.random(), 0.85, 0.62) : null;
                    net.neighbors[src].forEach(({ to }) => fire(src, to, color, sim.wave));
                    sim.glow[src] = 1.5;
                    break;
                }
                case 'sync': {
                    // Все нейроны разряжаются разом — координация внимания
                    net.edges.forEach(([a, b]) => {
                        fire(a, b);
                        fire(b, a);
                    });
                    break;
                }
                case 'down': {
                    const e = randomEdge((a, b) => sim.pos[b].y < sim.pos[a].y - 0.3);
                    if (e) fire(e[0], e[1]);
                    break;
                }
                case 'mirror': {
                    const e = randomEdge();
                    if (!e) break;
                    fire(e[0], e[1]);
                    // То же движение на зеркальной стороне сети — отражение другого
                    const mirror = (i) => {
                        const q = net.nodes[i].base;
                        let best = i;
                        let bd = Infinity;
                        net.nodes.forEach((n, j) => {
                            const d = Math.hypot(n.base.x + q.x, n.base.y - q.y, n.base.z - q.z);
                            if (d < bd) { bd = d; best = j; }
                        });
                        return best;
                    };
                    const ma = mirror(e[0]);
                    const nb = net.neighbors[ma][0];
                    if (nb) fire(ma, nb.to);
                    break;
                }
                case 'pair': {
                    net.neighbors[src].forEach(({ to }) => {
                        fire(src, to);
                        fire(to, src);
                    });
                    break;
                }
                case 'goal': {
                    const target = net.nodes.reduce((best, n, i) => (n.base.distanceTo(net.nodes[src].base) > net.nodes[best].base.distanceTo(net.nodes[src].base) ? i : best), 0);
                    const path = bfsPath(net, src, target);
                    path.slice(0, -1).forEach((a, k) => {
                        setTimeout(() => fire(a, path[k + 1]), k * 180);
                    });
                    break;
                }
                case 'grow': {
                    // Любопытство прорастает новыми связями к случайным нейронам
                    const to = Math.floor(Math.random() * NEURON_COUNT);
                    if (to !== src) {
                        sim.grown.push({ a: src, b: to, life: 1 });
                        if (sim.grown.length > 24) sim.grown.shift();
                        fire(src, to);
                    }
                    break;
                }
                case 'replay': {
                    if (!sim.replay) {
                        const path = [src];
                        for (let k = 0; k < 7; k += 1) {
                            const nb = net.neighbors[path[path.length - 1]];
                            path.push(nb[(k * 3 + 1) % nb.length].to);
                        }
                        sim.replay = path;
                    }
                    sim.replay.slice(0, -1).forEach((a, k) => {
                        setTimeout(() => fire(a, sim.replay?.[k + 1] ?? a), k * 220);
                    });
                    break;
                }
                case 'long': {
                    const e = randomEdge((a, b) => net.nodes[a].base.distanceTo(net.nodes[b].base) > 2.6);
                    if (e) fire(e[0], e[1]);
                    break;
                }
                case 'short': {
                    const e = randomEdge((a, b) => net.nodes[a].base.distanceTo(net.nodes[b].base) < 1.6);
                    if (e) fire(e[0], e[1]);
                    break;
                }
                case 'sequence': {
                    const seq = sim.sequence;
                    seq.slice(0, -1).forEach((a, k) => {
                        const b = seq[k + 1];
                        setTimeout(() => fire(a, b), k * 90);
                    });
                    break;
                }
                case 'wave': {
                    // Медленные волны сна прокатываются через всю сеть
                    const front = ((t * 0.18) % 1) * 10 - 5;
                    net.edges.forEach(([a, b]) => {
                        if (Math.abs(sim.pos[a].x - front) < 0.9) fire(a, b);
                    });
                    break;
                }
                case 'converge': {
                    const parent = bfsParents(net, 0);
                    for (let k = 0; k < 10; k += 1) {
                        const i = 1 + Math.floor(Math.random() * (NEURON_COUNT - 1));
                        if (parent[i] >= 0) fire(i, parent[i]);
                    }
                    break;
                }
                default: {
                    const e = randomEdge(P.split > 0.3 ? (a, b) => Math.sign(net.nodes[a].base.x) === Math.sign(net.nodes[b].base.x) : null);
                    if (e) fire(e[0], e[1]);
                }
            }
        }

        // ─── Движение импульсов и приём ───────────────────────────────────
        const stall = m.stall ?? 1;
        const impMesh = impulseRef.current;
        const tmp = sim.tmp;
        let n = 0;
        sim.impulses.forEach((imp) => {
            if (!imp.live) return;
            imp.t += dt / imp.dur;
            if (m.stall && imp.t > stall) {
                // Застрявший сигнал гаснет, не дойдя до цели
                imp.live = Math.random() > 0.08;
                imp.t = stall;
            }
            if (imp.t >= 1) {
                imp.live = false;
                sim.bump[imp.b] = Math.min(1.5, sim.bump[imp.b] + (m.bump ?? 0.8));
                sim.glow[imp.b] = Math.max(sim.glow[imp.b], 1);
                // Радость: принявший нейрон рассыпает искры во все стороны
                if (m.sparkle) {
                    let born = 0;
                    for (let k = 0; k < MAX_SPARKS && born < 6; k += 1) {
                        const sp = sim.sparks[k];
                        if (sp.life > 0) continue;
                        sp.life = 1;
                        sp.p.copy(sim.pos[imp.b]);
                        sp.v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(1.2 + Math.random() * 1.6);
                        born += 1;
                    }
                }
                // Волна каскада идёт дальше — от принявшего к его соседям
                if (m.pattern === 'cascade' && imp.wave) {
                    const seen = sim.visited.get(imp.wave);
                    if (seen && !seen.has(imp.b)) {
                        seen.add(imp.b);
                        net.neighbors[imp.b].forEach(({ to }) => {
                            if (!seen.has(to)) fire(imp.b, to, imp.color, imp.wave);
                        });
                    }
                }
                return;
            }
            if (!impMesh || n >= MAX_IMPULSES) return;
            if (imp.e >= 0) axonPoint(net, sim.pos, imp.e, imp.dir > 0 ? imp.t : 1 - imp.t, tmp.position);
            else tmp.position.lerpVectors(sim.pos[imp.a], sim.pos[imp.b], imp.t);
            tmp.scale.setScalar(1);
            tmp.updateMatrix();
            impMesh.setMatrixAt(n, tmp.matrix);
            impMesh.setColorAt(n, imp.color);
            n += 1;
        });
        if (impMesh) {
            impMesh.count = n;
            impMesh.instanceMatrix.needsUpdate = true;
            if (impMesh.instanceColor) impMesh.instanceColor.needsUpdate = true;
        }
        // Старые волны не копятся в памяти
        if (sim.visited.size > 12) sim.visited.delete(sim.visited.keys().next().value);

        // ─── Нейроны ─────────────────────────────────────────────────────
        const soma = somaRef.current;
        const c = sim.tmpColor;
        const breathe = P.breathe * (0.5 + 0.5 * Math.sin(t * 0.9));
        net.nodes.forEach((node, i) => {
            const isFactor = !!node.factor;
            const faded = P.fade * (i % 3 === 0 ? 1 : 0);
            tmp.position.copy(sim.pos[i]);
            const s = (isFactor ? 0.17 : 0.085) * (1 + sim.bump[i] * 0.35 + (m.pulse ? 0.1 * Math.sin(t * 6) : 0)) * (1 - faded * 0.6);
            tmp.scale.setScalar(s);
            tmp.updateMatrix();
            soma?.setMatrixAt(i, tmp.matrix);
            const light = 0.35 + sim.glow[i] * 0.9 + breathe * 0.6 - P.dim * 0.2;
            c.copy(sim.color).multiplyScalar(Math.max(0.12, light) * (1 - faded * 0.8));
            if (i === focusIndex) c.multiplyScalar(1.6);
            soma?.setColorAt(i, c);

            if (isFactor) {
                const label = labelRefs.current[FACTOR_IDS.indexOf(node.factor)];
                if (label) label.position.set(sim.pos[i].x, sim.pos[i].y - 0.42, sim.pos[i].z);
                const hit = hitRefs.current[FACTOR_IDS.indexOf(node.factor)];
                if (hit) hit.position.copy(sim.pos[i]);
            }
        });
        if (soma) {
            soma.instanceMatrix.needsUpdate = true;
            if (soma.instanceColor) soma.instanceColor.needsUpdate = true;
        }

        // ─── Дендриты: светятся у активных нейронов ──────────────────────
        const ep = edgeGeometry.attributes.position.array;
        const ec = edgeGeometry.attributes.color.array;
        const q = sim.axon;
        let o = 0;
        net.edges.forEach(([a, b], e) => {
            let k = 0.1 + Math.max(sim.glow[a], sim.glow[b]) * 0.35 + breathe * 0.2;
            k *= 1 - P.dim * 0.6;
            if (P.split > 0.3 && Math.sign(net.nodes[a].base.x) !== Math.sign(net.nodes[b].base.x)) k *= 1 - P.split;
            if (P.isolate > 0.3 && (net.nodes[a].factor === 'attachment' || net.nodes[b].factor === 'attachment')) k *= 1 - P.isolate;
            for (let sgm = 0; sgm < EDGE_SEG; sgm += 1) {
                axonPoint(net, sim.pos, e, sgm / EDGE_SEG, q);
                ep[o] = q.x; ep[o + 1] = q.y; ep[o + 2] = q.z;
                axonPoint(net, sim.pos, e, (sgm + 1) / EDGE_SEG, q);
                ep[o + 3] = q.x; ep[o + 4] = q.y; ep[o + 5] = q.z;
                // К середине аксон тускнеет: ярко у тел нейронов, где сигнал рождается
                const fall = 0.65 + 0.35 * Math.abs(sgm / EDGE_SEG - 0.5) * 2;
                c.copy(sim.color).multiplyScalar(k * fall);
                ec[o] = c.r; ec[o + 1] = c.g; ec[o + 2] = c.b;
                ec[o + 3] = c.r; ec[o + 4] = c.g; ec[o + 5] = c.b;
                o += 6;
            }
        });
        edgeGeometry.attributes.position.needsUpdate = true;
        edgeGeometry.attributes.color.needsUpdate = true;

        // Дендриты: ветвятся вокруг тела, вздрагивают вместе с ним и светятся,
        // когда нейрон принимает сигнал
        const dp = dendriteGeometry.attributes.position.array;
        const dc = dendriteGeometry.attributes.color.array;
        net.dendrites.forEach((d, j) => {
            const base = sim.pos[d.node];
            const grow = 1 + sim.bump[d.node] * 0.25;
            const sway = Math.sin(t * 1.2 + d.node + j * 0.3) * 0.03;
            const k2 = j * 6;
            dp[k2] = base.x + d.a.x * grow + sway; dp[k2 + 1] = base.y + d.a.y * grow; dp[k2 + 2] = base.z + d.a.z * grow;
            dp[k2 + 3] = base.x + d.b.x * grow + sway * 2; dp[k2 + 4] = base.y + d.b.y * grow + sway; dp[k2 + 5] = base.z + d.b.z * grow;
            const faded = P.fade * (d.node % 3 === 0 ? 1 : 0);
            const lum = (0.16 + sim.glow[d.node] * 0.55 + breathe * 0.2) * d.w * (1 - P.dim * 0.5) * (1 - faded * 0.8);
            c.copy(sim.color).multiplyScalar(lum);
            dc[k2] = c.r; dc[k2 + 1] = c.g; dc[k2 + 2] = c.b;
            dc[k2 + 3] = c.r * 0.6; dc[k2 + 4] = c.g * 0.6; dc[k2 + 5] = c.b * 0.6;
        });
        dendriteGeometry.attributes.position.needsUpdate = true;
        dendriteGeometry.attributes.color.needsUpdate = true;

        // Ореол тела нейрона — свет, а не шарик
        const hp = haloGeometry.attributes.position.array;
        const hc = haloGeometry.attributes.color.array;
        net.nodes.forEach((node, i) => {
            hp[i * 3] = sim.pos[i].x; hp[i * 3 + 1] = sim.pos[i].y; hp[i * 3 + 2] = sim.pos[i].z;
            const lum = (node.factor ? 0.45 : 0.22) + sim.glow[i] * 0.7 + breathe * 0.3 - P.dim * 0.15;
            c.copy(sim.color).multiplyScalar(Math.max(0.05, lum));
            hc[i * 3] = c.r; hc[i * 3 + 1] = c.g; hc[i * 3 + 2] = c.b;
        });
        haloGeometry.attributes.position.needsUpdate = true;
        haloGeometry.attributes.color.needsUpdate = true;

        // Искры радости: разлетаются, тормозят и гаснут
        const sp2 = sparkGeometry.attributes.position.array;
        const sc2 = sparkGeometry.attributes.color.array;
        sim.sparks.forEach((spk, k3) => {
            if (spk.life > 0) {
                spk.life = Math.max(0, spk.life - dt * 0.9);
                spk.p.addScaledVector(spk.v, dt);
                spk.v.multiplyScalar(1 - dt * 1.5);
                spk.v.y -= dt * 0.6;
            }
            sp2[k3 * 3] = spk.p.x; sp2[k3 * 3 + 1] = spk.p.y; sp2[k3 * 3 + 2] = spk.p.z;
            const l = spk.life;
            sc2[k3 * 3] = 1.0 * l; sc2[k3 * 3 + 1] = 0.85 * l; sc2[k3 * 3 + 2] = 0.35 * l;
        });
        sparkGeometry.attributes.position.needsUpdate = true;
        sparkGeometry.attributes.color.needsUpdate = true;

        const gp = grownGeometry.attributes.position.array;
        sim.grown.forEach((g, k) => {
            g.life = Math.max(0, g.life - dt * 0.2);
            const pa = sim.pos[g.a];
            const pb = sim.pos[g.b];
            // Связь прорастает от нейрона наружу
            const reach = Math.min(1, (1 - g.life) * 3);
            gp.set([pa.x, pa.y, pa.z, pa.x + (pb.x - pa.x) * reach, pa.y + (pb.y - pa.y) * reach, pa.z + (pb.z - pa.z) * reach], k * 6);
        });
        grownGeometry.setDrawRange(0, sim.grown.length * 2);
        grownGeometry.attributes.position.needsUpdate = true;

        // ─── Фон и тряска ────────────────────────────────────────────────
        if (bgRef.current) bgRef.current.material.color.copy(sim.bg);
        const g = groupRef.current;
        if (g) {
            const sh = sim.shake;
            g.position.set(Math.sin(t * 43) * sh, Math.sin(t * 37 + 1) * sh, Math.cos(t * 31) * sh * 0.5);
            g.rotation.y += dt * 0.03;
        }
    });

    return (
        <group>
            <mesh ref={bgRef} raycast={() => null} renderOrder={-10}>
                <sphereGeometry args={[80, 32, 20]} />
                <meshBasicMaterial color="#05060d" side={THREE.BackSide} depthWrite={false} />
            </mesh>
            <group ref={groupRef}>
                <instancedMesh ref={somaRef} args={[undefined, undefined, NEURON_COUNT]} frustumCulled={false} raycast={() => null}>
                    <icosahedronGeometry args={[1, 2]} />
                    <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
                <lineSegments geometry={edgeGeometry} raycast={() => null}>
                    <lineBasicMaterial vertexColors transparent opacity={0.9} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
                </lineSegments>
                <lineSegments geometry={dendriteGeometry} raycast={() => null}>
                    <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
                </lineSegments>
                <points geometry={haloGeometry} raycast={() => null}>
                    <pointsMaterial vertexColors size={1.25} map={tex} alphaMap={tex} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                </points>
                <points geometry={sparkGeometry} raycast={() => null}>
                    <pointsMaterial vertexColors size={0.16} map={tex} alphaMap={tex} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
                </points>
                <lineSegments geometry={grownGeometry} raycast={() => null}>
                    <lineBasicMaterial color="#8fffb8" transparent opacity={0.8} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
                </lineSegments>
                <instancedMesh ref={impulseRef} args={[undefined, undefined, MAX_IMPULSES]} frustumCulled={false} raycast={() => null}>
                    <sphereGeometry args={[0.07, 10, 8]} />
                    <meshBasicMaterial toneMapped={false} />
                </instancedMesh>

                {FACTOR_NEURONS.map((f, i) => {
                    const factor = FACTORS_DATA[f.id];
                    const isRev = !!reversed[f.id];
                    const active = focusId === f.id;
                    return (
                        <group key={f.id}>
                            {/* Зона клика по нейрону: из отрисовки убрана,
                                лучи её по-прежнему находят — см. FactorMarker */}
                            <mesh
                                ref={(el) => { hitRefs.current[i] = el; }}
                                position={f.pos}
                                visible={false}
                                onClick={(e) => { e.stopPropagation(); setActiveFactor(f.id); setMindFocus(f.id); }}
                                onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
                                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                            >
                                <sphereGeometry args={[0.5, 10, 8]} />
                                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                            </mesh>
                            <Billboard ref={(el) => { labelRefs.current[i] = el; }} position={f.pos}>
                                <Text
                                    font="/Roboto-Regular.ttf"
                                    fontSize={active ? 0.3 : 0.22}
                                    letterSpacing={0.12}
                                    color={active ? '#ffffff' : '#c8d4ff'}
                                    fillOpacity={active ? 1 : 0.7}
                                    anchorX="center"
                                    anchorY="top"
                                    outlineColor="#000000"
                                    outlineWidth={0.012}
                                    raycast={() => null}
                                >
                                    {(isRev ? factor.reverseName : factor.name).toUpperCase()}
                                </Text>
                            </Billboard>
                        </group>
                    );
                })}
            </group>
        </group>
    );
}
