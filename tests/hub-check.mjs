/**
 * Карта мезо-уровней и сценарии: точки локаций на глобусе, клик по точке,
 * возврат колесом, карточка фактора и окно сложившегося мира.
 * Запуск (при запущенном npm run dev): node tests/hub-check.mjs
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
const state = () => page.evaluate(() => {
    const s = window.realityStore.getState();
    return { stage: s.stage, location: s.location, queue: s.scenarioQueue, shift: !!s.shift };
});

await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(3);
});
await page.waitForTimeout(3000);
await page.screenshot({ path: 'tests/screenshots/hub-nature.png' });

// Чип локации внизу ныряет в диораму
await page.getByRole('button', { name: 'Пустыня' }).click();
// Первый вход компилирует чанк диорам — ждём состояние, а не фиксированное время
await page.waitForFunction(() => {
    const s = window.realityStore.getState();
    return s.location === 'desert' && !s.shift;
}, null, { timeout: 30000 });
await page.waitForTimeout(800);
const inDesert = await state();

// Колесо назад — обратно на карту, а не в космос
await page.mouse.move(720, 300);
await page.mouse.wheel(0, -200);
await page.waitForTimeout(3500);
const backOnMap = await state();

// Вперёд из карты природы — к городам
await page.mouse.wheel(0, 200);
await page.waitForTimeout(3200);
await page.screenshot({ path: 'tests/screenshots/hub-society.png' });
const society = await state();

await page.getByRole('button', { name: 'Мумбаи' }).click();
await page.waitForTimeout(3500);
await page.evaluate(() => window.realityStore.getState().setActiveFactor('inequality'));
await page.waitForTimeout(600);
await page.screenshot({ path: 'tests/screenshots/hub-factor-modal.png' });
await page.getByRole('button', { name: /Переключить/ }).click();
await page.waitForTimeout(400);

// «Война» живёт на карте общества: переворачиваем её — должен сложиться «Мир без войн»
await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.clearFactor();
    s.setActiveFactor('war');
    s.toggleReverse();
});
await page.waitForTimeout(1200);
const scen = await state();
await page.screenshot({ path: 'tests/screenshots/hub-scenario.png' });

console.log(JSON.stringify({ inDesert, backOnMap, society, scen, errors }, null, 2));
await browser.close();
const ok = inDesert.location === 'desert' && backOnMap.location === null && backOnMap.stage === 3
    && society.stage === 4 && scen.queue.includes('noWars') && !errors.length;
process.exit(ok ? 0 : 1);
