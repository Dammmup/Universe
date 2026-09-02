import * as THREE from 'three';

const DEG = Math.PI / 180;

const UP = new THREE.Vector3(0, 1, 0);
const NORMAL_SCRATCH = new THREE.Vector3();
const QUAT_SCRATCH = new THREE.Quaternion();

/**
 * Переводит географические координаты в точку на сфере так, чтобы результат
 * совпадал с UV-развёрткой THREE.SphereGeometry: центр текстуры (u=0.5) — нулевой
 * меридиан, верх текстуры — северный полюс. Благодаря этому объекты на поверхности
 * встают ровно на свои материки на равнопромежуточных картах Земли.
 */
export function latLonToVec3(lat, lon, radius, target = new THREE.Vector3()) {
    const latRad = lat * DEG;
    const lonRad = lon * DEG;
    const cosLat = Math.cos(latRad);
    return target.set(
        radius * cosLat * Math.cos(lonRad),
        radius * Math.sin(latRad),
        -radius * cosLat * Math.sin(lonRad),
    );
}

/** То же, но массивом — удобно для JSX-пропов position. */
export function latLonToArray(lat, lon, radius) {
    const v = latLonToVec3(lat, lon, radius);
    return [v.x, v.y, v.z];
}

/** Кватернион, ставящий объект «вертикально» на поверхность сферы в точке pos. */
export function surfaceQuaternion(pos, target = QUAT_SCRATCH) {
    if (Array.isArray(pos)) NORMAL_SCRATCH.fromArray(pos);
    else NORMAL_SCRATCH.copy(pos);
    NORMAL_SCRATCH.normalize();
    return target.setFromUnitVectors(UP, NORMAL_SCRATCH);
}

/** Сферические координаты в XYZ (совместимо со старым кодом сцен). */
export function sph(r, phi, theta) {
    return [
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta),
    ];
}

/**
 * Детерминированный ГПСЧ (mulberry32). Нужен, чтобы города, леса и горы
 * появлялись на одних и тех же местах при каждом запуске и при hot-reload.
 */
export function seededRandom(seed) {
    let a = seed >>> 0;
    return function next() {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Направление на солнце для шейдеров и источников света. */
export function sunDirection(elapsed, target = new THREE.Vector3(), nightSide = false) {
    const t = elapsed * 0.055 + (nightSide ? Math.PI : 0);
    return target.set(Math.cos(t), 0.32, Math.sin(t)).normalize();
}

/**
 * Точки дуги большого круга между двумя координатами, приподнятые над поверхностью.
 * Используется для торговых маршрутов и авиалиний между городами.
 */
export function greatCircleArc(from, to, radius, lift = 0.35, segments = 24) {
    const a = latLonToVec3(from.lat, from.lon, 1);
    const b = latLonToVec3(to.lat, to.lon, 1);
    const points = [];
    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const v = a.clone().lerp(b, t).normalize();
        const bulge = Math.sin(t * Math.PI) * lift;
        points.push(v.multiplyScalar(radius + bulge));
    }
    return points;
}
