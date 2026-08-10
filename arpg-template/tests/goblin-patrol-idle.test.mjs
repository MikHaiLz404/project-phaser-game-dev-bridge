import assert from 'node:assert/strict';
import * as THREE from 'three';
import createGoblins from '../src/threejs/models/createGoblin.js';

const originalRandom = Math.random;
const originalPerformanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
let nowSeconds = 10;

Math.random = () => 0;
Object.defineProperty(globalThis, 'performance', {
    configurable: true,
    value: { now: () => nowSeconds * 1000 },
});

const playerRef = { position: new THREE.Vector3(100, -1, 100) };
const controller = createGoblins({
    count: 1,
    bounds: { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
    playerRef,
});

// Three.js constructors consume Math.random() while creating UUIDs, so install
// the behavioral sequence only after the goblin graph has been constructed.
const randomValues = [
    0.5,           // 2.1-second patrol pause
    1, 0.5,        // next waypoint: (10, 5)
];
Math.random = () => randomValues.shift() ?? 0.25;

try {
    const goblin = controller.goblins[0];

    // The spawn point is the first patrol waypoint, so this update deterministically
    // reaches it, schedules a pause, and selects the next waypoint.
    controller.update(0.1);

    const idleDuration = goblin.idleUntil - nowSeconds;
    assert.ok(
        idleDuration >= 1.2 && idleDuration <= 3.0,
        `waypoint pause must remain configured for 1.2-3.0s; got ${idleDuration}s`,
    );
    assert.equal(goblin.target.x, 10, 'next patrol waypoint x should be deterministic');
    assert.equal(goblin.target.z, 5, 'next patrol waypoint z should be deterministic');

    nowSeconds = 11;
    // "Stationary" means no planar locomotion; the intentional visual y-sway remains active.
    const idlePosition = goblin.mesh.position.clone();
    controller.update(0.5);
    assert.equal(goblin.mesh.position.x, idlePosition.x, 'goblin moved on x during patrol idle');
    assert.equal(goblin.mesh.position.z, idlePosition.z, 'goblin moved on z during patrol idle');

    // Chase takes priority over a future patrol pause.
    playerRef.position.set(5, -1, 0);
    controller.update(0.5);
    assert.equal(goblin.state, 'chase', 'nearby player should interrupt patrol idle immediately');
    assert.equal(goblin.idleUntil, 0, 'chase transition must cancel the patrol idle timer');
    assert.ok(goblin.mesh.position.x > idlePosition.x, 'goblin did not move when chase interrupted idle');

    // Losing the player returns the goblin home, then restores patrol.
    playerRef.position.set(100, -1, 100);
    for (let attempt = 0; attempt < 20 && goblin.state !== 'patrol'; attempt += 1) {
        nowSeconds += 0.1;
        controller.update(0.1);
    }
    assert.equal(goblin.state, 'patrol', 'goblin did not return to patrol after losing the player');

    // Chase cancelled the old pause, so patrol resumes immediately toward the
    // waypoint selected before the chase instead of reviving a stale timer.
    assert.equal(goblin.idleUntil, 0, 'return to patrol must not restore the cancelled idle timer');
    const resumedPosition = goblin.mesh.position.clone();
    nowSeconds += 0.1;
    controller.update(0.1);
    const planarDistance = Math.hypot(
        goblin.mesh.position.x - resumedPosition.x,
        goblin.mesh.position.z - resumedPosition.z,
    );
    assert.ok(
        planarDistance > 0,
        'goblin did not resume patrol toward the next waypoint after returning home',
    );

    console.log('PASS — PAT-18 goblin patrol waypoint idle lifecycle');
} finally {
    controller.dispose();
    Math.random = originalRandom;
    if (originalPerformanceDescriptor) {
        Object.defineProperty(globalThis, 'performance', originalPerformanceDescriptor);
    } else {
        delete globalThis.performance;
    }
}
