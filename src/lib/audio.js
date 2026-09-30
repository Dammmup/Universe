/**
 * Звук — полностью процедурный, на Web Audio: ни одного файла.
 *
 * Эмбиент слоя собирается из трёх голосов: гул (несколько синусов с
 * медленным биением), шум через фильтр (ветер, дождь, прибой, город) и
 * события (удары сердца, птицы, щелчки нейронов). Профили меняются плавным
 * перекрёстным затуханием. Эффекты — короткие синтезированные звуки.
 *
 * Браузер не даёт звуку начаться без жеста, поэтому контекст создаётся на
 * первом касании, колесе или клике.
 */

const PROFILES = {
    silence: { drone: [], noise: null },
    singularity: { drone: [36, 36.4, 72.2], droneGain: 0.05, noise: { type: 'lowpass', freq: 180, q: 0.5, gain: 0.03 } },
    cosmos: { drone: [55, 55.3, 82.4, 110.2], droneGain: 0.04, noise: { type: 'bandpass', freq: 900, q: 0.8, gain: 0.012, lfo: 0.05 }, shimmer: 0.4 },
    planet: { drone: [49, 73.5, 98.2], droneGain: 0.035, noise: { type: 'lowpass', freq: 500, q: 0.7, gain: 0.05, lfo: 0.08 } },
    // Природа
    jungle: { drone: [110, 164.8], droneGain: 0.012, noise: { type: 'highpass', freq: 2200, q: 0.4, gain: 0.08 }, chirps: 1.6 },
    taiga: { drone: [65.4, 98], droneGain: 0.02, noise: { type: 'lowpass', freq: 700, q: 0.6, gain: 0.06, lfo: 0.12 }, chirps: 0.4 },
    desert: { drone: [73.4, 110], droneGain: 0.02, noise: { type: 'bandpass', freq: 420, q: 0.9, gain: 0.08, lfo: 0.07 } },
    arctic: { drone: [98, 146.8, 196.2], droneGain: 0.02, noise: { type: 'bandpass', freq: 1400, q: 1.4, gain: 0.04, lfo: 0.1 }, shimmer: 0.6 },
    ocean: { drone: [55, 82.4], droneGain: 0.02, noise: { type: 'lowpass', freq: 900, q: 0.5, gain: 0.12, lfo: 0.13, lfoDepth: 0.9 } },
    mountains: { drone: [61.7, 92.5], droneGain: 0.025, noise: { type: 'bandpass', freq: 600, q: 0.7, gain: 0.07, lfo: 0.09 } },
    // Города
    city: { drone: [50, 100.4, 150], droneGain: 0.03, noise: { type: 'bandpass', freq: 320, q: 0.6, gain: 0.07, lfo: 0.2 } },
    // Человек, разум, клетка, итог
    body: { drone: [65.4, 130.8], droneGain: 0.018, noise: { type: 'lowpass', freq: 260, q: 0.6, gain: 0.03 }, heartbeat: 64 },
    mind: { drone: [82.4, 123.5, 164.8], droneGain: 0.02, noise: { type: 'highpass', freq: 3000, q: 0.5, gain: 0.01 }, crackle: 6 },
    cell: { drone: [73.4, 110, 146.8], droneGain: 0.025, noise: { type: 'lowpass', freq: 400, q: 1.2, gain: 0.04, lfo: 0.3 }, bubbles: 2.5 },
    finale: { drone: [55, 82.4, 110, 164.8], droneGain: 0.035, noise: null, shimmer: 0.8 },
};

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.enabled = true;
        this.profileKey = 'silence';
        this.layer = null;
        this.eventTimer = null;
        this.mood = { heart: 64, crackle: 6, tint: 0 };
    }

    /** Создаёт контекст на первом жесте пользователя. */
    unlock() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        this.ctx = new Ctx();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.9 : 0;
        // Мягкий компрессор: эффекты поверх эмбиента не щёлкают
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 3;
        this.master.connect(comp).connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise();
        const key = this.profileKey;
        this.profileKey = 'silence';
        this.setProfile(key);
    }

    makeNoise() {
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        // Розовый шум мягче белого и звучит как ветер, а не как помеха
        let b0 = 0; let b1 = 0; let b2 = 0;
        for (let i = 0; i < len; i += 1) {
            const w = Math.random() * 2 - 1;
            b0 = 0.99765 * b0 + w * 0.099;
            b1 = 0.963 * b1 + w * 0.2965;
            b2 = 0.57 * b2 + w * 1.0527;
            data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
        }
        return buf;
    }

    setEnabled(on) {
        this.enabled = on;
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(on ? 0.9 : 0, t, 0.3);
    }

    /** Настроение текущего слоя: частота сердца, частота щелчков разума. */
    setMood(mood) {
        Object.assign(this.mood, mood);
    }

    setProfile(key) {
        if (key === this.profileKey) return;
        this.profileKey = key;
        if (!this.ctx) return;
        const profile = PROFILES[key] ?? PROFILES.silence;
        const t = this.ctx.currentTime;

        // Прежний слой гаснет за две секунды и отключается
        if (this.layer) {
            const old = this.layer;
            old.gain.gain.cancelScheduledValues(t);
            old.gain.gain.setTargetAtTime(0, t, 0.6);
            setTimeout(() => old.nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch { /* уже остановлен */ } }), 3000);
        }
        clearInterval(this.eventTimer);

        const gain = this.ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(1, t, 0.8);
        gain.connect(this.master);
        const nodes = [gain];

        profile.drone.forEach((f, i) => {
            const osc = this.ctx.createOscillator();
            osc.type = i % 2 ? 'triangle' : 'sine';
            osc.frequency.value = f;
            const g = this.ctx.createGain();
            g.gain.value = (profile.droneGain ?? 0.03) / (1 + i * 0.4);
            // Медленное дыхание громкости — гул живой, а не заставка
            const lfo = this.ctx.createOscillator();
            lfo.frequency.value = 0.05 + i * 0.03;
            const lfoGain = this.ctx.createGain();
            lfoGain.gain.value = g.gain.value * 0.4;
            lfo.connect(lfoGain).connect(g.gain);
            osc.connect(g).connect(gain);
            osc.start();
            lfo.start();
            nodes.push(osc, lfo, g, lfoGain);
        });

        if (profile.noise) {
            const src = this.ctx.createBufferSource();
            src.buffer = this.noiseBuffer;
            src.loop = true;
            const filter = this.ctx.createBiquadFilter();
            filter.type = profile.noise.type;
            filter.frequency.value = profile.noise.freq;
            filter.Q.value = profile.noise.q;
            const g = this.ctx.createGain();
            g.gain.value = profile.noise.gain;
            if (profile.noise.lfo) {
                // Порывы ветра и накаты волн — модуляция громкости шума
                const lfo = this.ctx.createOscillator();
                lfo.frequency.value = profile.noise.lfo;
                const lfoGain = this.ctx.createGain();
                lfoGain.gain.value = profile.noise.gain * (profile.noise.lfoDepth ?? 0.6);
                lfo.connect(lfoGain).connect(g.gain);
                lfo.start();
                nodes.push(lfo, lfoGain);
            }
            src.connect(filter).connect(g).connect(gain);
            src.start();
            nodes.push(src, filter, g);
        }

        this.layer = { gain, nodes };

        // События слоя: сердце, птицы, щелчки нейронов, пузырьки, мерцание
        this.eventTimer = setInterval(() => {
            if (!this.ctx || !this.enabled) return;
            const r = Math.random();
            if (profile.heartbeat) {
                const interval = 60 / (this.mood.heart || profile.heartbeat);
                const now = this.ctx.currentTime;
                if (!this.nextBeat || now >= this.nextBeat) {
                    this.thump(now, 1);
                    this.thump(now + 0.18, 0.6);
                    this.nextBeat = now + interval;
                }
            }
            if (profile.chirps && r < profile.chirps * 0.1) this.chirp(gain);
            if (profile.crackle && r < (this.mood.crackle || profile.crackle) * 0.1) this.click(gain, 1800 + Math.random() * 2400, 0.03);
            if (profile.bubbles && r < profile.bubbles * 0.1) this.bubble(gain);
            if (profile.shimmer && r < profile.shimmer * 0.05) this.bell(gain, 880 * (1 + Math.floor(Math.random() * 4) * 0.25), 0.012, 2.5);
        }, 100);
    }

    env(node, t, attack, peak, release) {
        node.gain.setValueAtTime(0, t);
        node.gain.linearRampToValueAtTime(peak, t + attack);
        node.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
    }

    tone(dest, { type = 'sine', freq, to, peak = 0.05, attack = 0.01, release = 0.4, when = 0 }) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime + when;
        const osc = this.ctx.createOscillator();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t + attack + release);
        const g = this.ctx.createGain();
        this.env(g, t, attack, peak, release);
        osc.connect(g).connect(dest ?? this.master);
        osc.start(t);
        osc.stop(t + attack + release + 0.05);
    }

    thump(t, k) {
        const osc = this.ctx.createOscillator();
        osc.frequency.setValueAtTime(70, t);
        osc.frequency.exponentialRampToValueAtTime(38, t + 0.16);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.18 * k, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        osc.connect(g).connect(this.layer?.gain ?? this.master);
        osc.start(t);
        osc.stop(t + 0.25);
    }

    chirp(dest) {
        const base = 2200 + Math.random() * 1800;
        for (let i = 0; i < 2 + Math.floor(Math.random() * 3); i += 1) {
            this.tone(dest, { freq: base, to: base * 1.35, peak: 0.012, attack: 0.005, release: 0.08, when: i * 0.1 });
        }
    }

    click(dest, freq, peak) {
        this.tone(dest, { type: 'square', freq, to: freq * 0.5, peak, attack: 0.001, release: 0.03 });
    }

    bubble(dest) {
        const f = 300 + Math.random() * 500;
        this.tone(dest, { freq: f, to: f * 2.2, peak: 0.02, attack: 0.005, release: 0.12 });
    }

    bell(dest, freq, peak, release) {
        this.tone(dest, { freq, peak, attack: 0.005, release });
        this.tone(dest, { freq: freq * 2.01, peak: peak * 0.4, attack: 0.005, release: release * 0.6 });
    }

    // ─── Эффекты ─────────────────────────────────────────────────────────

    /** Переворот фактора: вверх — к антиподу, вниз — назад. */
    toggle(reversed) {
        if (!this.ctx || !this.enabled) return;
        const notes = reversed ? [392, 311, 233] : [233, 311, 392];
        notes.forEach((f, i) => this.bell(null, f, 0.05, 0.6 - i * 0.1));
    }

    /** Вспышка перехода: шумовой взмах, уходящий вверх. */
    whoosh() {
        if (!this.ctx || !this.enabled) return;
        const t = this.ctx.currentTime;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 1.2;
        filter.frequency.setValueAtTime(200, t);
        filter.frequency.exponentialRampToValueAtTime(3200, t + 1.1);
        const g = this.ctx.createGain();
        this.env(g, t, 0.6, 0.25, 0.8);
        src.connect(filter).connect(g).connect(this.master);
        src.start(t);
        src.stop(t + 1.6);
    }

    /** Сложился мир: аккорд по типу — мажор утопии, минор катастрофы, кварты кино. */
    scenario(kind) {
        if (!this.ctx || !this.enabled) return;
        const chords = {
            utopia: [261.6, 329.6, 392, 523.2],
            doom: [220, 261.6, 311.1, 207.7],
            film: [293.7, 392, 440, 587.3],
        };
        (chords[kind] ?? chords.film).forEach((f, i) => this.tone(null, { type: 'triangle', freq: f, peak: 0.045, attack: 0.05 + i * 0.08, release: 2.6 }));
    }

    /** Эхо на другом слое: далёкий двойной отзвук. */
    echo() {
        if (!this.ctx || !this.enabled) return;
        this.bell(null, 659.3, 0.03, 1.2);
        this.bell(null, 659.3, 0.015, 1.2);
        setTimeout(() => this.bell(null, 493.9, 0.018, 1.4), 260);
    }
}

export const sound = new SoundEngine();

/** Какой профиль звучит сейчас. */
export function profileFor({ stage, location, STAGE, isCity }) {
    if (location) return isCity ? 'city' : location;
    switch (stage) {
        case STAGE.SINGULARITY: return 'singularity';
        case STAGE.COSMOS: return 'cosmos';
        case STAGE.PLANET: case STAGE.NATURE: case STAGE.SOCIETY: return 'planet';
        case STAGE.HUMAN: return 'body';
        case STAGE.MIND: return 'mind';
        case STAGE.CELL: return 'cell';
        case STAGE.FINALE: return 'finale';
        default: return 'silence';
    }
}

// В разработке движок доступен из консоли — как стор и рендерер
if (import.meta.env.DEV) {
    window.realitySound = sound;
}
