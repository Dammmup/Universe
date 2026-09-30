/**
 * Итог пути: факторы перевёрнуты на нескольких масштабах, сложились миры —
 * финал должен показать портрет мира, масштабы и миры.
 * Запуск (при запущенном npm run dev): node tests/finale-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const FINALE_STAGE = 8;
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
await page.evaluate((stage) => {
    localStorage.setItem('reality:onboarded', '1');
    const s = window.realityStore.getState();
    s.triggerBang();
    ['photosynthesis', 'sandstorm', 'war', 'inequality', 'tectonics', 'volcano', 'hypertrophy', 'anger', 'mutation', 'galaxy'].forEach((id) => {
        const st = window.realityStore.getState();
        st.setActiveFactor(id);
        st.toggleReverse();
    });
    const st = window.realityStore.getState();
    st.clearFactor();
    while (window.realityStore.getState().scenarioQueue.length) st.dismissScenario();
    st.setStage(stage);
}, FINALE_STAGE);
await page.waitForTimeout(3500);
await page.screenshot({ path: 'tests/screenshots/finale-summary.png' });
const text = await page.locator('text=ваш мир').count();

console.log(JSON.stringify({ summary: text, errors }, null, 2));
await browser.close();
process.exit(errors.length || !text ? 1 : 0);
