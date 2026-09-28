import * as THREE from 'three';

/**
 * Материалы подуровней тела. Оба — стандартные PBR-материалы с добавками в
 * шейдере: освещение, тени и тонмаппинг остаются общими со сценой, а
 * особенности ткани (волокна, чешуя, рана, ожог) считаются по координатам
 * вершины в пространстве фигуры.
 */

export const MUSCLE_GROUP_COUNT = 11;

/**
 * Вершинная часть: у каждой вершины — мышца (группа, положение вдоль оси),
 * её центр и ось (lib/bodySdf.js). uGroup[g] = (радиальный масштаб,
 * масштаб вдоль оси, дрожь) — так бицепс набухает, бедро тянется, а икру
 * сводит судорогой прямо в шейдере, без пересборки геометрии.
 */
const COMMON_VERTEX = /* glsl */ `
attribute vec2 aMuscle;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute float aEdge;
uniform vec3 uGroup[${11}];
uniform float uTime;
varying vec3 vBodyPos;
varying vec2 vMuscle;
varying vec3 vCenter;
varying vec3 vAxis;
varying float vEdge;
`;

function patchVertex(shader) {
    shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${COMMON_VERTEX}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
            int g = int(aMuscle.x + 0.5);
            if (g > 0) {
                vec3 gs = uGroup[g];
                // К сухожилиям деформация сходит на нет — мышца крепится к кости
                float w = 1.0 - smoothstep(0.55, 1.0, abs(aMuscle.y));
                vec3 q = transformed - aCenter;
                float al = dot(q, aAxis);
                vec3 rad = q - aAxis * al;
                vec3 moved = aCenter + aAxis * al * gs.y + rad * gs.x;
                moved += normal * gs.z * sin(uTime * 55.0 + aCenter.x * 9.0 + aCenter.y * 5.0) * 0.012;
                transformed = mix(transformed, moved, w);
            }
            vBodyPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
            vMuscle = aMuscle;
            vCenter = aCenter;
            vAxis = aAxis;
            vEdge = aEdge;`);
}

/** Uniform групп мышц: общий для кожи и мышц — бицепс растёт и под кожей. */
export function makeGroupUniform() {
    return { value: Array.from({ length: MUSCLE_GROUP_COUNT }, () => new THREE.Vector3(1, 1, 0)) };
}

const HASH = /* glsl */ `
float bodyHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float bodyNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
        mix(mix(bodyHash(i), bodyHash(i + vec3(1, 0, 0)), f.x), mix(bodyHash(i + vec3(0, 1, 0)), bodyHash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(bodyHash(i + vec3(0, 0, 1)), bodyHash(i + vec3(1, 0, 1)), f.x), mix(bodyHash(i + vec3(0, 1, 1)), bodyHash(i + vec3(1, 1, 1)), f.x), f.y),
        f.z);
}
float segDist(vec3 p, vec3 a, vec3 b) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}
`;

/**
 * Кожа. uniforms — объект с числовыми uniform-ами, которые сцена ведёт к
 * целям сама: uBurn (ожог), uHeat (перегрев), uWrinkle (морщины), uScales
 * (ихтиоз), uWound (длина раны 0..1), uScar (рубец), uTouch (рецепторы),
 * uNumb (онемение).
 */
export function createSkinMaterial(uniforms, { clippingPlanes } = {}) {
    const material = new THREE.MeshPhysicalMaterial({
        color: '#e6a88a',
        roughness: 0.62,
        metalness: 0,
        sheen: 0.6,
        sheenRoughness: 0.5,
        sheenColor: new THREE.Color('#ffd6c4'),
        clearcoat: 0.08,
        clearcoatRoughness: 0.6,
        clippingPlanes,
    });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        patchVertex(shader);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                varying vec3 vBodyPos;
                varying vec2 vMuscle;
                varying vec3 vCenter;
                varying vec3 vAxis;
                uniform float uBurn;
                uniform float uHeat;
                uniform float uWrinkle;
                uniform float uScales;
                uniform float uWound;
                uniform float uScar;
                uniform float uTouch;
                uniform float uNumb;
                uniform float uTime;
                ${HASH}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                vec3 P = vBodyPos;
                // Лёгкая неровность цвета: кожа никогда не бывает одного тона
                diffuseColor.rgb *= 0.97 + 0.04 * bodyNoise(P * 9.0);
                // Тень небритости по челюсти и над губой — лицо взрослого мужчины
                float jawZone = smoothstep(3.12, 3.0, P.y) * smoothstep(2.86, 2.95, P.y) * smoothstep(0.1, 0.25, P.z);
                float lipZone = smoothstep(0.03, 0.0, abs(P.y - 3.036) - 0.02) * smoothstep(0.1, 0.07, abs(P.x));
                float stubble = jawZone * (1.0 - lipZone) * (0.7 + 0.3 * bodyHash(floor(P * 260.0)));
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.33, 0.3), stubble * 0.0);
                // Румянец на щеках, губы, розовые ладони и колени
                float blush = smoothstep(0.16, 0.0, length(vec2(abs(P.x) - 0.2, P.y - 3.08))) * step(0.25, P.z);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.62, 0.55), blush * 0.08);

                // Ожог: сверху и спереди — плечи, лицо, грудь
                float sunlit = smoothstep(1.7, 2.6, P.y) * (0.6 + 0.4 * smoothstep(-0.1, 0.4, P.z));
                float blotch = 0.75 + 0.25 * bodyNoise(P * 6.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.26, 0.2), uBurn * sunlit * blotch * 0.85);

                // Перегрев: вся кожа наливается красным и блестит от пота
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.42, 0.34), uHeat * 0.45);

                // Онемение: кисти бледнеют и синеют
                float hands = smoothstep(1.02, 1.12, abs(P.x)) * smoothstep(0.25, 0.05, P.y);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.66, 0.82), uNumb * hands * 0.7);

                // Морщины: лоб, уголки глаз, носогубные складки, тыльная сторона кистей
                float forehead = smoothstep(3.36, 3.42, P.y) * (1.0 - smoothstep(3.55, 3.62, P.y)) * step(0.25, P.z);
                float lines = pow(abs(sin(P.y * 140.0 + sin(P.x * 18.0) * 1.2)), 14.0);
                vec2 eyeC = vec2(abs(P.x) - 0.19, P.y - 3.28);
                float crows = pow(abs(sin(atan(eyeC.y, eyeC.x) * 8.0)), 26.0) * smoothstep(0.08, 0.02, length(eyeC)) * step(0.2, P.z);
                float fold = smoothstep(0.012, 0.0, abs(length(vec2(abs(P.x) - 0.02, P.y - 3.2)) - 0.1)) * step(3.02, P.y) * step(P.y, 3.17) * step(0.3, P.z);
                diffuseColor.rgb *= 1.0 - uWrinkle * (forehead * lines + crows + fold * 0.8 + hands * lines) * 0.5;

                // Брови, губы и короткие волосы: без них голова читалась манекеном
                float brow = smoothstep(0.016, 0.0, abs(P.y - 3.372 - 0.015 * sin(abs(P.x) * 14.0)))
                    * smoothstep(0.23, 0.2, abs(P.x)) * smoothstep(0.04, 0.07, abs(P.x)) * step(0.28, P.z);
                diffuseColor.rgb *= 1.0 - brow * 0.08;
                float lips = smoothstep(0.03, 0.0, abs(P.y - 3.036) - 0.02) * smoothstep(0.1, 0.07, abs(P.x)) * step(0.34, P.z);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.5, 0.44), lips * 0.18);
                // Линия рта с едва приподнятыми уголками
                float mouthLine = smoothstep(0.007, 0.0, abs(P.y - 3.038 - 2.2 * P.x * P.x)) * smoothstep(0.085, 0.06, abs(P.x)) * step(0.3, P.z);
                diffuseColor.rgb *= 1.0 - mouthLine * 0.45;
                float hairline = 3.53 + 0.03 * cos(P.x * 9.0) - 0.13 * clamp((abs(P.x) - 0.14) / 0.14, 0.0, 1.0) * step(0.0, P.z) - 0.3 * clamp(-P.z / 0.35, 0.0, 1.0);
                float hair = smoothstep(hairline - 0.01, hairline + 0.03, P.y) * (1.0 - smoothstep(0.3, 0.34, abs(P.x)) * step(3.35, P.y) * 0.0);
                float strand = 0.8 + 0.2 * bodyNoise(vec3(P.x * 90.0, P.y * 30.0, P.z * 90.0)) + 0.06 * sin(P.x * 260.0 + bodyNoise(P * 30.0) * 6.0);
                // Волосы — не краска, а чуть более тёмная «лепка», как у манекена:
                // тёмный парик на гладкой голове смотрелся жутко
                diffuseColor.rgb *= 1.0 - hair * (0.1 + 0.05 * strand);
                diffuseColor.rgb *= 1.0 - smoothstep(0.02, 0.0, abs(P.y - hairline)) * step(0.0, P.z) * 0.12;

                // Ихтиоз: роговые пластины ромбической решёткой, как чешуя
                vec2 sc = vec2(P.x * 13.0 + P.y * 7.0, P.x * 13.0 - P.y * 7.0) + vec2(P.z * 6.0);
                vec2 cell = abs(fract(sc) - 0.5);
                float border = smoothstep(0.42, 0.5, max(cell.x, cell.y));
                float plate = bodyHash(vec3(floor(sc), 1.0));
                vec3 scaleTone = mix(vec3(0.62, 0.55, 0.46), vec3(0.48, 0.42, 0.36), plate);
                diffuseColor.rgb = mix(diffuseColor.rgb, scaleTone * (1.0 - border * 0.6), uScales * 0.85);

                // Рана на левом предплечье: заживает от концов к середине
                vec3 wa = vec3(1.1, 0.78, 0.13);
                vec3 wb = vec3(1.15, 0.45, 0.14);
                float wd = segDist(P, mix(wa, wb, 0.5 - 0.5 * uWound), mix(wa, wb, 0.5 + 0.5 * uWound));
                float wound = smoothstep(0.03, 0.012, wd) * step(0.0, P.z);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.06, 0.08), wound * step(0.02, uWound));
                float scar = smoothstep(0.035, 0.018, segDist(P, wa, wb)) * step(0.0, P.z);
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.8, 0.76), scar * uScar);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                // Рецепторы касания светятся точками на ладонях и пальцах
                vec3 rc = floor(P * 55.0);
                float receptor = step(0.93, bodyHash(rc)) * hands;
                float pulse = 0.5 + 0.5 * sin(uTime * 4.0 + bodyHash(rc + 3.0) * 30.0);
                totalEmissiveRadiance += vec3(1.0, 0.55, 0.75) * receptor * pulse * uTouch * 1.6;
                // Пот при перегреве: влажные блики вспыхивают и гаснут
                float sweat = step(0.985, bodyHash(floor(P * 70.0))) * (0.5 + 0.5 * sin(uTime * 2.0 + P.y * 10.0));
                totalEmissiveRadiance += vec3(0.9, 0.9, 1.0) * sweat * uHeat * 0.6;`);
    };
    material.customProgramCacheKey = () => 'body-skin-sdf';
    return material;
}

/**
 * Мышцы: волокна вдоль длины (по uv.x — окружность, по uv.y — длина), к
 * концам веретена — белые сухожилия. uOssify превращает волокна в кость,
 * uCramp темнит и синит мышцу, uFatigue бледнит, uPower — тёплое свечение
 * работающей мышцы.
 */
export function createMuscleMaterial(uniforms, { clippingPlanes } = {}) {
    const material = new THREE.MeshStandardMaterial({
        color: '#b8323c',
        roughness: 0.42,
        metalness: 0,
        clippingPlanes,
        // Мышцы лежат вплотную под кожей: сдвиг глубины не даёт им мерцать
        // сквозь неё, пока линия снятия идёт по телу
        polygonOffset: true,
        polygonOffsetFactor: 2,
        polygonOffsetUnits: 2,
    });
    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        patchVertex(shader);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                varying vec3 vBodyPos;
                varying vec2 vMuscle;
                varying vec3 vCenter;
                varying vec3 vAxis;
                varying float vEdge;
                uniform float uOssify;
                uniform float uCramp;
                uniform float uFatigue;
                uniform float uPower;
                uniform float uTime;
                ${HASH}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                vec3 P = vBodyPos;
                // Волокна идут вдоль оси своей мышцы: расстояние до оси,
                // нарезанное полосами, на поверхности даёт линии вдоль мышцы
                bool isMuscle = vMuscle.x > 0.5;
                vec3 q = P - vCenter;
                float radial = length(q - vAxis * dot(q, vAxis));
                float stripes = isMuscle ? radial * 150.0 : (P.x * 90.0 + P.y * 12.0 + P.z * 60.0);
                float fiber = 0.5 + 0.5 * sin(stripes + bodyNoise(P * 22.0) * 2.4);
                float fine = 0.5 + 0.5 * sin(stripes * 3.1);
                vec3 muscle = mix(vec3(0.42, 0.07, 0.09), vec3(0.8, 0.21, 0.23), fiber * 0.7 + fine * 0.3);
                // Сухожилия у концов мышцы, фасция — светлые разводы между мышцами
                // Сухожилия — узкие светлые концы; граница мягкая, иначе на стыке
                // мышц соседние вершины давали зубчатые белые пятна
                float tendon = isMuscle ? smoothstep(0.985, 1.0, abs(vMuscle.y)) * 0.3 : 0.0;
                muscle = mix(muscle, vec3(0.92, 0.88, 0.8), clamp(tendon, 0.0, 1.0));
                // Борозда между мышцами: тёмная щель фасции вместо обрыва волокон
                float groove = smoothstep(0.25, 0.8, vEdge);
                muscle = mix(muscle, vec3(0.2, 0.03, 0.05), groove * 0.7);
                // Судорога: мышца темнеет до багрового
                muscle = mix(muscle, vec3(0.32, 0.04, 0.16), uCramp * 0.6);
                // Истощение: бледная, обескровленная
                muscle = mix(muscle, vec3(0.72, 0.56, 0.54), uFatigue * 0.55);
                // Окостенение: волокна белеют и твердеют, по ним идут трещины
                float crack = smoothstep(0.47, 0.5, abs(bodyNoise(P * 14.0) - 0.5) + 0.02);
                vec3 bone = mix(vec3(0.9, 0.86, 0.76), vec3(0.62, 0.58, 0.5), crack);
                diffuseColor.rgb = mix(muscle, bone, uOssify);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
                roughnessFactor = mix(roughnessFactor, 0.8, uOssify);`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                float beat = 0.5 + 0.5 * sin(uTime * 2.2 + vBodyPos.y * 1.5);
                totalEmissiveRadiance += vec3(0.5, 0.06, 0.04) * uPower * beat * (1.0 - uOssify) * 0.35;`);
    };
    material.customProgramCacheKey = () => 'body-muscle';
    return material;
}

/** Числовые uniform-ы с плавным ведением к цели. */
export function makeUniforms(initial) {
    const out = {};
    Object.entries(initial).forEach(([k, v]) => { out[k] = { value: v }; });
    return out;
}

export function dampUniforms(uniforms, targets, speed, dt) {
    Object.entries(targets).forEach(([k, v]) => {
        if (uniforms[k]) uniforms[k].value = THREE.MathUtils.damp(uniforms[k].value, v, speed, dt);
    });
}
