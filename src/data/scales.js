import { NATURE_LOCATIONS, CITY_LOCATIONS } from './locations';
import { BODY_LAYERS } from './bodyLayers';
import { FACTOR_NEURONS } from './mind';

/**
 * Масштабы пути и их факторы — для итога: где зритель перевернул мир сильнее.
 * Факторы космоса и клетки живут прямо в своих сценах, поэтому здесь их
 * списки продублированы; остальные собираются из данных слоёв.
 */
export const SCALES = [
    { id: 'origin', title: 'Сингулярность', tone: '#ffd9a0', factors: [] },
    {
        id: 'cosmos',
        title: 'Космос',
        tone: '#9ec8ff',
        factors: ['acceleration', 'gravity', 'sun', 'radiation', 'heating', 'freezing', 'void', 'infinity', 'symbiosis', 'tides', 'moonlight', 'venusHeat', 'jupiterStorm', 'saturnRings', 'galaxy'],
    },
    {
        id: 'planet',
        title: 'Планета',
        tone: '#7fc8ff',
        factors: ['atmosphere', 'aurora', 'tectonics', 'currents', 'waterCycle', 'pressure', 'emissions', 'ozone', 'sunEnergy', 'moonPhase'],
    },
    { id: 'nature', title: 'Природа', tone: '#7fe6b0', factors: NATURE_LOCATIONS.flatMap((l) => l.factors) },
    { id: 'society', title: 'Общество', tone: '#ffd166', factors: [...CITY_LOCATIONS.flatMap((l) => l.factors), 'war'] },
    { id: 'human', title: 'Человек', tone: '#ff9aa8', factors: BODY_LAYERS.flatMap((l) => l.factors.map((f) => f.id)) },
    { id: 'mind', title: 'Разум', tone: '#c8a0ff', factors: FACTOR_NEURONS.map((f) => f.id) },
    {
        id: 'cell',
        title: 'Клетка',
        tone: '#d9a0ff',
        factors: ['cellMembrane', 'dnaRepair', 'mutation', 'synapse', 'neurotransmitter', 'proteinSynthesis', 'mitochondria', 'myelin'],
    },
];

/** Сколько факторов масштаба перевёрнуто. */
export const reversedInScale = (scale, reversed) => scale.factors.filter((f) => reversed[f]).length;
