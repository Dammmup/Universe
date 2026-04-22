import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import { useStore } from './store';
import gsap from 'gsap';

const BigBang = lazy(() => import('./scenes/BigBang'));
const Cosmos = lazy(() => import('./scenes/Cosmos'));
const Planet = lazy(() => import('./scenes/Planet'));
const MicroCosmos = lazy(() => import('./scenes/MicroCosmos'));
const HumanBody = lazy(() => import('./scenes/HumanBody'));

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
    radiation: {
        name: 'Излучение',
        description: 'Потоки фотонов и заряженных частиц уходят от Солнца во все стороны, нагревая планеты и меняя химические реакции.',
        reverseName: 'Экранирование',
        reverseDescription: 'Магнитные поля, атмосферы и тени поглощают поток. Энергия не исчезает, но перестаёт достигать поверхности.',
        influence: 'Жизнь балансирует между полезным светом и разрушительной радиацией: без излучения нет энергии, без защиты нет устойчивых клеток.'
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
    language: {
        name: 'Язык',
        description: 'Символическая система связывает людей через время: просьбы, законы, песни, инструкции и мифы.',
        reverseName: 'Немота / Шум',
        reverseDescription: 'Общий код рушится. Слова перестают совпадать по смыслу, а договорённости превращаются в шум.',
        influence: 'Язык масштабирует мышление: идея может жить дольше тела и переходить между поколениями.'
    },
    law: {
        name: 'Право',
        description: 'Правила ограничивают силу, закрепляют ответственность и делают сотрудничество предсказуемым.',
        reverseName: 'Произвол',
        reverseDescription: 'Решает не принцип, а страх, статус или случай. Доверие исчезает быстрее, чем строится.',
        influence: 'Право — социальная нервная система: оно сообщает обществу, где проходит граница допустимого.'
    },
    education: {
        name: 'Образование',
        description: 'Передача навыков и моделей мира ускоряет развитие: ребёнку не нужно заново открывать огонь, письмо и математику.',
        reverseName: 'Невежество',
        reverseDescription: 'Знание не передаётся или искажается. Ошибки прошлого возвращаются как новые открытия.',
        influence: 'Образование превращает личный опыт в коллективный запас прочности.'
    },
    medicine: {
        name: 'Медицина',
        description: 'Диагностика, гигиена, лекарства и хирургия продлевают жизнь и уменьшают цену случайности.',
        reverseName: 'Эпидемия',
        reverseDescription: 'Защита слабеет. Болезнь становится социальной силой, меняя города, страхи и маршруты.',
        influence: 'Медицина соединяет биологию и культуру: забота становится технологией выживания.'
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
    },
    cellMembrane: {
        name: 'Клеточная мембрана',
        description: 'Полупроницаемая граница клетки: она решает, что войдёт, что выйдет и какие сигналы будут услышаны.',
        reverseName: 'Мембранная протечка',
        reverseDescription: 'Граница теряет избирательность. Ионы, токсины и сигналы смешиваются, клетка теряет устойчивость.',
        influence: 'Мембрана делает живую систему отдельной от среды, но не отрезанной от неё.'
    },
    dnaRepair: {
        name: 'Ремонт ДНК',
        description: 'Ферменты находят повреждения генетического текста и чинят их до того, как ошибка станет судьбой клетки.',
        reverseName: 'Накопление ошибок',
        reverseDescription: 'Повреждения пропускаются. Растёт риск дефектных белков, старения ткани и неконтролируемого деления.',
        influence: 'Жизнь держится не на идеальной точности, а на постоянном исправлении неизбежных ошибок.'
    },
    synapse: {
        name: 'Синапс',
        description: 'Место, где один нейрон передаёт сигнал другому через электрический импульс и химический выброс.',
        reverseName: 'Разрыв связи',
        reverseDescription: 'Сигнал не доходит или приходит искажённым. Сеть теряет связность, а мысль распадается на фрагменты.',
        influence: 'Синапсы превращают отдельные клетки в память, привычку, внимание и внутренний голос.'
    },
    neurotransmitter: {
        name: 'Нейромедиаторы',
        description: 'Химические посредники передают настроение, мотивацию, тревогу, удовольствие и торможение между нейронами.',
        reverseName: 'Химический шум',
        reverseDescription: 'Слишком много, слишком мало или не вовремя: сигнал становится туманным, а поведение — нестабильным.',
        influence: 'Сознание имеет химическую погоду: даже мысль зависит от концентрации молекул в синапсе.'
    },
    myelin: {
        name: 'Миелин',
        description: 'Жировая изоляция аксона ускоряет нервные импульсы и защищает дальнюю передачу сигнала.',
        reverseName: 'Демиелинизация',
        reverseDescription: 'Изоляция разрушается. Сигнал замедляется, сбивается или гаснет до того, как достигнет цели.',
        influence: 'Скорость реакции, координация и ясность сети зависят от качества этой биологической изоляции.'
    },
    mitochondria: {
        name: 'Митохондрии',
        description: 'Внутренние энергетические станции клетки производят АТФ, питающий движение, ремонт и мышление.',
        reverseName: 'Энергетический провал',
        reverseDescription: 'Клетка не получает достаточно энергии. Ремонт, иммунитет и нервная активность переходят в экономный режим.',
        influence: 'Большая часть сложной жизни стала возможна после симбиоза с митохондриями.'
    },
    proteinSynthesis: {
        name: 'Сборка белка',
        description: 'Рибосомы читают инструкции РНК и собирают белки — рабочие формы тела, ферментов и рецепторов.',
        reverseName: 'Дефект сворачивания',
        reverseDescription: 'Белок собран или сложен неверно. Молекула не выполняет функцию и может отравлять клетку.',
        influence: 'Гены важны потому, что становятся белками: структура превращается в действие.'
    },
    attention: {
        name: 'Внимание',
        description: 'Нервная система усиливает одни сигналы и приглушает другие, собирая мир в управляемый фокус.',
        reverseName: 'Расфокус',
        reverseDescription: 'Стимулы конкурируют без отбора. Сознание скользит по поверхности и быстро теряет направление.',
        influence: 'Внимание — узкое горлышко реальности: через него бесконечный поток становится опытом.'
    },
    dreaming: {
        name: 'Сновидение',
        description: 'Мозг комбинирует память, эмоции и прогнозы в ночные образы, проверяя внутренние модели мира.',
        reverseName: 'Пустой сон',
        reverseDescription: 'Образность исчезает или не запоминается. Восстановление остаётся, но символическая переработка слабеет.',
        influence: 'Сновидения показывают, что реальность внутри человека умеет строить миры без внешнего света.'
    },

    // Stage 5: Человек, тело и эмоции
    circulation: {
        name: 'Кровообращение',
        description: 'Сердце прокачивает кровь по артериям и венам, доставляя кислород, тепло, гормоны и иммунные клетки.',
        reverseName: 'Ишемия',
        reverseDescription: 'Поток перекрыт. Ткани остаются без кислорода, клетки переходят в аварийный режим и начинают погибать.',
        influence: 'Циркуляция превращает тело из набора органов в единую систему распределения энергии.'
    },
    breathing: {
        name: 'Дыхание',
        description: 'Лёгкие обменивают кислород и CO₂, связывая внутренний метаболизм с атмосферой планеты.',
        reverseName: 'Гипоксия',
        reverseDescription: 'Кислорода не хватает. Сознание мутнеет, мышцы слабеют, сердце ускоряется, пытаясь компенсировать дефицит.',
        influence: 'Каждый вдох — договор между телом и средой: клеткам нужен кислород, миру нужен выдохнутый углерод.'
    },
    memory: {
        name: 'Память',
        description: 'Нейронные связи удерживают опыт, язык, лица, опасности и путь домой.',
        reverseName: 'Амнезия',
        reverseDescription: 'Связи распадаются. События теряют контекст, а личность лишается внутренней истории.',
        influence: 'Память делает время личным: прошлое продолжает действовать внутри настоящего.'
    },
    emotion: {
        name: 'Эмоция',
        description: 'Радость, страх, гнев и печаль быстро размечают мир значимостью до того, как разум всё объяснит.',
        reverseName: 'Эмоциональное онемение',
        reverseDescription: 'Сигналы приглушены. Мир остаётся понятным, но теряет вес, цвет и внутреннее притяжение.',
        influence: 'Эмоции — не шум, а система приоритетов: они говорят телу, что важно прямо сейчас.'
    },
    stress: {
        name: 'Стресс',
        description: 'Симпатическая система мобилизует тело: пульс растёт, кровь уходит к мышцам, внимание сужается.',
        reverseName: 'Восстановление',
        reverseDescription: 'Парасимпатическая система возвращает дыхание, пищеварение, сон и способность чувствовать нюансы.',
        influence: 'Стресс спасает в угрозе, но разрушает при бесконечном включении.'
    },
    immunity: {
        name: 'Иммунитет',
        description: 'Клетки защиты отличают своё от чужого, запоминают вторжения и ремонтируют повреждения.',
        reverseName: 'Аутоиммунность',
        reverseDescription: 'Система распознавания ошибается и атакует собственные ткани как врага.',
        influence: 'Иммунитет — это граница личности на биологическом уровне.'
    },
    digestion: {
        name: 'Обмен веществ',
        description: 'Пища разбирается на молекулы, превращаясь в энергию, ткань, тепло и химические сигналы.',
        reverseName: 'Токсичность',
        reverseDescription: 'Баланс нарушен: избыток, дефицит или яд перегружают печень, кишечник и энергетические циклы.',
        influence: 'Метаболизм связывает выбор, среду и тело: то, что вошло извне, становится нами.'
    },
    movement: {
        name: 'Движение',
        description: 'Мышцы и суставы превращают намерение в действие: шаг, жест, бегство, объятие, труд.',
        reverseName: 'Паралич',
        reverseDescription: 'Сигнал не доходит или ткань не отвечает. Намерение остаётся внутри, не становясь движением.',
        influence: 'Движение — язык тела, через который сознание меняет внешний мир.'
    },
    empathy: {
        name: 'Эмпатия',
        description: 'Мозг моделирует состояние другого человека, позволяя чувствовать боль, радость и намерение не только своё.',
        reverseName: 'Отчуждение',
        reverseDescription: 'Другой превращается в объект или угрозу. Связь рвётся, даже если люди стоят рядом.',
        influence: 'Эмпатия делает общество возможным: она соединяет нервные системы без проводов.'
    },
    hormones: {
        name: 'Гормоны',
        description: 'Эндокринная система рассылает химические команды: рост, голод, либидо, тревогу, привязанность и сон.',
        reverseName: 'Дисрегуляция',
        reverseDescription: 'Сигналы становятся слишком сильными, слабыми или несвоевременными. Тело спорит само с собой.',
        influence: 'Гормоны — медленная внутренняя сеть связи, которая меняет настроение и поведение через химию.'
    },
    pain: {
        name: 'Боль',
        description: 'Сигнал повреждения заставляет тело защищаться, менять позу, отступать и учиться осторожности.',
        reverseName: 'Анестезия',
        reverseDescription: 'Сигнал приглушён. Становится легче, но граница повреждения больше не предупреждает сознание.',
        influence: 'Боль неприятна, потому что она должна быть услышана быстрее любых мыслей.'
    },
    sleep: {
        name: 'Сон',
        description: 'Мозг очищает метаболический шум, укрепляет память и восстанавливает эмоциональную устойчивость.',
        reverseName: 'Бессонница',
        reverseDescription: 'Восстановление не включается. Внимание, иммунитет и настроение постепенно теряют устойчивость.',
        influence: 'Сон — не пауза в жизни, а ночная сборка личности и тела.'
    },
    thermoregulation: {
        name: 'Терморегуляция',
        description: 'Сосуды, кожа, пот и дрожь удерживают внутреннюю температуру в узком коридоре жизни.',
        reverseName: 'Перегрев / Озноб',
        reverseDescription: 'Коридор нарушен: ферменты работают хуже, сердце ускоряется, сознание становится уязвимым.',
        influence: 'Человек живёт не при любой температуре, а внутри тонко настроенного теплового режима.'
    },
    identity: {
        name: 'Идентичность',
        description: 'Память, тело, отношения и выбор собираются в ощущение “я”: непрерывного субъекта опыта.',
        reverseName: 'Диссоциация',
        reverseDescription: 'Связность ослабевает. Тело, эмоции и история могут переживаться как чужие или разорванные.',
        influence: 'Идентичность — самая хрупкая и самая глубокая интеграция человеческой реальности.'
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
                camera.position.z = 35;
                gsap.to(camera.position, { z: 12, duration: 1.5, ease: "power2.out" });
            } else if (stage === 3 && prevStageRef.current === 4) {
                // Возврат из микрокосмоса на планету
                camera.position.z = 10;
                gsap.to(camera.position, { z: 15, duration: 1.5, ease: "power2.out" });
            } else if (stage === 5 && prevStageRef.current === 4) {
                camera.position.set(0, 0, 12);
                gsap.to(camera.position, { z: 10, duration: 1.4, ease: "power2.out" });
            } else if (stage === 4 && prevStageRef.current === 5) {
                camera.position.set(0, 0, 18);
                gsap.to(camera.position, { z: 12, duration: 1.2, ease: "power2.out" });
            }
        }
        prevStageRef.current = stage;
    }, [stage, camera]);

    return null;
}

export default function App() {
    const { stage, isExploded, activeFactorId, reversedFactors, toggleReverse, clearFactor, resetJourney, nextStage } = useStore();
    const [humanLayer, setHumanLayer] = useState('organs');
    const isReversed = reversedFactors[activeFactorId] || false;

    useEffect(() => {
        let isScrolling = false;
        let scrollTimer = null;
        const handleWheel = (e) => {
            // Если зажат Ctrl/Cmd — это pinch-zoom браузера или OrbitControls zoom, игнорируем
            if (e.ctrlKey || e.metaKey) return;

            const state = useStore.getState();

            // На микро-уровне колесо чаще нужно для приближения факторов, поэтому переход вынесен в кнопку.
            const threshold = state.stage === 4 ? 320 : (state.stage >= 1 ? 80 : 5);
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

            scrollTimer = setTimeout(() => { isScrolling = false; }, 1200);
        };

        window.addEventListener('wheel', handleWheel, { passive: true });
        return () => {
            window.removeEventListener('wheel', handleWheel);
            if (scrollTimer) clearTimeout(scrollTimer);
        };
    }, []);

    return (
        <div className={`relative w-screen h-screen overflow-hidden font-sans transition-colors duration-500 ${stage === 5 ? 'bg-white text-slate-950' : 'bg-black text-white'}`}>

            {/* 3D Canvas */}
            <div className="absolute inset-0">
                <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 2]}>
                    <color attach="background" args={[stage === 5 ? '#ffffff' : '#000000']} />

                    <CameraTransition />

                    {/* Управление камерой — начиная с Космоса (stage >= 1) */}
                    {isExploded && stage >= 1 && (
                        <OrbitControls
                            key={stage}
                            enableZoom={true}
                            enablePan={false}
                            zoomSpeed={stage === 4 ? 1.05 : 0.6}
                            minDistance={stage === 4 ? 1.4 : 5}
                            maxDistance={stage === 4 ? 80 : 200}
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
                        {stage === 5 && <HumanBody mode={humanLayer} />}
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
                        <p className="text-xs text-white/40 mb-4 font-light">
                            Внутри клеток и синапсов. Колесо мыши приближает факторы.
                        </p>
                        <button
                            onClick={nextStage}
                            className="px-5 py-2 border border-fuchsia-300/40 rounded-full text-xs uppercase tracking-wider text-fuchsia-100 hover:bg-fuchsia-300 hover:text-black transition-colors"
                        >
                            К человеку
                        </button>
                    </div>
                )}
                {stage === 5 && (
                    <div className="text-slate-700 animate-fade-in relative z-50 pointer-events-auto">
                        <p className="tracking-widest uppercase text-sm mb-2 text-rose-600">
                            Антропо-уровень: Тело, Эмоции, Личность
                        </p>
                        <div className="inline-flex items-center gap-1 p-1 mb-4 rounded-full border border-slate-300 bg-white/75 shadow-sm backdrop-blur-md">
                            <button
                                onClick={() => setHumanLayer('organs')}
                                className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider transition-colors ${humanLayer === 'organs' ? 'bg-cyan-500 text-white' : 'text-slate-500 hover:text-slate-950'}`}
                            >
                                Органы
                            </button>
                            <button
                                onClick={() => setHumanLayer('emotions')}
                                className={`px-4 py-1.5 rounded-full text-[11px] uppercase tracking-wider transition-colors ${humanLayer === 'emotions' ? 'bg-rose-500 text-white' : 'text-slate-500 hover:text-slate-950'}`}
                            >
                                Эмоции
                            </button>
                        </div>
                        <button
                            onClick={resetJourney}
                            className="px-6 py-2 border border-slate-300 rounded-full text-xs uppercase tracking-wider text-slate-600 hover:bg-slate-950 hover:text-white transition-colors"
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
