/**
 * Антропо-уровень: подуровни тела — от поверхности вглубь.
 *
 * Колесо листает их по порядку: кожа снимается сверху вниз и открывает мышцы,
 * мышцы — органы, органы — кости, кости — нервы. После нервов (или по клику
 * на мозг) путь уходит в «Разум» — сеть нейронов внутри головы.
 *
 * У каждого подуровня свои факторы и своя аномалия. Факторы не повторяются
 * ни между подуровнями, ни с «Разумом».
 *
 * Координаты — пространство фигуры из `lib/anatomy.js`: подошвы y ≈ -3.72,
 * макушка y ≈ 3.84, фигура смотрит на зрителя (+Z), правая сторона тела — −X.
 */

/** Общий план: фигура целиком в кадре. */
// Кадр опущен: постамент статуи должен выглядывать над нижней панелью
export const BODY_OVERVIEW = { pos: [0, -1.2, 14.6], look: [0, -1.3, 0], fov: 45 };

export const BODY_LAYERS = [
    {
        id: 'skin',
        title: 'Кожа',
        hint: 'Тело-скульптура. Кожа — граница: тепло, свет, касание, заживление.',
        accent: '#e2a488',
        factors: [
            { id: 'touch', label: 'ОСЯЗАНИЕ', reverse: 'ОНЕМЕНИЕ', color: '#b0567a', pos: [-1.65, -0.3, 0.4] },
            { id: 'thermoregulation', label: 'ТЕПЛО', reverse: 'ПЕРЕГРЕВ', color: '#d1731a', pos: [-1.55, 1.9, 0.5] },
            { id: 'uvShield', label: 'ЗАЩИТА ОТ СОЛНЦА', reverse: 'ОЖОГ', color: '#d9a21a', pos: [1.55, 2.45, 0.4] },
            { id: 'healing', label: 'ЗАЖИВЛЕНИЕ', reverse: 'РУБЦЫ', color: '#c2379b', pos: [1.7, 0.6, 0.4] },
            { id: 'elasticity', label: 'УПРУГОСТЬ', reverse: 'МОРЩИНЫ', color: '#7a5a9c', pos: [0.95, 3.4, 0.5] },
            { id: 'ichthyosis', label: 'ГЛАДКАЯ КОЖА', reverse: 'ИХТИОЗ', color: '#2a8a8a', pos: [1.25, -1.8, 0.4], anomaly: true },
        ],
    },
    {
        id: 'muscle',
        title: 'Мышцы',
        hint: 'Шестьсот мышц: сила, растяжение, выносливость.',
        accent: '#d8455a',
        factors: [
            { id: 'hypertrophy', label: 'РОСТ МЫШЦ', reverse: 'АТРОФИЯ', color: '#d61330', pos: [1.65, 1.75, 0.4] },
            { id: 'stretch', label: 'РАСТЯЖЕНИЕ', reverse: 'КОНТРАКТУРА', color: '#c26a1e', pos: [-1.3, -0.7, 0.45] },
            { id: 'cramp', label: 'РАССЛАБЛЕНИЕ', reverse: 'СУДОРОГА', color: '#6a4bc4', pos: [1.2, -2.2, 0.3] },
            { id: 'endurance', label: 'ВЫНОСЛИВОСТЬ', reverse: 'ИСТОЩЕНИЕ', color: '#a0491e', pos: [1.0, 1.1, 0.6] },
            { id: 'movement', label: 'ДВИЖЕНИЕ', reverse: 'ПАРАЛИЧ', color: '#3a4a63', pos: [-1.65, 0.45, 0.4] },
            { id: 'ossification', label: 'МЫШЕЧНАЯ ТКАНЬ', reverse: 'ОКОСТЕНЕНИЕ', color: '#8a7a5a', pos: [-1.55, 2.3, 0.3], anomaly: true },
        ],
    },
    {
        id: 'organs',
        title: 'Органы',
        hint: 'Насос, фильтры, топка и защита — внутренняя экономика тела.',
        accent: '#e0667a',
        factors: [
            { id: 'circulation', label: 'КРОВЬ', reverse: 'ИШЕМИЯ', color: '#d61330', pos: [1.45, 2.3, 0.5] },
            { id: 'breathing', label: 'ДЫХАНИЕ', reverse: 'ГИПОКСИЯ', color: '#1f97c9', pos: [-1.45, 2.3, 0.5] },
            { id: 'heartRhythm', label: 'РИТМ', reverse: 'АРИТМИЯ', color: '#b0244f', pos: [1.4, 1.7, 0.5] },
            { id: 'bloodPressure', label: 'ДАВЛЕНИЕ', reverse: 'ГИПЕРТОНИЯ', color: '#b0567a', pos: [-1.4, 1.7, 0.5] },
            { id: 'digestion', label: 'ОБМЕН', reverse: 'ТОКСИЧНОСТЬ', color: '#c08a1e', pos: [1.4, 1.1, 0.5] },
            { id: 'immunity', label: 'ИММУНИТЕТ', reverse: 'АУТОИММУННОСТЬ', color: '#5aa62a', pos: [-1.4, 1.1, 0.5] },
            { id: 'filtration', label: 'ФИЛЬТРАЦИЯ', reverse: 'ОТРАВЛЕНИЕ', color: '#8a5a2a', pos: [1.35, 0.5, 0.5] },
            { id: 'hormones', label: 'ГОРМОНЫ', reverse: 'СБОЙ', color: '#8a9c1e', pos: [-1.35, 0.5, 0.5] },
            { id: 'situs', label: 'РАСПОЛОЖЕНИЕ', reverse: 'ЗЕРКАЛЬНЫЕ ОРГАНЫ', color: '#4a63c9', pos: [0, -0.45, 0.8], anomaly: true },
        ],
    },
    {
        id: 'skeleton',
        title: 'Кости',
        hint: '206 костей: опора, суставы, кроветворение.',
        accent: '#d8cfb8',
        factors: [
            { id: 'skeleton', label: 'ОПОРА', reverse: 'ХРУПКОСТЬ', color: '#6b7280', pos: [1.3, -0.9, 0.4] },
            { id: 'teeth', label: 'ЗУБЫ', reverse: 'ВЫПАДЕНИЕ', color: '#9a8a6a', pos: [0.9, 3.0, 0.5] },
            { id: 'joints', label: 'СУСТАВЫ', reverse: 'АРТРИТ', color: '#d92d1c', pos: [-1.25, -1.6, 0.4] },
            { id: 'fracture', label: 'ЦЕЛОСТНОСТЬ', reverse: 'ПЕРЕЛОМ', color: '#c26a1e', pos: [1.25, -2.45, 0.4] },
            { id: 'marrow', label: 'КОСТНЫЙ МОЗГ', reverse: 'АНЕМИЯ', color: '#b0244f', pos: [-1.35, 0.25, 0.4] },
            { id: 'posture', label: 'ОСАНКА', reverse: 'ИСКРИВЛЕНИЕ', color: '#7a6a9c', pos: [-1.3, 1.75, 0.3] },
            { id: 'gigantism', label: 'РОСТ', reverse: 'ГИГАНТИЗМ', color: '#2a8a8a', pos: [-1.3, -2.85, 0.4], anomaly: true },
        ],
    },
    {
        id: 'nervous',
        title: 'Нервы',
        hint: 'Провода тела: сигнал бежит к мозгу быстрее мысли. Клик по мозгу — внутрь разума.',
        accent: '#5fd4ff',
        factors: [
            { id: 'nerve', label: 'ПРОВОДИМОСТЬ', reverse: 'БЛОК', color: '#3aa0c9', pos: [1.3, 1.4, 0.4] },
            { id: 'reflex', label: 'РЕФЛЕКС', reverse: 'ЗАТОРМОЖЕННОСТЬ', color: '#d92d1c', pos: [1.2, -1.6, 0.4] },
            { id: 'pain', label: 'БОЛЬ', reverse: 'АНЕСТЕЗИЯ', color: '#d94f16', pos: [-1.7, -0.2, 0.4] },
            { id: 'vision', label: 'ЗРЕНИЕ', reverse: 'СЛЕПОТА', color: '#1f7fc9', pos: [-0.95, 3.45, 0.5] },
            { id: 'hearing', label: 'СЛУХ', reverse: 'ТИШИНА', color: '#6a4bc4', pos: [1.0, 3.2, 0.3] },
            { id: 'balance', label: 'РАВНОВЕСИЕ', reverse: 'ПАДЕНИЕ', color: '#2a8a8a', pos: [-1.15, -2.9, 0.4] },
            { id: 'synesthesia', label: 'РАЗДЕЛЬНЫЕ ЧУВСТВА', reverse: 'СИНЕСТЕЗИЯ', color: '#c2379b', pos: [0, 4.4, 0.4], anomaly: true },
        ],
    },
];

export const BODY_LAYER_COUNT = BODY_LAYERS.length;
export const bodyLayerByIndex = (i) => BODY_LAYERS[Math.max(0, Math.min(BODY_LAYERS.length - 1, i))];
