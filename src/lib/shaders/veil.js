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
    // Сектор целиком заливал прямоугольник, который к краю кадра
    // расширялся в плиту. Внутри сектора луч — тонкая линия с гауссовым
    // профилем, а два слоя с разной густотой дают глубину.
    float streak = 0.0;
    if (uStreaks > 0.001) {
        for (int layer = 0; layer < 2; layer++) {
            float count = layer == 0 ? 150.0 : 64.0;
            float a = (ang + 3.14159265) / 6.28318530 * count;
            float id = floor(a) + float(layer) * 517.0;
            float rnd = hash(id);
            float across = (fract(a) - 0.5 - (hash(id + 3.1) - 0.5) * 0.5) / (0.07 + rnd * 0.08);
            float line = exp(-across * across);
            float band = fract(d * (0.9 + rnd * 1.2) - uTime * (0.5 + rnd * 1.7) - rnd);
            // Яркая голова и длинный хвост к центру
            float head = pow(band, 10.0) * smoothstep(1.0, 0.94, band);
            float live = step(0.35, hash(id + 7.7));
            streak += line * head * live * (0.45 + rnd * 0.8) * (layer == 0 ? 1.0 : 0.6);
        }
        streak *= smoothstep(0.06, 0.75, d);
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
