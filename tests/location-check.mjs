/**
 * Локации мезо-уровней: карта → каждая диорама → реверс всех её факторов.
 * Проверяет, что сцены монтируются без ошибок, держат FPS, и что
 * комбинации факторов открывают сценарии мира.
 * Запуск (при запущенном npm run dev): node tests/location-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
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

const fps = () => page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const start = performance.now();
    const tick = () => {
        frames += 1;
        if (performance.now() - start < 1500) requestAnimationFrame(tick);
        else resolve(Math.round((frames * 1000) / (performance.now() - start)));
    };
    requestAnimationFrame(tick);
}));

const locations = await page.evaluate(async () => {
    const mod = await import('/src/data/locations.js');
    return mod.ALL_LOCATIONS.map((l) => ({ id: l.id, stage: mod.stageOfLocation(l.id), factors: l.factors }));
});

const report = [];
for (const loc of locations) {
    if (ONLY && !ONLY.includes(loc.id)) continue;
    await page.evaluate((stage) => {
        const s = window.realityStore.getState();
        s.triggerBang();
        s.setStage(stage);
    }, loc.stage);
    await page.waitForTimeout(700);
    await page.evaluate((id) => window.realityStore.getState().enterLocation(id), loc.id);
    await page.waitForTimeout(3600);
    const before = await fps();
    await page.screenshot({ path: `tests/screenshots/loc-${loc.id}-a.png` });

    for (const f of loc.factors) {
        await page.evaluate((id) => {
            const s = window.realityStore.getState();
            s.setActiveFactor(id);
            s.toggleReverse();
            s.clearFactor();
        }, f);
    }
    await page.waitForTimeout(4200);
    const after = await fps();
    await page.screenshot({ path: `tests/screenshots/loc-${loc.id}-b.png` });
    report.push({ id: loc.id, fpsNormal: before, fpsReversed: after });

    await page.evaluate(() => {
        const s = window.realityStore.getState();
        while (window.realityStore.getState().scenarioQueue.length) s.dismissScenario();
        window.realityStore.setState({ reversedFactors: {}, location: null });
    });
}

const scenarios = await page.evaluate(() => Object.keys(window.realityStore.getState().discoveredScenarios));
console.log(JSON.stringify({ report, scenarios, errors: [...new Set(errors)].slice(0, 20) }, null, 2));
await browser.close();
process.exit(errors.length ? 1 : 0);
