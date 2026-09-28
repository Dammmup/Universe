/**
 * Сохранение прогресса: перевёрнутые факторы и открытые миры переживают
 * перезагрузку, а «Пройти путь снова» их сбрасывает.
 * Запуск (при запущенном npm run dev): node tests/persist-check.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
await page.evaluate(() => {
    const s = window.realityStore.getState();
    ['war', 'inequality'].forEach((id) => { s.setActiveFactor(id); window.realityStore.getState().toggleReverse(); });
});
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
const restored = await page.evaluate(() => {
    const s = window.realityStore.getState();
    return { war: !!s.reversedFactors.war, noWars: !!s.discoveredScenarios.noWars };
});
await page.evaluate(() => window.realityStore.getState().resetJourney());
await page.waitForTimeout(600);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
const cleared = await page.evaluate(() => Object.keys(window.realityStore.getState().reversedFactors).length);
console.log(JSON.stringify({ restored, cleared }));
await browser.close();
process.exit(restored.war && restored.noWars && cleared === 0 ? 0 : 1);
