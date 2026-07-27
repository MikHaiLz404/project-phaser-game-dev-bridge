/**
 * Demo placeholder factory used until an img2threejs-generated asset is
 * dropped in. Matches the img2threejs factory contract:
 *
 *   export default function createDemoPropModel(spec, options) {
 *       return new THREE.Group(); // fully built
 *   }
 *
 * Replace this file with the output of `forge/stage3_build/generate_threejs_factory.py`
 * when you have a real CS2 knife (or any other object) to show in the 3D layer.
 */

import * as THREE from 'three';

export default function createDemoPropModel(spec = {}, options = {}) {
    const group = new THREE.Group();
    group.name = 'demo-prop';

    // A stylized "dagger" placeholder so the dev scene looks like something
    // a Three.js overlay would actually render. No PBR, no real materials —
    // just enough geometry to prove the layer is alive.
    const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 1.2, 0.05),
        new THREE.MeshStandardMaterial({ color: 0xc0c8d4, metalness: 0.9, roughness: 0.25 }),
    );
    blade.position.y = 0.4;
    blade.name = 'blade';
    group.add(blade);

    const crossguard = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.08, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x553311, metalness: 0.2, roughness: 0.7 }),
    );
    crossguard.position.y = -0.2;
    crossguard.name = 'crossguard';
    group.add(crossguard);

    const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12),
        new THREE.MeshStandardMaterial({ color: 0x4a3020, metalness: 0.1, roughness: 0.8 }),
    );
    handle.position.y = -0.4;
    handle.name = 'handle';
    group.add(handle);

    // Optional spec-driven transform — so the bridge skill demonstrates that
    // img2threejs `ObjectSculptSpec.position/rotation/scale` flow through.
    if (spec.position) group.position.set(spec.position.x ?? 0, spec.position.y ?? 0, spec.position.z ?? 0);
    if (spec.rotation) group.rotation.set(spec.rotation.x ?? 0, spec.rotation.y ?? 0, spec.rotation.z ?? 0);
    if (spec.scale) {
        const s = spec.scale;
        group.scale.set(s.x ?? 1, s.y ?? 1, s.z ?? 1);
    }

    return group;
}