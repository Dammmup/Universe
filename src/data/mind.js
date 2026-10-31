/**
 * Факторы «Разума»: подписанные нейроны сети (scenes/Mind.jsx).
 *
 * Семнадцать подписей в одной голове не складывались в целое: «Эмоция» висела
 * рядом со своими же частями — гневом, страхом, радостью, грустью, — а
 * «Эмпатия» с «Привязанностью» мешались с «Памятью» и «Абстракцией». Нейроны
 * разобраны по системам, и сеть показывает одну систему за раз: `system` у
 * нейрона, MIND_SYSTEMS — переключатель. Так в кадре одновременно не больше
 * семи подписей, и все они об одном.
 *
 * «Эмоция» помечена как umbrella: это не сосед гнева, а название всей системы
 * чувств. Своим нейроном она не рисуется — её режим включает чип «Чувства».
 */

/** Системы разума: порядок чипов в панели, цвет и общий режим системы. */
export const MIND_SYSTEMS = [
    { id: 'cognition', title: 'Познание', color: '#4ff0ff', mode: 'attention', hint: 'Чем разум обрабатывает мир' },
    { id: 'feeling', title: 'Чувства', color: '#ff7ac8', mode: 'emotion', hint: 'Чем он на мир отзывается' },
    { id: 'will', title: 'Воля', color: '#ffb03a', mode: 'motivation', hint: 'Что его тянет вперёд' },
    { id: 'state', title: 'Состояния', color: '#8c7aff', mode: 'sleep', hint: 'В каком режиме он работает' },
];

/**
 * Нейроны-факторы: позиции разнесены по «полушариям», «Я» — в центре.
 * system — к какой системе относится; core виден всегда, он центр головы.
 */
export const FACTOR_NEURONS = [
    { id: 'identity', pos: [0, 0.2, 0], system: 'core' },

    // Познание
    { id: 'attention', pos: [-2.6, 2.4, 1.6], system: 'cognition' },
    { id: 'memory', pos: [-4.6, 0.3, -1.0], system: 'cognition' },
    { id: 'abstraction', pos: [2.2, 2.6, -1.9], system: 'cognition' },
    { id: 'speech', pos: [-3.8, 1.6, 1.0], system: 'cognition' },

    // Чувства
    { id: 'anger', pos: [2.9, -0.8, 1.9], system: 'feeling' },
    { id: 'fear', pos: [1.6, -2.3, 0.6], system: 'feeling' },
    { id: 'joy', pos: [3.6, 1.6, 0.4], system: 'feeling' },
    { id: 'sadness', pos: [-3.4, -1.9, 0.4], system: 'feeling' },
    { id: 'empathy', pos: [-1.2, 1.1, 2.9], system: 'feeling' },
    { id: 'attachment', pos: [1.3, 1.2, 2.8], system: 'feeling' },
    // Зонтик системы чувств: отдельным нейроном не рисуется
    { id: 'emotion', pos: [-0.2, -1.5, 2.6], system: 'feeling', umbrella: true },

    // Воля
    { id: 'motivation', pos: [4.6, -0.2, -1.2], system: 'will' },
    { id: 'curiosity', pos: [0.4, 3.1, 0.8], system: 'will' },

    // Состояния: стресс стоит здесь, а не в воле — его антипод
    // «Восстановление» в одном ряду со сном и бессонницей
    { id: 'sleep', pos: [0.8, -1.2, -3.0], system: 'state' },
    { id: 'dreaming', pos: [-1.6, -0.6, -2.8], system: 'state' },
    { id: 'stress', pos: [-0.6, -2.9, -1.2], system: 'state' },
];

/** Система, с которой начинается знакомство с разумом. */
export const DEFAULT_MIND_SYSTEM = 'cognition';

/** Какую систему показать, чтобы этот нейрон попал в кадр. */
export function systemOfFactor(id) {
    const n = FACTOR_NEURONS.find((f) => f.id === id);
    return n ? n.system : null;
}

/**
 * Подписанные нейроны выбранной системы: ядро («Я») остаётся всегда, зонтики
 * не рисуются, фокус виден даже если он из другой системы — иначе выбранный
 * нейрон пропадал бы из кадра при переключении чипа.
 */
export function visibleNeurons(systemId, focusId = null) {
    return FACTOR_NEURONS.filter((f) => {
        if (f.umbrella) return false;
        if (f.system === 'core') return true;
        if (f.id === focusId) return true;
        return f.system === systemId;
    });
}

/**
 * Музыка нейронов.
 *
 * Клик по нейрону включает трек — у каждого состояния своё звучание. Файлы
 * кладутся в public/audio/mind/ под именем из `file`; чего нет, то просто не
 * играет (см. lib/music.js), остаётся процедурный эмбиент. Это коммерческие
 * записи: в репозиторий они не входят, их приносит владелец прав.
 */
export const MIND_TRACKS = {
    attention: { file: 'attention.mp3', artist: 'Cupsize', title: 'Концентрация' },
    sadness: { file: 'sadness.mp3', artist: 'Malcolm Todd', title: 'Тоска' },
    dreaming: { file: 'dreaming.mp3', artist: 'Malcolm Todd', title: 'Мечта' },
    joy: { file: 'joy.mp3', artist: '', title: 'Радость' },
    anger: { file: 'anger.mp3', artist: '', title: 'Гнев' },
    fear: { file: 'fear.mp3', artist: '', title: 'Страх' },
    empathy: { file: 'empathy.mp3', artist: '', title: 'Эмпатия' },
    attachment: { file: 'attachment.mp3', artist: '', title: 'Привязанность' },
    motivation: { file: 'motivation.mp3', artist: '', title: 'Мотивация' },
    curiosity: { file: 'curiosity.mp3', artist: '', title: 'Любопытство' },
    memory: { file: 'memory.mp3', artist: '', title: 'Память' },
    abstraction: { file: 'abstraction.mp3', artist: '', title: 'Абстракция' },
    stress: { file: 'stress.mp3', artist: '', title: 'Стресс' },
    speech: { file: 'speech.mp3', artist: '', title: 'Речь' },
    sleep: { file: 'sleep.mp3', artist: '', title: 'Сон' },
    identity: { file: 'identity.mp3', artist: '', title: 'Идентичность' },
    emotion: { file: 'emotion.mp3', artist: '', title: 'Эмоция' },
};

/** Где лежат файлы треков. */
export const MIND_TRACK_DIR = '/audio/mind/';

export function trackFor(id) {
    const t = MIND_TRACKS[id];
    return t ? { ...t, src: MIND_TRACK_DIR + t.file } : null;
}
