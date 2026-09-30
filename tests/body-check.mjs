/**
 * Антропо-уровень: пять подуровней тела — каждый до и после реверса всех
 * его факторов. Кадры: body-<слой>-a.png / -b.png.
 * Запуск (при запущенном npm run dev): node tests/body-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const HUMAN_STAGE = 5;
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('deprecated')) errors.push(msg.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore));
await page.evaluate((stage) => {
    localStorage.setItem('reality:onboarded', '1');
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(stage);
}, HUMAN_STAGE);
await page.waitForTimeout(3500);

const fps = () => page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => {
        n += 1;
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick);
        else resolve(Math.round(n / 1.2));
    };
    requestAnimationFrame(tick);
}));

const layers = await page.evaluate(async () => {
    const mod = await import('/src/data/bodyLayers.js');
    return mod.BODY_LAYERS.map((l) => ({ id: l.id, factors: l.factors.map((f) => f.id) }));
});

const report = [];
for (let i = 0; i < layers.length; i += 1) {
    const layer = layers[i];
    // Колесо листает подуровни: проверяем именно шаг пути, а не прямую установку
    if (i > 0) await page.evaluate(() => window.realityStore.getState().nextStage());
    await page.waitForTimeout(2600);
    const state = await page.evaluate(() => {
        const s = window.realityStore.getState();
        return { stage: s.stage, bodyLayer: s.bodyLayer };
    });
    await page.screenshot({ path: `tests/screenshots/body-${layer.id}-a.png` });
    await page.evaluate((ids) => {
        ids.forEach((id) => {
            const s = window.realityStore.getState();
            s.setActiveFactor(id);
            s.toggleReverse();
        });
        const s = window.realityStore.getState();
        s.clearFactor();
        while (window.realityStore.getState().scenarioQueue.length) s.dismissScenario();
    }, layer.factors);
    await page.waitForTimeout(3200);
    await page.screenshot({ path: `tests/screenshots/body-${layer.id}-b.png` });
    report.push({ layer: layer.id, ...state, fps: await fps() });
    await page.evaluate(() => window.realityStore.setState({ reversedFactors: {} }));
}

// После нервов колесо уводит в разум
await page.evaluate(() => window.realityStore.getState().nextStage());
await page.waitForTimeout(3500);
const after = await page.evaluate(() => window.realityStore.getState().stage);

console.log(JSON.stringify({ report, after, errors }, null, 2));
await browser.close();
const ok = report.every((r, i) => r.bodyLayer === i && r.stage === HUMAN_STAGE) && after === HUMAN_STAGE + 1 && !errors.length;
process.exit(ok ? 0 : 1);
