/**
 * Спокойный режим.
 *
 * Кадр здесь почти не стоит на месте: вуали с радиальными полосами светового
 * прыжка, пролёты камеры, дрейф сцен. Для части зрителей это не стиль, а
 * причина укачивания — система об этом знает и сообщает через
 * `prefers-reduced-motion`, но проект её не спрашивал.
 *
 * Спокойный режим не выключает переходы: без них слои снова стыкуются
 * склейкой. Он убирает из них то, что и вызывает тошноту — разгон камеры
 * внутрь кадра и бегущие полосы, — а сами заливки делает короткими.
 */

const QUERY = '(prefers-reduced-motion: reduce)';

/** Насколько короче обычного идут переходы и пролёты в спокойном режиме. */
export const CALM_TIME_SCALE = 0.45;

/**
 * Ручной перекрыватель: `?calm=1` включает режим на любой машине, `?calm=0`
 * выключает даже при системной настройке. Нужен и для проверок, и для тех,
 * у кого настройка системы не совпадает с желанием.
 */
function override() {
    if (typeof window === 'undefined') return null;
    const value = new URLSearchParams(window.location.search).get('calm');
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    return null;
}

export function prefersReducedMotion() {
    const forced = override();
    if (forced !== null) return forced;
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
}

/**
 * Подписка на смену системной настройки: её меняют на ходу, и путь не должен
 * требовать перезагрузки. Возвращает отписку.
 */
export function watchReducedMotion(onChange) {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    // Ручной перекрыватель сильнее системы — тогда следить не за чем
    if (override() !== null) return () => {};

    const media = window.matchMedia(QUERY);
    const handler = (event) => onChange(event.matches);
    media.addEventListener('change', handler);
    return () => media.removeEventListener('change', handler);
}

/**
 * Пресет вуали для спокойного режима: заливка короче, полосы светового прыжка
 * и зерно убраны. Цвета остаются — именно они связывают слой с тем, куда
 * зритель проваливается.
 */
export function calmVeil(preset) {
    return {
        ...preset,
        streaks: 0,
        grain: preset.grain * 0.4,
        cover: preset.cover * CALM_TIME_SCALE,
        hold: preset.hold * CALM_TIME_SCALE,
        reveal: preset.reveal * CALM_TIME_SCALE,
        coverEase: 'power1.inOut',
        revealEase: 'power1.inOut',
    };
}
