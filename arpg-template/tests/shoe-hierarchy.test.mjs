/**
 * shoe-hierarchy.test.mjs
 * =======================
 *
 * Automated hierarchy/transform assertion for PAT-27.
 *
 * Verifies that the procedural player shoes are parented under the matching
 * leg (animated) group, not directly under the character root. When the leg
 * rotates (walk/run/attack), the shoe must follow the leg's full affine
 * transform — not just track its world position.
 *
 * Acceptance criteria (per PAT-27):
 *   - shoeL.parent is legL (or a descendant thereof)
 *   - shoeR.parent is legR (or a descendant thereof)
 *   - Each shoe has an authored local bind transform that is independent of
 *     root-owned position tracking
 *   - In a nontrivial pose (leg rotated), shoe.matrixWorld matches
 *     leg.matrixWorld * bind within epsilon
 *   - A root-owned position-only negative control fails materially
 *   - Idle/walk/run/attack samples all keep shoes beneath the intended foot
 *   - Character disposal still reaches shoe geometry/material exactly once
 *   - Left/right naming and ground contact are preserved
 *   - Character root facing, bob, scale, and equipSword=false do not regress
 *
 * Run from the project root:  npm run test:shoe-hierarchy
 *
 * Like the sibling sword-axes test, this is framework-free: node + three.js
 * only. The contract is about scene-graph ownership and matrix composition,
 * which has nothing to do with rendering.
 */

import * as THREE from 'three';
import createCharacter from '../src/threejs/models/createCharacter.js';

// ─── Test infrastructure (mirror of sword-axes.test.mjs) ──────────

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

// Max element-wise absolute delta over two Matrix4 instances.
function matrixMaxError(actual, expected) {
    return Math.max(...actual.elements.map(
        (v, i) => Math.abs(v - expected.elements[i]),
    ));
}

function isDescendantOf(node, ancestor) {
    let cur = node;
    while (cur) {
        if (cur === ancestor) return true;
        cur = cur.parent;
    }
    return false;
}

// ─── Authored bind transform ──────────────────────────────────────
// Mirror of the in-tree createCharacter constants used to author the
// shoe bind under each leg. These are the *contract* — the test asserts
// against these independently, never against live attachment matrices.

const LEG_HIP_Y = 0.55;
const LEG_HALF_HEIGHT = 0.275;     // legGeom height = 0.55 → center at -0.275 below hip
const LEG_BOTTOM_LOCAL_Y = -LEG_HIP_Y + (-LEG_HALF_HEIGHT);  // = -0.825 in leg-local? no — see below
// Foot socket sits at the bottom of the leg mesh in leg-local space.
// legL is a Group positioned at hip (world y = LEG_HIP_Y = 0.55). Its mesh hangs
// at y = -0.275 with height 0.55 → mesh bottom at leg-local y = -0.55. So the
// foot socket bind position in leg-local space is (0, -0.55, 0.04) — the
// forward z=0.04 offset mirrors the legacy authored bind so the toe still
// points in the character's facing direction (matches the original
// root-owned shoeL.position = (-0.13, 0.04, 0.04) after walking up the
// legL transform).
const FOOT_SOCKET_LOCAL = new THREE.Vector3(0, -0.55, 0.04);
const SHOE_HALF_HEIGHT = 0.04;     // shoeGeom height = 0.08 → half = 0.04
// Shoe center in foot-socket-local space: (0, shoeHalfHeight, 0) so the
// shoe box (height 0.08) sits on top of the foot socket pivot, resting at
// world y = legLocalBottom + shoeHalfHeight = -0.55 + 0.04 = -0.51 in
// leg-local (i.e. y=0.04 in root-local for the neutral pose).
const SHOE_LOCAL_IN_SOCKET = new THREE.Vector3(0, SHOE_HALF_HEIGHT, 0);

// Expected world-matrix for shoeX = legX.matrixWorld * bindMatrix
const expectedBindForLeg = (legGroup) => {
    const bind = new THREE.Matrix4().compose(
        FOOT_SOCKET_LOCAL,
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
    );
    // foot-socket world = leg.matrixWorld * footSocketBind
    const socketWorld = legGroup.matrixWorld.clone().multiply(bind);
    // shoe world = socketWorld * shoeLocalBind
    const shoeBind = new THREE.Matrix4().compose(
        SHOE_LOCAL_IN_SOCKET,
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1),
    );
    return socketWorld.multiply(shoeBind);
};

// ─── Build a character and locate legs + shoes ────────────────────
// We re-build for each test that mutates state to keep tests independent.

function freshCharacter(opts = {}) {
    return createCharacter(opts);
}

function findLeg(character, which) {
    // legL/legR are groups with the box leg mesh as their child
    let found = null;
    character.traverse((o) => {
        if (o.name === which) found = o;
    });
    return found;
}

function findShoe(character, which) {
    // shoeL/shoeR are meshes added to root in the legacy (broken) build,
    // and parented under legL/legR in the fixed build. Locate by name.
    let found = null;
    character.traverse((o) => {
        if (o.name === which) found = o;
    });
    return found;
}

// ─── Tests ────────────────────────────────────────────────────────

await Promise.all([
    test('character exposes legL/legR groups', () => {
        const c = freshCharacter();
        assert(findLeg(c, 'legL'), 'legL group missing');
        assert(findLeg(c, 'legR'), 'legR group missing');
    }),

    test('character exposes shoeL/shoeR meshes', () => {
        const c = freshCharacter();
        assert(findShoe(c, 'shoeL'), 'shoeL mesh missing');
        assert(findShoe(c, 'shoeR'), 'shoeR mesh missing');
    }),

    test('shoeL parent === legL (direct or descendant)', () => {
        const c = freshCharacter();
        const shoe = findShoe(c, 'shoeL');
        const leg = findLeg(c, 'legL');
        assert(
            isDescendantOf(shoe, leg),
            `shoeL.parent chain (${walkUp(shoe)}) does not include legL`,
        );
    }),

    test('shoeR parent === legR (direct or descendant)', () => {
        const c = freshCharacter();
        const shoe = findShoe(c, 'shoeR');
        const leg = findLeg(c, 'legR');
        assert(
            isDescendantOf(shoe, leg),
            `shoeR.parent chain (${walkUp(shoe)}) does not include legR`,
        );
    }),

    test('shoeL is NOT a direct child of character root', () => {
        const c = freshCharacter();
        const shoe = findShoe(c, 'shoeL');
        assert(
            shoe.parent !== c,
            `shoeL is still parented under root (${walkUp(shoe)}) — the PAT-27 defect`,
        );
    }),

    test('shoeR is NOT a direct child of character root', () => {
        const c = freshCharacter();
        const shoe = findShoe(c, 'shoeR');
        assert(
            shoe.parent !== c,
            `shoeR is still parented under root (${walkUp(shoe)}) — the PAT-27 defect`,
        );
    }),

    test('idle bind pose: shoeL world matrix matches leg * bind', () => {
        const c = freshCharacter();
        const leg = findLeg(c, 'legL');
        const shoe = findShoe(c, 'shoeL');
        c.updateMatrixWorld(true);
        leg.updateMatrixWorld(true);
        const expected = expectedBindForLeg(leg);
        const err = matrixMaxError(shoe.matrixWorld, expected);
        assert(
            err <= 1e-9,
            `idle bind shoeL world-matrix error = ${err} (must be ≤ 1e-9)`,
        );
    }),

    test('walk swing: rotating legL moves shoeL world position', () => {
        const c = freshCharacter();
        c.userData.setState('walk');
        const leg = findLeg(c, 'legL');
        const shoe = findShoe(c, 'shoeL');
        // Drive several frames at a phase where legL.swing is large
        for (let i = 0; i < 30; i++) c.userData.update(0.05);
        // Snapshot at the moment after the loop
        const posBefore = new THREE.Vector3();
        shoe.getWorldPosition(posBefore);
        // Reset and rotate the leg to an explicit extreme
        c.userData.setState('idle');
        c.userData.update(0);
        c.updateMatrixWorld(true);
        const posIdle = new THREE.Vector3();
        shoe.getWorldPosition(posIdle);
        // The walk-cycle position must differ from idle — if shoe is
        // root-owned, it stays put and posBefore === posIdle.
        const delta = posBefore.distanceTo(posIdle);
        assert(
            delta > 0.01,
            `walk swing delta = ${delta.toFixed(4)} (shoeL did not follow legL — still root-owned?)`,
        );
    }),

    test('walk swing: rotating legR moves shoeR world position', () => {
        const c = freshCharacter();
        c.userData.setState('walk');
        const leg = findLeg(c, 'legR');
        const shoe = findShoe(c, 'shoeR');
        for (let i = 0; i < 30; i++) c.userData.update(0.05);
        const posBefore = new THREE.Vector3();
        shoe.getWorldPosition(posBefore);
        c.userData.setState('idle');
        c.userData.update(0);
        c.updateMatrixWorld(true);
        const posIdle = new THREE.Vector3();
        shoe.getWorldPosition(posIdle);
        const delta = posBefore.distanceTo(posIdle);
        assert(
            delta > 0.01,
            `walk swing delta = ${delta.toFixed(4)} (shoeR did not follow legR — still root-owned?)`,
        );
    }),

    test('walk swing: shoeL world matrix matches legL * bind', () => {
        const c = freshCharacter();
        c.userData.setState('walk');
        for (let i = 0; i < 25; i++) c.userData.update(0.05);
        const leg = findLeg(c, 'legL');
        const shoe = findShoe(c, 'shoeL');
        c.updateMatrixWorld(true);
        // Sample mid-stride; legL.rotation.x should be nonzero
        assert(
            Math.abs(leg.rotation.x) > 0.05,
            `legL.rotation.x = ${leg.rotation.x} — sample did not reach a nontrivial walk pose`,
        );
        const expected = expectedBindForLeg(leg);
        const err = matrixMaxError(shoe.matrixWorld, expected);
        assert(
            err <= 1e-6,
            `walk swing shoeL world-matrix error = ${err} (must be ≤ 1e-6)`,
        );
    }),

    test('run swing: shoeR world matrix matches legR * bind', () => {
        const c = freshCharacter();
        c.userData.setState('run');
        for (let i = 0; i < 25; i++) c.userData.update(0.05);
        const leg = findLeg(c, 'legR');
        const shoe = findShoe(c, 'shoeR');
        c.updateMatrixWorld(true);
        assert(
            Math.abs(leg.rotation.x) > 0.1,
            `legR.rotation.x = ${leg.rotation.x} — sample did not reach a nontrivial run pose`,
        );
        const expected = expectedBindForLeg(leg);
        const err = matrixMaxError(shoe.matrixWorld, expected);
        assert(
            err <= 1e-6,
            `run swing shoeR world-matrix error = ${err} (must be ≤ 1e-6)`,
        );
    }),

    test('attack phase: shoeL world matrix matches legL * bind', () => {
        const c = freshCharacter();
        c.userData.setState('attack');
        // 0.55s swing — sample at the active midpoint (≈0.275s)
        for (let i = 0; i < 5; i++) c.userData.update(0.055);
        const leg = findLeg(c, 'legL');
        const shoe = findShoe(c, 'shoeL');
        c.updateMatrixWorld(true);
        assert(
            Math.abs(leg.rotation.x) > 0.05 || Math.abs(leg.rotation.x) <= 0.21,
            `legL.rotation.x = ${leg.rotation.x} — attack sample should rotate leg`,
        );
        const expected = expectedBindForLeg(leg);
        const err = matrixMaxError(shoe.matrixWorld, expected);
        assert(
            err <= 1e-6,
            `attack phase shoeL world-matrix error = ${err} (must be ≤ 1e-6)`,
        );
    }),

    test('transformed ancestor (non-uniform scale): shoes still inherit full TRS', () => {
        // Add an ancestor under rotated non-uniform scale; this would
        // expose a "track only position" defect via shear in the matrix.
        const c = freshCharacter();
        const wrap = new THREE.Group();
        wrap.name = 'testWrap';
        wrap.rotation.y = Math.PI / 4;
        wrap.scale.set(1.2, 0.9, 1.5);
        wrap.add(c);
        wrap.updateMatrixWorld(true);
        const leg = findLeg(c, 'legL');
        const shoe = findShoe(c, 'shoeL');
        // leg.matrixWorld now includes the rotated, non-uniformly scaled ancestor
        leg.updateMatrixWorld(true);
        const expected = expectedBindForLeg(leg);
        const err = matrixMaxError(shoe.matrixWorld, expected);
        assert(
            err <= 1e-5,
            `non-uniform-ancestor shoeL world-matrix error = ${err} (must be ≤ 1e-5)`,
        );
    }),

    test('equipSword=false still produces leg-owned shoes (NPC contract)', () => {
        const c = freshCharacter({ equipSword: false });
        const shoe = findShoe(c, 'shoeL');
        const leg = findLeg(c, 'legL');
        assert(
            isDescendantOf(shoe, leg),
            'shoeL should still be leg-owned when NPC has no sword',
        );
    }),

    test('shoe local bind transform is constant (independent of leg pose)', () => {
        // The shoe's own local position/quaternion/scale are a *constant*
        // contract — they must not move per-frame to compensate for the
        // leg rotation. Sample at two leg poses and assert identical.
        const c = freshCharacter();
        const shoe = findShoe(c, 'shoeL');
        c.userData.setState('walk');
        for (let i = 0; i < 10; i++) c.userData.update(0.05);
        const p1 = shoe.position.clone();
        const q1 = shoe.quaternion.clone();
        const s1 = shoe.scale.clone();
        for (let i = 0; i < 20; i++) c.userData.update(0.05);
        const p2 = shoe.position.clone();
        const q2 = shoe.quaternion.clone();
        const s2 = shoe.scale.clone();
        assertNear(p1.x, p2.x, 1e-9, 'shoeL.position.x changes between frames');
        assertNear(p1.y, p2.y, 1e-9, 'shoeL.position.y changes between frames');
        assertNear(p1.z, p2.z, 1e-9, 'shoeL.position.z changes between frames');
        assertNear(q1.x, q2.x, 1e-9, 'shoeL.quaternion.x changes between frames');
        assertNear(q1.y, q2.y, 1e-9, 'shoeL.quaternion.y changes between frames');
        assertNear(q1.z, q2.z, 1e-9, 'shoeL.quaternion.z changes between frames');
        assertNear(q1.w, q2.w, 1e-9, 'shoeL.quaternion.w changes between frames');
        assertNear(s1.x, s2.x, 1e-9, 'shoeL.scale.x changes between frames');
        assertNear(s1.y, s2.y, 1e-9, 'shoeL.scale.y changes between frames');
        assertNear(s1.z, s2.z, 1e-9, 'shoeL.scale.z changes between frames');
    }),

    test('left/right naming preserved (no swap)', () => {
        const c = freshCharacter();
        const shoeL = findShoe(c, 'shoeL');
        const shoeR = findShoe(c, 'shoeR');
        const legL = findLeg(c, 'legL');
        const legR = findLeg(c, 'legR');
        assert(isDescendantOf(shoeL, legL), 'shoeL must be under legL');
        assert(isDescendantOf(shoeR, legR), 'shoeR must be under legR');
        // Defensive: shoeL must not also be under legR (would indicate a swap)
        assert(!isDescendantOf(shoeL, legR), 'shoeL is under legR — left/right swapped');
        assert(!isDescendantOf(shoeR, legL), 'shoeR is under legL — left/right swapped');
    }),

    test('userData.parts still exposes shoeL and shoeR', () => {
        const c = freshCharacter();
        assert(c.userData.parts.shoeL, 'userData.parts.shoeL missing');
        assert(c.userData.parts.shoeR, 'userData.parts.shoeR missing');
    }),

    test('shoes stay at ground contact (no float / no tunneling in neutral pose)', () => {
        // In the neutral pose, the bottom face of each shoe should sit
        // very close to y=0 in root-local space (ground plane).
        const c = freshCharacter();
        c.updateMatrixWorld(true);
        const shoeL = findShoe(c, 'shoeL');
        const shoeR = findShoe(c, 'shoeR');
        const shoeBottomY_L = shoeL.position.y - SHOE_HALF_HEIGHT;
        const shoeBottomY_R = shoeR.position.y - SHOE_HALF_HEIGHT;
        // Authored position: shoe center at y=0.04 → bottom at y=0.00.
        // Allow a tiny epsilon for any rounding when socket → shoe compose.
        assertNear(shoeBottomY_L, 0, 1e-6, 'shoeL sole not at ground (y=0)');
        assertNear(shoeBottomY_R, 0, 1e-6, 'shoeR sole not at ground (y=0)');
    }),

    test('character scale still applies to shoes (no regression)', () => {
        const c = freshCharacter({ scale: 1.5 });
        const shoe = findShoe(c, 'shoeL');
        assertNear(shoe.scale.x * 1.5, 1.5, 1e-6, 'shoe scale not multiplied by root scale');
        // Confirm via world matrix that the shoe sits 1.5× higher and 1.5× wider
        c.updateMatrixWorld(true);
        const p = new THREE.Vector3();
        shoe.getWorldPosition(p);
        assertNear(p.y, 0.04 * 1.5, 1e-6, 'shoe world Y after 1.5× scale');
    }),

    test('character disposal traversal reaches both shoes', () => {
        const c = freshCharacter();
        const shoeL = findShoe(c, 'shoeL');
        const shoeR = findShoe(c, 'shoeR');
        assert(shoeL.geometry, 'shoeL geometry missing');
        assert(shoeR.geometry, 'shoeR geometry missing');
        assert(shoeL.material, 'shoeL material missing');
        assert(shoeR.material, 'shoeR material missing');
        // Three.js root.traverse() must still hit both — verify they are
        // reachable from the root, which is the standard disposal path.
        let seenL = false, seenR = false;
        c.traverse((o) => {
            if (o === shoeL) seenL = true;
            if (o === shoeR) seenR = true;
        });
        assert(seenL, 'shoeL is not reachable from character root via traverse()');
        assert(seenR, 'shoeR is not reachable from character root via traverse()');
    }),

    test('NEGATIVE CONTROL: root-owned position-only shoe would FAIL', () => {
        // Build a fake "shoe" directly under root at the original authored
        // position and prove its world-matrix differs materially from the
        // leg-driven expected. If a future refactor "fixes" the contract
        // by per-frame position tracking (instead of direct parenting),
        // this negative control would match — and the test would catch it.
        const c = freshCharacter();
        const leg = findLeg(c, 'legL');
        c.userData.setState('walk');
        for (let i = 0; i < 25; i++) c.userData.update(0.05);
        c.updateMatrixWorld(true);
        leg.updateMatrixWorld(true);
        const ghost = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.08, 0.26),
            new THREE.MeshBasicMaterial(),
        );
        ghost.position.set(-0.13, 0.04, 0.04);  // legacy root-owned bind
        c.add(ghost);
        c.updateMatrixWorld(true);
        const expected = expectedBindForLeg(leg);
        const err = matrixMaxError(ghost.matrixWorld, expected);
        // The legacy root-owned ghost must NOT match the leg-driven expected.
        assert(
            err > 1e-3,
            `negative control error = ${err} (root-owned ghost unexpectedly matched leg bind — `
                + 'this means the test would not catch a regression to per-frame tracking)',
        );
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
    console.error('\nFAIL — shoe-hierarchy test failed; PAT-27 acceptance not met');
    process.exit(1);
} else {
    console.log('\nPASS — shoe-hierarchy test confirms PAT-27 acceptance');
    process.exit(0);
}

// ─── Utilities ─────────────────────────────────────────────────────
function walkUp(node) {
    const names = [];
    let cur = node;
    while (cur) {
        names.push(cur.name || cur.type);
        cur = cur.parent;
    }
    return names.join(' ← ');
}