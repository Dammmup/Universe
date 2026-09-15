import * as THREE from 'three';

/**
 * Геометрия человеческой фигуры.
 *
 * Прежняя модель `/model.gltf` — манекен с прямоугольным торсом и палками
 * вместо рук: 49 тысяч вершин, но силуэт деревянной куклы, который не спасает
 * ни один материал. Здесь фигура собирается протяжкой эллиптических сечений
 * вдоль осевых кривых: талия, грудная клетка, сужение к запястью и икры
 * получаются из профиля радиусов, а не из набора коробок.
 *
 * Единицы: рост ≈ 7.4, стопы на y ≈ -3.7, макушка на y ≈ 3.7.
 */

const REF_Z = new THREE.Vector3(0, 0, 1);
const REF_X = new THREE.Vector3(1, 0, 0);

/**
 * Протяжка: на каждом шаге по осевой линии ставится эллиптическое кольцо
 * со своими полушириной и полуглубиной. Кадр строится от касательной, поэтому
 * согнутая рука не выворачивает сечения.
 */
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
        v.crossVectors(tangent, u).normalize();     // ось глубины

        for (let j = 0; j <= radial; j += 1) {
            const angle = (j / radial) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const index = i * cols + j;

            positions[index * 3] = section.p.x + u.x * section.rx * cos + v.x * section.rz * sin;
            positions[index * 3 + 1] = section.p.y + u.y * section.rx * cos + v.y * section.rz * sin;
            positions[index * 3 + 2] = section.p.z + u.z * section.rx * cos + v.z * section.rz * sin;

            uvs[index * 2] = j / radial;
            uvs[index * 2 + 1] = i / (rings - 1);
        }
    }

    for (let i = 0; i < rings - 1; i += 1) {
        for (let j = 0; j < radial; j += 1) {
            const a = i * cols + j;
            const b = a + cols;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
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

    // Радиусы интерполируются по той же параметризации, что и осевая линия
    const widthCurve = new THREE.CatmullRomCurve3(
        controls.map((c, i) => new THREE.Vector3(i / (controls.length - 1), c.rx, c.rz)),
        false,
        'catmullrom',
        0.5,
    );

    const sections = [];
    for (let i = 0; i < steps; i += 1) {
        const t = i / (steps - 1);
        const p = curve.getPoint(t);
        const r = widthCurve.getPoint(t);
        sections.push({ p, rx: Math.max(0, r.y), rz: Math.max(0, r.z) });
    }
    return sections;
}

const build = (controls, steps, radial) => sweep(resample(controls, steps), radial);

/**
 * Торс, шея и голова одной оболочкой: разрез на границе всегда заметен на
 * просвет, а тело здесь полупрозрачное.
 * rx — полуширина, rz — полуглубина: сечение человека эллиптическое, круглое
 * даёт «снеговика».
 */
export function buildTorso() {
    return build([
        // Оболочка замкнута снизу точкой между ног: открытое кольцо среза
        // просвечивало через полупрозрачную кожу жёсткой горизонтальной гранью
        { y: -0.26, rx: 0.05, rz: 0.04 },
        { y: -0.02, rx: 0.46, rz: 0.32 },  // низ таза
        { y: 0.30, rx: 0.70, rz: 0.42 },  // бёдра
        { y: 0.72, rx: 0.63, rz: 0.38 },
        { y: 1.10, rx: 0.53, rz: 0.33 },  // талия
        { y: 1.55, rx: 0.62, rz: 0.38 },
        { y: 1.98, rx: 0.75, rz: 0.43 },  // грудная клетка
        { y: 2.28, rx: 0.88, rz: 0.43 },  // плечевой пояс
        { y: 2.50, rx: 0.60, rz: 0.35 },  // скат к шее
        { y: 2.64, rx: 0.27, rz: 0.25 },  // шея
        { y: 2.85, rx: 0.25, rz: 0.24 },
        { y: 2.98, rx: 0.36, rz: 0.36 },  // челюсть
        { y: 3.20, rx: 0.47, rz: 0.50 },  // череп
        { y: 3.50, rx: 0.46, rz: 0.49 },
        { y: 3.72, rx: 0.32, rz: 0.34 },
        { y: 3.84, rx: 0.02, rz: 0.02 },  // макушка
    ], 130, 40);
}

/** Плечо — локоть — запястье. Небольшой изгиб наружу убирает позу манекена. */
export function buildArm(side = 1) {
    return build([
        { x: side * 0.70, y: 2.40, z: 0, rx: 0.045, rz: 0.045 },
        { x: side * 0.88, y: 2.26, z: 0.02, rx: 0.26, rz: 0.25 },  // дельтовидная
        { x: side * 0.96, y: 1.86, z: 0.02, rx: 0.21, rz: 0.20 },
        { x: side * 1.00, y: 1.35, z: 0.01, rx: 0.19, rz: 0.18 },
        { x: side * 1.06, y: 1.02, z: 0, rx: 0.17, rz: 0.17 },     // локоть
        { x: side * 1.12, y: 0.55, z: 0.02, rx: 0.16, rz: 0.15 },
        { x: side * 1.16, y: 0.05, z: 0.03, rx: 0.12, rz: 0.11 },  // запястье
        { x: side * 1.19, y: -0.18, z: 0.03, rx: 0.14, rz: 0.08 },  // кисть
        { x: side * 1.20, y: -0.48, z: 0.03, rx: 0.11, rz: 0.06 },
        { x: side * 1.20, y: -0.62, z: 0.03, rx: 0.02, rz: 0.02 },
    ], 90, 22);
}

/** Бедро — колено — голень — стопа. */
export function buildLeg(side = 1) {
    return build([
        { x: side * 0.33, y: 0.42, z: 0, rx: 0.06, rz: 0.06 },
        { x: side * 0.35, y: 0.16, z: 0, rx: 0.36, rz: 0.36 },   // ягодица/бедро
        { x: side * 0.36, y: -0.45, z: 0, rx: 0.33, rz: 0.33 },
        { x: side * 0.37, y: -1.15, z: 0, rx: 0.27, rz: 0.27 },
        { x: side * 0.38, y: -1.62, z: 0, rx: 0.24, rz: 0.24 },  // колено
        { x: side * 0.38, y: -2.05, z: 0.02, rx: 0.25, rz: 0.25 },  // икра
        { x: side * 0.37, y: -2.75, z: 0, rx: 0.17, rz: 0.17 },
        { x: side * 0.36, y: -3.32, z: -0.02, rx: 0.12, rz: 0.12 },  // лодыжка
        { x: side * 0.36, y: -3.55, z: 0.06, rx: 0.13, rz: 0.16 },
        { x: side * 0.36, y: -3.66, z: 0.26, rx: 0.12, rz: 0.13 },  // стопа
        { x: side * 0.36, y: -3.70, z: 0.40, rx: 0.04, rz: 0.05 },
    ], 100, 24);
}

/** Все части фигуры разом — вызывается один раз и кэшируется сценой. */
export function buildFigure() {
    return {
        torso: buildTorso(),
        armLeft: buildArm(-1),
        armRight: buildArm(1),
        legLeft: buildLeg(-1),
        legRight: buildLeg(1),
    };
}

export function disposeFigure(figure) {
    Object.values(figure).forEach((geometry) => geometry.dispose());
}
