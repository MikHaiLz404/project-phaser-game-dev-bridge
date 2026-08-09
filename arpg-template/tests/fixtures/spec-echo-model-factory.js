import * as THREE from 'three';

/**
 * Browser-test factory that makes its construction input observable in the
 * returned scene graph. Used to prove a fresh lifecycle does not inherit a
 * stale in-flight caller's spec.
 */
export default function createSpecEchoModel(spec = {}) {
    const group = new THREE.Group();
    group.name = `__spec_echo_${String(spec.variant ?? 'unset')}__`;
    return group;
}
