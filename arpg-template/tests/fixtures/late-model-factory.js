import * as THREE from 'three';

/**
 * Browser-test-only model factory. The Playwright lifecycle suite delays its
 * module response until the scene that requested it has shut down.
 */
export default function createLateLifecycleModel() {
    const group = new THREE.Group();
    group.name = '__late_lifecycle_model__';
    return group;
}
