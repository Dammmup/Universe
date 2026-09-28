/**
 * Слой «Планета»: процессы всей Земли до и после реверса.
 * Запуск (при запущенном npm run dev): node tests/planet-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('deprecated')) errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 20000 });
await page.evaluate(() => localStorage.setItem('reality:onboarded', '1'));

const fps = () => page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
        n += 1;
        if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
        else resolve(Math.round(n / 1.5));
    };
    requestAnimationFrame(tick);
}));

const FACTORS = ['tectonics', 'currents', 'waterCycle', 'pressure', 'emissions', 'ozone', 'aurora', 'atmosphere'];

await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(2);
});
await page.waitForTimeout(4500);
const normal = await fps();
await page.screenshot({ path: 'tests/screenshots/planet-a.png' });

await page.evaluate((ids) => {
    ids.forEach((id) => {
        const s = window.realityStore.getState();
        s.setActiveFactor(id);
        s.toggleReverse();
    });
    const s = window.realityStore.getState();
    s.clearFactor();
    while (window.realityStore.getState().scenarioQueue.length) s.dismissScenario();
}, FACTORS);
await page.waitForTimeout(4500);
const reversed = await fps();
await page.screenshot({ path: 'tests/screenshots/planet-b.png' });

const found = await page.evaluate(() => Object.keys(window.realityStore.getState().discoveredScenarios));
console.log(JSON.stringify({ normal, reversed, found, errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
