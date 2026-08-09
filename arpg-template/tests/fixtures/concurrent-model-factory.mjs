import * as THREE from 'three';

globalThis.__modelLoaderConcurrentFixtureStarted = true;
await globalThis.__modelLoaderConcurrentGate;
export default function createConcurrentFixtureModel() {
    globalThis.__modelLoaderConcurrentFactoryCalls =
        (globalThis.__modelLoaderConcurrentFactoryCalls ?? 0) + 1;
    const group = new THREE.Group();
    group.name = '__concurrent_model_loader_fixture__';
    return group;
}
