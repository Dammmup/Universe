/**
 * Путь проходится с клавиатуры: стрелки и пробел ведут вперёд и назад.
 * Запуск: node tests/keyboard-check.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1460,940'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && !text.includes('deprecated')) errors.push(text);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 30000 });

const stage = () => page.evaluate(() => window.realityStore.getState().stage);
const report = [];

// Взрыв запускается с клавиатуры, дальше идём стрелкой и пробелом
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(7000);
report.push({ key: 'ArrowDown', stage: await stage() });

await page.keyboard.press('Space');
await page.waitForTimeout(9000);
report.push({ key: 'Space', stage: await stage() });

await page.keyboard.press('PageDown');
await page.waitForTimeout(4000);
report.push({ key: 'PageDown', stage: await stage() });

await page.keyboard.press('ArrowUp');
await page.waitForTimeout(4500);
report.push({ key: 'ArrowUp', stage: await stage() });

// Зажатая клавиша не должна проматывать путь насквозь
const before = await stage();
await page.keyboard.down('ArrowDown');
await page.waitForTimeout(1200);
await page.keyboard.up('ArrowDown');
await page.waitForTimeout(6000);
const afterHold = await stage();

console.log(JSON.stringify({ report, before, afterHold, errors }, null, 1));

const ok = report[0].stage === 1
    && report[1].stage === 2
    && report[2].stage === 3
    && report[3].stage === 2
    && afterHold === before + 1
    && errors.length === 0;

await browser.close();
process.exit(ok ? 0 : 1);
