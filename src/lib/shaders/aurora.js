/** Полярное сияние: вертикальные завесы света, дрейфующие над полюсом. */

export const auroraVertex = /* glsl */ `
uniform float uTime;
uniform float uWave;

varying vec2 vUv;

void main() {
    vUv = uv;
    // Завеса колышется, как настоящая: волна бежит по кругу вокруг полюса
    float ripple = sin(uv.x * 18.0 + uTime * 1.6) * 0.5 + sin(uv.x * 7.0 - uTime * 1.1) * 0.5;
    vec3 shifted = position + normal * ripple * uWave;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(shifted, 1.0);
}
`;

export const auroraFragment = /* glsl */ `
uniform vec3 uColorLow;
uniform vec3 uColorHigh;
uniform float uTime;
uniform float uIntensity;

varying vec2 vUv;

void main() {
    // Яркость гаснет к верхнему краю завесы и пульсирует полосами по долготе
    float vertical = pow(1.0 - vUv.y, 1.7);
    float bands = 0.55
        + 0.45 * sin(vUv.x * 42.0 + uTime * 2.2)
        * sin(vUv.x * 13.0 - uTime * 0.8);
    float alpha = vertical * bands * uIntensity;

    vec3 color = mix(uColorLow, uColorHigh, vUv.y);
    gl_FragColor = vec4(color * alpha, alpha);
}
`;
