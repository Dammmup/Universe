import React from 'react';
import { useStore } from '../store';
import { Arctic, Desert, Jungle, Mountains, Ocean, Taiga } from './locations/NatureLocations';
import { Amsterdam, Cairo, Dubai, Mumbai, NewYork, Shenzhen, Tokyo } from './locations/CityLocations';

const SCENES = {
    jungle: Jungle,
    taiga: Taiga,
    desert: Desert,
    arctic: Arctic,
    ocean: Ocean,
    mountains: Mountains,
    tokyo: Tokyo,
    newyork: NewYork,
    dubai: Dubai,
    mumbai: Mumbai,
    amsterdam: Amsterdam,
    shenzhen: Shenzhen,
    cairo: Cairo,
};

/**
 * Диорама выбранной локации мезо-уровня. Сама смена накрыта вуалью
 * (store.enterLocation), поэтому сцена просто подменяется целиком: key
 * гарантирует, что прежняя местность размонтируется со всеми своими ресурсами.
 */
export default function Location() {
    const id = useStore((s) => s.location);
    const Scene = SCENES[id];
    if (!Scene) return null;
    return <Scene key={id} />;
}
