/**
 * Низкое качество (?quality=low): без теней, с пониженным разрешением —
 * все ключевые сцены открываются без ошибок.
 * Запуск (при запущенном npm run dev): node tests/quality-check.mjs
 */
import { chromium } from '@playwright/test';

const URL = (process.env.SCENE_URL ?? 'http://localhost:5173/') + '?quality=low';
const browser = await chromium.launch({ channel: 'chrome', headless: false });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore && window.realityRenderer));
const report = [];
for (const [stage, location] of [[1, null], [2, null], [3, 'jungle'], [4, 'tokyo'], [5, null], [6, null]]) {
    await page.evaluate(({ stage, location }) => {
        const s = window.realityStore.getState();
        s.triggerBang();
        s.setStage(stage);
        if (location) s.enterLocation(location);
    }, { stage, location });
    await page.waitForTimeout(3500);
    report.push(await page.evaluate(() => ({
        stage: window.realityStore.getState().stage,
        shadows: window.realityRenderer.gl.shadowMap.enabled,
        dpr: window.realityRenderer.gl.getPixelRatio(),
    })));
}
console.log(JSON.stringify({ report, errors }, null, 1));
await browser.close();
process.exit(errors.length || report.some((r) => r.shadows) ? 1 : 0);
