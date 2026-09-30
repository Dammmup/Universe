/**
 * «Разум»: сеть нейронов в покое и в режимах гнева, концентрации и
 * расщеплённого «я». Кадры: mind-*.png.
 * Запуск (при запущенном npm run dev): node tests/mind-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const MIND_STAGE = 6;
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('deprecated')) errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
await page.evaluate((stage) => {
    localStorage.setItem('reality:onboarded', '1');
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(stage);
}, MIND_STAGE);
await page.waitForTimeout(3500);

const fps = () => page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
        n += 1;
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
        else resolve(Math.round(n / 1.2));
    };
    requestAnimationFrame(tick);
}));

const report = { idle: await fps() };
await page.screenshot({ path: 'tests/screenshots/mind-idle.png' });

const focus = async (id, reverse = false) => {
    await page.evaluate(({ id, reverse }) => {
        const s = window.realityStore.getState();
        s.setMindFocus(id);
        s.setActiveFactor(id);
        if (reverse) s.toggleReverse();
        s.clearFactor();
        while (window.realityStore.getState().scenarioQueue.length) s.dismissScenario();
    }, { id, reverse });
    await page.waitForTimeout(2600);
    report[`${id}${reverse ? '-rev' : ''}`] = await fps();
    await page.screenshot({ path: `tests/screenshots/mind-${id}${reverse ? '-rev' : ''}.png` });
};

await focus('anger');
await focus('attention');
await focus('identity', true);
await focus('joy');

console.log(JSON.stringify({ report, errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
