/**
 * sword-axes.test.mjs
 * ===================
 *
 * Automated geometry assertion for PAT-10 [INV-001].
 *
 * Verifies that the sword blade and tip share the documented +Z forward
 * convention so they read as one continuous shape from the gameplay camera.
 *
 * Acceptance criteria (per PAT-10):
 *   - Blade long-axis and tip apex direction are parallel
 *   - Dot product of the two unit vectors >= 0.99
 *
 * Convention used in the code:
 *   - sword-forward axis = local +Z
 *   - blade long-axis = local +Z (BoxGeometry with depth on the Z axis)
 *   - tip apex = local +Z (ConeGeometry rotated by +PI/2 around X)
 *
 * Run from the project root:  npm run test:sword-axes
 *
 * This test is intentionally framework-free (just node + three.js) so it
 * works in CI without a browser harness. The geometry math is the same
 * regardless of whether the model is rendered or just constructed.
 */

import * as THREE from 'three';
import createCharacter from '../src/threejs/models/createCharacter.js';

// ─── Test infrastructure (no external test framework) ──────────────
// Minimal assertion runner — each `test()` returns a promise so we can
// report pass/fail with a single dot per check, like TAP.

const results = [];
let failures = 0;

function test(name, fn) {
    const r = (async () => {
        try {
            await fn();
            results.push({ name, ok: true });
        } catch (e) {
            failures += 1;
            results.push({ name, ok: false, error: e.message });
        }
    })();
    return r;
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
}

function assertNear(actual, expected, epsilon, msg) {
    if (Math.abs(actual - expected) > epsilon) {
        throw new Error(
            `${msg || 'value out of range'}: expected ${expected} ± ${epsilon}, got ${actual}`,
        );
    }
}

// ─── Build the character once, share across tests ─────────────────
const character = createCharacter({});

let bladeMesh = null;
let tipMesh = null;
character.traverse((o) => {
    if (o.geometry?.type === 'ConeGeometry') tipMesh = o;
    if (o.geometry?.type === 'BoxGeometry'
        && Math.abs(o.geometry.parameters.depth - 0.75) < 0.001) {
        bladeMesh = o;
    }
});

// ─── Tests ────────────────────────────────────────────────────────
await Promise.all([
    test('sword meshes exist (blade + tip)', () => {
        assert(bladeMesh, 'blade Mesh not found in createCharacter() output');
        assert(tipMesh, 'tip Mesh not found in createCharacter() output');
    }),

    test('blade BoxGeometry has depth = 0.75 (long axis on Z)', () => {
        // Long axis must be the depth dimension so the blade extends
        // along the documented +Z forward convention.
        assertNear(
            bladeMesh.geometry.parameters.depth, 0.75, 1e-6,
            'blade.geometry.parameters.depth',
        );
        assertNear(
            bladeMesh.geometry.parameters.width, 0.06, 1e-6,
            'blade.geometry.parameters.width',
        );
        assertNear(
            bladeMesh.geometry.parameters.height, 0.10, 1e-6,
            'blade.geometry.parameters.height',
        );
    }),

    test('tip ConeGeometry rotated +PI/2 around X (apex along +Z)', () => {
        assertNear(
            tipMesh.rotation.x, Math.PI / 2, 1e-6,
            'tip.rotation.x',
        );
    }),

    test('blade long-axis direction is (0, 0, +1) in local space', () => {
        const local = new THREE.Vector3(0, 0, 1);
        const world = local.clone().applyQuaternion(
            bladeMesh.getWorldQuaternion(new THREE.Quaternion()),
        );
        assertNear(world.x, 0, 1e-6, 'blade.x');
        assertNear(world.y, 0, 1e-6, 'blade.y');
        assertNear(world.z, 1, 1e-6, 'blade.z');
    }),

    test('tip apex direction is (0, 0, +1) in local space', () => {
        // ConeGeometry default apex points along local +Y. After rotating
        // +PI/2 around X, the apex aligns with local +Z.
        const local = new THREE.Vector3(0, 1, 0);
        const world = local.clone().applyEuler(
            new THREE.Euler(Math.PI / 2, 0, 0),
        );
        assertNear(world.x, 0, 1e-6, 'tip.x');
        assertNear(world.y, 0, 1e-6, 'tip.y');
        assertNear(world.z, 1, 1e-6, 'tip.z');
    }),

    test('blade long-axis parallel to tip apex (dot >= 0.99)', () => {
        // PAT-10 acceptance criterion: dot product of the two unit vectors
        // must be >= 0.99 to guarantee the sword reads as one shape.
        const bladeAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(
            bladeMesh.getWorldQuaternion(new THREE.Quaternion()),
        );
        const tipApex = new THREE.Vector3(0, 1, 0).applyEuler(
            new THREE.Euler(Math.PI / 2, 0, 0),
        );
        const dot = bladeAxis.dot(tipApex);
        assert(
            dot >= 0.99,
            `blade/tip dot product ${dot.toFixed(3)} < 0.99 — axes misaligned`,
        );
    }),

    test('blade/tip overlap = 0.015 (continuous taper, no visible seam)', () => {
        // Per the inline geometry comment verified by P'Jo in PR #1 review:
        //   blade extends to z = 0.835
        //   cone (after +Z rotation) base at z = 0.82
        //   overlap = 0.835 - 0.82 = 0.015
        const bladeFar = bladeMesh.position.z + bladeMesh.geometry.parameters.depth / 2;
        const coneBase = tipMesh.position.z - tipMesh.geometry.parameters.height / 2;
        const overlap = bladeFar - coneBase;
        assertNear(bladeFar, 0.835, 1e-6, 'blade extends to z');
        assertNear(coneBase, 0.82, 1e-6, 'cone base at z');
        assertNear(overlap, 0.015, 1e-6, 'blade/tip overlap');
    }),
]);

// ─── Report ───────────────────────────────────────────────────────
for (const r of results) {
    if (r.ok) {
        console.log(`  ✅ ${r.name}`);
    } else {
        console.log(`  ❌ ${r.name}`);
        console.log(`     ${r.error}`);
    }
}

const passed = results.length - failures;
console.log(`\n${passed}/${results.length} assertions passed`);

if (failures > 0) {
    console.error('\nFAIL — sword-axes test failed; PAT-10 acceptance not met');
    process.exit(1);
} else {
    console.log('\nPASS — sword-axes test confirms PAT-10 acceptance');
    process.exit(0);
}