/**
 * Шейдеры живых тканей: фреснель мембраны/органов и бороздки коры мозга.
 * Без transmission — слишком дорого для слабых GPU.
 */

export const fresnelVertex = /* glsl */ `
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const fresnelFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uRim;
uniform float uPower;
uniform float uAlpha;
uniform float uGain;

varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - abs(dot(N, V)), uPower);
    vec3 col = mix(uColor, uRim, fres);
    float alpha = mix(uAlpha, 0.95, fres) * uGain;
    gl_FragColor = vec4(col, alpha);
}
`;

export const tissueVertex = /* glsl */ `
uniform float uTime;
uniform float uFold;
varying vec3 vNormalW;
varying vec3 vPosW;
varying float vFold;

void main() {
    // Бороздки коры / альвеолы лёгких: дешёвый синус вместо карты высот
    float n = sin(position.x * 18.0 + uTime * 0.15)
            * sin(position.y * 22.0)
            * sin(position.z * 16.0 + position.x * 3.0);
    vec3 shifted = position + normal * n * uFold;
    vFold = n;
    vec4 world = modelMatrix * vec4(shifted, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const tissueFragment = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCrease;
uniform vec3 uEmissive;
uniform float uGlow;
uniform float uAlpha;

varying vec3 vNormalW;
varying vec3 vPosW;
varying float vFold;

void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    float fres = pow(1.0 - abs(dot(N, V)), 2.4);
    float crease = smoothstep(-0.15, 0.45, -vFold);
    vec3 col = mix(uColor, uCrease, crease * 0.65);
    col += uEmissive * uGlow;
    col += vec3(1.0) * fres * 0.22;
    gl_FragColor = vec4(col, uAlpha);
}
`;
