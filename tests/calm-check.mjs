/**
 * Спокойный режим: prefers-reduced-motion укорачивает переходы и убирает
 * разгон камеры, но путь по-прежнему проходится.
 * Запуск: node tests/calm-check.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1460,940'] });

const errors = [];

/** Один проход: взрыв и шаг на следующий слой, с замером времени перехода. */
async function run(reducedMotion) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${reducedMotion}: ${e.message}`));
    page.on('console', (m) => {
        const t = m.text();
        if (m.type() === 'error' && !t.includes('deprecated')) errors.push(`${reducedMotion}: ${t}`);
    });

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 30000 });

    const calm = await page.evaluate(() => window.realityStore.getState().calm);

    // Доходим до космоса, дальше меряем, сколько живёт вуаль одного перехода
    await page.evaluate(() => { const s = window.realityStore.getState(); s.triggerBang(); s.setStage(1); });
    await page.waitForTimeout(2500);

    const veilMs = await page.evaluate(() => new Promise((resolve) => {
        const store = window.realityStore;
        let started = 0;
        const stop = store.subscribe((s, prev) => {
            if (s.shift && !prev.shift) started = performance.now();
            if (!s.shift && prev.shift) { stop(); resolve(Math.round(performance.now() - started)); }
        });
        store.getState().nextStage();
        setTimeout(() => { stop(); resolve(-1); }, 20000);
    }));

    const stage = await page.evaluate(() => window.realityStore.getState().stage);
    await ctx.close();
    return { calm, veilMs, stage };
}

const normal = await run('no-preference');
const reduced = await run('reduce');

console.log(JSON.stringify({ normal, reduced, errors }, null, 1));

const ok = normal.calm === false
    && reduced.calm === true
    // Оба варианта довели путь до следующего слоя
    && normal.stage === reduced.stage
    && normal.stage > 1
    // Спокойный режим заметно короче обычного
    && reduced.veilMs > 0 && reduced.veilMs < normal.veilMs * 0.7
    && errors.length === 0;

await browser.close();
process.exit(ok ? 0 : 1);
