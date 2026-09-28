/**
 * Антропо-уровень крупным планом: грудь, ноги, живот. Проверка калибровки
 * анатомии — стороны органов, стопы, кисти, скелет.
 * Запуск (при запущенном npm run dev): node tests/body-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const HUMAN_STAGE = 5;
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
await page.evaluate((stage) => {
    localStorage.setItem('reality:onboarded', '1');
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(stage);
}, HUMAN_STAGE);
await page.waitForTimeout(3000);

for (const region of ['chest', 'legs', 'abdomen']) {
    await page.evaluate((r) => window.realityStore.getState().setBodyRegion(r), region);
    await page.waitForTimeout(2600);
    await page.screenshot({ path: `tests/screenshots/body-${region}.png` });
}

console.log(JSON.stringify({ errors }));
await browser.close();
process.exit(errors.length ? 1 : 0);
