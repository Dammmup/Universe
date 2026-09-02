/**
 * Проверка, что инерция колеса не перепрыгивает слой цивилизации (stage 3).
 * Запуск: node tests/scroll-stages.mjs
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
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 20000 });

const burstWheel = async () => {
    await page.evaluate(() => {
        for (let i = 0; i < 12; i++) {
            window.dispatchEvent(new WheelEvent('wheel', {
                deltaY: 140,
                bubbles: true,
                cancelable: true,
            }));
        }
    });
};

await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(2);
});
await page.waitForTimeout(800);

const before = await page.evaluate(() => window.realityStore.getState().stage);
await burstWheel();
await page.waitForTimeout(2300);
const afterBurst = await page.evaluate(() => window.realityStore.getState().stage);
await page.screenshot({ path: 'tests/screenshots/after-burst-from-2.png' });

await page.waitForTimeout(2600);
await burstWheel();
await page.waitForTimeout(200);
const afterSecond = await page.evaluate(() => window.realityStore.getState().stage);
await page.screenshot({ path: 'tests/screenshots/after-second-burst.png' });

await page.evaluate(() => window.realityStore.getState().setStage(3));
await page.waitForTimeout(2500);
const overlay = await page.locator('text=Общество').count();
await page.screenshot({ path: 'tests/screenshots/stage-3-civilisation.png' });

console.log(JSON.stringify({ before, afterBurst, afterSecond, overlay }, null, 2));

const ok = before === 2 && afterBurst === 3 && afterSecond === 4 && overlay > 0;
await browser.close();
process.exit(ok ? 0 : 1);
