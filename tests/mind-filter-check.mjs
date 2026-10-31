/**
 * Фильтр систем разума и музыка нейронов.
 *
 * Проверяет, что в кадре подписана одна система за раз, «Эмоция» не стоит
 * рядом со своими же частями, а музыка без файлов не ломает слой: эмбиент
 * возвращается к полной громкости, ошибок в консоли нет. Кадры: mind-sys-*.png
 * Запуск (при запущенном npm run dev): node tests/mind-filter-check.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const URL = process.env.SCENE_URL ?? 'http://localhost:5173/';
const MIND_STAGE = 6;
mkdirSync('tests/screenshots', { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1440,900'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => {
    const t = msg.text();
    if (msg.type() === 'error' && !t.includes('deprecated') && !t.includes('audio/mind')) errors.push(t);
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.realityStore && window.realityRenderer));
await page.evaluate((stage) => {
    localStorage.setItem('reality:onboarded', '1');
    const s = window.realityStore.getState();
    s.triggerBang();
    s.setStage(stage);
}, MIND_STAGE);
await page.waitForTimeout(3200);

/** Подписи нейронов в кадре: troika-текст лежит в сцене как Mesh с .text. */
const labels = () => page.evaluate(() => {
    const out = [];
    window.realityRenderer.scene.traverse((o) => {
        if (typeof o.text === 'string' && o.text && o.visible) out.push(o.text);
    });
    return out.sort();
});

const report = {};
const systems = ['cognition', 'feeling', 'will', 'state'];
for (const id of systems) {
     
    await page.evaluate((sys) => window.realityStore.getState().setMindSystem(sys), id);
     
    await page.waitForTimeout(900);
     
    report[id] = await labels();
     
    await page.screenshot({ path: `tests/screenshots/mind-sys-${id}.png` });
}

const problems = [];
Object.entries(report).forEach(([id, list]) => {
    if (list.length > 8) problems.push(`${id}: ${list.length} подписей разом — снова куча`);
    if (!list.includes('ИДЕНТИЧНОСТЬ')) problems.push(`${id}: «Я» пропало из центра`);
    if (list.includes('ЭМОЦИЯ')) problems.push(`${id}: «Эмоция» стоит нейроном рядом со своими частями`);
});
if (report.cognition && report.cognition.includes('ГНЕВ')) problems.push('познание: чувства затесались в познание');
if (report.feeling && !report.feeling.includes('ГНЕВ')) problems.push('чувства: гнева нет в чувствах');
if (report.feeling && report.feeling.includes('ПАМЯТЬ')) problems.push('чувства: познание затесалось в чувства');

// Чип системы ставит сеть в её общий режим — и нейрон фокуса следует за ним
await page.evaluate(() => window.realityStore.getState().setMindFocus('sadness'));
await page.waitForTimeout(1400);
const afterFocus = await page.evaluate(() => ({
    system: window.realityStore.getState().mindSystem,
    music: window.realityMusic.state.playing,
    duck: window.realitySound.duck,
}));
if (afterFocus.system !== 'feeling') problems.push('фокус из другой системы не переключил фильтр');
// Файлов нет — музыка обязана тихо сдаться и вернуть эмбиент
if (afterFocus.music) problems.push('музыка считает, что играет несуществующий файл');
if (afterFocus.duck !== 1) problems.push(`эмбиент остался приседать: duck=${afterFocus.duck}`);

console.log(JSON.stringify({ report, afterFocus, problems, errors }, null, 2));
await browser.close();
process.exit(problems.length || errors.length ? 1 : 0);
