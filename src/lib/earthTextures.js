import { useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { EARTH_TEXTURE_PATHS, TEXTURE_ANISOTROPY } from './quality';

/**
 * Карты Земли из дистрибутива three.js: цвет поверхности (Blue Marble), рельеф,
 * маска воды (белое — океан), ночные огни (Black Marble) и облачный покров.
 *
 * Пути и разрешение выбирает lib/quality.js: на слабой машине грузится
 * половинный набор. Сами карты пережаты в webp — scripts/textures.mjs,
 * исходники лежат в assets-src и в сборку не идут.
 */
export { EARTH_TEXTURE_PATHS };

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
            tex.anisotropy = TEXTURE_ANISOTROPY;
            tex.needsUpdate = true;
        });
        return textures;
    }, [textures]);
}

useTexture.preload(Object.values(EARTH_TEXTURE_PATHS));
