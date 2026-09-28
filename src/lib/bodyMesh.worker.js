import { buildBodyMesh } from './bodySdf';

/**
 * Построение тела из поля расстояний занимает около секунды на вариант:
 * в основном потоке это заморозило бы вуаль перехода, поэтому считаем здесь.
 */
self.onmessage = (event) => {
    const { variant } = event.data;
    const mesh = buildBodyMesh(variant);
    self.postMessage({ variant, ...mesh }, [
        mesh.positions.buffer, mesh.normals.buffer, mesh.muscle.buffer,
        mesh.centers.buffer, mesh.axes.buffer, mesh.edge.buffer, mesh.index.buffer,
    ]);
};
