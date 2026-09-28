/**
 * Тело как поле расстояний.
 *
 * Прежняя фигура склеивалась из протяжек и эллипсоидов: каждая мышца лежала
 * на оболочке отдельной «шишкой», а стыки частей были видны. Здесь тело — одна
 * функция расстояния: анатомические формы (череп, грудная клетка, таз,
 * конечности) и мышцы плавно сливаются через smooth-min, как глина под рукой
 * скульптора. Поверхность достаётся из поля методом surface nets.
 *
 * Два варианта:
 *  - skin   — мягкое слияние, мышцы угадываются рельефом;
 *  - muscle — чёткое слияние, между мышцами борозды, оболочка тела утоплена.
 *
 * Каждая вершина знает «свою» мышцу: группу, центр, ось и положение вдоль оси.
 * Шейдер по этим данным рисует волокна и сухожилия и раздувает конкретную
 * мышцу (бицепс при росте, икру при судороге), не пересобирая геометрию.
 *
 * Координаты — как у прежней фигуры: подошвы y ≈ -3.72, макушка y ≈ 3.84,
 * фигура смотрит на +Z, левая сторона тела — +X.
 *
 * Модуль без зависимостей от three: он же работает в Web Worker.
 */

/** Группы мышц для анимации в шейдере. 0 — не мышца. */
export const MUSCLE_GROUPS = ['none', 'biceps', 'thigh', 'calf', 'chest', 'core', 'back', 'shoulder', 'arm', 'hip', 'neck'];
const G = Object.fromEntries(MUSCLE_GROUPS.map((g, i) => [g, i]));

// ─── Примитивы ──────────────────────────────────────────────────────────────

function rotMatrix(rx = 0, ry = 0, rz = 0) {
    const cx = Math.cos(rx); const sx = Math.sin(rx);
    const cy = Math.cos(ry); const sy = Math.sin(ry);
    const cz = Math.cos(rz); const sz = Math.sin(rz);
    // R = Rz * Ry * Rx (как Euler XYZ в three)
    return [
        cy * cz, sx * sy * cz - cx * sz, cx * sy * cz + sx * sz,
        cy * sz, sx * sy * sz + cx * cz, cx * sy * sz - sx * cz,
        -sy, sx * cy, cx * cy,
    ];
}

function ellipsoid(c, r, rot = [0, 0, 0], extra = {}) {
    const m = rotMatrix(...rot);
    // Длинная ось эллипсоида — ось волокон мышцы
    const longIdx = r[0] >= r[1] && r[0] >= r[2] ? 0 : (r[1] >= r[2] ? 1 : 2);
    const axis = [m[longIdx], m[3 + longIdx], m[6 + longIdx]];
    const pad = Math.max(...r) + 0.12;
    return { type: 'e', c, r, m, axis, len: r[longIdx], ymin: c[1] - pad, ymax: c[1] + pad, ...extra };
}

function cone(a, b, ra, rb, extra = {}) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const l = Math.hypot(...d);
    const pad = Math.max(ra, rb) + 0.12;
    return {
        type: 'c', a, b, ra, rb,
        c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
        axis: d.map((v) => v / l), len: l / 2,
        ymin: Math.min(a[1], b[1]) - pad, ymax: Math.max(a[1], b[1]) + pad,
        ...extra,
    };
}

function sdEllipsoid(px, py, pz, e) {
    const qx = px - e.c[0]; const qy = py - e.c[1]; const qz = pz - e.c[2];
    const m = e.m;
    // В локальные оси: R^T * q
    const lx = m[0] * qx + m[3] * qy + m[6] * qz;
    const ly = m[1] * qx + m[4] * qy + m[7] * qz;
    const lz = m[2] * qx + m[5] * qy + m[8] * qz;
    const k0 = Math.hypot(lx / e.r[0], ly / e.r[1], lz / e.r[2]);
    const k1 = Math.hypot(lx / (e.r[0] * e.r[0]), ly / (e.r[1] * e.r[1]), lz / (e.r[2] * e.r[2]));
    return k1 < 1e-9 ? -Math.min(...e.r) : (k0 * (k0 - 1)) / k1;
}

/** Скруглённый конус (Иниго Килес): капсула с разными радиусами концов. */
function sdCone(px, py, pz, c) {
    const bax = c.b[0] - c.a[0]; const bay = c.b[1] - c.a[1]; const baz = c.b[2] - c.a[2];
    const l2 = bax * bax + bay * bay + baz * baz;
    const rr = c.ra - c.rb;
    const a2 = l2 - rr * rr;
    const il2 = 1 / l2;
    const pax = px - c.a[0]; const pay = py - c.a[1]; const paz = pz - c.a[2];
    const y = pax * bax + pay * bay + paz * baz;
    const z = y - l2;
    const wx = pax * l2 - bax * y; const wy = pay * l2 - bay * y; const wz = paz * l2 - baz * y;
    const x2 = wx * wx + wy * wy + wz * wz;
    const y2 = y * y * l2;
    const z2 = z * z * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - c.rb;
    if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - c.ra;
    return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - c.ra;
}

function sd(x, y, z, p) {
    // Сплющенный по глубине конус: сечение торса — эллипс, а не круг
    if (p.sz) {
        const zz = p.c[2] + (z - p.c[2]) / p.sz;
        return (p.type === 'e' ? sdEllipsoid(x, y, zz, p) : sdCone(x, y, zz, p)) * Math.min(1, p.sz);
    }
    return p.type === 'e' ? sdEllipsoid(x, y, z, p) : sdCone(x, y, z, p);
}

function smin(a, b, k) {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a, b, k) {
    return -smin(-a, -b, k);
}

// ─── Анатомия ───────────────────────────────────────────────────────────────

const mirror = (list, make) => [1, -1].forEach((s) => list.push(make(s)));

function basePrimitives() {
    const P = [];
    // Голова по пропорциям: высота 23 см, ширина 15, глубина 20 — в
    // масштабе фигуры 0,95 × 0,62 × 0,83. Крупные массы здесь, черты лица —
    // отдельно (facePrimitives): им нужно резкое слияние, иначе они
    // расплываются в бугры.
    P.push(ellipsoid([0, 3.47, -0.07], [0.32, 0.39, 0.41]));   // черепная коробка
    P.push(ellipsoid([0, 3.27, 0.1], [0.28, 0.33, 0.3]));      // лицевой отдел
    P.push(ellipsoid([0, 3.02, 0.1], [0.23, 0.13, 0.25]));     // нижняя челюсть
    P.push(cone([0, 2.52, -0.05], [0, 3.02, -0.02], 0.19, 0.17));   // шея
    // Туловище: грудная клетка, живот, таз, плечевой пояс
    // Грудная клетка и плавный переход к талии и тазу: три отдельных
    // эллипсоида давали живот-мяч и перетяжку на талии, как у песочных часов
    P.push(ellipsoid([0, 1.98, -0.02], [0.62, 0.6, 0.43]));
    P.push(cone([0, 2.0, -0.02], [0, 1.15, 0.0], 0.56, 0.46, { sz: 0.66 }));
    P.push(cone([0, 1.15, 0.0], [0, 0.42, -0.04], 0.46, 0.5, { sz: 0.74 }));
    P.push(ellipsoid([0, 0.36, -0.06], [0.5, 0.34, 0.36]));
    P.push(cone([-0.72, 2.3, -0.05], [0.72, 2.3, -0.05], 0.19, 0.19));
    // Руки
    mirror(P, (s) => cone([s * 0.86, 2.24, 0], [s * 1.04, 1.05, 0.01], 0.16, 0.12));
    mirror(P, (s) => cone([s * 1.05, 1.02, 0.01], [s * 1.15, 0.12, 0.04], 0.125, 0.08));
    mirror(P, (s) => ellipsoid([s * 1.17, -0.14, 0.05], [0.055, 0.17, 0.12], [0, 0, s * 0.03]));
    mirror(P, (s) => cone([s * 1.18, -0.26, 0.06], [s * 1.16, -0.6, 0.08], 0.05, 0.03));
    mirror(P, (s) => cone([s * 1.14, -0.04, 0.12], [s * 1.1, -0.28, 0.19], 0.035, 0.025));
    // Ноги
    mirror(P, (s) => cone([s * 0.3, 0.24, -0.02], [s * 0.37, -1.56, 0.02], 0.29, 0.16));
    mirror(P, (s) => ellipsoid([s * 0.38, -1.64, 0.05], [0.12, 0.13, 0.13]));
    mirror(P, (s) => cone([s * 0.38, -1.7, 0.0], [s * 0.36, -3.4, -0.03], 0.17, 0.085));
    mirror(P, (s) => ellipsoid([s * 0.37, -3.63, 0.13], [0.1, 0.08, 0.3], [0.05, 0, 0]));
    mirror(P, (s) => ellipsoid([s * 0.36, -3.6, -0.1], [0.08, 0.1, 0.1]));
    return P;
}

/**
 * Черты лица: скулы, углы челюсти, подбородок, надбровье, нос (спинка,
 * кончик, крылья), губы, веки, уши. Сливаются с головой резко — черта лица
 * должна читаться формой, а не растекаться по щекам.
 */
function facePrimitives() {
    const F = [];
    mirror(F, (s) => ellipsoid([s * 0.17, 3.2, 0.24], [0.08, 0.055, 0.09], [0, s * 0.35, 0], { k: 0.07 }));  // скулы
    mirror(F, (s) => cone([s * 0.21, 3.1, -0.02], [s * 0.08, 2.94, 0.24], 0.055, 0.045, { k: 0.08 }));  // линия челюсти
    F.push(ellipsoid([0, 2.93, 0.28], [0.085, 0.06, 0.07], [0, 0, 0], { k: 0.05 }));                // подбородок
    F.push(ellipsoid([0, 3.37, 0.33], [0.22, 0.035, 0.055], [0, 0, 0], { k: 0.07 }));               // надбровье
    F.push(cone([0, 3.35, 0.37], [0, 3.17, 0.46], 0.03, 0.045));                                   // спинка носа
    F.push(ellipsoid([0, 3.155, 0.465], [0.045, 0.04, 0.042]));                                    // кончик носа
    mirror(F, (s) => ellipsoid([s * 0.045, 3.145, 0.42], [0.034, 0.03, 0.035]));                   // крылья носа
    F.push(ellipsoid([0, 3.055, 0.385], [0.085, 0.021, 0.035]));                                   // верхняя губа
    F.push(ellipsoid([0, 3.018, 0.378], [0.075, 0.024, 0.035]));                                   // нижняя губа
    mirror(F, (s) => ellipsoid([s * 0.12, 3.305, 0.335], [0.056, 0.024, 0.042], [0.25, 0, 0]));   // верхние веки
    mirror(F, (s) => ellipsoid([s * 0.12, 3.255, 0.33], [0.05, 0.016, 0.036]));                    // нижние веки
    mirror(F, (s) => ellipsoid([s * 0.325, 3.25, -0.05], [0.03, 0.095, 0.062], [0, s * -0.4, 0])); // уши
    return F;
}

/** Мышцы: эллипсоиды по анатомическим местам, у каждой — группа для анимации. */
function musclePrimitives() {
    const M = [];
    const add = (group, make) => mirror(M, (s) => ({ ...make(s), group: G[group] }));
    add('chest', (s) => ellipsoid([s * 0.29, 2.02, 0.24], [0.3, 0.19, 0.13], [0, s * 0.3, s * -0.35]));
    add('shoulder', (s) => ellipsoid([s * 0.87, 2.2, 0.02], [0.16, 0.23, 0.17], [0, 0, s * 0.3]));
    add('back', (s) => ellipsoid([s * 0.3, 2.4, -0.18], [0.34, 0.12, 0.13], [0, 0, s * -0.35]));
    add('back', (s) => ellipsoid([s * 0.44, 1.7, -0.2], [0.2, 0.44, 0.12], [0, s * -0.3, s * 0.2]));
    add('neck', (s) => ellipsoid([s * 0.11, 2.8, 0.08], [0.055, 0.25, 0.06], [0.25, 0, s * -0.45]));
    add('biceps', (s) => ellipsoid([s * 0.98, 1.62, 0.09], [0.11, 0.3, 0.11], [0, 0, s * 0.12]));
    add('arm', (s) => ellipsoid([s * 0.97, 1.66, -0.08], [0.12, 0.33, 0.11], [0, 0, s * 0.12]));
    add('arm', (s) => ellipsoid([s * 1.09, 0.7, 0.05], [0.1, 0.36, 0.09], [0, 0, s * 0.08]));
    add('arm', (s) => ellipsoid([s * 1.1, 0.66, -0.04], [0.09, 0.36, 0.08], [0, 0, s * 0.08]));
    add('core', (s) => ellipsoid([s * 0.34, 1.22, 0.08], [0.08, 0.28, 0.08], [0, s * 0.4, s * 0.1], { muscleOnly: true }));
    [1.06, 1.28, 1.5, 1.72].forEach((y) => add('core', (s) => ellipsoid([s * 0.1, y, 0.24], [0.09, 0.09, 0.07], [0, s * 0.15, 0])));
    add('hip', (s) => ellipsoid([s * 0.29, 0.34, -0.24], [0.28, 0.3, 0.2]));
    add('thigh', (s) => ellipsoid([s * 0.44, -0.6, 0.1], [0.16, 0.55, 0.17], [0, 0, s * 0.04]));   // латеральная широкая
    add('thigh', (s) => ellipsoid([s * 0.3, -1.1, 0.12], [0.13, 0.36, 0.14], [0, 0, s * -0.1]));  // медиальная
    add('thigh', (s) => ellipsoid([s * 0.37, -0.5, 0.18], [0.12, 0.6, 0.12]));                    // прямая
    add('thigh', (s) => ellipsoid([s * 0.35, -0.65, -0.13], [0.17, 0.5, 0.15]));                  // задняя группа
    add('calf', (s) => ellipsoid([s * 0.43, -2.08, -0.1], [0.1, 0.34, 0.13]));
    add('calf', (s) => ellipsoid([s * 0.33, -2.12, -0.1], [0.1, 0.3, 0.13]));
    add('calf', (s) => ellipsoid([s * 0.41, -2.4, 0.07], [0.06, 0.45, 0.06]));
    return M;
}

// ─── Поле ───────────────────────────────────────────────────────────────────

const MOUTH = ellipsoid([0, 3.036, 0.415], [0.07, 0.0035, 0.025]);

const VARIANTS = {
    // Кожа: мышцы вливаются мягко и лишь намечают рельеф
    skin: { kBase: 0.14, kMuscle: 0.1, muscleInset: 0.045, baseInset: 0 },
    // Мышцы: оболочка утоплена, мышцы выпуклые, между ними борозды
    muscle: { kBase: 0.12, kMuscle: 0.028, muscleInset: -0.012, baseInset: 0.018 },
};

/** Корзины по высоте: в точке считаются только примитивы, которые до неё дотягиваются. */
function bucketize(prims, y0, y1, step) {
    const n = Math.ceil((y1 - y0) / step) + 1;
    const buckets = Array.from({ length: n }, () => []);
    prims.forEach((p) => {
        const a = Math.max(0, Math.floor((p.ymin - y0) / step));
        const b = Math.min(n - 1, Math.floor((p.ymax - y0) / step));
        for (let i = a; i <= b; i += 1) buckets[i].push(p);
    });
    return { buckets, y0, step };
}

export function makeBodyField(variant = 'skin') {
    const v = VARIANTS[variant] ?? VARIANTS.skin;
    const base = basePrimitives();
    const face = facePrimitives();
    const muscles = musclePrimitives();
    const Y0 = -4;
    const bb = bucketize(base, Y0, 4.2, 0.1);
    const bm = bucketize(muscles, Y0, 4.2, 0.1);
    const bf = bucketize(face, Y0, 4.2, 0.1);
    const idx = (y) => Math.min(bb.buckets.length - 1, Math.max(0, Math.floor((y - Y0) / 0.1)));

    const field = (x, y, z) => {
        let d = 10;
        const bl = bb.buckets[idx(y)];
        for (let i = 0; i < bl.length; i += 1) d = smin(d, sd(x, y, z, bl[i]), v.kBase);
        d += v.baseInset;
        // Черты лица — резкое слияние, иначе нос и губы тонут в голове
        if (y > 2.8) {
            const fl = bf.buckets[idx(y)];
            for (let i = 0; i < fl.length; i += 1) d = smin(d, sd(x, y, z, fl[i]) + v.baseInset * 0.5, fl[i].k ?? 0.025);
        }
        const ml = bm.buckets[idx(y)];
        for (let i = 0; i < ml.length; i += 1) {
            // Косые мышцы видны только без кожи — под ней они давали «бока»
            if (ml[i].muscleOnly && variant === 'skin') continue;
            d = smin(d, sd(x, y, z, ml[i]) + v.muscleInset, v.kMuscle);
        }
        if (y > 2.9 && y < 3.45 && z > 0.2) {
            // Глазницы под надбровьем — в них садятся глазные яблоки
            const eye = Math.min(
                Math.hypot(x - 0.12, y - 3.28, z - 0.36) - 0.056,
                Math.hypot(x + 0.12, y - 3.28, z - 0.36) - 0.056,
            );
            d = smax(d, -eye, 0.03);
            // Линия рта между губами
            const mouth = sdEllipsoid(x, y, z, MOUTH);
            d = smax(d, -mouth, 0.004);
        }
        return d;
    };

    /** Ближайшая мышца: группа, центр, ось, положение вдоль оси. */
    const muscleAt = (x, y, z) => {
        let best = null;
        let bd = 0.09;
        const ml = bm.buckets[idx(y)];
        for (let i = 0; i < ml.length; i += 1) {
            const m = ml[i];
            const dd = sd(x, y, z, m);
            if (dd < bd) { bd = dd; best = m; }
        }
        if (!best) return null;
        const along = ((x - best.c[0]) * best.axis[0] + (y - best.c[1]) * best.axis[1] + (z - best.c[2]) * best.axis[2]) / best.len;
        return { group: best.group, c: best.c, axis: best.axis, along };
    };

    return { field, muscleAt };
}

// ─── Surface nets ───────────────────────────────────────────────────────────

const CUBE_EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
];

/**
 * Поверхность из поля: в каждой ячейке со сменой знака — одна вершина в
 * среднем точек пересечения рёбер, на каждое пересечённое ребро сетки — квад.
 * Результат сглаживается сам собой, без «ступенек» марширующих кубов.
 */
export function buildBodyMesh(variant = 'skin', h = 0.028) {
    const { field, muscleAt } = makeBodyField(variant);
    const x0 = -1.36; const x1 = 1.36;
    const y0 = -3.82; const y1 = 3.95;
    const z0 = -0.62; const z1 = 0.72;
    const nx = Math.ceil((x1 - x0) / h) + 1;
    const ny = Math.ceil((y1 - y0) / h) + 1;
    const nz = Math.ceil((z1 - z0) / h) + 1;
    const values = new Float32Array(nx * ny * nz);
    const at = (i, j, k) => i + nx * (j + ny * k);

    for (let k = 0; k < nz; k += 1) {
        const z = z0 + k * h;
        for (let j = 0; j < ny; j += 1) {
            const y = y0 + j * h;
            for (let i = 0; i < nx; i += 1) values[at(i, j, k)] = field(x0 + i * h, y, z);
        }
    }

    const cellIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
    const cellAt = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
    const pos = [];
    const corner = new Float32Array(8);
    for (let k = 0; k < nz - 1; k += 1) {
        for (let j = 0; j < ny - 1; j += 1) {
            for (let i = 0; i < nx - 1; i += 1) {
                let mask = 0;
                for (let c = 0; c < 8; c += 1) {
                    const v = values[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
                    corner[c] = v;
                    if (v < 0) mask |= 1 << c;
                }
                if (mask === 0 || mask === 255) continue;
                let sx = 0; let sy = 0; let sz = 0; let n = 0;
                for (let e = 0; e < 12; e += 1) {
                    const [a, b] = CUBE_EDGES[e];
                    const va = corner[a];
                    const vb = corner[b];
                    if ((va < 0) === (vb < 0)) continue;
                    const t = va / (va - vb);
                    sx += (a & 1) + (((b & 1) - (a & 1)) * t);
                    sy += ((a >> 1) & 1) + ((((b >> 1) & 1) - ((a >> 1) & 1)) * t);
                    sz += ((a >> 2) & 1) + ((((b >> 2) & 1) - ((a >> 2) & 1)) * t);
                    n += 1;
                }
                cellIndex[cellAt(i, j, k)] = pos.length / 3;
                pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
            }
        }
    }

    const index = [];
    const quad = (a, b, c, d, flip) => {
        if (a < 0 || b < 0 || c < 0 || d < 0) return;
        if (flip) index.push(a, c, b, a, d, c);
        else index.push(a, b, c, a, c, d);
    };
    for (let k = 1; k < nz - 1; k += 1) {
        for (let j = 1; j < ny - 1; j += 1) {
            for (let i = 1; i < nx - 1; i += 1) {
                const inside = values[at(i, j, k)] < 0;
                // Ребро по X
                if (inside !== (values[at(i + 1, j, k)] < 0)) {
                    quad(cellIndex[cellAt(i, j - 1, k - 1)], cellIndex[cellAt(i, j, k - 1)], cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i, j - 1, k)], !inside);
                }
                // Ребро по Y
                if (inside !== (values[at(i, j + 1, k)] < 0)) {
                    quad(cellIndex[cellAt(i - 1, j, k - 1)], cellIndex[cellAt(i - 1, j, k)], cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i, j, k - 1)], !inside);
                }
                // Ребро по Z
                if (inside !== (values[at(i, j, k + 1)] < 0)) {
                    quad(cellIndex[cellAt(i - 1, j - 1, k)], cellIndex[cellAt(i, j - 1, k)], cellIndex[cellAt(i, j, k)], cellIndex[cellAt(i - 1, j, k)], !inside);
                }
            }
        }
    }

    // Нормали — градиент поля: точнее, чем усреднение граней, и без швов
    const count = pos.length / 3;
    const positions = new Float32Array(pos);
    const normals = new Float32Array(count * 3);
    const muscle = new Float32Array(count * 2);   // группа, положение вдоль оси
    const centers = new Float32Array(count * 3);
    const axes = new Float32Array(count * 3);
    const e = 0.006;
    for (let v = 0; v < count; v += 1) {
        const x = positions[v * 3]; const y = positions[v * 3 + 1]; const z = positions[v * 3 + 2];
        let gx = field(x + e, y, z) - field(x - e, y, z);
        let gy = field(x, y + e, z) - field(x, y - e, z);
        let gz = field(x, y, z + e) - field(x, y, z - e);
        const l = Math.hypot(gx, gy, gz) || 1;
        gx /= l; gy /= l; gz /= l;
        normals[v * 3] = gx; normals[v * 3 + 1] = gy; normals[v * 3 + 2] = gz;
        const m = muscleAt(x, y, z);
        if (m) {
            muscle[v * 2] = m.group;
            muscle[v * 2 + 1] = Math.max(-1, Math.min(1, m.along));
            centers.set(m.c, v * 3);
            axes.set(m.axis, v * 3);
        } else {
            axes.set([0, 1, 0], v * 3);
            centers.set([x, y, z], v * 3);
        }
    }

    return { positions, normals, muscle, centers, axes, index: new Uint32Array(index) };
}
