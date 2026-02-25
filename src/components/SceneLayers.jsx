import React, { useState } from 'react';
import { motion } from 'framer-motion';
import ConceptNode from './ConceptNode';

const LAYERS_DATA = [
    {
        id: 1,
        title: "Физические силы",
        colorHex: "#1a1aff",
        ambientMsg: "Ты ищешь первопричины.",
        nodes: [
            {
                id: "1-1",
                title: "Сингулярность",
                description: "Точка бесконечной плотности, где привычные законы пространства-времени утрачивают смысл. Абсолютное начало, скрывающее в себе потенциал всего сущего.",
                related: ["Единство", "Причинность"]
            },
            {
                id: "1-2",
                title: "Инерция",
                description: "Свойство материи противиться изменениям. Пассивное сопротивление пустоты, заставляющее объекты сохранять свой статус-кво в вечности.",
                related: ["Сопротивление", "Гомеостаз"]
            },
            {
                id: "1-3",
                title: "Турбулентность",
                description: "Хаотичное рождение порядка через вихри и нестабильность. Сила, разрушающая ламинарность бытия, чтобы создать новые, непредсказуемые формы.",
                related: ["Флуктуация", "Эмерджентность"]
            },
            {
                id: "1-4",
                title: "Дифракция",
                description: "Искажение и огибание препятствий. Волновая природа реальности, доказывающая, что ни одна граница не является абсолютной преградой для потока.",
                related: ["Адаптация", "Проекция"]
            },
            {
                id: "1-5",
                title: "Сжатие",
                description: "Концентрация энергии и материи под давлением внешних сил. Фундаментальный акт, предшествующий взрыву, рождению звезд и идей.",
                related: ["Критичность", "Сингулярность"]
            }
        ]
    },
    {
        id: 2,
        title: "Термодинамика",
        colorHex: "#ff6600",
        ambientMsg: "Ты чувствуешь грань между хаосом и порядком.",
        nodes: [
            {
                id: "2-1",
                title: "Градиент",
                description: "Разница потенциалов, порождающая всякое движение. Без градиента вселенная погружается в тепловую смерть и абсолютное безмолвие.",
                related: ["Причинность", "Инерция"]
            },
            {
                id: "2-2",
                title: "Флуктуация",
                description: "Слепое отклонение от среднего значения. Случайность, которая становится зерном новых структур и катализатором макроскопических сдвигов.",
                related: ["Турбулентность", "Эмерджентность"]
            },
            {
                id: "2-3",
                title: "Гомеостаз",
                description: "Динамическое равновесие системы. Постоянная борьба энергии против распада, направленная на сохранение своей внутренней архитектуры.",
                related: ["Адаптация", "Инерция"]
            },
            {
                id: "2-4",
                title: "Критичность",
                description: "Хрупкая точка фазового перехода. Состояние балансирования на краю хаоса, где мельчайшее воздействие меняет сущность всей системы.",
                related: ["Сжатие", "Синхронистичность"]
            },
            {
                id: "2-5",
                title: "Сопротивление",
                description: "Энтропийное трение реальности. Неизбежная потеря энергии при любом взаимодействии, напоминающая о конечности всех процессов.",
                related: ["Паразитизм", "Инерция"]
            }
        ]
    },
    {
        id: 3,
        title: "Биологическая логика",
        colorHex: "#00ff88",
        ambientMsg: "Ты чувствуешь жизнь.",
        nodes: [
            {
                id: "3-1",
                title: "Симбиоз",
                description: "Взаимное проникновение двух чужеродных форм. Парадокс выживания, при котором отказ от части своей независимости порождает сверхсистему.",
                related: ["Единство", "Гомеостаз"]
            },
            {
                id: "3-2",
                title: "Мимикрия",
                description: "Искусство обмана на уровне молекул и инстинктов. Расстворение в среде ради выживания, ставящее под вопрос само понятие подлинности.",
                related: ["Проекция", "Дифракция"]
            },
            {
                id: "3-3",
                title: "Адаптация",
                description: "Пластичность материи под давлением агрессивной среды. Способность жизни переписывать свой код, чтобы продолжать игру со смертью.",
                related: ["Эмерджентность", "Дифракция"]
            },
            {
                id: "3-4",
                title: "Регенерация",
                description: "Восстановление утраченного через память клеток. Вечный цикл самоисцеления, отрицающий окончательность любой травмы.",
                related: ["Гомеостаз", "Монизм"]
            },
            {
                id: "3-5",
                title: "Паразитизм",
                description: "Асимметричный обмен энергией. Интеллектуальный или биологический захват чужих ресурсов, обнажающий жестокую экономику существования.",
                related: ["Сопротивление", "Доминанта"]
            }
        ]
    },
    {
        id: 4,
        title: "Сознание",
        colorHex: "#9933ff",
        ambientMsg: "Ты ищешь источник внутри.",
        nodes: [
            {
                id: "4-1",
                title: "Абстракция",
                description: "Способность разума отсекать лишнее, оставляя лишь скелет концепции. Рождение символа из хаоса сенсорных восприятий.",
                related: ["Дуализм", "Сингулярность"]
            },
            {
                id: "4-2",
                title: "Доминанта",
                description: "Главенствующий очаг возбуждения. Идея, подчиняющая себе волю и алгоритмы поведения, превращая субъекта в свой инструмент.",
                related: ["Паразитизм", "Сжатие"]
            },
            {
                id: "4-3",
                title: "Интроекция",
                description: "Поглощение внешнего мира во внутренний. Механизм, при котором чужие убеждения становятся голосом собственного \"Я\".",
                related: ["Симбиоз", "Мимикрия"]
            },
            {
                id: "4-4",
                title: "Эмерджентность",
                description: "Свойство целого, которое не сводится к сумме его частей. Искра сознания, вспыхивающая в темной паутине бездушных нейронов.",
                related: ["Синхронистичность", "Адаптация"]
            },
            {
                id: "4-5",
                title: "Проекция",
                description: "Облачение мира в свои собственные тени. Способность (или проклятие) видеть в других лишь отражения внутренних страхов и желаний.",
                related: ["Дифракция", "Дуализм"]
            }
        ]
    },
    {
        id: 5,
        title: "Метафизика",
        colorHex: "#ffffff",
        ambientMsg: "Ты стремишься к единству.",
        nodes: [
            {
                id: "5-1",
                title: "Причинность",
                description: "Непрерывная цепь событий, сковывающая свободу. Фаталистичная иллюзия того, что у каждого следствия есть свой понятный корень.",
                related: ["Градиент", "Инерция"]
            },
            {
                id: "5-2",
                title: "Синхронистичность",
                description: "Акаузальный связующий принцип. Момент, когда внутреннее и внешнее сливаются в значимом совпадении, минуя законы физики.",
                related: ["Эмерджентность", "Критичность"]
            },
            {
                id: "5-3",
                title: "Дуализм",
                description: "Трагический раскол мира на дух и материю, свет и тьму. Фундаментальная ссора, питающая конфликт внутри человеческого сердца.",
                related: ["Проекция", "Абстракция"]
            },
            {
                id: "5-4",
                title: "Монизм",
                description: "Слияние всех противоположностей в единую субстанцию. Принятие иллюзорности границ между наблюдателем и наблюдаемым.",
                related: ["Регенерация", "Единство"]
            },
            {
                id: "5-5",
                title: "Единство",
                description: "Конечная точка познания, где начало сливается с концом. Абсолютная тотальность, в которой растворяется любое \"Я\".",
                related: ["Сингулярность", "Симбиоз"]
            }
        ]
    }
];

export default function SceneLayers({ onLayerInteract, onRestart }) {
    const [activeNodeId, setActiveNodeId] = useState(null);
    const [clickCounts, setClickCounts] = useState({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });

    const handleNodeClick = (layerId, nodeId) => {
        setActiveNodeId(prev => (prev === nodeId ? null : nodeId));

        // Трекинг кликов
        setClickCounts(prev => {
            const newCounts = { ...prev };
            newCounts[layerId] += 1;

            // Если кликнули 3 раза по этому слою - триггерим смену фона и сообщение
            if (newCounts[layerId] === 3) {
                const layerData = LAYERS_DATA.find(l => l.id === layerId);
                onLayerInteract(layerData.colorHex, layerData.ambientMsg);
            }
            return newCounts;
        });
    };

    return (
        <div className="relative z-10 w-full flex flex-col items-center">
            {LAYERS_DATA.map((layer, index) => (
                <div
                    key={layer.id}
                    className="min-h-[100vh] w-full flex flex-col items-center justify-center py-24 px-4 relative"
                >
                    {/* Декоративное свечение на бэкграунде (опционально, мягкая тень от слоя) */}
                    <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] md:w-[40vw] md:h-[40vw] rounded-full blur-[150px] opacity-10 pointer-events-none"
                        style={{ backgroundColor: layer.colorHex }}
                    />

                    <motion.div
                        initial={{ opacity: 0, y: 50 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className="z-10 w-full max-w-4xl flex flex-col items-center"
                    >
                        <h2
                            className="text-3xl md:text-5xl font-light mb-16 tracking-widest uppercase text-center"
                            style={{ color: layer.colorHex, textShadow: `0 0 20px ${layer.colorHex}66` }}
                        >
                            {layer.title}
                        </h2>

                        <div className="flex flex-col gap-6 w-full">
                            {layer.nodes.map(node => (
                                <ConceptNode
                                    key={node.id}
                                    node={node}
                                    isActive={activeNodeId === node.id}
                                    onClick={() => handleNodeClick(layer.id, node.id)}
                                    colorHex={layer.colorHex}
                                />
                            ))}
                        </div>
                    </motion.div>

                    {/* Разделитель между слоями */}
                    {index < LAYERS_DATA.length - 1 && (
                        <div className="absolute bottom-0 h-[20vh] w-[1px] bg-gradient-to-b from-transparent via-white/20 to-transparent" />
                    )}
                </div>
            ))}

            {/* Финальный блок */}
            <div className="min-h-[80vh] w-full flex flex-col items-center justify-center relative">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 2 }}
                    className="text-center"
                >
                    <h2 className="text-3xl md:text-4xl font-light tracking-widest text-white/90 mb-4">
                        Ты прошёл все слои реальности.
                    </h2>
                    <p className="text-xl font-light text-white/50 mb-12">
                        Теперь ты видишь структуру.
                    </p>

                    <button
                        onClick={onRestart}
                        className="px-8 py-3 border border-white/20 rounded-full uppercase tracking-widest text-sm text-white/80 hover:bg-white flex mx-auto hover:text-black transition-all duration-500 hover:shadow-[0_0_20px_rgba(255,255,255,0.8)]"
                    >
                        Начать заново
                    </button>
                </motion.div>
            </div>
        </div>
    );
}
