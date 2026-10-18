import { trackFor } from '../data/mind';
import { sound } from './audio';

/**
 * Музыка нейронов разума.
 *
 * Процедурный движок (lib/audio.js) синтезирует эмбиент сам; здесь — готовые
 * записи, по треку на состояние. Клик по нейрону меняет mindFocus, на это
 * подписан components/Sound.jsx, и трек сменяется кроссфейдом: старый гаснет,
 * новый поднимается, эмбиент приседает под музыку и возвращается, когда она
 * кончилась.
 *
 * Файлов в репозитории нет. Чего нет — то молчит: ошибка загрузки гасится,
 * путь запоминается как пустой и больше не дёргается, слой звучит как раньше.
 */

const FADE_IN = 1.6;
const FADE_OUT = 0.9;
/** Насколько приседает эмбиент, пока играет трек. */
const DUCK = 0.3;
const VOLUME = 0.55;

class MusicPlayer {
    constructor() {
        this.enabled = true;
        this.current = null;
        this.missing = new Set();
        this.listeners = new Set();
        this.state = { id: null, track: null, playing: false };
    }

    subscribe(fn) {
        this.listeners.add(fn);
        return () => this.listeners.delete(fn);
    }

    emit(next) {
        this.state = { ...this.state, ...next };
        this.listeners.forEach((fn) => fn(this.state));
    }

    setEnabled(on) {
        this.enabled = on;
        if (!on) this.stop();
    }

    /**
     * Включить трек нейрона. Вызывается из обработчика клика, поэтому
     * автозапуск разрешён: жест зрителя уже был.
     */
    play(id) {
        if (!this.enabled || !id) {
            this.stop();
            return;
        }
        if (this.current && this.current.id === id) return;
        const track = trackFor(id);
        if (!track || this.missing.has(track.src)) {
            this.stop();
            return;
        }

        this.fadeOut(this.current);

        const el = new Audio(track.src);
        el.loop = true;
        el.volume = 0;
        el.preload = 'auto';
        const entry = { id, el, track, ramp: null };
        this.current = entry;

        const fail = () => {
            // Файла нет или формат не поддержан: больше к нему не возвращаемся
            this.missing.add(track.src);
            if (import.meta.env.DEV) console.info('[music] файла нет, нейрон играет молча:', track.src);
            if (this.current === entry) {
                this.current = null;
                sound.setDuck(1);
                this.emit({ id: null, track: null, playing: false });
            }
        };
        entry.fail = fail;
        el.addEventListener('error', fail);

        const started = el.play();
        if (started && typeof started.catch === 'function') started.catch(fail);

        sound.setDuck(DUCK);
        this.ramp(entry, VOLUME, FADE_IN);
        this.emit({ id, track, playing: true });
    }

    stop() {
        if (!this.current) return;
        this.fadeOut(this.current);
        this.current = null;
        sound.setDuck(1);
        this.emit({ id: null, track: null, playing: false });
    }

    fadeOut(entry) {
        if (!entry) return;
        // Слушатель снимается заранее: освобождение источника само бросает
        // error, и трек попал бы в чёрный список живым
        entry.el.removeEventListener('error', entry.fail);
        this.ramp(entry, 0, FADE_OUT, () => {
            entry.el.pause();
            entry.el.removeAttribute('src');
            entry.el.load();
        });
    }

    /** Линейная рампа громкости на таймере: Audio не умеет её сам. */
    ramp(entry, to, seconds, done) {
        if (entry.ramp) clearInterval(entry.ramp);
        const step = 1 / 30;
        const from = entry.el.volume;
        let t = 0;
        entry.ramp = setInterval(() => {
            t += step;
            const k = Math.min(1, t / seconds);
            try {
                entry.el.volume = from + (to - from) * k;
            } catch {
                // Элемент уже освобождён
            }
            if (k >= 1) {
                clearInterval(entry.ramp);
                entry.ramp = null;
                if (done) done();
            }
        }, step * 1000);
    }
}

export const music = new MusicPlayer();

if (import.meta.env.DEV) {
    window.realityMusic = music;
}
