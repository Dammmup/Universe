import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store';
import { FACTORS_DATA } from '../data/factors';
import { withEchoes } from '../data/consequences';
import { FACTOR_NEURONS, visibleNeurons } from '../data/mind';
import { seededRandom } from '../lib/geo';

/**
 * «Разум» — сеть нейронов внутри головы.
 *
 * Каждый подписанный нейрон — фактор психики, и клик по нему переводит всю
 * сеть в его режим. Режимы не повторяют друг друга: у каждого свой рисунок
 * запуска (откуда и куда идут импульсы) и свой характер движения импульса по
 * аксону. Это условная картинка того, что окружение делает с нейронами:
 *
 *   покой      — импульсы хаотично и медленно дотекают до соседей;
 *   внимание   — много импульсов от А до Б по параллельным маршрутам:
 *                выходят разом и приходят разом, за одно и то же время;
 *   гнев       — импульсы разного радиуса колеблются, тормозят у цели и
 *                срываются назад, прежде чем дойти;
 *   стресс     — нейроны по одному темнеют, отрываются и падают из сети;
 *                восстановление возвращает их на места.
 *
 * Движок один: импульсы бегут по рёбрам графа между живыми позициями
 * нейронов, при приёме нейрон вспыхивает и толкается. Импульс несёт с собой
 * режим, в котором родился, — смена режима не ломает тех, кто уже в пути.
 */

const NEURON_COUNT = 64;
const MAX_IMPULSES = 640;
/** Сколько светящихся «хвостов» тянется за головой импульса. */
const TRAIL = 4;
/** Сколько отрезков в изогнутом аксоне. */
const EDGE_SEG = 7;
const MAX_SPARKS = 320;
const MAX_BEAMS = 48;
const damp = THREE.MathUtils.damp;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

const FACTOR_IDS = FACTOR_NEURONS.map((f) => f.id);

/**
 * Режимы сети.
 *
 * color/bg — цвет сети и фона, shake — тряска кадра.
 * pattern — правило запуска: откуда и куда идут импульсы, rate — запусков в
 * секунду, speed — скорость, hop — фиксированное время на перегон (тогда все
 * импульсы идут шаг в шаг, независимо от длины аксона).
 * motion — как импульс движется по аксону, size — разброс радиусов.
 * Остальные поля деформируют саму сеть (sag, contract, split, decay...).
 */
const MODES = {
    // Покой: хаотично и медленно, импульсы плывут, чуть отклоняясь от аксона
    idle: { color: '#9fb8ff', bg: '#05060d', rate: 3.2, speed: 0.4, pattern: 'random', motion: 'drift', size: [0.5, 1.1], drift: 0.15 },
    attention: [
        // Поток: много импульсов по нескольким маршрутам от А к Б, выходят
        // разом и приходят разом — путь любой длины занимает одно и то же время
        { color: '#3fb0ff', bg: '#020a1a', rate: 4, transit: 2.2, pattern: 'route', motion: 'steady', size: [0.85, 0.85], dim: 0.6, still: 0.85, heat: [1.1, 0.6], bump: 0.35, beacon: 1, trail: 10 },
        // Расфокус: импульсы бродят по случайным соседям и никуда не приходят
        { color: '#a08cc0', bg: '#0a0810', rate: 6, speed: 0.9, pattern: 'wander', motion: 'drift', size: [0.4, 0.9], drift: 0.6 },
    ],
    memory: [
        // Память: один и тот же путь проигрывается снова и оставляет след
        { color: '#ffc870', bg: '#120a02', rate: 0.6, hop: 0.26, pattern: 'replay', motion: 'steady', size: [0.9, 1.2], heat: [2.4, 0.07] },
        // Амнезия: каждый раз новый путь, импульсы рассыпаются на полпути
        { color: '#7a6a5a', bg: '#060504', rate: 0.9, hop: 0.3, pattern: 'replay', fresh: true, motion: 'dissolve', size: [0.8, 1.1], fade: 1 },
    ],
    abstraction: [
        // Абстракция: прыжки через пространство между дальними областями
        { color: '#4ff0ff', bg: '#021216', rate: 2.4, speed: 0.8, pattern: 'leap', motion: 'steady', size: [0.9, 1.5], trail: 5 },
        // Буквальность: сеть застыла, короткие механические шаги к соседу
        { color: '#90a0a0', bg: '#050808', rate: 9, speed: 2.4, pattern: 'short', motion: 'tick', size: [0.35, 0.5], still: 1, trail: 40 },
    ],
    speech: [
        // Речь: слова — пачки слогов слева направо с паузами между ними
        { color: '#fff06a', bg: '#121002', rate: 0.75, hop: 0.11, pattern: 'sequence', motion: 'steady', size: [0.8, 1.1], bump: 1 },
        // Немота: слова упираются в стену посередине и копятся у неё
        { color: '#8a8660', bg: '#060604', rate: 0.75, hop: 0.11, pattern: 'sequence', wall: true, motion: 'steady', size: [0.8, 1.1] },
    ],

    anger: [
        // Гнев: разные радиусы, колебания, торможение и срыв назад у цели
        { color: '#ff3a2a', bg: '#2a0404', shake: 0.07, rate: 1, speed: 1.5, pattern: 'cascade', motion: 'surge', size: [0.45, 2], bump: 1.4, trail: 7 },
        // Кротость: тихое кольцо от нейрона, импульсы тают, не толкая соседей
        { color: '#8fffc8', bg: '#04120c', rate: 0.5, speed: 0.45, pattern: 'radiate', motion: 'absorb', size: [1.3, 1.5], bump: 0.1 },
    ],
    fear: [
        // Страх: сеть сжимается, импульсы рывками сбегаются к очагу страха
        { color: '#a060ff', bg: '#0c0418', shake: 0.03, rate: 5, speed: 1.6, pattern: 'converge', motion: 'stutter', size: [0.5, 0.9], contract: 1 },
        // Безрассудство: импульсы пролетают цель насквозь и уходят из сети
        { color: '#ff9a3a', bg: '#1a0c02', rate: 6, speed: 2.4, pattern: 'random', motion: 'overshoot', size: [0.7, 1.2], expand: 1, trail: 6 },
    ],
    joy: [
        // Радость: импульсы скачут дугами по волне и рассыпают искры
        { color: '#ffd84a', bg: '#1a1202', rate: 1.4, speed: 1.2, pattern: 'cascade', motion: 'hop', size: [0.8, 1.3], bump: 1.6, sparkle: 1 },
        // Ангедония: сигнал доходит, но принявший нейрон не отзывается
        { color: '#6a6a70', bg: '#050506', rate: 1.2, speed: 0.5, pattern: 'random', motion: 'steady', size: [0.6, 0.8], dead: true, dim: 0.7 },
    ],
    sadness: [
        // Грусть: тяжёлые импульсы провисают и текут вниз, с нейронов капает
        { color: '#4a78d8', bg: '#030818', rate: 2.5, speed: 0.32, pattern: 'down', motion: 'sink', size: [0.9, 1.3], sag: 1, drip: 1 },
        // Принятие: два импульса с концов аксона встречаются и сливаются
        { color: '#c0a8ff', bg: '#0c0a18', rate: 1.1, speed: 0.45, pattern: 'meet', motion: 'steady', size: [0.9, 1.1] },
    ],
    empathy: [
        // Эмпатия: каждое движение повторяется на зеркальной стороне, их держит нить
        { color: '#ff7ac8', bg: '#16040e', rate: 1.8, speed: 0.8, pattern: 'mirror', motion: 'steady', size: [0.9, 1.1] },
        // Отчуждение: нейроны расходятся, импульсы отскакивают обратно
        { color: '#8898a8', bg: '#05070a', rate: 2.5, speed: 0.9, pattern: 'random', motion: 'reflect', size: [0.7, 1], scatter: 1, dim: 0.4 },
    ],
    attachment: [
        // Привязанность: маятник между двумя нейронами, они тянутся друг к другу
        { color: '#ff5f8a', bg: '#14040a', rate: 0.9, speed: 1, pattern: 'pair', motion: 'pendulum', size: [1, 1.3], bond: 1 },
        // Одиночество: нейрон уходит от сети, его сигналы гаснут в пустоте
        { color: '#7890aa', bg: '#04060a', rate: 1.6, speed: 0.6, pattern: 'isolate', motion: 'dissolve', size: [0.8, 1], isolate: 1 },
    ],
    emotion: [
        // Эмоция целиком: волны от одного очага, каждая своего оттенка
        { color: '#ff9ad0', bg: '#12040c', rate: 1.2, speed: 1.3, pattern: 'cascade', motion: 'steady', size: [0.8, 1.2], rainbow: 1, bump: 1.2 },
        // Онемение: сеть замёрзла, импульсы едва ползут
        { color: '#707078', bg: '#050506', rate: 0.8, speed: 0.1, pattern: 'random', motion: 'steady', size: [0.3, 0.4], still: 1, dim: 0.8 },
    ],

    motivation: [
        // Мотивация: бегун к дальней цели разгоняется с каждым перегоном
        { color: '#ffb03a', bg: '#140a02', rate: 1.1, hop: 0.42, pattern: 'goal', motion: 'accel', size: [1, 1.3], beacon: 1, trail: 6 },
        // Апатия: тот же путь, но бегун замедляется и встаёт на полдороге
        { color: '#8a8070', bg: '#060504', rate: 1, hop: 0.42, pattern: 'goal', motion: 'decel', size: [0.9, 1.1], dim: 0.5 },
    ],
    curiosity: [
        // Любопытство: прорастает новыми связями к незнакомым нейронам
        { color: '#5fff9a', bg: '#02120a', rate: 1.6, speed: 1.1, pattern: 'grow', motion: 'steady', size: [0.9, 1.2] },
        // Равнодушие: импульс ходит по одному маленькому кругу
        { color: '#7f9488', bg: '#040605', rate: 1, hop: 0.36, pattern: 'loop', motion: 'steady', size: [0.9, 1.1], dim: 0.4 },
    ],

    sleep: [
        // Сон: медленные волны фронтом через всю сеть, сеть дышит
        { color: '#4a5ad8', bg: '#02030c', rate: 0.3, speed: 0.45, pattern: 'wave', motion: 'steady', size: [0.9, 1.2], breathe: 0.7 },
        // Бессонница: мелкий быстрый треск, нейроны мигают невпопад
        { color: '#e8f0ff', bg: '#0c0e14', shake: 0.01, rate: 12, speed: 2.4, pattern: 'random', motion: 'steady', size: [0.3, 0.5], drift: 0.35, flicker: 1 },
    ],
    dreaming: [
        // Сновидение: импульсы отрываются от аксонов и плывут по воздуху
        { color: '#b08cff', bg: '#0a0620', rate: 2.2, speed: 0.4, pattern: 'random', long: true, motion: 'float', size: [0.8, 1.4], drift: 1, trail: 3, hue: 0.12 },
        // Пустой сон: почти ничего, редкий слабый отблеск
        { color: '#40405a', bg: '#020204', rate: 0.25, speed: 0.3, pattern: 'random', motion: 'steady', size: [0.6, 0.8], dim: 0.9 },
    ],
    stress: [
        // Стресс: мелкая дрожь сигналов, нейроны темнеют и отпадают
        { color: '#ff7a2a', bg: '#1a0802', shake: 0.035, rate: 10, speed: 2.4, pattern: 'random', motion: 'jitter', size: [0.4, 0.8], decay: 1 },
        // Восстановление: упавшие нейроны поднимаются на места, сеть дышит
        { color: '#4fe0c8', bg: '#021210', rate: 0.6, speed: 0.6, pattern: 'pulse', motion: 'steady', size: [0.9, 1.2], regrow: 1, breathe: 1 },
    ],
    identity: [
        // Идентичность: всё стекается к центру — к «Я»
        { color: '#ffffff', bg: '#08080c', rate: 2.5, hop: 0.3, pattern: 'converge', root: 'center', motion: 'steady', size: [0.8, 1.1] },
        // Диссоциация: две половины сети расходятся и живут порознь
        { color: '#b0a0c8', bg: '#08060c', rate: 3, speed: 1, pattern: 'random', motion: 'drift', size: [0.7, 1], split: 1 },
    ],
};

/** Параметры сети, которые плавно перетекают между режимами. */
const NET_PARAMS = ['drift', 'still', 'sag', 'contract', 'expand', 'split', 'isolate', 'scatter', 'dim', 'breathe', 'fade', 'bond'];

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
    const unit = () => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    nodes.forEach((n, i) => {
        n.index = i;
        n.phase = rand() * 10;
        // Своё направление ухода: отчуждение разводит нейроны неровно
        n.away = unit();
    });

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

    // Аксоны не прямые: у каждого свой изгиб, как у настоящего отростка
    const bends = edges.map(() => new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.9));
    const edgeIndex = new Map();
    edges.forEach(([a, b], e) => {
        edgeIndex.set(`${a}-${b}`, { e, dir: 1 });
        edgeIndex.set(`${b}-${a}`, { e, dir: -1 });
    });

    // Зеркальный двойник каждого нейрона — для эмпатии
    const mirror = nodes.map((n) => {
        let best = n.index;
        let bd = Infinity;
        nodes.forEach((m, j) => {
            const d = Math.hypot(m.base.x + n.base.x, m.base.y - n.base.y, m.base.z - n.base.z);
            if (d < bd) { bd = d; best = j; }
        });
        return best;
    });

    // Дендриты: дерево отростков вокруг тела нейрона — ствол, развилка и
    // веточки. Смещения хранятся относительно тела и едут вместе с ним.
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

    // Порядок «речи»: нейроны средней полосы слева направо
    const sequence = nodes
        .map((n, i) => i)
        .filter((i) => Math.abs(nodes[i].base.y) < 1.8)
        .sort((a, b) => nodes[a].base.x - nodes[b].base.x);

    return { nodes, edges, neighbors, bends, edgeIndex, mirror, dendrites, sequence };
}

/** Точка на изогнутом аксоне ребра e при параметре u (0 — начало ребра). */
function axonPoint(net, pos, e, u, out) {
    const [a, b] = net.edges[e];
    return bezier(pos[a], pos[b], net.bends[e], 0.35 * pos[a].distanceTo(pos[b]), u, out);
}

/** Квадратичная дуга от pa к pb, выгнутая вдоль bend на величину lift. */
function bezier(pa, pb, bend, lift, u, out) {
    const cx = (pa.x + pb.x) / 2 + bend.x * lift;
    const cy = (pa.y + pb.y) / 2 + bend.y * lift;
    const cz = (pa.z + pb.z) / 2 + bend.z * lift;
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

/** Самый дальний от src нейрон — цель мотивации и конец маршрута внимания. */
function farthest(net, src) {
    const from = net.nodes[src].base;
    return net.nodes.reduce((best, n, i) => (n.base.distanceTo(from) > net.nodes[best].base.distanceTo(from) ? i : best), src);
}

/**
 * Несколько непересекающихся путей от src к target: каждый следующий ищется
 * в обход внутренних нейронов уже найденных, так маршруты идут параллельно.
 */
function parallelRoutes(net, src, target, count) {
    const banned = new Set();
    const routes = [];
    for (let k = 0; k < count; k += 1) {
        const prev = new Array(net.nodes.length).fill(-1);
        const seen = new Set([src]);
        const queue = [src];
        while (queue.length) {
            const v = queue.shift();
            if (v === target) break;
            net.neighbors[v].forEach(({ to }) => {
                if (seen.has(to) || banned.has(to)) return;
                // Прямой перескок от А к Б не маршрут — так «состав» не виден
                if (v === src && to === target) return;
                seen.add(to);
                prev[to] = v;
                queue.push(to);
            });
        }
        if (prev[target] < 0) break;
        const path = [];
        for (let v = target; v !== -1; v = prev[v]) path.unshift(v);
        path.slice(1, -1).forEach((v) => banned.add(v));
        routes.push(path);
    }
    return routes.length ? routes : [bfsPath(net, src, target)];
}

/** Маленький круг вокруг src: треугольник, если он есть, иначе челнок к соседу. */
function smallCycle(net, src) {
    for (const { to: a } of net.neighbors[src]) {
        for (const { to: b } of net.neighbors[a]) {
            if (b !== src && net.neighbors[b].some((x) => x.to === src)) return [src, a, b];
        }
    }
    const nb = net.neighbors[src][0];
    return nb ? [src, nb.to] : [src];
}

/**
 * Светящаяся точка с размером в мировых единицах: импульсы, ореолы и искры.
 * У PointsMaterial размер один на всё облако, а здесь у каждой точки свой —
 * гнев с импульсами разного радиуса без этого не нарисовать.
 */
function glowMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: { uScale: { value: 500 } },
        vertexShader: /* glsl */ `
            attribute float aSize;
            attribute vec3 aColor;
            uniform float uScale;
            varying vec3 vColor;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = aSize * uScale / max(0.001, -mv.z);
                gl_Position = projectionMatrix * mv;
                vColor = aColor;
            }
        `,
        fragmentShader: /* glsl */ `
            varying vec3 vColor;
            void main() {
                float r = length(gl_PointCoord - 0.5) * 2.0;
                if (r > 1.0) discard;
                // Плотное ядро и мягкий ореол: точка читается как свет, а не диск
                float core = exp(-r * r * 16.0);
                float halo = pow(1.0 - r, 2.4) * 0.5;
                gl_FragColor = vec4(vColor * (core + halo), 1.0);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
}

function pointsGeometry(count) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
    g.setDrawRange(0, 0);
    return g;
}

function linesGeometry(segments) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 6), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(segments * 6), 3));
    return g;
}

/** Нейрон жив, падает или уже выпал из сети (стресс). */
const ALIVE = 0;
const DYING = 1;
const FALLING = 2;
const GONE = 3;

const UP = new THREE.Vector3(0, 1, 0);
/** Цвет обугленного нейрона: стресс выжигает, восстановление начинает с него. */
const ASH = new THREE.Color(0.2, 0.11, 0.08);
const V1 = new THREE.Vector3();
const V2 = new THREE.Vector3();

export default function Mind() {
    const setActiveFactor = useStore((s) => s.setActiveFactor);
    const rawReversed = useStore((s) => s.reversedFactors);
    const reversed = useMemo(() => withEchoes(rawReversed), [rawReversed]);
    // «Меньше движения»: кадр не трясётся ни в гневе, ни в стрессе
    const calm = useStore((s) => s.calm);

    const net = useMemo(() => buildNetwork(), []);
    // Режим живёт дольше карточки: закрыли окно — сеть остаётся в состоянии
    // выбранного нейрона, пока не выбран другой
    const focusId = useStore((s) => s.mindFocus);
    const setMindFocus = useStore((s) => s.setMindFocus);
    // Подписаны нейроны одной системы: семнадцать разом не читались и ставили
    // рядом разные уровни — «Эмоцию» с её же гневом. Фильтр — в MindPanel.
    const system = useStore((s) => s.mindSystem);
    const labelled = useMemo(() => visibleNeurons(system, focusId), [system, focusId]);
    const labelledIds = useMemo(() => new Set(labelled.map((f) => f.id)), [labelled]);
    const focusIndex = focusId ? FACTOR_IDS.indexOf(focusId) : -1;
    const isReversed = focusId ? !!reversed[focusId] : false;
    const mode = focusId ? modeFor(focusId, isReversed) : MODES.idle;

    const groupRef = useRef();
    const somaRef = useRef();
    const bgRef = useRef();
    const labelRefs = useRef([]);
    const hitRefs = useRef([]);

    // Живое состояние движка — меняется каждый кадр, React его не видит
    const sim = useMemo(() => ({
        pos: net.nodes.map((n) => n.base.clone()),
        bump: new Float32Array(NEURON_COUNT),
        glow: new Float32Array(NEURON_COUNT),
        health: new Float32Array(NEURON_COUNT).fill(1),
        fall: new Float32Array(NEURON_COUNT),
        fallV: new Float32Array(NEURON_COUNT),
        state: new Uint8Array(NEURON_COUNT),
        delay: new Float32Array(NEURON_COUNT),
        heat: new Float32Array(net.edges.length),
        impulses: Array.from({ length: MAX_IMPULSES }, () => ({
            live: false,
            p: new THREE.Vector3(),
            n: new THREE.Vector3(),
            trail: Array.from({ length: TRAIL }, () => new THREE.Vector3()),
            color: new THREE.Color(),
        })),
        cursor: 0,
        queue: [],
        timer: 0,
        decayTimer: 0,
        wave: 0,
        visited: new Map(),
        replay: null,
        route: null,
        routes: null,
        parents: null,
        cycle: null,
        partner: -1,
        goal: -1,
        grown: [],
        color: new THREE.Color('#9fb8ff'),
        bg: new THREE.Color('#05060d'),
        target: new THREE.Color(),
        tmp: new THREE.Object3D(),
        tmpColor: new THREE.Color(),
        shake: 0,
        axon: Array.from({ length: EDGE_SEG + 1 }, () => new THREE.Vector3()),
        sparks: Array.from({ length: MAX_SPARKS }, () => ({ life: 0, decay: 1, grav: 0, size: 0.1, p: new THREE.Vector3(), v: new THREE.Vector3(), color: new THREE.Color() })),
        params: Object.fromEntries(NET_PARAMS.map((k) => [k, 0])),
    }), [net]);

    // Смена режима начинает всё с чистого листа: новые маршруты, новая волна.
    // Импульсы в пути доживают своё, но цепочки дальше не продолжают.
    useEffect(() => {
        const m = mode;
        const src = focusIndex >= 0 ? focusIndex : 0;
        sim.visited.clear();
        sim.queue.length = 0;
        sim.timer = 0;
        sim.replay = null;
        sim.grown = [];
        sim.impulses.forEach((imp) => { imp.last = true; });
        sim.goal = m.pattern === 'goal' || m.pattern === 'route' ? farthest(net, src) : -1;
        sim.route = sim.goal >= 0 ? bfsPath(net, src, sim.goal) : null;
        sim.routes = m.pattern === 'route' && sim.goal >= 0 ? parallelRoutes(net, src, sim.goal, 6) : null;
        sim.parents = m.pattern === 'converge' ? bfsParents(net, m.root === 'center' ? 0 : src) : null;
        sim.cycle = m.pattern === 'loop' ? smallCycle(net, src) : null;
        sim.partner = -1;
        if (m.pattern === 'pair') {
            const from = net.nodes[src].base;
            sim.partner = net.neighbors[src].reduce((best, { to }) => (best < 0 || net.nodes[to].base.distanceTo(from) < net.nodes[best].base.distanceTo(from) ? to : best), -1);
        }
        // Стресс отпускает: выпавшие нейроны возвращаются сами
        if (!m.decay) sim.state.fill(ALIVE);
        // Восстановление начинается с разорённой сети: нейроны лежат внизу и
        // поднимаются по очереди — от центра к краям
        if (m.regrow) {
            const order = net.nodes.map((n, i) => i).sort((a, b) => net.nodes[a].base.length() - net.nodes[b].base.length());
            order.forEach((i, rank) => {
                if (i === 0) return;
                if (sim.fall[i] > -1) sim.fall[i] = -(2 + Math.random() * 3);
                sim.health[i] = Math.min(sim.health[i], 0.12);
                sim.delay[i] = 0.4 + rank * 0.07;
            });
        } else {
            sim.delay.fill(0);
        }
    }, [mode, focusIndex, net, sim]);

    const edgeGeometry = useMemo(() => linesGeometry(net.edges.length * EDGE_SEG), [net]);
    const dendriteGeometry = useMemo(() => linesGeometry(net.dendrites.length), [net]);
    const beamGeometry = useMemo(() => linesGeometry(MAX_BEAMS), []);
    const haloGeometry = useMemo(() => pointsGeometry(NEURON_COUNT), []);
    const impulseGeometry = useMemo(() => pointsGeometry(MAX_IMPULSES * (TRAIL + 1)), []);
    const sparkGeometry = useMemo(() => pointsGeometry(MAX_SPARKS), []);
    const glow = useMemo(() => glowMaterial(), []);
    useEffect(() => () => {
        [edgeGeometry, dendriteGeometry, beamGeometry, haloGeometry, impulseGeometry, sparkGeometry, glow].forEach((g) => g.dispose());
    }, [edgeGeometry, dendriteGeometry, beamGeometry, haloGeometry, impulseGeometry, sparkGeometry, glow]);

    useFrame((state, delta) => {
        const dt = Math.min(delta, 0.05);
        const t = state.clock.elapsedTime;
        const m = mode;
        const P = sim.params;
        const src = focusIndex >= 0 ? focusIndex : 0;

        // Точка размером в мировых единицах: масштаб от высоты кадра и угла обзора
        const cam = state.camera;
        glow.uniforms.uScale.value = (state.size.height * state.gl.getPixelRatio()) / (2 * Math.tan(THREE.MathUtils.degToRad((cam.fov ?? 60) / 2)));

        // Плавный переход параметров режима
        NET_PARAMS.forEach((k) => { P[k] = damp(P[k], m[k] ?? 0, 1.4, dt); });
        sim.color.lerp(sim.target.set(m.color), 1 - Math.exp(-dt * 3));
        sim.bg.lerp(sim.target.set(m.bg), 1 - Math.exp(-dt * 2));
        sim.shake = damp(sim.shake, calm ? 0 : (m.shake ?? 0), 3, dt);

        // ─── Жизнь нейронов: стресс выбивает их по одному ────────────────
        const { health, fall, fallV } = sim;
        if (m.decay) {
            sim.decayTimer += dt;
            if (sim.decayTimer > 0.55) {
                sim.decayTimer = 0;
                let gone = 0;
                for (let i = 0; i < NEURON_COUNT; i += 1) if (sim.state[i] !== ALIVE) gone += 1;
                if (gone < NEURON_COUNT * 0.42) {
                    // Очаг стресса и «Я» держатся дольше всех
                    const i = 1 + Math.floor(Math.random() * (NEURON_COUNT - 1));
                    if (i !== src && sim.state[i] === ALIVE && health[i] > 0.9) sim.state[i] = DYING;
                } else {
                    // Сеть не пустеет до конца: самый давний выпавший прорастает заново
                    for (let i = 1; i < NEURON_COUNT; i += 1) {
                        if (sim.state[i] === GONE) { sim.state[i] = ALIVE; fall[i] = -1.5; break; }
                    }
                }
            }
        }
        for (let i = 0; i < NEURON_COUNT; i += 1) {
            switch (sim.state[i]) {
                case DYING:
                    // Темнеет: сигнал в нём ещё теплится, но всё слабее
                    health[i] = Math.max(0.12, health[i] - dt / 1.6);
                    if (health[i] <= 0.12) { sim.state[i] = FALLING; fallV[i] = 0; spawnAsh(sim, sim.pos[i]); }
                    break;
                case FALLING:
                    // Оторвался и падает, догорая
                    fallV[i] += dt * 3.2;
                    fall[i] -= fallV[i] * dt;
                    health[i] = 0.12 * clamp01(1 + fall[i] / 5);
                    if (fall[i] < -6) sim.state[i] = GONE;
                    break;
                case GONE:
                    health[i] = 0;
                    break;
                default:
                    if (sim.delay[i] > 0) {
                        sim.delay[i] -= dt;
                    } else {
                        health[i] = damp(health[i], 1, 1.3, dt);
                        fall[i] = damp(fall[i], 0, 1.6, dt);
                    }
            }
        }

        // ─── Позиции нейронов: живые, с деформацией режима ────────────────
        const center = sim.pos[0];
        const wob = (0.06 + P.drift * 0.5) * (1 - P.still * 0.92);
        net.nodes.forEach((n, i) => {
            const p = sim.pos[i];
            const b = n.base;
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
            // Отчуждение: каждый нейрон уходит от соседей в свою сторону
            p.addScaledVector(n.away, P.scatter * (0.5 + 0.5 * Math.sin(n.phase)) * 1.1);
            // Одиночество: нейрон привязанности уходит от сети
            if (n.factor === 'attachment' && P.isolate > 0.001) p.addScaledVector(V1.copy(b).normalize(), P.isolate * 2.4);
            // Толчок при приёме импульса
            if (sim.bump[i] > 0.01 && i !== 0) p.addScaledVector(V1.copy(p).sub(center).normalize(), sim.bump[i] * 0.12);
            // Выпавший нейрон уходит вниз, чуть сносясь в сторону
            if (fall[i] < -0.001) {
                p.y += fall[i];
                p.x += Math.sin(n.phase * 3) * fall[i] * 0.15;
            }
            sim.bump[i] = damp(sim.bump[i], 0, 6, dt);
            sim.glow[i] = damp(sim.glow[i], 0, 3.2, dt);
            // Бессонница: нейроны вспыхивают невпопад
            if (m.flicker && Math.random() < dt * 0.9) sim.glow[i] = 1.3;
        });
        // Привязанность: двое тянутся друг к другу
        if (P.bond > 0.01 && sim.partner >= 0) {
            const pa = sim.pos[src];
            const pb = sim.pos[sim.partner];
            V1.copy(pb).sub(pa).multiplyScalar(0.18 * P.bond * (0.8 + 0.2 * Math.sin(t * 2.4)));
            pa.add(V1);
            pb.sub(V1);
        }
        // Мотивация: цель горит маяком
        if (m.beacon && sim.goal >= 0) sim.glow[sim.goal] = Math.max(sim.glow[sim.goal], 0.6 + 0.4 * Math.sin(t * 4));

        // ─── Запуск импульсов ─────────────────────────────────────────────
        const alloc = () => {
            for (let k = 0; k < MAX_IMPULSES; k += 1) {
                const i = (sim.cursor + k) % MAX_IMPULSES;
                if (!sim.impulses[i].live) {
                    sim.cursor = i + 1;
                    return sim.impulses[i];
                }
            }
            return null;
        };
        /** Поставить импульс на перегон a → b: по аксону, если он есть, иначе дугой. */
        const hop = (imp, a, b) => {
            imp.a = a;
            imp.b = b;
            imp.t = 0;
            imp.lin = 0;
            const link = net.edgeIndex.get(`${a}-${b}`);
            imp.e = link ? link.e : -1;
            imp.dir = link ? link.dir : 1;
            const len = sim.pos[a].distanceTo(sim.pos[b]);
            imp.len = len;
            imp.dur = imp.hopDur ?? (imp.m.hop ? imp.m.hop : Math.max(0.15, len / (2.2 * (imp.m.speed ?? 1))));
        };
        /**
         * Новый импульс. opts.path — цепочка нейронов: импульс пройдёт её всю,
         * перегон за перегоном, и его хвост не порвётся на стыках.
         */
        const fire = (a, b, opts = {}) => {
            if (a === b || health[a] < 0.35 || health[b] < 0.35) return null;
            const imp = alloc();
            if (!imp) return null;
            imp.live = true;
            imp.m = m;
            imp.motion = opts.motion ?? m.motion ?? 'steady';
            imp.wave = opts.wave ?? 0;
            imp.path = opts.path ?? null;
            imp.hopDur = opts.hopDur ?? null;
            imp.k = 0;
            imp.hops = opts.hops ?? 0;
            imp.stop = opts.stop ?? 1;
            imp.arc = opts.arc ?? 0.25;
            imp.partner = null;
            imp.beam = !!opts.beam;
            imp.last = false;
            imp.stuck = false;
            imp.hold = 0;
            imp.passed = false;
            imp.age = 0;
            imp.sign = 1;
            imp.bounces = opts.bounces ?? 0;
            imp.turn = 0.35 + Math.random() * 0.3;
            imp.stopFrac = 0.3 + Math.random() * 0.4;
            imp.seed = Math.random() * 100;
            const [s0, s1] = m.size ?? [1, 1];
            imp.size = s0 + (s1 - s0) * Math.random();
            imp.n.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            if (opts.lift) imp.n.addScaledVector(UP, opts.lift).normalize();
            imp.color.copy(opts.color ?? sim.color);
            if (m.hue) imp.color.offsetHSL((Math.random() - 0.5) * m.hue, 0, 0);
            hop(imp, a, b);
            imp.trail.forEach((v) => v.copy(sim.pos[a]));
            imp.p.copy(sim.pos[a]);
            sim.glow[a] = Math.max(sim.glow[a], 0.8);
            return imp;
        };
        const firePath = (path, opts = {}) => (path.length > 1 ? fire(path[0], path[1], { ...opts, path }) : null);
        const randomEdge = (filter) => {
            for (let k = 0; k < 10; k += 1) {
                const [a, b] = net.edges[Math.floor(Math.random() * net.edges.length)];
                const pair = Math.random() < 0.5 ? [a, b] : [b, a];
                if (!filter || filter(pair[0], pair[1])) return pair;
            }
            return null;
        };
        const dist = (a, b) => net.nodes[a].base.distanceTo(net.nodes[b].base);

        // Отложенные запуски: слоги одного слова идут друг за другом
        for (let k = sim.queue.length - 1; k >= 0; k -= 1) {
            const q = sim.queue[k];
            q.at -= dt;
            if (q.at <= 0) {
                firePath(q.path, q.opts);
                sim.queue.splice(k, 1);
            }
        }

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
                    net.neighbors[src].forEach(({ to }) => fire(src, to, { color, wave: sim.wave }));
                    sim.glow[src] = 1.5;
                    break;
                }
                case 'route': {
                    // Залп по всем маршрутам сразу. Время в пути у всех одно:
                    // на длинном маршруте перегон короче, на коротком — дольше
                    sim.routes?.forEach((path) => firePath(path, { hopDur: m.transit / (path.length - 1) }));
                    sim.glow[src] = 1.2;
                    break;
                }
                case 'wander': {
                    const e = randomEdge();
                    if (e) fire(e[0], e[1], { hops: 2 + Math.floor(Math.random() * 3) });
                    break;
                }
                case 'replay': {
                    if (!sim.replay || m.fresh) {
                        const path = [src];
                        for (let k = 0; k < 7; k += 1) {
                            const nb = net.neighbors[path[path.length - 1]];
                            const pick = m.fresh ? Math.floor(Math.random() * nb.length) : (k * 3 + 1) % nb.length;
                            path.push(nb[pick].to);
                        }
                        sim.replay = path;
                    }
                    // Амнезия теряет нить: импульс рассыпается где-то посреди пути
                    firePath(sim.replay, m.fresh ? { hops: 1 + Math.floor(Math.random() * 4) } : {});
                    break;
                }
                case 'leap': {
                    // Мысль перепрыгивает через пространство между дальними областями
                    const a = Math.floor(Math.random() * NEURON_COUNT);
                    for (let k = 0; k < 8; k += 1) {
                        const b = Math.floor(Math.random() * NEURON_COUNT);
                        if (dist(a, b) > 4) {
                            const imp = fire(a, b, { arc: 0.55, lift: 1.4, beam: true });
                            if (imp) imp.e = -1;
                            break;
                        }
                    }
                    break;
                }
                case 'short': {
                    const e = randomEdge((a, b) => dist(a, b) < 1.6);
                    if (e) fire(e[0], e[1]);
                    break;
                }
                case 'sequence': {
                    // Слово — несколько слогов подряд, потом пауза
                    const syllables = 2 + Math.floor(Math.random() * 3);
                    for (let k = 0; k < syllables; k += 1) sim.queue.push({ at: k * 0.13, path: net.sequence, opts: {} });
                    break;
                }
                case 'down': {
                    const e = randomEdge((a, b) => sim.pos[b].y < sim.pos[a].y - 0.3);
                    if (e) fire(e[0], e[1]);
                    break;
                }
                case 'meet': {
                    // Навстречу друг другу с двух концов — и слияние посередине
                    const e = randomEdge();
                    if (e) {
                        fire(e[0], e[1], { stop: 0.5 });
                        fire(e[1], e[0], { stop: 0.5 });
                    }
                    break;
                }
                case 'mirror': {
                    const e = randomEdge();
                    if (!e) break;
                    const one = fire(e[0], e[1]);
                    // То же движение на зеркальной стороне сети — отражение другого
                    const two = fire(net.mirror[e[0]], net.mirror[e[1]]);
                    if (one && two) { one.partner = two; two.partner = one; }
                    break;
                }
                case 'pair': {
                    if (sim.partner >= 0) fire(src, sim.partner, { bounces: 6 });
                    break;
                }
                case 'radiate': {
                    net.neighbors[src].forEach(({ to }) => fire(src, to));
                    sim.glow[src] = 1;
                    break;
                }
                case 'isolate': {
                    // Сигналы одинокого нейрона гаснут, никого не достигнув
                    const nb = net.neighbors[src];
                    const pick = nb[Math.floor(Math.random() * nb.length)];
                    if (pick) fire(src, pick.to, { stop: 0.35 + Math.random() * 0.3 });
                    break;
                }
                case 'goal': {
                    if (sim.route) firePath(sim.route);
                    break;
                }
                case 'grow': {
                    // Любопытство прорастает новыми связями к случайным нейронам
                    const to = Math.floor(Math.random() * NEURON_COUNT);
                    if (to !== src && health[to] > 0.5) {
                        sim.grown.push({ a: src, b: to, life: 1 });
                        if (sim.grown.length > 24) sim.grown.shift();
                        const imp = fire(src, to, { arc: 0 });
                        if (imp) imp.e = -1;
                    }
                    break;
                }
                case 'loop': {
                    // Один и тот же маленький круг — ничего нового
                    const c = sim.cycle;
                    if (c && c.length > 1) {
                        const path = [];
                        for (let k = 0; k < 4; k += 1) path.push(...c);
                        path.push(c[0]);
                        firePath(path);
                    }
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
                    // Цепочки с окраин к корню: страх — к своему очагу, «Я» — к центру
                    const parent = sim.parents;
                    if (!parent) break;
                    for (let k = 0; k < 3; k += 1) {
                        let v = Math.floor(Math.random() * NEURON_COUNT);
                        const path = [v];
                        while (parent[v] >= 0 && path.length < 12) { v = parent[v]; path.push(v); }
                        firePath(path);
                    }
                    break;
                }
                case 'pulse': {
                    // Из центра — к нейронам, которые уже вернулись на место
                    for (let k = 0; k < 3; k += 1) {
                        const to = Math.floor(Math.random() * NEURON_COUNT);
                        if (health[to] > 0.8 && to !== 0) firePath(bfsPath(net, 0, to));
                    }
                    break;
                }
                default: {
                    let filter = null;
                    if (P.split > 0.3) filter = (a, b) => Math.sign(net.nodes[a].base.x) === Math.sign(net.nodes[b].base.x);
                    else if (m.long) filter = (a, b) => dist(a, b) > 1.8;
                    const e = randomEdge(filter);
                    if (e) fire(e[0], e[1]);
                }
            }
        }

        // ─── Движение импульсов и приём ───────────────────────────────────
        const arrive = (imp, node) => {
            const im = imp.m;
            // Ангедония: сигнал дошёл, а нейрону всё равно; угасающий не отвечает
            if (im.dead || health[node] < 0.4) return;
            sim.bump[node] = Math.min(1.5, sim.bump[node] + (im.bump ?? 0.8) * (imp.motion === 'surge' ? imp.size * 0.7 : 1));
            sim.glow[node] = Math.max(sim.glow[node], 1);
            // Радость: принявший нейрон рассыпает искры во все стороны
            if (im.sparkle) {
                for (let k = 0; k < 6; k += 1) {
                    V1.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(1.2 + Math.random() * 1.6);
                    spawnSpark(sim, sim.pos[node], V1, imp.color, 0.16, 0.9, 0.6);
                }
            }
            // Волна каскада идёт дальше — от принявшего к его соседям
            if (im.pattern === 'cascade' && imp.wave) {
                const seen = sim.visited.get(imp.wave);
                if (seen && !seen.has(node)) {
                    seen.add(node);
                    net.neighbors[node].forEach(({ to }) => {
                        if (!seen.has(to)) {
                            const next = fire(node, to, { color: imp.color, wave: imp.wave });
                            if (next) next.m = im;
                        }
                    });
                }
            }
        };
        /** Перегон пройден: цепочка ведёт импульс дальше или он гаснет. */
        const continueOrDie = (imp) => {
            if (imp.last) { imp.live = false; return; }
            if (imp.path && imp.k + 2 < imp.path.length) {
                imp.k += 1;
                const from = imp.path[imp.k];
                const to = imp.path[imp.k + 1];
                if (health[to] < 0.35) { imp.live = false; return; }
                hop(imp, from, to);
                return;
            }
            if (imp.hops > 0 && !imp.path) {
                // Блуждание: дальше к случайному соседу, только не назад
                imp.hops -= 1;
                const nb = net.neighbors[imp.b].filter((x) => x.to !== imp.a);
                const pick = nb[Math.floor(Math.random() * nb.length)];
                if (pick && health[pick.to] > 0.35) { hop(imp, imp.b, pick.to); return; }
            }
            imp.live = false;
        };

        const heat = sim.heat;
        const [heatGain, heatDecay] = m.heat ?? [0.5, 1.8];
        for (let e = 0; e < heat.length; e += 1) heat[e] *= Math.exp(-dt * heatDecay);

        const ip = impulseGeometry.attributes.position.array;
        const ic = impulseGeometry.attributes.aColor.array;
        const is = impulseGeometry.attributes.aSize.array;
        let n = 0;
        const c = sim.tmpColor;
        sim.impulses.forEach((imp) => {
            if (!imp.live) return;
            const im = imp.m;
            imp.age += dt;
            const base = dt / imp.dur;

            // Характер движения по аксону
            if (imp.stuck) {
                imp.hold += dt;
            } else {
                switch (imp.motion) {
                    case 'surge': {
                        // Рывок вперёд, торможение у цели, срыв назад
                        const osc = Math.sin(imp.age * 6.5 + imp.seed);
                        imp.t = Math.max(0, imp.t + base * (0.7 + 1.9 * osc) * (1 - 0.5 * imp.t));
                        break;
                    }
                    case 'stutter':
                        // Замер — рывок — замер: так бегут от опасности
                        imp.t += base * (Math.sin(imp.age * 11 + imp.seed) > 0.15 ? 2.4 : 0.04);
                        break;
                    case 'tick':
                        imp.lin += base;
                        imp.t = Math.floor(imp.lin * 4) / 4;
                        break;
                    case 'accel': {
                        const prog = imp.path ? (imp.k + imp.t) / (imp.path.length - 1) : imp.t;
                        imp.t += base * (0.35 + 2.6 * prog * prog);
                        break;
                    }
                    case 'decel': {
                        const prog = imp.path ? (imp.k + imp.t) / (imp.path.length - 1) : imp.t;
                        const left = Math.max(0, 1 - prog / imp.stopFrac);
                        imp.t += base * 1.6 * left;
                        if (left < 0.03) imp.stuck = true;
                        break;
                    }
                    case 'reflect':
                    case 'pendulum':
                        imp.t += base * imp.sign;
                        if (imp.motion === 'reflect' && imp.sign > 0 && imp.t >= imp.turn) imp.sign = -1;
                        break;
                    default:
                        imp.t += base;
                }
            }

            // Немота: стена посередине сети, x = 0
            if (im.wall && !imp.stuck) {
                const xa = sim.pos[imp.a].x;
                const xb = sim.pos[imp.b].x;
                if (xa < 0 && xb >= 0) {
                    const cross = -xa / (xb - xa);
                    if (imp.t >= cross) { imp.t = cross; imp.stuck = true; }
                }
            }

            // Остановка на полпути: рассыпаться, слиться со встречным
            if (!imp.stuck && imp.stop < 1 && imp.t >= imp.stop) {
                imp.t = imp.stop;
                impulsePoint(net, sim, imp, imp.p);
                if (imp.motion === 'dissolve' || im.pattern === 'isolate') {
                    for (let k = 0; k < 5; k += 1) {
                        V1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5);
                        spawnSpark(sim, imp.p, V1, imp.color, 0.09, 1.3, 0);
                    }
                } else {
                    for (let k = 0; k < 4; k += 1) {
                        V1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(0.35);
                        spawnSpark(sim, imp.p, V1, imp.color, 0.3, 0.8, 0);
                    }
                }
                imp.live = false;
                return;
            }
            // Амнезия: импульс теряет нить на одном из перегонов
            if (imp.motion === 'dissolve' && imp.path && imp.hops > 0 && imp.k + 1 >= imp.hops && imp.t > 0.5) {
                imp.stop = 0.5;
            }

            if (imp.stuck && imp.hold > 1.4) { imp.live = false; return; }
            if (imp.motion === 'reflect' && imp.t <= 0) { sim.glow[imp.a] = Math.max(sim.glow[imp.a], 0.5); imp.live = false; return; }
            if (imp.motion === 'pendulum') {
                if (imp.t >= 1 || imp.t <= 0) {
                    arrive(imp, imp.t >= 1 ? imp.b : imp.a);
                    imp.t = clamp01(imp.t);
                    imp.sign *= -1;
                    imp.bounces -= 1;
                    if (imp.bounces <= 0 || imp.last) { imp.live = false; return; }
                }
            } else if (imp.motion === 'overshoot') {
                if (imp.t >= 1 && !imp.passed) { imp.passed = true; arrive(imp, imp.b); }
                if (imp.t >= 1.7) { imp.live = false; return; }
            } else if (imp.t >= 1) {
                arrive(imp, imp.b);
                continueOrDie(imp);
                if (!imp.live) return;
            }

            if (imp.e >= 0) heat[imp.e] = Math.min(1.5, heat[imp.e] + dt * heatGain);

            impulsePoint(net, sim, imp, imp.p);

            // Хвост тянется за головой пружиной — его длина не зависит от частоты кадров
            const follow = 1 - Math.exp(-dt * (im.trail ?? 14));
            let prev = imp.p;
            imp.trail.forEach((v) => { v.lerp(prev, follow); prev = v; });

            // Яркость и радиус: у гнева радиус ещё и пульсирует
            const u = clamp01(imp.t);
            let alpha = Math.min(1, imp.age * 8);
            let size = imp.size;
            if (imp.motion === 'absorb') size *= 1 - 0.8 * u;
            if (imp.motion === 'surge') size *= 1 + 0.35 * Math.sin(imp.age * 9 + imp.seed);
            if (imp.motion === 'dissolve' && imp.stop < 1) alpha *= 1 - clamp01((imp.t - imp.stop + 0.25) / 0.25) * 0.8;
            if (imp.motion === 'overshoot' && imp.t > 1) alpha *= 1 - (imp.t - 1) / 0.7;
            if (imp.stuck) alpha *= 1 - imp.hold / 1.4;
            if (im.dead) alpha *= 0.55;
            imp.alpha = alpha;

            if (n + TRAIL + 1 > MAX_IMPULSES * (TRAIL + 1)) return;
            const head = 0.42 * size;
            writePoint(ip, ic, is, n, imp.p, c.copy(imp.color).multiplyScalar(alpha * 1.4), head);
            n += 1;
            for (let k = 0; k < TRAIL; k += 1) {
                const fallOff = 1 - (k + 1) / (TRAIL + 1);
                writePoint(ip, ic, is, n, imp.trail[k], c.copy(imp.color).multiplyScalar(alpha * fallOff * 0.7), head * (0.35 + 0.55 * fallOff));
                n += 1;
            }
        });
        impulseGeometry.setDrawRange(0, n);
        impulseGeometry.attributes.position.needsUpdate = true;
        impulseGeometry.attributes.aColor.needsUpdate = true;
        impulseGeometry.attributes.aSize.needsUpdate = true;
        // Старые волны не копятся в памяти
        if (sim.visited.size > 12) sim.visited.delete(sim.visited.keys().next().value);

        // ─── Нейроны ─────────────────────────────────────────────────────
        const soma = somaRef.current;
        const tmp = sim.tmp;
        const breathe = P.breathe * (0.5 + 0.5 * Math.sin(t * 0.9));
        const hp = haloGeometry.attributes.position.array;
        const hc = haloGeometry.attributes.aColor.array;
        const hs = haloGeometry.attributes.aSize.array;
        net.nodes.forEach((node, i) => {
            const isFactor = !!node.factor;
            // Нейрон чужой системы остаётся в сети, но держится как рядовой:
            // так фильтр видно в кадре, а не только по подписям
            const named = isFactor && labelledIds.has(node.factor);
            const faded = P.fade * (i % 3 === 0 ? 1 : 0);
            const life = health[i];
            tmp.position.copy(sim.pos[i]);
            const s = (named ? 0.17 : isFactor ? 0.115 : 0.085) * (1 + sim.bump[i] * 0.35) * (1 - faded * 0.6) * (0.4 + 0.6 * Math.min(1, life * 1.4));
            tmp.scale.setScalar(sim.state[i] === GONE ? 0 : s);
            tmp.updateMatrix();
            soma?.setMatrixAt(i, tmp.matrix);
            const light = 0.35 + sim.glow[i] * 0.9 + breathe * 0.6 - P.dim * 0.2;
            c.copy(sim.color).multiplyScalar(Math.max(0.12, light) * (1 - faded * 0.8));
            if (i === focusIndex) c.multiplyScalar(1.6);
            // Угасающий нейрон не просто тускнеет — он обугливается: на тёмном
            // фоне иначе он бы исчез, а не потемнел у зрителя на глазах
            if (life < 0.995) {
                c.lerp(ASH, 1 - clamp01((life - 0.12) / 0.88));
                if (sim.state[i] === FALLING) c.multiplyScalar(clamp01(1 + fall[i] / 6));
            }
            soma?.setColorAt(i, c);

            hp[i * 3] = sim.pos[i].x; hp[i * 3 + 1] = sim.pos[i].y; hp[i * 3 + 2] = sim.pos[i].z;
            const lum = (isFactor ? 0.4 : 0.2) + sim.glow[i] * 0.6 + breathe * 0.3 - P.dim * 0.15;
            c.copy(sim.color).multiplyScalar(Math.max(0.04, lum) * life);
            hc[i * 3] = c.r; hc[i * 3 + 1] = c.g; hc[i * 3 + 2] = c.b;
            hs[i] = (named ? 0.95 : isFactor ? 0.7 : 0.5) * (0.85 + sim.glow[i] * 0.35);

            if (named) {
                const fi = FACTOR_IDS.indexOf(node.factor);
                const label = labelRefs.current[fi];
                if (label) {
                    label.position.set(sim.pos[i].x, sim.pos[i].y - 0.42, sim.pos[i].z);
                    label.scale.setScalar(clamp01(life * 1.6));
                }
                const hit = hitRefs.current[fi];
                if (hit) hit.position.copy(sim.pos[i]);
            }
        });
        if (soma) {
            soma.instanceMatrix.needsUpdate = true;
            if (soma.instanceColor) soma.instanceColor.needsUpdate = true;
        }
        haloGeometry.setDrawRange(0, NEURON_COUNT);
        haloGeometry.attributes.position.needsUpdate = true;
        haloGeometry.attributes.aColor.needsUpdate = true;
        haloGeometry.attributes.aSize.needsUpdate = true;

        // ─── Аксоны: светятся у активных нейронов и там, где прошёл сигнал ──
        const ep = edgeGeometry.attributes.position.array;
        const ec = edgeGeometry.attributes.color.array;
        const pts = sim.axon;
        let o = 0;
        net.edges.forEach(([a, b], e) => {
            let k = 0.1 + Math.max(sim.glow[a], sim.glow[b]) * 0.35 + breathe * 0.2 + heat[e] * 0.55;
            k *= 1 - P.dim * 0.6;
            if (P.split > 0.3 && Math.sign(net.nodes[a].base.x) !== Math.sign(net.nodes[b].base.x)) k *= 1 - P.split;
            if (P.isolate > 0.3 && (net.nodes[a].factor === 'attachment' || net.nodes[b].factor === 'attachment')) k *= 1 - P.isolate;
            if (P.scatter > 0.3) k *= 1 - P.scatter * 0.5;
            // Связь с выпавшим нейроном рвётся сразу, а не тянется за ним вниз
            if (sim.state[a] >= FALLING || sim.state[b] >= FALLING) k = 0;
            else k *= Math.min(health[a], health[b]);
            for (let s = 0; s <= EDGE_SEG; s += 1) axonPoint(net, sim.pos, e, s / EDGE_SEG, pts[s]);
            for (let s = 0; s < EDGE_SEG; s += 1) {
                const p0 = pts[s];
                const p1 = pts[s + 1];
                ep[o] = p0.x; ep[o + 1] = p0.y; ep[o + 2] = p0.z;
                ep[o + 3] = p1.x; ep[o + 4] = p1.y; ep[o + 5] = p1.z;
                // К середине аксон тускнеет: ярко у тел нейронов, где сигнал рождается
                const fallOff = 0.65 + 0.35 * Math.abs(s / EDGE_SEG - 0.5) * 2;
                c.copy(sim.color).multiplyScalar(k * fallOff);
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
        const still = 1 - P.still;
        net.dendrites.forEach((d, j) => {
            const base = sim.pos[d.node];
            const grow = (1 + sim.bump[d.node] * 0.25) * Math.min(1, health[d.node] * 1.5);
            const sway = Math.sin(t * 1.2 + d.node + j * 0.3) * 0.03 * still;
            const k2 = j * 6;
            dp[k2] = base.x + d.a.x * grow + sway; dp[k2 + 1] = base.y + d.a.y * grow; dp[k2 + 2] = base.z + d.a.z * grow;
            dp[k2 + 3] = base.x + d.b.x * grow + sway * 2; dp[k2 + 4] = base.y + d.b.y * grow + sway; dp[k2 + 5] = base.z + d.b.z * grow;
            const faded = P.fade * (d.node % 3 === 0 ? 1 : 0);
            const lum = (0.16 + sim.glow[d.node] * 0.55 + breathe * 0.2) * d.w * (1 - P.dim * 0.5) * (1 - faded * 0.8) * health[d.node];
            c.copy(sim.color).multiplyScalar(lum);
            dc[k2] = c.r; dc[k2 + 1] = c.g; dc[k2 + 2] = c.b;
            dc[k2 + 3] = c.r * 0.6; dc[k2 + 4] = c.g * 0.6; dc[k2 + 5] = c.b * 0.6;
        });
        dendriteGeometry.attributes.position.needsUpdate = true;
        dendriteGeometry.attributes.color.needsUpdate = true;

        // ─── Искры: радость, слёзы грусти, пепел стресса, пыль амнезии ────
        if (m.drip && Math.random() < dt * 5) {
            const i = Math.floor(Math.random() * NEURON_COUNT);
            if (health[i] > 0.5) spawnSpark(sim, V1.copy(sim.pos[i]).add(V2.set(0, -0.15, 0)), V2.set(0, -0.25, 0), sim.color, 0.14, 0.45, 1.1);
        }
        const sp = sparkGeometry.attributes.position.array;
        const sc = sparkGeometry.attributes.aColor.array;
        const ss = sparkGeometry.attributes.aSize.array;
        let ns = 0;
        sim.sparks.forEach((spk) => {
            if (spk.life <= 0) return;
            spk.life = Math.max(0, spk.life - dt * spk.decay);
            spk.p.addScaledVector(spk.v, dt);
            spk.v.multiplyScalar(1 - dt * 1.5);
            spk.v.y -= dt * spk.grav;
            writePoint(sp, sc, ss, ns, spk.p, c.copy(spk.color).multiplyScalar(spk.life), spk.size * (0.5 + 0.5 * spk.life));
            ns += 1;
        });
        sparkGeometry.setDrawRange(0, ns);
        sparkGeometry.attributes.position.needsUpdate = true;
        sparkGeometry.attributes.aColor.needsUpdate = true;
        sparkGeometry.attributes.aSize.needsUpdate = true;

        // ─── Нити: новые связи, прыжки абстракции, отражения, узы ────────
        const bp = beamGeometry.attributes.position.array;
        const bc = beamGeometry.attributes.color.array;
        let nb = 0;
        const beam = (pa, pb, color, k) => {
            if (nb >= MAX_BEAMS || k <= 0.002) return;
            const j = nb * 6;
            bp[j] = pa.x; bp[j + 1] = pa.y; bp[j + 2] = pa.z;
            bp[j + 3] = pb.x; bp[j + 4] = pb.y; bp[j + 5] = pb.z;
            c.copy(color).multiplyScalar(k);
            bc[j] = c.r; bc[j + 1] = c.g; bc[j + 2] = c.b;
            bc[j + 3] = c.r; bc[j + 4] = c.g; bc[j + 5] = c.b;
            nb += 1;
        };
        sim.grown.forEach((g) => {
            g.life = Math.max(0, g.life - dt * 0.2);
            const pa = sim.pos[g.a];
            const pb = sim.pos[g.b];
            // Связь прорастает от нейрона наружу
            const reach = Math.min(1, (1 - g.life) * 3);
            beam(pa, V1.lerpVectors(pa, pb, reach), sim.color, 0.8 * g.life);
        });
        sim.impulses.forEach((imp) => {
            if (!imp.live) return;
            if (imp.beam) beam(sim.pos[imp.a], sim.pos[imp.b], imp.color, 0.35 * Math.sin(Math.PI * clamp01(imp.t)) * imp.alpha);
            // Отражение держится за своё движение тонкой нитью через всю голову
            if (imp.partner && imp.partner.live && imp.partner.partner === imp && imp.a < imp.partner.a) beam(imp.p, imp.partner.p, imp.color, 0.3 * imp.alpha);
        });
        if (P.bond > 0.05 && sim.partner >= 0) beam(sim.pos[src], sim.pos[sim.partner], sim.color, P.bond * (0.5 + 0.3 * Math.sin(t * 2.4)));
        beamGeometry.setDrawRange(0, nb * 2);
        beamGeometry.attributes.position.needsUpdate = true;
        beamGeometry.attributes.color.needsUpdate = true;

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
                <lineSegments geometry={edgeGeometry} frustumCulled={false} raycast={() => null}>
                    <lineBasicMaterial vertexColors transparent opacity={0.9} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
                </lineSegments>
                <lineSegments geometry={dendriteGeometry} frustumCulled={false} raycast={() => null}>
                    <lineBasicMaterial vertexColors transparent opacity={0.85} toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
                </lineSegments>
                <lineSegments geometry={beamGeometry} frustumCulled={false} raycast={() => null}>
                    <lineBasicMaterial vertexColors transparent toneMapped={false} blending={THREE.AdditiveBlending} depthWrite={false} />
                </lineSegments>
                <points geometry={haloGeometry} material={glow} frustumCulled={false} raycast={() => null} />
                <points geometry={sparkGeometry} material={glow} frustumCulled={false} raycast={() => null} />
                <points geometry={impulseGeometry} material={glow} frustumCulled={false} raycast={() => null} />

                {labelled.map((f) => {
                    // Ключ рефов — место в полном списке: движок ищет подпись
                    // по индексу узла сети, а не по порядку отрисовки
                    const i = FACTOR_IDS.indexOf(f.id);
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

/**
 * Где сейчас голова импульса: точка на аксоне (или на дуге через воздух)
 * плюс отклонение, которое задаёт характер режима.
 */
function impulsePoint(net, sim, imp, out) {
    const u = clamp01(imp.t);
    const pa = sim.pos[imp.a];
    const pb = sim.pos[imp.b];
    if (imp.e >= 0) axonPoint(net, sim.pos, imp.e, imp.dir > 0 ? u : 1 - u, out);
    else bezier(pa, pb, imp.n, imp.arc * imp.len, u, out);
    // Безрассудство: за целью импульс не останавливается, а летит дальше
    if (imp.t > 1) out.addScaledVector(V2.copy(pb).sub(pa).normalize(), (imp.t - 1) * imp.len);

    const env = Math.sin(Math.PI * u);
    const a = imp.age;
    switch (imp.motion) {
        case 'drift':
            // Покой: плывёт, чуть уходя от аксона и возвращаясь
            out.addScaledVector(imp.n, Math.sin(a * 1.6 + imp.seed) * 0.22 * env);
            break;
        case 'surge':
            out.addScaledVector(imp.n, Math.sin(a * 9 + imp.seed) * 0.07 * imp.size * env);
            break;
        case 'stutter':
            out.addScaledVector(imp.n, Math.sin(a * 47 + imp.seed) * 0.05);
            break;
        case 'jitter':
            out.addScaledVector(imp.n, Math.sin(a * 61 + imp.seed) * 0.035);
            break;
        case 'hop':
            out.y += env * 0.55;
            break;
        case 'sink':
            out.y -= env * 0.45;
            break;
        case 'float':
            // Сновидение: импульс отрывается от аксона и плывёт по воздуху
            out.addScaledVector(imp.n, env * 1.3);
            out.y += Math.sin(a * 0.9 + imp.seed) * 0.25 * env;
            break;
        default:
    }
    if (imp.stuck) out.addScaledVector(imp.n, Math.sin(a * 30) * 0.04);
    return out;
}

function writePoint(pos, col, size, i, p, c, s) {
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    size[i] = s;
}

function spawnSpark(sim, p, v, color, size, decay, grav) {
    const spk = sim.sparks.find((x) => x.life <= 0);
    if (!spk) return;
    spk.life = 1;
    spk.p.copy(p);
    spk.v.copy(v);
    spk.color.copy(color);
    spk.size = size;
    spk.decay = decay;
    spk.grav = grav;
}

/** Нейрон отрывается: из него сыплется тлеющий пепел. */
function spawnAsh(sim, p) {
    const ember = sim.tmpColor.set('#ff6a20').multiplyScalar(0.6);
    for (let k = 0; k < 7; k += 1) {
        V2.set(Math.random() - 0.5, Math.random() * 0.4, Math.random() - 0.5).multiplyScalar(0.9);
        spawnSpark(sim, p, V2, ember, 0.1, 0.7, 0.9);
    }
}
