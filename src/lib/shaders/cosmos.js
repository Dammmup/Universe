/**
 * Шейдеры Солнечной системы: поверхность звезды, корона, атмосферный ободок
 * планет, поток солнечного ветра и хвосты кометы.
 */

// Симплекс-шум 3D (Ashima / Stefan Gustavson, MIT)
export const noise3 = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbm(vec3 p) {
    float f = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
        f += a * snoise(p);
        p *= 2.03;
        a *= 0.5;
    }
    return f;
}
`;

/**
 * Фотосфера. Вместо картинки на шаре — кипящая грануляция, тёмные пятна и
 * потемнение к краю диска: именно оно делает звезду шаром, а не кругом.
 * Цвет выходит за единицу, чтобы его подхватывало свечение.
 */
export const sunVertex = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    vObj = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}
`;

export const sunFragment = /* glsl */ `
uniform float uTime;
uniform float uDim;
varying vec3 vObj;
varying vec3 vNormal;
varying vec3 vView;
${noise3}
void main() {
    vec3 p = normalize(vObj);
    float t = uTime;
    // Крупные конвективные ячейки и мелкое кипение поверх
    float cells = 1.0 - abs(snoise(p * 9.0 + vec3(0.0, t * 0.05, t * 0.04)));
    float boil = fbm(p * 22.0 + vec3(t * 0.12, -t * 0.08, t * 0.1));
    float heat = clamp(0.28 + cells * 0.5 + boil * 0.32, 0.0, 1.0);
    // Пятна: редкие, живут в средних широтах
    float spotField = fbm(p * 2.3 + vec3(13.1, 0.0, t * 0.01));
    float lat = abs(p.y);
    float spot = smoothstep(0.42, 0.55, spotField) * smoothstep(0.05, 0.2, lat) * smoothstep(0.65, 0.4, lat);
    heat *= 1.0 - spot * 0.75;

    float mu = clamp(dot(vNormal, vView), 0.0, 1.0);
    float limb = pow(mu, 0.45);

    vec3 deep = mix(vec3(0.7, 0.14, 0.01), vec3(0.5, 0.08, 0.0), uDim);
    vec3 mid = mix(vec3(1.0, 0.48, 0.08), vec3(0.75, 0.22, 0.04), uDim);
    vec3 hot = mix(vec3(1.0, 0.86, 0.52), vec3(0.95, 0.42, 0.1), uDim);
    vec3 col = heat < 0.6 ? mix(deep, mid, heat / 0.6) : mix(mid, hot, (heat - 0.6) / 0.4);
    col *= mix(0.3, 1.0, limb) * mix(1.1, 0.8, uDim);
    // Край диска краснеет: свет идёт через более холодные верхние слои
    col = mix(col * vec3(1.0, 0.55, 0.25), col, smoothstep(0.0, 0.5, mu));
    gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Корона: плоскость, повёрнутая к камере. Лучи-стримеры — шум по углу,
 * растянутый вдоль радиуса, а не нарисованные отрезки: прежние линии
 * читались иглами ежа.
 */
export const coronaVertex = /* glsl */ `
varying vec2 vPos;
void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const coronaFragment = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uDim;
uniform vec3 uColor;
varying vec2 vPos;
${noise3}
void main() {
    float r = length(vPos);
    float x = max(0.0, (r - uRadius) / uRadius);
    float ang = atan(vPos.y, vPos.x);
    vec2 dir = vPos / max(r, 0.0001);
    // Стримеры: шум по окружности, медленно текущий наружу
    float s = snoise(vec3(dir * 2.6, x * 0.6 - uTime * 0.05));
    s += 0.5 * snoise(vec3(dir * 6.0, x * 1.2 - uTime * 0.09 + 4.0));
    float streak = 0.55 + 0.6 * s;
    float glow = exp(-x * 5.0) * 0.55 + exp(-x * 1.6) * 0.22 * max(0.0, streak);
    // Тонкая хромосфера по самому лимбу
    glow += exp(-x * 40.0) * 0.5;
    float alpha = glow * smoothstep(uRadius * 0.96, uRadius * 1.0, r);
    vec3 col = mix(uColor, vec3(1.0, 0.92, 0.75), exp(-x * 6.0));
    gl_FragColor = vec4(col * alpha * mix(1.0, 0.35, uDim), 1.0);
}
`;

/**
 * Атмосфера: ободок по краю шара, видимый только на дневной стороне.
 * Солнце — в начале координат, поэтому направление на свет берётся из
 * мировой позиции фрагмента.
 */
export const rimVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const rimFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uPower;
uniform float uSunlit;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
    vec3 n = normalize(vNormalW);
    vec3 v = normalize(cameraPosition - vWorld);
    float rim = pow(max(0.0, 1.0 - clamp(dot(n, v), 0.0, 1.0)), uPower);
    vec3 l = normalize(-vWorld);
    float day = mix(1.0, smoothstep(-0.35, 0.45, dot(n, l)), uSunlit);
    gl_FragColor = vec4(uColor * rim * day * uIntensity, 1.0);
}
`;

/**
 * Частицы, которые целиком живут в вершинном шейдере: позиция — функция
 * времени и семени. Размер в мировых единицах, как у звёзд и импульсов.
 */
export const windVertex = /* glsl */ `
uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uInner;
uniform float uLength;
attribute vec3 aDir;
attribute vec2 aSeed;
varying float vAlpha;
void main() {
    float life = fract(aSeed.x + uTime * uSpeed * (0.6 + aSeed.y * 0.8));
    // Ветер чуть закручивается вращением звезды — спираль Паркера
    float r = uInner + life * uLength;
    float twist = life * 0.5;
    vec3 d = aDir;
    vec3 p = vec3(d.x * cos(twist) - d.z * sin(twist), d.y, d.x * sin(twist) + d.z * cos(twist)) * r;
    vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - life) * (0.4 + aSeed.y * 0.6);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = (0.16 + aSeed.y * 0.12) * uScale / max(0.001, -mv.z);
    vAlpha *= clamp(px / 1.5, 0.0, 1.0);
    gl_PointSize = max(px, 1.5);
}
`;

export const glowPointFragment = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 3.0) * (1.0 - d);
    gl_FragColor = vec4(uColor * a * vAlpha * uOpacity, 1.0);
}
`;

/**
 * Хвосты кометы. Настоящий хвост направлен от Солнца, а не вдоль пути:
 * ионный — прямой и голубой, пылевой — желтоватый и изогнутый назад по
 * орбите. Частицы текут от головы к концу хвоста.
 */
export const cometVertex = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uLength;
uniform vec3 uHead;
uniform vec3 uAnti;
uniform vec3 uBack;
uniform vec3 uSide;
attribute vec4 aSeed;   // позиция по хвосту, разброс x, разброс y, тип
varying float vAlpha;
varying float vKind;
void main() {
    float t = fract(aSeed.x + uTime * (aSeed.w > 0.5 ? 0.35 : 0.18));
    float len = uLength * (aSeed.w > 0.5 ? 1.0 : 0.75);
    vec3 axis = aSeed.w > 0.5 ? uAnti : normalize(uAnti + uBack * 0.9 * t);
    vec3 up = normalize(cross(axis, uSide));
    float spread = (aSeed.w > 0.5 ? 0.06 : 0.3) + t * (aSeed.w > 0.5 ? 0.45 : 1.7);
    vec3 p = uHead + axis * t * len + (uSide * aSeed.y + up * aSeed.z) * spread;
    vAlpha = pow(max(0.0, 1.0 - t), 1.6) * smoothstep(0.0, 0.03, t);
    vKind = aSeed.w;
    vec4 mv = viewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = (aSeed.w > 0.5 ? 0.3 : 0.45) * (1.0 + t * 1.5) * uScale / max(0.001, -mv.z);
    vAlpha *= clamp(px / 1.5, 0.0, 1.0);
    gl_PointSize = max(px, 1.5);
}
`;

export const cometFragment = /* glsl */ `
uniform vec3 uIon;
uniform vec3 uDust;
uniform float uOpacity;
varying float vAlpha;
varying float vKind;
void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float a = exp(-d * d * 3.0) * (1.0 - d);
    vec3 col = vKind > 0.5 ? uIon : uDust;
    gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
}
`;
