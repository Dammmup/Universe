/**
 * Звук: после жеста контекст запущен, профиль меняется вместе со слоем и
 * локацией, эффекты не роняют страницу.
 * Запуск (при запущенном npm run dev): node tests/sound-check.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore && window.realitySound));
await page.mouse.click(600, 400);
await page.waitForTimeout(500);

const profiles = [];
for (const [stage, location] of [[1, null], [3, 'jungle'], [4, 'tokyo'], [5, null], [6, null], [7, null]]) {
    await page.evaluate(({ stage, location }) => {
        const s = window.realityStore.getState();
        s.triggerBang();
        s.setStage(stage);
        if (location) window.realityStore.setState({ location });
    }, { stage, location });
    await page.waitForTimeout(700);
    profiles.push(await page.evaluate(() => window.realitySound.profileKey));
}
await page.evaluate(() => {
    const s = window.realityStore.getState();
    s.setActiveFactor('anger');
    s.toggleReverse();
    window.realitySound.whoosh();
    window.realitySound.scenario('doom');
    window.realitySound.echo();
});
await page.waitForTimeout(800);
const state = await page.evaluate(() => window.realitySound.ctx?.state);
console.log(JSON.stringify({ state, profiles, errors }, null, 2));
await browser.close();
const ok = state === 'running' && profiles.join() === 'cosmos,jungle,city,body,mind,cell' && !errors.length;
process.exit(ok ? 0 : 1);
