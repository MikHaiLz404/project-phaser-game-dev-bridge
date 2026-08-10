import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import createCharacter from '../src/threejs/models/createCharacter.js';

const EPSILON = 1e-9;
const WRIST_LOCAL = new THREE.Vector3(0, -0.55, 0);
const EXPECTED_ARMR_TO_SWORD_BIND = new THREE.Matrix4().makeTranslation(...WRIST_LOCAL.toArray());
const EXPECTED_WRIST_TO_SWORD_BIND = new THREE.Matrix4();
const SIDE_CONTRACT = Object.freeze({
    armL: Object.freeze({ x: +0.32, ownsWeapon: false }),
    armR: Object.freeze({ x: -0.32, ownsWeapon: true }),
    forwardZ: +1,
    backpackZ: -1,
});

function assertNear(actual, expected, message, epsilon = EPSILON) {
    assert.ok(
        Math.abs(actual - expected) <= epsilon,
        `${message}: expected ${expected}, got ${actual}`,
    );
}

function readParts(character) {
    const {
        torso, armL, armR, backpack,
    } = character.userData.parts;
    const swordPivot = character.getObjectByName('swordPivot');
    assert.ok(torso, 'production createCharacter() must expose torso');
    assert.ok(armL, 'production createCharacter() must expose armL');
    assert.ok(armR, 'production createCharacter() must expose armR');
    assert.ok(backpack, 'production createCharacter() must expose backpack as a rear landmark');
    assert.ok(swordPivot, 'production createCharacter() must create swordPivot');
    return {
        torso, armL, armR, backpack, swordPivot,
    };
}

function rootLocalBounds(object, root) {
    root.updateMatrixWorld(true);
    const rootInverse = root.matrixWorld.clone().invert();
    const bounds = new THREE.Box3();
    const corner = new THREE.Vector3();

    object.traverse((child) => {
        if (!child.isMesh || !child.visible || !child.geometry) return;
        child.geometry.computeBoundingBox();
        const box = child.geometry.boundingBox;
        for (const x of [box.min.x, box.max.x]) {
            for (const y of [box.min.y, box.max.y]) {
                for (const z of [box.min.z, box.max.z]) {
                    corner.set(x, y, z).applyMatrix4(child.matrixWorld).applyMatrix4(rootInverse);
                    bounds.expandByPoint(corner);
                }
            }
        }
    });
    return bounds;
}

function poseCharacter(state, dt, { transformed = false } = {}) {
    const ancestor = new THREE.Group();
    const parent = new THREE.Group();
    const character = createCharacter({ attackDuration: 1 });
    ancestor.add(parent);
    parent.add(character);

    if (transformed) {
        ancestor.position.set(-6, 3, 8);
        ancestor.rotation.set(0.18, -0.43, 0.11);
        ancestor.scale.set(0.75, 1.6, 1.25);
        parent.position.set(-1.3, 0.7, 2.1);
        parent.rotation.set(-0.21, 0.27, -0.16);
        parent.scale.set(1.15, 0.8, 1.45);
        character.position.set(4, 2, -3);
        character.rotation.set(-0.09, Math.PI * 0.37, 0.14);
        character.scale.set(1.4, 0.85, 1.2);
    }

    character.userData.setState(state);
    character.userData.update(dt);
    ancestor.updateMatrixWorld(true);
    return { ancestor, parent, character };
}

function matrixMaxError(actual, expected) {
    return Math.max(...actual.elements.map((value, index) => Math.abs(value - expected.elements[index])));
}

function decompose(matrix) {
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    matrix.decompose(position, quaternion, scale);
    return { position, quaternion, scale };
}

function quaternionAngularError(actual, expected) {
    return 2 * Math.acos(Math.min(1, Math.abs(actual.dot(expected))));
}

function expectedAttackCurve(t) {
    if (t < 0.30) {
        const w = t / 0.30;
        return { x: -2.6 * w, z: -0.4 * w };
    }
    if (t < 0.65) {
        const w = (t - 0.30) / 0.35;
        return { x: -2.6 + 3.6 * w, z: -0.4 + 0.5 * w };
    }
    const w = (t - 0.65) / 0.35;
    return { x: 1.0 * (1 - w), z: 0.1 * (1 - w) };
}

test('PAT-23 declares armR as weapon owner without changing authored shoulder sides', () => {
    const character = createCharacter();
    const { torso, armL, armR, swordPivot } = readParts(character);

    assert.deepEqual(SIDE_CONTRACT, {
        armL: { x: +0.32, ownsWeapon: false },
        armR: { x: -0.32, ownsWeapon: true },
        forwardZ: +1,
        backpackZ: -1,
    });
    assertNear(armL.position.x, SIDE_CONTRACT.armL.x, 'armL project-local X');
    assertNear(armR.position.x, SIDE_CONTRACT.armR.x, 'armR project-local X');
    assert.ok(armL.position.x > torso.position.x, 'armL must remain on physical +X');
    assert.ok(armR.position.x < torso.position.x, 'armR must remain on physical -X');
    assertNear(armL.position.x + armR.position.x, 2 * torso.position.x, 'shoulders must mirror around torso');
    assertNear(armL.position.distanceTo(armR.position), 0.64, 'shoulder separation');
    assert.ok(swordPivot.parent === armR, 'swordPivot must be owned directly by armR, not root or armL');
    assert.ok(!armL.children.includes(swordPivot), 'non-weapon armL must not own swordPivot');
});

test('PAT-23 keeps +Z forward and the backpack entirely on the opposite -Z side', () => {
    const character = createCharacter();
    const { backpack } = readParts(character);
    const bounds = rootLocalBounds(backpack, character);

    assert.equal(SIDE_CONTRACT.forwardZ, +1);
    assert.equal(SIDE_CONTRACT.backpackZ, -1);
    assert.ok(
        bounds.max.z * SIDE_CONTRACT.forwardZ < 0,
        `backpack crossed the rear half-space; root-local maxZ=${bounds.max.z}`,
    );
});

test('PAT-23 preserves a constant full armR-wrist-to-sword bind transform in every state', () => {
    const samples = [
        ['idle', 0.125],
        ['walk', 0.125],
        ['run', 0.125],
        ['attack-windup', 0.15],
        ['attack-active', 0.50],
        ['attack-recovery', 0.85],
    ];
    const expectedRelative = decompose(EXPECTED_WRIST_TO_SWORD_BIND);
    const metrics = {
        ownershipErrors: 0,
        maxWorldMatrixError: 0,
        maxRelativeMatrixError: 0,
        maxPositionError: 0,
        maxQuaternionAngularError: 0,
        maxScaleError: 0,
    };

    for (const [label, dt] of samples) {
        const state = label.startsWith('attack-') ? 'attack' : label;
        for (const transformed of [false, true]) {
            const { character } = poseCharacter(state, dt, { transformed });
            const { armL, armR, swordPivot } = readParts(character);
            character.updateWorldMatrix(true, true);

            if (swordPivot.parent !== armR || armL.children.includes(swordPivot)) {
                metrics.ownershipErrors += 1;
            }

            const expectedWorld = armR.matrixWorld.clone().multiply(EXPECTED_ARMR_TO_SWORD_BIND);
            const wristWorld = expectedWorld;
            const relative = wristWorld.clone().invert().multiply(swordPivot.matrixWorld);
            const actualRelative = decompose(relative);

            metrics.maxWorldMatrixError = Math.max(
                metrics.maxWorldMatrixError,
                matrixMaxError(swordPivot.matrixWorld, expectedWorld),
            );
            metrics.maxRelativeMatrixError = Math.max(
                metrics.maxRelativeMatrixError,
                matrixMaxError(relative, EXPECTED_WRIST_TO_SWORD_BIND),
            );
            metrics.maxPositionError = Math.max(
                metrics.maxPositionError,
                actualRelative.position.distanceTo(expectedRelative.position),
            );
            metrics.maxQuaternionAngularError = Math.max(
                metrics.maxQuaternionAngularError,
                quaternionAngularError(actualRelative.quaternion, expectedRelative.quaternion),
            );
            metrics.maxScaleError = Math.max(
                metrics.maxScaleError,
                actualRelative.scale.distanceTo(expectedRelative.scale),
            );
        }
    }

    const metricSummary = JSON.stringify(metrics);
    assert.equal(metrics.ownershipErrors, 0, `armR ownership failed: ${metricSummary}`);
    assert.ok(metrics.maxWorldMatrixError <= EPSILON, `world matrix drifted: ${metricSummary}`);
    assert.ok(metrics.maxRelativeMatrixError <= EPSILON, `relative matrix drifted: ${metricSummary}`);
    assert.ok(metrics.maxPositionError <= EPSILON, `relative position drifted: ${metricSummary}`);
    assert.ok(metrics.maxQuaternionAngularError <= EPSILON, `relative quaternion drifted: ${metricSummary}`);
    assert.ok(metrics.maxScaleError <= EPSILON, `relative scale drifted: ${metricSummary}`);
});

test('PAT-23 preserves authored physical +X and -X phases for idle, walk, and run', () => {
    const samples = [
        ['idle', 0.37, -Math.sin(0.37 * 0.8) * 0.03, Math.sin(0.37 * 0.8) * 0.03],
        ['walk', 0.19, Math.sin(0.19 * 8) * 0.6 * 0.5, -Math.sin(0.19 * 8) * 0.6 * 0.5],
        ['run', 0.11, Math.sin(0.11 * 12) * 0.9 * 0.8, -Math.sin(0.11 * 12) * 0.9 * 0.8],
    ];

    for (const [state, dt, expectedPositiveX, expectedNegativeX] of samples) {
        const { character } = poseCharacter(state, dt);
        const { armL, armR } = readParts(character);
        assertNear(armL.rotation.x, expectedPositiveX, `${state}: +X armL phase`);
        assertNear(armR.rotation.x, expectedNegativeX, `${state}: -X armR phase`);
    }
});

test('PAT-23 gives only armR the weapon attack curve while armL keeps phase-aligned non-weapon sway', () => {
    for (const phase of [0.15, 0.50, 0.85]) {
        const { character } = poseCharacter('attack', phase, { transformed: true });
        const { armL, armR } = readParts(character);
        const expectedWeapon = expectedAttackCurve(phase);
        const expectedNonWeaponX = -Math.sin(phase * 0.8) * 0.03;

        assertNear(armR.rotation.x, expectedWeapon.x, `attack@${phase}: armR weapon swing X`);
        assertNear(armR.rotation.z, expectedWeapon.z, `attack@${phase}: armR weapon elbow Z`);
        assertNear(armL.rotation.x, expectedNonWeaponX, `attack@${phase}: armL non-weapon idle sway`);
        assertNear(armL.rotation.z, 0, `attack@${phase}: armL must not receive weapon elbow flare`);
    }

    const { character } = poseCharacter('attack', 0.15);
    character.userData.setState('walk');
    assert.equal(character.userData.getState(), 'attack', 'locomotion interrupted the attack state');
    character.userData.update(0.85);
    assert.equal(character.userData.getState(), 'idle', 'attack did not return to idle after recovery');
});

test('PAT-23 preserves equipSword=false while retaining the armR-owned empty attachment', () => {
    const character = createCharacter({ equipSword: false });
    const { armR, sword } = character.userData.parts;
    const swordPivot = character.getObjectByName('swordPivot');

    assert.equal(sword, null, 'equipSword=false must not construct visible sword geometry');
    assert.ok(swordPivot.parent === armR, 'empty swordPivot must retain armR wrist ownership');
    assert.equal(swordPivot.children.length, 0, 'equipSword=false swordPivot must remain empty');
});
