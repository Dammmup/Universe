/**
 * Зоны клика по факторам убраны из отрисовки (visible={false}), но лучи их
 * по-прежнему находят. Проверка кликает по меткам настоящей мышью.
 * Запуск: node tests/factor-click-check.mjs
 */
import { chromium } from '@playwright/test';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1460,940'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('deprecated')) errors.push(t);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore), null, { timeout: 30000 });

/**
 * Находит на экране невидимую зону клика и возвращает её координаты:
 * сферу радиуса больше половины единицы, у которой есть обработчики R3F.
 */
const findHitSpot = () => page.evaluate(() => {
    const { scene, camera } = window.realityRenderer;
    const candidates = [];
    scene.traverse((o) => {
        if (!o.isMesh || o.visible) return;
        if (o.geometry?.type !== 'SphereGeometry') return;
        // Обработчик может висеть и на самой зоне, и на родительской группе
        let node = o;
        let clickable = false;
        while (node) { if (node.__r3f?.handlers?.onClick) { clickable = true; break; } node = node.parent; }
        if (!clickable) return;
        const p = o.getWorldPosition(new window.THREE_V3());
        const projected = p.clone().project(camera);
        if (projected.z > 1 || Math.abs(projected.x) > 0.85 || Math.abs(projected.y) > 0.7) return;
        candidates.push({
            x: (projected.x * 0.5 + 0.5) * window.innerWidth,
            y: (-projected.y * 0.5 + 0.5) * window.innerHeight,
        });
    });
    return candidates[0] ?? null;
});

// В сцене нужен конструктор Vector3 — отдаём его наружу один раз
await page.evaluate(() => {
    const mesh = window.realityRenderer.scene.children.find((c) => c.isMesh || c.children.length);
    window.THREE_V3 = mesh ? mesh.position.constructor : null;
});

const report = [];
for (const [stage, name] of [[7, 'клетка'], [6, 'разум']]) {
    await page.evaluate((s) => {
        const st = window.realityStore.getState();
        st.triggerBang();
        st.setStage(s);
    }, stage);
    await page.waitForTimeout(3800);
    await page.evaluate(() => window.realityStore.getState().clearFactor());

    const spot = await findHitSpot();
    if (!spot) { report.push({ name, clicked: false, reason: 'зона клика не найдена в кадре' }); continue; }

    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(700);
    const opened = await page.evaluate(() => window.realityStore.getState().activeFactorId);
    report.push({ name, clicked: Boolean(opened), factor: opened });
}

console.log(JSON.stringify({ report, errors }, null, 1));

const ok = report.length === 2 && report.every((r) => r.clicked) && errors.length === 0;
await browser.close();
process.exit(ok ? 0 : 1);
