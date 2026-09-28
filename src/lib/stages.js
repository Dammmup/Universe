/**
 * Слои пути. Номера нигде не пишутся цифрами — только через эти имена.
 * Мезо-уровень разбит на три слоя одной планеты: общие процессы Земли,
 * природные локации и города. Все три живут в одной сцене (Planet.jsx):
 * между ними планета доворачивается в кадре, а не меняется вуалью.
 *
 * Человек стоит перед клеткой: масштаб убывает монотонно.
 */
export const STAGE = {
    SINGULARITY: 0,
    COSMOS: 1,
    PLANET: 2,
    NATURE: 3,
    SOCIETY: 4,
    HUMAN: 5,
    CELL: 6,
    FINALE: 7,
};

export const MAX_STAGE = STAGE.FINALE;

/** Слои, в которых кадр держит глобус (или диораму его локации). */
export const isEarthStage = (stage) => stage >= STAGE.PLANET && stage <= STAGE.SOCIETY;

/** Слои-карты: на глобусе точки локаций, из которых ныряют в диорамы. */
export const isMapStage = (stage) => stage === STAGE.NATURE || stage === STAGE.SOCIETY;

export const STAGE_TITLES = {
    [STAGE.SINGULARITY]: { kicker: 'Начало', title: 'Сингулярность' },
    [STAGE.COSMOS]: { kicker: 'Макро-уровень', title: 'Космос' },
    [STAGE.PLANET]: { kicker: 'Мезо-уровень 1', title: 'Планета' },
    [STAGE.NATURE]: { kicker: 'Мезо-уровень 2', title: 'Природа и стихии' },
    [STAGE.SOCIETY]: { kicker: 'Мезо-уровень 3', title: 'Общество' },
    [STAGE.HUMAN]: { kicker: 'Антропо-уровень', title: 'Человек' },
    [STAGE.CELL]: { kicker: 'Микро-уровень', title: 'Клетка и сознание' },
    [STAGE.FINALE]: { kicker: 'Путь пройден', title: 'Итог' },
};
