/**
 * Телефон: свайп ведёт по пути, кадр не обрезает сцену, оверлеи влезают.
 * Запуск: node tests/mobile-check.mjs
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const OUT = 'tests/screenshots/mobile';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && !text.includes('deprecated')) errors.push(text);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 30000 });
await page.evaluate(() => { try { localStorage.removeItem('reality:onboarded'); } catch { /* приватный режим */ } });

/** Свайп вверх = шаг вглубь пути, вниз = назад. */
const swipe = async (up = true) => {
    const from = up ? 560 : 260;
    const to = up ? 220 : 560;
    await page.touchscreen.tap(195, 400);
    await page.evaluate(({ a, b }) => {
        const touch = (type, y) => window.dispatchEvent(new TouchEvent(type, {
            bubbles: true,
            touches: type === 'touchend' ? [] : [new Touch({ identifier: 1, target: document.body, clientX: 195, clientY: y })],
            changedTouches: [new Touch({ identifier: 1, target: document.body, clientX: 195, clientY: y })],
        }));
        touch('touchstart', a);
        touch('touchmove', (a + b) / 2);
        touch('touchmove', b);
        touch('touchend', b);
    }, { a: from, b: to });
};

const stage = () => page.evaluate(() => window.realityStore.getState().stage);
const report = [];

// Первый шаг: свайп вверх на сингулярности запускает взрыв
await swipe(true);
await page.waitForTimeout(7000);
report.push({ step: 'bang', stage: await stage() });
await page.screenshot({ path: `${OUT}/1-cosmos.png` });

for (const [name, wait] of [['nature', 9000], ['society', 3500], ['human', 5000], ['cell', 5000]]) {
    await swipe(true);
    await page.waitForTimeout(wait);
    report.push({ step: name, stage: await stage() });
    await page.screenshot({ path: `${OUT}/${name}.png` });
}

// Назад тем же жестом
await swipe(false);
await page.waitForTimeout(5000);
report.push({ step: 'back', stage: await stage() });

const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
        frames += 1;
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
        else resolve(+(frames / ((performance.now() - start) / 1000)).toFixed(1));
    };
    requestAnimationFrame(tick);
}));

console.log(JSON.stringify({ report, fps, errors }, null, 1));

const ok = report[0].stage === 1
    && report[1].stage === 2
    && report[2].stage === 3
    && report[3].stage === 4
    && report[4].stage === 5
    && report[5].stage === 4
    && errors.length === 0;

await browser.close();
process.exit(ok ? 0 : 1);
