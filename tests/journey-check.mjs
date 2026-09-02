/**
 * Киношный пролёт: космос → наезд на Землю → природа → сдвиг к городу.
 * Запуск: node tests/journey-check.mjs
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
    if (msg.type() === 'error' && !msg.text().includes('deprecated')) errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 20000 });

await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(1);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'tests/screenshots/journey-1-cosmos.png' });

await page.evaluate(() => window.realityStore.getState().nextStage());
await page.waitForTimeout(1100);
const mid = await page.evaluate(() => ({
    stage: window.realityStore.getState().stage,
    approaching: window.realityStore.getState().approachingEarth,
}));
await page.screenshot({ path: 'tests/screenshots/journey-2-approach.png' });

await page.waitForTimeout(4200);
const nature = await page.evaluate(() => ({
    stage: window.realityStore.getState().stage,
    approaching: window.realityStore.getState().approachingEarth,
}));
await page.screenshot({ path: 'tests/screenshots/journey-3-nature.png' });

await page.evaluate(() => window.realityStore.getState().nextStage());
await page.waitForTimeout(2600);
const city = await page.evaluate(() => window.realityStore.getState().stage);
await page.screenshot({ path: 'tests/screenshots/journey-4-city.png' });

console.log(JSON.stringify({ mid, nature, city, errors }, null, 2));
await browser.close();
process.exit(errors.length || city !== 3 || nature.approaching ? 1 : 0);
