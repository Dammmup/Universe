/**
 * Шейдер «вуали» — полноэкранной заливки, которая накрывает кадр в момент
 * смены слоя реальности. Заливка расходится от центра диафрагмой, поверх идут
 * радиальные полосы светового прыжка: без них простое затемнение читается как
 * монтажная склейка, а не как проваливание сквозь масштаб.
 */
export const veilVertex = /* glsl */ `
varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const veilFragment = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uProgress;  // 0 — кадр открыт, 1 — кадр полностью залит
uniform float uTime;
uniform float uAspect;
uniform float uStreaks;   // сила полос светового прыжка
uniform float uGrain;
uniform vec3 uCoreColor;  // цвет в центре кадра
uniform vec3 uEdgeColor;  // цвет по краям

float hash(float n) {
    return fract(sin(n * 127.1) * 43758.5453123);
}

void main() {
    vec2 p = vUv - 0.5;
    p.x *= uAspect;

    float d = length(p) * 1.35;
    float ang = atan(p.y, p.x);

    // Радиальные полосы: каждый сектор живёт со своей скоростью, поэтому
    // движение читается как пролёт сквозь среду, а не как вращение текстуры.
    float streak = 0.0;
    if (uStreaks > 0.001) {
        float id = floor((ang + 3.14159265) / 6.28318530 * 110.0);
        float rnd = hash(id);
        float band = fract(d * (1.1 + rnd * 1.4) - uTime * (0.55 + rnd * 1.9));
        streak = pow(1.0 - band, 16.0) * smoothstep(0.04, 0.8, d) * (0.4 + rnd * 0.9);
    }

    // Диафрагма: край заливки уходит за пределы кадра к uProgress = 1
    float edge = uProgress * 2.25;
    float cover = smoothstep(edge, edge - 0.62, d);

    vec3 col = mix(uCoreColor, uEdgeColor, clamp(d * 0.9, 0.0, 1.0));
    col += uCoreColor * streak * uStreaks * 1.8;

    // Зерно убирает банды на больших плоских заливках
    float grain = (hash(vUv.x * 311.7 + vUv.y * 191.3 + uTime) - 0.5) * uGrain;

    float alpha = clamp(cover + streak * uStreaks * uProgress, 0.0, 1.0);
    alpha *= smoothstep(0.0, 0.06, uProgress);

    gl_FragColor = vec4(col + grain, alpha);
    #include <colorspace_fragment>
}
`;
