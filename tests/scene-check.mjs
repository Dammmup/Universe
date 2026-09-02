/**
 * Прогон всех стадий в настоящем браузере: замер FPS, статистика рендера,
 * сбор ошибок консоли и скриншоты. Запуск: node tests/scene-check.mjs
 *
 * Использует установленный в системе Chrome (Playwright-браузеры не нужны),
 * окно открывается видимым — только так задействуется реальный GPU.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const OUT = 'tests/screenshots';
const STAGES = [
    { stage: 0, name: '0-singularity', settle: 2500 },
    { stage: 1, name: '1-cosmos', settle: 6000 },
    { stage: 2, name: '2-nature', settle: 6000 },
    { stage: 3, name: '3-civilisation', settle: 6000 },
    { stage: 4, name: '4-microcosmos', settle: 3500 },
    { stage: 5, name: '5-human', settle: 4000 },
];

mkdirSync(OUT, { recursive: true });

const problems = [];

const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--window-size=1440,900', '--autoplay-policy=no-user-gesture-required'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
        const text = msg.text();
        // Предупреждения самих библиотек о своих устаревших модулях не наши
        if (text.includes('has been deprecated') || text.includes('caniuse-lite')) return;
        problems.push(`[console.${type}] ${text}`);
    }
});
page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => problems.push(`[requestfailed] ${req.url()} — ${req.failure()?.errorText}`));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 20000 });

const gpu = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'нет WebGL';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'renderer скрыт';
});
console.log('GPU:', gpu);

const measure = () => page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
        frames += 1;
        const elapsed = performance.now() - start;
        if (elapsed < 3000) {
            requestAnimationFrame(tick);
            return;
        }
        const r = window.realityRenderer;
        resolve({
            fps: Math.round(frames / (elapsed / 1000)),
            calls: r?.gl.info.render.calls ?? null,
            triangles: r?.gl.info.render.triangles ?? null,
            textures: r?.gl.info.memory.textures ?? null,
            geometries: r?.gl.info.memory.geometries ?? null,
            programs: r?.gl.info.programs?.length ?? null,
        });
    };
    requestAnimationFrame(tick);
}));

const report = [];

for (const item of STAGES) {
    await page.evaluate((stage) => window.realityStore.getState().setStage(stage), item.stage);
    await page.waitForTimeout(item.settle);

    const stats = await measure();
    report.push({ stage: item.name, ...stats });
    await page.screenshot({ path: `${OUT}/${item.name}.png` });
    console.log(
        `stage ${item.name}: ${stats.fps} fps, draw calls ${stats.calls}, ` +
        `треугольников ${stats.triangles}, текстур ${stats.textures}, программ ${stats.programs}`,
    );
}

// Дополнительно: реверс нескольких факторов на планете — это тяжёлые пересчёты
await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.setStage(2);
    ['ocean', 'waves', 'photosynthesis', 'tectonics', 'aurora', 'atmosphere'].forEach((id) => {
        window.realityStore.getState().setActiveFactor(id);
        window.realityStore.getState().toggleReverse();
    });
    window.realityStore.getState().clearFactor();
});
await page.waitForTimeout(5000);
const reversedStats = await measure();
await page.screenshot({ path: `${OUT}/2-nature-reversed.png` });
console.log(`stage 2 с реверсами: ${reversedStats.fps} fps, draw calls ${reversedStats.calls}`);

await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.resetJourney();
    s.setStage(3);
    ['progress', 'urbanization', 'trade', 'ecology', 'war'].forEach((id) => {
        window.realityStore.getState().setActiveFactor(id);
        window.realityStore.getState().toggleReverse();
    });
    window.realityStore.getState().clearFactor();
});
await page.waitForTimeout(5000);
const civStats = await measure();
await page.screenshot({ path: `${OUT}/3-civilisation-reversed.png` });
console.log(`stage 3 с реверсами: ${civStats.fps} fps, draw calls ${civStats.calls}`);

console.log('\n─── Итог ───');
report.forEach((r) => console.log(`${r.stage}: ${r.fps} fps`));

if (problems.length) {
    console.log(`\n─── Проблемы (${problems.length}) ───`);
    [...new Set(problems)].forEach((p) => console.log(p));
} else {
    console.log('\nОшибок и предупреждений в консоли нет.');
}

await browser.close();
process.exit(problems.length ? 1 : 0);
