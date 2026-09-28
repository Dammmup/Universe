import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Геометрия тела из Web Worker (lib/bodyMesh.worker.js). Кэшируется на всё
 * время жизни страницы: тело строится один раз, повторные визиты мгновенны.
 */

let worker = null;
const waiting = {};
const promises = {};
const geometries = {};

function toGeometry(data) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(data.normals, 3));
    g.setAttribute('aMuscle', new THREE.BufferAttribute(data.muscle, 2));
    g.setAttribute('aCenter', new THREE.BufferAttribute(data.centers, 3));
    g.setAttribute('aAxis', new THREE.BufferAttribute(data.axes, 3));
    g.setAttribute('aEdge', new THREE.BufferAttribute(data.edge, 1));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.computeBoundingSphere();
    return g;
}

/** Запускает построение заранее — вызывается при простое после загрузки. */
export function requestBodyMesh(variant) {
    if (promises[variant]) return promises[variant];
    if (!worker) {
        worker = new Worker(new URL('./bodyMesh.worker.js', import.meta.url), { type: 'module' });
        worker.onmessage = (event) => {
            const { variant: v } = event.data;
            geometries[v] = toGeometry(event.data);
            waiting[v]?.(geometries[v]);
        };
    }
    promises[variant] = new Promise((resolve) => {
        waiting[variant] = resolve;
        worker.postMessage({ variant });
    });
    return promises[variant];
}

/** Геометрия варианта тела или null, пока она строится. */
export function useBodyGeometry(variant) {
    const [geometry, setGeometry] = useState(() => geometries[variant] ?? null);
    useEffect(() => {
        let alive = true;
        requestBodyMesh(variant).then((g) => {
            if (alive) setGeometry(g);
        });
        return () => { alive = false; };
    }, [variant]);
    return geometry;
}
