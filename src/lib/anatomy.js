import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Геометрия человеческой фигуры.
 *
 * Фигура собирается протяжкой сечений вдоль осевых кривых. Сечение человека
 * не эллипс: грудь выступает вперёд сильнее, чем лопатки назад, ягодицы — назад
 * сильнее, чем живот вперёд. Поэтому у сечения две полуглубины — спереди (rz)
 * и сзади (rzb), — и степень n суперэллипса: 2 — эллипс, больше — плотнее
 * «плечи» сечения, как у грудной клетки.
 *
 * Поверх оболочки кладутся отдельные мышцы (buildMuscles): на слое кожи они
 * дают рельеф, на слое мышц рисуются волокнами. Прежняя фигура была гладким
 * манекеном без единого мускульного рельефа.
 *
 * Единицы: рост ≈ 7.56, подошвы на y ≈ -3.72, макушка на y ≈ 3.84.
 */

const REF_Z = new THREE.Vector3(0, 0, 1);
const REF_X = new THREE.Vector3(1, 0, 0);

/** Суперэллипс: знак сохраняется, модуль возводится в степень 2/n. */
const sePow = (v, n) => Math.sign(v) * Math.abs(v) ** (2 / n);

function sweep(sections, radial = 28) {
    const rings = sections.length;
    const cols = radial + 1;
    const vertexCount = rings * cols;

    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];

    const tangent = new THREE.Vector3();
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const ref = new THREE.Vector3();

    for (let i = 0; i < rings; i += 1) {
        const section = sections[i];
        const prev = sections[Math.max(0, i - 1)];
        const next = sections[Math.min(rings - 1, i + 1)];
        tangent.subVectors(next.p, prev.p);
        if (tangent.lengthSq() < 1e-9) tangent.set(0, 1, 0);
        tangent.normalize();

        ref.copy(Math.abs(tangent.dot(REF_Z)) > 0.9 ? REF_X : REF_Z);
        u.crossVectors(ref, tangent).normalize();   // ось ширины
        v.crossVectors(tangent, u).normalize();     // ось глубины (для вертикали — вперёд)

        const n = section.n ?? 2;
        for (let j = 0; j <= radial; j += 1) {
            const angle = (j / radial) * Math.PI * 2;
            const cos = sePow(Math.cos(angle), n);
            const sinRaw = Math.sin(angle);
            const sin = sePow(sinRaw, n);
            const depth = sinRaw >= 0 ? section.rz : (section.rzb ?? section.rz);
            const index = i * cols + j;

            positions[index * 3] = section.p.x + u.x * section.rx * cos + v.x * depth * sin;
            positions[index * 3 + 1] = section.p.y + u.y * section.rx * cos + v.y * depth * sin;
            positions[index * 3 + 2] = section.p.z + u.z * section.rx * cos + v.z * depth * sin;

            uvs[index * 2] = j / radial;
            uvs[index * 2 + 1] = i / (rings - 1);
        }
    }

    for (let i = 0; i < rings - 1; i += 1) {
        for (let j = 0; j < radial; j += 1) {
            const a = i * cols + j;
            const b = a + cols;
            // Обход против часовой снаружи: нормали смотрят из тела. Прежний
            // порядок разворачивал их внутрь — на полупрозрачной коже этого не
            // было видно, а непрозрачная показывала изнанку задней стенки
            indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
}

/** Плавно догоняет опорные сечения: ломаный профиль дал бы гранёное тело. */
function resample(controls, steps) {
    const curve = new THREE.CatmullRomCurve3(
        controls.map((c) => new THREE.Vector3(c.x ?? 0, c.y, c.z ?? 0)),
        false,
        'catmullrom',
        0.5,
    );
    const lerpCurve = (key, fallback) => new THREE.CatmullRomCurve3(
        controls.map((c, i) => new THREE.Vector3(i / (controls.length - 1), c[key] ?? fallback(c), 0)),
        false,
        'catmullrom',
        0.5,
    );
    const rx = lerpCurve('rx', () => 0);
    const rz = lerpCurve('rz', () => 0);
    const rzb = lerpCurve('rzb', (c) => c.rz);
    const n = lerpCurve('n', () => 2);

    const sections = [];
    for (let i = 0; i < steps; i += 1) {
        const t = i / (steps - 1);
        sections.push({
            p: curve.getPoint(t),
            rx: Math.max(0, rx.getPoint(t).y),
            rz: Math.max(0, rz.getPoint(t).y),
            rzb: Math.max(0, rzb.getPoint(t).y),
            n: Math.max(1.6, n.getPoint(t).y),
        });
    }
    return sections;
}

/**
 * Оболочка по опорным сечениям. Тем же строятся органы (`lib/organs.js`).
 * Для вертикальной протяжки rx — полуширина (X), rz — полуглубина вперёд,
 * rzb — назад. Для протяжки вдоль Z rx становится полувысотой.
 */
export const sweepProfile = (controls, steps = 80, radial = 24) => sweep(resample(controls, steps), radial);

const build = (controls, steps, radial) => sweepProfile(controls, steps, radial);

/** Торс, шея и голова одной оболочкой: разрез на границе заметен на просвет. */
export function buildTorso() {
    return build([
        { y: -0.26, rx: 0.05, rz: 0.04, rzb: 0.05 },
        { y: -0.02, rx: 0.46, rz: 0.28, rzb: 0.34 },           // промежность, низ таза
        { y: 0.30, rx: 0.69, rz: 0.33, rzb: 0.47, n: 2.2 },    // бёдра, ягодицы назад
        { y: 0.72, rx: 0.61, rz: 0.32, rzb: 0.38, n: 2.2 },
        { y: 1.10, rx: 0.51, rz: 0.30, rzb: 0.29, n: 2.2 },    // талия
        { y: 1.55, rx: 0.61, rz: 0.36, rzb: 0.33, n: 2.4 },    // нижние рёбра
        { y: 1.98, rx: 0.74, rz: 0.42, rzb: 0.37, n: 2.6 },    // грудная клетка
        { y: 2.28, rx: 0.86, rz: 0.34, rzb: 0.39, n: 2.6 },    // плечевой пояс
        { y: 2.50, rx: 0.56, rz: 0.24, rzb: 0.34, n: 2.2 },    // трапеция к шее
        { y: 2.64, rx: 0.25, rz: 0.22, rzb: 0.25 },            // шея
        { y: 2.85, rx: 0.24, rz: 0.23, rzb: 0.23 },
        { y: 2.97, rx: 0.32, rz: 0.36, rzb: 0.30 },            // челюсть, подбородок вперёд
        { y: 3.18, rx: 0.44, rz: 0.47, rzb: 0.50 },            // скулы
        { y: 3.46, rx: 0.45, rz: 0.46, rzb: 0.52 },            // лоб и затылок
        { y: 3.70, rx: 0.33, rz: 0.31, rzb: 0.37 },
        { y: 3.84, rx: 0.03, rz: 0.03, rzb: 0.03 },            // макушка
    ], 220, 72);
}

/** Плечо — локоть — запястье. Кисть — отдельная деталь. */
export function buildArm(side = 1) {
    return build([
        { x: side * 0.70, y: 2.40, z: 0, rx: 0.045, rz: 0.045 },
        { x: side * 0.88, y: 2.26, z: 0.02, rx: 0.25, rz: 0.24 },
        { x: side * 0.96, y: 1.86, z: 0.02, rx: 0.19, rz: 0.19 },
        { x: side * 1.00, y: 1.35, z: 0.01, rx: 0.16, rz: 0.16 },
        { x: side * 1.06, y: 1.02, z: 0, rx: 0.14, rz: 0.14 },     // локоть
        { x: side * 1.10, y: 0.70, z: 0.02, rx: 0.15, rz: 0.14 },
        { x: side * 1.15, y: 0.26, z: 0.03, rx: 0.11, rz: 0.09 },
        { x: side * 1.17, y: 0.06, z: 0.03, rx: 0.09, rz: 0.075 },  // запястье
        { x: side * 1.18, y: -0.02, z: 0.03, rx: 0.02, rz: 0.02 },
    ], 120, 40);
}

/** Кисть: ладонь с сомкнутыми пальцами и отставленный большой палец. */
export function buildHand(side = 1) {
    const palm = build([
        { x: side * 1.17, y: 0.10, z: 0.03, rx: 0.05, rz: 0.06 },
        { x: side * 1.18, y: 0.02, z: 0.03, rx: 0.07, rz: 0.12 },
        { x: side * 1.19, y: -0.16, z: 0.03, rx: 0.06, rz: 0.14 },
        { x: side * 1.19, y: -0.30, z: 0.04, rx: 0.05, rz: 0.13 },
        { x: side * 1.18, y: -0.46, z: 0.05, rx: 0.04, rz: 0.11 },
        { x: side * 1.17, y: -0.58, z: 0.06, rx: 0.03, rz: 0.08 },
        { x: side * 1.16, y: -0.64, z: 0.06, rx: 0.01, rz: 0.02 },
    ], 50, 28);
    const thumb = build([
        { x: side * 1.16, y: 0.00, z: 0.10, rx: 0.045, rz: 0.045 },
        { x: side * 1.13, y: -0.12, z: 0.17, rx: 0.042, rz: 0.04 },
        { x: side * 1.11, y: -0.24, z: 0.19, rx: 0.034, rz: 0.032 },
        { x: side * 1.10, y: -0.31, z: 0.19, rx: 0.008, rz: 0.008 },
    ], 24, 16);
    return mergeGeometries([palm, thumb]);
}

/** Бедро — колено — голень. */
export function buildLeg(side = 1) {
    return build([
        { x: side * 0.33, y: 0.42, z: 0, rx: 0.06, rz: 0.06 },
        { x: side * 0.35, y: 0.16, z: -0.02, rx: 0.35, rz: 0.33, rzb: 0.38 },
        { x: side * 0.36, y: -0.45, z: 0, rx: 0.31, rz: 0.32, rzb: 0.3 },
        { x: side * 0.37, y: -1.15, z: 0.01, rx: 0.24, rz: 0.25, rzb: 0.23 },
        { x: side * 0.38, y: -1.62, z: 0.02, rx: 0.2, rz: 0.21, rzb: 0.2 },   // колено
        { x: side * 0.38, y: -2.05, z: -0.01, rx: 0.21, rz: 0.19, rzb: 0.27 }, // икра назад
        { x: side * 0.37, y: -2.75, z: 0, rx: 0.14, rz: 0.14, rzb: 0.16 },
        { x: side * 0.36, y: -3.30, z: -0.02, rx: 0.10, rz: 0.1, rzb: 0.11 },  // лодыжка
        { x: side * 0.36, y: -3.50, z: -0.02, rx: 0.09, rz: 0.1 },
        { x: side * 0.36, y: -3.58, z: -0.02, rx: 0.02, rz: 0.02 },
    ], 140, 40);
}

/** Стопа: пятка, свод, подъём и пальцы. Подошва плоская на y ≈ -3.72. */
export function buildFoot(side = 1) {
    const sole = -3.72;
    const at = (z, h, w, x = 0) => ({ x: side * (0.36 + x), y: sole + h, z, rx: h, rz: w });
    return build([
        at(-0.2, 0.02, 0.03),
        at(-0.15, 0.09, 0.075),
        at(-0.04, 0.13, 0.09),
        at(0.12, 0.11, 0.1, 0.01),
        at(0.30, 0.075, 0.12, 0.02),
        at(0.44, 0.055, 0.125, 0.025),
        at(0.55, 0.04, 0.11, 0.025),
        at(0.61, 0.012, 0.04, 0.02),
    ], 50, 28);
}

/** Детали лица: нос, уши, надбровье, подбородок — без них голова читалась яйцом. */
function buildFace() {
    const part = (pos, scale, rot = [0, 0, 0]) => {
        const g = new THREE.SphereGeometry(1, 28, 20);
        g.scale(...scale);
        g.rotateX(rot[0]);
        g.rotateY(rot[1]);
        g.rotateZ(rot[2]);
        g.translate(...pos);
        return g;
    };
    return mergeGeometries([
        part([0, 3.2, 0.46], [0.055, 0.11, 0.075], [-0.25, 0, 0]),   // нос
        part([0, 3.37, 0.42], [0.3, 0.05, 0.07]),                    // надбровье
        part([0, 2.97, 0.33], [0.12, 0.07, 0.07]),                   // подбородок
        part([0.44, 3.22, -0.02], [0.05, 0.12, 0.08]),               // уши
        part([-0.44, 3.22, -0.02], [0.05, 0.12, 0.08]),
        part([0.2, 3.1, 0.34], [0.12, 0.08, 0.09]),                  // скулы
        part([-0.2, 3.1, 0.34], [0.12, 0.08, 0.09]),
    ]);
}

/** Все части оболочки разом — вызывается один раз и кэшируется сценой. */
export function buildFigure() {
    return {
        torso: buildTorso(),
        face: buildFace(),
        armLeft: buildArm(-1),
        armRight: buildArm(1),
        handLeft: buildHand(-1),
        handRight: buildHand(1),
        legLeft: buildLeg(-1),
        legRight: buildLeg(1),
        footLeft: buildFoot(-1),
        footRight: buildFoot(1),
    };
}

/**
 * Мышцы поверх оболочки. Каждая — веретено (вытянутый эллипсоид), у которого
 * полюса сферы становятся сухожилиями: шейдер волокон тянет полосы вдоль
 * меридианов, и они сходятся к полюсам, как настоящие волокна к сухожилию.
 *
 * group — к какому фактору относится мышца: бицепс растёт при нагрузке,
 * икра сводится судорогой, бедро тянется.
 */
export const MUSCLES = (() => {
    const list = [];
    const add = (name, group, pos, scale, rot = [0, 0, 0], mirror = true) => {
        list.push({ name: `${name}R`, group, pos, scale, rot });
        if (mirror) {
            list.push({ name: `${name}L`, group, pos: [-pos[0], pos[1], pos[2]], scale, rot: [rot[0], -rot[1], -rot[2]] });
        }
    };
    add('pec', 'chest', [0.3, 2.02, 0.27], [0.3, 0.19, 0.12], [0, 0.3, -0.35]);
    add('delt', 'shoulder', [0.9, 2.2, 0.02], [0.19, 0.24, 0.2], [0, 0, 0.35]);
    add('trap', 'back', [0.3, 2.4, -0.2], [0.34, 0.12, 0.13], [0, 0, -0.35]);
    add('lat', 'back', [0.46, 1.7, -0.22], [0.2, 0.42, 0.12], [0, -0.3, 0.2]);
    add('biceps', 'biceps', [0.99, 1.62, 0.1], [0.12, 0.3, 0.12], [0, 0, 0.1]);
    add('triceps', 'arm', [0.98, 1.65, -0.09], [0.13, 0.32, 0.12], [0, 0, 0.1]);
    add('forearm', 'forearm', [1.11, 0.66, 0.05], [0.12, 0.3, 0.1], [0, 0, 0.08]);
    add('oblique', 'core', [0.44, 1.2, 0.14], [0.14, 0.32, 0.12], [0, 0.4, 0.15]);
    add('glute', 'hip', [0.3, 0.3, -0.26], [0.29, 0.3, 0.2], [0, 0, 0]);
    add('quad', 'thigh', [0.38, -0.55, 0.12], [0.22, 0.56, 0.2], [0, 0, 0.03]);
    add('hamstring', 'thigh', [0.36, -0.6, -0.12], [0.19, 0.5, 0.17], [0, 0, 0.02]);
    add('calf', 'calf', [0.38, -2.12, -0.1], [0.16, 0.36, 0.16], [0, 0, 0]);
    add('shin', 'calf', [0.4, -2.35, 0.08], [0.08, 0.42, 0.07], [0, 0, 0]);
    // Пресс: три пары «кубиков» по сторонам белой линии живота
    [1.28, 1.48, 1.68].forEach((y, i) => add(`abs${i}`, 'core', [0.1, y, 0.27], [0.095, 0.085, 0.05], [0, 0.15, 0]));
    return list;
})();

export function buildMuscleGeometry() {
    return new THREE.SphereGeometry(1, 40, 28);
}

export function disposeFigure(figure) {
    Object.values(figure).forEach((geometry) => geometry.dispose());
}
