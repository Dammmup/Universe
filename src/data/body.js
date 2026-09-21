/**
 * Карта тела: области, их зоны наведения, кадр камеры и набор факторов.
 *
 * Раньше на всё тело приходилось по одному фактору на орган, и они висели
 * плоским кольцом вокруг фигуры. Здесь тело разбито на области: пока камера
 * держит фигуру целиком, видны только названия областей; при выборе области
 * камера подъезжает к ней, и раскрываются её собственные факторы.
 *
 * Координаты — в пространстве фигуры из `lib/anatomy.js`: стопы на y ≈ -3.7,
 * макушка на y ≈ 3.74.
 */

/** Общий план: фигура целиком в кадре. */
export const BODY_OVERVIEW = { pos: [0, -0.1, 12.8], look: [0, -0.35, 0], fov: 45 };

export const BODY_REGIONS = [
    {
        id: 'head',
        title: 'Голова',
        // Зоны наведения — невидимые примитивы: по самой оболочке тела
        // нельзя отличить грудь от живота, это одна непрерывная поверхность
        hotspots: [{ shape: 'sphere', pos: [0, 3.25, 0], radius: 0.62 }],
        shot: { pos: [0, 3.55, 4.3], look: [0, 3.15, 0], fov: 44 },
        labelAt: [0, 4.2, 0.3],
        factors: [
            { id: 'memory', label: 'ПАМЯТЬ', reverse: 'АМНЕЗИЯ', color: '#c2379b', pos: [-1.08, 3.75, 0.5] },
            { id: 'vision', label: 'ЗРЕНИЕ', reverse: 'СЛЕПОТА', color: '#1f7fc9', pos: [1.08, 3.72, 0.5] },
            { id: 'hearing', label: 'СЛУХ', reverse: 'ТИШИНА', color: '#6a4bc4', pos: [1.20, 3.05, 0.4] },
            { id: 'speech', label: 'РЕЧЬ', reverse: 'НЕМОТА', color: '#c26a1e', pos: [-1.20, 3.02, 0.4] },
            { id: 'sleep', label: 'СОН', reverse: 'БЕССОННИЦА', color: '#4a63c9', pos: [0.00, 4.5, 0.35] },
        ],
    },
    {
        id: 'chest',
        title: 'Грудь',
        hotspots: [{ shape: 'sphere', pos: [0, 2.0, 0], radius: 0.8 }],
        shot: { pos: [0.6, 2.3, 5.2], look: [0, 1.95, 0], fov: 46 },
        labelAt: [1.85, 2.3, 0.2],
        factors: [
            { id: 'circulation', label: 'КРОВЬ', reverse: 'ИШЕМИЯ', color: '#d61330', pos: [1.28, 2.35, 0.5] },
            { id: 'breathing', label: 'ДЫХАНИЕ', reverse: 'ГИПОКСИЯ', color: '#1f97c9', pos: [-1.28, 2.35, 0.5] },
            { id: 'heartRhythm', label: 'РИТМ', reverse: 'АРИТМИЯ', color: '#b0244f', pos: [1.24, 1.55, 0.55] },
            { id: 'emotion', label: 'ЭМОЦИЯ', reverse: 'ОНЕМЕНИЕ', color: '#d59a10', pos: [-1.24, 1.55, 0.55] },
        ],
    },
    {
        id: 'abdomen',
        title: 'Живот',
        hotspots: [{ shape: 'sphere', pos: [0, 0.85, 0], radius: 0.78 }],
        shot: { pos: [-0.6, 1.15, 5.2], look: [0, 0.85, 0], fov: 46 },
        labelAt: [1.85, 0.75, 0.2],
        factors: [
            { id: 'digestion', label: 'ОБМЕН', reverse: 'ТОКСИЧНОСТЬ', color: '#c08a1e', pos: [1.28, 1.15, 0.5] },
            { id: 'immunity', label: 'ИММУНИТЕТ', reverse: 'АУТОИММУННОСТЬ', color: '#5aa62a', pos: [-1.28, 1.15, 0.5] },
            { id: 'filtration', label: 'ФИЛЬТРАЦИЯ', reverse: 'ОТРАВЛЕНИЕ', color: '#8a5a2a', pos: [1.24, 0.35, 0.5] },
            { id: 'hormones', label: 'ГОРМОНЫ', reverse: 'СБОЙ', color: '#8a9c1e', pos: [-1.24, 0.35, 0.5] },
        ],
    },
    {
        id: 'arms',
        title: 'Руки',
        hotspots: [
            { shape: 'capsule', pos: [1.03, 1.15, 0.02], radius: 0.3, height: 2.1, tilt: 0.1 },
            { shape: 'capsule', pos: [-1.03, 1.15, 0.02], radius: 0.3, height: 2.1, tilt: -0.1 },
        ],
        shot: { pos: [1.9, 1.5, 5.4], look: [0.25, 1.1, 0], fov: 48 },
        labelAt: [-2.35, 1.1, 0.2],
        factors: [
            { id: 'movement', label: 'ДВИЖЕНИЕ', reverse: 'ПАРАЛИЧ', color: '#3a4a63', pos: [1.64, 1.85, 0.45] },
            { id: 'grip', label: 'ХВАТ', reverse: 'БЕССИЛИЕ', color: '#7a5a3a', pos: [1.64, 0.3, 0.45] },
            { id: 'touch', label: 'ОСЯЗАНИЕ', reverse: 'ОНЕМЕНИЕ', color: '#b0567a', pos: [-1.64, 0.3, 0.45] },
            { id: 'pain', label: 'БОЛЬ', reverse: 'АНЕСТЕЗИЯ', color: '#d94f16', pos: [-1.64, 1.85, 0.45] },
        ],
    },
    {
        id: 'legs',
        title: 'Ноги',
        hotspots: [
            { shape: 'capsule', pos: [0.37, -1.6, 0], radius: 0.36, height: 3.4 },
            { shape: 'capsule', pos: [-0.37, -1.6, 0], radius: 0.36, height: 3.4 },
        ],
        shot: { pos: [0, -1.2, 5.9], look: [0, -1.8, 0], fov: 50 },
        labelAt: [1.9, -1.9, 0.2],
        factors: [
            { id: 'balance', label: 'РАВНОВЕСИЕ', reverse: 'ПАДЕНИЕ', color: '#2a8a8a', pos: [1.16, -1.05, 0.5] },
            { id: 'endurance', label: 'ВЫНОСЛИВОСТЬ', reverse: 'ИСТОЩЕНИЕ', color: '#a0491e', pos: [-1.16, -1.05, 0.5] },
            { id: 'skeleton', label: 'ОПОРА', reverse: 'ХРУПКОСТЬ', color: '#6b7280', pos: [1.12, -2.7, 0.5] },
            { id: 'thermoregulation', label: 'ТЕПЛО', reverse: 'ХОЛОД', color: '#d1731a', pos: [-1.12, -2.7, 0.5] },
        ],
    },
    {
        id: 'spine',
        title: 'Позвоночник',
        hotspots: [{ shape: 'capsule', pos: [0, 1.7, -0.3], radius: 0.26, height: 1.9 }],
        // Единственная область, к которой камера заходит со спины
        shot: { pos: [3.3, 2.2, -3.7], look: [0, 1.7, -0.2], fov: 46 },
        labelAt: [-1.9, 2.65, 0.2],
        factors: [
            { id: 'nerve', label: 'ПРОВОДИМОСТЬ', reverse: 'БЛОК', color: '#3aa0c9', pos: [1.16, 2.35, -0.6] },
            { id: 'posture', label: 'ОСАНКА', reverse: 'ИСКРИВЛЕНИЕ', color: '#7a6a9c', pos: [-1.16, 1.9, -0.6] },
            { id: 'stress', label: 'СТРЕСС', reverse: 'ВОССТАНОВЛЕНИЕ', color: '#d92d1c', pos: [0.00, 1.15, -1.1] },
        ],
    },
];

export const bodyRegionById = (id) => BODY_REGIONS.find((region) => region.id === id) ?? null;
