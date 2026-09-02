/**
 * Шейдеры Земли. Освещение считается в мировых координатах, поэтому смена дня и
 * ночи корректно бежит по поверхности при любом повороте планеты.
 *
 * Цветовой пайплайн ручной: текстуры декодируются из sRGB в линейное пространство,
 * а на выходе возвращаются в sRGB. Так свет складывается физически правильно,
 * не завися от версии three.js и её встроенных include-чанков.
 */

const COLOR_UTILS = /* glsl */ `
vec3 srgbToLinear(vec3 c) { return pow(max(c, vec3(0.0)), vec3(2.2)); }
vec3 linearToSrgb(vec3 c) { return pow(max(c, vec3(0.0)), vec3(0.4545454545)); }
`;

export const earthSurfaceVertex = /* glsl */ `
uniform sampler2D uWaterMask;
uniform float uTime;
uniform float uWaveAmp;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
    vUv = uv;

    // Океан физически поднимается волнами, континенты остаются неподвижными.
    // three.js подменяет texture2D на GLSL3-вариант texture(), который работает
    // и в вершинном шейдере, тогда как texture2DLod при такой трансляции ломается.
    float water = texture2D(uWaterMask, uv).r;
    float t = uTime;
    float swell = sin(position.x * 1.7 + t * 1.15) * cos(position.z * 1.4 - t * 0.8)
                + sin(position.y * 2.2 + t * 0.95) * 0.55;
    vec3 displaced = position + normal * swell * uWaveAmp * water;

    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const earthSurfaceFragment = /* glsl */ `
uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uWaterMask;
uniform sampler2D uBumpMap;

uniform vec3 uSunDir;
uniform vec3 uWaterTint;
uniform float uTime;
uniform float uNightGlow;
uniform float uDrought;
uniform float uDesert;
uniform float uWaveStrength;
uniform float uBumpStrength;
uniform float uFoam;
uniform float uAmbient;

varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vPosW;

${COLOR_UTILS}

void main() {
    vec3 N = normalize(vNormalW);
    float rawWater = texture2D(uWaterMask, vUv).r;
    float water = clamp(rawWater * (1.0 - uDrought * 0.9), 0.0, 1.0);

    vec3 albedo = srgbToLinear(texture2D(uDayMap, vUv).rgb);
    albedo = mix(albedo, vec3(0.31, 0.24, 0.16), rawWater * uDrought * 0.85);
    albedo = mix(albedo, vec3(0.70, 0.56, 0.33), (1.0 - rawWater) * uDesert * 0.8);
    albedo = mix(albedo, srgbToLinear(uWaterTint), water * 0.28);

    // Тангенциальный базис сферы для возмущения нормали
    vec3 T = normalize(vec3(-N.z, 0.0, N.x) + vec3(1e-5));
    vec3 B = cross(N, T);

    // Рельеф континентов
    vec3 bump = texture2D(uBumpMap, vUv).xyz * 2.0 - 1.0;
    vec3 landN = normalize(N + (T * bump.x + B * bump.y) * uBumpStrength * (1.0 - water));

    // Динамические волны: три пересекающихся гребня разной частоты и скорости
    vec2 wp = vUv * vec2(150.0, 75.0);
    float t = uTime;
    float w1 = sin(wp.x * 0.85 + t * 2.1) * cos(wp.y * 0.65 - t * 1.5);
    float w2 = sin((wp.x + wp.y) * 0.5 - t * 2.7);
    float w3 = sin(wp.y * 1.35 + t * 0.95);
    vec3 waterN = normalize(
        N + (T * (w1 * 0.7 + w3 * 0.3) + B * (w2 * 0.75 + w1 * 0.25)) * uWaveStrength
    );

    vec3 shadingN = mix(landN, waterN, water);

    float diffuse = max(dot(shadingN, uSunDir), 0.0);
    float terminator = smoothstep(-0.20, 0.24, dot(N, uSunDir));

    // Солнечная дорожка на воде
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 H = normalize(uSunDir + V);
    float glint = pow(max(dot(waterN, H), 0.0), 58.0) * water * terminator;

    // Прибой: береговая линия ищется как перепад маски воды между соседними точками
    float shore = 0.0;
    if (uFoam > 0.001) {
        vec2 step = vec2(0.0022, 0.0044);
        float wx = texture2D(uWaterMask, vUv + vec2(step.x, 0.0)).r;
        float wy = texture2D(uWaterMask, vUv + vec2(0.0, step.y)).r;
        shore = clamp((abs(rawWater - wx) + abs(rawWater - wy)) * 1.6, 0.0, 1.0);
    }
    float foam = shore * (0.6 + 0.4 * sin(t * 2.0 + vUv.x * 90.0 + vUv.y * 60.0)) * uFoam;

    // Ночная сторона подсвечена холодным «лунным» тоном, иначе тёплый ambient
    // делает ночные континенты похожими на выцветшую пустыню
    vec3 ambientTint = mix(vec3(0.30, 0.42, 0.72), vec3(1.0), terminator);
    vec3 lit = albedo * (uAmbient * ambientTint + diffuse * 1.15);
    lit += vec3(1.0, 0.94, 0.80) * glint * 1.6;
    lit += vec3(0.72, 0.88, 1.0) * foam * 0.55 * terminator;

    // Огни городов проступают только на неосвещённой стороне.
    // Тёмно-синий фон карты Black Marble отсекается по яркости, чтобы не светился океан.
    vec3 nightTex = srgbToLinear(texture2D(uNightMap, vUv).rgb);
    float lum = dot(nightTex, vec3(0.299, 0.587, 0.114));
    vec3 cityLights = nightTex * smoothstep(0.02, 0.14, lum);
    lit += cityLights * (1.0 - terminator) * uNightGlow * (1.0 - water * 0.8);

    gl_FragColor = vec4(linearToSrgb(lit), 1.0);
}
`;

export const cloudsVertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalW;

void main() {
    vUv = uv;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudsFragment = /* glsl */ `
uniform sampler2D uCloudMap;
uniform vec3 uSunDir;
uniform float uTime;
uniform float uOpacity;
uniform float uDrift;

varying vec2 vUv;
varying vec3 vNormalW;

void main() {
    // Два слоя с разной скоростью дают ощущение живой циркуляции атмосферы
    vec4 layerA = texture2D(uCloudMap, vUv + vec2(uTime * uDrift, 0.0));
    vec4 layerB = texture2D(uCloudMap, vUv * 1.7 + vec2(-uTime * uDrift * 0.6, 0.05));

    // Работает и с картами «белое на прозрачном», и с «белое на чёрном»
    float a = layerA.a * max(layerA.r, max(layerA.g, layerA.b));
    float b = layerB.a * max(layerB.r, max(layerB.g, layerB.b));
    float coverage = clamp(a * 0.85 + b * 0.4, 0.0, 1.0);

    float light = max(dot(normalize(vNormalW), uSunDir), 0.0);
    float terminator = smoothstep(-0.25, 0.30, dot(normalize(vNormalW), uSunDir));
    vec3 tint = mix(vec3(0.09, 0.12, 0.20), vec3(1.0), 0.15 + light * 0.9);
    tint = mix(tint, vec3(1.0, 0.82, 0.62), (1.0 - terminator) * light * 0.5);

    gl_FragColor = vec4(tint, coverage * uOpacity);
}
`;

export const atmosphereVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vPosW = worldPos.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

export const atmosphereFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uSunsetColor;
uniform vec3 uSunDir;
uniform float uIntensity;
uniform float uPower;

varying vec3 vNormalW;
varying vec3 vPosW;

void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);

    // Френель: свечение собирается по краю диска планеты
    float rim = pow(1.0 - abs(dot(N, V)), uPower);
    float sun = max(dot(N, uSunDir), 0.0);

    // На линии терминатора рассеяние краснеет, как настоящий закат
    float sunset = pow(1.0 - abs(dot(N, uSunDir)), 6.0);
    vec3 color = mix(uColor, uSunsetColor, sunset * 0.75);

    float glow = rim * (0.18 + sun * 1.05) * uIntensity;
    gl_FragColor = vec4(color * glow, glow);
}
`;
