/**
 * Полный проход по слоям настоящим скроллом: снимает кадр в середине каждой
 * вуали и кадр на самом слое, меряет FPS и собирает ошибки консоли.
 * Запуск: node tests/transition-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const OUT = 'tests/screenshots/transitions';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--window-size=1460,940'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => {
    const text = msg.text();
    if (msg.type() === 'error' && !text.includes('deprecated')) errors.push(text);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 20000 });

const wheel = (deltaY = 240) => page.evaluate((dy) => {
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, bubbles: true, cancelable: true }));
}, deltaY);

const state = () => page.evaluate(() => {
    const s = window.realityStore.getState();
    return { stage: s.stage, shift: s.shift ? s.shift.kind : null, approaching: s.approachingEarth };
});

const fps = () => page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
        frames += 1;
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
        else resolve(+(frames / ((performance.now() - start) / 1000)).toFixed(1));
    };
    requestAnimationFrame(tick);
}));

const report = [];

/** Ждёт, пока вуаль поднимется, и снимает кадр на её пике. */
async function step(name, action, { flashAt, settle }) {
    await action();
    await page.waitForTimeout(flashAt);
    const mid = await state();
    await page.screenshot({ path: `${OUT}/${name}-flash.png` });
    await page.waitForTimeout(settle);
    const done = await state();
    await page.screenshot({ path: `${OUT}/${name}-scene.png` });
    const rate = await fps();
    report.push({ name, flash: mid, settled: done, fps: rate });
}

await step('0-bang', () => wheel(), { flashAt: 3900, settle: 2600 });
await step('1-dive', () => wheel(), { flashAt: 3200, settle: 3200 });
await step('2-spin', () => wheel(), { flashAt: 1200, settle: 2600 });
await step('3-flesh', () => wheel(400), { flashAt: 1100, settle: 3000 });
await step('4-matter', () => page.evaluate(() => window.realityStore.getState().nextStage()), { flashAt: 1100, settle: 3200 });
await step('5-origin', () => wheel(), { flashAt: 1300, settle: 3600 });
await step('6-back', () => page.evaluate(() => window.realityStore.getState().prevStage()), { flashAt: 1100, settle: 3400 });

console.log(JSON.stringify({ report, errors }, null, 2));

const ok = report[0].settled.stage === 1
    && report[1].settled.stage === 2
    && report[2].settled.stage === 3
    && report[3].settled.stage === 4
    && report[4].settled.stage === 5
    && report[5].settled.stage === 6
    && report[6].settled.stage === 5
    && errors.length === 0;

await browser.close();
process.exit(ok ? 0 : 1);
