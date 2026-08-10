import assert from 'node:assert/strict';
import test from 'node:test';

import createWildlife from '../src/threejs/models/createWildlife.js';

const FIXED_BOUNDS = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
const EPSILON = 1e-12;

function withFixedRandom(value, fn) {
    const originalRandom = Math.random;
    Math.random = () => value;
    try {
        return fn();
    } finally {
        Math.random = originalRandom;
    }
}

function assertNear(actual, expected, message) {
    assert.ok(
        Math.abs(actual - expected) <= EPSILON,
        `${message}: expected ${expected}, got ${actual}`,
    );
}

function rabbitTrace(count, dtSequence) {
    return withFixedRandom(0, () => {
        const wildlife = createWildlife({ count, bounds: FIXED_BOUNDS });
        try {
            assert.equal(wildlife.animals[0].species, 'rabbit');
            return dtSequence.map((dt) => {
                wildlife.update(dt);
                return wildlife.animals[0].mesh.position.y;
            });
        } finally {
            wildlife.dispose();
        }
    });
}

test('PAT-19 animation phase advances once per update regardless of wildlife count', () => {
    const dtSequence = [0.05, 0.08, 0.03];
    const oneRabbit = rabbitTrace(1, dtSequence);
    const fourRabbits = rabbitTrace(4, dtSequence);

    let elapsed = 0;
    const expected = dtSequence.map((dt) => {
        elapsed += dt;
        return -1 + Math.abs(Math.sin(elapsed * 6)) * 0.12;
    });

    for (let frame = 0; frame < dtSequence.length; frame += 1) {
        assertNear(oneRabbit[frame], expected[frame], `one-rabbit frame ${frame}`);
        assertNear(fourRabbits[frame], expected[frame], `four-rabbit frame ${frame}`);
        assertNear(
            fourRabbits[frame],
            oneRabbit[frame],
            `population-invariant phase at frame ${frame}`,
        );
    }
});

test('rabbit, deer, and squirrel procedural motion remains active', () => {
    const cases = [
        { random: 0, species: 'rabbit' },
        { random: 0.4, species: 'deer' },
        { random: 0.8, species: 'squirrel' },
    ];

    for (const { random, species } of cases) {
        withFixedRandom(random, () => {
            const wildlife = createWildlife({ count: 1, bounds: FIXED_BOUNDS });
            try {
                const animal = wildlife.animals[0];
                assert.equal(animal.species, species);
                const before = {
                    y: animal.mesh.position.y,
                    rotationY: animal.mesh.rotation.y,
                    rotationZ: animal.mesh.rotation.z,
                };

                wildlife.update(0.1);

                if (species === 'rabbit') {
                    assert.notEqual(animal.mesh.position.y, before.y);
                } else if (species === 'deer') {
                    assert.notEqual(animal.mesh.position.y, before.y);
                    assert.notEqual(animal.mesh.rotation.z, before.rotationZ);
                } else {
                    assert.notEqual(animal.mesh.rotation.y, before.rotationY);
                }
            } finally {
                wildlife.dispose();
            }
        });
    }
});

test('fleeing intentionally applies the faster animation multiplier', () => {
    withFixedRandom(0, () => {
        const wildlife = createWildlife({
            count: 1,
            bounds: { minX: 1, maxX: 1, minZ: 0, maxZ: 0 },
            playerRef: { position: { x: 0, z: 0 } },
        });
        try {
            const dt = 0.1;
            wildlife.update(dt);

            const actualY = wildlife.animals[0].mesh.position.y;
            const fleeingY = -1 + Math.abs(Math.sin(dt * 6 * 2.2)) * 0.12;
            const wanderingY = -1 + Math.abs(Math.sin(dt * 6)) * 0.12;
            assertNear(actualY, fleeingY, 'fleeing rabbit phase');
            assert.ok(Math.abs(actualY - wanderingY) > EPSILON);
        } finally {
            wildlife.dispose();
        }
    });
});

test('respawned wildlife is visible at the current animation phase without a zero-time jump', () => {
    const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    let nowSeconds = 100;

    Object.defineProperty(globalThis, 'performance', {
        configurable: true,
        value: { now: () => nowSeconds * 1000 },
    });

    try {
        withFixedRandom(0, () => {
            const wildlife = createWildlife({ count: 1, bounds: FIXED_BOUNDS });
            try {
                const animal = wildlife.animals[0];
                animal.mesh.position.x = animal.anchor.x + 19;

                wildlife.update(0.1);
                assert.equal(animal.mesh.visible, false, 'animal should enter pending respawn');

                for (let frame = 0; frame < 141; frame += 1) {
                    wildlife.update(0.016);
                }

                nowSeconds = animal.respawnAt;
                wildlife.update(0);
                assert.equal(animal.mesh.visible, true, 'animal should become visible when respawn is due');

                const respawnPoseY = animal.mesh.position.y;
                wildlife.update(0);
                assertNear(
                    animal.mesh.position.y,
                    respawnPoseY,
                    'zero-time update after respawn must preserve the visible pose',
                );
            } finally {
                wildlife.dispose();
            }
        });
    } finally {
        if (performanceDescriptor) {
            Object.defineProperty(globalThis, 'performance', performanceDescriptor);
        } else {
            delete globalThis.performance;
        }
    }
});

test('respawned squirrel does not accumulate wiggle on a zero-time update', () => {
    const performanceDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    let nowSeconds = 100;

    Object.defineProperty(globalThis, 'performance', {
        configurable: true,
        value: { now: () => nowSeconds * 1000 },
    });

    try {
        withFixedRandom(0.8, () => {
            const wildlife = createWildlife({ count: 1, bounds: FIXED_BOUNDS });
            try {
                const animal = wildlife.animals[0];
                assert.equal(animal.species, 'squirrel');
                animal.mesh.position.x = animal.anchor.x + 19;

                wildlife.update(0.1);
                for (let frame = 0; frame < 141; frame += 1) {
                    wildlife.update(0.016);
                }

                nowSeconds = animal.respawnAt;
                wildlife.update(0);
                const respawnRotationY = animal.mesh.rotation.y;

                wildlife.update(0);
                assertNear(
                    animal.mesh.rotation.y,
                    respawnRotationY,
                    'zero-time update after squirrel respawn must preserve rotation',
                );
            } finally {
                wildlife.dispose();
            }
        });
    } finally {
        if (performanceDescriptor) {
            Object.defineProperty(globalThis, 'performance', performanceDescriptor);
        } else {
            delete globalThis.performance;
        }
    }
});
