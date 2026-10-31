/**
 * Текстуры планет: оба набора грузятся, весят столько, сколько обещано, и
 * старых путей в сети нет. Кадры: textures-full.png, textures-light.png.
 * Запуск (при запущенном npm run dev): node tests/texture-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = process.env.SCENE_URL ?? 'http://localhost:5173/';
const PLANET_STAGE = 2;
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });

/** Прогон одного набора: открываем планету и считаем, что ушло по сети. */
async function run(tier, query) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    const loaded = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', async (res) => {
        const url = new URL(res.url());
        if (!url.pathname.startsWith('/textures/')) return;
        const body = await res.body().catch(() => null);
        loaded.push({ path: url.pathname, status: res.status(), bytes: body ? body.length : 0 });
    });

    await page.goto(BASE + query, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.realityStore));
    await page.evaluate((stage) => {
        localStorage.setItem('reality:onboarded', '1');
        const s = window.realityStore.getState();
        s.triggerBang();
        s.setStage(stage);
    }, PLANET_STAGE);
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `tests/screenshots/textures-${tier}.png` });

    // Земля должна реально показывать карты, а не остаться шаром без текстур
    const drawn = await page.evaluate(() => {
        let maps = 0;
        window.realityRenderer.scene.traverse((o) => {
            const u = o.material?.uniforms;
            if (!u) return;
            ['uDayMap', 'uNightMap', 'uWaterMask', 'uBumpMap', 'uCloudMap'].forEach((k) => {
                if (u[k]?.value?.image?.width) maps += 1;
            });
        });
        return maps;
    });

    await page.close();
    const bytes = loaded.reduce((n, r) => n + r.bytes, 0);
    return { tier, maps: drawn, files: loaded.length, kb: Math.round(bytes / 1024), loaded, errors };
}

const full = await run('full', '?textures=full');
const light = await run('light', '?textures=light');
await browser.close();

const problems = [];
[full, light].forEach((r) => {
    if (r.errors.length) problems.push(`${r.tier}: ошибки — ${r.errors[0]}`);
    if (r.maps < 5) problems.push(`${r.tier}: Земля получила ${r.maps} карт вместо пяти`);
    if (r.loaded.some((f) => f.status !== 200)) problems.push(`${r.tier}: не всё отдалось`);
    if (r.loaded.some((f) => !f.path.endsWith('.webp'))) problems.push(`${r.tier}: грузится не webp`);
});
if (light.loaded.some((f) => !f.path.includes('/lo/'))) problems.push('лёгкий набор берёт полные карты');
if (full.loaded.some((f) => f.path.includes('/lo/'))) problems.push('полный набор берёт половинные карты');
// Ради этого всё и затевалось: лёгкий набор должен быть кратно легче
if (light.kb > full.kb / 2) problems.push(`лёгкий набор не легче: ${light.kb} КБ против ${full.kb} КБ`);

console.log(JSON.stringify({
    full: { maps: full.maps, files: full.files, kb: full.kb },
    light: { maps: light.maps, files: light.files, kb: light.kb },
    problems,
}, null, 1));
process.exit(problems.length ? 1 : 0);
