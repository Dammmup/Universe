/**
 * Телефон: новые части интерфейса — карты локаций, диорама, карточка
 * фактора, окно сценария, панели тела и разума, итог. Проверяет, что ничего
 * не вылезает за экран по горизонтали, и снимает кадры.
 * Запуск (при запущенном npm run dev): node tests/mobile-ui-check.mjs
 */
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const OUT = 'tests/screenshots/mobile';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const ctx = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 30000 });
await page.evaluate(() => localStorage.setItem('reality:onboarded', '1'));

const overflow = [];
/** Элементы интерфейса, вылезающие за ширину экрана. */
const checkOverflow = async (name) => {
    const bad = await page.evaluate(() => {
        const w = window.innerWidth;
        return [...document.querySelectorAll('button, p, h2, h3, span')]
            .filter((el) => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.right > w + 1 || r.left < -1);
            })
            .slice(0, 5)
            .map((el) => el.textContent.trim().slice(0, 30));
    });
    if (bad.length) overflow.push({ name, bad });
};

const shot = async (name, setup, wait = 3000) => {
    await page.evaluate(setup);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: `${OUT}/ui-${name}.png` });
    await checkOverflow(name);
};

await shot('nature-map', () => { const s = window.realityStore.getState(); s.triggerBang(); s.setStage(3); }, 3500);
await shot('desert', () => window.realityStore.getState().enterLocation('desert'), 4500);
await shot('factor', () => window.realityStore.getState().setActiveFactor('oasis'), 1200);
await shot('scenario', () => {
    const s = window.realityStore.getState();
    s.setActiveFactor('ocean'); s.toggleReverse();
    s.setActiveFactor('desalination'); s.toggleReverse();
}, 1500);
await shot('human', () => {
    const s = window.realityStore.getState();
    while (window.realityStore.getState().scenarioQueue.length) s.dismissScenario();
    s.clearFactor();
    s.setStage(5);
}, 3500);
await shot('mind', () => window.realityStore.getState().setStage(6), 3500);
await shot('mind-factor', () => { const s = window.realityStore.getState(); s.setMindFocus('anger'); s.setActiveFactor('anger'); }, 2000);
await shot('finale', () => { const s = window.realityStore.getState(); s.clearFactor(); s.setStage(8); }, 3000);

console.log(JSON.stringify({ overflow, errors }, null, 2));
await browser.close();
process.exit(errors.length || overflow.length ? 1 : 0);
