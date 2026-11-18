import * as THREE from 'three';

/**
 * Протяжка сечений вдоль осевой кривой — из неё строятся органы
 * (`lib/organs.js`). Сама фигура давно собирается из поля расстояний
 * (`lib/bodySdf.js`); прежняя оболочка из протяжек и мышцы-веретёна удалены.
 *
 * Сечение человека не эллипс: грудь выступает вперёд сильнее, чем лопатки назад, ягодицы — назад
 * сильнее, чем живот вперёд. Поэтому у сечения две полуглубины — спереди (rz)
 * и сзади (rzb), — и степень n суперэллипса: 2 — эллипс, больше — плотнее
 * «плечи» сечения, как у грудной клетки.
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
