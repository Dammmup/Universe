/**
 * Скриншоты микрослоя и слоя человека.
 * Запуск: node tests/life-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({
    channel: 'chrome',
    headless: false,
    args: ['--window-size=1440,900'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push(err.message));
page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 20000 });

const shot = async (stage, name, extra) => {
    await page.evaluate((s) => {
        const st = window.realityStore.getState();
        st.triggerBang();
        st.setStage(s);
    }, stage);
    if (extra) await page.evaluate(extra);
    await page.waitForTimeout(2800);
    const fps = await page.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const t0 = performance.now();
        const tick = () => {
            n += 1;
            if (performance.now() - t0 < 1500) requestAnimationFrame(tick);
            else resolve(Math.round(n / 1.5));
        };
        requestAnimationFrame(tick);
    }));
    await page.screenshot({ path: `tests/screenshots/${name}.png` });
    return fps;
};

const micro = await shot(4, '4-micro-new');
const organs = await shot(5, '5-human-organs');
const emotions = await shot(5, '5-human-emotions', () => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Эмоции'));
    btn?.click();
});

console.log(JSON.stringify({ micro, organs, emotions, errors }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
