/**
 * Фигура и лицо крупным планом: анфас головы, три четверти, фигура спереди
 * и сбоку — на слое кожи и на слое мышц. Кадры: figure-*.png.
 * Запуск (при запущенном npm run dev): node tests/figure-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore && window.realityRenderer));
await page.evaluate(() => {
    localStorage.setItem('reality:onboarded', '1');
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(5);
});
// Ждём, пока фоновый поток достроит тело из поля расстояний
await page.waitForTimeout(6000);

const views = {
    'head-front': { pos: [0, 3.3, 2.2], target: [0, 3.25, 0] },
    'head-34': { pos: [1.5, 3.4, 1.7], target: [0, 3.25, 0] },
    'body-front': { pos: [0, 0.2, 9.5], target: [0, 0.1, 0] },
    'body-side': { pos: [9.5, 0.2, 0.5], target: [0, 0.1, 0] },
    'torso-34': { pos: [2.6, 2.0, 3.6], target: [0, 1.5, 0] },
};

for (const layer of [0, 1]) {
    await page.evaluate((l) => window.realityStore.getState().setBodyLayer(l), layer);
    await page.waitForTimeout(2800);
    for (const [name, v] of Object.entries(views)) {
        await page.evaluate(({ pos, target }) => {
            const { camera, controls } = window.realityRenderer;
            camera.position.set(...pos);
            if (controls) {
                controls.target.set(...target);
                controls.update();
            } else camera.lookAt(...target);
        }, v);
        await page.waitForTimeout(500);
        await page.screenshot({ path: `tests/screenshots/figure-${layer ? 'muscle' : 'skin'}-${name}.png` });
    }
}
console.log(JSON.stringify({ errors }));
await browser.close();
process.exit(errors.length ? 1 : 0);
