import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { FACTORS_DATA } from '../data/factors';
import { SCALES, reversedInScale } from '../data/scales';
import { SCENARIOS, SCENARIO_KINDS } from '../data/scenarios';

/** Куда катится собранный мир: по перевесу катастроф, утопий и кино. */
function verdictOf(found) {
    const count = (kind) => found.filter((s) => s.kind === kind).length;
    const doom = count('doom');
    const utopia = count('utopia');
    const film = count('film');
    if (doom > utopia) return 'Мир, который вы собрали, идёт к гибели: катастрофы сложились из факторов разных масштабов.';
    if (utopia > doom) return 'Мир, который вы собрали, тянется к утопии: вы нашли, как ослабить войну, смог и неравенство.';
    if (doom > 0) return 'Ваш мир балансирует на лезвии: в нём одновременно и катастрофа, и утопия.';
    if (film > 0) return `Ваш мир похож на кино — в нём сложилось сюжетов: ${film}.`;
    return 'Реальность осталась почти такой, какой была. Попробуйте переворачивать факторы на разных масштабах вместе.';
}

/** Карточка-картинка итога 1080×1350 — чтобы сохранить или отправить. */
function drawCard({ reversedIds, found, perScale, verdict }) {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext('2d');
    const bg = ctx.createLinearGradient(0, 0, 0, 1350);
    bg.addColorStop(0, '#0a0c18');
    bg.addColorStop(1, '#02030a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1350);

    const wrap = (text, x, y, width, lh) => {
        const words = text.split(' ');
        let line = '';
        let yy = y;
        words.forEach((w) => {
            const test = line ? `${line} ${w}` : w;
            if (ctx.measureText(test).width > width && line) {
                ctx.fillText(line, x, yy);
                line = w;
                yy += lh;
            } else line = test;
        });
        if (line) ctx.fillText(line, x, yy);
        return yy + lh;
    };

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '28px Roboto, sans-serif';
    ctx.fillText('КОНСТРУКТОР РЕАЛЬНОСТИ', 80, 110);
    ctx.fillStyle = '#ffffff';
    ctx.font = '300 76px Roboto, sans-serif';
    ctx.fillText('Мой мир', 80, 200);

    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '32px Roboto, sans-serif';
    let y = wrap(verdict, 80, 280, 920, 44) + 20;

    perScale.forEach((scale, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const x = 80 + col * 470;
        const yy = y + row * 70;
        ctx.fillStyle = scale.tone;
        ctx.font = '28px Roboto, sans-serif';
        ctx.fillText(scale.title, x, yy);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x, yy + 14, 400, 8);
        ctx.fillStyle = scale.tone;
        ctx.fillRect(x, yy + 14, scale.total ? (400 * scale.count) / scale.total : 0, 8);
    });
    y += Math.ceil(perScale.length / 2) * 70 + 40;

    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font = '26px Roboto, sans-serif';
    ctx.fillText(`МИРЫ: ${found.length} ИЗ ${SCENARIOS.length}`, 80, y);
    y += 50;
    found.slice(0, 8).forEach((s) => {
        ctx.fillStyle = SCENARIO_KINDS[s.kind].accent;
        ctx.font = '34px Roboto, sans-serif';
        ctx.fillText(s.title, 80, y);
        y += 50;
    });

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '24px Roboto, sans-serif';
    wrap(`Перевёрнуто факторов: ${reversedIds.length}`, 80, 1270, 920, 32);
    return canvas.toDataURL('image/png');
}

/**
 * Итог пути: портрет собранного мира. Сколько перевёрнуто на каждом
 * масштабе, какие миры сложились и куда всё это катится — и возможность
 * сохранить это карточкой или скопировать текстом.
 */
export default function FinaleSummary() {
    const reversed = useStore((s) => s.reversedFactors);
    const discovered = useStore((s) => s.discoveredScenarios);
    const resetJourney = useStore((s) => s.resetJourney);
    const [copied, setCopied] = useState(false);

    const reversedIds = useMemo(() => Object.keys(reversed).filter((k) => reversed[k]), [reversed]);
    const found = useMemo(() => SCENARIOS.filter((s) => discovered[s.id]), [discovered]);
    const perScale = useMemo(() => SCALES.filter((s) => s.factors.length).map((s) => ({
        ...s, count: reversedInScale(s, reversed), total: s.factors.length,
    })), [reversed]);
    const verdict = verdictOf(found);
    const portrait = reversedIds.slice(0, 6).map((id) => FACTORS_DATA[id]?.reverseName).filter(Boolean);

    const text = [
        'Мой мир в «Конструкторе реальности»',
        verdict,
        found.length ? `Сложились миры: ${found.map((s) => s.title).join(', ')}` : '',
        portrait.length ? `В нём: ${portrait.join(', ')}` : '',
    ].filter(Boolean).join('\n');

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
        }
    };

    const save = () => {
        const link = document.createElement('a');
        link.href = drawCard({ reversedIds, found, perScale, verdict });
        link.download = 'moy-mir.png';
        link.click();
    };

    return (
        <div className="animate-fade-in relative z-50 pointer-events-auto max-w-2xl mx-auto px-4 max-h-[62vh] overflow-y-auto">
            <p className="tracking-[0.45em] uppercase text-[10px] mb-3 text-white/35">Путь пройден · ваш мир</p>
            <p className="text-sm sm:text-base text-white/85 leading-relaxed mb-4">{verdict}</p>

            {portrait.length > 0 && (
                <p className="text-xs text-cyan-200/70 mb-4">В нём: {portrait.join(' · ')}{reversedIds.length > portrait.length ? ` и ещё ${reversedIds.length - portrait.length}` : ''}</p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-4 text-left">
                {perScale.map((s) => (
                    <div key={s.id}>
                        <div className="flex justify-between text-[10px] uppercase tracking-wider">
                            <span style={{ color: s.tone }}>{s.title}</span>
                            <span className="text-white/40">{s.count}/{s.total}</span>
                        </div>
                        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(100 * s.count) / s.total}%`, background: s.tone }} />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
                {found.length === 0 && <span className="text-xs text-white/35">Ни одна комбинация не сложилась — а их {SCENARIOS.length}.</span>}
                {found.map((s) => (
                    <span key={s.id} className="rounded-full border px-3 py-1 text-[11px]" style={{ borderColor: `${SCENARIO_KINDS[s.kind].accent}66`, color: SCENARIO_KINDS[s.kind].accent }}>
                        {s.title}
                    </span>
                ))}
            </div>

            <p className="text-base text-white/90 italic mb-5">«Я не просто изучаю вселенную. Я её активирую.»</p>

            <div className="flex flex-wrap justify-center gap-2">
                <button onClick={save} className="px-5 py-2 rounded-full bg-white text-black text-xs uppercase tracking-wider hover:bg-cyan-200 transition-colors">
                    Сохранить карточку
                </button>
                <button onClick={copy} className="px-5 py-2 border border-white/30 rounded-full text-xs uppercase tracking-wider text-white/70 hover:bg-white hover:text-black transition-colors">
                    {copied ? 'Скопировано' : 'Скопировать итог'}
                </button>
                <button onClick={resetJourney} className="px-5 py-2 border border-white/30 rounded-full text-xs uppercase tracking-wider text-white/70 hover:bg-white hover:text-black transition-colors">
                    Пройти путь снова
                </button>
            </div>
        </div>
    );
}
