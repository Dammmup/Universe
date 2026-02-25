import React, { Suspense, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useStore } from './store';
import gsap from 'gsap';

import BigBang from './scenes/BigBang';
import Cosmos from './scenes/Cosmos';
import Planet from './scenes/Planet';
import MicroCosmos from './scenes/MicroCosmos';

const FACTORS_DATA = {
    // Stage 1: Макрокосмос
    acceleration: {
        name: 'Ускорение',
        description: 'Стремительное расширение пространства, раздвигающее материю по всем осям.',
        reverseName: 'Замедление',
        reverseDescription: 'Постепенная остановка, остывание пространства, энтропийный коллапс.',
        influence: 'Темная энергия стимулирует ускорение, а масса (гравитация) сопротивляется ему.'
    },
    gravity: {
        name: 'Тяжесть / Гравитация',
        description: 'Стягивание материи в сложные структуры: звезды, планеты, галактики.',
        reverseName: 'Распад / Отторжение',
        reverseDescription: 'Отсутствие центров притяжения, хаотичное и бесконечное блуждание газа и пыли.',
        influence: 'Эффект возникает из-за массы, искривляющей саму ткань пространства-времени.'
    },
    sun: {
        name: 'Солнце / Излучение',
        description: 'Термоядерный реактор, питающий светом и теплом всю солнечную систему.',
        reverseName: 'Угасание',
        reverseDescription: 'Красный гигант коллапсирует в белый карлик. Свет гаснет, орбиты замерзают.',
        influence: 'Водород сливается в гелий, высвобождая энергию, которая поддерживает жизнь на 8 планетах.'
    },
    heating: {
        name: 'Нагревание',
        description: 'Меркурий — ближайший к Солнцу. Поверхность раскалена до 430°C. Фотонный шторм выжигает всё живое без остатка.',
        reverseName: 'Остывание',
        reverseDescription: 'Ночная сторона Меркурия опускается до -180°C. Экстремальный перепад за один оборот.',
        influence: 'Расстояние от звездой — главный регулятор теплового баланса планеты.'
    },
    freezing: {
        name: 'Замерзание',
        description: 'Марс — красная пустыня на краю обитаемой зоны. Средняя температура -63°C, CO₂ замерзает в полярных шапках.',
        reverseName: 'Оттепель',
        reverseDescription: 'Терраформирование: растопить полярные шапки CO₂ и запустить парниковый эффект.',
        influence: 'Разреженная атмосфера Марса не удерживает тепло — барьер для колонизации.'
    },
    void: {
        name: 'Пустота',
        description: 'Межзвёздная пустота — 99.9% объёма Вселенной. Вакуум кипит виртуальными частицами.',
        reverseName: 'Избыток',
        reverseDescription: 'Скопления материи: звёздные кластеры, туманности — сверхплотные очаги рождения миров.',
        influence: 'Пустота и избыток материи — два полюса структуры Вселенной.'
    },
    infinity: {
        name: 'Бесконечность',
        description: 'Вселенная расширяется быстрее скорости света. Горизонт событий скрывает от нас остальное.',
        reverseName: 'Ограниченность',
        reverseDescription: 'Замкнутая Вселенная: конечный объём пространства, искривлённого обратно в себя.',
        influence: 'Топология пространства определяет, конечна ли Вселенная.'
    },
    symbiosis: {
        name: 'Симбиоз',
        description: 'Сетевая кооперация, создающая обоюдную выгоду и усложняющая форму жизни.',
        reverseName: 'Паразитизм',
        reverseDescription: 'Одностороннее выкачивание ресурсов, ведущее к истощению донора и стагнации.',
        influence: 'Эволюционное давление вознаграждает тех, кто объединяет усилия.'
    },
    tides: {
        name: 'Приливы',
        description: 'Гравитация Луны деформирует оболочку Земли. Приливные волны охватывают океаны.',
        reverseName: 'Отливы',
        reverseDescription: 'Лунная гравитация ослабевает — воды возвращаются, обнажая дно.',
        influence: 'Луна удаляется от Земли на 3.8 см в год. Приливы замедляют вращение Земли.'
    },
    moonlight: {
        name: 'Отражение',
        description: 'Луна отражает 12% солнечного света обратно на Землю.',
        reverseName: 'Поглощение',
        reverseDescription: 'Тёмная сторона Луны поглощает свет полностью. Абсолютная тьма.',
        influence: 'Лунный цикл синхронизирован с биологическими ритмами.'
    },

    // Stage 2: Природа и Стихии
    ocean: {
        name: 'Океан',
        description: 'Мировой океан покрывает 71% поверхности Земли. Колыбель жизни, регулятор климата, хранилище кислорода.',
        reverseName: 'Засуха',
        reverseDescription: 'Испарение без восполнения. Моря мелеют, дно трескается, жизнь отступает к полюсам.',
        influence: 'Вода — идеальный растворитель. Без жидкой фазы химия жизни невозможна.'
    },
    tectonics: {
        name: 'Дрейф континентов',
        description: 'Литосферные плиты медленно скользят по раскалённой мантии, сталкиваясь и воздвигая горные цепи.',
        reverseName: 'Землетрясения',
        reverseDescription: 'Резкий сброс напряжения: трещины разрывают сушу, меняя ландшафты за секунды.',
        influence: 'Движение плит обновляет поверхность планеты и регулирует углеродный цикл на миллионы лет.'
    },
    photosynthesis: {
        name: 'Фотосинтез',
        description: 'Хлорофилл захватывает фотоны Солнца, превращая CO₂ и воду в сахара и кислород.',
        reverseName: 'Увядание',
        reverseDescription: 'Без света хлорофилл распадается: леса буреют, кислородная атмосфера истощается.',
        influence: 'Фундамент пищевой цепи и главный генератор кислородной атмосферы Земли.'
    },
    wildlife: {
        name: 'Биосфера',
        description: 'Экосистема животных: от микроорганизмов до крупных хищников. Цепи питания удерживают равновесие.',
        reverseName: 'Вымирание',
        reverseDescription: 'Разрыв пищевых цепей. Виды исчезают быстрее, чем возникают. Тишина там, где была жизнь.',
        influence: 'Биоразнообразие — буфер устойчивости экосистемы против внешних потрясений.'
    },
    migration: {
        name: 'Миграция',
        description: 'Тысячи видов следуют древним маршрутам, перенося семена, опыляя растения и балансируя экосистемы.',
        reverseName: 'Рассеивание',
        reverseDescription: 'Стаи распадаются. Инстинкт навигации утрачен. Хаотичное блуждание без цели.',
        influence: 'Массовые перелёты формировались миллионы лет под давлением климата и магнитного поля Земли.'
    },
    atmosphere: {
        name: 'Атмосфера',
        description: 'Газовая оболочка защищает от радиации, удерживает тепло и несёт облака по континентам.',
        reverseName: 'Опустынивание',
        reverseDescription: 'Атмосфера теряет влагу. Ветра несут пыль. Зелёные пояса превращаются в пустыни.',
        influence: 'Состав атмосферы менялся трижды за историю Земли — каждый раз перезапуская эволюцию.'
    },
    aurora: {
        name: 'Полярное сияние',
        description: 'Солнечный ветер взаимодействует с магнитным полем Земли, зажигая ионы атмосферы в полярных кольцах.',
        reverseName: 'Затухание',
        reverseDescription: 'Магнитное поле слабеет. Солнечный ветер проникает глубже, срывая атмосферные слои.',
        influence: 'Магнитное поле — невидимый щит, без которого Земля превратилась бы в Марс.'
    },
    dayNight: {
        name: 'День',
        description: 'Суточное вращение создаёт ритм света и тьмы, которому подчинены все живые существа на Земле.',
        reverseName: 'Ночь',
        reverseDescription: 'Темнота активирует ночных хищников, замедляет метаболизм, запускает восстановление.',
        influence: 'Циркадные ритмы закодированы в геноме всех сложных организмов за 700 млн лет.'
    },
    sunEnergy: {
        name: 'Солнечная энергия',
        description: 'Термоядерный реактор в центре системы. Каждую секунду Солнце сжигает 600 млн тонн водорода.',
        reverseName: 'Угасание Солнца',
        reverseDescription: 'Красный гигант раздувается, поглощая внутренние планеты. Потом — белый карлик и тишина.',
        influence: 'Через 5 млрд лет Солнце исчерпает водород. До этого у жизни есть время.'
    },
    moonPhase: {
        name: 'Луна',
        description: 'Ближайший спутник стабилизирует ось Земли, создаёт приливы и освещает ночь отражённым светом.',
        reverseName: 'Тьма',
        reverseDescription: 'Новолуние. Тёмная сторона поглощает свет. Морские организмы теряют ориентацию.',
        influence: 'Без Луны ось Земли хаотично качалась бы — климат стал бы непредсказуемым.'
    },
    starField: {
        name: 'Звёздное небо',
        description: 'Ночное небо — карта 400 млрд звёзд нашей галактики. Ориентир для мореплавателей и миграций.',
        reverseName: 'Световой туман',
        reverseDescription: 'Свет городов заглушает звёзды. 80% человечества никогда не видело Млечного Пути.',
        influence: 'Созерцание звёздного неба запустило астрономию, навигацию и философию в каждой цивилизации.'
    },
    interference: {
        name: 'Интерференция',
        description: 'Волновые поля взаимодействуют: усиление в узлах, гашение в пучностях. Паттерн сложнее суммы частей.',
        reverseName: 'Изоляция',
        reverseDescription: 'Каждое поле существует отдельно. Без взаимодействия нет структуры, только шум.',
        influence: 'Квантовая интерференция лежит в основе химических связей и работы ферментов жизни.'
    },

    // Stage 3: Общество и Цивилизация
    war: {
        name: 'Война',
        description: 'Радикальный, деструктивный инструмент перераспределения ограниченных ресурсов между группами.',
        reverseName: 'Мир / Интеграция',
        reverseDescription: 'Долгий процесс создания общих ценностей и безопасного обмена ресурсами без потерь.',
        influence: 'Срабатывает при критической нехватке ресурсов или экзистенциальном страхе популяции.'
    },
    progress: {
        name: 'Технологический прогресс',
        description: 'Экспоненциальное усложнение инструментов: от каменного рубила до квантовых компьютеров.',
        reverseName: 'Стагнация / Регресс',
        reverseDescription: 'Руины прежних эпох зарастают. Знания теряются. Цивилизация откатывается к прошлому.',
        influence: 'Каждое поколение строит на знаниях предыдущего — главный двигатель человеческой исключительности.'
    },
    ecology: {
        name: 'Индустриализация',
        description: 'Высвобождение энергии угля, нефти и атома питает мегаполисы и заводы любой ценой.',
        reverseName: 'Экологический баланс',
        reverseDescription: 'Города интегрируются в природный ландшафт. Возобновляемые источники заменяют ископаемое топливо.',
        influence: 'Промышленный CO₂ меняет климат всей планеты — геологический след человека.'
    },
    urbanization: {
        name: 'Урбанизация',
        description: 'Мегаполисы стягивают население планеты. 56% людей живут в городах, к 2050 будет 68%.',
        reverseName: 'Упадок городов',
        reverseDescription: 'Города пустеют. Природа возвращает улицы. Цивилизация рассыпается на изолированные общины.',
        influence: 'Концентрация людей ускоряет обмен идеями — города производят непропорционально много инноваций.'
    },
    trade: {
        name: 'Торговля',
        description: 'Обмен товарами, идеями и культурами по торговым путям соединяет цивилизации в единую сеть.',
        reverseName: 'Изоляционизм',
        reverseDescription: 'Закрытые границы. Технологии и культура развиваются независимо — медленнее и однообразнее.',
        influence: 'Великий шёлковый путь, специи, порох, бумага — всё это распространилось через торговые сети.'
    },
    culture: {
        name: 'Культура',
        description: 'Накопленная память цивилизации: искусство, язык, ритуалы — то, что передаётся без генов.',
        reverseName: 'Варварство',
        reverseDescription: 'Разрыв культурной преемственности. Без памяти — каждое поколение начинает с нуля.',
        influence: 'Культурная эволюция в тысячи раз быстрее биологической — новый вид адаптации.'
    },
    energy: {
        name: 'Энергия',
        description: 'Доступ к дешёвой энергии — основа любой цивилизации. Каждый скачок энергии = новая эпоха.',
        reverseName: 'Энергетическое истощение',
        reverseDescription: 'Ресурсы иссякают. Без энергии останавливаются заводы, города, связь. Возврат к ручному труду.',
        influence: 'Переход от биомассы к углю поднял производительность в 10 раз. Каждый следующий переход — ещё больше.'
    },

    // Stage 4: Микрокосмос
    interferenceNeuro: {
        name: 'Нейро-интерференция',
        description: 'Нейронные волны накладываются, создавая сложные паттерны сознания — мысли, образы, ощущения.',
        reverseName: 'Нейро-изоляция',
        reverseDescription: 'Нейроны перестают общаться. Сознание фрагментируется, теряя связность и смысл.',
        influence: 'Основа квантовых переходов в синапсах и формирования сложных когнитивных структур.'
    },
    dominanta: {
        name: 'Доминанта',
        description: 'Устойчивый очаг возбуждения в нейросети, подчиняющий себе остальные импульсы.',
        reverseName: 'Рассеянность',
        reverseDescription: 'Равноценный шум всех сигналов, не позволяющий сфокусировать энергию.',
        influence: 'Формируется под воздействием сильных биологических или психологических потребностей.'
    },
    abstraction: {
        name: 'Абстракция',
        description: 'Способность интеллекта отрывать свойства объектов от их физической, буквальной формы.',
        reverseName: 'Буквальность',
        reverseDescription: 'Строгая привязка мыслей только к текущей сенсорной реальности ("здесь и сейчас").',
        influence: 'Возникла благодаря развитию коры мозга для решения сложных многоходовых задач.'
    },
    mutation: {
        name: 'Мутация',
        description: 'Случайное изменение генетического кода, порождающее новые формы и свойства.',
        reverseName: 'Стагнация (Био)',
        reverseDescription: 'Генетическая неизменность: популяция теряет способность адаптироваться к новым условиям.',
        influence: 'Ошибки копирования ДНК — двигатель эволюции.'
    }
};

// Компонент для плавной транзиции камеры (GSAP)
function CameraTransition() {
    const { stage } = useStore();
    const { camera } = useThree();
    const prevStageRef = useRef(stage);

    useEffect(() => {
        if (stage !== prevStageRef.current) {
            gsap.killTweensOf(camera.position);

            if (prevStageRef.current === 0 && stage === 1) {
                // BigBang → Cosmos
                gsap.to(camera.position, {
                    z: 25,
                    duration: 1.2,
                    ease: "power2.out"
                });
            } else if (stage === 2 && prevStageRef.current === 1) {
                // Входим на планету (Мезо-уровень)
                gsap.to(camera.position, {
                    z: 15,
                    duration: 1.5,
                    ease: "power2.inOut"
                });
            } else if (stage === 1 && prevStageRef.current === 2) {
                // Выходим с планеты
                gsap.to(camera.position, {
                    z: 25,
                    duration: 1.2,
                    ease: "power2.inOut"
                });
            } else if (stage === 4 && prevStageRef.current === 3) {
                // Входим в микрокосмос
                camera.position.z = 80;
                gsap.to(camera.position, { z: 25, duration: 1.5, ease: "power2.out" });
            } else if (stage === 3 && prevStageRef.current === 4) {
                // Возврат из микрокосмоса на планету
                camera.position.z = 10;
                gsap.to(camera.position, { z: 15, duration: 1.5, ease: "power2.out" });
            }
        }
        prevStageRef.current = stage;
    }, [stage, camera]);

    return null;
}

export default function App() {
    const { stage, isExploded, activeFactorId, reversedFactors, toggleReverse, clearFactor } = useStore();
    const isReversed = reversedFactors[activeFactorId] || false;

    useEffect(() => {
        let isScrolling = false;
        const handleWheel = (e) => {
            // Если зажат Ctrl/Cmd — это pinch-zoom браузера или OrbitControls zoom, игнорируем
            if (e.ctrlKey || e.metaKey) return;

            const state = useStore.getState();

            // На stage >= 1 реагируем только на крупный скролл (deltaY > 80) чтобы не мешать zoom
            const threshold = state.stage >= 1 ? 80 : 5;
            if (Math.abs(e.deltaY) < threshold) return;

            if (isScrolling) return;
            isScrolling = true;

            if (e.deltaY > 0) {
                if (state.stage === 0 && !state.isExploded) {
                    state.triggerBang();
                } else {
                    state.nextStage();
                }
            } else if (e.deltaY < 0) {
                state.prevStage();
            }

            setTimeout(() => { isScrolling = false; }, 1200);
        };

        window.addEventListener('wheel', handleWheel, { passive: true });
        return () => window.removeEventListener('wheel', handleWheel);
    }, []);

    return (
        <div className="relative w-screen h-screen bg-black overflow-hidden font-sans text-white">

            {/* 3D Canvas */}
            <div className="absolute inset-0">
                <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 2]}>
                    <color attach="background" args={['#000000']} />

                    <CameraTransition />

                    {/* Управление камерой — начиная с Космоса (stage >= 1) */}
                    {isExploded && stage >= 1 && (
                        <OrbitControls
                            key={stage}
                            enableZoom={true}
                            enablePan={false}
                            zoomSpeed={0.6}
                            minDistance={5}
                            maxDistance={200}
                            dampingFactor={0.08}
                            enableDamping
                            target={[0, 0, 0]}
                            makeDefault
                        />
                    )}

                    <Suspense fallback={
                        <Html center>
                            <div className="flex flex-col items-center justify-center text-white">
                                <div className="w-8 h-8 border-4 border-fuchsia-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                <p className="tracking-[0.2em] uppercase text-xs animate-pulse text-white/70">Загрузка материи...</p>
                            </div>
                        </Html>
                    }>
                        {stage === 0 && <BigBang />}
                        {stage === 1 && <Cosmos />}
                        {(stage === 2 || stage === 3) && <Planet />}
                        {stage === 4 && <MicroCosmos />}
                    </Suspense>

                </Canvas>
            </div>

            {/* UI Overlay */}
            <div className="absolute bottom-10 w-full text-center pointer-events-none data-ui">
                {!isExploded && (
                    <p className="text-white/50 tracking-[0.3em] uppercase text-xs animate-pulse">
                        Скролль вниз для старта
                    </p>
                )}
                {stage === 1 && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2">Макрокосмос</p>
                        <p className="text-xs text-white/50">Вращай камеру, кликай на объекты. Скролль дальше.</p>
                    </div>
                )}
                {stage === 2 && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2">
                            Мезо-уровень 1: Природа и Стихии
                        </p>
                        <p className="text-xs text-white/40">Океан и континенты. Вращайте планету и изучайте факторы.</p>
                    </div>
                )}
                {stage === 3 && (
                    <div className="text-white/70 animate-fade-in relative z-50">
                        <p className="tracking-widest uppercase text-sm mb-2 text-yellow-500">
                            Мезо-уровень 2: Общество и Цивилизация
                        </p>
                        <p className="text-xs text-white/40">Эпохи Мегаполиса. Развитие, экология и конфликты.</p>
                    </div>
                )}
                {stage === 4 && (
                    <div className="text-white/70 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-sm mb-2 text-fuchsia-400">
                            Микро-уровень: Рождение Сознания
                        </p>
                        <p className="text-xs text-white/40 mb-6 font-light">
                            Внутри клеток и синапсов. Изучай. Скролль вверх для возврата.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 border border-white/20 rounded-full text-xs uppercase tracking-wider hover:bg-white hover:text-black transition-colors"
                        >
                            Пройти путь снова
                        </button>
                    </div>
                )}
            </div>

            {/* Factor Tooltip Modal */}
            {activeFactorId && FACTORS_DATA[activeFactorId] && (
                <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/85 border border-white/20 p-8 rounded-2xl max-w-lg z-[100] text-left pointer-events-auto backdrop-blur-md shadow-[0_0_50px_rgba(255,255,255,0.1)] transition-all animate-fade-in flex flex-col gap-4">

                    <h3 className={`text-2xl font-bold uppercase tracking-widest ${isReversed ? 'text-cyan-400' : 'text-fuchsia-400'}`}>
                        {isReversed ? FACTORS_DATA[activeFactorId].reverseName : FACTORS_DATA[activeFactorId].name}
                    </h3>

                    <p className="text-base text-white/90 leading-relaxed">
                        {isReversed ? FACTORS_DATA[activeFactorId].reverseDescription : FACTORS_DATA[activeFactorId].description}
                    </p>

                    <div className="bg-white/5 p-4 rounded-lg border border-white/10 mt-2">
                        <span className="text-xs text-white/50 uppercase tracking-wider block mb-1">Природа фактора:</span>
                        <p className="text-sm text-yellow-100/80 italic">
                            {FACTORS_DATA[activeFactorId].influence}
                        </p>
                    </div>

                    <div className="flex justify-between items-center border-t border-white/20 pt-5 mt-2">
                        <button
                            onClick={toggleReverse}
                            className={`text-sm font-bold uppercase tracking-widest transition-colors px-4 py-2 rounded border ${isReversed ? 'border-fuchsia-400 text-fuchsia-400 hover:bg-fuchsia-400 hover:text-black' : 'border-cyan-400 text-cyan-400 hover:bg-cyan-400 hover:text-black'}`}
                        >
                            Включить {isReversed ? FACTORS_DATA[activeFactorId].name : FACTORS_DATA[activeFactorId].reverseName}
                        </button>
                        <button
                            onClick={clearFactor}
                            className="text-sm text-white/50 hover:text-white uppercase tracking-widest transition-colors px-4 py-2"
                        >
                            Закрыть
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
}
