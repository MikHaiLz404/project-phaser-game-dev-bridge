import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import createWildlife from '../src/threejs/models/createWildlife.js';

function withDeterministicRuntime(run) {
    const originalRandom = Math.random;
    const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    let nowSeconds = 100;

    Math.random = () => 0.5;
    Object.defineProperty(globalThis, 'performance', {
        configurable: true,
        value: { now: () => nowSeconds * 1000 },
    });

    try {
        run({
            now: () => nowSeconds,
            setNow: (nextNow) => { nowSeconds = nextNow; },
        });
    } finally {
        Math.random = originalRandom;
        if (performanceDescriptor) {
            Object.defineProperty(globalThis, 'performance', performanceDescriptor);
        } else {
            delete globalThis.performance;
        }
    }
}

function createSubject(playerRef = null) {
    const wildlife = createWildlife({
        count: 1,
        bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
        playerRef,
    });
    const state = wildlife.animals[0];

    state.mesh.position.set(-5, -1, -5);
    state.target.copy(state.mesh.position);
    state.anchor.copy(state.mesh.position);
    state.idleUntil = 0;

    return { wildlife, state };
}

test('wildlife idles after reaching a waypoint, then resumes toward the next waypoint', () => {
    withDeterministicRuntime(({ now, setNow }) => {
        const { wildlife, state } = createSubject();

        try {
            wildlife.update(0.25);

            assert.equal(state.idleUntil, now() + 2.25);
            assert.ok(state.idleUntil >= now() + 1.0);
            assert.ok(state.idleUntil <= now() + 3.5);
            assert.deepEqual(
                { x: state.target.x, z: state.target.z },
                { x: 0, z: 0 },
            );

            const reachedPosition = {
                x: state.mesh.position.x,
                z: state.mesh.position.z,
            };
            setNow(101);
            wildlife.update(0.5);
            assert.deepEqual(
                { x: state.mesh.position.x, z: state.mesh.position.z },
                reachedPosition,
                'wildlife must not move toward its next waypoint during idle',
            );

            setNow(102.26);
            wildlife.update(0.5);
            assert.ok(state.mesh.position.x > reachedPosition.x);
            assert.ok(state.mesh.position.z > reachedPosition.z);
        } finally {
            wildlife.dispose();
        }
    });
});

test('fleeing cancels an active wildlife idle window immediately', () => {
    withDeterministicRuntime(({ now }) => {
        const playerRef = { position: new THREE.Vector3(100, -1, 100) };
        const { wildlife, state } = createSubject(playerRef);

        try {
            state.idleUntil = now() + 2.25;
            playerRef.position.set(
                state.mesh.position.x + 1,
                -1,
                state.mesh.position.z,
            );

            wildlife.update(0.1);

            assert.equal(state.idleUntil, 0);
            assert.equal(state.fleeing, true);
        } finally {
            wildlife.dispose();
        }
    });
});
