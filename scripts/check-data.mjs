/**
 * Целостность данных пути: каждый фактор, на который ссылаются сценарии,
 * локации, тело, разум, масштабы итога и эхо, описан в data/factors.js, и у
 * описания заполнены все тексты. Браузер не нужен — модули грузит Vite.
 *
 * Запуск: npm run check:data
 */
import { createServer } from 'vite';

const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
});
const load = (path) => vite.ssrLoadModule(path);

const problems = [];
try {
    const { FACTORS_DATA } = await load('/src/data/factors.js');
    const { SCENARIOS } = await load('/src/data/scenarios.js');
    const { NATURE_LOCATIONS, CITY_LOCATIONS } = await load('/src/data/locations.js');
    const { BODY_LAYERS } = await load('/src/data/bodyLayers.js');
    const { FACTOR_NEURONS } = await load('/src/data/mind.js');
    const { SCALES } = await load('/src/data/scales.js');
    const { LINKS } = await load('/src/data/consequences.js');

    const known = new Set(Object.keys(FACTORS_DATA));
    const need = (where, id) => {
        if (!known.has(id)) problems.push(`${where}: фактор «${id}» не описан в data/factors.js`);
    };

    SCENARIOS.forEach((s) => s.factors.forEach((id) => need(`сценарий ${s.id}`, id)));
    [...NATURE_LOCATIONS, ...CITY_LOCATIONS].forEach((l) => l.factors.forEach((id) => need(`локация ${l.id}`, id)));
    BODY_LAYERS.forEach((l) => l.factors.forEach((f) => need(`тело ${l.id}`, f.id)));
    FACTOR_NEURONS.forEach((f) => need('разум', f.id));
    SCALES.forEach((s) => s.factors.forEach((id) => need(`масштаб ${s.id}`, id)));
    LINKS.forEach((l) => { need('эхо (откуда)', l.from); need('эхо (куда)', l.to); });

    const TEXTS = ['name', 'reverseName', 'description', 'reverseDescription', 'influence'];
    Object.entries(FACTORS_DATA).forEach(([id, f]) => {
        TEXTS.forEach((key) => { if (!f[key]) problems.push(`фактор «${id}»: пустое поле ${key}`); });
    });

    const ids = new Set();
    SCENARIOS.forEach((s) => {
        if (ids.has(s.id)) problems.push(`сценарий ${s.id} объявлен дважды`);
        ids.add(s.id);
        if (s.factors.length < 2) problems.push(`сценарий ${s.id}: меньше двух факторов`);
    });

    console.log(`Факторов: ${known.size}, сценариев: ${SCENARIOS.length}, связей эха: ${LINKS.length}.`);
} finally {
    await vite.close();
}

if (problems.length) {
    console.error(`\nПроблемы в данных (${problems.length}):`);
    problems.forEach((p) => console.error(`  — ${p}`));
    process.exit(1);
}
console.log('Данные согласованы.');
