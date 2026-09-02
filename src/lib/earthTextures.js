import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Карты Земли из дистрибутива three.js: цвет поверхности (Blue Marble), рельеф,
 * маска воды (белое — океан), ночные огни (Black Marble) и облачный покров.
 */
export const EARTH_TEXTURE_PATHS = {
    day: '/textures/planets/earth_atmos_2048.jpg',
    bump: '/textures/planets/earth_normal_2048.jpg',
    water: '/textures/planets/earth_specular_2048.jpg',
    night: '/textures/planets/earth_lights_2048.png',
    clouds: '/textures/planets/earth_clouds_1024.png',
};

/**
 * Текстуры остаются в линейном цветовом пространстве: декодирование sRGB делает
 * сам шейдер, поэтому картинка не зависит от того, как драйвер трактует формат.
 */
export function useEarthTextures() {
    const textures = useTexture(EARTH_TEXTURE_PATHS);

    return useMemo(() => {
        Object.values(textures).forEach((tex) => {
            tex.colorSpace = THREE.LinearSRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            tex.anisotropy = 4;
            tex.needsUpdate = true;
        });
        return textures;
    }, [textures]);
}

useTexture.preload(Object.values(EARTH_TEXTURE_PATHS));
